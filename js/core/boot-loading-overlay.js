/* Ensilatauksen overlay + sulava cross-fade sisältöön */
(function BootLoadingOverlay() {
  const html = document.documentElement;
  if (html.dataset._bootOverlayInit === '1') return;
  html.dataset._bootOverlayInit = '1';

  // Estä välähdys: sisältö läpinäkyväksi heti
  html.classList.add('under-overlay');

  function ensureOverlay() {
    let el = document.getElementById('app-loading-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'app-loading-overlay';
    el.style.background = 'var(--dark-gray, #2b2b2b)';
    document.body.appendChild(el);
    // tee näkyväksi seuraavassa framessa -> transition toimii
    requestAnimationFrame(() => el.classList.add('is-visible'));
    return el;
  }

  // Dynaaminen katto verkon perusteella (maltillinen, ettei tunnu hitaalta)
  const et = (navigator.connection && navigator.connection.effectiveType) || '';
  const HARD_TIMEOUT_MS = /4g/i.test(et) ? 1400 : 2000;
  const SOFT_GRACE_MS = 80; // pieni hengähdys ennen cross-fadea

  function beginHideWithCrossfade(overlayEl) {
    // 1) Käynnistä sisällön fade-in SAMALLA framella kun overlay fade-out alkaa
    html.classList.add('boot-reveal');    // -> CSS transition opacity: 0 -> 1
    overlayEl.classList.add('is-hiding'); // -> overlay opacity: 1 -> 0

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      // 2) Poista "under-overlay" vasta kun overlay on oikeasti poissa
      requestAnimationFrame(() => {
        html.classList.remove('under-overlay');
        // siivoa overlay
        setTimeout(() => { try { overlayEl.remove(); } catch {} }, 0);
      });
    };

    // Turvallinen kuuntelu overlayn transitionille
    const onEnd = (e) => {
      if (e && e.target !== overlayEl) return;
      overlayEl.removeEventListener('transitionend', onEnd);
      finish();
    };
    overlayEl.addEventListener('transitionend', onEnd);

    // Varmistusajastin jos transitionend ei laukea
    const t = parseFloat(getComputedStyle(overlayEl).transitionDuration || '0') * 1000;
    setTimeout(finish, (t || 0) + 120);
  }

  function onReady() {
    const overlay = ensureOverlay();

    // Odota kriittiset + CLS-riskiset fold-alueelta (image-ready.js hoitaa)
    const waitAll = (window.ImageReady && ImageReady.waitForAllImages)
      ? ImageReady.waitForAllImages(document, {
          criticalOnly: true,
          layoutSafe: true,
          viewportMargin: 360,
          match: 'img[data-critical], img[fetchpriority="high"], #carousel img:first-child'
        })
      : Promise.resolve();

    const hardTimer = new Promise(resolve => setTimeout(resolve, HARD_TIMEOUT_MS));

    Promise.race([
      Promise.allSettled([waitAll]).then(() => true),
      hardTimer
    ]).then(() => {
      // Pieni grace, sitten aloita ristihäivytys
      setTimeout(() => beginHideWithCrossfade(overlay), SOFT_GRACE_MS);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }
})();
