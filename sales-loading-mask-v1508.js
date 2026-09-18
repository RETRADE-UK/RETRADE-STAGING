/* RETRADE Sales truth-only loading mask — v1.5.08
 * Ensures Sales can never paint hydrated/intermediate numeric values over the
 * real-layout skeleton. Presentation only; no analytics or persisted data.
 */
(function(){
  'use strict';
  if(window.__rtSalesLoadingMask1508)return;
  window.__rtSalesLoadingMask1508=true;

  var page=document.getElementById('p-monthly');
  if(!page)return;
  var marked=[];
  var contentObserver=null;

  function installStyles(){
    if(document.getElementById('rt-sales-loading-mask-1508-style'))return;
    var s=document.createElement('style');
    s.id='rt-sales-loading-mask-1508-style';
    s.textContent='\
#p-monthly.rt-main-loading1506 .rt-sales-data-mask1508{position:relative!important;color:transparent!important;text-shadow:none!important;background:color-mix(in srgb,var(--surface2) 78%,var(--border))!important;border-color:transparent!important;border-radius:6px!important;overflow:hidden!important;min-height:.82em;}\
#p-monthly.rt-main-loading1506 .rt-sales-data-mask1508::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 18%,color-mix(in srgb,var(--border) 72%,var(--surface2)) 46%,transparent 74%);background-size:220% 100%;transform:translateX(-105%);animation:rtSalesMaskSheen1508 1.15s cubic-bezier(.4,0,.2,1) infinite;pointer-events:none;}\
@keyframes rtSalesMaskSheen1508{to{transform:translateX(105%)}}\
@media(prefers-reduced-motion:reduce){#p-monthly.rt-main-loading1506 .rt-sales-data-mask1508::after{animation:none!important}}';
    document.head.appendChild(s);
  }

  function text(el){return String(el&&el.textContent||'').replace(/\s+/g,' ').trim();}
  function cls(el){return String(el&&el.className&&el.className.baseVal||el&&el.className||'').toLowerCase();}
  function numericLike(t){
    if(!t||t.length>48)return false;
    if(/[£$€]\s*[+\-−]?\s*\d/.test(t))return true;
    if(/[+\-−]?\s*\d[\d,.]*\s*%/.test(t))return true;
    if(/^[+\-−]?\s*\d[\d,.]*(?:\s*(?:k|m|items?|orders?|sales?|units?))?$/i.test(t))return true;
    return false;
  }
  function dataContext(el){
    var node=el,depth=0;
    while(node&&node!==page&&depth<6){
      var c=cls(node);
      if(/(?:kpi|metric|stat|summary|total|profit|revenue|sales|amount|money|value|headline|figure|card)/.test(c))return true;
      node=node.parentElement;depth++;
    }
    return false;
  }
  function eligible(el){
    if(!el||el.nodeType!==1||el.children.length)return false;
    var tag=(el.tagName||'').toLowerCase();
    if(/^(script|style|svg|path|option|input|select|textarea)$/.test(tag))return false;
    if(el.closest('button,a,label,select,option,[role="button"],[contenteditable="true"]'))return false;
    var t=text(el);
    return numericLike(t)&&(dataContext(el)||/[£$€%]/.test(t));
  }
  function mark(el){
    if(!eligible(el)||el.dataset.rtSalesMask1508==='1')return;
    el.dataset.rtSalesMask1508='1';
    el.classList.add('rt-sales-data-mask1508');
    marked.push(el);
  }
  function scan(root){
    if(!page.classList.contains('rt-main-loading1506'))return;
    if(root&&root.nodeType===1)mark(root);
    var base=root&&root.querySelectorAll?root:page;
    base.querySelectorAll('*').forEach(mark);
  }
  function clear(){
    marked.forEach(function(el){
      if(!el)return;
      el.classList.remove('rt-sales-data-mask1508');
      delete el.dataset.rtSalesMask1508;
    });
    marked=[];
    if(contentObserver){try{contentObserver.disconnect();}catch(_){}contentObserver=null;}
  }
  function activate(){
    if(!page.classList.contains('rt-main-loading1506'))return;
    scan(page);
    if(contentObserver)return;
    try{
      contentObserver=new MutationObserver(function(muts){
        if(!page.classList.contains('rt-main-loading1506')){clear();return;}
        muts.forEach(function(m){
          if(m.type==='characterData'){if(m.target&&m.target.parentElement)mark(m.target.parentElement);return;}
          if(m.type==='childList')Array.prototype.forEach.call(m.addedNodes||[],function(n){if(n.nodeType===1)scan(n);else if(n.parentElement)mark(n.parentElement);});
        });
      });
      contentObserver.observe(page,{subtree:true,childList:true,characterData:true});
    }catch(_){}
  }

  installStyles();
  try{
    var classObserver=new MutationObserver(function(){
      if(page.classList.contains('rt-main-loading1506'))activate();else clear();
    });
    classObserver.observe(page,{attributes:true,attributeFilter:['class']});
  }catch(_){}
  if(page.classList.contains('rt-main-loading1506'))activate();
  console.info('[RETRADE] v1.5.08 Sales truth-only loading mask loaded');
})();
