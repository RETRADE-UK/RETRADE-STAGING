const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {launch, enter, setupDemo} = require('./live.cjs');
const examples = require('./examples.json');
const output = path.resolve(process.argv[2] || 'recorded');
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
fs.mkdirSync(output,{recursive:true});

// Capture the rendered device pixels. Chrome's viewport-sized screencast discards
// the extra device resolution on small screens, making small product text blurry.
async function camera(context,page,folder,mobile){
  const session=await context.newCDPSession(page);
  const viewport=page.viewportSize();
  const ratio=await page.evaluate(()=>devicePixelRatio);
  await session.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:ratio,mobile});
  const frames=[],chapters=[];
  let elapsed=0,started=0,loop=null,active=false;
  const clock=()=>elapsed+(active?performance.now()-started:0);
  return {
    mark(key){chapters.push({key,seconds:clock()/1000});},
    start(){
      if(active)throw new Error('Capture is already running');
      active=true;started=performance.now();
      loop=(async()=>{
        while(active){
          const at=clock();
          const {visualViewport:v}=await session.send('Page.getLayoutMetrics');
          const {data}=await session.send('Page.captureScreenshot',{format:'jpeg',quality:93,fromSurface:true,
            captureBeyondViewport:false,clip:{x:v.pageX,y:v.pageY,width:viewport.width/v.scale,height:viewport.height/v.scale,scale:v.scale}});
          const image=Buffer.from(data,'base64');
          const name=path.join(folder,'take-'+frames.length+'.jpg');
          fs.writeFileSync(name,image);
          frames.push({at,name});
          const remaining=1000/30-(clock()-at);
          if(remaining>0&&active)await sleep(remaining);
        }
      })();
    },
    async pause(){
      if(!active)return;
      elapsed=clock();active=false;await loop;
    },
    async finish(target,mode){
      await this.pause();await session.detach();
      if(frames.length<50)throw Error('Too few rendered frames for a motion recording');
      const count=Math.round(30*elapsed/1000);
      let index=0;
      for(let i=0;i<count;i++){
        while(index+1<frames.length&&frames[index+1].at<=i*1000/30)index++;
        fs.linkSync(frames[index].name,path.join(folder,'edit-'+String(i).padStart(5,'0')+'.jpg'));
      }
      const ff=spawnSync('ffmpeg',['-loglevel','error','-y','-framerate','30','-i',path.join(folder,'edit-%05d.jpg'),
        '-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2:out_range=tv,format=yuv420p','-c:v','libx264','-threads','3','-preset','veryfast','-crf','16','-movflags','+faststart',target],{stdio:'inherit'});
      if(ff.status!==0)throw Error('Encoding failed');
      fs.writeFileSync(path.join(output,mode+'-chapters.json'),JSON.stringify({chapters,seconds:count/30,theme:'dark',sourceFrames:frames.length},null,2));
      console.log(mode,count+' frames at 30 fps,',frames.length+' original frames,', (count/30).toFixed(1)+'s');
    }
  };
}
async function capture(browser,mode,state){
  const mobile=mode==='mobile';
  const {page,context}=await enter(browser,{storageState:state,viewport:mobile?{width:390,height:610}:{width:1040,height:570},
    isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?3:1.6});
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'retrade-take-'));
  try{
    const setup=await setupDemo(page,examples);
    if(setup.added){
      await page.reload({waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.__rtLaunchSettled&&window.__rtFeaturesReady,null,{timeout:120000});
    }
    await page.waitForFunction(()=>typeof _sourcingRuns!=='undefined'&&_sourcingRuns.some(r=>r.name==='Sunday car boot finds'),null,{timeout:60000});
    await page.evaluate(()=>{
      setThemePref('dark');
      openRunPage(_sourcingRuns.find(r=>r.name==='Sunday car boot finds').id);
    });
    async function dark(){
      await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark'&&getThemePref()==='dark',null,{timeout:5000});
    }
    await dark();
    const view=page.locator('#p-item.on');
    const list=view.locator('.run-detail-right');
    await list.waitFor();page.setDefaultTimeout(15000);
    const rows=await page.evaluate(()=>_runItems(_sourcingRuns.find(r=>r.name==='Sunday car boot finds').id).map(i=>({item:i.item,cost:i.costPrice,sale:i.salePrice,net:+calcNetProfit(i).toFixed(2),gross:+calcGrossProfit(i).toFixed(2),revenue:+calcItemRevenue(i).toFixed(2)})));
    const sum=k=>+(rows.reduce((a,r)=>a+r[k],0)).toFixed(2);
    const stats={rows,spend:sum('cost'),revenue:sum('revenue'),profit:sum('net')};
    const text=await view.locator('.run-detail-left').innerText();
    if(rows.length!==6||!text.includes('£'+stats.profit.toFixed(2))||!text.includes('£'+stats.spend.toFixed(2)))throw Error('Closed-run figures differ from its six sales');
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(stats,null,2));
    console.log(mode,'verified dark staging run',stats.spend,stats.revenue,stats.profit);
    await page.evaluate(()=>{
      document.addEventListener('pointerdown',e=>{
        const ring=document.createElement('div');
        Object.assign(ring.style,{position:'fixed',left:e.clientX-12+'px',top:e.clientY-12+'px',width:'24px',height:'24px',zIndex:2147483646,pointerEvents:'none',border:'2px solid #f2b33d',borderRadius:'50%'});
        document.body.append(ring);
        ring.animate([{transform:'scale(.6)',opacity:1},{transform:'scale(1.65)',opacity:0}],{duration:480}).onfinish=()=>ring.remove();
      },true);
    });
    const shot=async key=>{await dark();await page.screenshot({path:path.join(output,key+(mobile?'-mobile':'')+'.png')});};
    async function frame(locator,behavior='smooth',block='center'){
      await locator.evaluate((el,p)=>el.scrollIntoView({behavior:p.behavior,block:p.block}),{behavior,block});
      await sleep(behavior==='smooth'?680:220);
    }
    const cam=await camera(context,page,work,mobile);
    const title=view.locator('.page-title').first();
    await frame(title,'instant','center');await shot('haul');
    await frame(list,'instant');await shot('finds');
    cam.start();cam.mark('finds');
    await sleep(2450);
    for(const [key,ex] of [['jacket',examples[0]],['game',examples[2]]]){
      if(key==='game'){cam.start();cam.mark('game-list');await sleep(900);}
      const row=list.getByText(ex.item,{exact:true});
      await row.scrollIntoViewIfNeeded();
      cam.mark(key+'-open');
      await row.click();
      const pnl=view.locator('.ip-section-pnl').first();
      await pnl.waitFor();await dark();await sleep(900);
      cam.mark(key+'-profit');
      await frame(pnl);
      await shot(key);
      await sleep(key==='game'?2700:2050);
      await cam.pause();
      await view.locator('.ip-back').first().click();
      await list.waitFor();
      if(key==='jacket')await frame(list,'instant');
    }
    // Trim normal return navigation out of the edit so viewers can read the outcome.
    await frame(view.locator('.run-detail-left').locator(':scope > div').first(),'instant');
    cam.start();cam.mark('result');
    await sleep(2600);
    await dark();await cam.finish(path.join(output,mode+'.mp4'),mode);
    return await context.storageState();
  }finally{await context.close();fs.rmSync(work,{recursive:true,force:true});}
}
(async()=>{
  const browser=await launch();
  try{const state=await capture(browser,'mobile');await capture(browser,'desktop',state);}
  finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
