/* The original chapter images remain visible inline on small screens and without JS. */
(function () {
  const stories = [...document.querySelectorAll('.story')];
  const container = document.querySelector('.screens');
  const caption = document.querySelector('[data-caption]');
  const links = [...document.querySelectorAll('.jump a')];
  if (!container || !('IntersectionObserver' in window)) return;

  const desktop = matchMedia('(min-width: 900px) and (min-height: 540px)');
  const panes = [];
  function setCurrent(index) {
    panes.forEach((pane, i) => pane.classList.toggle('current', index === i));
    links.forEach((link, i) => {
      if (index === i) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    const label = stories[index].querySelector('.kicker').textContent;
    caption.textContent = label;
    const full = document.querySelector('[data-full]');
    full.href = stories[index].querySelector('img').src;
    full.setAttribute('aria-label', 'Open ' + label.toLowerCase() + ' screenshot at full size');
  }
  function update() {
    const mid = innerHeight * 0.5;
    let index = 0;
    for (let i = 1; i < stories.length; i++) {
      if (stories[i].getBoundingClientRect().top <= mid) index = i;
    }
    setCurrent(index);
  }
  function layout() {
    if (desktop.matches && !panes.length) {
      for (const story of stories) {
        const image = story.querySelector('img').cloneNode();
        image.alt = '';
        image.className = 'pane ' + story.dataset.screen;
        container.append(image);
        panes.push(image);
      }
    }
    document.documentElement.classList.toggle('sticky-tour', desktop.matches);
    update();
  }
  layout();
  desktop.addEventListener('change', layout);
  const observer = new IntersectionObserver(update, {rootMargin:'-48% 0px -49% 0px'});
  stories.forEach(story => observer.observe(story));
  addEventListener('pageshow', update);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration('/').then(reg => reg && reg.update()).catch(() => {});
  }
})();
