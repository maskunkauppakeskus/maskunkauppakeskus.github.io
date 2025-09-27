/* Widget: aukiolot (window.initOpeningHours + automount) */
(function () {
  const TZ = 'Europe/Helsinki';
  const MIN_PER_DAY = 24 * 60;
  const MIN_PER_WEEK = 7 * MIN_PER_DAY;
  const WEEKDAYS_FI = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];

  // Ma–Pe 10–20, La 10–18, Su 12–18
  const DEFAULT_SCHEDULE = [
    { open: 10 * 60, close: 20 * 60 }, // Ma
    { open: 10 * 60, close: 20 * 60 }, // Ti
    { open: 10 * 60, close: 20 * 60 }, // Ke
    { open: 10 * 60, close: 20 * 60 }, // To
    { open: 10 * 60, close: 20 * 60 }, // Pe
    { open: 10 * 60, close: 18 * 60 }, // La
    { open: 12 * 60, close: 18 * 60 }  // Su
  ];

  function pad2(n) { return String(n).padStart(2, '0'); }
  function hmStr(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${pad2(h)}.${pad2(m)}`;
  }
  function getHkiNowParts() {
    const fmt = new Intl.DateTimeFormat('fi-FI', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false
    });
    const parts = fmt.formatToParts(new Date());
    const get = (t) => parts.find(p => p.type === t)?.value;
    const wdShort = (get('weekday') || '').slice(0, 2).toLowerCase();
    const map = { ma: 0, ti: 1, ke: 2, to: 3, pe: 4, la: 5, su: 6 };
    return {
      weekdayIndex: map[wdShort],
      hour: Number(get('hour')),
      minute: Number(get('minute')),
    };
  }
  function findNextOpen(nowDayIndex, nowMinutes, schedule) {
    for (let offset = 0; offset < 7; offset++) {
      const d = (nowDayIndex + offset) % 7;
      const e = schedule[d];
      if (!e || e.open == null || e.close == null) continue;
      if (offset === 0) {
        if (nowMinutes < e.open) return { dayIndex: d, minutes: e.open };
      } else {
        return { dayIndex: d, minutes: e.open };
      }
    }
    return null;
  }
  function minutesUntil(nowDayIndex, nowMinutes, targetDayIndex, targetMinutes) {
    const nowAbs = nowDayIndex * MIN_PER_DAY + nowMinutes;
    const targetAbs = targetDayIndex * MIN_PER_DAY + targetMinutes;
    const diff = (targetAbs - nowAbs + MIN_PER_WEEK) % MIN_PER_WEEK;
    return diff === 0 ? MIN_PER_WEEK : diff;
  }
  function formatDuration(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h} h ${m} min`;
    if (h) return `${h} h`;
    return `${m} min`;
  }
  function renderScheduleLines(schedule) {
    const sameWeekdays =
      schedule.slice(0, 5).every(e => e.open === schedule[0].open && e.close === schedule[0].close);
    const lines = [];
    if (sameWeekdays) {
      const e = schedule[0];
      lines.push(`Ma–Pe: ${hmStr(e.open)}–${hmStr(e.close)}`);
    } else {
      for (let i = 0; i < 5; i++) {
        const e = schedule[i];
        lines.push(`${WEEKDAYS_FI[i]}: ${e?.open != null ? `${hmStr(e.open)}–${hmStr(e.close)}` : 'suljettu'}`);
      }
    }
    const sat = schedule[5], sun = schedule[6];
    lines.push(`La: ${sat?.open != null ? `${hmStr(sat.open)}–${hmStr(sat.close)}` : 'suljettu'}`);
    lines.push(`Su: ${sun?.open != null ? `${hmStr(sun.open)}–${hmStr(sun.close)}` : 'suljettu'}`);
    return lines.join('\n');
  }
  function buildWidgetHTML(status, subline) {
    return `
      <div class="aukiolo-card">
        <h2>Aukiolo: ${status}</h2>
        <h3>${subline}</h3>
      </div>
    `;
  }
  function computeAndRender(el, schedule) {
    const { weekdayIndex: d, hour: h, minute: m } = getHkiNowParts();
    const nowMinutes = h * 60 + m;
    const today = schedule[d];
    const fullLines = renderScheduleLines(schedule);
    const todayLine = today?.open != null ? `${hmStr(today.open)}–${hmStr(today.close)}` : 'suljettu';

    let status = 'Suljettu';
    let subline = 'Ei aukioloaikoja.';
    if (today && today.open != null && nowMinutes >= today.open && nowMinutes < today.close) {
      const remaining = today.close - nowMinutes;
      status = 'Avoinna';
      subline = `Sulkeutuu ${formatDuration(remaining)} kuluttua, klo ${hmStr(today.close)}.`;
    } else {
      const next = (today && today.open != null && nowMinutes < today.open)
        ? { dayIndex: d, minutes: today.open }
        : findNextOpen(d, nowMinutes, schedule);
      if (next) {
        const minsUntil = minutesUntil(d, nowMinutes, next.dayIndex, next.minutes);
        const dayText = next.dayIndex === d ? 'tänään' : ((next.dayIndex === (d + 1) % 7) ? 'huomenna' : WEEKDAYS_FI[next.dayIndex]);
        subline = `Aukeaa ${dayText} klo ${hmStr(next.minutes)} (${formatDuration(minsUntil)}).`;
      }
    }
    el.innerHTML = buildWidgetHTML(status, subline, todayLine, fullLines);
  }

  function initOpeningHours(selectorOrElement, customSchedule) {
    const el = typeof selectorOrElement === 'string'
      ? document.querySelector(selectorOrElement)
      : selectorOrElement;
    if (!el) return;

    const schedule = (customSchedule && customSchedule.length === 7)
      ? customSchedule
      : DEFAULT_SCHEDULE;

    computeAndRender(el, schedule);
    const id = setInterval(() => computeAndRender(el, schedule), 60 * 1000);
    return {
      destroy: () => clearInterval(id),
      updateSchedule: (s) => computeAndRender(el, s || schedule)
    };
  }

  // Julkinen API vain kerran
  if (!('initOpeningHours' in window)) {
    window.initOpeningHours = initOpeningHours;
  }

  // -------- AUTOMAATTINEN MOUNT PJAX-YMPÄRISTÖSSÄ (idempotentti) ------------
  const Auto = { el: null, handle: null };

  function autoMountOpeningHours() {
    const el = document.querySelector('#aukiolo-widget');

    // Jos elementti vaihtui tai poistui -> siivoa vanha instanssi
    if (Auto.el && (!Auto.el.isConnected || Auto.el !== el)) {
      try { Auto.handle?.destroy?.(); } catch {}
      Auto.el = null;
      Auto.handle = null;
    }

    // Jos löytyi uusi elementti eikä instanssia -> luo uusi
    if (el && !Auto.handle) {
      Auto.handle = initOpeningHours(el);
      Auto.el = el;
    }
  }

  document.addEventListener('DOMContentLoaded', autoMountOpeningHours);
  window.addEventListener('pjax:navigated', autoMountOpeningHours);
})();
