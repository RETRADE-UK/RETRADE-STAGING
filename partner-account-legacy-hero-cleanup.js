/* RETRADE partner account legacy hero cleanup v1.4.81
 * The new Account position block is authoritative. Remove the old account KPI
 * hero wholesale so supplier accounts cannot leave behind orphan counts such as
 * a standalone "2" after older presentation layers hide only its labels.
 */
(function(){
  'use strict';
  if(window.__rtPartnerLegacyHeroCleanup1481)return;
  window.__rtPartnerLegacyHeroCleanup1481=true;
  var queued=false,observer=null;

  function clean(){
    queued=false;
    var page=document.getElementById('p-item');
    if(!page||!page.classList.contains('on')||!page.querySelector('.rt-partner-summary-v3'))return;
    page.querySelectorAll('.accounts-kpis-v2').forEach(function(el){
      if(!el.closest('.rt-partner-summary-v3')){
        el.classList.add('rt-partner-old-hero-hidden');
        el.style.setProperty('display','none','important');
      }
    });
  }
  function schedule(){
    if(queued)return;queued=true;
    requestAnimationFrame(function(){requestAnimationFrame(clean);});
  }
  function start(){
    if(!document.getElementById('rt-partner-old-hero-style')){
      var s=document.createElement('style');s.id='rt-partner-old-hero-style';
      s.textContent='.rt-partner-old-hero-hidden{display:none!important}';
      document.head.appendChild(s);
    }
    var page=document.getElementById('p-item');
    if(page){observer=new MutationObserver(schedule);observer.observe(page,{childList:true,subtree:true});}
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  console.info('[RETRADE] v1.4.81 legacy Partner account hero cleanup loaded');
})();