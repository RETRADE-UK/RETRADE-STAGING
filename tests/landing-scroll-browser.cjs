/* Public tour regressions. The Pages build and synthetic capture manifest are
 * the only inputs. Every external request is blocked; no sign-in or business
 * database is contacted. Chromium adds native touch; WebKit covers the same
 * responsive layouts, navigation and native vertical wheel scrolling. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {chromium, webkit} = require('playwright');

const root = path.resolve(__dirname, '..');
const site = path.join(root, '_site');
const origin = 'http://retrade.test';
const isWebKit = process.argv.includes('--webkit');
const engine = isWebKit ? 'webkit' : 'chromium';
const ids = ['sourcing', 'stock', 'sale', 'dashboard'];
const sizes = [[320,568], [390,844], [768,1024], [1024,600], [1440,900]];
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml'};
let captureManifest;

function captureChecks() {
  const filename = path.join(root, 'assets/landing/capture-manifest.json');
  assert(fs.existsSync(filename), 'The refreshed product captures need their reproducible capture manifest');
  const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
  assert.equal(manifest.schemaVersion, 2, 'Use the complete-screen capture format');
  assert.equal(manifest.label, 'Example workspace', 'Marketing screenshots must identify their illustrative data');
  assert.equal(manifest.captures.length, 8, 'Each feature needs one desktop and one phone capture');
  assert.equal(manifest.origin,origin,'Captures must come from the isolated local app');
  assert.equal(manifest.externalNetwork,'blocked','The capture must exclude external data and writes');
  const business = manifest.metrics.current;
  assert(business.revenue >= 1500 && business.revenue <= 2500,'The example should depict a modest reseller business');
  assert(business.soldCount >= 50 && business.soldCount <= 65,'The monthly sale count must match the modest example');
  assert(business.margin >= 35 && business.margin <= 45,'The example should show a healthy, credible gross margin');
  assert(business.refundRate > 0 && business.refundRate <= 3,'The example refund rate must stay small and non-zero');
  for (const id of ids) {
    for (const phone of [false,true]) {
      const file = id + (phone ? '-phone' : '') + '.webp';
      const capture = manifest.captures.find(record => record.file === file);
      assert(capture, 'Missing capture record for ' + file);
      const bytes = fs.readFileSync(path.join(site,'assets/landing',file));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),capture.sha256,
        'Published image bytes must match the verified complete capture: ' + file);
      assert(capture.width > 0 && capture.height > 0, 'Capture dimensions must be recorded: ' + file);
      assert(capture.viewport.width > 0 && capture.viewport.height > 0, 'Capture viewport must be recorded: ' + file);
      assert(capture.title && capture.title.trim().length > 2, 'The product page title must be recorded: ' + file);
      assert.equal(capture.proof.fullHeading, true, 'The app heading must be inside the original capture: ' + file);
      if (id === 'sale') assert.equal(capture.proof.fullBreakdown, true, 'Sale captures must include the complete breakdown');
      assert(capture.proof.requiredElements.length >= 1, 'Capture proof needs measured product content: ' + file);
      for (const element of capture.proof.requiredElements) {
        const b = element.bounds;
        assert(b && b.width > 0 && b.height > 0, 'Required product element must have visible dimensions: ' + file);
        assert(b.x >= -1 && b.y >= -1 &&
          b.x + b.width <= capture.viewport.width + 1 &&
          b.y + b.height <= capture.viewport.height + 1,
        'Original capture clips a required element: ' + JSON.stringify({file,element,viewport:capture.viewport}));
      }
    }
  }
  return manifest;
}

async function rest(page, minimum = 350) {
  const began = Date.now();
  let last = await page.evaluate(() => scrollY);
  let quiet = began;
  while (Date.now() - began < 5000) {
    await page.waitForTimeout(50);
    const y = await page.evaluate(() => scrollY);
    if (Math.abs(y - last) > 0.5) quiet = Date.now();
    last = y;
    if (Date.now() - began >= minimum && Date.now() - quiet >= 180) return y;
  }
  throw new Error('Native page movement did not finish within five seconds');
}

async function selected(page, id) {
  await page.waitForFunction(id => {
    const panel = document.getElementById(id);
    const tab = document.querySelector('.jump a[href="#' + id + '"]');
    const indicator = document.querySelector('.tab-indicator');
    return panel && !panel.hidden && !panel.inert &&
      getComputedStyle(panel).visibility !== 'hidden' &&
      Number(getComputedStyle(panel).opacity) >= 0.99 &&
      [...panel.getAnimations(), ...(indicator ? indicator.getAnimations() : [])]
        .every(animation => animation.playState !== 'running' && !animation.pending) &&
      tab && tab.getAttribute('aria-current') === 'step';
  }, id);
}

async function activate(page, id) {
  await page.locator('.jump a[href="#' + id + '"]').click();
  await selected(page, id);
  await rest(page);
  await selected(page, id);
}

async function decodeImages(page) {
  await page.evaluate(async () => {
    const images = [...document.images].filter(image => image.currentSrc || image.getAttribute('src'));
    images.forEach(image => {image.loading = 'eager';});
    await Promise.all(images.map(image => image.decode()));
  });
}

async function geometry(page, id) {
  return page.evaluate(id => {
    const rect = element => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return {x:r.x,y:r.y,top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};
    };
    const panel = document.getElementById(id);
    const image = panel.querySelector('.screen-image');
    const controls = document.querySelector('.tour-controls');
    const imageStyle = getComputedStyle(image);
    const deck = document.querySelector('.tour-deck');
    return {
      y:scrollY, width:innerWidth, height:innerHeight,
      overflow:document.documentElement.scrollWidth-innerWidth,
      pinned:deck.classList.contains('tour-pinned'), stage:rect(deck.querySelector('.tour-stage')),
      step:parseFloat(getComputedStyle(deck).getPropertyValue('--tour-step')),
      controls:rect(controls), controlsPosition:getComputedStyle(controls).position,
      indicator:rect(document.querySelector('.tab-indicator')),
      copy:rect(panel.querySelector('.story-copy')), figure:rect(panel.querySelector('.product-screen')),
      canvas:rect(panel.querySelector('.screen-canvas')), image:rect(image),
      currentSrc:image.currentSrc, naturalWidth:image.naturalWidth, naturalHeight:image.naturalHeight,
      objectFit:imageStyle.objectFit,
      active:document.querySelector('.jump [aria-current="step"]')?.getAttribute('href'),
      panels:[...document.querySelectorAll('.story')].map(el => ({
        id:el.id, hidden:el.hidden, inert:el.inert, ariaHidden:el.getAttribute('aria-hidden'),
        role:el.getAttribute('role'), labelledBy:el.getAttribute('aria-labelledby'),
        opacity:Number(getComputedStyle(el).opacity), visibility:getComputedStyle(el).visibility
      })),
      tabs:[...document.querySelectorAll('.jump a')].map(el => ({
        href:el.getAttribute('href'), id:el.id, role:el.getAttribute('role'),
        selected:el.getAttribute('aria-selected'), current:el.getAttribute('aria-current'), tabIndex:el.tabIndex,
        controls:el.getAttribute('aria-controls'), box:rect(el)
      })),
      count:document.querySelector('[data-slide-count]')?.textContent.trim(),
      events:window.__landingInput
    };
  }, id);
}

async function assertSlide(page, id, {fitsViewport = false} = {}) {
  await selected(page,id);
  const g = await geometry(page,id);
  const index = ids.indexOf(id);
  assert(g.overflow <= 1, 'No document horizontal overflow: ' + JSON.stringify(g));
  assert.equal(g.active, '#' + id, 'Selected stage must match the visible product screen');
  assert.equal(g.panels.filter(panel => !panel.hidden).length, g.pinned ? 1 : ids.length,
    'Pinned mode shows one stage; the short-viewport fallback keeps every stage readable');
  for (const panel of g.panels) {
    if (g.pinned) {
      assert.equal(panel.role, 'tabpanel');
      assert.equal(panel.labelledBy, 'tab-' + panel.id);
      assert.equal(panel.hidden, panel.id !== id, 'Inactive stages must be hidden');
      assert.equal(panel.inert, panel.id !== id, 'Inactive panels must not retain focusable controls');
      assert.equal(panel.visibility === 'hidden',panel.id !== id,
        'Space reserved for another slide must not expose a second screenshot');
    } else {
      assert(!panel.hidden && !panel.inert && panel.visibility !== 'hidden',
        'A short viewport must have access to all chapter content');
    }
  }
  assert.equal(g.tabs.filter(tab => tab.current === 'step').length, 1);
  if (g.pinned) {
    assert.equal(g.tabs.filter(tab => tab.selected === 'true').length, 1);
    assert.equal(g.tabs.filter(tab => tab.tabIndex === 0).length, 1, 'The stage rail needs one keyboard entry point');
  }
  for (const tab of g.tabs) {
    if (g.pinned) {
      assert.equal(tab.role, 'tab');
      assert.equal(tab.controls, tab.href.slice(1));
    }
    assert(tab.box.width >= 43 && tab.box.height >= 43, 'Stage controls need comfortable touch targets: ' + JSON.stringify(tab));
    assert(tab.box.left >= -1 && tab.box.right <= g.width + 1, 'Every stage must remain selectable on narrow layouts');
  }
  const activeTab = g.tabs.find(tab => tab.current === 'step').box;
  assert(g.indicator && Math.abs(g.indicator.left-activeTab.left) <= 3 &&
    Math.abs(g.indicator.top-activeTab.top) <= 3 && Math.abs(g.indicator.width-activeTab.width) <= 3 &&
    Math.abs(g.indicator.height-activeTab.height) <= 3,
  'The moving highlight must stay aligned with the selected stage: ' + JSON.stringify({indicator:g.indicator,activeTab}));
  const count = g.count.match(/(\d+)\s*(?:\/|of)\s*(\d+)/i);
  assert(count && Number(count[1]) === index + 1 && Number(count[2]) === 4, 'The slide count must match the selected stage: ' + g.count);
  assert.equal(await page.locator('[data-prev]').isDisabled(), index === 0);
  assert.equal(await page.locator('[data-next]').isDisabled(), index === ids.length - 1);

  assert(g.naturalWidth > 0 && g.naturalHeight > 0, 'A product image must load before it is reviewed');
  const file = path.basename(new URL(g.currentSrc).pathname);
  assert.equal(file,id+'.webp','The compact overview uses the complete desktop capture at every width');
  const record = captureManifest.captures.find(capture => capture.file === file);
  assert(record, 'The visible product image must be a verified complete capture: ' + file);
  assert.equal(g.naturalWidth, record.width);
  assert.equal(g.naturalHeight, record.height);
  assert.equal(record.view, id, 'The screenshot and its selected stage must agree');
  assert.equal(g.objectFit, 'contain', 'Product screens must be contained without cropping');
  assert(Math.abs(g.canvas.width / g.canvas.height - 1.6) < 0.025,
    'Every screenshot needs the same landscape presentation shape: ' + JSON.stringify(g.canvas));
  assert(g.figure.width <= 652 && g.canvas.height <= 408,
    'Product screenshots must stay compact, including long dashboard and sale captures: ' + JSON.stringify(g.figure));
  assert(g.image.left >= g.canvas.left - 2 && g.image.right <= g.canvas.right + 2 &&
    g.image.top >= g.canvas.top - 2 && g.image.bottom <= g.canvas.bottom + 2,
  'The screenshot must fit inside its presentation frame: ' + JSON.stringify(g));
  if (fitsViewport && g.pinned) {
    assert(g.stage.top >= -1 && g.stage.bottom <= g.height + 2 &&
      Math.abs(g.stage.top - (g.height - g.stage.height) / 2) <= 3,
      'The complete pinned presentation should sit neatly in the middle of the viewport: ' + JSON.stringify(g.stage));
    assert(g.figure.top >= g.controls.bottom - 2 && g.figure.bottom <= g.height + 2,
      'The complete product frame must fit below the persistent controls: ' + JSON.stringify(g));
    assert(g.copy.top >= g.controls.bottom - 2 && g.copy.bottom <= g.height + 2,
      'The active stage copy must remain fully in the viewport: ' + JSON.stringify(g));
    assert(g.controls.top >= -1 && g.controls.bottom <= g.height,
      'Stage navigation must remain in the viewport throughout the pinned reveal');
  }
  return g;
}

async function open(browser, width, height, {reduced = false, delayed = false, hash = '', noJS = false} = {}) {
  const context = await browser.newContext({
    viewport:{width,height}, isMobile:width < 900 && !isWebKit, hasTouch:width < 900,
    reducedMotion:reduced ? 'reduce' : 'no-preference', serviceWorkers:'block', javaScriptEnabled:!noJS
  });
  const missing = [];
  const external = [];
  const errors = [];
  let releaseImages = () => {};
  const gate = delayed ? new Promise(resolve => {releaseImages = resolve;}) : Promise.resolve();
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      external.push(url.origin + url.pathname);
      return route.abort();
    }
    const filename = path.resolve(site, '.' + url.pathname + (url.pathname.endsWith('/') ? 'index.html' : ''));
    if (!filename.startsWith(site + path.sep) || !fs.existsSync(filename)) {
      missing.push(url.pathname);
      return route.fulfill({status:404,body:'Missing public landing asset'});
    }
    if (path.extname(filename) === '.webp') await gate;
    return route.fulfill({contentType:types[path.extname(filename)] || 'application/octet-stream',body:fs.readFileSync(filename)});
  });
  if (!noJS) await context.addInitScript(() => {
    window.__landingInput = [];
    for (const type of ['wheel','scroll','pointerdown','pointerup','pointercancel','touchstart','touchend','focusin','click','resize','popstate']) {
      addEventListener(type, event => {
        window.__landingInput.push({type,y:scrollY,t:performance.now(),x:event.clientX,delta:event.deltaY,key:event.key});
        if (window.__landingInput.length > 16) window.__landingInput.shift();
      }, {passive:true});
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6500);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/' + hash, {waitUntil:'domcontentloaded'});
  await page.locator('.story').first().waitFor({state:'attached'});
  if (!noJS) await selected(page, ids.includes(hash.slice(1)) ? hash.slice(1) : 'sourcing');
  if (!delayed) {
    await decodeImages(page);
    await rest(page);
  }
  return {page,context,releaseImages,missing,external,errors};
}

async function check(browser, width, height, name, work, options = {}) {
  const run = await open(browser,width,height,options);
  try {
    await work(run.page,run);
    assert.deepEqual(run.missing, [], 'Every public landing asset must exist');
    assert.deepEqual(run.external, [], 'The landing test must not contact an external service');
    assert.deepEqual(run.errors, [], 'The landing page must not raise JavaScript errors');
    await run.page.screenshot({path:'/tmp/landing-scroll-' + engine + '-' + name + '.png'});
    console.log('PASS landing', engine, name);
  } catch (error) {
    const state = await run.page.evaluate(() => ({
      y:scrollY, hash:location.hash, active:document.querySelector('.jump [aria-current="step"]')?.getAttribute('href'),
      panels:[...document.querySelectorAll('.story')].map(el=>({id:el.id,hidden:el.hidden,inert:el.inert})),
      events:window.__landingInput
    })).catch(() => ({}));
    console.error('Landing failure state',JSON.stringify(state));
    await run.page.screenshot({path:'/tmp/landing-scroll-' + engine + '-' + name + '-failure.png'}).catch(() => {});
    throw error;
  } finally {
    run.releaseImages();
    await run.context.close();
  }
}

async function layoutChecks(browser) {
  for (const [width,height] of sizes) {
    await check(browser,width,height,width + 'x' + height,async page => {
      assert.equal(await page.evaluate(() => scrollY), 0, 'An untouched landing page must start at the top');
      const review = width === 390 || width === 1440;
      if (review) await page.screenshot({path:'/tmp/landing-scroll-' + engine + '-' + width + 'x' + height + '-hero.png'});
      let firstFrame;
      for (const id of ids) {
        await activate(page,id);
        const g = await assertSlide(page,id,{fitsViewport:true});
        if (width !== 320) assert(g.pinned,'The complete tour should fit and pin at ordinary phone, tablet and desktop sizes');
        if (!firstFrame) firstFrame = g;
        for (const key of ['canvas','figure']) {
          for (const size of ['width','height']) {
            assert(Math.abs(g[key][size] - firstFrame[key][size]) <= 2,
              'Every stage must use an identically sized screenshot frame: ' + JSON.stringify({width,height,id,key,size,first:firstFrame[key],actual:g[key]}));
          }
        }
        if (g.pinned) assert(Math.abs(g.figure.top-firstFrame.figure.top) <= 3,
          'The screenshot position must stay steady as the story changes: ' + JSON.stringify({first:firstFrame.figure,actual:g.figure}));
        if (review) await page.screenshot({path:'/tmp/landing-scroll-' + engine + '-' + width + 'x' + height + '-' + id + '.png'});
      }
      await page.locator('[data-prev]').click();
      await selected(page,'sale');
      await assertSlide(page,'sale');
      await page.locator('[data-next]').click();
      await selected(page,'dashboard');
      await assertSlide(page,'dashboard');
    });
  }
}

async function activeId(page) {
  return (await page.locator('.jump [aria-current="step"]').getAttribute('href')).slice(1);
}

async function wheelUntil(page, id, direction) {
  for (let attempt = 0; attempt < 12; attempt++) {
    if (await activeId(page) === id) {
      await selected(page,id);
      return assertSlide(page,id,{fitsViewport:true});
    }
    await page.mouse.wheel(0,140 * direction);
    await rest(page,240);
    await assertSlide(page,await activeId(page),{fitsViewport:true});
  }
  throw new Error('Native scrolling did not reveal ' + id + ' in the expected direction');
}

async function revealChecks(browser) {
  for (const [width,height] of [[390,844],[1440,900]]) {
    await check(browser,width,height,'native-scroll-reveal-' + width,async page => {
      await activate(page,'sourcing');
      const first = await assertSlide(page,'sourcing',{fitsViewport:true});
      assert(first.pinned,'The normal phone and desktop tour must support the pinned scroll reveal');
      await page.mouse.move(Math.round(width * .6),Math.round(height * .7));

      // Real wheel input must move the document through the story, while its
      // frame stays fixed and completely visible between transition points.
      const y = await page.evaluate(() => scrollY);
      await page.mouse.wheel(0,90);
      const paused = await rest(page);
      assert(paused > y + 60,'Scrolling must remain native rather than being swallowed by a slideshow');
      const held = await assertSlide(page,'sourcing',{fitsViewport:true});
      assert(Math.abs(held.figure.top-first.figure.top) <= 2 && Math.abs(held.controls.top-first.controls.top) <= 2,
        'A partial scroll must keep the full product presentation and stage rail fixed');
      await page.waitForTimeout(500);
      assert(Math.abs(await page.evaluate(() => scrollY)-paused) <= 1,
        'The reveal must not pull the page to a different position after scrolling stops');

      for (const id of ['stock','sale','dashboard']) {
        const g = await wheelUntil(page,id,1);
        assert(Math.abs(g.figure.top-first.figure.top) <= 3 && Math.abs(g.figure.height-first.figure.height) <= 2,
          'Scrolling to a new stage must preserve the same screenshot frame');
      }
      for (const id of ['sale','stock','sourcing']) await wheelUntil(page,id,-1);

      // A tab jump must update the physical scroll position too, so continuing
      // either way from it reveals adjacent stages instead of reverting.
      await activate(page,'sale');
      await wheelUntil(page,'dashboard',1);
      await activate(page,'sale');
      await wheelUntil(page,'stock',-1);

      await page.mouse.wheel(0,await page.evaluate(() => document.documentElement.scrollHeight));
      await rest(page);
      const footer = await page.locator('footer').evaluate(el => {
        const box = el.getBoundingClientRect();
        return {top:box.top,bottom:box.bottom,height:innerHeight};
      });
      assert(footer.top >= -1 && footer.bottom <= footer.height + 3,
        'Native scrolling must leave the tour and reach the full footer: ' + JSON.stringify(footer));
      assert.equal(await activeId(page),'dashboard','Leaving the tour must finish at its last stage without wrapping');
    });
  }
}

async function keyboardChecks(browser) {
  await check(browser,1440,900,'keyboard-and-native-scroll',async page => {
    await activate(page,'sourcing');
    await page.locator('#tab-sourcing').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-stock');
    assert.equal(await page.locator('.jump [aria-selected="true"]').getAttribute('href'), '#sourcing',
      'Arrow keys move tab focus without changing the slide until activation');
    await page.keyboard.press('Enter');
    await assertSlide(page,'stock');
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-dashboard');
    assert.equal(await page.locator('.jump [aria-selected="true"]').getAttribute('href'), '#stock');
    await page.keyboard.press('Space');
    await assertSlide(page,'dashboard');
    await page.keyboard.press('Home');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-sourcing');
    await page.keyboard.press('Enter');
    await assertSlide(page,'sourcing');

    // A native button becomes disabled at the first/last stage. Keep keyboard
    // focus on a usable selected tab instead of letting it fall back to body.
    await activate(page,'sale');
    await page.locator('[data-next]').focus();
    await page.keyboard.press('Enter');
    await assertSlide(page,'dashboard');
    assert.equal(await page.evaluate(() => document.activeElement.id),'tab-dashboard',
      'A newly disabled Next button must transfer focus to the selected stage');
    await activate(page,'stock');
    await page.locator('[data-prev]').focus();
    await page.keyboard.press('Space');
    await assertSlide(page,'sourcing');
    assert.equal(await page.evaluate(() => document.activeElement.id),'tab-sourcing',
      'A newly disabled Previous button must transfer focus to the selected stage');

    await rest(page);
    await page.locator('#sourcing').evaluate(el => el.focus({preventScroll:true}));
    const before = await page.evaluate(() => scrollY);
    await page.keyboard.press('PageDown');
    const after = await rest(page);
    assert(after > before + 100,'Page Down must retain native scrolling through the tour');
    assert.notEqual(await activeId(page),'sourcing','Native keyboard scrolling must reveal a later stage');
    await assertSlide(page,await activeId(page),{fitsViewport:true});
  });
}

async function navigationChecks(browser) {
  for (const width of [390,1440]) {
    await check(browser,width,900,'history-' + width,async page => {
      await assertSlide(page,'stock');
      await activate(page,'sale');
      assert.equal(new URL(page.url()).hash,'#sale');
      await page.locator('#sale .enlarge').evaluate(el => el.focus({preventScroll:true}));
      await page.goBack();
      await selected(page,'stock');
      await rest(page);
      await assertSlide(page,'stock');
      assert.equal(await page.evaluate(() => document.activeElement.id),'stock',
        'Back must move outgoing-panel focus into the newly visible panel');
      await page.locator('#stock .enlarge').evaluate(el => el.focus({preventScroll:true}));
      await page.goForward();
      await selected(page,'sale');
      await rest(page);
      await assertSlide(page,'sale');
      assert.equal(await page.evaluate(() => document.activeElement.id),'sale',
        'Forward must not leave focus inside the hidden previous panel');
      await page.setViewportSize({width:width === 390 ? 1024 : 390,height:width === 390 ? 600 : 844});
      await rest(page);
      await assertSlide(page,'sale');
      assert.equal(await page.locator('.story').count(),4,'Resizing must not duplicate the slides');
    },{hash:'#stock'});
  }
  await check(browser,390,844,'image-viewer',async page => {
    // Open the destination image as soon as its control is actionable. Waiting
    // for the page scroll first would miss a tab-jump/viewer interruption race.
    await page.locator('#tab-sale').click();
    const src = new URL(await page.locator('#sale .product-screen').getAttribute('data-phone-src'),origin).href;
    assert(src.includes('sale-phone.webp'),'The phone viewer needs the complete phone capture, separate from its compact overview');
    await page.locator('#sale .enlarge').click();
    await page.locator('#screen-viewer[open]').waitFor({state:'visible'});
    await page.waitForFunction(() => {const image=document.querySelector('#screen-viewer img');return image.complete && image.naturalWidth > 0;});
    const displayed = await page.locator('#screen-viewer img').evaluate(image => ({src:image.currentSrc || image.src,complete:image.complete,width:image.naturalWidth}));
    assert.equal(displayed.src,src,'Full-screen viewing on a phone must open the complete phone capture');
    assert(displayed.complete && displayed.width > 0,'The full-screen capture must load');
    assert(await page.locator('[data-close-viewer]').isVisible(),'The image viewer needs a visible close control');
    const viewerScroll = await page.locator('#screen-viewer .viewer-content').evaluate(el => {
      el.scrollTop = el.scrollHeight;
      return el.scrollTop;
    });
    assert(viewerScroll > 0,'The complete sale screen must remain scrollable in the phone viewer');
    await page.keyboard.press('Escape');
    await page.locator('#screen-viewer[open]').waitFor({state:'hidden'});
    await rest(page);
    await assertSlide(page,'sale');
    assert(await page.locator('#sale .enlarge').evaluate(el => el === document.activeElement),
      'Closing the image viewer must return focus to its opener');

    // History can replace the current stage while the modal remains open.
    // Its now-hidden original trigger is no longer a valid focus destination.
    await page.locator('#sale .enlarge').click();
    await page.locator('#screen-viewer[open]').waitFor({state:'visible'});
    assert.equal(await page.locator('#screen-viewer .viewer-content').evaluate(el => el.scrollTop),0,
      'Reopening a product screen must show its full heading instead of retaining the previous scroll position');
    await page.goBack();
    await selected(page,'sourcing');
    await page.keyboard.press('Escape');
    await page.locator('#screen-viewer[open]').waitFor({state:'hidden'});
    await page.waitForFunction(() => document.activeElement.id === 'tab-sourcing');
    await assertSlide(page,'sourcing');
    assert.equal(await page.evaluate(() => document.activeElement.id),'tab-sourcing',
      'Closing after history navigation must focus the current visible stage tab');
  });
}

async function touchChecks(browser) {
  await check(browser,390,844,'touch-and-sticky-controls',async (page,run) => {
    await activate(page,'sourcing');
    await assertSlide(page,'sourcing',{fitsViewport:true});
    if (!isWebKit) {
      const cdp = await run.context.newCDPSession(page);
      const touch = (type,points) => cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
      const image = await page.locator('#sourcing .screen-canvas').boundingBox();
      const touchY = Math.round(image.y+image.height/2);
      await touch('touchStart',[{x:330,y:touchY}]);
      for (const x of [285,240,195,150,105,60]) {
        await touch('touchMove',[{x,y:touchY+2}]);
        await page.waitForTimeout(20);
      }
      assert.equal(await activeId(page),'sourcing',
        'A held horizontal gesture must not advance before it finishes');
      // Exercise mixed keyboard/assistive focus and touch without scrolling
      // away from the native gesture's target before its release.
      await page.locator('#sourcing .enlarge').evaluate(el => el.focus({preventScroll:true}));
      await touch('touchEnd',[]);
      await selected(page,'stock');
      await rest(page);
      await assertSlide(page,'stock');
      assert.equal(await page.evaluate(() => document.activeElement.id),'stock',
        'Completing a swipe must move outgoing-panel focus into the new panel');
      assert.equal(await page.locator('#screen-viewer[open]').count(),0,'A swipe must not open the screenshot viewer');

      const stockImage = await page.locator('#stock .screen-canvas').boundingBox();
      const stockY = Math.round(stockImage.y+stockImage.height/2);
      await touch('touchStart',[{x:330,y:stockY}]);
      await touch('touchMove',[{x:250,y:stockY}]);
      await touch('touchCancel',[]);
      await rest(page);
      await assertSlide(page,'stock');

      let swipes = 0;
      while (await activeId(page) === 'stock' && swipes++ < 5) {
        const before = await page.evaluate(() => scrollY);
        const panel = await page.locator('#stock').boundingBox();
        const startY = Math.round(Math.min(730,panel.y+panel.height-20));
        await touch('touchStart',[{x:195,y:startY}]);
        for (const dy of [50,100,150,200,250,300]) {
          await touch('touchMove',[{x:197,y:startY-dy}]);
          await page.waitForTimeout(20);
        }
        // A short hold removes fling momentum; this measures ordinary touch
        // reading input rather than racing past the whole pinned section.
        await page.waitForTimeout(220);
        await touch('touchEnd',[]);
        const after = await rest(page);
        assert(after > before + 150,'A vertical swipe must natively scroll through the reveal');
        await assertSlide(page,await activeId(page),{fitsViewport:true});
      }
      await assertSlide(page,'sale',{fitsViewport:true});
      assert.equal(await page.locator('#screen-viewer[open]').count(),0,'Vertical scrolling must not accidentally open a screenshot');
      await cdp.detach();
    } else {
      await page.mouse.move(195,450);
      await wheelUntil(page,'stock',1);
    }
    const controls = await page.locator('.tour-controls').evaluate(el => {
      const r=el.getBoundingClientRect();
      return {top:r.top,bottom:r.bottom,height:innerHeight,position:getComputedStyle(document.querySelector('.tour-stage')).position};
    });
    assert.equal(controls.position,'sticky','The complete tour stage must stay pinned together');
    assert(controls.top >= -1 && controls.bottom < controls.height,
      'The persistent stage controls must remain visible while scrolling through the phone tour: ' + JSON.stringify(controls));
    await activate(page,'dashboard');
    const atEnd = await page.locator('.jump [aria-selected="true"]').getAttribute('href');
    await page.mouse.wheel(0,180);
    await rest(page);
    assert.equal(await page.locator('.jump [aria-selected="true"]').getAttribute('href'),atEnd,
      'Leaving the last stage must not wrap to the beginning');
  });
}

async function reducedMotionChecks(browser) {
  await check(browser,1440,900,'reduced-motion',async page => {
    await page.locator('.jump a[href="#sale"]').click();
    const motion = await page.locator('#sale').evaluate(el => ({
      opacity:Number(getComputedStyle(el).opacity),
      active:el.getAnimations({subtree:true}).filter(animation => animation.playState === 'running' &&
        animation.effect.getKeyframes().some(frame => 'transform' in frame || 'translate' in frame || 'opacity' in frame)).length
    }));
    assert.equal(motion.opacity,1,'Reduced-motion slide changes must appear immediately');
    assert.equal(motion.active,0,'Reduced motion must remove the slide entrance animation');
    await assertSlide(page,'sale');
    const before = await page.evaluate(() => scrollY);
    await page.mouse.move(1000,500);
    await page.mouse.wheel(0,145);
    const after = await rest(page);
    assert(after > before + 95,'Reduced motion retains ordinary vertical page scrolling');
    await assertSlide(page,'sale');
    await wheelUntil(page,'dashboard',1);
    const activeAnimations = await page.locator('#dashboard').evaluate(el => el.getAnimations().filter(animation => animation.playState === 'running').length);
    assert.equal(activeAnimations,0,'Native scrolling in reduced-motion mode must reveal the next stage without an entrance animation');
  },{reduced:true});
}

async function slowImageChecks(browser) {
  for (const width of [390,1440]) {
    await check(browser,width,844,'slow-images-' + width,async (page,run) => {
      await activate(page,'sale');
      const measure = () => page.evaluate(() => {
        const box = selector => {
          const r=document.querySelector(selector).getBoundingClientRect();
          return {top:r.top+scrollY,height:r.height};
        };
        return {y:scrollY,hero:box('.hero'),controls:box('.tour-controls'),panel:box('#sale'),image:box('#sale .screen-canvas')};
      });
      const before = await measure();
      run.releaseImages();
      await decodeImages(page);
      await rest(page);
      const after = await measure();
      for (const key of ['hero','controls','panel','image']) {
        assert(Math.abs(before[key].top-after[key].top) <= 2 && Math.abs(before[key].height-after[key].height) <= 2,
          'Late product images must keep the reserved layout: ' + JSON.stringify({width,key,before:before[key],after:after[key]}));
      }
      assert(Math.abs(before.y-after.y) <= 2,'Late images must not move the reader');
      await assertSlide(page,'sale');
    },{delayed:true});
  }
}

async function fallbackChecks(browser) {
  await check(browser,720,360,'short-viewport-reading',async page => {
    assert(!(await page.locator('.tour-deck').evaluate(el => el.classList.contains('tour-pinned'))),
      'A short viewport must use readable native sections when the complete presentation cannot fit');
    for (const id of ids) {
      await activate(page,id);
      await assertSlide(page,id);
      const heading = await page.locator('#'+id+' h3').boundingBox();
      const controls = await page.locator('.tour-controls').boundingBox();
      assert(heading && controls && heading.y >= controls.y+controls.height-2 && heading.y < 360,
        'Fallback stage navigation must expose the selected heading beneath the rail: ' + JSON.stringify({id,heading,controls}));
      assert(await page.locator('#'+id+' .enlarge').isVisible(),'The complete image remains reachable in the short-viewport fallback');
    }
  });
  for (const width of [390,1440]) {
    await check(browser,width,844,'no-script-' + width,async page => {
      for (const id of ids) {
        assert(await page.locator('#'+id).isVisible(),'Every feature remains readable without JavaScript');
        assert.equal(await page.locator('.jump a[href="#'+id+'"]').count(),1,'Fallback links retain their chapter targets');
      }
      assert(!(await page.locator('[data-prev]').isVisible()),'Inactive JavaScript-only controls should not appear in the fallback');
      assert(!(await page.locator('[data-next]').isVisible()),'Inactive JavaScript-only controls should not appear in the fallback');
      await page.locator('.jump a[href="#sale"]').click();
      assert.equal(new URL(page.url()).hash,'#sale');
      await rest(page);
      const heading = await page.locator('#sale h3').boundingBox();
      assert(heading && heading.y >= -1 && heading.y < 844,'Native fallback navigation must reveal the sale heading');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1),'The fallback must not overflow horizontally');
    },{noJS:true});
  }
}

(async () => {
  execFileSync(process.execPath,['scripts/build-site.cjs'],{cwd:root});
  captureManifest = captureChecks();
  const browser = await (isWebKit ? webkit : chromium).launch({
    headless:true,executablePath:isWebKit ? undefined : process.env.CHROMIUM_EXECUTABLE
  });
  try {
    await layoutChecks(browser);
    await revealChecks(browser);
    await keyboardChecks(browser);
    await navigationChecks(browser);
    await touchChecks(browser);
    await reducedMotionChecks(browser);
    await slowImageChecks(browser);
    await fallbackChecks(browser);
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error);process.exitCode=1;});
