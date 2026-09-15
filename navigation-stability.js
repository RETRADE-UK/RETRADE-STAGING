/* RETRADE navigation / spatial stability v1.0.1
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

  // RETRADE is an app surface, not a document viewer. Browser-level page zoom
  // makes controls drift and creates a web-page feel on iOS. Any surface that
  // genuinely needs zoom should implement it explicitly inside that component.
  try{
    var viewport=document.querySelector('meta[name="viewport"]');
    if(viewport){
      viewport.setAttribute('content','width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    }
  }catch(_){}

  // Route code owns scroll position. Native browser history restoration can run
  // after RETRADE has already painted a route and visibly move the interface.
  try{if('scrollRestoration' in history)history.scrollRestoration='manual';}catch(_){}

  var old=document.getElementById('rt-navigation-stability-css');
  if(old)old.remove();
  var style=document.createElement('style');
  style.id='rt-navigation-stability-css';
  style.textContent=[
    'html{-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-behavior:auto!important;}',
    'body{overscroll-behavior-y:none;}',
    '.rt .page{overflow-anchor:none;}',
    // Normal route activation must not translate/fade the entire page. We only
    // suppress the route animation itself; transforms used by explicit swipe /
    // gesture handling are intentionally left alone.
    '.rt .page.on{animation:none!important;}'
  ].join('\n');
  document.head.appendChild(style);

  console.info('[RETRADE] navigation spatial stability v1.0.1 loaded');
})();
