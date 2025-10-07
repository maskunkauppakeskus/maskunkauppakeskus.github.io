// /js/widgets/contact-form.js
(function () {
  if (window.__contactFormBound) return;
  window.__contactFormBound = true;

  const ENDPOINT_FALLBACK_TO = 'kalle.karppinen@masku.com';
  const SEND_TIMEOUT_MS = 15000;

  function setStatus(el, msg, ok) {
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('status--ok', !!ok);
    el.classList.toggle('status--err', ok === false);
  }

  function formToPayload(form) {
    const fd = new FormData(form);
    return {
      to: (fd.get('to') || ENDPOINT_FALLBACK_TO).toString(),
      replyTo: (fd.get('replyTo') || '').toString().trim(),
      message: (fd.get('message') || '').toString().trim(),
      page: location.href
    };
  }

  // Delegoitu kuuntelu toimii myös PJAX/SPA-ympäristössä
  document.addEventListener('submit', async (ev) => {
    const form = ev.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!form.matches('form[data-contact-form]')) return;

    ev.preventDefault();

    const status = form.querySelector('#formStatus');
    const btn = form.querySelector('#sendBtn');

    // Honeypot
    if (form.querySelector('input[name="website"]').value) {
      setStatus(status, 'Kiitos viestistä!', true);
      form.reset();
      return;
    }

    if (!form.reportValidity()) {
      setStatus(status, 'Tarkista kentät.', false);
      return;
    }

    const payload = formToPayload(form);
    if (!payload.replyTo || !payload.message) {
      setStatus(status, 'Tarkista kentät.', false);
      return;
    }

    btn && (btn.disabled = true);
    setStatus(status, 'Lähetetään…');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
        credentials: 'same-origin'
      });
      clearTimeout(timer);

      let okFlag = res.ok && String(res.status).startsWith('2');
      try {
        const data = await res.clone().json();
        if (data && typeof data.ok !== 'undefined') okFlag = !!data.ok;
      } catch (_) {}

      if (okFlag) {
        setStatus(status, 'Kiitos! Vahvistus lähetetty sähköpostiisi, vastaamme pian.', true);
        form.reset();
        btn && (btn.disabled = false);
        return;
      }
      throw new Error('endpoint_not_ok');
    } catch (_) {
      clearTimeout(timer);
      const mailtoTo = encodeURIComponent(payload.to);
      const subject = encodeURIComponent('Yhteydenotto verkkosivulta');
      const body = encodeURIComponent(
        `Viestin lähettäjä pyytää vastausta osoitteeseen: ${payload.replyTo}\n\n` +
        `Viestin sisältö:\n${payload.message}\n\n` +
        `Lähetetty sivulta: ${payload.page}`
      );
      try {
        window.location.href = `mailto:${mailtoTo}?subject=${subject}&body=${body}`;
        setStatus(status, 'Avasimme sähköpostiohjelmasi – voit viimeistellä lähetyksen siellä.', true);
      } catch (_) {
        setStatus(status, 'Lähetys epäonnistui. Yritä myöhemmin uudelleen.', false);
      } finally {
        btn && (btn.disabled = false);
      }
    }
  }, true);
})();
