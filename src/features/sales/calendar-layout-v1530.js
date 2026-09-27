/* RETRADE Sales Calendar / yearly information architecture — v1.5.30
 *
 * Goals:
 * - "now" first: current FY + current month appear before analytics/history
 * - recent months sorted newest-first; future empty months stay available but last
 * - core owns FY disclosure state; this layer only styles and orders content
 * - vertical/tap-first mobile interaction (no nested horizontal carousel) so future
 *   navigation gestures do not compete with Calendar controls
 * - deterministic, data-free Sales skeleton surfaces that use final DOM geometry
 *
 * Presentation only: no accounting, forecast, persistence or sync semantics change.
 */
(function(){
  'use strict';
  if(window.__rtSalesCalendar1530)return;
  window.__rtSalesCalendar1530=true;


  function currentFYStart(){
    var d=new Date(),y=d.getFullYear(),m=d.getMonth();
    return m>=3?y:y-1;
  }
  function currentKey(){
    try{if(typeof currentMonthKey==='function')return String(currentMonthKey()||'');}catch(_){}
    var d=new Date(),ms=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return ms[d.getMonth()]+'-'+String(d.getFullYear()).slice(-2);
  }
  function keyValue(key){
    var m=String(key||'').match(/^([A-Z]{3})-(\d{2})$/);if(!m)return NaN;
    var mons={JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};
    if(mons[m[1]]==null)return NaN;
    var yy=Number(m[2]),year=yy>=70?1900+yy:2000+yy;
    return year*12+mons[m[1]];
  }
  function cardKey(card){
    var raw=String(card&&card.getAttribute('onclick')||'');
    var m=raw.match(/goToMonth\(['"]([A-Z]{3}-\d{2})['"]\)/);
    return m?m[1]:'';
  }
  function fyStart(section){
    if(!section)return NaN;
    var txt=String(section.textContent||'');
    var m=txt.match(/FY\s+(\d{4})/i);
    return m?Number(m[1]):NaN;
  }
  function installStyles(){
    if(document.getElementById('rt-sales-calendar-1530-style'))return;
    var s=document.createElement('style');s.id='rt-sales-calendar-1530-style';
    s.textContent='\
/* Calendar hierarchy: current FY is operational content; analytics follows; history is last. */\
#p-monthly .rt-sales-current-fy1530{margin:2px 0 18px;}\
#p-monthly .rt-sales-current-fy1530::before{display:none!important;}\
#p-monthly .rt-sales-current-fy1530>div:first-child{min-height:52px;box-sizing:border-box;}\
#p-monthly .rt-sales-current-fy1530 .mgrid{margin-top:10px!important;margin-bottom:0!important;}\
#p-monthly .rt-sales-current-month1530{border-color:color-mix(in srgb,var(--accent) 72%,var(--border))!important;box-shadow:inset 3px 0 0 var(--accent),0 1px 2px var(--shadow)!important;}\
#p-monthly .rt-sales-current-month1530 .mname{color:var(--text-primary)!important;}\
#p-monthly .rt-sales-future-month1530{opacity:.48;}\
#p-monthly .rt-sales-history-label1530{margin:22px 0 9px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-tertiary);}\
#p-monthly .rt-sales-history-fy1530{margin-top:8px;}\
#p-monthly .rt-sales-history-fy1530>div:first-child{min-height:48px;}\
@media(max-width:600px){\
 #p-monthly .rt-sales-current-fy1530{margin-top:0;margin-bottom:14px;}\
 #p-monthly .rt-sales-current-fy1530>div:first-child{min-height:50px;padding:11px 14px!important;}\
 #p-monthly .rt-sales-current-fy1530 .mgrid{gap:7px!important;}\
 #p-monthly .rt-sales-current-month1530{padding:14px 14px!important;min-height:72px!important;}\
 #p-monthly .rt-sales-current-month1530 .mval{font-size:21px!important;}\
 #p-monthly .rt-sales-history-fy1530>div:first-child{min-height:48px;padding:11px 14px!important;}\
}\
';
    document.head.appendChild(s);
  }

  function sortCurrentMonths(section){
    var grid=section&&section.querySelector('.mgrid');if(!grid)return;
    var nowKey=currentKey(),nowVal=keyValue(nowKey);
    var cards=Array.prototype.slice.call(grid.querySelectorAll(':scope > .mcard'));
    cards.forEach(function(card){
      card.classList.remove('rt-sales-current-month1530','rt-sales-future-month1530');
      var k=cardKey(card),v=keyValue(k);
      card.dataset.rtSalesMonthKey1530=k;
      if(k===nowKey)card.classList.add('rt-sales-current-month1530');
      else if(isFinite(v)&&isFinite(nowVal)&&v>nowVal)card.classList.add('rt-sales-future-month1530');
    });
    cards.sort(function(a,b){
      var ak=cardKey(a),bk=cardKey(b),av=keyValue(ak),bv=keyValue(bk);
      if(ak===nowKey)return -1;if(bk===nowKey)return 1;
      var af=isFinite(av)&&isFinite(nowVal)&&av>nowVal,bf=isFinite(bv)&&isFinite(nowVal)&&bv>nowVal;
      if(af!==bf)return af?1:-1;
      if(af&&bf)return av-bv;
      return bv-av;
    });
    cards.forEach(function(card){grid.appendChild(card);});
  }


  function enhanceCalendar(){
    var p=document.getElementById('p-monthly');if(!p||!p.classList.contains('on'))return;
    var charts=p.querySelector('.monthly-charts-row');
    var sections=Array.prototype.slice.call(p.querySelectorAll('.fy-section'));
    if(!charts||!sections.length)return; // month-detail page, not Calendar
    var curFY=currentFYStart(),current=null;
    sections.forEach(function(section){
      var fy=fyStart(section);
      section.classList.remove('rt-sales-current-fy1530');
      if(fy===curFY||section.querySelector('.fy-current-badge'))current=section;
      else section.classList.add('rt-sales-history-fy1530');
    });
    if(current){
      current.classList.add('rt-sales-current-fy1530');
      current.classList.remove('rt-sales-history-fy1530');
      sortCurrentMonths(current);
      var host=charts.parentElement;
      // Keep the analytics graph first; the FY/month sections follow it.
      if(host&&current.parentElement===host)host.insertBefore(charts,current);
    }
    var firstHistory=null;
    sections.forEach(function(section){if(section!==current&&!firstHistory)firstHistory=section;});
    if(firstHistory&&firstHistory.parentElement){
      var label=firstHistory.parentElement.querySelector(':scope > .rt-sales-history-label1530');
      if(!label){label=document.createElement('div');label.className='rt-sales-history-label1530';label.textContent='History';}
      firstHistory.parentElement.insertBefore(label,firstHistory);
    }
    p.setAttribute('data-rt-sales-calendar-layout','v1530');
  }

  function wrap(name){
    var base=window[name];if(typeof base!=='function'||base.__rtSalesCalendar1530)return;
    function wrapped(){
      var out=base.apply(this,arguments);
      enhanceCalendar();
      return out;
    }
    wrapped.__rtSalesCalendar1530=true;wrapped.__rtBase=base;
    window[name]=wrapped;try{eval(name+'=wrapped');}catch(_){}
  }

  function install(){
    installStyles();
    wrap('renderMonthlyGrid');
    try{window.addEventListener('retrade:sales-route-reveal',enhanceCalendar);}catch(_){}
    requestAnimationFrame(enhanceCalendar);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  console.info('[RETRADE] v1.5.30 Sales Calendar now-first layout loaded');
})();
