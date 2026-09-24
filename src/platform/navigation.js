/* RETRADE navigation / spatial stability v1.0.3
 *
 * This layer deliberately makes ordinary navigation visually boring.
 * Pages should appear in their final geometry, not animate themselves into
 * place, and the browser must not second-guess scroll position while a route is
 * rebuilding. Purpose-built motion (sheets, confirmations, charts, explicit
 * collapsibles and the gesture layer) remains owned by those components.
 *
 * No accounting, lifecycle, persistence, sync or Supabase behaviour is changed.
 */
(function(){
  'use strict';


  // Route code owns scroll position. Native browser history restoration can run
  // after RETRADE has already painted a route and visibly move the interface.
  try{if('scrollRestoration' in history)history.scrollRestoration='manual';}catch(_){}

  var old=document.getElementById('rt-navigation-stability-css');
  if(old)old.remove();
  var style=document.createElement('style');
  style.id='rt-navigation-stability-css';
  style.textContent=[
    'html{-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-behavior:auto!important;}',
    '.rt .page{overflow-anchor:none;}',
    // Keep fixed app chrome on the browser hit-testing path. Explicit touch
    // handling prevents Safari/Android gesture arbitration from delaying or
    // retargeting taps after a scroll.
    '.rt #bottom-nav,.rt #bottom-nav button,.rt .fab-dial,.rt .fab-dial button,.rt #search-fab{touch-action:manipulation;-webkit-tap-highlight-color:transparent;}',
    '.rt #bottom-nav,.rt .fab-dial,.rt #search-fab{isolation:isolate;}',
    // Navigation stays reachable above dismissible menus and their backdrops,
    // but remains below form/confirmation dialogs (400+).
    '.rt #bottom-nav,.rt #side-nav,.rt nav:not(#bottom-nav),.rt #mobile-top-bar{z-index:350;}',
    '.rt .fab-dial{z-index:360;}',
    '.rt #nav-search-expand{z-index:370;}',
    // Normal route activation must not translate/fade the entire page. We only
    // suppress the route animation itself; transforms used by explicit swipe /
    // gesture handling are intentionally left alone.
    '.rt .page.on{animation:none!important;}'
  ].join('\n');
  document.head.appendChild(style);

  console.info('[RETRADE] navigation spatial stability v1.0.2 loaded');
})();
