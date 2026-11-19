const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {launch, enter, setupDemo} = require('./live.cjs');
const examples = require('./examples.json');
const output = path.resolve(process.argv[2] || 'recorded');
fs.mkdirSync(output, {recursive:true});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function encode(args) {
  const result = spawnSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit'});
  if(result.status!==0) throw Error('FFmpeg could not encode the capture.');
}
async function recorder(page, context, work) {
  const cdp = await context.newCDPSession(page);
  const frames=[];
  const start=performance.now();
  cdp.on('Page.screencastFrame', ev=>{
    cdp.send('Page.screencastFrameAck',{sessionId:ev.sessionId}).catch(()=>{});
    const name='frame-'+String(frames.length).padStart(5,'0')+'.jpg';
    frames.push({time:performance.now()-start,name});
    fs.writeFileSync(path.join(work,name),Buffer.from(ev.data,'base64'));
  });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:92,maxWidth:1440,maxHeight:1600,everyNthFrame:1});
  return async target=>{
    await cdp.send('Page.stopScreencast');
    const end=performance.now()-start;
    await cdp.detach();
    if(frames.length<15)throw Error('Insufficient screen movement: '+frames.length+' frames.');
    const list=frames.map((f,i)=>"file '"+f.name+"'\nduration "+(((frames[i+1]?.time||end)-(i===0?0:f.time))/1000).toFixed(4)).join('\n')+"\nfile '"+frames.at(-1).name+"'\n";
    fs.writeFileSync(path.join(work,'capture.txt'),list);
    encode(['-f','concat','-safe','0','-i',path.join(work,'capture.txt'),'-vf','fps=25,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p','-c:v','libx264','-threads','2','-preset','fast','-crf','20','-movflags','+faststart',target]);
    console.log(path.basename(target),frames.length,'changed frames', (end/1000).toFixed(1)+'s');
  };
}
async function capture(browser, mode, state) {
  const mobile=mode==='mobile', width=mobile?390:1060,height=mobile?720:720;
  const {page,context}=await enter(browser,{storageState:state,viewport:{width,height},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1.5});
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'retrade-film-'));
  try{
    const result=await setupDemo(page,examples);
    if(result.added){await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__rtLaunchSettled&&window.__rtFeaturesReady,null,{timeout:120000});}
    await page.waitForFunction(()=>typeof _sourcingRuns!=='undefined'&&_sourcingRuns.some(r=>r.name==='Sunday car boot finds'),null,{timeout:60000});
    await page.evaluate(()=>openRunPage(_sourcingRuns.find(r=>r.name==='Sunday car boot finds').id));
    const pageView=page.locator('#p-item.on');
    const list=pageView.locator('.run-detail-right');
    await list.waitFor();
    page.setDefaultTimeout(11000);
    const rows=await page.evaluate(()=>_runItems(_sourcingRuns.find(r=>r.name==='Sunday car boot finds').id).map(i=>({item:i.item,cost:i.costPrice,sale:i.salePrice,net:Number(calcNetProfit(i).toFixed(2)),gross:Number(calcGrossProfit(i).toFixed(2)),revenue:Number(calcItemRevenue(i).toFixed(2))})));
    const hero=await pageView.locator('.run-detail-left').innerText();
    if(rows.length!==6)throw Error('The haul must contain exactly six items.');
    const money=k=>+(rows.reduce((s,r)=>s+r[k],0)).toFixed(2);
    const stats={rows,spend:money('cost'),revenue:money('revenue'),profit:money('net')};
    if(!hero.includes('£'+stats.profit.toFixed(2))||!hero.includes('£'+stats.spend.toFixed(2)))throw Error('The recorded run does not match the item calculation: '+hero);
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(stats,null,2));
    console.log('Verified visible run',mode,stats.spend,stats.revenue,stats.profit);
    const shot=async key=>page.screenshot({path:path.join(output,key+(mobile?'-mobile':'')+'.png'),timeout:10000});
    const center=async (locator,block='center')=>{
      await locator.evaluate((e,block)=>e.scrollIntoView({behavior:'smooth',block}),block);
      await sleep(900);
    };
    // The halo draws attention to an actual pointer event without changing any product content.
    await page.evaluate(()=>{
      document.addEventListener('pointerdown',e=>{
        const b=document.createElement('div');b.setAttribute('aria-hidden','true');
        Object.assign(b.style,{position:'fixed',left:(e.clientX-12)+'px',top:(e.clientY-12)+'px',width:'24px',height:'24px',zIndex:2147483646,pointerEvents:'none',border:'3px solid #f2b33d',borderRadius:'50%'});
        document.body.append(b);
        b.animate([{transform:'scale(0.65)',opacity:1},{transform:'scale(1.9)',opacity:0}],{duration:550}).onfinish=()=>b.remove();
      },true);
    });
    await sleep(600);
    await shot('haul');
    const stop=await recorder(page,context,work);
    await sleep(1600);
    await center(list);
    await shot('finds');
    await sleep(1700);
    for(const [key,ex] of [['jacket',examples[0]],['game',examples[2]]]){
      const row=list.getByText(ex.item,{exact:true});
      await center(row);
      await row.click();
      const pnl=pageView.locator('.ip-section-pnl').first();
      await pnl.waitFor();
      await sleep(1100);
      await center(pnl);
      await shot(key);
      await sleep(2100);
      const back=pageView.locator('.ip-back').first();
      await center(back);
      await back.click();
      await list.waitFor();
      if(key==='jacket'){await center(list);await sleep(850);}
    }
    await center(pageView.locator('.page-title').first(),'start');
    await sleep(1450);
    await stop(path.join(output,mode+'.mp4'));
    return await context.storageState();
  }catch(err){
    await page.screenshot({path:path.join(work,'error.png')}).catch(()=>{});
    console.error('Capture view:',(await page.locator('#p-item.on').innerText({timeout:2000}).catch(()=>'' )).slice(0,1480));
    throw err;
  }finally{await context.close();fs.rmSync(work,{recursive:true,force:true});}
}
(async()=>{const browser=await launch();try{
 const state=await capture(browser,'mobile');
 await capture(browser,'desktop',state);
}finally{await browser.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
