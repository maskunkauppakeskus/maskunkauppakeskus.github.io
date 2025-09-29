/* banner-carousel.js — tiukka toteutus, ei tiedostonimiarvailua */

(function () {
  // Päivitä listaa tarvittaessa. Vain näitä ladataan.
  // Voit myös yliajaa ennen latausta: window.BANNERS_AVIF = [...]
  window.BANNERS_AVIF = window.BANNERS_AVIF || [
    './assets/banner_1.avif',
    // './assets/banner_2.avif',
    // './assets/banner_3.avif',
  ];

  function q(sel, ctx) { return (ctx || document).querySelector(sel); }

  window.initBannerCarousel = async function initBannerCarousel() {
    const viewport = q('#carousel');
    if (!viewport) return;

    if (viewport.dataset._carouselInit === '1') return;
    viewport.dataset._carouselInit = '1';

    // Luo track jos puuttuu
    let track = viewport.querySelector('.track');
    if (!track) {
      track = document.createElement('div');
      track.className = 'track';
      track.style.display = 'flex';
      track.style.transition = 'transform 0.6s ease';
      track.style.willChange = 'transform';
      viewport.appendChild(track);
    }
    viewport.style.overflow = 'hidden';

    // Tyhjennä aiemmin generoimamme slidit
    track.querySelectorAll('[data-banner-generated="1"]').forEach(n => n.remove());

    // Lisää vain manifestissa olevat polut
    const files = (window.BANNERS_AVIF || []).slice();

    if (!files.length) return;

    files.forEach((src, idx) => {
      const a = document.createElement('a');
      a.className = 'slide';
      a.href = '#';
      a.style.flex = '0 0 100%';

      const img = document.createElement('img');
      img.src = src;                        // ← ei vaihtoehtopäätteitä
      img.alt = '';
      img.decoding = 'async';
      img.loading = idx === 0 ? 'eager' : 'lazy';
      img.fetchPriority = idx === 0 ? 'high' : 'auto';
      img.style.width = '100%';
      img.style.height = 'auto';
      img.style.display = 'block';

      a.setAttribute('data-banner-generated', '1');
      a.appendChild(img);
      track.appendChild(a);
    });

    // Yksinkertainen liu’utus
    let index = 0;
    const total = track.querySelectorAll('.slide').length;
    const DURATION_MS = 5000;

    const show = (i) => {
      index = (i + total) % total;
      track.style.transform = `translateX(${-index * 100}%)`;
    };

    show(0);

    if (viewport._timer) { clearInterval(viewport._timer); viewport._timer = null; }
    if (total >= 2) {
      viewport._timer = setInterval(() => show(index + 1), DURATION_MS);
    }

    // Siivous kun PJAX vaihtaa sivun
    const onPjax = () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (viewport._timer) { clearInterval(viewport._timer); viewport._timer = null; }
      delete viewport.dataset._carouselInit;
      window.removeEventListener('pjax:navigated', onPjax);
    };
    window.addEventListener('pjax:navigated', onPjax);

    // Pysäytä taustalla
    function onVisibility() {
      if (document.hidden && viewport._timer) { clearInterval(viewport._timer); viewport._timer = null; }
      else if (!document.hidden && total >= 2 && !viewport._timer) {
        viewport._timer = setInterval(() => show(index + 1), DURATION_MS);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
  };
})();
