(() => {
  const nav = document.querySelector('.workspace-nav');
  const panel = document.querySelector('#workspace-panel');
  const frameBox = panel.querySelector('.workspace-frame');
  const poster = frameBox.querySelector('picture');
  const tryButton = frameBox.querySelector('.try-preview');
  const status = frameBox.querySelector('.preview-status');
  const resetButton = panel.querySelector('[data-reset]');
  const tabs = Array.from(nav.querySelectorAll('[data-page]'));
  const tabByPage = new Map(tabs.map(tab => [tab.id, tab]));
  let activePage = 'stock';
  let frame;

  function pageFromHash() {
    const key = location.hash.slice(1);
    if (key === 'sale') return 'sales';
    if (key === 'tour') return 'stock';
    return tabByPage.has(key) ? key : null;
  }

  function render(page, live, reset = false) {
    const tab = tabByPage.get(page);
    if (frame && (activePage !== page || reset || !live)) {
      frame.remove();
      frame = null;
    }
    activePage = page;
    for (const option of tabs) {
      option.setAttribute('aria-selected', String(option === tab));
      option.tabIndex = option === tab ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', tab.id);
    poster.hidden = live;
    tryButton.hidden = live;
    resetButton.hidden = !live;
    resetButton.textContent = 'Reset ' + tab.textContent + ' example';

    if (!live) status.hidden = true;
    if (live && !frame) {
      // A new frame keeps the selected page's sample edits in this visit only.
      frame = document.createElement('iframe');
      frame.title = 'Interactive ' + tab.textContent + ' example';
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.referrerPolicy = 'no-referrer';
      frame.src = '/landing1/preview/' + page + '/';
      status.textContent = 'Opening ' + tab.textContent + '…';
      status.hidden = false;
      frame.addEventListener('load', event => {
        if (event.currentTarget === frame) status.hidden = true;
      }, { once: true });
      frameBox.append(frame);
    }
  }

  function select(page) {
    if (location.hash !== '#' + page) history.pushState(null, '', '#' + page);
    render(page, true);
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

  function showFromHero(page) {
    select(page);
    tabByPage.get(page).focus({ preventScroll: true });
    nav.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  for (const link of document.querySelectorAll('[data-explore]')) {
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      showFromHero(link.hash.slice(1));
    });
  }
  tryButton.addEventListener('click', () => {
    select('stock');
    tabByPage.get('stock').focus({ preventScroll: true });
  });
  resetButton.addEventListener('click', () => render(activePage, true, true));

  function restore(reset = false) {
    const page = pageFromHash();
    const focusWasInNav = nav.contains(document.activeElement);
    render(page || 'stock', Boolean(page), reset);
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
