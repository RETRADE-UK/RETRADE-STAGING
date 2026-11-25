(() => {
  const nav = document.querySelector('.workspace-nav');
  const panel = document.querySelector('#workspace-panel');
  const frameBox = panel.querySelector('.workspace-frame');
  const status = frameBox.querySelector('.preview-status');
  const recovery = frameBox.querySelector('.preview-recovery');
  const retryButton = recovery.querySelector('[data-retry]');
  const tabs = Array.from(nav.querySelectorAll('[data-page]'));
  const tabByPage = new Map(tabs.map(tab => [tab.id, tab]));
  const pages = tabs.map(tab => tab.id);
  const frames = new Map();
  const primed = new Set();
  const failed = new Set();
  const handheld = window.matchMedia('(max-width: 680px), (hover: none) and (pointer: coarse)');
  // Keep the last painted page on screen while the requested page starts.
  let requested;
  let visible;
  let warmScheduled = false;
  let firstWarmScheduled = false;
  let primeRequest;
  let inView = !('IntersectionObserver' in window);

  function pageFromHash() {
    const key = location.hash.slice(1);
    if (key === 'sale') return 'sales';
    if (key === 'tour') return 'stock';
    return tabByPage.has(key) ? key : 'dashboard';
  }

  function setSelected(page) {
    const tab = tabByPage.get(page);
    for (const option of tabs) {
      option.setAttribute('aria-selected', String(option === tab));
      option.tabIndex = option === tab ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', tab.id);
  }

  function remove(frame) {
    if (frames.get(frame.dataset.page) === frame) frames.delete(frame.dataset.page);
    frame.remove();
  }

  function show(frame) {
    if (visible && visible !== frame) remove(visible); // Discard edits when leaving a page.
    visible = frame;
    frame.inert = false;
    frame.removeAttribute('aria-hidden');
    frame.removeAttribute('tabindex');
    frame.dataset.active = '';
    frameBox.dataset.started = '';
    frameBox.setAttribute('aria-busy', 'false');
    setSelected(frame.dataset.page);
    updateVisibility();
  }

  function fail(frame) {
    const page = frame.dataset.page;
    failed.add(page);
    remove(frame);
    if (requested === page) {
      if (visible) remove(visible);
      visible = null;
      delete frameBox.dataset.started;
      setSelected(page);
      frameBox.setAttribute('aria-busy', 'false');
      const name = tabByPage.get(page).textContent;
      status.textContent = name + ' couldn’t load.';
      retryButton.textContent = 'Retry ' + name;
      recovery.hidden = false;
    }
    scheduleWarm();
  }

  function createFrame(page) {
    const frame = document.createElement('iframe');
    frame.title = 'Interactive ' + tabByPage.get(page).textContent + ' example';
    frame.dataset.page = page;
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.referrerPolicy = 'no-referrer';
    frame.inert = true;
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    frame.src = '/landing1/preview/' + page + '/';
    frames.set(page, frame);
    // A failed document navigation may have no preview script to report the error.
    frame.addEventListener('load', () => {
      setTimeout(() => {
        if (frames.get(page) === frame && !frame.hasAttribute('data-ready')) fail(frame);
      }, 2000);
    }, { once: true });
    frameBox.append(frame);
    return frame;
  }

  function standbyLimit() {
    const { connection, deviceMemory, hardwareConcurrency } = navigator;
    if (connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType) ||
        deviceMemory <= 2 || hardwareConcurrency <= 2) return 0;
    // Safari does not expose deviceMemory. Include touch devices in landscape.
    if (handheld.matches || deviceMemory <= 4 || hardwareConcurrency <= 4) return 1;
    return pages.length - 1;
  }

  function canWarm() {
    return visible && visible.dataset.page === requested && !document.hidden && inView && standbyLimit() > 0;
  }

  async function primeFiles(page, signal) {
    // Warm the same public HTML and view script used by the future frame without
    // running another app instance on a phone. The common assets are already cached.
    const options = { priority: 'low', signal };
    const response = await fetch('/landing1/preview/' + page + '/', options);
    if (!response.ok) return;
    const html = await response.text();
    const view = html.match(/src="\.\.\/(view-[a-z]+-[0-9a-f]{16}\.js)"/);
    if (!view || frames.has(page)) return;
    if (!canWarm()) {
      primed.delete(page); // Resume when the demo is back in view.
      return;
    }
    const script = await fetch('/landing1/preview/' + view[1], options);
    if (script.ok) await script.arrayBuffer();
  }

  function warmNext() {
    warmScheduled = false;
    if (!canWarm() || primeRequest) return;
    const index = pages.indexOf(requested);
    const order = pages.slice(index + 1).concat(pages.slice(0, index)).filter(page => !failed.has(page));
    const standby = order.slice(0, standbyLimit());
    for (const [page, frame] of frames) {
      if (frame !== visible && !standby.includes(page)) remove(frame);
    }
    for (const page of standby) {
      if (!frames.has(page)) {
        createFrame(page);
        return;
      }
      if (!frames.get(page).hasAttribute('data-ready')) return;
    }
    // Extra asset-only requests are worthwhile on a known fast link. On WebKit
    // without a link estimate, frame loads may not reuse a parent fetch.
    if (navigator.connection?.effectiveType !== '4g') return;
    const next = order.find(page => !standby.includes(page) && !primed.has(page));
    if (!next) return;
    primeRequest = new AbortController();
    primed.add(next);
    primeFiles(next, primeRequest.signal).catch(error => {
      if (error.name === 'AbortError') primed.delete(next);
    }).finally(() => {
      primeRequest = null;
      scheduleWarm();
    });
  }

  function scheduleWarm() {
    if (!canWarm() || warmScheduled) return;
    warmScheduled = true;
    const idle = () => {
      if (window.requestIdleCallback) window.requestIdleCallback(warmNext);
      else setTimeout(warmNext, 0);
    };
    if (!firstWarmScheduled) {
      firstWarmScheduled = true;
      // Let the visible Dashboard paint before the first standby starts work.
      requestAnimationFrame(() => requestAnimationFrame(idle));
    } else {
      requestAnimationFrame(idle);
    }
  }

  function render(page, reset = false) {
    if (requested === page && !reset && !failed.has(page)) return;
    requested = page;
    failed.delete(page);
    recovery.hidden = true;
    frameBox.setAttribute('aria-busy', 'true');
    if (!visible) setSelected(page);
    const singleStandby = standbyLimit() <= 1;
    for (const [key, candidate] of frames) {
      if (candidate === visible) continue;
      const otherStandby = key !== page && (singleStandby || !candidate.hasAttribute('data-ready'));
      if ((reset && key === page) || otherStandby) remove(candidate);
    }
    let target = frames.get(page);
    if (!target || reset) target = createFrame(page);
    if (target.hasAttribute('data-ready')) show(target);
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

  retryButton.addEventListener('click', () => {
    tabByPage.get(requested).focus({ preventScroll: true });
    render(requested, true);
  });
  window.addEventListener('message', event => {
    if (event.origin !== 'null') return;
    if (event.data === 'retrade-preview-panel-open') {
      if (!visible || event.source !== visible.contentWindow) return;
      const bounds = visible.getBoundingClientRect();
      if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
        visible.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      }
      return;
    }
    if (event.data !== 'retrade-preview-ready' && event.data !== 'retrade-preview-error') return;
    const frame = Array.from(frames.values()).find(candidate => candidate.contentWindow === event.source);
    if (!frame) return;
    if (event.data === 'retrade-preview-error') { fail(frame); return; }
    frame.dataset.ready = '';
    primed.add(frame.dataset.page);
    if (frame.dataset.page === requested) show(frame);
    else scheduleWarm();
  });

  function updateVisibility() {
    const limit = standbyLimit();
    if (document.hidden || !inView || !limit) {
      primeRequest?.abort();
      for (const [page, frame] of frames) {
        if (page !== requested && frame !== visible && (!limit || !frame.hasAttribute('data-ready'))) remove(frame);
      }
    }
    if (visible?.dataset.page === 'dashboard' && !visible.hasAttribute('data-activated') && !document.hidden && inView) {
      visible.dataset.activated = '';
      visible.contentWindow.postMessage('retrade-preview-activate', '*');
    }
    scheduleWarm();
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      updateVisibility();
    }).observe(frameBox);
  }
  document.addEventListener('visibilitychange', updateVisibility);
  handheld.addEventListener('change', updateVisibility);
  navigator.connection?.addEventListener?.('change', updateVisibility);

  function restore(reset = false) {
    const focusWasInNav = nav.contains(document.activeElement);
    render(pageFromHash(), reset);
    if (focusWasInNav) tabByPage.get(requested).focus({ preventScroll: true });
  }
  window.addEventListener('popstate', () => restore());
  window.addEventListener('hashchange', () => restore());
  window.addEventListener('pageshow', event => {
    if (event.persisted) restore(true);
  });
  restore();
  if (location.hash === '#sale' || location.hash === '#tour') nav.scrollIntoView({ block: 'start' });
})();

// All amounts in the sample ledger are in pence.
(() => {
  const card = document.querySelector('.item-demo');
  if (!card) return;
  const controls = card.querySelector('.item-controls');
  const money = pence => (pence < 0 ? '−' : '') + '£' + (Math.abs(pence) / 100).toFixed(2);
  function update() {
    const returned = controls.querySelector('[name="returned"]').checked;
    const parts = controls.querySelector('[name="part"]').checked ? -200 : 0;
    const platform = controls.querySelector('select').value;
    const personal = platform === 'ebay';
    const collected = platform === 'fb';
    let fees = 0;
    if (personal) fees = -Number(card.dataset.privateFee);
    if (platform === 'depop' && !returned) fees = -Number(card.dataset.depopFee);
    if (platform === 'ebay_biz') fees = -36 - Number(card.dataset.fee) + (returned ? Number(card.dataset.credit) : 0);
    // Private eBay's displayed price includes the buyer's protection charge.
    const refund = returned ? -(3200 + (personal ? fees : 0)) : 0;
    const packing = collected ? 0 : -50;
    const postage = returned && !collected ? -350 : 0;
    card.querySelector('[data-price-label]').textContent = personal ? 'Buyer-facing price' : 'Sale price';
    card.querySelector('[data-fee-label]').textContent = personal ? 'Buyer protection' : 'Marketplace fees';
    const stock = returned ? 850 - parts : 0;
    const total = 3200 - 850 + packing + parts + fees + refund + postage + stock;
    for (const [key, amount] of Object.entries({parts, fees, packing, refund, postage, stock, total})) {
      card.querySelector('[data-value="' + key + '"]').textContent = money(amount);
    }
    card.querySelector('[data-result-label]').textContent = total < 0 ? 'Loss' : 'Profit';
    card.classList.toggle('has-loss', total < 0);
  }
  controls.addEventListener('change', update);
  controls.hidden = false;
  update();
})();
