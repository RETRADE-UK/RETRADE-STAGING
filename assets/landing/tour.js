/* One explicit slide at a time. Vertical page scrolling always stays native. */
(() => {
  'use strict';
  const root = document.documentElement;
  const deck = document.querySelector('.tour-deck');
  if (!deck) return;
  const rail = deck.querySelector('.jump');
  const tabs = [...rail.querySelectorAll('a')];
  const panels = [...deck.querySelectorAll('.story')];
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
  let current = 0;
  let animation = null;
  let gesture = null;
  let suppressClickUntil = 0;
  let returnFocus = null;
  let lastHash = location.hash;

  function focusTab(index) {
    tabs.forEach((tab, i) => { tab.tabIndex = i === index ? 0 : -1; });
  }
  function placeIndicator() {
    const parent = rail.getBoundingClientRect();
    const active = tabs[current].getBoundingClientRect();
    indicator.style.width = active.width + 'px';
    indicator.style.transform = 'translateX(' + (active.left - parent.left - rail.clientLeft) + 'px)';
  }
  function alignDeck(instant = false) {
    const inset = innerWidth <= 600 ? 8 : 12;
    const top = Math.max(0, deck.getBoundingClientRect().top + scrollY - inset);
    if (Math.abs(top - scrollY) > 2) {
      scrollTo({top, behavior:instant || reduced.matches ? 'instant' : 'smooth'});
    }
  }
  function select(index, {history = false, align = false, animate = true, announce = true} = {}) {
    if (index < 0 || index >= panels.length) return;
    const old = current;
    const focused = document.activeElement;
    const focusInOutgoing = old !== index && panels[old].contains(focused);
    current = index;
    if (animation) { animation.cancel(); animation = null; }
    panels.forEach((panel, i) => {
      const active = i === current;
      panel.hidden = !active;
      panel.inert = !active;
      panel.setAttribute('aria-hidden', String(!active));
      tabs[i].setAttribute('aria-selected', String(active));
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
    if (announce) status.textContent = tabs[current].getAttribute('aria-label') + ', slide ' + (current + 1) + ' of ' + panels.length + '.';
    if (history && location.hash !== '#' + panels[current].id) {
      window.history.pushState(null, '', '#' + panels[current].id);
      lastHash = location.hash;
    }
    placeIndicator();
    // Only the incoming panel exists in the interaction/accessibility tree.
    if (animate && old !== current && !reduced.matches && panels[current].animate) {
      const motion = panels[current].animate([
        {opacity:0, transform:'translate3d(' + (current > old ? 16 : -16) + 'px,0,0)'},
        {opacity:1, transform:'translate3d(0,0,0)'}
      ], {duration:320, easing:'cubic-bezier(.22,.61,.36,1)'});
      animation = motion;
      motion.onfinish = () => { if (animation === motion) animation = null; };
    }
    if (align) alignDeck();
  }

  rail.setAttribute('role', 'tablist');
  tabs.forEach((tab, index) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[index].id);
    panels[index].setAttribute('role', 'tabpanel');
    panels[index].setAttribute('aria-labelledby', tab.id);
    panels[index].tabIndex = 0;
    tab.addEventListener('click', event => {
      if (event.button || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      select(index, {history:true, align:true});
    });
    tab.addEventListener('keydown', event => {
      let destination = index;
      if (event.key === 'ArrowRight') destination = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') destination = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') destination = 0;
      else if (event.key === 'End') destination = tabs.length - 1;
      else if (event.key === ' ') {
        event.preventDefault();
        select(index, {history:true, align:true});
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
  previous.addEventListener('click', () => select(current - 1, {history:true, align:true}));
  next.addEventListener('click', () => select(current + 1, {history:true, align:true}));

  // A horizontal gesture changes one slide. Pan-y and pinch zoom stay native.
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
    select(current + (dx < 0 ? 1 : -1), {history:true, align:true});
  }, {passive:true});
  viewport.addEventListener('pointercancel', () => { gesture = null; }, {passive:true});
  viewport.addEventListener('click', event => {
    if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
  }, true);

  function openScreen(event) {
    if (event.button || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || !viewer.showModal) return;
    event.preventDefault();
    const panel = event.currentTarget.closest('.story');
    const image = panel.querySelector('.screen-image');
    viewerImage.src = image.currentSrc || image.src;
    viewerImage.alt = image.alt;
    viewerTitle.textContent = tabs[panels.indexOf(panel)].getAttribute('aria-label');
    viewerOriginal.href = viewerImage.src;
    returnFocus = event.currentTarget;
    viewer.showModal();
    viewer.querySelector('.viewer-content').scrollTop = 0;
    root.classList.add('screen-open');
  }
  deck.querySelectorAll('[data-open-screen]').forEach(link => link.addEventListener('click', openScreen));
  viewer.querySelector('[data-close-viewer]').addEventListener('click', () => viewer.close());
  viewer.addEventListener('click', event => {
    if (event.target !== viewer) return;
    const box = viewer.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) viewer.close();
  });
  viewer.addEventListener('close', () => {
    root.classList.remove('screen-open');
    if (returnFocus && returnFocus.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus({preventScroll:true});
    else tabs[current].focus({preventScroll:true});
    returnFocus = null;
  });

  function restoreHash() {
    if (lastHash === location.hash) return;
    lastHash = location.hash;
    const index = panels.findIndex(panel => '#' + panel.id === location.hash);
    if (index >= 0) {
      const keepViewerFocus = viewer.open;
      select(index, {animate:false, announce:false});
      requestAnimationFrame(() => {
        alignDeck(true);
        // WebKit can clear focus during same-document history restoration.
        // Wait until the revealed panel is laid out, and preserve modal focus.
        if (current === index && !keepViewerFocus && !viewer.open) panels[index].focus({preventScroll:true});
      });
    } else if (!location.hash || location.hash === '#tour') {
      select(0, {animate:false, announce:false});
    }
  }
  addEventListener('popstate', restoreHash);
  addEventListener('hashchange', restoreHash);
  addEventListener('resize', placeIndicator, {passive:true});
  addEventListener('blur', () => { gesture = null; });
  reduced.addEventListener('change', () => {
    if (animation) { animation.cancel(); animation = null; }
  });
  if ('ResizeObserver' in window) new ResizeObserver(placeIndicator).observe(rail);

  root.classList.add('tour-ready');
  deck.querySelector('.slide-actions').hidden = false;
  indicator.hidden = false;
  const initial = panels.findIndex(panel => '#' + panel.id === location.hash);
  select(initial >= 0 ? initial : 0, {animate:false, announce:false});
  if (initial >= 0) requestAnimationFrame(() => requestAnimationFrame(() => alignDeck(true)));
})();
