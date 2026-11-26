// Validate the final directory that Pages uploads, including generated routes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { root, assets, shipped } = require('./assets.cjs');
const { routes } = require('../marketing/site/layout.cjs');
const site = path.join(root, '_site');
const expected = new Set([...shipped, '.nojekyll']);
const read = file => fs.readFileSync(path.join(site, file), 'utf8');
const production = assets.environment === 'production';
const publicOrigin = production ? 'https://retrade-uk.com' : 'https://test.retrade-uk.com';
if (production) {
  expected.add('robots.txt');
  expected.add('sitemap.xml');
  const publicURLs = [publicOrigin + '/', ...routes.map(route => publicOrigin + '/' + route + '/')];
  assert.deepEqual([...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]).sort(), publicURLs.sort(),
    'The sitemap must contain exactly the canonical marketing pages');
  assert.match(read('robots.txt'), /^Sitemap: https:\/\/retrade-uk\.com\/sitemap\.xml$/m);
  assert.doesNotMatch(read('robots.txt'), /^Disallow:\s*\//mi, 'Allow search engines to fetch the public site');
}

assert.deepEqual([...assets.publicPages].sort(), [...routes].sort(), 'All generated public pages must have an offline route');
for (const route of ['login', 'signup', 'dashboard', 'start', 'landing1', 'landing2', ...routes]) {
  expected.add(route + '/index.html');
}
const previewRoot = 'landing1/preview/';
const previewViews = { dashboard: null, sales: 'sales', stock: 'stock', expenses: 'costs' };
for (const [page, view] of Object.entries(previewViews)) {
  const document = previewRoot + page + '/index.html';
  expected.add(document);
  const html = read(document);
  const resources = [...html.matchAll(/(?:src|href)="\.\.\/([^"]+)"/g)];
  const referenced = [];
  for (const [, name] of resources) {
    const match = name.match(/^(workspace|view-(?:sales|stock|costs))-([a-f0-9]{16})\.(css|js)$/);
    assert(match, 'Unexpected preview asset in ' + document + ': ' + name);
    const file = previewRoot + name;
    const hash = createHash('sha256').update(fs.readFileSync(path.join(site, file))).digest('hex');
    assert.equal(hash.slice(0, 16), match[2], 'Generated preview asset hash changed: ' + file);
    referenced.push(match[1] + '.' + match[3]);
    expected.add(file);
  }
  const required = ['workspace.css', ...(view ? ['view-' + view + '.js'] : []), 'workspace.js'];
  assert.deepEqual(referenced, required, 'Load only the selected view before startup in ' + document);
}
const actual = fs.readdirSync(site, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => path.relative(site, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
assert.deepEqual(actual.sort(), [...expected].sort(), 'Pages must contain only declared runtime files and public routes');
const landing = read('index.html');
assert.match(read('landing1/index.html'), /name="robots" content="noindex,nofollow"/, 'Keep the review route out of search');
if (production) {
  assert(!landing.includes('noindex'), 'The production homepage must be indexable');
  assert(landing.includes('rel="canonical" href="https://retrade-uk.com/"'), 'Set the production canonical URL');
} else {
  assert.equal(landing, read('landing1/index.html'), 'The staging home and its review URL share one landing page');
}
assert(landing.includes('/assets/landing/entry.js'), 'The homepage must handle legacy email callbacks');
assert(!landing.includes('/landing2/'), 'The retired comparison must not appear on the public landing');
assert.match(read('landing2/index.html'), /http-equiv="refresh" content="0;url=\/landing1\/"/,
  'Existing comparison links must reach the new landing with JavaScript disabled');
// PNG IHDR includes intrinsic dimensions at offsets 16 and 20.
const shareImage = fs.readFileSync(path.join(site, 'assets/landing/share-card.png'));
assert(shareImage.readUInt32BE(0) === 0x89504e47 && shareImage.readUInt32BE(16) === 1200 && shareImage.readUInt32BE(20) === 630,
  'Share card must match its advertised PNG format and dimensions');
const seenTitles = new Set();
const siteDocuments = new Map();
for (const route of ['', ...routes]) {
  const pathname = route ? '/' + route + '/' : '/';
  const html = read(pathname.slice(1) + 'index.html');
  assert(!/\{\{[A-Z_]+\}\}/.test(html), 'Unexpanded page content on ' + pathname);
  assert.equal([...html.matchAll(/<h1\b/gi)].length, 1, 'Expected one page heading on ' + pathname);
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1].trim();
  assert(title && !seenTitles.has(title), 'Missing or duplicate title on ' + pathname);
  seenTitles.add(title);
  const meta = new Map([...html.matchAll(/<meta (?:property|name)="([^"]+)" content="([^"]*)"/g)].map(([, key, value]) => [key, value]));
  assert(meta.get('description'), 'Missing description on ' + pathname);
  for (const prefix of ['og:', 'twitter:']) {
    assert.equal(meta.get(prefix + 'title'), title, 'Share the page title on ' + pathname);
    assert.equal(meta.get(prefix + 'description'), meta.get('description'), 'Share the description on ' + pathname);
    assert.equal(meta.get(prefix + 'image'), publicOrigin + '/assets/landing/share-card.png', 'Share the image from the same host');
    assert(meta.get(prefix + 'image:alt'), 'Describe the share image');
  }
  assert.equal(meta.get('og:url'), publicOrigin + pathname);
  assert.equal(meta.get('og:site_name'), 'RETRADE');
  assert.equal(meta.get('og:type'), 'website');
  assert.equal(meta.get('og:locale'), 'en_GB');
  assert.equal(meta.get('twitter:card'), 'summary_large_image');
  if (production) {
    assert(html.includes('rel="canonical" href="' + publicOrigin + pathname + '"'), 'Wrong canonical on ' + pathname);
  } else {
    assert.match(html, /<meta name="robots" content="[^"]*noindex/, 'Staging page may be indexed: ' + pathname);
  }
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'Duplicate element ID on ' + pathname);
  siteDocuments.set(pathname, {html, ids: new Set(ids)});
}
for (const [pathname, document] of siteDocuments) {
  for (const [, attribute, value] of document.html.matchAll(/\s(href|src|srcset)="([^"]+)"/gi)) {
    const links = attribute === 'srcset' ? value.split(',').map(part => part.trim().split(/\s+/, 1)[0]) : [value];
    for (const link of links) {
      const url = new URL(link, publicOrigin + pathname);
      if (url.origin !== publicOrigin) continue;
      const file = url.pathname.slice(1) + (url.pathname.endsWith('/') ? 'index.html' : '');
      assert(expected.has(file), pathname + ' links to a missing public file: ' + link);
      if (url.hash) {
        const id = decodeURIComponent(url.hash.slice(1));
        assert(siteDocuments.get(url.pathname)?.ids.has(id), pathname + ' links to a missing section: ' + link);
      }
    }
  }
}
for (const file of shipped.filter(name => name.startsWith('assets/vendor/') || name === 'CNAME')) {
  assert(fs.readFileSync(path.join(root, file)).equals(fs.readFileSync(path.join(site, file))), 'Packaged bytes differ: ' + file);
}
console.log('Verified ' + actual.length + ' public files in the Pages artifact');
