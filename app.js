(function () {
  // --- osapaletit (cached) ---------------------------------------------------
  const partialCache = { header: null, footer: null };

  async function loadPartial(intoEl, url, cacheKey) {
    if (partialCache[cacheKey]) {
      intoEl.innerHTML = partialCache[cacheKey];
      mountPartial(intoEl);
      window.dispatchEvent(new CustomEvent("partial:loaded", { detail: { key: cacheKey } }));
      return;
    }
    const res = await fetch(url, { credentials: "same-origin" });
    const html = await res.text();
    partialCache[cacheKey] = html;
    intoEl.innerHTML = html;
    mountPartial(intoEl);
    window.dispatchEvent(new CustomEvent("partial:loaded", { detail: { key: cacheKey } }));
  }

  function mountPartial(root) {
    // --- Hampurilaisnavigaatio tälle partialille ----------------------------
    // Tuetaan sekä uutta (hamburger + nav-links) että vanhaa (#nav, #nav-toggle) rakennetta
    const nav =
      root.querySelector("#nav-primary") ||
      root.querySelector(".nav-links") ||
      root.querySelector("#nav");
    const burger =
      root.querySelector("#hamburger") ||
      root.querySelector(".hamburger") ||
      root.querySelector("#nav-toggle");

    if (nav && burger) {
      // Käynnistä yleinen hamburger-logiikka (idempotentti)
      if (typeof window.initHamburgerMenu === "function") {
        window.initHamburgerMenu();
      } else {
        // Fallback vanhalle toteutukselle, jos initHamburgerMenu ei ole vielä injektoitu
        const toggle = () => {
          burger.classList.toggle("open");
          // Uusi malli käyttää .nav-links.active, vanha malli #nav.open
          if (nav.classList.contains("nav-links")) {
            nav.classList.toggle("active");
          } else {
            nav.classList.toggle("open");
          }
        };
        if (!burger.dataset._bound) {
          burger.addEventListener("click", toggle);
          burger.dataset._bound = "1";
        }
      }
    }

    // --- PJAX vain samaan alkuperään, html-sivuihin --------------------------
    root.querySelectorAll("a[href]").forEach((a) => {
      if (shouldIntercept(a)) {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          navigate(a.getAttribute("href"));
        });
      }
    });
  }

  function shouldIntercept(a) {
    if (!a) return false;

    // Opt-outit
    if (a.hasAttribute('download') || a.dataset.noPjax === '1' || a.closest('[data-pjax="false"]')) return false;

    const raw = (a.getAttribute('href') || '').trim();
    if (!raw || raw.startsWith('#') || a.target === '_blank') return false;

    // Protokollat joita ei koskaan PJAXata
    if (/^(mailto:|tel:|sms:|javascript:)/i.test(raw)) return false;

    let url;
    try { url = new URL(raw, location.href); } catch { return false; }

    // Vain sama origin
    if (url.origin !== location.origin) return false;

    // Estä binäärit/tiedostohaut; salli .html/.htm ja päätteen puuttuminen (hakemistopolut)
    const m = url.pathname.match(/\.([a-z0-9]+)$/i);
    const ext = m ? m[1].toLowerCase() : '';
    if (ext && ext !== 'html' && ext !== 'htm') return false;

    return true;
  }



  // --- PJAX navigointi --------------------------------------------------------
  async function navigate(href, replace = false) {
    const url = new URL(href, location.href);
    const res = await fetch(url, { credentials: "same-origin" });
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, "text/html");

    const newMain = doc.querySelector("main");
    const newTitle = doc.querySelector("title");
    if (newMain) {
      const currentMain = document.querySelector("main");
      currentMain.replaceWith(newMain);

      // Varmista että lähdetään AINA ylhäältä ilman välähdystä, jos ei #ankkuria
      const hash = url.hash?.replace(/^#/, "") || "";
      if (!hash) {
        startAtTopUntilSettled(newMain); // ← UUSI KUTSU
      }

      // (valinnainen mutta suositeltu) – jos käytössäsi, anna myös mountPartialille mahdollisuus
      try { mountPartial(newMain); } catch { }

      executeScripts(newMain, url);
      setActiveNav(url.pathname);

      if (hash) {
        requestAnimationFrame(() => { scrollToHash(hash, { behavior: "smooth" }); });
      }

      // Hash-synkka + ankkurirullaus (jo entuudestaan koodissasi)
      initSectionHashSync();
      initInPageAnchorScrolling();
    }
    if (newTitle) document.title = newTitle.textContent;
    if (replace) history.replaceState({ href: url.href }, "", url.href);
    else history.pushState({ href: url.href }, "", url.href);

    window.dispatchEvent(new CustomEvent("pjax:navigated", { detail: { href: url.href } }));
  }



  // Viedään käytettäväksi tarvittaessa muissa skripteissä
  window.navigate = navigate;

  // paluu-nappi
  window.addEventListener("popstate", () => navigate(location.href, true));

  // --- skriptien suoritus vaihdetusta <main>:ista ----------------------------
  function executeScripts(scope, baseUrl) {
    const scripts = scope.querySelectorAll("script");
    scripts.forEach((old) => {
      const s = document.createElement("script");
      [...old.attributes].forEach((a) => s.setAttribute(a.name, a.value));
      if (old.src) {
        s.src = new URL(old.getAttribute("src"), baseUrl).href;
      } else {
        s.textContent = old.textContent;
      }
      old.replaceWith(s);
    });
  }

  // --- utilit ----------------------------------------------------------------
  function setActiveNav(pathname) {
    const file = pathname.split("/").pop();
    document.querySelectorAll("#nav a, #nav-primary a, .nav-links a").forEach((a) => {
      const h = a.getAttribute("href") || "";
      if (h.endsWith(file)) a.classList.add("active");
      else a.classList.remove("active");
    });
  }

  function initCarouselAndYear() {
    const y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
  }

  // GLOBAALI karuselli (ei jää odottamaan laiskoja kuvia)
  window.initBannerCarousel = async function initBannerCarousel() {
    const viewport = document.getElementById('carousel');
    if (!viewport) return;

    if (viewport.dataset._carouselInit === '1') return;
    viewport.dataset._carouselInit = '1';

    if (viewport._timer) { clearInterval(viewport._timer); viewport._timer = null; }

    // Päätä assets-peruspolku: yritä juurta, muuten suhteellinen
    async function pickBase() {
      const tryHead = async (p) => {
        try { const r = await fetch(p + 'banner_1.avif', { method: 'HEAD', credentials: 'same-origin' }); return r.ok; }
        catch { return false; }
      };
      if (await tryHead('/assets/')) return '/assets/';
      return './assets/';
    }
    const ASSETS = await pickBase();

    // 1) Kerää bannerit
    let files = [];
    try {
      const res = await fetch(ASSETS, { credentials: 'same-origin' });
      const html = await res.text();
      const rx = /\bbanner_?(\d+)\.(avif)\b/gi;
      for (const m of html.matchAll(rx)) files.push({ file: m[0], n: parseInt(m[1], 10) });
    } catch { /* ei listaa -> fallback */ }

    if (!files.length) {
      const exts = ['avif'];
      const probe = (src) => new Promise(res => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = src; });
      for (let i = 1; i <= 4; i++) {
        let pick = null;
        for (const ext of exts) {
          // eslint-disable-next-line no-await-in-loop
          if (await probe(`${ASSETS}banner_${i}.${ext}`)) { pick = `banner_${i}.${ext}`; break; }
          // eslint-disable-next-line no-await-in-loop
          if (await probe(`${ASSETS}banner${i}.${ext}`)) { pick = `banner${i}.${ext}`; break; }
        }
        if (pick) files.push({ file: pick, n: i });
      }
    }
    if (!files.length) return;

    // 2) Deduplikoi (prioriteetti: webp > jpg > png > svg)
    const pref = ['webp', 'jpg', 'jpeg', 'png', 'svg', 'avif'];
    const byN = new Map();
    for (const f of files) {
      const ext = f.file.split('.').pop().toLowerCase();
      const cur = byN.get(f.n);
      if (!cur) byN.set(f.n, { file: f.file, n: f.n, ext });
      else if (pref.indexOf(ext) < pref.indexOf(cur.ext)) byN.set(f.n, { file: f.file, n: f.n, ext });
    }
    files = Array.from(byN.values()).sort((a, b) => a.n - b.n);

    // 3) Rakenna DOM
    viewport.innerHTML = '';
    const track = document.createElement('div');
    track.className = 'track';
    track.style.display = 'flex';
    track.style.transition = 'transform 0.6s ease';
    track.style.willChange = 'transform';
    viewport.style.overflow = 'hidden';
    viewport.appendChild(track);

    files.forEach(({ file }, idx) => {
      const a = document.createElement('a');
      a.className = 'slide';
      a.href = '#';
      a.style.flex = '0 0 100%';

      const img = document.createElement('img');
      img.src = `${ASSETS}${file}`;
      img.alt = `Banneri ${file}`;
      img.decoding = 'async';
      // TÄRKEÄ: ei laiskaa latausta karusellissa
      img.loading = 'eager';
      img.style.width = '100%';
      img.style.display = 'block';

      // Pieni prefetch varalta
      if (idx === 0) img.fetchPriority = 'high';

      a.appendChild(img);
      track.appendChild(a);
    });

    // 4) Odota vain ensimmäinen kuva valmiiksi -> starttaa heti
    const firstImg = track.querySelector('img');
    if (firstImg && !firstImg.complete) {
      await new Promise(r => { firstImg.onload = firstImg.onerror = r; });
    }

    // 5) Vaihtologiikka
    let index = 0;
    const total = files.length;
    const DURATION_MS = 5000;

    const show = (i) => {
      index = (i + total) % total;
      track.style.transform = `translateX(${-index * 100}%)`;
    };

    show(0);

    if (total >= 2) {
      viewport._timer = setInterval(() => show(index + 1), DURATION_MS);
    }

    // pysäytä/piirrä uudelleen näkyvyyden mukaan
    const onVisibility = () => {
      if (document.hidden && viewport._timer) { clearInterval(viewport._timer); viewport._timer = null; }
      else if (!document.hidden && total >= 2 && !viewport._timer) {
        viewport._timer = setInterval(() => show(index + 1), DURATION_MS);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    window.addEventListener('pjax:navigated', () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (viewport._timer) { clearInterval(viewport._timer); viewport._timer = null; }
      delete viewport.dataset._carouselInit;
    }, { once: true });
  };

  // --- #hash <-> section synkka ----------------------------------------------
  // Päivitykset:
  //  - ei näytetä #hero koskaan (yläosa = tyhjä hash)
  //  - slug haetaan data-section/data-hash, sitten sopiva luokka, sitten id
  //  - URL.hash päivittyy näkyvimmän osion mukaan
  let sectionObserver = null;
  let lastHash = null;

  // Poissuljetaan vain layout-yleisluokkia; ei sisältöosia
  const EXCLUDE_CLASSES = new Set(["container", "row", "col", "grid"]);
  // Osiot joiden hashia ei haluta näyttää
  const NO_HASH_SECTIONS = new Set(["hero"]);

  function getSectionSlug(section) {
    const explicit = section.getAttribute("data-section") || section.getAttribute("data-hash");
    if (explicit) return sanitizeSlug(explicit);

    for (const cls of section.classList) {
      if (/^[a-z0-9\-]+$/i.test(cls) && !EXCLUDE_CLASSES.has(cls.toLowerCase())) {
        return sanitizeSlug(cls);
      }
    }
    if (section.id) return sanitizeSlug(section.id);
    return null;
  }

  function sanitizeSlug(s) {
    return (s || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "-")
      .replace(/\-+/g, "-")
      .replace(/^\-|\-$/g, "");
  }

  function headerOffsetPx() {
    const header = document.querySelector(".site-header") || document.getElementById("site-header");
    const rect = header ? header.getBoundingClientRect() : null;
    const h = rect ? rect.height : 0;
    return Math.max(0, Math.round(h));
  }

  function smoothScrollTo(el, opts = {}) {
    if (!el) return;

    const html = document.documentElement;
    const scrollEl = document.scrollingElement || document.documentElement;
    const headerPx = headerOffsetPx();
    const yNow = scrollEl.scrollTop || window.scrollY || 0;

    // Merkitse ohjelmalliseksi ja jäädytä hash-päivitykset
    if (typeof window.__suppressHash === 'function') window.__suppressHash(1000);
    html.classList.add('scrolling-by-script');

    const rawTarget = yNow + el.getBoundingClientRect().top - headerPx - 8;
    const max = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
    const target = Math.min(Math.max(0, Math.round(rawTarget)), max);

    window.scrollTo({ top: target, behavior: opts.behavior || "smooth" });

    // Poista lippu varmuusviiveellä
    setTimeout(() => html.classList.remove('scrolling-by-script'), 900);
  }


  function findSectionByHash(hash) {
    const slug = sanitizeSlug(hash);
    if (!slug) return null;
    const byId = document.getElementById(slug);
    if (byId) return byId;
    const byClass = document.querySelector(`main section.${CSS.escape(slug)}`);
    if (byClass) return byClass;
    const byData = document.querySelector(`main [data-section="${slug}"], main [data-hash="${slug}"]`);
    if (byData) return byData;
    return null;
  }

  function updateHash(slugOrNull) {
    // Jos null/tyhjä tai kuuluu NO_HASH_SECTIONS -> tyhjennä hash
    let finalSlug = slugOrNull ? sanitizeSlug(slugOrNull) : "";
    if (finalSlug && NO_HASH_SECTIONS.has(finalSlug)) finalSlug = "";

    if ((finalSlug || "") === (lastHash || "")) return;

    const url = new URL(location.href);
    url.hash = finalSlug || "";
    lastHash = finalSlug || null;
    history.replaceState(history.state || { href: url.href }, "", url.href);
  }
  // --- hash-suppressio ohjelmallisen rullauksen ajaksi -------------------------
  let __hashSuppressed = false;
  let __hashTimer = 0;
  function __suppressHash(ms = 900) {
    __hashSuppressed = true;
    if (__hashTimer) clearTimeout(__hashTimer);
    __hashTimer = setTimeout(() => { __hashSuppressed = false; }, ms);
  }
  // Tarjolle myös muille IIFElle (esim. back-to-top)
  window.__suppressHash = __suppressHash;

  let sectionTopLineDetach = null;
  function initSectionHashSync() {
    if (sectionObserver) { sectionObserver.disconnect(); sectionObserver = null; }
    if (typeof sectionTopLineDetach === "function") { sectionTopLineDetach(); sectionTopLineDetach = null; }

    const sections = Array.from(document.querySelectorAll("main section"));
    if (!sections.length) return;

    const withSlug = sections
      .map((s) => ({ el: s, slug: getSectionSlug(s) }))
      .filter((x) => !!x.slug);

    if (!withSlug.length) return;

    lastHash = location.hash.replace(/^#/, "") || null;

    const topLineY = () => Math.round(headerOffsetPx()) + 1;

    let raf = 0;
    const recompute = () => {
      raf = 0;

      // Älä muuta hashia, jos suppressio päällä (ohjelmallinen rullaus kesken)
      if (__hashSuppressed) return;

      // Pieni hysteresis
      const y = topLineY() + 4;

      let current = null;
      for (const { el, slug } of withSlug) {
        const r = el.getBoundingClientRect();
        if (r.top <= y && r.bottom > y) {
          if (!NO_HASH_SECTIONS.has(slug)) current = slug;
          break;
        }
      }

      if (current) updateHash(current);
      else updateHash("");
    };

    const onScroll = () => { if (!raf) raf = requestAnimationFrame(recompute); };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    sectionTopLineDetach = () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };

    requestAnimationFrame(() => { onScroll(); });
  }

  function scrollToHash(hash, opts = {}) {
    const target = findSectionByHash(hash);
    if (!target) return;

    // Aseta kohdehash heti – UI ei näytä edellistä
    updateHash(hash);

    // Jäädytä hash päivityksiltä rullauksen ajaksi
    if (typeof window.__suppressHash === 'function') window.__suppressHash(1000);

    smoothScrollTo(target, opts);
  }


  // Delegoitu pehmeä rullaus ankkureille koko dokumentissa
  function initInPageAnchorScrolling() {
    document.removeEventListener("click", onDocumentClickForAnchors);
    document.addEventListener("click", onDocumentClickForAnchors);
  }

  function onDocumentClickForAnchors(e) {
    const a = e.target.closest('a[href*="#"]');
    if (!a) return;
    if (a.target === "_blank") return;

    let url;
    try { url = new URL(a.getAttribute("href") || "", location.href); } catch { return; }

    const hash = (url.hash || "").replace(/^#/, "");
    if (!hash) return;

    if (url.origin === location.origin && url.pathname === location.pathname) {
      e.preventDefault();
      if (typeof window.__suppressHash === 'function') window.__suppressHash(1000);
      scrollToHash(hash, { behavior: "smooth" });
    }
  }


  function startAtTopUntilSettled(newMain, opts = {}) {
    const html = document.documentElement;
    const scrollEl = document.scrollingElement || html;
    const hardMs = Math.max(300, Math.min(2000, opts.hardMs || 900));
    const softMs = Math.max(150, Math.min(1500, opts.softMs || 500));
    let done = false;

    // Jäädytä hash koko “lukituksen” ajaksi
    if (typeof window.__suppressHash === 'function') window.__suppressHash(hardMs + softMs + 100);

    const prevScrollBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    html.classList.add('scrolling-by-script');

    const toTop = () => { scrollEl.scrollTop = 0; window.scrollTo(0, 0); };

    toTop();
    requestAnimationFrame(() => { toTop(); requestAnimationFrame(toTop); });

    const hardEnd = performance.now() + hardMs;
    function onScroll() {
      if (done) return;
      if (performance.now() < hardEnd) { toTop(); }
    }
    window.addEventListener('scroll', onScroll, true);

    const imgs = newMain ? Array.from(newMain.querySelectorAll('img')).filter(i => !i.complete) : [];
    let pending = imgs.length;
    function onImgDone() {
      if (done) return;
      toTop();
      pending = Math.max(0, pending - 1);
      if (pending === 0) settleSoon();
    }
    imgs.forEach(img => {
      img.addEventListener('load', onImgDone, { once: true });
      img.addEventListener('error', onImgDone, { once: true });
    });

    function settleSoon() {
      if (done) return;
      done = true;
      setTimeout(() => {
        window.removeEventListener('scroll', onScroll, true);
        html.style.scrollBehavior = prevScrollBehavior || '';
        html.classList.remove('scrolling-by-script');
      }, softMs);
    }

    if (!imgs.length) setTimeout(settleSoon, softMs);
    setTimeout(settleSoon, hardMs + softMs);
  }


  // --- bootstrap: yksi selkeä onDomReady ------------------------------------
  async function onDomReady() {
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch { }

    const headerEl = document.getElementById("site-header");
    const footerEl = document.getElementById("site-footer");
    if (headerEl) await loadPartial(headerEl, headerEl.dataset.partial || "/partials/header.html", "header");
    if (footerEl) await loadPartial(footerEl, footerEl.dataset.partial || "/partials/footer.html", "footer");

    // Käynnistä hamburger myös alkuperäiseen DOMiin
    if (typeof window.initHamburgerMenu === "function") window.initHamburgerMenu();

    setActiveNav(location.pathname);
    initCarouselAndYear();

    // Karuselli: käytä GLOBAALIA funktiota
    if (typeof window.initBannerCarousel === 'function') {
      await window.initBannerCarousel();
    }

    initSectionHashSync();
    initInPageAnchorScrolling();
    bindGlobalPjax && bindGlobalPjax();
    const initialHash = location.hash.replace(/^#/, "");
    if (initialHash) {
      requestAnimationFrame(() => scrollToHash(initialHash, { behavior: "smooth" }));
    }
  }
  function bindGlobalPjax() {
    const root = document.documentElement;
    if (root.dataset._pjaxBound === '1') return; // idempotentti
    root.dataset._pjaxBound = '1';

    // Capture-vaiheessa, jotta ehdimme ennen muita handlereita
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented) return;

      // Vain vasemman napin klikki ilman modifikaattoreita
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const a = e.target.closest('a[href]');
      if (!a) return;

      if (!shouldIntercept(a)) return;

      e.preventDefault();
      const href = a.getAttribute('href');
      navigate(href);
    }, true);
  };


  document.addEventListener("DOMContentLoaded", onDomReady);

  // aseta alkutila historiaan (syvälinkitykset)
  if (!history.state) history.replaceState({ href: location.href }, "", location.href);

  // pikkuteksti synkattuna data-attribuuttiin (olemassa oleva toiminnallisuus)
  const sync = el => el.setAttribute('data-text', el.textContent);
  document.querySelectorAll('h1,h2').forEach(el => {
    sync(el);
    new MutationObserver(() => sync(el))
      .observe(el, { childList: true, characterData: true, subtree: true });
  });

  // Kun header on ladattu partialina, varmista että hamburger alustetaan
  window.addEventListener("partial:loaded", (e) => {
    if (e.detail?.key === "header" && typeof window.initHamburgerMenu === "function") {
      window.initHamburgerMenu();
    }
  });
})();

// --- taustakuvan scroll-synkka (event-pohjainen) ----------------------------
// --- taustakuvan scroll-synkka (event-pohjainen) ----------------------------
(function initBackgroundScrollSync() {
  const root = document.documentElement;
  const el = document.scrollingElement || root;
  let raf = 0;

  function setBgFromScroll() {
    const max = Math.max(1, el.scrollHeight - el.clientHeight);
    const y = el.scrollTop || 0;
    const progress = Math.min(1, Math.max(0, y / max));
    root.style.setProperty("--bg-pos", (progress * 100).toFixed(3) + "%");
  }

  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; setBgFromScroll(); });
  }

  setBgFromScroll();
  window.addEventListener("load", onScroll);
  window.addEventListener("resize", onScroll);
  window.addEventListener("scroll", onScroll, { passive: true });

  window.addEventListener("pjax:navigated", () => {
    // Kun <main> vaihtuu, yritä alustaa karuselli uudelleen
    setTimeout(() => {
      if (typeof window.initBannerCarousel === "function") window.initBannerCarousel();
    }, 0);
  });
})();


// --- header: piilota alas rullatessa, näytä ylös rullatessa -----------------
(function initHideOnScrollHeader() {
  const el = document.scrollingElement || document.documentElement;
  const html = document.documentElement;
  let header = null;
  let lastY = el.scrollTop || 0;
  let raf = 0;
  let started = false;

  function ensureHeader() {
    if (!header) header = document.querySelector(".site-header");
    if (header && !started) {
      started = true;
      update();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
    }
  }

  function update() {
    const y = el.scrollTop || 0;
    if (header) {
      // Ohjelmallinen rullaus: header aina näkyvissä
      if (html.classList.contains('scrolling-by-script')) {
        header.classList.remove("site-header--hidden");
      } else {
        // Käyttäjän rullaus määrittää näkyvyyden
        if (y <= 0) header.classList.remove("site-header--hidden");
        else if (y > lastY) header.classList.add("site-header--hidden");
        else header.classList.remove("site-header--hidden");
      }
    }
    lastY = y;
    raf = 0;
  }

  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(update);
  }

  ensureHeader();
  window.addEventListener("partial:loaded", (e) => {
    if (e.detail?.key === "header") {
      header = null;
      started = false;
      ensureHeader();
    }
  });
  window.addEventListener("pjax:navigated", () => {
    lastY = el.scrollTop || 0;
    header = null;
    started = false;
    ensureHeader();
    requestAnimationFrame(update);
  });
})();



// ====== Tyylikäs hampurilaisvalikko (idempotentti) ==========================
(function () {
  function initHamburgerMenu() {
    const mqMobile = window.matchMedia('(max-width:1226px)');
    const html = document.documentElement;

    const burger =
      document.getElementById('hamburger') ||
      document.querySelector('.hamburger') ||
      document.getElementById('nav-toggle'); // legacy tuki

    const nav =
      document.getElementById('nav-primary') ||
      document.querySelector('.nav-links') ||
      document.getElementById('nav'); // legacy tuki

    if (!burger || !nav) return;

    // Vältä kaksoisinit
    if (burger.dataset._hamburgerInit === '1') return;
    burger.dataset._hamburgerInit = '1';

    // Luo overlay, jos puuttuu
    let overlay = document.getElementById('nav-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'nav-overlay';
      overlay.hidden = true;
      document.body.prepend(overlay);
    }

    const openClassBtn = 'open';
    const openClassNav = nav.classList.contains('nav-links') ? 'active' : 'open'; // legacy: #nav.open

    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])'
    ].join(',');

    const isOpen = () =>
      burger.classList.contains(openClassBtn) && nav.classList.contains(openClassNav);

    function lockScroll(lock) {
      html.classList.toggle('no-scroll', !!lock);
    }

    function trapFocus(e) {
      if (!isOpen()) return;
      const nodes = nav.querySelectorAll(focusableSelector);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    }

    function openMenu() {
      burger.classList.add(openClassBtn);
      nav.classList.add(openClassNav);
      overlay.classList.add('active');
      overlay.hidden = false;
      burger.setAttribute('aria-expanded', 'true');
      lockScroll(true);
      setTimeout(() => {
        const firstLink = nav.querySelector('a, button');
        if (firstLink) firstLink.focus();
      }, 10);
    }

    function closeMenu() {
      burger.classList.remove(openClassBtn);
      nav.classList.remove(openClassNav);
      overlay.classList.remove('active');
      burger.setAttribute('aria-expanded', 'false');
      lockScroll(false);
      setTimeout(() => { if (!isOpen()) overlay.hidden = true; }, 180);
      burger.focus({ preventScroll: true });
    }

    const toggleMenu = () => (isOpen() ? closeMenu() : openMenu());

    // Tapahtumat
    burger.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', closeMenu);

    nav.addEventListener('click', (e) => {
      const t = e.target.closest('a, button');
      if (!t) return;
      if (mqMobile.matches) closeMenu();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) {
        e.preventDefault(); closeMenu();
      } else if (mqMobile.matches) {
        trapFocus(e);
      }
    });

    const onResize = () => { if (!mqMobile.matches) closeMenu(); };
    window.addEventListener('resize', onResize);
  }

  // Vie globaaliin käyttöön ja aja heti
  window.initHamburgerMenu = initHamburgerMenu;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHamburgerMenu);
  } else {
    initHamburgerMenu();
  }

  // Kun header-partial latautuu myöhemmin, alustetaan uudelleen
  window.addEventListener('partial:loaded', (e) => {
    if (e.detail?.key === 'header') initHamburgerMenu();
  });
})();
(function lockBgScaleFallback() {
  var supportsLVH = CSS && CSS.supports && CSS.supports('height', '100lvh');
  if (supportsLVH) return; // modernit selaimet käyttävät yllä olevaa CSS:ää

  function apply() {
    var h = window.innerHeight;               // initial (tai orientaation vaihtuessa)
    document.documentElement.style.setProperty('--bgH-locked', h + 'px');
  }
  apply();
  // Päivitä vain orientaation vaihtuessa (ei scroll-resize looppeja)
  window.addEventListener('orientationchange', function () {
    // pieni viive, että selain ehti kalibroida mitat
    setTimeout(apply, 250);
  }, { passive: true });
})();

/* Aukiolo-widget (Europe/Helsinki)
   Julkinen API: window.initOpeningHours(selectorOrElement, customSchedule?)
   Lisäksi autokäynnistyy, jos #aukiolo-widget löytyy DOM:ista.
*/
(function () {
  const TZ = 'Europe/Helsinki';
  const MIN_PER_DAY = 24 * 60;
  const MIN_PER_WEEK = 7 * MIN_PER_DAY;
  const WEEKDAYS_FI = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];

  // Ma–Pe 10–20, La 10–18, Su 12–18
  const DEFAULT_SCHEDULE = [
    { open: 10 * 60, close: 20 * 60 }, // Ma
    { open: 10 * 60, close: 20 * 60 }, // Ti
    { open: 10 * 60, close: 20 * 60 }, // Ke
    { open: 10 * 60, close: 20 * 60 }, // To
    { open: 10 * 60, close: 20 * 60 }, // Pe
    { open: 10 * 60, close: 18 * 60 }, // La
    { open: 12 * 60, close: 18 * 60 }  // Su
  ];

  function pad2(n) { return String(n).padStart(2, '0'); }
  function hmStr(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${pad2(h)}.${pad2(m)}`;
  }
  function getHkiNowParts() {
    const fmt = new Intl.DateTimeFormat('fi-FI', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false
    });
    const parts = fmt.formatToParts(new Date());
    const get = (t) => parts.find(p => p.type === t)?.value;
    const wdShort = (get('weekday') || '').slice(0, 2).toLowerCase();
    const map = { ma: 0, ti: 1, ke: 2, to: 3, pe: 4, la: 5, su: 6 };
    return {
      weekdayIndex: map[wdShort],
      hour: Number(get('hour')),
      minute: Number(get('minute')),
    };
  }
  function findNextOpen(nowDayIndex, nowMinutes, schedule) {
    for (let offset = 0; offset < 7; offset++) {
      const d = (nowDayIndex + offset) % 7;
      const e = schedule[d];
      if (!e || e.open == null || e.close == null) continue;
      if (offset === 0) {
        if (nowMinutes < e.open) return { dayIndex: d, minutes: e.open };
      } else {
        return { dayIndex: d, minutes: e.open };
      }
    }
    return null;
  }
  function minutesUntil(nowDayIndex, nowMinutes, targetDayIndex, targetMinutes) {
    const nowAbs = nowDayIndex * MIN_PER_DAY + nowMinutes;
    const targetAbs = targetDayIndex * MIN_PER_DAY + targetMinutes;
    const diff = (targetAbs - nowAbs + MIN_PER_WEEK) % MIN_PER_WEEK;
    return diff === 0 ? MIN_PER_WEEK : diff;
  }
  function formatDuration(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h} h ${m} min`;
    if (h) return `${h} h`;
    return `${m} min`;
  }
  function renderScheduleLines(schedule) {
    const sameWeekdays =
      schedule.slice(0, 5).every(e => e.open === schedule[0].open && e.close === schedule[0].close);
    const lines = [];
    if (sameWeekdays) {
      const e = schedule[0];
      lines.push(`Ma–Pe: ${hmStr(e.open)}–${hmStr(e.close)}`);
    } else {
      for (let i = 0; i < 5; i++) {
        const e = schedule[i];
        lines.push(`${WEEKDAYS_FI[i]}: ${e?.open != null ? `${hmStr(e.open)}–${hmStr(e.close)}` : 'suljettu'}`);
      }
    }
    const sat = schedule[5], sun = schedule[6];
    lines.push(`La: ${sat?.open != null ? `${hmStr(sat.open)}–${hmStr(sat.close)}` : 'suljettu'}`);
    lines.push(`Su: ${sun?.open != null ? `${hmStr(sun.open)}–${hmStr(sun.close)}` : 'suljettu'}`);
    return lines.join('\n');
  }
  function buildWidgetHTML(status, subline) {
    return `
      <div class="aukiolo-card">
        <h2>Aukiolo: ${status}</h2>
        <h3>${subline}</h3>
      </div>
    `;
  }
  function computeAndRender(el, schedule) {
    const { weekdayIndex: d, hour: h, minute: m } = getHkiNowParts();
    const nowMinutes = h * 60 + m;
    const today = schedule[d];
    const fullLines = renderScheduleLines(schedule);
    const todayLine = today?.open != null ? `${hmStr(today.open)}–${hmStr(today.close)}` : 'suljettu';

    let status = 'Suljettu';
    let subline = 'Ei aukioloaikoja.';
    if (today && today.open != null && nowMinutes >= today.open && nowMinutes < today.close) {
      const remaining = today.close - nowMinutes;
      status = 'Avoinna';
      subline = `Sulkeutuu ${formatDuration(remaining)} kuluttua, klo ${hmStr(today.close)}.`;
    } else {
      const next = (today && today.open != null && nowMinutes < today.open)
        ? { dayIndex: d, minutes: today.open }
        : findNextOpen(d, nowMinutes, schedule);
      if (next) {
        const minsUntil = minutesUntil(d, nowMinutes, next.dayIndex, next.minutes);
        const dayText = next.dayIndex === d ? 'tänään' : ((next.dayIndex === (d + 1) % 7) ? 'huomenna' : WEEKDAYS_FI[next.dayIndex]);
        subline = `Aukeaa ${dayText} klo ${hmStr(next.minutes)} (${formatDuration(minsUntil)}).`;
      }
    }
    el.innerHTML = buildWidgetHTML(status, subline, todayLine, fullLines);
  }

  function initOpeningHours(selectorOrElement, customSchedule) {
    const el = typeof selectorOrElement === 'string'
      ? document.querySelector(selectorOrElement)
      : selectorOrElement;
    if (!el) return;

    const schedule = (customSchedule && customSchedule.length === 7)
      ? customSchedule
      : DEFAULT_SCHEDULE;

    computeAndRender(el, schedule);
    const id = setInterval(() => computeAndRender(el, schedule), 60 * 1000);
    return { destroy: () => clearInterval(id), updateSchedule: (s) => computeAndRender(el, s || schedule) };
  }

  // Julkinen funktio
  if (!('initOpeningHours' in window)) {
    window.initOpeningHours = initOpeningHours;
  }

  // Autokäynnistys: ei vaadi inline-kutsua
  document.addEventListener('DOMContentLoaded', function () {
    const el = document.querySelector('#aukiolo-widget');
    if (el) {
      // Käynnistä vain kerran (merkki attribuutilla)
      if (!el.__aukioloStarted) {
        el.__aukioloStarted = true;
        window.initOpeningHours(el);
      }
    }
  });
})();

(function enableHamburgerOutsideClose() {
  function bind() {
    const root = document.documentElement;
    if (root.dataset._hamburgerOutsideBound === '1') return; // idempotentti
    root.dataset._hamburgerOutsideBound = '1';

    const mqMobile = window.matchMedia('(max-width:1226px)');

    function getEls() {
      const burger =
        document.getElementById('hamburger') ||
        document.querySelector('.hamburger') ||
        document.getElementById('nav-toggle'); // legacy

      const nav =
        document.getElementById('nav-primary') ||
        document.querySelector('.nav-links') ||
        document.getElementById('nav'); // legacy

      return { burger, nav };
    }

    function isOpen(burger, nav) {
      if (!burger || !nav) return false;
      const openClassNav = nav.classList.contains('nav-links') ? 'active' : 'open';
      return burger.classList.contains('open') && nav.classList.contains(openClassNav);
    }

    // Yksi handler, joka hakee elementit aina ajantasaisesti (turvallinen PJAX/partialien kanssa)
    function onDocPointer(e) {
      if (!mqMobile.matches) return;

      const { burger, nav } = getEls();
      if (!burger || !nav || !isOpen(burger, nav)) return;

      const t = e.target;
      // Jos klikkaus oli navin tai burgerin sisällä, ei tehdä mitään
      if (nav.contains(t) || burger.contains(t)) return;

      // Sulje valikko käyttäen olemassa olevaa toggle-logiikkaa
      // (burger.click() käyttää jo vastuualueellaan oikeita luokkia/overlaytä/focus-hallintaa)
      try { burger.click(); } catch (_) { /* ei väliä */ }
    }

    // Pointerdown tuntuu välittömältä, "click" reservinä
    document.addEventListener('pointerdown', onDocPointer, true);
    document.addEventListener('click', onDocPointer, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  // Jos header partial ladataan myöhemmin, ei tarvita uudelleensidontaa,
  // koska handler hakee elementit aina lennossa. Silti pidetään koukku tulevaa laajennusta varten.
  window.addEventListener('partial:loaded', function () { /* no-op by design */ });
  window.addEventListener('pjax:navigated', function () { /* no-op by design */ });
})();

(function initBackToTopButton() {
  const SCROLL_TRIGGER_PX = 300;

  function createButton() {
    let btn = document.getElementById('back-to-top-btn');
    if (btn) return btn; // jo olemassa

    btn = document.createElement('button');
    btn.id = 'back-to-top-btn';
    btn.setAttribute('aria-label', 'Takaisin ylös');
    btn.innerHTML = '↑';


    btn.addEventListener('click', () => {
      const html = document.documentElement;
      if (typeof window.__suppressHash === 'function') window.__suppressHash(900);
      html.classList.add('scrolling-by-script');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => html.classList.remove('scrolling-by-script'), 900);
    });



    document.body.appendChild(btn);
    return btn;
  }

  function init() {
    const btn = createButton();
    const scrollEl = document.scrollingElement || document.documentElement;

    function toggleVisibility() {
      if (scrollEl.scrollTop > SCROLL_TRIGGER_PX) {
        btn.style.visibility = 'visible';
        btn.style.opacity = '1';
      } else {
        btn.style.opacity = '0';
        btn.style.visibility = 'hidden';
      }
    }

    window.addEventListener('scroll', toggleVisibility, { passive: true });
    window.addEventListener('resize', toggleVisibility);
    toggleVisibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Uudelleenajastus PJAX-navigoinnin jälkeen
  window.addEventListener('pjax:navigated', () => {
    init();
  });
})();

/* Klikattava kuvan suurennus (lightbox) about-osiolle – CSS/JS eroteltu */
(function initAboutMediaLightbox() {
  const root = document.documentElement;
  if (root.dataset._aboutLightboxInit === '1') return;
  root.dataset._aboutLightboxInit = '1';

  // -------- helpers ----------
  function lockScroll(lock) {
    document.documentElement.classList.toggle('no-scroll', !!lock);
  }
  function ensureOverlay() {
    let overlay = document.getElementById('about-media-lightbox');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'about-media-lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Kuvan esikatselu');

    const figure = document.createElement('figure');
    figure.className = 'about-lightbox__figure';

    const img = document.createElement('img');
    img.id = 'about-media-lightbox-img';
    img.className = 'about-lightbox__img';
    img.alt = '';

    const closeBtn = document.createElement('button');
    closeBtn.id = 'about-media-lightbox-close';
    closeBtn.className = 'about-lightbox__close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Sulje kuva');
    closeBtn.innerHTML = '✕';

    figure.appendChild(img);
    figure.appendChild(closeBtn);
    overlay.appendChild(figure);
    document.body.appendChild(overlay);
    return overlay;
  }

  let lastFocus = null;

  async function openLightbox(src, alt) {
    const overlay = ensureOverlay();
    const img = overlay.querySelector('#about-media-lightbox-img');

    // Preloadaa ja decode ennen näyttöä -> ei vilkkuvaa alt-tekstiä
    const probe = new Image();
    probe.src = src;
    try {
      if (probe.decode) { await probe.decode(); }
      else {
        await new Promise(r => { probe.onload = r; probe.onerror = r; });
      }
    } catch { /* jatketaan silti */ }

    img.src = src;
    img.alt = alt || '';

    overlay.classList.add('is-open');
    lockScroll(true);

    lastFocus = document.activeElement;
    const closeEl = overlay.querySelector('#about-media-lightbox-close');
    if (closeEl) {
      try { closeEl.focus({ preventScroll: true }); } catch { }
    }
  }

  function closeLightbox() {
    const overlay = document.getElementById('about-media-lightbox');
    if (!overlay || !overlay.classList.contains('is-open')) return;

    overlay.classList.remove('is-open');
    lockScroll(false);

    if (lastFocus && document.contains(lastFocus)) {
      try { lastFocus.focus({ preventScroll: true }); } catch { }
    }
  }

  // Delegoitu klikkaus – toimii myös PJAXin jälkeen
  function onDocClick(e) {
    const img = e.target.closest('.about.container.section.section--inner.has-media .about-media img');
    if (img) {
      e.preventDefault();
      const full = img.getAttribute('data-fullsrc') || img.currentSrc || img.src;
      const alt = img.getAttribute('alt') || 'Maskun Kauppakeskuksen sisätilaa – suurennettu kuva.';
      openLightbox(full, alt);
      return;
    }

    // Sulje taustaa klikatessa
    const overlay = e.target.closest('#about-media-lightbox');
    if (overlay && e.target === overlay) {
      closeLightbox();
      return;
    }

    // Sulkunappi
    if (e.target.closest('#about-media-lightbox-close')) {
      e.preventDefault();
      closeLightbox();
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') closeLightbox();
  }

  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);

  // Varmista kiinni myös sivun vaihtuessa
  window.addEventListener('pjax:navigated', closeLightbox);

  // Tarvittaessa käytettävä muista skripteistä
  window.closeAboutMediaLightbox = closeLightbox;
})();
