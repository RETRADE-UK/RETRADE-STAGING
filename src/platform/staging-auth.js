/* Staging-only, authenticated test accounts. The database trigger generates
 * synthetic records under the new user's normal RLS ownership. */
(function(){
  'use strict';
  if(!window.__RETRADE_STAGING__||!window.RT_ASSETS||RT_ASSETS.environment!=='staging')return;
  var opening=false;
  var label='Open populated test account';

  function showError(message){
    var err=document.getElementById('auth-error');
    if(!err)return;
    err.textContent=message;
    err.style.display='block';
    err.style.background='var(--red-dim)';
    err.style.border='1px solid var(--red)';
    err.style.color='var(--red)';
  }
  function refreshButton(){
    var btn=document.getElementById('staging-dev-btn');
    if(!btn)return;
    // Prevent a password submission racing the anonymous session request.
    var form=btn.form;
    if(form)form.querySelectorAll('input,button,select,textarea').forEach(function(control){control.disabled=opening||form.inert;});
    btn.disabled=opening||!!btn.closest('[inert]');
    btn.textContent=opening?'Opening test account…':label;
    btn.setAttribute('aria-busy',String(opening));
  }
  async function enterStagingWorkspace(){
    if(opening)return;
    opening=true;refreshButton();
    var error=document.getElementById('auth-error');
    if(error)error.style.display='none';
    try{
      if(typeof _sb==='undefined'||!_sb.auth||typeof _sb.auth.signInAnonymously!=='function'){
        throw new Error('Staging authentication is unavailable. Refresh and try again.');
      }
      var current=await _sb.auth.getSession();
      if(current.error)throw current.error;
      var session=current.data&&current.data.session;
      if(!session){
        var result=await _sb.auth.signInAnonymously({options:{data:{
          full_name:'RETRADE Staging',business_name:'RETRADE Test Account',staging_demo:true
        }}});
        session=result&&result.data&&result.data.session;
        // A transient response may follow an accepted SIGNED_IN event.
        if(!session){
          var verified=await _sb.auth.getSession();
          session=verified.data&&verified.data.session;
        }
        if(!session)throw (result&&result.error)||new Error('No test session was created. Please try again.');
      }
      // Use the same handoff owner as password sign-in. Existing sessions are
      // resumed, never reseeded. This also handles a missed SIGNED_IN event.
      if(typeof window.__rtAuthHandoff!=='function')throw new Error('Sign-in is still starting. Please try again.');
      await window.__rtAuthHandoff(session);
    }catch(err){
      var raw=String((err&&err.message)||err||'');
      showError(/anonymous.*(?:disabled|not enabled)|provider.*disabled|not enabled/i.test(raw)
        ? 'Test accounts are unavailable because anonymous sign-in is disabled on staging.'
        : 'Could not open the test account. '+(raw||'Please try again.'));
    }finally{opening=false;refreshButton();}
  }
  function install(){
    var old=document.getElementById('preview-btn');
    if(old)old.remove();
    var signIn=document.getElementById('auth-btn');
    if(!signIn||document.getElementById('staging-dev-btn'))return;
    var block=document.createElement('div');
    block.id='staging-dev-access';
    block.style.cssText='margin-top:14px;padding-top:14px;border-top:1px solid var(--border)';
    var btn=document.createElement('button');
    btn.type='button';btn.id='staging-dev-btn';
    btn.style.cssText='width:100%;padding:12px;background:var(--surface2);color:var(--text);border:1px solid var(--accent);border-radius:8px;font-weight:700;font-size:14px;cursor:pointer';
    btn.addEventListener('click',enterStagingWorkspace);
    var note=document.createElement('div');
    note.id='staging-dev-note';
    note.textContent='No password needed. Sample stock, sales, returns, costs and accounts. Changes stay in this staging account on this browser; signing out starts a fresh one.';
    note.style.cssText='font-size:11px;line-height:1.4;color:var(--muted);text-align:center;margin-top:7px';
    block.append(btn,note);signIn.insertAdjacentElement('afterend',block);refreshButton();
  }
  function start(){
    try{
      localStorage.removeItem('retrade_preview_mode');localStorage.removeItem('general_preview_mode');
      var u=new URL(location.href);
      if(u.searchParams.has('preview')){u.searchParams.delete('preview');history.replaceState(history.state,'',u.toString());}
    }catch(_){}
    install();
    // Auth removes successful forms and restores pristine markup on sign-out.
    // Observe only the overlay's direct children, not every workspace mutation.
    var overlay=document.getElementById('auth-overlay');
    if(overlay)new MutationObserver(install).observe(overlay,{childList:true});
  }
  window.retradeStagingDevLogin=enterStagingWorkspace;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
