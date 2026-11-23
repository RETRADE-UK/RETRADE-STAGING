// Run from the repository root with Playwright Chromium and Python/Pillow.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { openOffline, resetScroll, stableView } = require('./capture.cjs');

async function main() {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE && { executablePath: process.env.CHROMIUM_EXECUTABLE }) });
  try {
    for (const mobile of [false, true]) {
      const { context, page, errors, missingAssets, databaseAttempts } = await openOffline(browser, mobile);
      if (!mobile) await page.setViewportSize({ width: 1440, height: 820 });
      await page.evaluate(() => goToTab('monthly'));
      await page.locator('#p-monthly [aria-label="Sort sales"]').waitFor();
      await page.addStyleTag({ content: '#rt-staging-marker { display: none !important; }' });
      await resetScroll(page);
      await stableView(page);
      assert.match(await page.locator('#p-monthly').innerText(), /Highest profit/);
      assert.deepEqual([...errors, ...missingAssets, ...databaseAttempts], []);
      const screenshot = await page.screenshot({ animations: 'disabled' });
      const path = 'assets/landing/sales' + (mobile ? '-phone' : '') + '.webp';
      execFileSync(process.env.PYTHON_EXECUTABLE || 'python3', ['-c',
        'from PIL import Image\nfrom io import BytesIO\nimport sys\nImage.open(BytesIO(sys.stdin.buffer.read())).convert("RGB").save(sys.argv[1], quality=87, method=6)',
        path], { input: screenshot });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
