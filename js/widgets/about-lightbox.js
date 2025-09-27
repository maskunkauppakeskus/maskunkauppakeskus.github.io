/* Widget: About-sivun media-lightbox */
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
