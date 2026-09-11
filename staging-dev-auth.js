/* RETRADE staging-only auth helper.
 * Creates an authenticated anonymous Supabase user so staging data lives in the
 * staging database under normal RLS. Production never loads this file.
 */
(function(){
  'use strict';
  if(!window.__RETRADE_STAGING__) return;

  function clearLegacyPreviewState(){
    try{
      localStorage.removeItem('retrade_preview_mode');
      localStorage.removeItem('general_preview_mode');
      var u=new URL(window.location.href);
      if(u.searchParams.has('preview')){
        u.searchParams.delete('preview');
        history.replaceState({},'',u.toString());
      }
    }catch(_e){}
  }

  function showError(message){
    var err=document.getElementById('auth-error');
    if(!err)return;
    err.textContent=message;
    err.style.display='block';
    err.style.background='var(--red-dim)';
    err.style.border='1px solid var(--red)';
    err.style.color='var(--red)';
  }

  async function enterStagingWorkspace(){
    var btn=document.getElementById('staging-dev-btn');
    if(btn){btn.disabled=true;btn.textContent='Opening test workspace…';btn.style.opacity='.7';}
    try{
      if(typeof _sb==='undefined'||!_sb||!_sb.auth||typeof _sb.auth.signInAnonymously!=='function'){
        throw new Error('Staging authentication is unavailable.');
      }
      var current=await _sb.auth.getSession();
      if(current&&current.data&&current.data.session){
        window.location.reload();
        return;
      }
      var result=await _sb.auth.signInAnonymously({
        options:{data:{
          full_name:'RETRADE Staging',
          business_name:'RETRADE Test Account',
          staging_demo:true
        }}
      });
      if(result&&result.error)throw result.error;
      // app-core's existing onAuthStateChange listener owns the normal handoff.
      // The auth.users INSERT trigger seeds the isolated staging account.
    }catch(err){
      var raw=String((err&&err.message)||err||'');
      var msg=/anonymous|provider.*disabled|not enabled/i.test(raw)
        ? 'Development bypass is ready, but Anonymous Sign-Ins still need enabling in the RETRADE-STAGING Supabase project.'
        : 'Could not open the staging workspace. '+(raw||'Please try again.');
      showError(msg);
      if(btn){btn.disabled=false;btn.textContent='Enter test workspace';btn.style.opacity='1';}
    }
  }

  function install(){
    clearLegacyPreviewState();

    // Remove the old local-only preview entry point. Staging now uses real
    // Supabase-backed test users and seeded rows instead of in-code fixtures.
    var old=document.getElementById('preview-btn');
    if(old)old.remove();

    var signIn=document.getElementById('auth-btn');
    if(!signIn||document.getElementById('staging-dev-btn'))return;

    var divider=document.createElement('div');
    divider.id='staging-dev-divider';
    divider.style.cssText='display:flex;align-items:center;gap:10px;margin:14px 0 0;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase';
    divider.innerHTML='<span style="height:1px;background:var(--border);flex:1"></span><span>Staging</span><span style="height:1px;background:var(--border);flex:1"></span>';

    var btn=document.createElement('button');
    btn.type='button';
    btn.id='staging-dev-btn';
    btn.textContent='Enter test workspace';
    btn.setAttribute('aria-label','Enter isolated RETRADE staging workspace');
    btn.style.cssText='width:100%;padding:12px;background:var(--surface2);color:var(--text);border:1px solid var(--accent);border-radius:8px;font-weight:700;font-size:15px;cursor:pointer;transition:background .15s,opacity .15s;margin-top:10px';
    btn.addEventListener('click',enterStagingWorkspace);

    var note=document.createElement('div');
    note.id='staging-dev-note';
    note.textContent='Uses isolated Supabase staging data — never production.';
    note.style.cssText='font-size:10px;line-height:1.35;color:var(--muted);text-align:center;margin-top:7px';

    signIn.insertAdjacentElement('afterend',divider);
    divider.insertAdjacentElement('afterend',btn);
    btn.insertAdjacentElement('afterend',note);
  }

  window.retradeStagingDevLogin=enterStagingWorkspace;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
