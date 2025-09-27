/* PJAX: odota uuden <main>:n kriittiset + CLS-riskiset (fold) ja häivytä sisään */
(function PjaxSoftReady() {
  if (document.documentElement.dataset._pjaxSoftReadyInit === '1') return;
  document.documentElement.dataset._pjaxSoftReadyInit = '1';

  const MIN_DELAY_MS = 120;   // pidempi min-viive -> vähemmän välkettä
  const HARD_TIMEOUT_MS = 1800;

  async function softReadyMain(mainEl) {
    if (!mainEl) return;
    if (mainEl.dataset._softReadyState === 'done') return;
    if (mainEl.dataset._softReadyState === 'pending') return;

    mainEl.dataset._softReadyState = 'pending';
    mainEl.classList.remove('is-soft-ready');
    mainEl.classList.add('is-soft-pending');

    const waitAll = (window.ImageReady && ImageReady.waitForAllImages)
      ? ImageReady.waitForAllImages(mainEl, {
          criticalOnly: true,
          layoutSafe: true,          // ← odota CLS-riskiset foldista
          viewportMargin: 300,
          match: 'img[data-critical], img[fetchpriority="high"], #carousel img:first-child'
        })
      : Promise.resolve();

    const minDelay = new Promise(res => setTimeout(res, MIN_DELAY_MS));
    const hardTimeout = new Promise(res => setTimeout(res, HARD_TIMEOUT_MS));

    await Promise.race([Promise.allSettled([waitAll, minDelay]).then(() => true), hardTimeout]);

    mainEl.classList.remove('is-soft-pending');
    mainEl.classList.add('is-soft-ready');
    mainEl.dataset._softReadyState = 'done';
  }

  function onBoot() {
    const m = document.querySelector('main');
    if (m) softReadyMain(m);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onBoot, { once: true });
  } else {
    onBoot();
  }

  window.addEventListener('pjax:navigated', () => {
    const m = document.querySelector('main');
    if (m) softReadyMain(m);
  });
})();
