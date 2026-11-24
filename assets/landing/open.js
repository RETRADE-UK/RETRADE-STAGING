(() => {
  const nav = document.querySelector('.workspace-nav');
  const panel = document.querySelector('#workspace-panel');
  const frameBox = panel.querySelector('.workspace-frame');
  const status = frameBox.querySelector('.preview-status');
  const resetButton = panel.querySelector('[data-reset]');
  const tabs = Array.from(nav.querySelectorAll('[data-page]'));
  const tabByPage = new Map(tabs.map(tab => [tab.id, tab]));
  let activePage;
  let frame;

  function pageFromHash() {
    const key = location.hash.slice(1);
    if (key === 'sale') return 'sales';
    if (key === 'tour') return 'stock';
    return tabByPage.has(key) ? key : 'dashboard';
  }

  function render(page, reset = false) {
    if (frame && activePage === page && !reset) return;
    if (frame) frame.remove();
    activePage = page;
    const tab = tabByPage.get(page);
    for (const option of tabs) {
      option.setAttribute('aria-selected', String(option === tab));
      option.tabIndex = option === tab ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', tab.id);
    resetButton.textContent = 'Reset ' + tab.textContent + ' example';
    resetButton.hidden = false;
    status.textContent = 'Opening ' + tab.textContent + '…';
    status.hidden = false;

    // Only the selected page boots. Each new frame gets a fresh sample workspace.
    frame = document.createElement('iframe');
    frame.title = 'Interactive ' + tab.textContent + ' example';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.referrerPolicy = 'no-referrer';
    frame.src = '/landing1/preview/' + page + '/';
    frame.addEventListener('load', event => {
      if (event.currentTarget === frame) status.hidden = true;
    }, { once: true });
    frameBox.append(frame);
  }

  function select(page) {
    if (location.hash !== '#' + page) history.pushState(null, '', '#' + page);
    render(page);
  }

  nav.setAttribute('role', 'tablist');
  panel.setAttribute('role', 'tabpanel');
  for (const [index, tab] of tabs.entries()) {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    tab.removeAttribute('aria-label');
    tab.href = '#' + tab.id;
    tab.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      select(tab.id);
      tab.focus({ preventScroll: true });
    });
    tab.addEventListener('keydown', event => {
      const next = {
        ArrowLeft: (index + tabs.length - 1) % tabs.length,
        ArrowRight: (index + 1) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
        ' ': index
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(tabs[next].id);
      tabs[next].focus({ preventScroll: true });
    });
  }

  resetButton.addEventListener('click', () => render(activePage, true));
  window.addEventListener('message', event => {
    if (event.data !== 'retrade-preview-panel-open' || !frame || event.source !== frame.contentWindow) return;
    const bounds = frame.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
      frame.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  });

  function restore(reset = false) {
    const focusWasInNav = nav.contains(document.activeElement);
    render(pageFromHash(), reset);
    if (focusWasInNav) tabByPage.get(activePage).focus({ preventScroll: true });
  }
  window.addEventListener('popstate', () => restore());
  window.addEventListener('hashchange', () => restore());
  window.addEventListener('pageshow', event => {
    if (event.persisted) restore(true);
  });
  restore();
  if (location.hash === '#sale' || location.hash === '#tour') nav.scrollIntoView({ block: 'start' });
})();
