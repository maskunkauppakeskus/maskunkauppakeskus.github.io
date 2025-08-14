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
    // mobiilinav
    const nav = root.querySelector("#nav");
    const btn = root.querySelector("#nav-toggle");
    if (btn && nav) btn.addEventListener("click", () => nav.classList.toggle("open"));

    // PJAX vain samaan alkuperään, html-sivuihin
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
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || a.target === "_blank") return false;
    const url = new URL(href, location.href);
    return url.origin === location.origin && url.pathname.endsWith(".html");
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
      executeScripts(newMain, url);
      setActiveNav(url.pathname);

      const hash = url.hash?.replace(/^#/, "") || "";
      if (hash) {
        requestAnimationFrame(() => {
          scrollToHash(hash, { behavior: "smooth" });
        });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      // Hash-synkka uuden <main>:in kanssa
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
    document.querySelectorAll("#nav a").forEach((a) => {
      const h = a.getAttribute("href") || "";
      if (h.endsWith(file)) a.classList.add("active");
      else a.classList.remove("active");
    });
  }

  function initCarouselAndYear() {
    const y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();

    const carousel = document.getElementById("carousel");
    if (carousel) {
      let idx = 0;
      setInterval(() => {
        idx = (idx + 1) % carousel.children.length;
        carousel.scrollTo({ left: idx * carousel.clientWidth, behavior: "smooth" });
      }, 4500);
    }
  }

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
    const top = window.scrollY + el.getBoundingClientRect().top - headerOffsetPx() - 8;
    window.scrollTo({ top, behavior: opts.behavior || "smooth" });
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

  function initSectionHashSync() {
    if (sectionObserver) {
      sectionObserver.disconnect();
      sectionObserver = null;
    }

    const sections = Array.from(document.querySelectorAll("main section"));
    if (!sections.length) return;

    // Kartta slugeista (vain ne joille slug löytyy)
    const withSlug = sections
      .map((s) => ({ el: s, slug: getSectionSlug(s) }))
      .filter((x) => !!x.slug);

    if (!withSlug.length) return;

    lastHash = location.hash.replace(/^#/, "") || null;

    // Pidetään näkymän keskikohta etusijalla
    sectionObserver = new IntersectionObserver(
      (entries) => {
        // Valitaan entry jonka elementin keskikohta on lähimpänä viewportin keskikohtaa,
        // ja joka on vähintään 40% näkyvissä.
        let best = null;
        let bestScore = Infinity;

        const viewportCenter = window.innerHeight / 2;
        for (const e of entries) {
          if (!e.isIntersecting || e.intersectionRatio < 0.4) continue;
          const rect = e.target.getBoundingClientRect();
          const center = rect.top + rect.height / 2;
          const dist = Math.abs(center - viewportCenter);
          if (dist < bestScore) {
            bestScore = dist;
            best = e.target;
          }
        }

        if (!best) return;
        const slug = getSectionSlug(best);
        // Jos slug kielletty (kuten hero), tyhjennetään hash
        if (slug && !NO_HASH_SECTIONS.has(slug)) updateHash(slug);
        else updateHash("");
      },
      {
        root: null,
        threshold: [0.4, 0.6, 0.8, 1],
        // huomioi kiinteän headerin: siirretään hieman katselualuetta
        rootMargin: `-${Math.min(40, headerOffsetPx())}px 0px -30% 0px`,
      }
    );

    withSlug.forEach(({ el }) => sectionObserver.observe(el));

    // Päivitä heti kun sivu ladattu, jotta hash vastaa alkuasemaa
    requestAnimationFrame(() => {
      const currentHash = location.hash.replace(/^#/, "");
      if (currentHash) {
        // Jos syvälinkissä tulimme hero:on tai kelpaamattomaan, tyhjennä
        if (NO_HASH_SECTIONS.has(currentHash)) updateHash("");
      } else {
        // Jos näkymä ei ole ylhäällä, aseta lähin osio
        const first = withSlug[0]?.el;
        if (first) {
          const rect = first.getBoundingClientRect();
          if (rect.top < headerOffsetPx() + 1) {
            const slug = getSectionSlug(first);
            if (slug && !NO_HASH_SECTIONS.has(slug)) updateHash(slug);
          }
        }
      }
    });
  }

  function scrollToHash(hash, opts = {}) {
    const target = findSectionByHash(hash);
    if (target) {
      smoothScrollTo(target, opts);
      updateHash(hash); // pidä osoite synkassa rullauksen jälkeen
    }
  }

  // Delegoitu pehmeä rullaus ankkureille koko dokumentissa
  function initInPageAnchorScrolling() {
    document.removeEventListener("click", onDocumentClickForAnchors);
    document.addEventListener("click", onDocumentClickForAnchors);
  }

  function onDocumentClickForAnchors(e) {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const href = a.getAttribute("href") || "";
    const hash = href.replace(/^#/, "");
    if (!hash) return;
    e.preventDefault();
    scrollToHash(hash, { behavior: "smooth" });
  }

  // --- bootstrap: yksi selkeä onDomReady ------------------------------------
  async function onDomReady() {
    const headerEl = document.getElementById("site-header");
    const footerEl = document.getElementById("site-footer");
    if (headerEl) await loadPartial(headerEl, headerEl.dataset.partial || "/partials/header.html", "header");
    if (footerEl) await loadPartial(footerEl, footerEl.dataset.partial || "/partials/footer.html", "footer");

    setActiveNav(location.pathname);
    initCarouselAndYear();

    initSectionHashSync();
    initInPageAnchorScrolling();

    const initialHash = location.hash.replace(/^#/, "");
    if (initialHash) {
      requestAnimationFrame(() => scrollToHash(initialHash, { behavior: "smooth" }));
    }
  }

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
})();

// --- taustakuvan scroll-synkka (event-pohjainen) ----------------------------
(function initBackgroundScrollSync(){
  const root = document.documentElement;
  const el = document.scrollingElement || root;
  let raf = 0;

  function setBgFromScroll(){
    const max = Math.max(1, el.scrollHeight - el.clientHeight);
    const y = el.scrollTop || 0;
    const progress = Math.min(1, Math.max(0, y / max));
    root.style.setProperty("--bg-pos", (progress * 100).toFixed(3) + "%");
  }

  function onScroll(){
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; setBgFromScroll(); });
  }

  setBgFromScroll();
  window.addEventListener("load", onScroll);
  window.addEventListener("resize", onScroll);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pjax:navigated", () => requestAnimationFrame(setBgFromScroll));
})();

// --- header: piilota alas rullatessa, näytä ylös rullatessa -----------------
(function initHideOnScrollHeader(){
  const el = document.scrollingElement || document.documentElement;
  let header = null;
  let lastY = el.scrollTop || 0;
  let raf = 0;
  let started = false;

  function ensureHeader(){
    if (!header) header = document.querySelector(".site-header");
    if (header && !started) {
      started = true;
      update(); // heti tila oikein
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
    }
  }

  function update(){
    const y = el.scrollTop || 0;
    if (header) {
      if (y <= 0) header.classList.remove("site-header--hidden");
      else if (y > lastY) header.classList.add("site-header--hidden");
      else header.classList.remove("site-header--hidden");
    }
    lastY = y;
    raf = 0;
  }

  function onScroll(){ if (raf) return; raf = requestAnimationFrame(update); }

  // Yritä löytää header heti ja partialin valmistuttua
  ensureHeader();
  window.addEventListener("partial:loaded", (e) => {
    if (e.detail?.key === "header") { header = null; started = false; ensureHeader(); }
  });
  // PJAXin jälkeen nollaa tila ja yritä uudelleen
  window.addEventListener("pjax:navigated", () => {
    lastY = el.scrollTop || 0;
    header = null; started = false;
    ensureHeader();
    requestAnimationFrame(update);
  });

  document.addEventListener('DOMContentLoaded', () => { /* ei tarvita erikseen */ });
})();
