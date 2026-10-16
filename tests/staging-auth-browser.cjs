/* Synthetic browser sessions only; startup-browser blocks all outside traffic. */
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
const engine=process.argv.includes('--webkit')?'webkit':'chromium';
function stagingAuthMock(){
 const listeners=[];
 const read=()=>JSON.parse(sessionStorage.getItem('test-auth-session')||'null');
 window.__anonymousCalls=0;window.__passwordCalls=0;
 window.supabase={createClient(url){window.__fixtureClientUrl=url;return {auth:{
  async getSession(){return {data:{session:read()}};},
  onAuthStateChange(fn){listeners.push(fn);return {data:{subscription:{unsubscribe(){}}}};},
  async signInAnonymously(options){
   window.__anonymousCalls++;window.__anonymousOptions=options;
   await new Promise(r=>setTimeout(r,100));
   if(window.__anonymousError)return {error:{message:window.__anonymousError},data:{session:null}};
   const session={user:{id:'test-anonymous-'+Date.now(),is_anonymous:true,user_metadata:options.options.data}};
   sessionStorage.setItem('test-auth-session',JSON.stringify(session));
   if(!window.__skipAuthEvent)listeners.forEach(fn=>fn('SIGNED_IN',session));
   return {data:{session}};
  },
  async signInWithPassword(){window.__passwordCalls++;return {error:{message:'Unexpected password submission'}};},
  async signOut(){sessionStorage.removeItem('test-auth-session');listeners.forEach(fn=>fn('SIGNED_OUT',null));return {error:null};}
 }};}};
}
(async()=>{
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})}:{})});
 try{
  for(const width of [320,390,1440]){
   const {page,context,errors}=await open(browser,{mobile:width<600,slowFeatures:true,authMock:stagingAuthMock});
   await page.setViewportSize({width,height:width===320?568:900});
   const button=page.getByRole('button',{name:'Open populated test account',exact:true});
   await button.waitFor({state:'visible'});
   await button.scrollIntoViewIfNeeded();
   assert(await button.isEnabled(),'Test access available on the signed-out screen');
   assert.equal(await button.getAttribute('type'),'button');
   assert.equal(await page.locator('#staging-dev-btn').count(),1);
   await page.evaluate(()=>{window.__anonymousError='Anonymous sign-ins are disabled';});
   await button.click();
   await page.waitForFunction(()=>document.getElementById('auth-error').textContent.includes('disabled on staging'));
   assert(await button.isEnabled(),'Failure permits retry');
   await page.evaluate(()=>{window.__anonymousError=null;window.__skipAuthEvent=true;});
   await page.getByRole('button',{name:'Forgot password?',exact:true}).click();
   assert(await page.locator('#staging-dev-btn').isDisabled());
   await page.getByRole('button',{name:'Back to sign in',exact:true}).click();
   assert(await page.evaluate(()=>{const b=document.getElementById('staging-dev-btn');b.click();b.click();return document.getElementById('auth-btn').disabled&&document.getElementById('auth-email').disabled;}),'Opening a test account fences competing credential submissions');
   await page.waitForFunction(()=>document.getElementById('auth-overlay').style.display==='none');
   await settled(page);
   const first=await page.evaluate(()=>({id:_currentUserId,calls:window.__anonymousCalls,passwords:window.__passwordCalls,meta:window.__anonymousOptions.options.data,count:allDBKeys().reduce((n,k)=>n+(DB[k]||[]).length,0),url:window.__fixtureClientUrl}));
   assert.equal(first.calls,2,'Double click creates only one successful account');
   assert.equal(first.passwords,0,'No credential form submission');
   assert.equal(first.meta.staging_demo,true);
   assert(first.count>50,'Handoff loads a populated workspace');
   assert.equal(first.url,'https://dvnrxmdejxfuazmpnudj.supabase.co');
   assert.equal(await page.locator('#auth-overlay form').count(),0);
   await page.reload();await settled(page);
   assert.equal(await page.evaluate(()=>_currentUserId),first.id,'Reload resumes the same account');
   assert.equal(await page.evaluate(()=>window.__anonymousCalls),0,'Reload does not seed again');
   // Exercise actual sign-out and pristine form restoration, not a page reload.
   await page.evaluate(async()=>{_previewMode=false;await doSignOut();});
   await button.waitFor({state:'visible'});
   assert.equal(await page.locator('#staging-dev-btn').count(),1,'Restored form receives exactly one working entry');
   await button.click();await settled(page);
   await page.waitForFunction(()=>document.getElementById('auth-overlay').style.display==='none');
   assert.notEqual(await page.evaluate(()=>_currentUserId),first.id,'A new session gets an independent test account');
   assert.deepEqual(errors,[]);
   await context.close();
  }
  const {page,context}=await open(browser,{failedBinding:true,authMock:stagingAuthMock});
  await page.waitForTimeout(3000);
  assert.equal(await page.locator('#staging-dev-btn').count(),0,'Failed staging binding never enables access');
  assert.equal(await page.evaluate(()=>typeof retradeStagingDevLogin),'undefined');
  await context.close();
  console.log('Staging test access passed: '+engine+' (320/390/1440px, retry, session reuse, form restoration, binding failure)');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
