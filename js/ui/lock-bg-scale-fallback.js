/* UI: 100lvh fallback vanhoille selaimille */
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
