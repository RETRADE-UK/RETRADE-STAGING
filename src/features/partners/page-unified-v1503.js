/* RETRADE Partner surface unification — v1.5.21
 *
 * Presentation/workflow layer only. No account, item, settlement, adjustment or
 * cashflow records are rewritten here.
 *
 * - Partners total outstanding aligns with the row money column.
 * - Profit-share defaults stay in account settings instead of list-row chrome.
 * - Account detail uses Statement + Settings in the nav row.
 * - Add item and Adjustment become the two explicit account actions.
 * - Add item owns new stock, new listed item and add-existing workflows.
 * - The global FAB opens the same account quick actions (no duplicate logic).
 * - Account navigation paints a full final-layout loading shell before the
 *   authoritative renderer runs, preventing partial-content/layout flashes.
 */
(function(){
  'use strict';
  if(window.__rtPartnerPageUnified1503)return;
  window.__rtPartnerPageUnified1503=true;

  var activeAccountId=null;
  var queued=false;
  var observer=null;
  var navToken=0;
  var ACCOUNT_MIN_MS=360,ACCOUNT_MAX_MS=1800;

  function norm(v){return String(v==null?'':v).replace(/\s+/g,' ').trim();}
  function escHtml(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c];});}
  function accountById(id){try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}catch(_){return null;}}
  function currentAccount(){
    try{if(typeof _acctCurrentAcct==='function'){var a=_acctCurrentAcct();if(a)return a;}}catch(_){}
    var a=accountById(activeAccountId);if(a)return a;
    var page=document.getElementById('p-item');if(!page)return null;
    var tagged=page.querySelector('[data-account-id],[data-accountid]');
    if(tagged){a=accountById(tagged.getAttribute('data-account-id')||tagged.getAttribute('data-accountid'));if(a)return a;}
    var h=page.querySelector('.page-title,h1,h2,h3'),title=norm(h&&h.textContent).toLowerCase();
    if(title){try{var matches=(_accounts||[]).filter(function(x){var n=norm(x&&x.name).toLowerCase();return n&&(title===n||title.indexOf(n)!==-1);});if(matches.length===1)return matches[0];}catch(_){} }
    return null;
  }
  function isAccountPage(){var p=document.getElementById('p-item');return !!(p&&p.classList.contains('on')&&currentAccount());}
  function arrangement(a){try{if(typeof _rtArrangementForAccount==='function')return _rtArrangementForAccount(a);}catch(_){}return String(a&&a.accountType||'supplier').toLowerCase()==='supplier'?'fixed_cost':'profit_share';}
  function timing(a){try{if(typeof _rtPartnerPaymentTiming==='function')return _rtPartnerPaymentTiming(a);}catch(_){}return String(a&&a.paymentTiming||a&&a.paymentTerms||'upfront').toLowerCase()==='on_sale'?'on_sale':'upfront';}
  function arrangementLabel(a){return arrangement(a)==='fixed_cost'?('Fixed cost · '+(timing(a)==='on_sale'?'After sale':'Upfront')):'Profit share';}

  function installStyles(){
    if(document.getElementById('rt-partner-unified-1503-style'))return;
    var s=document.createElement('style');s.id='rt-partner-unified-1503-style';
    s.textContent='\
      #p-accounts .rt-acct-compact-strip{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(128px,auto) 18px!important;gap:16px!important;align-items:center!important;padding:11px 16px!important;}\
      #p-accounts .rt-acct-compact-strip>span{grid-column:1!important;align-self:center!important;}\
      #p-accounts .rt-acct-compact-strip>strong{grid-column:2!important;text-align:right!important;justify-self:stretch!important;}\
      #p-accounts .rt-acct-op-row[data-account-id] .rt-acct-snapshot-term:empty{display:none!important;}\
      #p-item .rt-partner-v1503-settings{width:38px;height:38px;padding:0!important;display:inline-flex!important;align-items:center;justify-content:center;flex:0 0 38px;}\
      #p-item .rt-partner-v1503-actions{display:flex;align-items:center;gap:9px;margin:0 0 14px;}\
      #p-item .rt-partner-v1503-actions .btn{min-height:42px;padding:0 15px;font-size:12.5px;font-weight:750;}\
      #p-item .rt-partner-v1503-actions .rt-partner-v1503-add{background:var(--accent);border-color:var(--accent);color:var(--accent-text,#17130a);}\
      #p-item .rt-partner-v1503-hidden-action{display:none!important;}\
      .rt-partner-v1503-choice{display:flex;width:100%;align-items:center;gap:11px;padding:12px;border:1px solid var(--border);border-radius:11px;background:var(--surface);color:var(--text);text-align:left;cursor:pointer;margin:0 0 8px;}\
      .rt-partner-v1503-choice:hover{background:var(--surface2);}\
      .rt-partner-v1503-choice-icon{width:34px;height:34px;border-radius:9px;background:var(--surface2);display:flex;align-items:center;justify-content:center;flex:0 0 34px;color:var(--accent);font-size:18px;font-weight:800;}\
      .rt-partner-v1503-choice-copy{min-width:0;flex:1}.rt-partner-v1503-choice-copy strong{display:block;font-size:12.5px}.rt-partner-v1503-choice-copy span{display:block;font-size:10.5px;color:var(--text-secondary);margin-top:2px;line-height:1.35;}\
      #p-item[data-rt-account-transition]{position:relative;}\
      #p-item .rt-account-shell1503.rt-account-shell1503-overlay{position:absolute;inset:0;z-index:60;min-height:100%;background:var(--bg);padding:0 0 28px;box-sizing:border-box;opacity:1;pointer-events:auto;transition:opacity 160ms cubic-bezier(.22,.61,.36,1);}\
      #p-item .rt-account-shell1503.rt-account-shell1503-overlay.rt-account-shell1503-exit{opacity:0;}\
      #p-item .rt-account-shell1503{padding:0 0 28px;min-height:70vh;}\
      #p-item .rt-account-shell1503-nav{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;}\
      #p-item .rt-account-shell1503-navright{display:flex;align-items:center;gap:8px;margin-left:auto;}\
      #p-item .rt-account-shell1503-head{margin:0 0 12px;}\
      #p-item .rt-account-shell1503-title{font-size:clamp(26px,3.2vw,38px);font-weight:800;line-height:1.08;letter-spacing:-.035em;}\
      #p-item .rt-account-shell1503-tag{display:inline-flex;margin-top:7px;padding:4px 8px;border-radius:999px;background:var(--surface2);color:var(--accent);font-size:11px;font-weight:750;}\
      #p-item .rt-account-shell1503-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0 16px;}\
      #p-item .rt-account-shell1503-kpi{min-height:94px;padding:13px;border:1px solid var(--border);border-radius:13px;background:var(--surface);box-sizing:border-box;}\
      #p-item .rt-account-shell1503-line{height:10px;border-radius:999px;background:var(--surface2);overflow:hidden;position:relative;}\
      #p-item .rt-account-shell1503-line:after,#p-item .rt-account-shell1503-block:after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 20%,color-mix(in srgb,var(--text) 7%,transparent) 45%,transparent 70%);transform:translateX(-100%);animation:rt-shell1503 1.15s ease-in-out infinite;}\
      #p-item .rt-account-shell1503-kpi .rt-account-shell1503-line:first-child{width:58%;height:8px;margin-bottom:12px;}\
      #p-item .rt-account-shell1503-kpi .rt-account-shell1503-line:nth-child(2){width:72%;height:20px;margin-bottom:9px;}\
      #p-item .rt-account-shell1503-kpi .rt-account-shell1503-line:nth-child(3){width:86%;height:7px;}\
      #p-item .rt-account-shell1503-actions{display:flex;gap:9px;margin:0 0 14px;}\
      #p-item .rt-account-shell1503-action{width:116px;height:42px;border-radius:10px;border:1px solid var(--border);background:var(--surface2);}\
      #p-item .rt-account-shell1503-toolbar{display:flex;gap:9px;margin:0 0 14px}.rt-account-shell1503-search{height:42px;flex:1;border:1px solid var(--border);border-radius:10px;background:var(--surface);}.rt-account-shell1503-select{width:72px;height:42px;border:1px solid var(--border);border-radius:10px;background:var(--surface2);}\
      #p-item .rt-account-shell1503-groups{display:grid;gap:9px}.rt-account-shell1503-group{height:50px;border:1px solid var(--border);border-radius:12px;background:var(--surface);display:flex;align-items:center;padding:0 14px;gap:10px;box-sizing:border-box}.rt-account-shell1503-group strong{font-size:12.5px}.rt-account-shell1503-group span{margin-left:auto;width:30px;height:8px;border-radius:999px;background:var(--surface2)}\
      @keyframes rt-shell1503{to{transform:translateX(100%)}}\
      @media(max-width:760px){#p-item .rt-account-shell1503-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}#p-item .rt-account-shell1503-kpi{min-height:82px;padding:11px}#p-accounts .rt-acct-compact-strip{grid-template-columns:minmax(0,1fr) minmax(108px,auto) 14px!important;gap:12px!important;}}\
      @media(max-width:640px){#p-item .rt-account-shell1503-kpis{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}#p-item .rt-account-shell1503-kpi{min-height:78px;padding:10px 9px}#p-item .rt-account-shell1503-kpi:first-child{grid-column:1/-1;min-height:102px;padding:14px 16px}#p-item .rt-partner-v1503-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}#p-item .rt-partner-v1503-actions .btn{width:100%}#p-item .rt-account-shell1503-actions{display:grid;grid-template-columns:1fr 1fr}.rt-account-shell1503-action{width:auto!important}}\
      @media(max-width:380px){#p-item .rt-account-shell1503-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}#p-item .rt-account-shell1503-kpi:first-child{grid-column:1/-1}#p-item .rt-account-shell1503-kpi:last-child{grid-column:1/-1;min-height:68px}}\
      @media(prefers-reduced-motion:reduce){#p-item .rt-account-shell1503-line:after,#p-item .rt-account-shell1503-block:after{animation:none!important;}}\
    ';
    document.head.appendChild(s);
  }

  function patchPartnersList(){
    var page=document.getElementById('p-accounts');if(!page||!page.classList.contains('on'))return;
    page.querySelectorAll('.rt-acct-op-row[data-account-id]').forEach(function(row){
      var a=accountById(row.getAttribute('data-account-id'));if(!a)return;
      var term=row.querySelector('.rt-acct-snapshot-term');
      if(term&&arrangement(a)==='profit_share')term.textContent='';
    });
  }

  function settingsSvg(){return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.36.33.7.6 1 .27.3.65.45 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.1.4c-.27.3-.48.64-.6 1Z"/></svg>';}

  function classifySummary(page){
    var summary=page&&page.querySelector('.rt-partner-summary-v3');if(!summary)return;
    summary.classList.add('rt-partner-mobile-summary');
    summary.querySelectorAll('.rt-partner-summary-v3-card').forEach(function(card){
      if(card.getAttribute('data-kind'))return;
      var label=norm((card.querySelector('.rt-partner-summary-v3-label')||{}).textContent).toLowerCase();
      if(label.indexOf('outstanding')!==-1)card.setAttribute('data-kind','outstanding');
      else if(label.indexOf('potential')!==-1)card.setAttribute('data-kind','potential');
      else if(label.indexOf('paid')!==-1)card.setAttribute('data-kind','paid');
      else if(label.indexOf('earned')!==-1)card.setAttribute('data-kind','earned');
    });
  }

  function ensureSettings(page,a){
    var nav=page.querySelector('.rt-partner-v4-navrow');if(!nav)return;
    var btn=nav.querySelector('.rt-partner-v1503-settings');
    if(!btn){
      btn=document.createElement('button');btn.type='button';btn.className='btn btn-secondary rt-partner-v1503-settings';btn.setAttribute('aria-label','Account settings');btn.title='Account settings';btn.innerHTML=settingsSvg();
      btn.addEventListener('click',function(){
        var id=btn.getAttribute('data-account-id'),acct=accountById(id)||currentAccount();if(!acct)return;
        try{if(typeof openEditAccount==='function')openEditAccount(acct.id);else if(typeof window.openEditAccount==='function')window.openEditAccount(acct.id);}catch(err){console.warn('[RETRADE] account settings open failed',err);}
      });
      nav.appendChild(btn);
    }
    btn.setAttribute('data-account-id',a.id);
    page.querySelectorAll('button,a').forEach(function(el){if(el===btn||el.closest('.rt-partner-v4-navrow'))return;var t=norm(el.textContent).toLowerCase(),oc=String(el.getAttribute('onclick')||'');if(t==='edit'||t==='edit account'||oc.indexOf('openEditAccount')!==-1)el.classList.add('rt-partner-v1503-hidden-action');});
  }

  function openItemChooser(a){
    var body=''
      +'<button type="button" class="rt-partner-v1503-choice" data-rt-v1503-action="stock"><span class="rt-partner-v1503-choice-icon">＋</span><span class="rt-partner-v1503-choice-copy"><strong>Add unlisted stock</strong><span>Create a new sourced item already linked to '+escHtml(a.name||'this account')+'.</span></span></button>'
      +'<button type="button" class="rt-partner-v1503-choice" data-rt-v1503-action="listed"><span class="rt-partner-v1503-choice-icon">＋</span><span class="rt-partner-v1503-choice-copy"><strong>Add listed item</strong><span>Create a new listed item directly against this account.</span></span></button>'
      +'<button type="button" class="rt-partner-v1503-choice" data-rt-v1503-action="existing"><span class="rt-partner-v1503-choice-icon">↳</span><span class="rt-partner-v1503-choice-copy"><strong>Add existing item</strong><span>Assign stock that is already in RETRADE to this account.</span></span></button>';
    try{openPanel('Add item · '+escHtml(a.name||'Partner'),body);}catch(_){return;}
    document.querySelectorAll('[data-rt-v1503-action]').forEach(function(btn){btn.addEventListener('click',function(){var action=btn.getAttribute('data-rt-v1503-action');try{closePanel();}catch(_){}setTimeout(function(){try{if(action==='stock'&&typeof openStockQuickAdd==='function')openStockQuickAdd(a.id);else if(action==='listed'&&typeof openQuickAdd==='function')openQuickAdd(a.id);else if(action==='existing'&&typeof openBulkAssignAccountModal==='function')openBulkAssignAccountModal(a.id);}catch(err){console.warn('[RETRADE] add item action failed',err);try{toast('Could not open that action','error');}catch(_){}}},30);});});
  }

  function openAdjustment(a){
    var page=document.getElementById('p-item'),btn=page&&page.querySelector('.rt-adj-add');
    if(btn){btn.click();return;}
    try{toast('Account adjustments are still loading. Try again in a moment.');}catch(_){}
  }

  function ensureActionRow(page,a){
    var summary=page.querySelector('.rt-partner-summary-v3');if(!summary)return;
    var row=page.querySelector('.rt-partner-v1503-actions');
    if(!row){
      row=document.createElement('div');row.className='rt-partner-v1503-actions';
      row.innerHTML='<button type="button" class="btn rt-partner-v1503-add">+ Add item</button><button type="button" class="btn btn-secondary rt-partner-v1503-adjust">+ Adjustment</button>';
      summary.insertAdjacentElement('afterend',row);
      row.querySelector('.rt-partner-v1503-add').addEventListener('click',function(){var acct=accountById(row.getAttribute('data-account-id'))||currentAccount();if(acct)openItemChooser(acct);});
      row.querySelector('.rt-partner-v1503-adjust').addEventListener('click',function(){var acct=accountById(row.getAttribute('data-account-id'))||currentAccount();if(acct)openAdjustment(acct);});
    }else if(row.previousElementSibling!==summary){
      summary.insertAdjacentElement('afterend',row);
    }
    row.setAttribute('data-account-id',a.id);

    page.querySelectorAll('button,a').forEach(function(el){
      if(el.closest('.rt-partner-v1503-actions,.panel,.side-panel,.modal'))return;
      if(el.classList.contains('rt-adj-add')||el.classList.contains('rt-payalloc-adjust')){el.classList.add('rt-partner-v1503-hidden-action');return;}
      var t=norm(el.textContent).toLowerCase(),oc=String(el.getAttribute('onclick')||'');
      if(/add existing/.test(t)||oc.indexOf('openBulkAssignAccountModal')!==-1)el.classList.add('rt-partner-v1503-hidden-action');
    });
  }

  function polishAccount(){
    queued=false;
    var page=document.getElementById('p-item'),a=currentAccount(),transition=page&&page.getAttribute('data-rt-account-transition');if(!page||!page.classList.contains('on')||!a||transition==='v1503')return;
    activeAccountId=a.id;classifySummary(page);ensureSettings(page,a);ensureActionRow(page,a);
  }
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(function(){requestAnimationFrame(function(){patchPartnersList();polishAccount();});});}

  function shellGroup(label){return '<div class="rt-account-shell1503-group"><strong>'+label+'</strong><span></span></div>';}
  function renderLoadingShell(a){
    var page=document.getElementById('p-item');if(!page)return;
    page.setAttribute('data-rt-account-transition','v1503');page.setAttribute('aria-busy','true');
    page.innerHTML=''
      +'<div class="rt-account-shell1503">'
        +'<div class="rt-account-shell1503-nav"><button type="button" class="btn btn-secondary" disabled>← Accounts</button><div class="rt-account-shell1503-navright"><button type="button" class="btn btn-secondary" disabled>Statement</button><button type="button" class="btn btn-secondary rt-partner-v1503-settings" disabled>'+settingsSvg()+'</button></div></div>'
        +'<div class="rt-account-shell1503-head"><div class="rt-account-shell1503-line" style="width:min(48%,260px);height:28px;margin-bottom:9px"></div><div class="rt-account-shell1503-line" style="width:112px;height:22px"></div></div>'
        +'<div class="rt-account-shell1503-kpis">'
          +'<div class="rt-account-shell1503-kpi"><div class="rt-account-shell1503-line"></div><div class="rt-account-shell1503-line"></div><div class="rt-account-shell1503-line"></div></div>'
          +'<div class="rt-account-shell1503-kpi"><div class="rt-account-shell1503-line"></div><div class="rt-account-shell1503-line"></div><div class="rt-account-shell1503-line"></div></div>'
          +'<div class="rt-account-shell1503-kpi"><div class="rt-account-shell1503-line"></div><div class="rt-account-shell1503-line"></div><div class="rt-account-shell1503-line"></div></div>'
          +'<div class="rt-account-shell1503-kpi"><div class="rt-account-shell1503-line"></div><div class="rt-account-shell1503-line"></div><div class="rt-account-shell1503-line"></div></div>'
        +'</div>'
        +'<div class="rt-account-shell1503-actions"><button class="rt-account-shell1503-action" disabled></button><button class="rt-account-shell1503-action" disabled></button></div>'
        +'<div class="rt-account-shell1503-toolbar"><div class="rt-account-shell1503-search"></div><div class="rt-account-shell1503-select"></div></div>'
        +'<div class="rt-account-shell1503-groups">'+shellGroup('Sales')+shellGroup('Listed stock')+shellGroup('Unlisted stock')+shellGroup('Returns')+shellGroup('Unsettled items')+shellGroup('Payment history')+'</div>'
      +'</div>';
  }

  function installNavigation(){
    var current=window.openAccountPage;
    if(typeof current!=='function'||current.__rtUnified1503)return;
    var base=current.__rtBase||current;
    function wrapped(accountId){
      var a=accountById(accountId);if(a)activeAccountId=a.id;
      var out=base.apply(this,arguments);schedule();setTimeout(schedule,60);return out;
    }
    wrapped.__rtUnified1503=true;wrapped.__rtBase=base;window.openAccountPage=wrapped;try{openAccountPage=wrapped;}catch(_){}
  }

  function openFabMenu(){var a=currentAccount();if(!a)return false;var body=''
    +'<button type="button" class="rt-partner-v1503-choice" data-rt-v1503-fab="item"><span class="rt-partner-v1503-choice-icon">＋</span><span class="rt-partner-v1503-choice-copy"><strong>Add item</strong><span>New stock, new listing, or assign an existing RETRADE item.</span></span></button>'
    +'<button type="button" class="rt-partner-v1503-choice" data-rt-v1503-fab="adjust"><span class="rt-partner-v1503-choice-icon">±</span><span class="rt-partner-v1503-choice-copy"><strong>Add adjustment</strong><span>Record a non-cash account credit or agreed adjustment.</span></span></button>';
    try{if(typeof closeFabDial==='function')closeFabDial();openPanel('Account actions · '+escHtml(a.name||'Partner'),body);}catch(_){return false;}
    document.querySelectorAll('[data-rt-v1503-fab]').forEach(function(btn){btn.addEventListener('click',function(){var act=btn.getAttribute('data-rt-v1503-fab');try{closePanel();}catch(_){}setTimeout(function(){if(act==='item')openItemChooser(a);else openAdjustment(a);},30);});});return true;}

  function installFab(){
    var base=window.onFabClick;if(typeof base!=='function'||base.__rtUnified1503)return;
    var wrapped=function(){if(isAccountPage()&&openFabMenu())return;return base.apply(this,arguments);};wrapped.__rtUnified1503=true;wrapped.__rtBase=base;window.onFabClick=wrapped;try{onFabClick=wrapped;}catch(_){}
  }

  function start(){
    installStyles();installNavigation();installFab();schedule();
    var pa=document.getElementById('p-accounts');if(pa){new MutationObserver(schedule).observe(pa,{childList:true,subtree:true});}
    var pi=document.getElementById('p-item');if(pi){observer=new MutationObserver(function(muts){for(var i=0;i<muts.length;i++){if(muts[i].type==='childList'){schedule();return;}}});observer.observe(pi,{childList:true,subtree:true});}
    window.addEventListener('retrade:motion-ready',schedule);window.addEventListener('popstate',schedule);window.addEventListener('hashchange',schedule);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  console.info('[RETRADE] v1.5.31 unified Partner direct navigation + interactions loaded');
})();