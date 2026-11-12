/* RETRADE partner account UI v1.4.92
 * Finance-first Partner detail normaliser, scoped to #p-item.
 * No whole-app MutationObserver: account work only runs while account DOM changes.
 */
(function(){
  'use strict';
  if(window.__rtPartnerAccountV4_1492)return;
  window.__rtPartnerAccountV4_1492=true;

  var queued=false,observer=null;
  function text(el){return String(el&&el.textContent||'').replace(/\s+/g,' ').trim();}
  function normaliseBackLabel(v){return String(v||'').replace(/\s+/g,' ').trim().toLowerCase().replace(/^[←‹<]\s*/,'');}
  function findBack(page){
    if(!page)return null;var controls=page.querySelectorAll('button,a');
    for(var i=0;i<controls.length;i++){
      var raw=text(controls[i]).toLowerCase(),clean=normaliseBackLabel(raw),meta=(raw+' '+String(controls[i].getAttribute('aria-label')||'')+' '+String(controls[i].getAttribute('title')||'')).toLowerCase();
      if(clean==='accounts'||clean==='account'||clean==='partners'||clean==='partner')return controls[i];
      if(raw==='back to accounts'||raw==='back to account'||raw==='back to partners'||raw==='back to partner')return controls[i];
      if(/\bback\b/.test(meta)&&/\b(account|accounts|partner|partners)\b/.test(meta))return controls[i];
    }
    return null;
  }
  function activePage(){var p=document.getElementById('p-item');return p&&p.classList.contains('on')&&!p.hasAttribute('data-rt-account-transition')&&(p.querySelector('.account-group')||p.querySelector('.rt-partner-summary-v3')||findBack(p))?p:null;}
  function installStyles(){
    if(document.getElementById('rt-partner-account-v4-style'))return;
    var s=document.createElement('style');s.id='rt-partner-account-v4-style';
    s.textContent='.rt-partner-v4-navrow{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;width:100%!important;box-sizing:border-box!important;margin:0 0 12px!important}.rt-partner-v4-navrow>.rt-partner-statement-btn{margin:0 0 0 auto!important;flex:0 0 auto!important}.rt-partner-v4-hidden{display:none!important}';
    document.head.appendChild(s);
  }
  function ensureTopNav(page){
    var back=findBack(page);if(!back)return;var row=back.closest('.rt-partner-v4-navrow');
    if(!row){var host=back.parentElement;if(!host)return;row=document.createElement('div');row.className='rt-partner-v4-navrow';host.insertBefore(row,back);row.appendChild(back);}
    var statement=page.querySelector('.rt-partner-statement-btn');if(statement&&statement.parentElement!==row)row.appendChild(statement);if(statement)statement.style.setProperty('margin-left','auto','important');
  }
  function removeLegacyAllocate(page){
    page.querySelectorAll('button,a').forEach(function(el){
      if(el.closest('.account-group,.rt-partner-v2-selection'))return;var label=text(el).toLowerCase(),action=String(el.getAttribute('onclick')||'').toLowerCase();
      if(/^allocate\s*&\s*settle\b/.test(label)||action.indexOf('_openconsignmentsettlementbuilder')!==-1||action.indexOf('settleallforaccount')!==-1){var p=el.parentElement;el.remove();if(p&&p!==page&&!p.children.length&&!text(p))p.remove();}
    });
  }

  function hideLegacyStock(page){
    page.querySelectorAll('.account-stock-kpi,.account-stock-money').forEach(function(el){el.classList.add('rt-partner-v4-hidden');});
    var re=/\b\d+\s+listed\s*[·•]\s*\d+\s+unlisted(?:\s*[·•]\s*\d+\s+returned)?\b/i,best=null,bestLen=Infinity;
    page.querySelectorAll('div,section,article').forEach(function(el){if(el.closest('.rt-partner-summary-v3,.account-group,.rt-partner-v4-navrow,.rt-partner-v2-toolbar'))return;var t=text(el);if(re.test(t)&&t.length<bestLen&&t.length<200){best=el;bestLen=t.length;}});if(best)best.classList.add('rt-partner-v4-hidden');
  }

  function fix(){queued=false;installStyles();var page=activePage();if(!page)return;removeLegacyAllocate(page);ensureTopNav(page);hideLegacyStock(page);}
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(function(){requestAnimationFrame(fix);});}
  function start(){schedule();if(observer)return;var page=document.getElementById('p-item');if(page){observer=new MutationObserver(schedule);observer.observe(page,{childList:true,subtree:true});}window.addEventListener('hashchange',schedule);window.addEventListener('popstate',schedule);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  console.info('[RETRADE] v1.4.92 sold/all-stock outstanding account normaliser loaded');
  (window.__rtPartnerRenderFinalizers=window.__rtPartnerRenderFinalizers||[]).push(fix);
})();