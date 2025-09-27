/* Kuvien/taustojen odotus + CLS-riskien tunnistus (globaali, idempotentti) */
(function ImageReadyBootstrap() {
  if (window.ImageReady) return;

  // -------- utilit --------
  function waitForImg(img) {
    return new Promise((resolve) => {
      const done = () => resolve(img);
      if (!img) return resolve(null);
      if (img.complete) {
        if (img.decode) { img.decode().then(done).catch(done); } else { done(); }
        return;
      }
      img.addEventListener('load', () => {
        if (img.decode) { img.decode().then(done).catch(done); } else { done(); }
      }, { once: true });
      img.addEventListener('error', done, { once: true });
    });
  }

  function extractUrlsFromStyle(style) {
    const urls = [];
    const s = String(style || '');
    const rx = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
    let m;
    while ((m = rx.exec(s))) {
      const u = m[2];
      if (u && !/^data:/.test(u)) urls.push(u);
    }
    return urls;
  }

  function getBackgroundImageUrls(el) {
    try {
      const cs = getComputedStyle(el);
      let urls = extractUrlsFromStyle(cs.backgroundImage);
      try {
        const before = getComputedStyle(el, '::before');
        urls = urls.concat(extractUrlsFromStyle(before.backgroundImage));
      } catch {}
      try {
        const after = getComputedStyle(el, '::after');
        urls = urls.concat(extractUrlsFromStyle(after.backgroundImage));
      } catch {}
      return urls;
    } catch { return []; }
  }

  function waitForBackground(url, base) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const i = new Image();
      i.onload = i.onerror = () => {
        if (i.decode) { i.decode().then(() => resolve(url)).catch(() => resolve(url)); }
        else resolve(url);
      };
      try { i.src = new URL(url, base || location.href).href; } catch { i.src = url; }
    });
  }

  function isInViewport(el, marginPx) {
    try {
      const r = el.getBoundingClientRect();
      const m = Math.max(0, marginPx | 0);
      const vw = window.innerWidth || document.documentElement.clientWidth;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      return (r.bottom >= -m && r.right >= -m && r.top <= vh + m && r.left <= vw + m);
    } catch { return false; }
  }

  // Onko <img> todennäköinen CLS-riskin aiheuttaja ennen latausta?
  function isClsRiskImage(img) {
    try {
      const cs = getComputedStyle(img);
      const hasAttrDims = img.hasAttribute('width') && img.hasAttribute('height');
      const hasAspect = !!cs.aspectRatio && cs.aspectRatio !== 'auto';
      const displayNone = cs.display === 'none' || cs.visibility === 'hidden';
      if (displayNone) return false; // ei vaikuta layoutiin
      // jos ei varattuja mittoja eikä aspect-ratiota -> riski
      if (!hasAttrDims && !hasAspect) return true;
      // jos elementin “box” on automaattinen ja kuvan lataus määrittää korkeuden
      const heightAuto = cs.height === 'auto' || parseFloat(cs.height) === 0;
      if (!hasAttrDims && heightAuto && !hasAspect) return true;
      return false;
    } catch {
      return true;
    }
  }

  // Kerää <img>-elementit
  function collectImgs(root, opts) {
    const {
      criticalOnly = false,
      viewportMargin = 300,
      match = '',
      layoutSafe = false
    } = opts || {};

    const all = Array.from(root.querySelectorAll('img'));
    if (!criticalOnly && !layoutSafe && !match) return all;

    const selected = new Set();

    // 1) Selvästi kriittiset
    all.forEach((img) => {
      const eager = (img.loading || '').toLowerCase() !== 'lazy';
      const high = (img.getAttribute('fetchpriority') || '').toLowerCase() === 'high';
      const flagged = img.hasAttribute('data-critical') || img.hasAttribute('data-visual-critical') || img.hasAttribute('data-wait');
      const inView = isInViewport(img, viewportMargin);
      if (flagged || high || (criticalOnly && (eager || inView))) selected.add(img);
    });

    // 2) CLS-riskiset kuvista (vain jos layoutSafe)
    if (layoutSafe) {
      all.forEach((img) => {
        if (isInViewport(img, viewportMargin) && isClsRiskImage(img)) {
          selected.add(img);
        }
      });
    }

    // 3) match-valitsin (lisäodotettavat)
    if (match) {
      try {
        Array.from(root.querySelectorAll(match)).forEach((n) => {
          if (n.tagName === 'IMG') selected.add(n);
        });
      } catch {}
    }

    return Array.from(selected.size ? selected : all);
  }

  // Kerää taustakuvat (bg ei muuta layoutin kokoa, mutta välkynnän esto: odota foldin lähellä olevat)
  function collectBackgroundUrls(root, opts) {
    const {
      criticalOnly = false,
      viewportMargin = 300,
      layoutSafe = false // ei vaikuta bg:hen, mukana alle yhtenäisyys syistä
    } = opts || {};
    const urls = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
    while (walker.nextNode()) {
      const el = walker.currentNode;
      if (criticalOnly && !isInViewport(el, viewportMargin) &&
          !el.hasAttribute('data-critical') && !el.hasAttribute('data-visual-critical') && !el.hasAttribute('data-wait')) {
        continue;
      }
      getBackgroundImageUrls(el).forEach(u => urls.add(u));
    }
    return Array.from(urls);
  }

  async function waitForAllImages(rootOrSelector, opts) {
    const root = typeof rootOrSelector === 'string'
      ? document.querySelector(rootOrSelector)
      : (rootOrSelector || document);
    if (!root) return;

    const base = document.baseURI || location.href;

    const imgs = collectImgs(root, opts);
    const imgPromises = imgs.map(waitForImg);

    const bgUrls = collectBackgroundUrls(root, opts);
    const bgPromises = bgUrls.map(u => waitForBackground(u, base));

    await Promise.allSettled([...imgPromises, ...bgPromises]);
  }

  window.ImageReady = {
    waitForImg,
    waitForBackground,
    waitForAllImages,
    // hyödylliset apurit
    _isInViewport: isInViewport,
    _isClsRiskImage: isClsRiskImage,
    _collectImgs: collectImgs,
    _collectBackgroundUrls: collectBackgroundUrls
  };
})();
