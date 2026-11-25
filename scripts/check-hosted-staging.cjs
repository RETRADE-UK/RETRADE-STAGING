'use strict';
// This check contacts only public static files on the staging custom domain.
const { readFile } = require('node:fs/promises');
const { setTimeout: delay } = require('node:timers/promises');

const origin = 'https://test.retrade-uk.com';
const compareBuild = process.argv.includes('--compare-build');
const routes = [
  { path: '/', patterns: [/<main\b/, /href=["']\/signup\/["']/, /href=["']\/login\/["']/] },
  { path: '/signup/', marker: /id=["']auth-title-signup["']/ },
  { path: '/login/', marker: /id=["']auth-title-login["']/ },
  { path: '/dashboard/', marker: /data-tab=["']summary["']/ },
  { path: '/config/assets.js' }
];

async function checkRoute({ path, patterns, marker }) {
  const started = performance.now();
  const response = await fetch(origin + path, {
    redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(12000)
  });
  if (response.status !== 200) throw new Error('HTTP ' + response.status + ' ' + response.statusText);
  const body = Buffer.from(await response.arrayBuffer());
  const html = path.endsWith('/');
  const mime = response.headers.get('content-type') || '';
  if (!(html ? /text\/html/i : /(?:java|ecma)script/i).test(mime)) {
    throw new Error('Unexpected content type ' + mime);
  }
  let summary = '';
  const content = body.toString('utf8');
  if (html) {
    const required = patterns || [/<html\b[^>]*\bdata-workspace-routes\b/i, marker];
    if (required.some(pattern => !pattern.test(content))) throw new Error('Wrong document for this route');
    if (path === '/' && /<html\b[^>]*\bdata-workspace-routes\b/i.test(content)) {
      throw new Error('Homepage served the signed-in workspace shell');
    }
  } else {
    const payload = content.match(/globalThis\.RT_ASSETS\s*=\s*Object\.freeze\((\{[\s\S]*\})\);?\s*$/);
    const manifest = payload && JSON.parse(payload[1]);
    if (!manifest || manifest.environment !== 'staging' || !manifest.build) {
      throw new Error('Expected a versioned staging asset manifest');
    }
    summary = ' (build ' + manifest.build + ')';
  }
  if (compareBuild) {
    const file = '_site' + path + (html ? 'index.html' : '');
    if (!body.equals(await readFile(file))) throw new Error('Content differs from deployed commit artifact');
  }
  console.log(path + '  HTTP 200  ' + Math.round(performance.now() - started) + ' ms' + summary);
}

async function main() {
  const attempts = compareBuild ? 5 : 2;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const results = await Promise.allSettled(routes.map(checkRoute));
    const errors = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') return;
      const error = result.reason;
      const cause = error.cause;
      const detail = cause ? ' (' + (cause.code || cause.message) + ')' : '';
      errors.push(routes[index].path + '  ' + error.message + detail);
    });
    if (!errors.length) return;
    console.error('Attempt ' + attempt + '/' + attempts + '\n' + errors.join('\n'));
    if (attempt === attempts) throw new Error('Hosted staging verification failed');
    await delay(15000);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
