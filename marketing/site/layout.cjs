const fs = require('node:fs');
const path = require('node:path');

const landingMetadata = {
  title: 'RETRADE · Stock and profit tracking for UK resellers',
  description: 'Track second-hand stock, sales and selling costs in RETRADE. See what each flip earns, from the first find to the final profit.'
};
const pages = {
  'how-it-works': {
    title: 'How RETRADE works',
    description: 'Follow a £6 car boot find through stock, listing and sale. See how RETRADE handles shared purchases, selling costs and partner payouts.',
    style: 'guide'
  },
  about: {
    title: 'Our story',
    description: 'How a small UK second-hand business built RETRADE to track the cost of a camera kit, settle up with other sellers and plan the next purchase.',
    file: 'story',
    style: 'story'
  },
  help: {
    title: 'Help and frequently asked questions',
    description: 'Answers to UK resellers’ questions about getting started, tracking stock, recording sales, and looking after their RETRADE account.',
    style: 'guide'
  },
  contact: {
    title: 'Contact RETRADE',
    description: 'Get help with your RETRADE account, ask a privacy question or share an idea from your own reselling business.',
    style: 'guide'
  },
  privacy: {
    title: 'Privacy notice',
    description: 'Read how RETRADE handles your account, reselling records and support enquiries, and how to make a privacy or account closure request.'
  },
  terms: {
    title: 'Terms of use',
    description: 'Read the terms for using RETRADE to record your stock, sales and expenses.'
  },
  cookies: {
    title: 'Cookies and device storage',
    description: 'Learn how the public website, demo and signed-in RETRADE workspace use your browser’s storage and what you can control on your device.'
  }
};
const routes = Object.keys(pages);
const siteAssets = `<link rel="stylesheet" href="/assets/landing/site.css?v=20261126">
  <script defer src="/assets/landing/site-nav.js?v=20261126"></script>`;
const homepage = '/';
const primary = [
  ['How it works', '/how-it-works/'],
  ['Our story', '/about/'],
  ['Help', '/help/']
];

function brand() {
  return `<a class="logo" href="/" aria-label="RETRADE homepage">
    <img src="/assets/landing/mark.svg" alt="" width="30" height="34"><span>RE<em>TRADE</em></span>
  </a>`;
}

function links(items, current) {
  return items.map(([label, url]) => `<a href="${url}"${url === current ? ' aria-current="page"' : ''}>${label}</a>`).join('\n');
}

function header(current) {
  const menu = links(primary, current);
  return `<header class="topbar site-header">
    <div class="nav-inner wrap">
      ${brand()}
      <nav class="site-primary" aria-label="Main navigation">${menu}</nav>
      <div class="header-links site-account"><a href="/login/">Log in</a><a class="header-cta" href="/signup/">Sign up free</a></div>
      <details class="compact-menu">
        <summary aria-label="Site menu"><span class="menu-icon" aria-hidden="true"></span></summary>
        <nav aria-label="Site menu">${menu}<a href="/contact/"${current === '/contact/' ? ' aria-current="page"' : ''}>Contact</a></nav>
      </details>
    </div>
  </header>`;
}

function footer(current) {
  const groups = [
    ['Product', [['How it works', '/how-it-works/'], ['Interactive demo', '/#demo'], ['Create an account', '/signup/'], ['Log in', '/login/']]],
    ['RETRADE', [['Our story', '/about/'], ['What’s next', '/about/#what-next'], ['Share an idea', '/contact/#feedback']]],
    ['Support', [['Help centre', '/help/'], ['Contact us', '/contact/'], ['Account requests', '/contact/#account-requests']]]
  ];
  return `<footer class="site-footer">
    <div class="wrap">
      <div class="footer-main">
        <div class="footer-brand">${brand()}<p>Stock, sales and profit tracking<br>for UK resellers.</p></div>
        ${groups.map(([name, items]) => `<nav class="footer-column" aria-label="${name} links">
          <h2>${name}</h2>${links(items, current)}</nav>`).join('\n')}
      </div>
      <div class="footer-base"><small>© 2026 RETRADE</small>
        <nav aria-label="Legal information">${links([['Privacy notice', '/privacy/'], ['Terms of use', '/terms/'], ['Cookies &amp; storage', '/cookies/']], current)}</nav>
      </div>
    </div>
  </footer>`;
}

function siteOrigin(production) {
  return production ? 'https://retrade-uk.com' : 'https://test.retrade-uk.com';
}

function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function pageMetadata(page, url, origin) {
  const title = escapeHtml(page.title.includes('RETRADE') ? page.title : page.title + ' · RETRADE');
  const description = escapeHtml(page.description);
  const image = origin + '/assets/landing/share-card.png';
  const imageAlt = 'RETRADE logo and a sample reseller dashboard';
  return `<title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:site_name" content="RETRADE">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="en_GB">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${origin}${url}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${imageAlt}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${image}">
  <meta name="twitter:image:alt" content="${imageAlt}">`;
}

function renderLanding(html, production) {
  return html.replace('{{SITE_HEADER}}', header(homepage))
    .replace('{{SITE_FOOTER}}', footer(homepage))
    .replace('{{SITE_ASSETS}}', siteAssets)
    .replace('{{PAGE_META}}', pageMetadata(landingMetadata, homepage, siteOrigin(production)));
}

function renderPage(route, production) {
  const page = pages[route];
  const url = '/' + route + '/';
  const content = fs.readFileSync(path.join(__dirname, (page.file || route) + '.html'), 'utf8');
  const origin = siteOrigin(production);
  const canonical = origin + url;
  const robots = production ? `<link rel="canonical" href="${canonical}">` : '<meta name="robots" content="noindex,nofollow">';
  const extraCss = page.style ? `<link rel="stylesheet" href="/assets/landing/${page.style}.css?v=20261126">` : '';
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#0b111c">
  ${robots}
  ${pageMetadata(page, url, origin)}
  <link rel="icon" href="/assets/icons/app-32.png">
  <link rel="stylesheet" href="/assets/landing/open.css?v=20261125-demo-spacing">
  ${siteAssets}
  ${extraCss}
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  ${header(url)}
  <main id="main" class="site-page">${content}</main>
  ${footer(url)}
</body>
</html>
`;
}

module.exports = { routes, renderLanding, renderPage, siteOrigin };
