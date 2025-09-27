/* UI: sulje hamburger klikkauksesta ulkopuolelle */
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
