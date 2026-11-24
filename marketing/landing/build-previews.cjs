/* Build an offline entry point from the same classic scripts as the app.
 * No runtime flag on the signed-in app can select this entry point. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { root, assets } = require('../../scripts/assets.cjs');
const { buildFixture } = require('./capture-fixture.cjs');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');

function between(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
  if (a < 0 || b < 0 || text.indexOf(start, a + start.length) !== -1) {
    throw new Error('Review the landing preview entry point after the app changed: ' + start);
  }
  return text.slice(a, b);
}

module.exports = function buildPreviews(out) {
  const dir = path.join(out, 'landing1', 'preview');
  fs.mkdirSync(dir, { recursive: true });
  function asset(name, ext, content) {
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
    const file = name + '-' + hash + '.' + ext;
    fs.writeFileSync(path.join(dir, file), content);
    return '../' + file;
  }
  let core = read(assets.core);
  // Exclude both backend bindings and startup side effects at build time.
  core = core.replace(between(core, 'const SUPABASE_URL =', 'let _previewMode'), 'const _sb = null;\nlet _pwRecovery = false;\n');
  core = core.replace(between(core, "if(!PREVIEW_MODE_ENABLED && 'serviceWorker'", 'const RETRADE_SCHEMA_VERSION'), '');
  core = core.replace(between(core, '_setAuthScreen(_authRouteName());', '// SUPABASE MIGRATION'), '');
  const periodMarker = "{key:'current_fy',label:'Current FY'}";
  if (!core.includes(periodMarker)) throw new Error('Dashboard period choices have changed');
  core = core.replace(periodMarker, "{key:'cy',label:'Calendar year to date'}," + periodMarker);

  const fixture = buildFixture({ showcase: true });
  const viewScripts = {};
  const manifests = { summary: { views: {}, viewRoutes: {} } };
  for (const [route, key] of Object.entries({ monthly: 'sales', stock: 'stock', expenses: 'costs' })) {
    const view = assets.views[key];
    manifests[route] = { views: { [key]: view }, viewRoutes: { [route]: key } };
    // The optional script declares the selected view. The common script runs
    // its registration after the sandbox check, view loader and core are ready.
    viewScripts[route] = asset('view-' + key, 'js', 'function registerPreviewView() {\n' + read(view.file) + '\n}');
  }
  const state = JSON.stringify({ db: fixture.db, runs: fixture.runs, asOf: fixture.asOf });
  const script = asset('workspace', 'js', [
    'const previewSeed = ' + state + ';', read('marketing/landing/preview-environment.js'),
    'window.RT_ASSETS = ' + JSON.stringify(manifests) + '[document.body.dataset.preview];',
    read('src/domain/accounting-engine.js'), read('src/domain/report-engine.js'), read('src/platform/view-loader.js'), core,
    'if (typeof registerPreviewView === "function") registerPreviewView();',
    ...assets.critical.filter(file => file.startsWith('src/features/charts/')).map(read),
    read('src/domain/relist-fees.js'), read('marketing/landing/preview-start.js')
  ].join('\n;\n'));
  const styles = assets.styles.filter(file => !['assets/styles/monitors.css', 'assets/styles/tax.css'].includes(file));
  const css = asset('workspace', 'css', [...styles.map(read), read('marketing/landing/preview.css')].join('\n'));
  const shell = read('index.html');
  const panels = between(shell, '<div class="panel-overlay"', '<!-- ====') +
    between(shell, '<div id="toast">', '<!-- ── AUTH OVERLAY');
  const policy = "default-src 'none'; script-src 'self'; script-src-attr 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; worker-src 'none'";
  for (const [page, route] of Object.entries({ dashboard: 'summary', sales: 'monthly', stock: 'stock', expenses: 'expenses' })) {
    const target = path.join(dir, page);
    fs.mkdirSync(target, { recursive: true });
    const viewScript = viewScripts[route] ? `<script src="${viewScripts[route]}"></script>` : '';
    fs.writeFileSync(path.join(target, 'index.html'), `<!doctype html><html lang="en-GB" data-theme="dark"><head>
<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>RETRADE · ${page} example</title><link rel="stylesheet" href="${css}"></head>
<body class="rt" data-preview="${route}" onload="parent.postMessage(document.documentElement.hasAttribute('data-preview-ready') ? 'retrade-preview-ready' : 'retrade-preview-error', location.origin)"><main id="main-content"><div class="page on" id="p-${route}"><p class="preview-loading" role="status"></p></div></main>
${panels}${viewScript}<script src="${script}"></script></body></html>`);
  }
};
