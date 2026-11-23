// Validate the final directory that Pages uploads, including generated routes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { root, assets, shipped } = require('./assets.cjs');
const site = path.join(root, '_site');
const expected = new Set([...shipped, '.nojekyll']);
const read = file => fs.readFileSync(path.join(site, file), 'utf8');

for (const route of ['login', 'signup', 'dashboard', 'start', 'landing1', 'landing2']) {
  expected.add(route + '/index.html');
}
const previewRoot = 'landing1/preview/';
for (const page of ['dashboard', 'sales', 'stock', 'expenses']) {
  const document = previewRoot + page + '/index.html';
  expected.add(document);
  const html = read(document);
  for (const extension of ['js', 'css']) {
    const link = html.match(new RegExp('(?:src|href)="\\.\\./(workspace-([0-9a-f]{16})\\.' + extension + ')"'));
    assert(link, 'Missing content-hashed ' + extension + ' in ' + document);
    const file = previewRoot + link[1];
    const hash = createHash('sha256').update(fs.readFileSync(path.join(site, file))).digest('hex');
    assert.equal(hash.slice(0, 16), link[2], 'Generated preview asset hash changed: ' + file);
    expected.add(file);
  }
}
const actual = fs.readdirSync(site, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => path.relative(site, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
assert.deepEqual(actual.sort(), [...expected].sort(), 'Pages must contain only declared runtime files and public routes');
const landing = read('index.html');
assert.match(read('landing1/index.html'), /name="robots" content="noindex,nofollow"/, 'Keep the review route out of search');
if (assets.environment === 'production') {
  assert(!landing.includes('noindex'), 'The production homepage must be indexable');
  assert(landing.includes('rel="canonical" href="https://retrade-uk.com/"'), 'Set the production canonical URL');
} else {
  assert.equal(landing, read('landing1/index.html'), 'The staging home and its review URL share one landing page');
}
assert(landing.includes('/assets/landing/entry.js'), 'The homepage must handle legacy email callbacks');
assert(!landing.includes('/landing2/'), 'The retired comparison must not appear on the public landing');
assert.match(read('landing2/index.html'), /http-equiv="refresh" content="0;url=\/landing1\/"/,
  'Existing comparison links must reach the new landing with JavaScript disabled');
for (const match of landing.matchAll(/(?:src|href|srcset)="(\/assets\/[^"\s?#]+)(?:[?#][^"]*)?"/g)) {
  assert(expected.has(match[1].slice(1)), 'Landing asset missing from Pages: ' + match[1]);
}
for (const file of shipped.filter(name => name.startsWith('assets/vendor/') || name === 'CNAME')) {
  assert(fs.readFileSync(path.join(root, file)).equals(fs.readFileSync(path.join(site, file))), 'Packaged bytes differ: ' + file);
}
console.log('Verified ' + actual.length + ' public files in the Pages artifact');
