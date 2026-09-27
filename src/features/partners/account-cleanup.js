/* RETRADE partner account cleanup v1.4.91
 * Removes legacy stock KPI blocks and the Partner summary "Stock on hand" card.
 * Account-only observer: this module no longer watches every DOM mutation in the app.
 */
(function(){
  'use strict';
  if(window.__rtPartnerAccountCleanup1491)return;
  window.__rtPartnerAccountCleanup1491=true;

  var queued=false,observer=null;
  function txt(el){return String(el&&el.textContent||'').replace(/\s+/g,' ').trim();}
  function activePage(){var page=document.getElementById('p-item');return page&&page.classList.contains('on')?page:null;}
  function mark(el){if(!el||el.closest('.account-group,.rt-partner-v4-navrow'))return;el.classList.add('rt-partner-legacy-stock-hidden');}
  function nearestLegacyCard(el,pattern,maxChars){
    if(!el)return null;
    var explicit=el.closest('.account-stock-kpi,.account-stock-money,.kpi-card,.stat-card,.metric-card,.summary-card,[class*="stock-kpi"],[class*="stock-summary"]');
    if(explicit&&!explicit.closest('.rt-partner-summary-v3'))return explicit;
    var node=el,best=el;
    for(var depth=0;depth<5&&node&&node.parentElement;depth++){
      var parent=node.parentElement;if(parent.classList&&parent.classList.contains('rt-partner-summary-v3'))break;if(parent.classList&&parent.classList.contains('account-group'))break;
      var t=txt(parent);if(!pattern.test(t)||t.length>(maxChars||260))break;best=parent;node=parent;
    }
    return best;
  }
  function removeSummaryStockCard(page){
    var summary=page.querySelector('.rt-partner-summary-v3');if(!summary)return;
    summary.querySelectorAll('.rt-partner-summary-v3-card').forEach(function(card){
      var label=txt(card.querySelector('.rt-partner-summary-v3-label')).toLowerCase(),kind=String(card.getAttribute('data-kind')||'').toLowerCase(),body=txt(card).toLowerCase();
      if(kind==='stock'||label==='stock on hand'||(/\blisted\b/.test(body)&&/\bunlisted\b/.test(body)&&/\breturned\b/.test(body)))card.remove();
    });
    var grid=summary.querySelector('.rt-partner-summary-v3-grid');if(grid){grid.classList.add('rt-partner-finance-only-grid');grid.setAttribute('data-card-count',String(grid.querySelectorAll('.rt-partner-summary-v3-card').length));}
  }
  function clean(){
    queued=false;var page=activePage();if(!page||page.hasAttribute('data-rt-account-transition')||!page.querySelector('.rt-partner-summary-v3'))return;
    removeSummaryStockCard(page);page.querySelectorAll('.account-stock-kpi,.account-stock-money').forEach(mark);
    var all=page.querySelectorAll('div,section,article,span');
    for(var i=0;i<all.length;i++){
      var el=all[i];if(el.closest('.rt-partner-summary-v3,.account-group,.rt-partner-v4-navrow'))continue;
      var t=txt(el);
      if(/^stock on hand$/i.test(t))mark(nearestLegacyCard(el,/\bstock on hand\b/i,220));
      else if(/^stock cost\b/i.test(t)||(/\bstock cost\b/i.test(t)&&/\blisted asking\b/i.test(t)))mark(nearestLegacyCard(el,/\bstock cost\b/i,340));
    }
  }
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(function(){requestAnimationFrame(clean);});}
  function start(){
    if(!document.getElementById('rt-partner-account-cleanup-style')){var s=document.createElement('style');s.id='rt-partner-account-cleanup-style';s.textContent='.rt-partner-legacy-stock-hidden{display:none!important}.rt-partner-finance-only-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}';document.head.appendChild(s);}
    schedule();if(observer)return;var page=document.getElementById('p-item');if(page){observer=new MutationObserver(schedule);observer.observe(page,{childList:true,subtree:true});}
    window.addEventListener('hashchange',schedule);window.addEventListener('popstate',schedule);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  console.info('[RETRADE] v1.4.91 scoped partner cleanup loaded');
  (window.__rtPartnerRenderFinalizers=window.__rtPartnerRenderFinalizers||[]).push(clean);
})();