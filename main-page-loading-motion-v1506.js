/* RETRADE main-page real-layout loading + reveal — v1.5.13
 *
 * Presentation-only loading system for top-level pages.
 *
 * Principle: there is no separate approximation skeleton. The page's actual
 * responsive DOM is rendered first, then dynamic values/charts are masked in
 * place. That means future layout changes automatically remain 1:1 with the
 * loading state and there is no geometry swap at handoff.
 *
 * Dashboard keeps its existing bespoke boot/chart choreography and Partners
 * keeps its dedicated account-list shell. Detail routes (item/account/run) are
 * intentionally excluded. No data, accounting, lifecycle or sync writes occur.
 */
(function(){
  'use strict';
  if(window.__rtMainPageLoading1506)return;
  window.__rtMainPageLoading1506=true;

  var MIN_MS=360;
  var MAX_MS=2200;
  var EASE='cubic-bezier(.22,.61,.36,1)';
  var eligible=new Set([
    'p-monthly','p-stock','p-expenses','p-cash','p-returns','p-scrapped',
    'p-activity','p-tax','p-data','p-runs'
  ]);
  var session=null;
  var serial=0;
  var lastActive=(document.querySelector('.page.on')||{id:''}).id;

  function reduced(){
    try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}
  }
  function bootOwned(){
    var body=document.body,root=document.documentElement;
    return !!(
      (root&&root.classList.contains('rt-app-cold')) ||
      (body&&(
        body.classList.contains('rt-real-layout-loading') ||
        body.classList.contains('rt-real-layout-revealing') ||
        body.classList.contains('rt-launch-waking')
      ))
    );
  }
  function activePage(){return document.querySelector('.page.on');}
  function pageForName(name){return document.getElementById('p-'+String(name||''));}
  function isEligible(page){return !!(page&&eligible.has(page.id));}
  function now(){return (window.performance&&performance.now)?performance.now():Date.now();}
  function cls(el){return String((el&&el.className&&el.className.baseVal)||el&&el.className||'').toLowerCase();}

  function installStyles(){
    if(document.getElementById('rt-main-page-loading-1506-style'))return;
    var s=document.createElement('style');s.id='rt-main-page-loading-1506-style';
    s.textContent='\
      .page.rt-main-preparing1506{visibility:hidden!important;}\
      .page.rt-main-loading1506{--rt-load-base:color-mix(in srgb,var(--surface2) 78%,var(--border));--rt-load-sheen:color-mix(in srgb,var(--border) 72%,var(--surface2));}\
      .page.rt-main-loading1506 .rt-main-skel-value1506,.page.rt-main-loading1506 .rt-main-skel-text1506{position:relative!important;color:transparent!important;text-shadow:none!important;background:var(--rt-load-base)!important;border-color:transparent!important;border-radius:6px!important;overflow:hidden!important;box-decoration-break:clone;-webkit-box-decoration-break:clone;}\
      .page.rt-main-loading1506 .rt-main-skel-value1506::after,.page.rt-main-loading1506 .rt-main-skel-text1506::after,.page.rt-main-loading1506 .rt-main-chart-mask1506::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 18%,var(--rt-load-sheen) 46%,transparent 74%);background-size:220% 100%;transform:translateX(-105%);animation:rtMainSheen1506 1.15s cubic-bezier(.4,0,.2,1) infinite;pointer-events:none;}\
      .page.rt-main-loading1506 .rt-main-skel-value1506{min-height:.82em;}\
      .page.rt-main-loading1506 .rt-main-skel-text1506{opacity:.82;}\
      .page.rt-main-loading1506 .rt-main-skeleton-media1506{opacity:0!important;background:var(--rt-load-base)!important;border-radius:8px!important;}\
      .page.rt-main-loading1506 .rt-main-skeleton-chart1506{opacity:.045!important;}\
      .page.rt-main-loading1506 .rt-main-chart-mask1506{position:absolute;z-index:18;border-radius:12px;background:var(--rt-load-base);overflow:hidden;pointer-events:none;}\
      .page.rt-main-loading1506 button:disabled,.page.rt-main-loading1506 input:disabled,.page.rt-main-loading1506 select:disabled,.page.rt-main-loading1506 textarea:disabled{opacity:.62!important;cursor:default!important;}\
      .page.rt-main-loading1506 [data-rt-main-link-disabled="1"]{pointer-events:none!important;opacity:.62!important;}\
      @keyframes rtMainSheen1506{to{transform:translateX(105%)}}\
      @keyframes rtMainValueReveal1506{0%{opacity:.12;transform:translate3d(0,5px,0)}100%{opacity:1;transform:translate3d(0,0,0)}}\
      @keyframes rtMainCardReveal1506{0%{opacity:.66;transform:translate3d(0,3px,0)}100%{opacity:1;transform:translate3d(0,0,0)}}\
      @keyframes rtMainChartReveal1506{0%{opacity:.18;transform:translate3d(0,3px,0) scale(.997)}100%{opacity:1;transform:translate3d(0,0,0) scale(1)}}\
      .page .rt-main-reveal-value1506{animation:rtMainValueReveal1506 320ms '+EASE+' both;animation-delay:var(--rt-main-delay,0ms);}\
      .page .rt-main-reveal-card1506{animation:rtMainCardReveal1506 270ms '+EASE+' both;animation-delay:var(--rt-main-card-delay,0ms);}\
      .page .rt-main-reveal-chart1506{animation:rtMainChartReveal1506 340ms '+EASE+' both;animation-delay:70ms;transform-origin:center;}\
      .page .rt-main-chart-mask1506.rt-main-mask-exit1506{opacity:0!important;transition:opacity 150ms ease-out;}\
      @media(prefers-reduced-motion:reduce){\
        .page.rt-main-loading1506 .rt-main-skel-value1506::after,.page.rt-main-loading1506 .rt-main-skel-text1506::after,.page.rt-main-loading1506 .rt-main-chart-mask1506::after{animation:none!important;}\
        .page .rt-main-reveal-value1506,.page .rt-main-reveal-card1506,.page .rt-main-reveal-chart1506{animation:none!important;transform:none!important;opacity:1!important;}\
        .page .rt-main-chart-mask1506.rt-main-mask-exit1506{transition:none!important;}\
      }\
    ';
    document.head.appendChild(s);
  }

  function textValueLike(el,text){
    if(!text)return false;
    var c=cls(el);
    if(/(?:value|amount|money|metric|kpi|stat|total|profit|revenue|balance|count|margin|sales|cost|cash)/.test(c))return true;
    if(/^[\s]*[£$€]?\s*[+\-−]?\s*\d[\d,]*(?:\.\d+)?\s*(?:%|[kKmM]|items?|orders?|sales?|units?|days?)?\s*$/.test(text))return true;
    if(/^[\s]*[+\-−]?\s*[£$€]\s*\d/.test(text))return true;
    return false;
  }

  function primaryValue(el,text){
    var c=cls(el),pc=cls(el.parentElement);
    if(/(?:kpi|hero|headline|metric|stat|summary|total|balance|profit|revenue)/.test(c+' '+pc))return true;
    try{if(parseFloat(getComputedStyle(el).fontSize)>=16)return true;}catch(_){}
    return /[£$€%]/.test(text)&&text.length<24;
  }

  function rowDataText(el){
    var node=el.parentElement,depth=0;
    while(node&&depth<4){
      var c=cls(node),tag=(node.tagName||'').toLowerCase();
      if(tag==='tr'||tag==='li'||/(?:item-row|stock-row|sale-row|expense-row|cash-row|transaction-row|activity-row|return-row|ledger-row|run-card|result-row|record-row)/.test(c))return true;
      if(/(?:page-title|section-title|chart|kpi|metric|summary|toolbar|controls|header)/.test(c))return false;
      node=node.parentElement;depth++;
    }
    return false;
  }

  function canMaskLeaf(el){
    if(!el||el.nodeType!==1||el.children.length)return false;
    var tag=(el.tagName||'').toLowerCase();
    if(/^(script|style|svg|path|option|button|input|select|textarea|label|h1|h2|h3|h4|h5)$/.test(tag))return false;
    if(el.closest('button,a,label,select,option,[role="button"],[contenteditable="true"]'))return false;
    if(el.closest('.rt-partners-dwell-shell1505,.rt-partners-shell1504,.rt-account-shell1503'))return false;
    return true;
  }

  function markLeaf(el,bag){
    if(!canMaskLeaf(el)||el.dataset.rtMainMarked1506==='1')return;
    var text=String(el.textContent||'').replace(/\s+/g,' ').trim();
    if(!text||text.length>80)return;
    var value=textValueLike(el,text),rowText=!value&&rowDataText(el);
    if(!value&&!rowText)return;
    el.dataset.rtMainMarked1506='1';
    if(value){
      el.classList.add('rt-main-skel-value1506');
      if(primaryValue(el,text)){el.classList.add('rt-main-primary1506');bag.primary.push(el);}
      bag.values.push(el);
    }else{
      el.classList.add('rt-main-skel-text1506');bag.texts.push(el);
    }
  }

  function markChart(el,bag){
    if(!el||el.dataset.rtMainChart1506==='1')return;
    if(el.closest('button,a,.tab,.bnt,.side-nav-item'))return;
    var r;try{r=el.getBoundingClientRect();}catch(_){r=null;}
    if(!r||r.width<150||r.height<70)return;
    var parent=el.parentElement;if(!parent)return;
    var pr;try{pr=parent.getBoundingClientRect();}catch(_){pr=null;}
    if(!pr||!pr.width||!pr.height)return;
    el.dataset.rtMainChart1506='1';el.classList.add('rt-main-skeleton-chart1506');
    var mask=document.createElement('div');mask.className='rt-main-chart-mask1506';mask.setAttribute('aria-hidden','true');
    var pos='';try{pos=getComputedStyle(parent).position;}catch(_){}
    if(!pos||pos==='static'){
      if(!parent.hasAttribute('data-rt-main-old-position1506'))parent.setAttribute('data-rt-main-old-position1506',parent.style.position||'');
      parent.style.position='relative';
    }
    mask.style.left=Math.max(0,r.left-pr.left)+'px';mask.style.top=Math.max(0,r.top-pr.top)+'px';mask.style.width=r.width+'px';mask.style.height=r.height+'px';
    parent.appendChild(mask);bag.charts.push({el:el,mask:mask,parent:parent});
  }

  function markMedia(el,bag){
    if(!el||el.dataset.rtMainMedia1506==='1'||el.closest('button,a'))return;
    var r;try{r=el.getBoundingClientRect();}catch(_){r=null;}
    if(!r||r.width<28||r.height<28)return;
    if(!rowDataText(el))return;
    el.dataset.rtMainMedia1506='1';el.classList.add('rt-main-skeleton-media1506');bag.media.push(el);
  }

  function disableControls(page,bag){
    page.querySelectorAll('button,input,select,textarea').forEach(function(el){
      if(el.dataset.rtMainDisabled1506)return;
      el.dataset.rtMainDisabled1506=el.disabled?'1':'0';
      if(!el.disabled)el.disabled=true;
      bag.controls.push(el);
    });
    page.querySelectorAll('a,[role="button"]').forEach(function(el){
      if(el.dataset.rtMainLinkDisabled1506)return;
      el.dataset.rtMainLinkDisabled1506='1';el.setAttribute('aria-disabled','true');bag.links.push(el);
    });
  }

  function scan(page,bag){
    if(!page||!page.isConnected)return;
    page.querySelectorAll('*').forEach(function(el){markLeaf(el,bag);});
    page.querySelectorAll('svg,canvas').forEach(function(el){markChart(el,bag);});
    page.querySelectorAll('img').forEach(function(el){markMedia(el,bag);});
    disableControls(page,bag);
  }

  function restoreControls(bag){
    bag.controls.forEach(function(el){
      if(!el||!el.isConnected)return;
      var was=el.dataset.rtMainDisabled1506;
      if(was==='0')el.disabled=false;
      delete el.dataset.rtMainDisabled1506;
    });
    bag.links.forEach(function(el){
      if(!el||!el.isConnected)return;
      el.removeAttribute('data-rt-main-link-disabled');
      delete el.dataset.rtMainLinkDisabled1506;
      if(el.getAttribute('aria-disabled')==='true')el.removeAttribute('aria-disabled');
    });
  }

  function cleanupMarks(page,bag,animate){
    var primary=bag.primary.filter(function(el){return el&&el.isConnected;});
    var cards=[];
    primary.forEach(function(el){
      var card=el.closest('.card,[class*="card"],[class*="kpi"],[class*="metric"],[class*="stat"]');
      if(card&&cards.indexOf(card)===-1&&card.closest('.page')===page)cards.push(card);
    });

    bag.values.forEach(function(el){if(el&&el.isConnected){el.classList.remove('rt-main-skel-value1506');delete el.dataset.rtMainMarked1506;}});
    bag.texts.forEach(function(el){if(el&&el.isConnected){el.classList.remove('rt-main-skel-text1506');delete el.dataset.rtMainMarked1506;}});
    bag.media.forEach(function(el){if(el&&el.isConnected){el.classList.remove('rt-main-skeleton-media1506');delete el.dataset.rtMainMedia1506;}});

    bag.charts.forEach(function(rec){
      if(rec.el&&rec.el.isConnected){rec.el.classList.remove('rt-main-skeleton-chart1506');delete rec.el.dataset.rtMainChart1506;if(animate&&!reduced())rec.el.classList.add('rt-main-reveal-chart1506');}
      if(rec.mask&&rec.mask.isConnected){if(animate&&!reduced()){rec.mask.classList.add('rt-main-mask-exit1506');setTimeout(function(){if(rec.mask&&rec.mask.parentNode)rec.mask.parentNode.removeChild(rec.mask);},165);}else rec.mask.remove();}
      if(rec.parent&&rec.parent.isConnected&&rec.parent.hasAttribute('data-rt-main-old-position1506')){
        var old=rec.parent.getAttribute('data-rt-main-old-position1506');
        if(old)rec.parent.style.position=old;else rec.parent.style.removeProperty('position');
        rec.parent.removeAttribute('data-rt-main-old-position1506');
      }
    });

    restoreControls(bag);
    if(!animate||reduced())return;
    primary.forEach(function(el,i){el.style.setProperty('--rt-main-delay',Math.min(i*26,156)+'ms');el.classList.add('rt-main-reveal-value1506');});
    cards.slice(0,10).forEach(function(card,i){card.style.setProperty('--rt-main-card-delay',Math.min(i*18,108)+'ms');card.classList.add('rt-main-reveal-card1506');});
    setTimeout(function(){
      primary.forEach(function(el){if(!el)return;el.classList.remove('rt-main-reveal-value1506','rt-main-primary1506');el.style.removeProperty('--rt-main-delay');});
      cards.forEach(function(card){if(!card)return;card.classList.remove('rt-main-reveal-card1506');card.style.removeProperty('--rt-main-card-delay');});
      bag.charts.forEach(function(rec){if(rec.el)rec.el.classList.remove('rt-main-reveal-chart1506');});
    },620);
  }

  function blocking(page){
    try{if(typeof _dbLoading!=='undefined'&&_dbLoading)return true;}catch(_){}
    var body=document.body;if(body&&body.classList.contains('rt-real-layout-loading')&&!body.classList.contains('rt-real-layout-revealing'))return true;
    if(page&&page.getAttribute('aria-busy')==='true'&&page.getAttribute('data-rt-main-busy1506')!=='1')return true;
    return false;
  }

  function endSession(s,animate){
    if(!s||s.ended)return;s.ended=true;
    if(s.timer)clearTimeout(s.timer);
    if(s.observer){try{s.observer.disconnect();}catch(_){}s.observer=null;}
    var page=s.page;
    if(page){
      page.classList.remove('rt-main-preparing1506','rt-main-loading1506');
      if(page.getAttribute('data-rt-main-busy1506')==='1'){page.removeAttribute('aria-busy');page.removeAttribute('data-rt-main-busy1506');}
      cleanupMarks(page,s.bag,!!animate);
    }
    if(session===s)session=null;
  }

  function scheduleReadyCheck(s,delay){
    if(!s||s.ended)return;
    if(s.timer)clearTimeout(s.timer);
    s.timer=setTimeout(function check(){
      s.timer=0;if(s.ended)return;
      if(!s.page.classList.contains('on')){endSession(s,false);return;}
      var elapsed=now()-s.started;
      if(elapsed>=MIN_MS&&(!blocking(s.page)||elapsed>=MAX_MS)){
        requestAnimationFrame(function(){
          if(s.ended)return;
          endSession(s,true);
          try{window.dispatchEvent(new CustomEvent('retrade:main-page-reveal',{detail:{pageId:s.page.id,elapsed:elapsed}}));}catch(_){}
        });
        return;
      }
      scheduleReadyCheck(s,Math.min(90,Math.max(24,MIN_MS-elapsed)));
    },Math.max(0,delay||0));
  }

  function begin(page,reason){
    if(!isEligible(page)||bootOwned())return;
    if(session)endSession(session,false);
    var s=session={id:++serial,page:page,reason:reason||'nav',started:now(),ended:false,timer:0,observer:null,bag:{values:[],texts:[],primary:[],charts:[],media:[],controls:[],links:[]}};
    page.classList.add('rt-main-loading1506');page.classList.remove('rt-main-preparing1506');
    page.setAttribute('aria-busy','true');page.setAttribute('data-rt-main-busy1506','1');
    scan(page,s.bag);
    try{
      s.observer=new MutationObserver(function(muts){
        if(s.ended)return;
        var needs=false;
        for(var i=0;i<muts.length;i++){if(muts[i].type==='childList'&&muts[i].addedNodes&&muts[i].addedNodes.length){needs=true;break;}}
        if(needs)scan(page,s.bag);
      });
      s.observer.observe(page,{childList:true,subtree:true});
    }catch(_){}
    scheduleReadyCheck(s,MIN_MS);
  }

  function installNavigation(){
    var current=window.goToTab;
    if(typeof current!=='function'||current.__rtMainLoading1506)return;
    function wrapped(name,sourceEl){
      var target=pageForName(name),before=activePage();
      var eligibleTarget=!bootOwned()&&isEligible(target)&&(!before||before.id!==target.id);
      if(eligibleTarget)target.classList.add('rt-main-preparing1506');
      var out;
      try{out=current.apply(this,arguments);}catch(err){if(eligibleTarget)target.classList.remove('rt-main-preparing1506');throw err;}
      target=pageForName(name);
      if(eligibleTarget&&target&&target.classList.contains('on'))begin(target,'nav');
      return out;
    }
    wrapped.__rtMainLoading1506=true;wrapped.__rtBase=current;
    window.goToTab=wrapped;try{goToTab=wrapped;}catch(_){}
  }

  function installRouteObserver(){
    try{
      var pages=Array.prototype.slice.call(document.querySelectorAll('.page'));
      var obs=new MutationObserver(function(){
        var active=activePage(),id=active?active.id:'';
        if(id===lastActive)return;
        lastActive=id;
        if(bootOwned())return;
        if(isEligible(active)&&!active.classList.contains('rt-main-loading1506')&&!active.classList.contains('rt-main-preparing1506')){
          active.classList.add('rt-main-preparing1506');
          Promise.resolve().then(function(){if(active.classList.contains('on'))begin(active,'route');else active.classList.remove('rt-main-preparing1506');});
        }
      });
      pages.forEach(function(p){obs.observe(p,{attributes:true,attributeFilter:['class']});});
    }catch(_){}
  }

  function start(){
    installStyles();installNavigation();installRouteObserver();
    var active=activePage();
    if(!bootOwned()&&isEligible(active)&&!active.classList.contains('rt-main-loading1506')){
      active.classList.add('rt-main-preparing1506');
      requestAnimationFrame(function(){if(active.classList.contains('on'))begin(active,'initial');else active.classList.remove('rt-main-preparing1506');});
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  console.info('[RETRADE] v1.5.13 real-layout main-page loading + reveal system loaded');
})();