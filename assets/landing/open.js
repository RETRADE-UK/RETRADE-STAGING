(() => {
  const examples = document.querySelectorAll('.live-preview');
  function load(frame) {
    if (!frame.hasAttribute('src')) frame.src = frame.dataset.src;
  }
  const approaching = 'IntersectionObserver' in window && new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      load(entry.target);
      approaching.unobserve(entry.target);
    }
  }, { rootMargin: '180px 0px' });
  function watch(frame) {
    if (!frame.dataset.src) return;
    if (approaching) approaching.observe(frame);
    else load(frame);
  }
  function reset(example, immediate = false) {
    const frame = example.querySelector('iframe');
    // A new browsing context also clears the page's undo, form and scroll state.
    const next = frame.cloneNode(false);
    if (approaching) approaching.unobserve(frame);
    if (next.dataset.src) next.removeAttribute('src');
    if (immediate) {
      next.loading = 'eager';
      load(next);
    }
    frame.replaceWith(next);
    if (!immediate) watch(next);
  }
  for (const example of examples) {
    watch(example.querySelector('iframe'));
    example.querySelector('[data-reset]').addEventListener('click', () => reset(example, true));
  }
  window.addEventListener('pageshow', event => {
    if (event.persisted) examples.forEach(example => reset(example));
  });
})();
