/* Synthetic auth only. OS password stores cannot be exercised by Playwright. */
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
const engine=process.argv.includes('--webkit')?'webkit':'chromium';
(async()=>{
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})}:{})});
 try{
  for(const mobile of [true,false]){
   const {page,context,errors}=await open(browser,{mobile});await settled(page);
   assert.equal(await page.locator('#auth-screen-login').evaluate(e=>e.tagName),'FORM');
   assert.equal(await page.locator('#auth-email').getAttribute('autocomplete'),'username');
   assert.equal(await page.locator('#auth-pass').getAttribute('autocomplete'),'current-password');
   assert.equal(await page.locator('#auth-email').evaluate(e=>e.form.id),'auth-screen-login');
   assert.equal(await page.locator('#auth-pass').evaluate(e=>e.form.id),'auth-screen-login');
   assert(await page.locator('#auth-pass').evaluate(e=>e.name==='password'&&e.labels.length===1));
   assert.equal(await page.locator('#auth-screen-login button[aria-label="Show password"]').count(),1);
   assert(await page.locator('#auth-email').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
   assert(await page.locator('#signup-pass').isDisabled());
   await page.locator('#auth-email').fill('ui@example.test');
   await page.locator('#auth-pass').fill('bad');
   await page.locator('#auth-pass').press('Enter');
   await page.waitForFunction(()=>document.getElementById('auth-error').style.display==='block');
   assert.equal(await page.locator('#auth-pass').inputValue(),'bad','Failed login retains retry fields');
   assert.equal(await page.evaluate(()=>window.__fixtureSignInCalls),1,'Enter submits once');
   await page.getByRole('button',{name:'Forgot password?',exact:true}).click();
   assert.equal(await page.locator('#reset-email').inputValue(),'ui@example.test');
   assert(await page.locator('#auth-pass').isDisabled());
   assert.equal(await page.locator('#auth-pass').inputValue(),'','Leaving auth step clears its password');
   await page.getByRole('button',{name:'Back to sign in',exact:true}).click();
   await page.getByRole('button',{name:'Create one',exact:true}).click();
   assert.equal(await page.locator('#signup-email').getAttribute('autocomplete'),'username');
   for(const id of ['signup-pass','signup-pass2']){
    assert.equal(await page.locator('#'+id).getAttribute('autocomplete'),'new-password');
    assert.equal(await page.locator('#'+id).getAttribute('data-lpignore'),null);
    assert(await page.locator('#'+id).isEnabled());
   }
   await page.evaluate(()=>showNewPasswordScreen());
   for(const id of ['newpass-1','newpass-2']){
    assert.equal(await page.locator('#'+id).getAttribute('autocomplete'),'new-password');
    assert(await page.locator('#'+id).isEnabled());
   }
   await page.evaluate(()=>showLoginScreen());
   await page.locator('#auth-pass').fill('SyntheticAccepted!42');
   await page.locator('#auth-screen-login button[aria-label="Show password"]').click();
   assert.equal(await page.locator('#auth-pass').getAttribute('type'),'text');
   assert.equal(await page.locator('#auth-pass').getAttribute('autocomplete'),'current-password');
   // Removal must not rewrite or blank a submitted password first.
   await page.evaluate(()=>{
    window.__authRemoval=[];
    new MutationObserver(records=>records.forEach(r=>r.removedNodes.forEach(n=>{
     if(n.id==='auth-screen-login'){
      const p=n.querySelector('#auth-pass');window.__authRemoval.push({isForm:n.tagName==='FORM',hasSubmittedValue:p.value==='SyntheticAccepted!42',hint:p.autocomplete});
     }
    }))).observe(document.getElementById('auth-overlay'),{childList:true});
   });
   await page.locator('#auth-btn').click();
   await page.waitForFunction(()=>!document.querySelector('#auth-overlay form'));
   await settled(page);
   assert.deepEqual(await page.evaluate(()=>window.__authRemoval),[{isForm:true,hasSubmittedValue:true,hint:'current-password'}]);
   assert.equal(await page.evaluate(()=>window.__fixtureSignInCalls),2);
   assert(!await page.evaluate(()=>[...Object.values(localStorage),...Object.values(sessionStorage)].some(v=>v.includes('SyntheticAccepted!42'))),'No application password storage');
   for(const tab of ['stock','monthly','accounts','expenses','cash','runs','tax','data','returns','scrapped','activity','search','summary']){
    await page.evaluate(tab=>goToTab(tab),tab);
    await page.waitForFunction(tab=>document.querySelector('.page.on')?.id==='p-'+tab&&!document.querySelector('.page.on').hasAttribute('aria-busy'),tab);
    const violations=await page.evaluate(()=>Array.from(document.querySelectorAll('input,textarea,select')).filter(e=>!e.closest('#auth-overlay')&&!/^(checkbox|radio|hidden|submit|button|file)$/.test(e.type)&&(e.autocomplete!=='off'||e.getAttribute('data-1p-ignore')!=='true')).map(e=>e.id||e.outerHTML.slice(0,100)));
    assert.deepEqual(violations,[],tab+' fields are not credential targets');
    assert.equal(await page.locator('[autocomplete="username"],[autocomplete="current-password"],[autocomplete="new-password"],[name="username_fake"],[name="password_fake"]').count(),0,'No credential fields on '+tab);
   }
   await page.evaluate(()=>openPanel('Synthetic data entry','<div class="fg"><label>Reference</label><input id="autofill-reference" autocomplete="off"></div><textarea id="autofill-note"></textarea>'));
   await page.waitForFunction(()=>document.getElementById('autofill-reference').getAttribute('data-1p-ignore')==='true');
   await page.locator('#autofill-reference').fill('My purchase reference');
   assert.equal(await page.locator('#autofill-reference').inputValue(),'My purchase reference','Normal edits are preserved');
   await page.evaluate(()=>closePanel());
   await page.evaluate(()=>doSignOut());
   await page.waitForFunction(()=>document.getElementById('auth-pass')&&!document.getElementById('auth-pass').disabled);
   assert.equal(await page.locator('#auth-pass').inputValue(),'','Logout restores empty credential form');
   assert.equal(await page.locator('#auth-pass').getAttribute('type'),'password');
   assert.equal(await page.locator('#auth-email').getAttribute('autocomplete'),'username');
   assert.equal(await page.locator('#auth-screen-login form').count(),0);
   assert.deepEqual(errors,[]);
   await context.close();console.log('PASS '+engine+' auth form lifecycle and workspace autofill isolation '+(mobile?'mobile':'desktop'));
  }
  const saved=await open(browser,{signedIn:true,mobile:true});await settled(saved.page);
  assert.equal(await saved.page.locator('#auth-overlay form').count(),0,'Returning session has no credential forms');
  assert.deepEqual(saved.errors,[]);await saved.context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
