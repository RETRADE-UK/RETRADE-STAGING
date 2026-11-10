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
    'html{-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-behavior:auto!important;overflow-anchor:none;}',
    // Exclude the whole app, not only its pages: otherwise a footer/chrome
    // anchor outside the page can pull the document as a disclosure expands.
    '.rt,.rt .page{overflow-anchor:none;}',
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

/* Persistent results-page search. Keep this in the critical navigation layer so
 * Enter search works before deferred features finish loading. Presentation only:
 * the existing search, history, revenue and profit calculations remain owners. */
(function(){
  'use strict';
  if(typeof window.renderSearchResults!=='function'||window.renderSearchResults.__rtEditableSearch)return;
  var nativeRender=window.renderSearchResults;
  var style=document.createElement('style');
  style.id='rt-editable-search-css';
  style.textContent=[
    '#p-search .rt-results-search{display:flex;align-items:center;gap:8px;width:100%;min-width:0;margin:14px 0;box-sizing:border-box}',
    '#p-search .rt-results-search input{flex:1 1 0;width:0;min-width:0;min-height:44px;box-sizing:border-box;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font:inherit;font-size:16px;line-height:1.4;-webkit-appearance:none;appearance:none}',
    '#p-search .rt-results-search input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
    '#p-search .rt-results-search button{flex:0 0 auto;min-height:44px;box-sizing:border-box;padding:10px 14px;font-size:14px;white-space:nowrap}',
    '#p-search .rt-results-search-empty{padding:20px 24px 0}'
  ].join('\n');
  document.head.appendChild(style);

  function createForm(){
    var form=document.createElement('form');
    form.className='rt-results-search';
    form.setAttribute('role','search');
    form.setAttribute('aria-label','Search inventory');
    form.setAttribute('data-testid','search-results-form');
    var input=document.createElement('input');
    input.id='search-results-query';
    input.name='search-results-query';
    input.type='search';
    input.placeholder='Search items…';
    input.setAttribute('aria-label','Search items');
    input.setAttribute('enterkeyhint','search');
    input.setAttribute('autocomplete','off');
    input.setAttribute('autocorrect','off');
    input.setAttribute('autocapitalize','off');
    input.setAttribute('spellcheck','false');
    input.setAttribute('data-lpignore','true');
    input.setAttribute('data-form-type','other');
    var submit=document.createElement('button');
    submit.type='submit';
    submit.className='btn btn-secondary';
    submit.textContent='Search';
    form.appendChild(input);
    form.appendChild(submit);
    var composing=false;
    input.addEventListener('compositionstart',function(){composing=true;});
    input.addEventListener('compositionend',function(){composing=false;});
    form.addEventListener('submit',function(event){
      event.preventDefault();
      if(composing)return;
      var query=input.value.trim();
      if(!query){input.focus();return;}
      input.value=query;
      ['global-search','global-search-mobile','side-nav-global-search'].forEach(function(id){
        var field=document.getElementById(id);if(field)field.value=query;
      });
      // Re-use the real route: repeated searches keep the original Back target
      // and history, and calculate revenue/profit from the same filtered items.
      window.openSearchPage(query);
    });
    return form;
  }

  function render(q){
    var page=document.getElementById('p-search');
    if(!page)return nativeRender.apply(this,arguments);
    var source=document.getElementById('global-search');
    var query=q===undefined?(source?source.value.trim():''):String(q||'');
    var form=page.querySelector('[data-testid="search-results-form"]');
    var input=form&&form.querySelector('input');
    var focused=!!input&&document.activeElement===input;
    var selection=focused?[input.selectionStart,input.selectionEnd,input.selectionDirection]:null;
    var keepDraft=!!form&&form.dataset.query===query;
    var result=nativeRender.apply(this,arguments);
    form=form||createForm();
    input=form.querySelector('input');
    if(!keepDraft)input.value=query;
    form.dataset.query=query;
    var summary=page.querySelector('[data-testid="search-results-summary"]');
    if(summary){summary.parentNode.insertBefore(form,summary);}
    else{
      var holder=document.createElement('div');holder.className='rt-results-search-empty';
      holder.appendChild(form);page.insertBefore(holder,page.firstChild);
    }
    // A data refresh re-renders results; preserve the user's in-progress edit
    // and caret rather than replacing it with the last submitted query.
    if(focused){
      input.focus({preventScroll:true});
      if(keepDraft&&selection&&selection[0]!=null){
        try{input.setSelectionRange(selection[0],selection[1],selection[2]);}catch(_){}
      }
    }
    return result;
  }
  render.__rtEditableSearch=true;
  window.renderSearchResults=render;
  var page=document.getElementById('p-search');
  if(page&&page.classList.contains('on'))render();
})();
