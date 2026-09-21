/* RETRADE Partner account experience v2 — v1.4.91
 * Cashflow-style mobile information hierarchy + paint-first account navigation.
 * Presentation only: all account calculations and settlement actions remain in
 * the existing authoritative engines.
 */
(function(){
  'use strict';
  if(window.__rtPartnerExperience1491)return;
  window.__rtPartnerExperience1491=true;

  var navToken=0;

  function text(el){return String(el&&el.textContent||'').replace(/\s+/g,' ').trim();}
  function accountById(id){try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}catch(_){return null;}}
  function arrangement(acct){
    try{if(typeof _rtArrangementForAccount==='function')return _rtArrangementForAccount(acct);}catch(_){}
    return String(acct&&acct.accountType||'supplier').toLowerCase()==='supplier'?'fixed_cost':'profit_share';
  }
  function tagLabel(acct){return arrangement(acct)==='fixed_cost'?'Fixed cost':'Consignment';}

  function classifyCards(page){
    var summary=page&&page.querySelector('.rt-partner-summary-v3');if(!summary)return;
    summary.classList.add('rt-partner-mobile-summary');
    summary.querySelectorAll('.rt-partner-summary-v3-card').forEach(function(card){
      var label=text(card.querySelector('.rt-partner-summary-v3-label')).toLowerCase();
      var kind=String(card.getAttribute('data-kind')||'').toLowerCase();
      if(!kind){
        if(label.indexOf('outstanding')!==-1)kind='outstanding';
        else if(label.indexOf('potential')!==-1)kind='potential';
        else if(label.indexOf('paid')!==-1)kind='paid';
        else if(label.indexOf('earned')!==-1)kind='earned';
      }
      if(kind)card.setAttribute('data-kind',kind);
    });
  }

  function compactGroups(page){
    if(!page)return;
    page.querySelectorAll('.account-group').forEach(function(group){
      var count=group.querySelector('.account-group-count');
      var n=count?Number(String(count.textContent||'').replace(/[^0-9.-]/g,'')):NaN;
      if(n===0){
        group.classList.add('rt-account-empty-group','collapsed');
        var head=group.querySelector('.account-group-head');if(head)head.setAttribute('aria-expanded','false');
      }else group.classList.remove('rt-account-empty-group');
    });
  }

  function polish(page){
    page=page||document.getElementById('p-item');
    if(!page||!page.classList.contains('on'))return;
    classifyCards(page);
    compactGroups(page);
    page.querySelectorAll('.account-group .metric-inline').forEach(function(row){row.classList.add('rt-account-lazy-row');});
  }

  function immediateShell(acct){
    var page=document.getElementById('p-item');if(!page)return null;
    page.setAttribute('data-rt-account-transition','1');
    var tag=tagLabel(acct);
    page.innerHTML=''
      +'<div class="rt-account-transition-shell">'
        +'<div class="rt-account-transition-nav"><button type="button" class="btn btn-secondary" onclick="if(typeof exitItemPage===\'function\')exitItemPage()">← Accounts</button><span></span></div>'
        +'<div class="rt-account-transition-head"><div><div class="page-title">'+String(acct&&acct.name||'Account').replace(/[&<>]/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':'&gt;';})+'</div><span class="rt-account-transition-tag">'+tag+'</span></div></div>'
        +'<div class="rt-account-transition-loading"><div></div><div></div><div></div></div>'
      +'</div>';
    return page;
  }

  function installPaintFirstNavigation(){
    var original=window.openAccountPage;
    if(typeof original!=='function'||original.__rtPaintFirst1491)return;

    function wrapped(accountId){
      var acct=accountById(accountId);
      if(!acct)return original.apply(this,arguments);
      var token=++navToken;

      try{_itemPageOrigin='p-accounts';}catch(_){}
      try{if(typeof _deactivatePages==='function')_deactivatePages();}catch(_){}
      try{document.querySelectorAll('.tab,.bnt').forEach(function(el){el.classList.remove('on');});}catch(_){}
      var page=document.getElementById('p-item');
      if(page)page.classList.add('on');
      immediateShell(acct);
      try{window.scrollTo(0,0);}catch(_){}
      try{if(typeof handleNavResize==='function')handleNavResize();}catch(_){}
      try{if(typeof _syncFabVisibility==='function')_syncFabVisibility();}catch(_){}

      /* First paint belongs to navigation feedback. The authoritative account
         renderer runs on the following frame, so a large account cannot make a
         tap feel ignored while it builds the entire detail DOM. */
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          if(token!==navToken)return;
          var p=document.getElementById('p-item');if(!p||!p.classList.contains('on'))return;
          p.removeAttribute('data-rt-account-transition');
          original.call(window,accountId);
          polish(document.getElementById('p-item'));
        });
      });
    }
    wrapped.__rtPaintFirst1491=true;
    wrapped.__rtBase=original;
    window.openAccountPage=wrapped;
    try{openAccountPage=wrapped;}catch(_){}
  }

  function wrapAccountRenderer(){
    try{
      if(typeof _renderAccountPage!=='function'||_renderAccountPage.__rtMobile1491)return;
      var base=_renderAccountPage;
      var wrapped=function(){var r=base.apply(this,arguments);polish(document.getElementById('p-item'));return r;};
      wrapped.__rtMobile1491=true;wrapped.__rtBase=base;
      _renderAccountPage=wrapped;
    }catch(_){}
  }

  function installStyles(){
    if(document.getElementById('rt-partner-experience-v2-style'))return;
    var s=document.createElement('style');s.id='rt-partner-experience-v2-style';
    s.textContent='\
      .rt-account-transition-shell{padding:0 0 24px;min-height:52vh}.rt-account-transition-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}.rt-account-transition-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.rt-account-transition-tag{display:inline-flex;margin-top:7px;padding:4px 8px;border-radius:999px;background:var(--surface2);color:var(--accent);font-size:11px;font-weight:750}.rt-account-transition-loading{margin-top:24px;display:grid;gap:9px}.rt-account-transition-loading div{height:64px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.rt-account-transition-loading div:first-child{height:104px}\
      .rt-account-lazy-row{content-visibility:auto;contain-intrinsic-size:56px}.rt-acct-op-row{content-visibility:auto;contain-intrinsic-size:82px}\
      @media(max-width:640px){\
        #p-item .rt-partner-summary-v3.rt-partner-mobile-summary{margin:14px 0 16px!important}\
        #p-item .rt-partner-mobile-summary>div:first-child{align-items:center!important}\
        #p-item .rt-partner-mobile-summary .rt-partner-summary-v3-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important}\
        #p-item .rt-partner-mobile-summary .rt-partner-summary-v3-card{min-width:0!important;min-height:78px!important;padding:10px 9px!important;border-radius:13px!important;overflow:hidden}\
        #p-item .rt-partner-mobile-summary .rt-partner-summary-v3-card[data-kind="outstanding"]{grid-column:1/-1!important;grid-row:auto!important;order:-10!important;min-height:102px!important;padding:14px 16px!important;border-color:color-mix(in srgb,var(--accent) 72%,var(--border))!important}\
        #p-item .rt-partner-mobile-summary .rt-partner-summary-v3-card[data-kind="outstanding"] .rt-partner-summary-v3-value{font-size:27px!important;line-height:1.05!important;margin-top:3px!important}\
        #p-item .rt-partner-mobile-summary .rt-partner-summary-v3-card:not([data-kind="outstanding"]) .rt-partner-summary-v3-value{font-size:16px!important;line-height:1.1!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}\
        #p-item .rt-partner-mobile-summary .rt-partner-summary-v3-card:not([data-kind="outstanding"]) .rt-partner-summary-v3-sub{display:none!important}\
        #p-item .rt-partner-mobile-summary .rt-partner-summary-v3-label{font-size:10px!important;line-height:1.15!important;margin-bottom:6px!important}\
        #p-item .rt-partner-mobile-summary .rt-partner-summary-v3-card[data-kind="earned"] .rt-partner-summary-v3-label,#p-item .rt-partner-mobile-summary .rt-partner-summary-v3-card[data-kind="potential"] .rt-partner-summary-v3-label,#p-item .rt-partner-mobile-summary .rt-partner-summary-v3-card[data-kind="paid"] .rt-partner-summary-v3-label{font-size:0!important}\
        #p-item .rt-partner-mobile-summary .rt-partner-summary-v3-card[data-kind="earned"] .rt-partner-summary-v3-label:after{content:"Earned";font-size:10px}\
        #p-item .rt-partner-mobile-summary .rt-partner-summary-v3-card[data-kind="potential"] .rt-partner-summary-v3-label:after{content:"Potential";font-size:10px}\
        #p-item .rt-partner-mobile-summary .rt-partner-summary-v3-card[data-kind="paid"] .rt-partner-summary-v3-label:after{content:"Paid";font-size:10px}\
        #p-item .rt-partner-summary-v3-title-row>[style*="text-align"],#p-item .rt-partner-summary-v3>div:first-child>span:last-child{display:none!important}\
        #p-item .rt-partner-v2-toolbar{gap:7px!important}.rt-partner-v2-toolbar .rt-partner-v2-search{min-width:0!important}.rt-partner-v2-toolbar button{width:auto!important;min-width:62px!important;padding-left:11px!important;padding-right:11px!important}\
        #p-item .account-group{border-radius:14px!important;margin-bottom:9px!important}.rt-account-empty-group .account-group-body{display:none!important}.rt-account-empty-group{min-height:0!important}.rt-account-empty-group .account-group-head{padding-top:13px!important;padding-bottom:13px!important}\
        #p-item .account-group-body{content-visibility:auto;contain-intrinsic-size:180px}\
        .rt-account-transition-shell{padding-top:2px}.rt-account-transition-loading div{height:58px}.rt-account-transition-loading div:first-child{height:128px}\
      }\
      @media(max-width:380px){#p-item .rt-partner-mobile-summary .rt-partner-summary-v3-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}#p-item .rt-partner-mobile-summary .rt-partner-summary-v3-card[data-kind="outstanding"]{grid-column:1/-1!important}#p-item .rt-partner-mobile-summary .rt-partner-summary-v3-card[data-kind="paid"]{grid-column:1/-1!important;min-height:68px!important}}\
    ';
    document.head.appendChild(s);
  }

  installStyles();
  wrapAccountRenderer();
  /* v1.5.22: no paint-first skeleton. openAccountPage is in-memory navigation. */
  try{polish(document.getElementById('p-item'));}catch(_){}
  console.info('[RETRADE] v1.5.22 Partner account direct-navigation mobile hierarchy loaded');
})();