(() => {
  const examples = document.querySelectorAll('.live-preview');
  function reset(example, immediate = false) {
    const frame = example.querySelector('iframe');
    // A new browsing context also clears the page's undo, form and scroll state.
    const next = frame.cloneNode(false);
    if (immediate) next.loading = 'eager';
    frame.replaceWith(next);
  }
  for (const example of examples) {
    example.querySelector('[data-reset]').addEventListener('click', () => reset(example, true));
  }
  window.addEventListener('pageshow', event => {
    if (event.persisted) examples.forEach(example => reset(example));
  });
})();
