/* RETRADE partner account UI v1.4.92
 * Finance-first Partner detail normaliser, scoped to #p-item.
 * No whole-app MutationObserver: account work only runs while account DOM changes.
 */
(function(){
  'use strict';
  if(window.__rtPartnerAccountV4_1492)return;
  window.__rtPartnerAccountV4_1492=true;


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
    s.textContent='.rt-partner-v4-navrow{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;width:100%!important;box-sizing:border-box!important;margin:0 0 12px!important}.rt-partner-v4-navrow>.rt-partner-statement-btn{margin:0 0 0 auto!important;flex:0 0 auto!important}';
    document.head.appendChild(s);
  }
  function ensureTopNav(page){
    var back=findBack(page);if(!back)return;var row=back.closest('.rt-partner-v4-navrow');
    if(!row){var host=back.parentElement;if(!host)return;row=document.createElement('div');row.className='rt-partner-v4-navrow';host.insertBefore(row,back);row.appendChild(back);}
    var statement=page.querySelector('.rt-partner-statement-btn');if(statement&&statement.parentElement!==row)row.appendChild(statement);if(statement)statement.style.setProperty('margin-left','auto','important');
  }
  function fix(){installStyles();var page=activePage();if(page)ensureTopNav(page);}
  installStyles();
  console.info('[RETRADE] v1.4.92 sold/all-stock outstanding account normaliser loaded');
  (window.__rtPartnerRenderFinalizers=window.__rtPartnerRenderFinalizers||[]).push(fix);
})();