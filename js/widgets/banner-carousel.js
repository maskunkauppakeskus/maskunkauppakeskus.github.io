/* Widget: globaalin bannerikarusellin init (window.initBannerCarousel) */

(function () {
  // Odota DOM + #carousel näkyviin, prewarm ensimmäinen banneri, sitten init

  // Mahdolliset polkunimet/nimeämiset ensimmäiselle bannerille
  const FIRST_CANDIDATES = [
    '/assets/banner_1.avif',
    '/assets/banner1.avif',
    './assets/banner_1.avif',
    '/assets/banner_1.webp',
    '/assets/banner1.webp',
    './assets/banner_1.webp'
  ];

  let booted = false;

  function prewarmFirstBanner(timeoutMs = 600) {
    // Lataa ensimmäinen banneri korkealla prioriteetilla – ei estä renderöintiä
    return new Promise((resolve) => {
      let done = false;
      const tried = new Set();
      const timer = setTimeout(() => { if (!done) { done = true; resolve(); } }, timeoutMs);

      function kick(url) {
        if (!url || tried.has(url)) return;
        tried.add(url);
        const i = new Image();
        i.fetchPriority = 'high';
        i.decoding = 'async';
        i.loading = 'eager';
        i.onload = i.onerror = () => {
          if (!done) { done = true; clearTimeout(timer); resolve(); }
        };
        i.src = url;
      }

      FIRST_CANDIDATES.forEach(kick);
      // Jos mikään ei ehdi, timeout vapauttaa etenemään
    });
  }

  function whenCarouselPresent(cb) {
    const existing = document.getElementById('carousel');
    if (existing && existing.isConnected) { cb(existing); return; }

    const obs = new MutationObserver(() => {
      const el = document.getElementById('carousel');
      if (el && el.isConnected) {
        obs.disconnect();
        cb(el);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    // Turva: katkaise havainnointi jos mitään ei ilmesty (esim. landing ilman karusellia)
    setTimeout(() => { try { obs.disconnect(); } catch {} }, 4000);
  }

  async function kickOnceReady() {
    if (booted) return;
    booted = true;

    // Prewarm ensimmäinen banneri -> välimuistiin ennen kuin init rakentaa <img>:t
    await prewarmFirstBanner(600);

    if (typeof window.initBannerCarousel === "function") {
      try { await window.initBannerCarousel(); } catch (_) { /* no-op */ }
    }
  }

  function scheduleKick() {
    const run = () => {
      whenCarouselPresent(() => {
        // Varmistetaan, että layout on laskettu ennen init:iä
        requestAnimationFrame(() => setTimeout(kickOnceReady, 0));
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
  }

  // Ensilataus
  scheduleKick();

  // PJAX-navigaatio: uusi <main> tuo uuden #carousel:in -> sama pipeline
  window.addEventListener("pjax:navigated", () => {
    booted = false; // sallitaan uusi init, initBannerCarousel on itsessään idempotentti
    scheduleKick();
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
      if (html.classList.contains("scrolling-by-script")) {
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
