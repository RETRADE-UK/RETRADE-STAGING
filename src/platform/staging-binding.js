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
    // Keep the environment visible without overlaying search or controls.
    var style=document.createElement('style');
    style.id='rt-staging-marker';
    style.textContent='.rt-staging-label{display:block;margin-top:2px;color:var(--text-secondary);font:600 10px/1 system-ui;letter-spacing:.05em;text-transform:uppercase}'+
      '#auth-overlay form::after{content:"Staging · test data";display:block;text-align:center;margin-top:12px;color:var(--text-secondary);font:600 12px/1.3 system-ui}';
    document.head.appendChild(style);
    document.querySelectorAll('.brand-word-v2,.mtb-brand-word,.side-nav-brand-word').forEach(function(word){
      var label=document.createElement('span');
      label.className='rt-staging-label';
      label.textContent=' Staging';
      word.appendChild(label);
      word.closest('button').setAttribute('aria-label','RETRADE staging dashboard');
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addStagingMarker,{once:true});
  else addStagingMarker();
})();
