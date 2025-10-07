// /js/widgets/logo-hover-swap.js
(function () {
  function cssUrl(el, varName) {
    const raw = (getComputedStyle(el).getPropertyValue(varName) || '').trim();
    if (!raw) return '';
    const m = raw.match(/^url\((.+)\)$/i);
    const url = m ? m[1].replace(/^["']|["']$/g, '') : '';
    return (url && url !== 'none') ? url : '';
  }

  function initOne(el) {
    if (el.dataset.logoSwapInit === '1') return;           // idempotentti
    el.dataset.logoSwapInit = '1';

    const colorUrl = cssUrl(el, '--logo-color');
    if (!colorUrl) return;                                  // ei color-versiota

    const img = new Image();
    img.decoding = 'async';
    img.src = colorUrl;

    const ready = () => el.classList.add('color-ready');

    if (typeof img.decode === 'function') {
      img.decode().then(ready).catch(() => {
        if (img.complete) ready(); else img.onload = ready;
      });
    } else {
      if (img.complete) ready(); else img.onload = ready;
    }
  }

  function init(root = document) {
    root.querySelectorAll('.logo[style*="--logo-white"]:not([data-logo-swap-init])')
      .forEach(initOne);
  }

  // Käytettävissä manuaalisiin kutsuihin mahdollisissa sivukehyksissä
  window.initLogoHoverSwap = init;

  // Ensilataus
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(document));
  } else {
    init(document);
  }
  window.addEventListener('pageshow', () => init(document));

  // Tyypillisimmät AJAX/SPA-tapahtumat
  ['pjax:complete', 'pjax:end', 'pjax:success', 'pjax:ready',
    'turbo:load', 'turbolinks:load',
    'swup:contentReplaced',
    'htmx:afterSwap',
    'alpine:init',
    'astro:page-load'
  ].forEach(evt => document.addEventListener(evt, () => init(document)));

  // Havaitse dynaamisesti lisätyt elementit
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      m.addedNodes && m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return; // Element
        if (node.matches && node.matches('.logo[style*="--logo-white"]')) {
          initOne(node);
        } else if (node.querySelectorAll) {
          init(node);
        }
      });
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
