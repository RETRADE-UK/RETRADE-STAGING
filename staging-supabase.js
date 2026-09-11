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
})();
