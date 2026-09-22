/* RETRADE staging-only Supabase binding. Never copy this file to production. */
(function(){
  'use strict';
  if(!window.supabase||typeof window.supabase.createClient!=='function')return;
  var realCreateClient=window.supabase.createClient.bind(window.supabase);
  var STAGING_URL='https://dvnrxmdejxfuazmpnudj.supabase.co';
  var STAGING_KEY='sb_publishable_ffwOuzEporqx12HuqCwRXg_yLZFAJkL';
  window.__RETRADE_STAGING__=true;
  window.supabase.createClient=function(_url,_key,options){
    return realCreateClient(STAGING_URL,STAGING_KEY,options);
  };

  function addStagingMarker(){
    if(document.getElementById('rt-staging-marker'))return;
    var el=document.createElement('div');
    el.id='rt-staging-marker';
    el.textContent='TEST BUILD · STAGING DATA';
    el.setAttribute('aria-label','RETRADE test build using staging data');
    el.style.cssText='position:fixed;z-index:2147483646;right:10px;top:calc(10px + env(safe-area-inset-top,0px));padding:6px 9px;border-radius:999px;background:rgba(17,20,28,.88);color:#fff;border:1px solid rgba(255,255,255,.18);box-shadow:0 4px 18px rgba(0,0,0,.18);font:700 10px/1.1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.055em;pointer-events:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)';
    document.body.appendChild(el);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addStagingMarker,{once:true});
  else addStagingMarker();
})();
