/* RETRADE main-page KPI count motion — v1.5.10
 *
 * Standardises the Dashboard-style numeric reveal across top-level pages after
 * their truth-only skeleton has released. Only primary/headline values animate;
 * transaction rows, stock rows and dense tables deliberately do not.
 * Presentation only: final text is captured from the already-rendered true data.
 */
(function(){
  'use strict';
  if(window.__rtMainKpiCount1510)return;
  window.__rtMainKpiCount1510=true;

  var DURATION=520;
  var serial=0;
  var mainPages=new Set([
    'p-monthly','p-stock','p-expenses','p-cash','p-returns','p-scrapped',
    'p-activity','p-tax','p-data','p-runs','p-accounts'
  ]);

  function reduced(){
    try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}
  }
  function ease(t){return 1-Math.pow(1-t,3);}
  function cls(el){return String((el&&el.className&&el.className.baseVal)||el&&el.className||'').toLowerCase();}
  function text(el){return String(el&&el.textContent||'').replace(/\s+/g,' ').trim();}

  function rowLike(el){
    var n=el,depth=0;
    while(n&&depth<5){
      var c=cls(n),tag=String(n.tagName||'').toLowerCase();
      if(tag==='tr'||tag==='li'||/(?:table-row|mobile-row|ledger-row|transaction-row|cash-row|stock-row|sale-row|expense-row|return-row|activity-row|item-row|result-row|record-row)/.test(c))return true;
      if(/(?:kpi|metric|stat|summary|hero|headline|overview|dashboard|total-card|balance-card)/.test(c))return false;
      n=n.parentElement;depth++;
    }
    return false;
  }

  function primaryContext(el){
    var n=el,depth=0;
    while(n&&depth<5){
      var c=cls(n);
      if(/(?:kpi|metric|stat|summary|hero|headline|overview|dashboard|primary|total|balance|profit|revenue|margin)/.test(c))return true;
      n=n.parentElement;depth++;
    }
    try{return parseFloat(getComputedStyle(el).fontSize)>=18;}catch(_){return false;}
  }

  function parseNumeric(raw){
    if(!raw||raw.length>42)return null;
    /* One numeric token only. This intentionally rejects explanatory strings
       such as "£500 cash held − £200 reserved". */
    var matches=raw.match(/[+\-−]?\s*(?:[£$€]\s*)?\d[\d,]*(?:\.\d+)?|[£$€]\s*[+\-−]?\s*\d[\d,]*(?:\.\d+)?/g);
    if(!matches||matches.length!==1)return null;
    var token=matches[0],digits=token.replace(/[£$€,\s]/g,'').replace('−','-');
    var value=Number(digits);if(!isFinite(value))return null;
    var pos=raw.indexOf(token),prefix=raw.slice(0,pos),suffix=raw.slice(pos+token.length);
    if(prefix.length>4||suffix.length>16)return null;
    if(prefix&&!/^[+\-−£$€\s]*$/.test(prefix))return null;
    if(suffix&&!/^(?:\s*(?:%|k|m|items?|orders?|sales?|units?|days?))?$/i.test(suffix))return null;
    var numberText=token.replace(/[£$€+\-−\s]/g,'');
    var decimal=(numberText.split('.')[1]||'').length;
    var currency=(token.match(/[£$€]/)||[])[0]||'';
    var explicitPlus=/\+/.test(token)||/\+/.test(prefix);
    var negative=value<0||/[−-]/.test(token)||/[−-]/.test(prefix);
    return {value:value,decimal:decimal,currency:currency,prefix:prefix.replace(/[+\-−£$€]/g,''),suffix:suffix,plus:explicitPlus,negative:negative};
  }

  function format(meta,value){
    var abs=Math.abs(value),fixed=abs.toFixed(meta.decimal);
    var parts=fixed.split('.');
    parts[0]=parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,',');
    var number=parts.join('.');
    var sign=value<0?'−':(meta.plus&&value>0?'+':'');
    return meta.prefix+sign+meta.currency+number+meta.suffix;
  }

  function candidate(el){
    if(!el||el.nodeType!==1||el.children.length)return false;
    if(el.closest('button,a,label,select,option,input,[role="button"],[contenteditable="true"]'))return false;
    if(rowLike(el)||!primaryContext(el))return false;
    var c=cls(el),tag=String(el.tagName||'').toLowerCase();
    if(/^(script|style|svg|path|option)$/.test(tag))return false;
    if(/(?:date|time|period|label|title|foot|note|description|sub)/.test(c)&&!/(?:value|amount|num|total)/.test(c))return false;
    return !!parseNumeric(text(el));
  }

  function collect(page){
    var out=[];
    page.querySelectorAll('.kpi-value,.num,[class*="value"],[class*="amount"],[class*="total"],[class*="balance"],[class*="profit"],[class*="revenue"],[class*="margin"],[class*="metric"],[class*="stat"]').forEach(function(el){
      if(candidate(el)&&out.indexOf(el)===-1)out.push(el);
    });
    return out.slice(0,24);
  }

  function animatePage(page){
    if(!page||!page.classList.contains('on')||!mainPages.has(page.id)||reduced())return;
    var token=++serial,els=collect(page);if(!els.length)return;
    var jobs=[];
    els.forEach(function(el){
      var raw=text(el),meta=parseNumeric(raw);if(!meta)return;
      jobs.push({el:el,raw:raw,meta:meta});
      el.dataset.rtCountAnimating1510='1';
      el.textContent=format(meta,0);
    });
    if(!jobs.length)return;
    var started=(performance&&performance.now)?performance.now():Date.now();
    function frame(ts){
      if(token!==serial){jobs.forEach(function(j){if(j.el&&j.el.isConnected){j.el.textContent=j.raw;delete j.el.dataset.rtCountAnimating1510;}});return;}
      var t=Math.min(1,(ts-started)/DURATION),p=ease(t);
      jobs.forEach(function(j){
        if(!j.el||!j.el.isConnected)return;
        var v=j.meta.value*p;
        /* Integer KPIs should step as integers; money/percent decimals retain
           their exact final precision throughout the animation. */
        if(j.meta.decimal===0)v=Math.round(v);
        j.el.textContent=format(j.meta,v);
      });
      if(t<1){requestAnimationFrame(frame);return;}
      jobs.forEach(function(j){if(j.el&&j.el.isConnected){j.el.textContent=j.raw;delete j.el.dataset.rtCountAnimating1510;}});
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('retrade:main-page-reveal',function(e){
    var id=e&&e.detail&&e.detail.pageId,page=id?document.getElementById(id):document.querySelector('.page.on');
    requestAnimationFrame(function(){animatePage(page);});
  });
  window.addEventListener('retrade:sales-route-reveal',function(){
    requestAnimationFrame(function(){animatePage(document.getElementById('p-monthly'));});
  });

  /* Partners has a dedicated loader rather than the shared reveal event. Watch
     only its loading-class handoff, not the page subtree. */
  try{
    var partners=document.getElementById('p-accounts');
    if(partners){
      var wasLoading=partners.classList.contains('rt-partners-dwell1505');
      new MutationObserver(function(){
        var loading=partners.classList.contains('rt-partners-dwell1505')||!!partners.querySelector('.rt-partners-dwell-shell1505,.rt-partners-shell1504');
        if(wasLoading&&!loading&&partners.classList.contains('on'))requestAnimationFrame(function(){animatePage(partners);});
        wasLoading=loading;
      }).observe(partners,{attributes:true,attributeFilter:['class'],childList:true});
    }
  }catch(_){}

  console.info('[RETRADE] v1.5.10 main KPI count motion loaded');
})();
