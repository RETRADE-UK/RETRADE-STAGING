/* Public landing interaction regressions. Assets come only from the Pages build;
 * no authentication, business data or external network is used. Chromium tests
 * native touch input; WebKit checks wheel input at the same mobile viewports. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium, webkit} = require('playwright');

const root = path.resolve(__dirname, '..');
const site = path.join(root, '_site');
const origin = 'http://retrade.test';
const isWebKit = process.argv.includes('--webkit');
const engine = isWebKit ? 'webkit' : 'chromium';
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml'};
const sizes = [[320,568], [390,844], [768,1024], [1024,600], [1440,900]];

async function rest(page, minimum = 850) {
  // Observe the result, not the implementation's timers or animation state.
  const started = Date.now();
  let last = await page.evaluate(() => scrollY);
  let quietSince = started;
  while (Date.now() - started < 6500) {
    await page.waitForTimeout(60);
    const y = await page.evaluate(() => scrollY);
    if (Math.abs(y - last) > 0.5) quietSince = Date.now();
    last = y;
    if (Date.now() - started >= minimum && Date.now() - quietSince >= 300) return y;
  }
  throw new Error('Landing scroll did not settle within 6.5 seconds');
}

async function geometry(page, id) {
  return page.evaluate(id => {
    const story = document.getElementById(id);
    const box = element => {
      const r = element.getBoundingClientRect();
      return {top:r.top, bottom:r.bottom, height:r.height, absoluteTop:r.top + scrollY};
    };
    return {
      id, y:scrollY, height:innerHeight, width:innerWidth,
      maxY:document.documentElement.scrollHeight - innerHeight,
      desktop:document.documentElement.classList.contains('sticky-tour'),
      story:box(story), copy:box(story.querySelector('.story-copy')), figure:box(story.querySelector('figure')),
      stage:box(document.querySelector('.stage-inner')),
      active:document.querySelector('.jump a[aria-current]')?.getAttribute('href'),
      pane:document.querySelector('.pane.current')?.className,
      overflow:document.documentElement.scrollWidth - innerWidth,
      probe:window.__landingProbe, inputEvents:window.__landingInput
    };
  }, id);
}

async function position(page, top) {
  await page.evaluate(top => scrollTo({top, behavior:'instant'}), top);
  await rest(page);
}

async function wheel(page, delta) {
  const viewport = page.viewportSize();
  await page.mouse.move(Math.round(viewport.width * 0.65), Math.round(viewport.height * 0.6));
  await page.mouse.wheel(0, delta);
}

async function assertChapter(page, id) {
  const g = await geometry(page, id);
  assert(g.overflow <= 1, `Horizontal overflow at ${g.width}px: ${g.overflow}`);
  assert.equal(g.active, '#' + id, `Chapter indicator must match ${id}`);
  if (g.desktop) {
    assert(Math.abs(g.story.top + g.story.height / 2 - g.height / 2) <= 4,
      `Desktop ${id} must finish centred: ${JSON.stringify(g)}`);
    assert(g.pane?.split(' ').includes(id), `Visible screenshot must match ${id}: ${g.pane}`);
    assert(g.stage.top >= 8 && g.stage.bottom <= g.height - 8,
      `Desktop screenshot frame must remain fully visible: ${JSON.stringify(g)}`);
    assert(g.copy.top >= 8 && g.copy.bottom <= g.height - 8,
      `Desktop chapter copy must be fully readable: ${JSON.stringify(g)}`);
  } else {
    assert(g.copy.top >= 12 && g.copy.top <= 48,
      `Inline ${id} must finish with comfortable top spacing: ${JSON.stringify(g)}`);
    if (g.copy.height <= g.height - 48) assert(g.copy.bottom <= g.height - 4,
      `Inline chapter copy that fits must remain visible: ${JSON.stringify(g)}`);
  }
}

async function open(browser, width, height, {reduced = false, delayed = false, hash = ''} = {}) {
  const context = await browser.newContext({
    // Playwright rejects mouse.wheel in WebKit's isMobile mode. The WebKit
    // checks are explicitly responsive viewport coverage; Chromium adds touch.
    viewport:{width,height}, isMobile:width < 900 && !isWebKit, hasTouch:width < 900,
    reducedMotion:reduced ? 'reduce' : 'no-preference', serviceWorkers:'block'
  });
  const missing = [];
  const errors = [];
  let releaseImages;
  const imageGate = delayed ? new Promise(resolve => {releaseImages = resolve;}) : Promise.resolve();
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const filename = path.resolve(site, '.' + url.pathname + (url.pathname.endsWith('/') ? 'index.html' : ''));
    if (!filename.startsWith(site + path.sep) || !fs.existsSync(filename)) {
      missing.push(url.pathname);
      return route.fulfill({status:404, body:'Missing landing test asset'});
    }
    if (path.extname(filename) === '.webp') await imageGate;
    let body = fs.readFileSync(filename);
    if (url.pathname === '/assets/landing/tour.js') body = body.toString().replace('function settle() {', 'function settle() { window.__landingProbe = {pending,touching,pointing,keys:keys.size,motion,startY,y:scrollY,lastInput,lastScroll,now:performance.now(),reduced:reduced.matches,hidden:document.hidden,scale:window.visualViewport?.scale,collapsed:getSelection()?.isCollapsed};');
    return route.fulfill({contentType:types[path.extname(filename)] || 'application/octet-stream', body});
  });
  await context.addInitScript(() => {
    window.__landingInput = [];
    for (const type of ['wheel','scroll','touchstart','touchend','pointerdown','pointerup','focusin','click','resize','pageshow','blur']) {
      addEventListener(type, event => {
        window.__landingInput.push({type,y:scrollY,t:performance.now(),delta:event.deltaY,hidden:document.hidden,scale:visualViewport?.scale});
        if (window.__landingInput.length > 20) window.__landingInput.shift();
      }, {passive:true});
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6500);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/' + hash, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.querySelectorAll('.story-copy').length === 4);
  if (!delayed) {
    await page.evaluate(async () => {
      const images = [...document.images];
      images.forEach(img => {img.loading = 'eager';});
      await Promise.all(images.map(img => img.decode()));
    });
    await rest(page);
  }
  return {
    page, context, releaseImages,
    async finish(name) {
      assert.deepEqual(missing, [], 'Every requested landing asset must exist');
      assert.deepEqual(errors, [], 'Landing page must not raise JavaScript errors');
      await page.screenshot({path:`/tmp/landing-scroll-${engine}-${name}.png`});
      await context.close();
    }
  };
}

async function chapterChecks(browser, width, height) {
  const run = await open(browser, width, height);
  const {page} = run;
  try {
    assert.equal(await page.evaluate(() => scrollY), 0, 'Initial load must remain at the top');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No initial horizontal overflow');
    for (const id of ['sourcing', 'stock', 'sale', 'dashboard']) {
      const g = await geometry(page, id);
      const target = g.desktop ? g.story.absoluteTop + (g.story.height - g.height) / 2 : g.copy.absoluteTop - 24;
      // A real wheel operation ends close to a reading position, after which the
      // page should settle without requiring an exact pixel from the user.
      await position(page, target - 95);
      await wheel(page, 30);
      await rest(page);
      await assertChapter(page, id);
    }
    const g = await geometry(page, 'stock');
    if (!g.desktop) {
      const combinedHeight = g.figure.absoluteTop + g.figure.height - g.copy.absoluteTop;
      if (combinedHeight > g.height && g.figure.height <= g.height - 56) {
        const centre = g.figure.absoluteTop + (g.figure.height - g.height) / 2;
        await position(page, centre + 75);
        await wheel(page, -20);
        await rest(page);
        const result = await geometry(page, 'stock');
        assert(Math.abs(result.figure.top + result.figure.height / 2 - result.height / 2) <= 4,
          `A screenshot that fits must settle fully in view: ${JSON.stringify(result)}`);
      } else if (g.figure.height > g.height + 100) {
        const inside = g.figure.absoluteTop + (g.figure.height - g.height) / 2;
        await position(page, inside - 20);
        const before = await page.evaluate(() => scrollY);
        await wheel(page, 40);
        const after = await rest(page);
        assert(after >= before + 20 && after <= before + 65,
          'A screenshot taller than the viewport must allow reading within it');
      }
    }
    await run.finish(`${width}x${height}`);
    console.log('PASS landing reading positions, matching screenshots and no overflow', engine, `${width}x${height}`);
  } catch (error) {
    await page.screenshot({path:`/tmp/landing-scroll-${engine}-${width}x${height}-failure.png`}).catch(() => {});
    await run.context.close();
    throw error;
  }
}

async function gestureChecks(browser) {
  const run = await open(browser, 1440, 900);
  const {page} = run;
  try {
    let g = await geometry(page, 'stock');
    const centre = g.story.absoluteTop + (g.story.height - g.height) / 2;
    await position(page, centre);
    let previous = await page.evaluate(() => scrollY);
    for (let i = 0; i < 10; i++) {
      await wheel(page, 22);
      await page.waitForTimeout(45);
      const current = await page.evaluate(() => scrollY);
      assert(current >= previous - 3, 'Continuous downward input must not be pulled back by settling');
      previous = current;
    }
    assert(previous > centre + 120, 'Continuous wheel gesture must move the page naturally');
    await rest(page);
    await assertChapter(page, 'sale');
    await wheel(page, -120);
    await rest(page);
    await assertChapter(page, 'stock');
    await wheel(page, 120);
    await rest(page);
    await assertChapter(page, 'sale');

    await position(page, centre + 280);
    await wheel(page, 25);
    const releasedAt = await page.evaluate(() => scrollY);
    await page.waitForFunction(y => scrollY < y - 15, releasedAt);
    const interruptedAt = await page.evaluate(() => scrollY);
    await wheel(page, 630);
    await page.waitForFunction(y => scrollY > y + 100, interruptedAt, {timeout:1000});
    await rest(page);
    await assertChapter(page, 'sale');

    g = await geometry(page, 'sourcing');
    const first = g.story.absoluteTop + (g.story.height - g.height) / 2;
    await position(page, first + 80);
    await wheel(page, -30);
    await rest(page);
    await assertChapter(page, 'sourcing');
    await wheel(page, -1100);
    const outside = await rest(page);
    assert(outside < first - 500, 'The tour must not trap scrolling back to the introduction');
    await page.keyboard.press('End');
    await rest(page);
    assert(await page.evaluate(() => Math.abs(scrollY - (document.documentElement.scrollHeight - innerHeight)) <= 3),
      'The closing section and footer must remain reachable');
    await page.keyboard.press('Home');
    await rest(page);
    assert.equal(await page.evaluate(() => scrollY), 0, 'Home must reach the page beginning');
    await run.finish('wheel-interruption');
    console.log('PASS landing continuous wheel, interruption and tour exit', engine);
  } catch (error) {
    await page.screenshot({path:`/tmp/landing-scroll-${engine}-gesture-failure.png`}).catch(() => {});
    await run.context.close();
    throw error;
  }
}

async function touchChecks(browser) {
  const run = await open(browser, 390, 844);
  const {page} = run;
  try {
    let g = await geometry(page, 'stock');
    await position(page, g.copy.absoluteTop - 24 + 45);
    if (isWebKit) {
      // Playwright exposes CDP touch dispatch only for Chromium; do not label
      // WebKit's mobile viewport wheel coverage as a physical touch test.
      await wheel(page, -35);
    } else {
      const cdp = await run.context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x:190,y:430}]});
      await cdp.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[{x:190,y:470}]});
      await page.waitForTimeout(350);
      const heldAt = await page.evaluate(() => scrollY);
      await page.waitForTimeout(350);
      assert(Math.abs(await page.evaluate(() => scrollY) - heldAt) <= 3,
        'The page must not settle while a finger is still touching the screen');
      await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
      await cdp.detach();
    }
    await rest(page);
    await assertChapter(page, 'stock');
    await page.setViewportSize({width:844,height:390});
    await rest(page);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Landscape must not overflow');
    g = await geometry(page, 'stock');
    assert(g.figure.height > g.height + 70, 'Landscape fixture must exercise an oversized screenshot');
    const inside = g.figure.absoluteTop + (g.figure.height - g.height) / 2;
    await position(page, inside - 20);
    const beforeReading = await page.evaluate(() => scrollY);
    await wheel(page, 40);
    const afterReading = await rest(page);
    assert(Math.abs(afterReading - beforeReading - 40) <= 8,
      'An oversized landscape screenshot must remain freely scrollable inside its reading area');
    await page.setViewportSize({width:1024,height:600});
    await page.waitForFunction(() => document.documentElement.classList.contains('sticky-tour'));
    g = await geometry(page, 'stock');
    await position(page, g.story.absoluteTop + (g.story.height - g.height) / 2 + 75);
    await wheel(page, -20);
    await rest(page);
    await assertChapter(page, 'stock');
    assert.equal(await page.locator('.pane').count(), 4, 'Changing breakpoints must not duplicate screenshots');
    await run.finish('touch-and-resize');
    console.log('PASS landing', engine, isWebKit ? 'mobile viewport wheel' : 'native touch/held-finger', 'and breakpoint changes');
  } catch (error) {
    await page.screenshot({path:`/tmp/landing-scroll-${engine}-touch-failure.png`}).catch(() => {});
    await run.context.close();
    throw error;
  }
}

async function navigationChecks(browser) {
  for (const width of [390,1440]) {
    const run = await open(browser, width, 900, {hash:'#stock'});
    const {page} = run;
    try {
      await assertChapter(page, 'stock');
      // Keep the previous history entry at the chapter. Playwright's ordinary
      // click would first scroll this off-screen navigation into view, changing
      // the position that Back is correctly expected to restore.
      await page.locator('.jump a[href="#sale"]').evaluate(link => link.click());
      await rest(page);
      assert.equal(new URL(page.url()).hash, '#sale');
      await assertChapter(page, 'sale');
      await page.goBack();
      await rest(page);
      assert.equal(new URL(page.url()).hash, '#stock');
      await assertChapter(page, 'stock');
      await run.finish(`history-${width}`);
    } catch (error) {
      await page.screenshot({path:`/tmp/landing-scroll-${engine}-history-${width}-failure.png`}).catch(() => {});
      await run.context.close();
      throw error;
    }
  }
  const reduced = await open(browser, 1440, 900, {reduced:true, hash:'#stock'});
  try {
    const before = await reduced.page.evaluate(() => scrollY);
    await wheel(reduced.page, 145);
    const after = await rest(reduced.page);
    assert(Math.abs(after - before - 145) <= 6, 'Reduced motion must leave native scrolling free of automatic settling');
    await reduced.page.locator('.jump a[href="#sale"]').click();
    await rest(reduced.page);
    const g = await geometry(reduced.page, 'sale');
    assert(g.copy.top >= 0 && g.copy.bottom <= g.height, 'Reduced-motion chapter navigation remains readable');
    await reduced.finish('reduced-motion');
  } catch (error) {
    await reduced.page.screenshot({path:`/tmp/landing-scroll-${engine}-reduced-motion-failure.png`}).catch(() => {});
    await reduced.context.close();
    throw error;
  }
  console.log('PASS landing direct links, history and reduced motion', engine);
}

async function slowImageChecks(browser) {
  for (const width of [390,1440]) {
    const run = await open(browser, width, 844, {delayed:true});
    const {page} = run;
    const measure = () => page.evaluate(() => [...document.querySelectorAll('.hero, .story')].map(node => {
      const r = node.getBoundingClientRect();
      return {top:r.top + scrollY, height:r.height};
    }));
    try {
      const before = await measure();
      run.releaseImages();
      await page.evaluate(async () => {
        const images = [...document.images];
        images.forEach(img => {img.loading = 'eager';});
        await Promise.all(images.map(img => img.decode()));
      });
      await rest(page);
      const after = await measure();
      before.forEach((box, i) => {
        assert(Math.abs(box.top - after[i].top) <= 2 && Math.abs(box.height - after[i].height) <= 2,
          `Loading images must not move reading positions (${width}px, section ${i}): ${JSON.stringify({before:box,after:after[i]})}`);
      });
      assert.equal(await page.evaluate(() => scrollY), 0, 'Late images must not scroll an untouched page');
      await run.finish(`slow-images-${width}`);
    } catch (error) {
      run.releaseImages();
      await page.screenshot({path:`/tmp/landing-scroll-${engine}-slow-images-${width}-failure.png`}).catch(() => {});
      await run.context.close();
      throw error;
    }
  }
  console.log('PASS landing image layout stability', engine);
}

(async () => {
  execFileSync(process.execPath, ['scripts/build-site.cjs'], {cwd:root});
  const browser = await (isWebKit ? webkit : chromium).launch({headless:true, executablePath:isWebKit ? undefined : process.env.CHROMIUM_EXECUTABLE});
  try {
    for (const [width,height] of sizes) await chapterChecks(browser, width, height);
    await gestureChecks(browser);
    await touchChecks(browser);
    await navigationChecks(browser);
    await slowImageChecks(browser);
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
