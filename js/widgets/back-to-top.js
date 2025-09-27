/* Widget: takaisin ylös -painike */
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
