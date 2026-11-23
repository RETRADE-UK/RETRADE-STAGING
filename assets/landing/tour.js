/* Native scrolling reveals a steady product stage; tabs move along the same tour. */
(() => {
  'use strict';
  const root = document.documentElement;
  const deck = document.querySelector('.tour-deck');
  if (!deck) return;
  const stage = deck.querySelector('.tour-stage');
  const controls = deck.querySelector('.tour-controls');
  const rail = deck.querySelector('.jump');
  const tabs = [...rail.querySelectorAll('a')];
  const panels = [...deck.querySelectorAll('.story')];
  const previews = 'IntersectionObserver' in window && new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting || entry.target.hidden) continue;
      entry.target.classList.add('preview-ready');
      previews.unobserve(entry.target);
    }
  }, {rootMargin:'180px 0px'});
  const previous = deck.querySelector('[data-prev]');
  const next = deck.querySelector('[data-next]');
  const count = deck.querySelector('[data-slide-count]');
  const status = deck.querySelector('[data-slide-status]');
  const indicator = rail.querySelector('.tab-indicator');
  const viewport = deck.querySelector('.slides');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const viewer = document.getElementById('screen-viewer');
  const viewerImage = viewer.querySelector('img');
  const viewerTitle = viewer.querySelector('#viewer-title');
  const viewerOriginal = viewer.querySelector('[data-view-original]');
  const viewportProbe = document.createElement('div');
  viewportProbe.setAttribute('aria-hidden', 'true');
  viewportProbe.style.cssText = 'position:absolute;pointer-events:none;visibility:hidden;width:0;height:100vh;height:100svh;top:0;left:0';
  deck.append(viewportProbe);
  let current = 0;
  let layout = {pinned:false, start:0, step:0, inset:12};
  let animation = null;
  let navigation = null;
  let navigationTimer = 0;
  let scrollFrame = 0;
  let resizeFrame = 0;
  let gesture = null;
  let suppressClickUntil = 0;
  let returnFocus = null;
  let lastHash = location.hash;

  const hashIndex = () => panels.findIndex(panel => '#' + panel.id === location.hash);
  const clampIndex = index => Math.max(0, Math.min(panels.length - 1, index));

  function focusTab(index) {
    tabs.forEach((tab, i) => { tab.tabIndex = !layout.pinned || i === index ? 0 : -1; });
  }
  function placeIndicator() {
    const parent = rail.getBoundingClientRect();
    const active = tabs[current].getBoundingClientRect();
    indicator.style.width = active.width + 'px';
    indicator.style.transform = 'translateX(' + (active.left - parent.left - rail.clientLeft) + 'px)';
  }
  function writeHash(index, method = 'replaceState') {
    const hash = index < 0 ? '' : '#' + panels[index].id;
    if (location.hash !== hash) window.history[method](null, '', location.pathname + location.search + hash);
    lastHash = location.hash;
  }
  function select(index, {animate = true, announce = false} = {}) {
    if (index < 0 || index >= panels.length) return;
    const old = current;
    const focused = document.activeElement;
    const focusInOutgoing = layout.pinned && old !== index && panels[old].contains(focused);
    current = index;
    if (animation) { animation.cancel(); animation = null; }
    panels.forEach((panel, i) => {
      const active = i === current;
      const hidden = layout.pinned && !active;
      panel.hidden = hidden;
      panel.inert = hidden;
      if (!previews || (active && old !== current)) panel.classList.add('preview-ready');
      if (previews) {
        if (hidden) previews.unobserve(panel);
        else if (!panel.classList.contains('preview-ready')) previews.observe(panel);
      }
      panel.setAttribute('aria-hidden', String(hidden));
      if (layout.pinned) tabs[i].setAttribute('aria-selected', String(active));
      else tabs[i].removeAttribute('aria-selected');
      if (active) tabs[i].setAttribute('aria-current', 'step');
      else tabs[i].removeAttribute('aria-current');
    });
    focusTab(current);
    previous.disabled = current === 0;
    next.disabled = current === panels.length - 1;
    if (focusInOutgoing) panels[current].focus({preventScroll:true});
    else if ((focused === previous && previous.disabled) || (focused === next && next.disabled)) {
      tabs[current].focus({preventScroll:true});
    }
    count.textContent = (current + 1) + ' / ' + panels.length;
    if (announce) status.textContent = tabs[current].getAttribute('aria-label') + ', stage ' + (current + 1) + ' of ' + panels.length + '.';
    placeIndicator();
    if (layout.pinned && animate && old !== current && !reduced.matches && panels[current].animate) {
      // Follow the page's vertical direction. The larger, still restrained
      // reveal reads as the next chapter below (or the previous one above),
      // without moving the screenshot sideways or driving the native scroll.
      const motion = panels[current].animate([
        {opacity:0, transform:'translate3d(0,' + (current > old ? 44 : -44) + 'px,0)'},
        {opacity:1, transform:'translate3d(0,0,0)'}
      ], {duration:400, easing:'cubic-bezier(.22,.61,.36,1)'});
      animation = motion;
      motion.onfinish = () => { if (animation === motion) animation = null; };
    }
  }

  function stopNavigation(interrupt = false) {
    if (interrupt && navigation) scrollTo({top:scrollY, behavior:'instant'});
    navigation = null;
    clearTimeout(navigationTimer);
  }
  function refreshOrigin() {
    layout.start = deck.getBoundingClientRect().top + scrollY - layout.inset;
  }
  function destination(index) {
    refreshOrigin();
    if (layout.pinned) return layout.start + (index + .25) * layout.step;
    return Math.max(0, panels[index].getBoundingClientRect().top + scrollY - controls.offsetHeight - layout.inset - 16);
  }
  function navigate(index, {history = true, instant = false, focus = false, announce = true} = {}) {
    if (index < 0 || index >= panels.length) return;
    panels[index].classList.add('preview-ready');
    stopNavigation(true);
    select(index, {animate:!instant, announce});
    if (history) writeHash(index, 'pushState');
    const top = destination(index);
    if (Math.abs(top - scrollY) > 2) {
      const pending = {index, top};
      navigation = pending;
      // The pinned scene supplies the visual transition. Moving the underlying
      // track directly avoids a competing browser scroll animation on tab clicks.
      scrollTo({top, behavior:'instant'});
      if (Math.abs(scrollY - top) <= 2) stopNavigation();
      else navigationTimer = setTimeout(() => {
        if (navigation === pending) { stopNavigation(); syncScroll(); }
      }, 1800);
    }
    if (focus) requestAnimationFrame(() => {
      if (current === index && !viewer.open) panels[index].focus({preventScroll:true});
    });
  }
  function syncScroll() {
    scrollFrame = 0;
    if (viewer.open) return;
    refreshOrigin();
    if (navigation) {
      if (Math.abs(scrollY - navigation.top) > 2) return;
      stopNavigation();
    }
    let index = 0;
    if (layout.pinned) {
      const distance = scrollY - layout.start;
      index = clampIndex(Math.floor(distance / layout.step));
      // Tiny changes at a boundary should not flicker between two stages.
      if (index === current + 1 && distance < index * layout.step + 10) index = current;
      if (index === current - 1 && distance > current * layout.step - 10) index = current;
    } else {
      const readingLine = layout.inset + controls.offsetHeight + 32;
      panels.forEach((panel, i) => { if (panel.getBoundingClientRect().top <= readingLine) index = i; });
    }
    if (index !== current) {
      select(index);
      writeHash(index);
    }
    // Returning to the introduction should also reload at the introduction.
    if (scrollY < layout.start - 2 && hashIndex() >= 0) writeHash(-1);
  }
  function scheduleScroll() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(syncScroll);
  }
  function measure(preserve = false) {
    resizeFrame = 0;
    const viewHeight = viewportProbe.offsetHeight || innerHeight;
    // Mobile browser chrome changes the visual viewport during a native swipe.
    // The stable small viewport keeps that gesture and its stage positions intact.
    if (preserve && layout.width === innerWidth && layout.height === viewHeight) return;
    refreshOrigin();
    const before = layout;
    const y = scrollY;
    const engaged = before.pinned
      ? y >= before.start - 2 && y <= before.start + before.step * panels.length + 2
      : deck.getBoundingClientRect().top <= before.inset && deck.getBoundingClientRect().bottom > before.inset;
    const phase = before.pinned ? (y - before.start) / before.step : current + .25;
    stopNavigation(true);
    if (animation) { animation.cancel(); animation = null; }
    let inset = innerWidth <= 600 ? 8 : 12;
    deck.style.setProperty('--tour-inset', inset + 'px');
    deck.style.removeProperty('--tour-copy-height');
    deck.classList.add('tour-pinned');
    // All grid panels reserve space, including the hidden ones. The screenshot
    // position therefore stays identical when the copy length changes.
    const copyHeight = Math.ceil(Math.max(...panels.map(panel => panel.querySelector('.story-copy').offsetHeight)));
    deck.style.setProperty('--tour-copy-height', copyHeight + 'px');
    const height = Math.ceil(stage.getBoundingClientRect().height);
    const pinned = height <= viewHeight - inset * 2;
    if (pinned) inset = Math.max(inset, Math.floor((viewHeight - height) / 2));
    deck.style.setProperty('--tour-inset', inset + 'px');
    const step = Math.max(360, Math.round(viewHeight * .8));
    deck.classList.toggle('tour-pinned', pinned);
    deck.style.setProperty('--tour-step', step + 'px');
    if (pinned) deck.style.height = (height + step * panels.length) + 'px';
    else deck.style.removeProperty('height');
    layout = {pinned, step, inset, width:innerWidth, height:viewHeight, start:deck.getBoundingClientRect().top + scrollY - inset};
    if (pinned) rail.setAttribute('role', 'tablist');
    else rail.removeAttribute('role');
    tabs.forEach((tab, index) => {
      if (pinned) tab.setAttribute('role', 'tab');
      else tab.removeAttribute('role');
      tab.setAttribute('aria-controls', panels[index].id);
      panels[index].setAttribute('role', pinned ? 'tabpanel' : 'region');
      panels[index].setAttribute('aria-labelledby', tab.id);
      panels[index].tabIndex = 0;
    });
    select(current, {animate:false});
    if (preserve && engaged) {
      const top = pinned && before.pinned
        ? layout.start + Math.max(0, Math.min(panels.length, phase)) * step
        : destination(current);
      if (Math.abs(top - scrollY) > 2) scrollTo({top, behavior:'instant'});
    }
    placeIndicator();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', event => {
      if (event.button || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      navigate(index);
    });
    tab.addEventListener('keydown', event => {
      if (!layout.pinned) return;
      let destination = index;
      if (event.key === 'ArrowRight') destination = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') destination = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') destination = 0;
      else if (event.key === 'End') destination = tabs.length - 1;
      else if (event.key === ' ') {
        event.preventDefault();
        navigate(index);
        return;
      } else return;
      event.preventDefault();
      focusTab(destination);
      tabs[destination].focus({preventScroll:true});
    });
  });
  rail.addEventListener('focusout', event => {
    if (!rail.contains(event.relatedTarget)) focusTab(current);
  });
  previous.addEventListener('click', () => navigate(current - 1));
  next.addEventListener('click', () => navigate(current + 1));

  // Vertical gestures always scroll the document. A deliberate horizontal swipe
  // is an additional shortcut to the next/previous position in the same tour.
  viewport.addEventListener('pointerdown', event => {
    if (!event.isPrimary || !['touch', 'pen'].includes(event.pointerType)) { gesture = null; return; }
    gesture = {id:event.pointerId, x:event.clientX, y:event.clientY};
  }, {passive:true});
  viewport.addEventListener('pointerup', event => {
    const start = gesture;
    gesture = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
    suppressClickUntil = performance.now() + 450;
    navigate(current + (dx < 0 ? 1 : -1));
  }, {passive:true});
  viewport.addEventListener('pointercancel', () => { gesture = null; }, {passive:true});
  viewport.addEventListener('click', event => {
    if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
  }, true);

  document.querySelectorAll('figure[data-detail-src]').forEach(figure => {
    const image = figure.querySelector('.screen-image');
    const choices = [...figure.querySelectorAll('[data-screen-view]')];
    const overviewAlt = image.alt;
    const group = figure.querySelector('.screen-views');
    const staticLabel = figure.querySelector('[data-screen-static-label]');
    if (group) group.hidden = false;
    if (staticLabel) staticLabel.hidden = true;
    choices.forEach(choice => choice.addEventListener('click', () => {
      const detail = choice.dataset.screenView === 'detail';
      const src = detail ? figure.dataset.detailSrc : figure.dataset.previewSrc;
      if (!src) return;
      image.src = src;
      image.alt = detail ? figure.dataset.detailAlt || overviewAlt : overviewAlt;
      choices.forEach(button => button.setAttribute('aria-pressed', String(button === choice)));
    }));
  });

  function openScreen(event) {
    if (event.button || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || !viewer.showModal) return;
    const trigger = event.currentTarget;
    const figure = trigger.closest('figure');
    const image = figure && figure.querySelector('.screen-image');
    if (!image) return;
    event.preventDefault();
    if (navigation) {
      const top = navigation.top;
      stopNavigation();
      scrollTo({top, behavior:'instant'});
    }
    const panel = trigger.closest('.story');
    const phone = figure.dataset.phoneSrc;
    // Preview captures are deliberately composed for their compact frames.
    // The link always keeps the complete original for full-screen reading.
    viewerImage.src = innerWidth <= 600 && phone ? phone : trigger.href;
    viewerImage.alt = image.alt;
    viewerTitle.textContent = figure.dataset.screenTitle ||
      (panel && tabs[panels.indexOf(panel)].getAttribute('aria-label')) || 'Product screen';
    viewerOriginal.href = viewerImage.src;
    returnFocus = trigger;
    viewer.showModal();
    viewer.querySelector('.viewer-content').scrollTop = 0;
    root.classList.add('screen-open');
  }
  document.querySelectorAll('[data-open-screen]').forEach(link => link.addEventListener('click', openScreen));
  viewer.querySelector('[data-close-viewer]').addEventListener('click', () => viewer.close());
  viewer.addEventListener('click', event => {
    if (event.target !== viewer) return;
    const box = viewer.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) viewer.close();
  });
  viewer.addEventListener('close', () => {
    root.classList.remove('screen-open');
    const openerPanel = returnFocus && returnFocus.closest('.story');
    if (returnFocus && returnFocus.isConnected && (!openerPanel || openerPanel === panels[current]) && !returnFocus.closest('[hidden]')) returnFocus.focus({preventScroll:true});
    else tabs[current].focus({preventScroll:true});
    returnFocus = null;
    scheduleScroll();
  });

  function restoreHash() {
    if (lastHash === location.hash) return;
    lastHash = location.hash;
    const index = hashIndex();
    if (index >= 0) {
      navigate(index, {history:false, instant:true, focus:!viewer.open, announce:false});
    } else {
      stopNavigation(true);
      if (!location.hash || location.hash === '#tour') select(0, {animate:false});
    }
  }
  addEventListener('popstate', restoreHash);
  addEventListener('hashchange', restoreHash);
  addEventListener('scroll', scheduleScroll, {passive:true});
  addEventListener('scrollend', scheduleScroll, {passive:true});
  const interruptNavigation = () => { if (navigation) stopNavigation(true); };
  addEventListener('wheel', interruptNavigation, {passive:true});
  addEventListener('touchmove', interruptNavigation, {passive:true});
  const interruptUnlessOpening = event => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-open-screen]')) interruptNavigation();
  };
  addEventListener('touchstart', interruptUnlessOpening, {passive:true});
  addEventListener('pointerdown', interruptUnlessOpening, {passive:true});
  addEventListener('keydown', event => {
    if (!event.defaultPrevented && !rail.contains(event.target) &&
        ['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key)) interruptNavigation();
  });
  addEventListener('resize', () => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(() => measure(true));
  }, {passive:true});
  addEventListener('blur', () => { gesture = null; });
  reduced.addEventListener('change', () => {
    if (animation) { animation.cancel(); animation = null; }
    if (navigation) navigate(navigation.index, {history:false, instant:true, announce:false});
  });
  if ('ResizeObserver' in window) new ResizeObserver(placeIndicator).observe(rail);

  root.classList.add('tour-ready');
  deck.querySelector('.slide-actions').hidden = false;
  indicator.hidden = false;
  const initial = hashIndex();
  current = initial >= 0 ? initial : 0;
  measure();
  if (initial >= 0) requestAnimationFrame(() => requestAnimationFrame(() => {
    navigate(initial, {history:false, instant:true, announce:false});
  }));
})();
