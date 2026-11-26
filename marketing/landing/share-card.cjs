/* Run from the repository with: node marketing/landing/share-card.cjs */
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const assets = path.resolve(__dirname, '../../assets/landing');
function inlineImage(file, type) {
  return 'data:image/' + type + ';base64,' + fs.readFileSync(path.join(assets, file)).toString('base64');
}

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE});
  try {
    const page = await browser.newPage({viewport: {width: 1200, height: 630}});
    await page.setContent(`<!doctype html><html lang="en-GB"><meta charset="utf-8">
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; height: 630px; overflow: hidden; color: #fafbf9;
          background: radial-gradient(ellipse at 94% 7%, #2b3c52, #141f30 46%, #0b111c 78%);
          font-family: Arial, sans-serif; }
        main { position: relative; z-index: 1; width: 700px; padding: 56px 0 0 68px; }
        .brand { display: flex; align-items: center; gap: 11px; font-size: 37px;
          font-style: italic; font-weight: 800; letter-spacing: -2.2px; }
        .brand img { width: 42px; height: auto; }
        .brand b, h1 em { color: #ffd374; }
        h1 { margin: 67px 0 24px; font-size: 72px; letter-spacing: -4.2px; line-height: .99; }
        h1 em { font: italic 66px/1.1 Georgia, serif; letter-spacing: -3.4px; }
        p { margin: 0; max-width: 470px; color: #bdcadb; font-size: 25px; line-height: 1.4; }
        .screen { position: absolute; top: 122px; left: 666px; width: 680px;
          border: 1px solid #68758a; border-radius: 15px; padding: 6px; background: #1c283c;
          box-shadow: 0 28px 70px #03050ab3; transform: rotate(-4deg); }
        .screen img { display: block; width: 100%; border-radius: 10px; }
      </style>
      <main>
        <div class="brand"><img alt="" src="${inlineImage('mark.svg', 'svg+xml')}"><span>RE<b>TRADE</b></span></div>
        <h1>You find the<br>bargains.<br><em>We track the margins.</em></h1>
        <p>Stock, sales and profit tracking for UK resellers.</p>
      </main>
      <div class="screen"><img alt="RETRADE example dashboard" src="${inlineImage('open-dashboard-7d.webp', 'webp')}"></div>
      </html>`);
    await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
    await page.screenshot({path: path.join(assets, 'share-card.png')});
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
