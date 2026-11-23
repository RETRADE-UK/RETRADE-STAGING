(() => {
  const dashboard = document.getElementById('dashboard');
  const detail = document.getElementById('detail');
  const panel = document.getElementById('workspace-panel');
  const tabs = Array.from(document.querySelectorAll('.workspace-tabs [role="tab"]'));
  const observer = 'IntersectionObserver' in window && new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) loadDetail();
  }, { rootMargin: '100px 0px' });

  function loadDetail() {
    const frame = detail.querySelector('iframe');
    if (!frame.hasAttribute('src')) frame.src = frame.dataset.src;
    if (observer) observer.disconnect();
  }
  function watchDetail() {
    if (observer) observer.observe(panel);
    else loadDetail();
  }
  function replaceFrame(example, page, label, load) {
    const old = example.querySelector('iframe');
    const next = old.cloneNode(false);
    next.removeAttribute('src');
    next.title = 'Interactive ' + label + ' example';
    next.dataset.src = '/landing1/preview/' + page + '/';
    if (load) next.src = next.dataset.src;
    old.replaceWith(next);
  }
  function select(tab, load) {
    for (const item of tabs) {
      item.setAttribute('aria-selected', String(item === tab));
      item.tabIndex = item === tab ? 0 : -1;
    }
    const label = tab.textContent;
    panel.setAttribute('aria-labelledby', tab.id);
    detail.querySelector('figcaption > span').textContent = label + ' · Sample data';
    detail.querySelector('[data-reset]').setAttribute('aria-label', 'Reset ' + label + ' example');
    replaceFrame(detail, tab.dataset.page, label, load);
    if (load && observer) observer.disconnect();
  }
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener('click', () => {
      if (tab.getAttribute('aria-selected') !== 'true') select(tab, true);
      else loadDetail();
    });
    tab.addEventListener('keydown', event => {
      const next = { ArrowLeft: (index + tabs.length - 1) % tabs.length, ArrowRight: (index + 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    });
  }
  dashboard.querySelector('[data-reset]').addEventListener('click', () => replaceFrame(dashboard, 'dashboard', 'Dashboard', true));
  detail.querySelector('[data-reset]').addEventListener('click', () => select(tabs.find(tab => tab.tabIndex === 0), true));
  document.querySelector('a[href="#workspace"].ghost-link').addEventListener('click', loadDetail);
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    replaceFrame(dashboard, 'dashboard', 'Dashboard', true);
    select(tabs[0], false);
    watchDetail();
  });
  watchDetail();
})();
