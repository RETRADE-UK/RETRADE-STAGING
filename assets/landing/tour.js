/* Native scrolling while a gesture is active; one gentle correction on release.
 * Inline screenshots and ordinary anchors remain usable without JavaScript. */
(function () {
  const root = document.documentElement;
  const stories = [...document.querySelectorAll('.story')];
  const container = document.querySelector('.screens');
  const caption = document.querySelector('[data-caption]');
  const full = document.querySelector('[data-full]');
  const links = [...document.querySelectorAll('.jump a')];
  if (!container || !stories.length) return;

  const desktop = matchMedia('(min-width: 900px) and (min-height: 540px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const panes = [];
  const keys = new Set();
  const scrollKeys = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ']);
  const quietTime = 180;
  let stops = [];
  let current = -1;
  let frame = 0;
  let motion = 0;
  let animatedY = scrollY;
  let timer = 0;
  let idleTimer = 0;
  let idleY = scrollY;
  let keyboardInput = false;
  let interruptedGesture = false;
  let measuring = false;
  let pending = false;
  let touching = false;
  let pointing = false;
  let startY = scrollY;
  let lastInput = 0;
  let lastScroll = 0;
  let width = innerWidth;

  function viewportHeight() {
    return window.visualViewport ? visualViewport.height : innerHeight;
  }
  function nearest(y) {
    let best;
    for (const stop of stops) {
      const target = Math.max(stop.from, Math.min(stop.to, y));
      const distance = Math.abs(target - y);
      if (!best || distance < best.distance) best = {stop, target, distance};
    }
    return best;
  }
  function setCurrent(index) {
    if (index === current) return;
    current = index;
    panes.forEach((pane, i) => {
      pane.classList.toggle('current', index === i);
      pane.setAttribute('aria-hidden', String(index !== i));
    });
    links.forEach((link, i) => {
      if (index === i) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    const label = stories[index].querySelector('.kicker').textContent;
    caption.textContent = label;
    full.href = stories[index].querySelector('img').src;
    full.setAttribute('aria-label', 'Open ' + label.toLowerCase() + ' screenshot at full size');
  }
  function measure() {
    const height = viewportHeight();
    const inset = Math.max(16, Math.min(28, height * 0.03));
    const available = height - inset * 2;
    const limit = Math.max(0, root.scrollHeight - innerHeight);
    const next = [];
    function add(index, from, to = from) {
      next.push({index, from:Math.max(0, Math.min(limit, from)), to:Math.max(0, Math.min(limit, to))});
    }
    stories.forEach((story, index) => {
      const copy = story.querySelector('.story-copy').getBoundingClientRect();
      const top = copy.top + scrollY;
      if (desktop.matches && copy.height <= available) {
        add(index, top + copy.height / 2 - height / 2);
      } else {
        // Oversized copy is a readable interval, never a forced jump past text.
        add(index, top - inset, top - inset + Math.max(0, copy.height - available));
        if (!desktop.matches) {
          const figure = story.querySelector('figure').getBoundingClientRect();
          if (figure.bottom - copy.top > available) {
            const figureTop = figure.top + scrollY;
            if (figure.height > available) {
              add(index, figureTop - inset, figureTop + figure.height - height + inset);
            } else {
              add(index, figureTop + figure.height / 2 - height / 2);
            }
          }
        }
      }
    });
    stops = next.sort((a, b) => a.from - b.from);
  }
  function update() {
    frame = 0;
    if (measuring) { measure(); measuring = false; }
    const active = nearest(scrollY);
    if (active) setCurrent(active.stop.index);
  }
  function requestUpdate(remeasure = false) {
    measuring = measuring || remeasure;
    if (!frame) frame = requestAnimationFrame(update);
  }
  function cancelMotion() {
    cancelAnimationFrame(motion);
    motion = 0;
    root.classList.remove('tour-settling');
  }
  function cancel() {
    clearTimeout(timer);
    clearTimeout(idleTimer);
    pending = false;
    interruptedGesture = false;
    cancelMotion();
    idleY = scrollY;
  }
  function moveTo(target) {
    cancel();
    const from = scrollY;
    animatedY = from;
    const distance = target - from;
    if (Math.abs(distance) < 1) return;
    if (reduced.matches) {
      scrollTo({top:target, behavior:'instant'});
      return;
    }
    const duration = Math.min(460, 240 + Math.abs(distance) * 0.22);
    const began = performance.now();
    root.classList.add('tour-settling');
    function step(now) {
      const progress = Math.min(1, (now - began) / duration);
      // Smooth acceleration and deceleration; new input cancels the next frame.
      const eased = progress * progress * (3 - 2 * progress);
      scrollTo({top:from + distance * eased, behavior:'instant'});
      animatedY = scrollY;
      if (progress < 1) motion = requestAnimationFrame(step);
      else { motion = 0; idleY = scrollY; root.classList.remove('tour-settling'); }
    }
    motion = requestAnimationFrame(step);
  }
  function settle() {
    if (!pending || touching || pointing || keys.size || motion) return;
    const remaining = quietTime - (performance.now() - Math.max(lastInput, lastScroll));
    if (remaining > 0) { timer = setTimeout(settle, remaining); return; }
    const interrupted = interruptedGesture;
    interruptedGesture = false;
    pending = false; // A correction must never schedule another correction.
    idleY = scrollY;
    if (reduced.matches || document.hidden || (window.visualViewport && Math.abs(visualViewport.scale - 1) > 0.01)) return;
    if (getSelection() && !getSelection().isCollapsed) return;
    measure();
    const y = scrollY;
    const travel = y - startY;
    const first = stops[0];
    const last = stops[stops.length - 1];
    const entry = Math.min(140, viewportHeight() * 0.18);
    if (!first || Math.abs(travel) < 2 || y < first.from - entry || y > last.to + entry) return;
    // Release the first/last frame in the direction the reader is leaving.
    if ((y < first.from && travel < 0) || (y > last.to && travel > 0)) return;
    let chosen = nearest(y);
    if (chosen.distance < 1) return;
    const origin = nearest(startY);
    const threshold = keyboardInput ? 2 : Math.max(44, viewportHeight() * 0.06);
    if (interrupted && Math.abs(travel) >= threshold && Math.sign(chosen.target - y) !== Math.sign(travel)) {
      // A new, deliberate gesture wins over the animation it interrupted.
      const next = travel > 0
        ? stops.find(stop => stop.from > y)
        : [...stops].reverse().find(stop => stop.to < y);
      if (!next) return;
      chosen = {stop:next, target:travel > 0 ? next.from : next.to};
    } else if (origin.distance < 12 && chosen.stop === origin.stop && Math.abs(travel) >= threshold) {
      const next = stops[stops.indexOf(origin.stop) + Math.sign(travel)];
      if (!next) return;
      chosen = {stop:next, target:travel > 0 ? next.from : next.to};
    }
    moveTo(chosen.target);
  }
  function schedule() {
    clearTimeout(timer);
    if (pending) timer = setTimeout(settle, quietTime);
  }
  function input(fromKeyboard = false) {
    const now = performance.now();
    const interrupted = !!motion;
    cancelMotion();
    clearTimeout(idleTimer);
    // Passive input may arrive after the compositor has already scrolled.
    // Preserve the last quiet position instead of guessing from wheel deltas.
    if (!pending) {
      startY = interrupted ? animatedY : idleY;
      interruptedGesture = interrupted;
    }
    pending = true;
    keyboardInput = fromKeyboard;
    lastInput = now;
    schedule();
  }
  function layout() {
    if (desktop.matches && !panes.length) {
      for (const story of stories) {
        const image = story.querySelector('img').cloneNode();
        image.className = 'pane ' + story.dataset.screen;
        image.loading = 'eager';
        image.decoding = 'async';
        container.append(image);
        panes.push(image);
      }
      current = -1;
    }
    root.classList.toggle('sticky-tour', desktop.matches);
    requestUpdate(true);
  }

  addEventListener('scroll', () => {
    requestUpdate();
    if (motion) return;
    lastScroll = performance.now();
    if (pending) schedule();
    else {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { idleY = scrollY; }, quietTime);
    }
  }, {passive:true});
  addEventListener('wheel', event => {
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) { cancel(); return; }
    if (event.deltaY) input();
  }, {passive:true});
  addEventListener('touchstart', event => {
    touching = true;
    if (event.touches.length === 1) input();
    else cancel();
  }, {passive:true});
  addEventListener('touchmove', () => { lastInput = performance.now(); }, {passive:true});
  function endTouch(event) {
    touching = event.touches.length > 0;
    lastInput = performance.now();
    schedule();
  }
  addEventListener('touchend', endTouch, {passive:true});
  addEventListener('touchcancel', event => { endTouch(event); cancel(); }, {passive:true});
  addEventListener('pointerdown', event => {
    pointing = event.pointerType !== 'touch';
    // touchstart captures and cancels the animation before any native pan.
    if (pointing) cancel();
  }, {passive:true});
  addEventListener('pointerup', () => {
    if (pointing && !pending) idleY = scrollY;
    pointing = false;
    schedule();
  }, {passive:true});
  addEventListener('pointercancel', () => { pointing = false; }, {passive:true});
  addEventListener('keydown', event => {
    const editing = event.target.closest('input,textarea,select,[contenteditable="true"]');
    if (scrollKeys.has(event.key) && !editing && !event.altKey && !event.ctrlKey && !event.metaKey) {
      keys.add(event.key);
      input(true);
    } else cancel();
  });
  addEventListener('keyup', event => {
    if (keys.delete(event.key)) { lastInput = performance.now(); schedule(); }
  });
  addEventListener('blur', () => { keys.clear(); touching = pointing = false; cancel(); });
  addEventListener('resize', () => {
    if (width !== innerWidth || motion) cancel();
    width = innerWidth;
    requestUpdate(true);
  });
  if (window.visualViewport) visualViewport.addEventListener('resize', () => requestUpdate(true));
  addEventListener('pageshow', () => { cancel(); requestUpdate(true); });
  addEventListener('popstate', cancel);
  addEventListener('hashchange', cancel);
  document.addEventListener('visibilitychange', cancel);
  document.addEventListener('focusin', cancel);
  document.addEventListener('click', cancel);
  reduced.addEventListener('change', cancel);
  desktop.addEventListener('change', () => { cancel(); layout(); });
  links.forEach((link, index) => link.addEventListener('click', event => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    measure();
    const stop = stops.find(stop => stop.index === index);
    if (location.hash !== link.hash) history.pushState(null, '', link.hash);
    stories[index].focus({preventScroll:true});
    moveTo(stop.from);
  }));
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => requestUpdate(true));
    stories.forEach(story => observer.observe(story));
  }
  document.querySelectorAll('.hero img,.story img').forEach(image => image.addEventListener('load', () => requestUpdate(true)));
  layout();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration('/').then(reg => reg && reg.update()).catch(() => {});
  }
})();
