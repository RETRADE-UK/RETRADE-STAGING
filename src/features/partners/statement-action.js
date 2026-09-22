/* RETRADE partner statement action v1.5.00
 * Keeps Statement in the same top navigation row as the live ← Accounts control.
 * Lazily loads the statement engine plus adjustment-aware PDF/Excel/CSV output.
 */
(function(){
  'use strict';

  var activeAccountId=null;
  var statementLoader=null;
  var repairQueued=false;
  var observer=null;

  function compact(el){return String(el&&el.textContent||'').replace(/\s+/g,' ').trim();}
  function accountById(id){try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}catch(_){return null;}}
  function normaliseBackLabel(value){return String(value||'').replace(/\s+/g,' ').trim().toLowerCase().replace(/^[←‹<]\s*/, '');}
  function findBackControl(page){
    if(!page)return null;
    var controls=page.querySelectorAll('button,a');
    for(var i=0;i<controls.length;i++){
      var raw=compact(controls[i]).toLowerCase(),clean=normaliseBackLabel(raw),meta=(raw+' '+String(controls[i].getAttribute('aria-label')||'')+' '+String(controls[i].getAttribute('title')||'')).toLowerCase();
      if(clean==='accounts'||clean==='account'||clean==='partners'||clean==='partner')return controls[i];
      if(raw==='back to accounts'||raw==='back to account'||raw==='back to partners'||raw==='back to partner')return controls[i];
      if(/\bback\b/.test(meta)&&/\b(account|accounts|partner|partners)\b/.test(meta))return controls[i];
    }
    return null;
  }
  function isAccountDetail(page){if(!page||!page.classList.contains('on'))return false;try{if(typeof _itemPageOrigin!=='undefined'&&_itemPageOrigin==='p-account-detail')return false;}catch(_){}return !!(findBackControl(page)||page.querySelector('.account-group'));}
  function accountFromPage(page){
    var known=accountById(activeAccountId);if(known)return known;if(!page)return null;
    var tagged=page.querySelector('[data-account-id],[data-accountid]');if(tagged){var taggedId=tagged.getAttribute('data-account-id')||tagged.getAttribute('data-accountid'),taggedAcct=accountById(taggedId);if(taggedAcct)return taggedAcct;}
    var link=page.querySelector('.account-group [data-itemid][data-month]');if(link){try{var month=link.getAttribute('data-month'),itemId=link.getAttribute('data-itemid'),list=(typeof DB!=='undefined'&&DB&&Array.isArray(DB[month]))?DB[month]:[],item=list.find(function(x){return x&&String(x.id)===String(itemId);});if(item&&item.accountId!=null){var a=accountById(item.accountId);if(a)return a;}}catch(_){} }
    var heading=page.querySelector('.page-title,h1,h2,h3'),headingText=compact(heading).toLowerCase();if(headingText){try{var matches=(_accounts||[]).filter(function(a){var name=String(a&&a.name||'').replace(/\s+/g,' ').trim().toLowerCase();return !!name&&(headingText===name||headingText.indexOf(name)!==-1||name.indexOf(headingText)!==-1);});if(matches.length===1)return matches[0];}catch(_){} }
    return null;
  }

  function installStyle(){if(document.getElementById('rt-partner-statement-nav-style'))return;var s=document.createElement('style');s.id='rt-partner-statement-nav-style';s.textContent='.rt-partner-v4-navrow{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;width:100%!important;box-sizing:border-box!important;margin:0 0 12px!important}.rt-partner-v4-navrow>.rt-partner-statement-btn{margin:0 0 0 auto!important;flex:0 0 auto!important}';document.head.appendChild(s);}
  function ensureNavRow(page,back){if(!page||!back)return null;var row=back.closest('.rt-partner-v4-navrow');if(row)return row;var host=back.parentElement;if(!host)return null;row=document.createElement('div');row.className='rt-partner-v4-navrow';host.insertBefore(row,back);row.appendChild(back);return row;}

  function loadAdjustmentExporter(resolve,reject){
    if(window.__rtPartnerAdjustmentStatementExportersReady){resolve();return;}
    var old=document.getElementById('rt-partner-adjustment-statement-exporters');
    if(old){old.addEventListener('load',function(){window.__rtPartnerAdjustmentStatementExportersReady?resolve():reject(new Error('Adjustment statement exporters did not initialise'));},{once:true});old.addEventListener('error',reject,{once:true});return;}
    var script=document.createElement('script');script.id='rt-partner-adjustment-statement-exporters';script.src='./src/features/partners/account-adjustment-statements.js?v=20260917-v1500';script.async=true;script.onload=function(){window.__rtPartnerAdjustmentStatementExportersReady?resolve():reject(new Error('Adjustment statement exporters did not initialise'));};script.onerror=reject;document.head.appendChild(script);
  }
  function loadAddon(resolve,reject){
    function finish(){loadAdjustmentExporter(resolve,reject);}
    if(window.__rtPartnerStatementAccountingV3Ready&&typeof window._partnerStatementPdf==='function'){finish();return;}
    var old=document.getElementById('rt-partner-statements-accounting-v3-script');
    if(old){old.addEventListener('load',function(){window.__rtPartnerStatementAccountingV3Ready?finish():reject(new Error('Statement accounting module did not initialise'));},{once:true});old.addEventListener('error',reject,{once:true});return;}
    var addon=document.createElement('script');addon.id='rt-partner-statements-accounting-v3-script';addon.src='./src/features/partners/statements-accounting-v3.js?v=20260917-v1500';addon.async=true;addon.onload=function(){window.__rtPartnerStatementAccountingV3Ready?finish():reject(new Error('Statement accounting module did not initialise'));};addon.onerror=reject;document.head.appendChild(addon);
  }
  function loadStatements(done){
    if(typeof window.openPartnerStatement==='function'&&window.__rtPartnerStatementAccountingV3Ready&&window.__rtPartnerAdjustmentStatementExportersReady){done();return;}
    if(statementLoader){statementLoader.then(done).catch(function(){try{toast('Could not load partner statements','error');}catch(_){}});return;}
    statementLoader=new Promise(function(resolve,reject){function finish(){loadAddon(resolve,reject);}if(typeof window.openPartnerStatement==='function'){finish();return;}var existing=document.getElementById('rt-partner-statements-script');if(existing&&typeof window.openPartnerStatement!=='function'){try{existing.remove();}catch(_){}}var script=document.createElement('script');script.id='rt-partner-statements-script';script.src='./src/features/partners/statements.js?v=20260917-v1500';script.async=true;script.onload=function(){typeof window.openPartnerStatement==='function'?finish():reject(new Error('Partner statement module did not initialise'));};script.onerror=reject;document.head.appendChild(script);});
    statementLoader.then(done).catch(function(err){statementLoader=null;console.warn('[RETRADE] partner statement module failed to load',err);try{toast('Could not load partner statements','error');}catch(_){}});
  }

  function makeButton(acct){var btn=document.createElement('button');btn.type='button';btn.className='btn btn-secondary rt-partner-statement-btn';btn.setAttribute('data-rt-statement-owner','v1500');btn.title='Statement by month, year or custom date range';btn.innerHTML='<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 2.5h5l3 3V13.5H4z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9 2.5v3h3M6 8h4M6 10.5h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg><span>Statement</span>';btn.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();var accountId=btn.dataset.accountId;window.__rtPartnerStatementActiveAccountId=accountId;loadStatements(function(){try{window.openPartnerStatement(accountId);}catch(err){console.warn('[RETRADE] partner statement open failed',err);try{toast('Could not open partner statement','error');}catch(_){}}});});btn.dataset.accountId=acct.id;return btn;}

  function placeStatementAction(acct){var page=document.getElementById('p-item');if(!acct||!isAccountDetail(page))return;activeAccountId=acct.id;installStyle();var btn=page.querySelector('.rt-partner-statement-btn');if(!btn)btn=makeButton(acct);btn.dataset.accountId=acct.id;btn.style.display='inline-flex';btn.style.alignItems='center';btn.style.justifyContent='center';btn.style.gap='5px';btn.style.fontSize='12px';btn.style.padding='7px 10px';btn.style.minHeight='36px';btn.style.whiteSpace='nowrap';var back=findBackControl(page),row=ensureNavRow(page,back);if(row){if(btn.parentElement!==row)row.appendChild(btn);btn.style.setProperty('margin-left','auto','important');page.querySelectorAll('.rt-partner-statement-fallback').forEach(function(el){if(!el.children.length)el.remove();});return;}var toolbar=page.querySelector('.rt-partner-v2-toolbar');if(toolbar&&toolbar.parentNode){var fallback=page.querySelector('.rt-partner-statement-fallback');if(!fallback){fallback=document.createElement('div');fallback.className='rt-partner-statement-fallback';fallback.style.cssText='display:flex;justify-content:flex-end;margin:0 0 10px;';toolbar.parentNode.insertBefore(fallback,toolbar);}fallback.appendChild(btn);}}
  function repair(){repairQueued=false;var page=document.getElementById('p-item');if(!isAccountDetail(page))return;var acct=accountFromPage(page);if(acct)placeStatementAction(acct);}
  function scheduleRepair(acct){if(acct&&acct.id!=null)activeAccountId=acct.id;if(repairQueued)return;repairQueued=true;requestAnimationFrame(repair);}
  if(typeof _renderAccountPage==='function'){var baseRenderAccountPage=_renderAccountPage;_renderAccountPage=function(acct){if(acct&&acct.id!=null)activeAccountId=acct.id;var result=baseRenderAccountPage.apply(this,arguments);scheduleRepair(acct);return result;};}
  var page=document.getElementById('p-item');if(page){try{observer=new MutationObserver(function(){scheduleRepair();});observer.observe(page,{childList:true,subtree:true});}catch(_){} }
  scheduleRepair();console.info('[RETRADE] v1.5.00 adjustment-aware partner Statement action loaded');
})();