// Validate the final directory that Pages uploads, including generated routes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { root, shipped } = require('./assets.cjs');
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
  for (const [name, extension] of [['workspace','js'], ['workspace','css'], [page,'js']]) {
    const link = html.match(new RegExp('(?:src|href)="\\.\\./(' + name + '-([0-9a-f]{16})\\.' + extension + ')"'));
    assert(link, 'Missing content-hashed ' + name + '.' + extension + ' in ' + document);
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
assert(read('index.html').includes('id="tour-title"'), 'Public homepage must show the reseller tour');
for (const file of shipped.filter(name => name.startsWith('assets/vendor/') || name === 'CNAME')) {
  assert(fs.readFileSync(path.join(root, file)).equals(fs.readFileSync(path.join(site, file))), 'Packaged bytes differ: ' + file);
}
console.log('Verified ' + actual.length + ' public files in the Pages artifact');
