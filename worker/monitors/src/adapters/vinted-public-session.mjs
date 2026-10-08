// Public UK catalogue sessions. Fixed destinations, no account credentials,
// challenge handling, redirects or automatic retries after a refusal.
import { SourceError, retryAt, refusalDiagnostics } from './vinted-source.mjs';
export const PUBLIC_AGENT = 'RETRADE-Monitor/1.4 (+https://test.retrade-uk.com)';
const hosts = new Set(['www.vinted.co.uk', 'api.vinted.co.uk']);
const cookieName = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const cookieValue = /^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/;

export function validatePublicSession(session) {
  if (session?.mode !== 'public' || session.version !== 1 || !Array.isArray(session.cookies) || session.cookies.length > 40)
    throw new SourceError('session_invalid');
  if (session.anonId != null && !/^[\x21-\x7e]{1,256}$/.test(session.anonId)) throw new SourceError('session_invalid');
  for (const c of session.cookies) {
    if (!c || typeof c.name !== 'string' || !cookieName.test(c.name) || typeof c.value !== 'string' || c.value.length > 8192 || !cookieValue.test(c.value)
      || !['vinted.co.uk', ...hosts].includes(c.domain) || typeof c.hostOnly !== 'boolean'
      || typeof c.path !== 'string' || !c.path.startsWith('/') || c.path.length > 512
      || !Number.isFinite(c.expiresAt)) throw new SourceError('session_invalid');
  }
  if (JSON.stringify(session).length > 20000) throw new SourceError('session_invalid');
  return session;
}

export function publicCookieHeader(session, url, now = Date.now()) {
  validatePublicSession(session);
  if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.port || url.username || url.password)
    throw new SourceError('session_destination');
  return session.cookies.filter(c => c.expiresAt > now
    && (c.hostOnly ? url.hostname === c.domain : url.hostname === c.domain || url.hostname.endsWith('.' + c.domain))
    && (url.pathname === c.path || url.pathname.startsWith(c.path.endsWith('/') ? c.path : c.path + '/')))
    .sort((a,b) => b.path.length-a.path.length).map(c => c.name + '=' + c.value).join('; ');
}

export function acceptPublicCookies(session, headers, url, now = Date.now()) {
  if (!hosts.has(url.hostname) || url.protocol !== 'https:') throw new SourceError('session_destination');
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie()
    : (headers.get('set-cookie') || '').split(/,(?=\s*[^;,=\s]+\s*=)/);
  for (const line of values) {
    const parts=line.split(';'), pair=parts.shift(), at=pair.indexOf('=');
    if(at<1) continue;
    const name=pair.slice(0,at).trim(), value=pair.slice(at+1).trim();
    if(!cookieName.test(name) || !cookieValue.test(value) || value.length>8192) continue;
    const attrs=Object.fromEntries(parts.map(p=>{const i=p.indexOf('=');return i<0?[p.trim().toLowerCase(),true]:[p.slice(0,i).trim().toLowerCase(),p.slice(i+1).trim()];}));
    const domain=typeof attrs.domain==='string'?attrs.domain.replace(/^\./,'').toLowerCase():url.hostname;
    if(!['vinted.co.uk',url.hostname].includes(domain)) continue;
    const path=typeof attrs.path==='string' && attrs.path.startsWith('/')?attrs.path:'/';
    if(path.length>512) continue;
    // Session cookies are conservatively renewed within one hour; persistent
    // cookies retain their provider expiry (with the same local upper bound).
    let expiresAt=now+3600000;
    if(typeof attrs.expires==='string' && Number.isFinite(Date.parse(attrs.expires))) expiresAt=Math.min(expiresAt,Date.parse(attrs.expires));
    if(typeof attrs['max-age']==='string' && /^-?\d+$/.test(attrs['max-age'])) expiresAt=Math.min(now+3600000,now+Number(attrs['max-age'])*1000);
    session.cookies=session.cookies.filter(c=>!(c.name===name && c.domain===domain && c.path===path));
    if(expiresAt>now) session.cookies.push({name,value,domain,path,hostOnly:attrs.domain===undefined,expiresAt});
  }
  session.cookies=session.cookies.filter(c=>c.expiresAt>now);
  return validatePublicSession(session);
}

// JWT claims are only an earlier refresh hint, never proof of authentication.
// Opaque cookies keep their provider/local expiry. Never extend either expiry.
export function publicSessionExpiresAt(session, now=Date.now()) {
  validatePublicSession(session);
  const applicable = session.cookies.filter(c => c.name === 'access_token_web'
    && (c.hostOnly ? c.domain === 'api.vinted.co.uk' : ['vinted.co.uk','api.vinted.co.uk'].includes(c.domain))
    && (c.path === '/' || '/svc-catalogue/items' === c.path || '/svc-catalogue/items'.startsWith(c.path.endsWith('/') ? c.path : c.path + '/')));
  const expiries = applicable.map(c => {
    let expiry = c.expiresAt;
    const parts = c.value.split('.');
    if (parts.length === 3 && /^[A-Za-z0-9_-]+$/.test(parts[1])) {
      try {
        const encoded = parts[1].replaceAll('-', '+').replaceAll('_', '/');
        const exp = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))).exp;
        if (Number.isSafeInteger(exp) && exp > 0 && exp < 8.64e12) expiry = Math.min(expiry, exp * 1000);
      } catch { /* Not a readable JWT: the cookie expiry remains authoritative. */ }
    }
    return expiry;
  });
  return new Date(expiries.length ? Math.min(...expiries) : now).toISOString();
}

export async function createPublicSession({request, session: previous=null, now=Date.now, timeoutMs=12000}) {
  if(typeof request!=='function') throw new TypeError('Explicit request transport required');
  if(previous) validatePublicSession(previous);
  const controller=new AbortController(); let timer;
  try {
    return await Promise.race([new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new SourceError('timeout'));},timeoutMs);}), (async()=>{
      const url=new URL('https://www.vinted.co.uk/');
      const response=await request(url,{method:'GET',redirect:'error',signal:controller.signal,
        headers:{'user-agent':PUBLIC_AGENT,accept:'text/html','accept-language':'en-GB,en;q=0.9',
          ...(previous ? {cookie:publicCookieHeader(previous,url,now()),
            ...(previous.anonId ? {'x-anon-id':previous.anonId} : {})} : {})}});
      if(!response.ok) {
        clearTimeout(timer);
        const diagnostics=[401,403].includes(response.status)?await refusalDiagnostics(response):null;
        if(!diagnostics)void response.body?.cancel().catch(()=>{});
        throw new SourceError(response.status===429?'rate_limited':response.status===403?'blocked':'http_error',
          {status:response.status,retryAt:retryAt(response.headers.get('retry-after'),now(),300000),diagnostics});
      }
      if(!response.headers.get('content-type')?.includes('text/html')) throw new SourceError('unexpected_content_type');
      const session=acceptPublicCookies(previous ? structuredClone(previous) : {mode:'public',version:1,cookies:[]},response.headers,url,now());
      session.anonId=response.headers.get('x-anon-id') || previous?.anonId || null;
      // No response body is needed, retained, executed or logged.
      await response.body?.cancel().catch(()=>{});
      const apiCookies=publicCookieHeader(session,new URL('https://api.vinted.co.uk/svc-catalogue/items'),now());
      if(!/(?:^|; )access_token_web=/.test(apiCookies)) throw new SourceError('session_missing');
      const expiresAt=publicSessionExpiresAt(session,now());
      if(Date.parse(expiresAt)<=now()+30000) throw new SourceError('session_expired');
      return {session,expiresAt};
    })()]);
  } finally {clearTimeout(timer);controller.abort();}
}
