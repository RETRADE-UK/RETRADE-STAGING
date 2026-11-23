(function () {
  'use strict';
  const dashboards = [...document.querySelectorAll('[data-dashboard-capture]')];
  const periodNames = { '7d': 'Last 7 days', '14d': 'Last 14 days', '30d': 'Last 30 days', cy: 'Calendar year to date' };
  const narrow = matchMedia('(max-width: 600px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let latest = 0;

  async function selectPeriod(period) {
    const version = ++latest;
    const base = '/assets/landing/open-dashboard-' + period;
    const next = new Image();
    next.src = base + (narrow.matches ? '-phone' : '') + '.webp';
    // Keep the current screenshot visible until the new one is ready.
    try {
      await next.decode();
    } catch {
      if (version !== latest) return;
      dashboards.forEach(dashboard => {
        dashboard.querySelector('[role="status"]').textContent = 'Preview unavailable. Please try that period again.';
        const select = dashboard.querySelector('select');
        select.value = dashboard.dataset.dashboardCapture;
      });
      return;
    }
    if (version !== latest) return;
    dashboards.forEach(dashboard => {
      const image = dashboard.querySelector('img');
      const zoom = dashboard.querySelector('[data-zoom]');
      dashboard.querySelector('source').srcset = base + '-phone.webp';
      image.src = base + '.webp';
      image.alt = 'RETRADE Dashboard · ' + periodNames[period] + ' · example data';
      zoom.dataset.zoom = base + '.webp';
      zoom.dataset.phone = base + '-phone.webp';
      dashboard.querySelector('select').value = period;
      dashboard.dataset.dashboardCapture = period;
      dashboard.querySelector('[role="status"]').textContent = periodNames[period] + ' shown.';
      dashboard.querySelector('.capture-scroll').scrollTop = 0;
      if (!reduced.matches) image.animate([{opacity:.5}, {opacity:1}], {duration:240,easing:'ease-out'});
    });
  }

  for (const dashboard of dashboards) {
    const select = dashboard.querySelector('select');
    select.addEventListener('change', () => selectPeriod(select.value));
  }

  function setPhoneFocus() {
    for (const scroll of document.querySelectorAll('.capture-scroll')) {
      if (narrow.matches) scroll.tabIndex = 0;
      else scroll.removeAttribute('tabindex');
    }
  }
  narrow.addEventListener('change', setPhoneFocus);
  setPhoneFocus();
})();
