/* Older confirmation and password reset emails point to the original root. */
(function () {
  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.slice(1));
  const authKeys = ['code', 'token_hash', 'access_token', 'refresh_token', 'error', 'error_code', 'error_description'];
  if (authKeys.some(key => query.has(key) || fragment.has(key)) ||
      [query.get('type'), fragment.get('type')].includes('recovery')) {
    location.replace('/login/' + location.search + location.hash);
  } else if (location.hash === '#signup') {
    location.replace('/signup/' + location.search);
  } else if (/^\/landing2(?:\/(?:index\.html)?)?$/.test(location.pathname)) {
    location.replace('/landing1/' + location.search + location.hash);
  } else if (location.pathname.startsWith('/start')) {
    location.replace('/' + location.search + location.hash);
  }
})();
