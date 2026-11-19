/* Browser QA for the static research preview. All test interactions stay in this file. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const pagePath=path.resolve(process.argv[2] || 'output/RETRADE-launch-preview.html');
const product=path.resolve(process.argv[3] || '.');
const shots=process.argv[4];
const {chromium} = require(require.resolve('playwright',{paths:[product,__dirname]}));

async function check() {
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
  if(shots) fs.mkdirSync(shots,{recursive:true});
  try {
    for(const width of [320,390,768,1440]) {
      const context=await browser.newContext({viewport:{width,height:width>900?950:844},reducedMotion:'reduce'});
      const errors=[], requests=[];
      await context.route(/^https?:/, route=>{requests.push(route.request().url());return route.abort();});
      const page=await context.newPage();
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(pathToFileURL(pagePath).href);
      assert.equal(await page.locator('#home').isVisible(),true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Horizontal overflow at '+width);
      await page.locator('img[src]').evaluateAll(async elements=>Promise.all(elements.map(el=>el.decode())));
      if(shots) await page.screenshot({path:path.join(shots,'landing-'+width+'.png')});
      await page.locator('#play-film').click();
      await page.waitForFunction(()=>document.getElementById('haul-film').currentTime>0.3,null,{timeout:10000});
      const media=await page.locator('video').evaluate(v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration}));
      assert.ok(media.duration>12 && media.duration<70,'Unexpected recording length');
      assert.deepEqual([media.width,media.height],width<=690?[1080,1920]:[1600,960],'Incorrect tour master');
      const luma=await page.locator('video').evaluate(v=>{
        const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
        const ctx=canvas.getContext('2d');ctx.drawImage(v,0,0,64,64);
        const rgba=ctx.getImageData(0,0,64,64).data;
        let sum=0;for(let i=0;i<rgba.length;i+=4)sum+=0.2126*rgba[i]+0.7152*rgba[i+1]+0.0722*rgba[i+2];
        return sum/(rgba.length/4);
      });
      assert.ok(luma<85,'Light theme visible in the recording');
      await page.locator('video').evaluate(v=>v.pause());
      await page.locator('.haul summary').click();
      assert.equal(await page.locator('.haul tbody tr').count(),6);
      const amounts=await page.locator('.haul tfoot td').allTextContents();
      assert.deepEqual(amounts.slice(1),await page.locator('.totals dd').allTextContents());
      await page.locator('.haul summary').click();
      for(const key of ['haul','jacket','game','finds']){
        await page.locator('[data-key="'+key+'"]').click();
        assert.equal(await page.locator('[data-key="'+key+'"]').getAttribute('aria-pressed'),'true');
        assert.equal(await page.locator('.pick[aria-pressed="true"]').count(),1);
        await page.locator('#enlarge').click();
        assert.equal(await page.locator('dialog').isVisible(),true);
        await page.locator('#zoom-img').evaluate(el=>el.decode());
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('dialog').isVisible(),false);
      }
      await page.locator('.hero .primary').click();
      await page.locator('#signup').waitFor();
      assert.equal(await page.locator('#signup').isVisible(),true);
      if(shots) await page.screenshot({path:path.join(shots,'signup-'+width+'.png')});
      await page.locator('#email').fill('invalid');
      await page.locator('#join button[type=submit]').click();
      assert.equal(await page.locator('#signup').isVisible(),true);
      await page.locator('#email').fill('someone@example.test');
      await page.locator('#reveal').click();
      assert.equal(await page.locator('#pass').getAttribute('type'),'text');
      await page.locator('#join button[type=submit]').click();
      await page.locator('#confirm').waitFor();
      await page.locator('#confirm .primary').click();
      await page.locator('#home').waitFor();
      assert.equal(await page.locator('#email').inputValue(),'reseller@example.com');
      assert.equal(await page.locator('#pass').getAttribute('type'),'password');
      assert.deepEqual(requests,[]);
      assert.deepEqual(errors,[]);
      await context.close();
      console.log(width+'px: layout, real video playback, six-sale totals, screen selector, zoom, sign-up validation and confirmation passed.');
    }
  } finally {await browser.close();}
}
check().catch(error=>{console.error(error);process.exitCode=1;});
