// Headless KALO login: performs the Keycloak browser login (authorization code + PKCE)
// over plain HTTP with username and password, without a real browser. Used by the
// add-on (kalo-api.mjs) to get a short-lived access token for each data fetch, and by
// tools/kalo-login.mjs to test connectivity. Credentials are passed in by the caller
// and are never logged. No token or credential is returned to any browser.
import https from 'node:https';
import crypto from 'node:crypto';

const HOST = 'meine.kalo.de';
const AUTH_PATH = '/auth/realms/consumer/protocol/openid-connect/auth';
const TOKEN_URL = 'https://meine.kalo.de/auth/realms/consumer/protocol/openid-connect/token';
const REDIRECT_URI = 'https://meine.kalo.de/bewohnerportal/favicon.ico';
const CLIENT_ID = 'web';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const b64 = buffer => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Minimal HTTPS request that never follows redirects and returns status, headers, body.
function request(urlString, { method = 'GET', headers = {}, body } = {}) {
  const url = new URL(urlString);
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: url.host, path: url.pathname + url.search, method,
      headers: { 'user-agent': UA, 'accept-encoding': 'identity', ...headers },
      timeout: 15000,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function addCookies(jar, setCookie) {
  for (const line of setCookie ?? []) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
const cookieHeader = jar => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

/**
 * Logs in and returns the token response ({ access_token, ... }).
 * Throws Error with a short, non-sensitive code on failure.
 */
export async function login({ username, password, requestImpl = request }) {
  if (!username || !password) throw new Error('missing_credentials');
  const verifier = b64(crypto.randomBytes(48));
  const challenge = b64(crypto.createHash('sha256').update(verifier).digest());
  const jar = new Map();

  // 1) Load the login form (follow up to 3 redirects, collecting cookies).
  let url = `https://${HOST}${AUTH_PATH}?` + new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
    scope: 'openid profile email roles', code_challenge: challenge, code_challenge_method: 'S256',
    state: b64(crypto.randomBytes(12)), nonce: b64(crypto.randomBytes(12)),
  }).toString();
  let page;
  for (let hop = 0; hop < 4; hop++) {
    page = await requestImpl(url, { headers: { cookie: cookieHeader(jar), accept: 'text/html' } });
    addCookies(jar, page.headers['set-cookie']);
    if (page.status >= 300 && page.status < 400 && page.headers.location) { url = new URL(page.headers.location, url).href; continue; }
    break;
  }
  if (page.status !== 200) throw new Error('login_page_' + page.status);

  // 2) Extract the login form action and post the credentials.
  const action = (page.body.match(/<form[^>]+id="kc-form-login"[^>]+action="([^"]+)"/i)
    || page.body.match(/<form[^>]+action="([^"]+)"[^>]+id="kc-form-login"/i)
    || [])[1];
  if (!action) throw new Error(/password|kc-form-login/i.test(page.body) ? 'form_not_found' : 'blocked_or_unexpected_page');
  const actionUrl = new URL(action.replace(/&amp;/g, '&'), url).href;
  const form = new URLSearchParams({ username, password, credentialId: '' });
  const submit = await requestImpl(actionUrl, {
    method: 'POST',
    headers: { cookie: cookieHeader(jar), 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' },
    body: form.toString(),
  });
  addCookies(jar, submit.headers['set-cookie']);

  // 3) Success is a redirect back to the redirect_uri carrying ?code=...
  if (!(submit.status >= 300 && submit.status < 400 && submit.headers.location)) {
    throw new Error(/invalid|fehler|error|incorrect|ung.ltig/i.test(submit.body) ? 'invalid_credentials' : 'no_redirect_' + submit.status);
  }
  const code = new URL(submit.headers.location).searchParams.get('code');
  if (!code) throw new Error('no_code');

  // 4) Exchange the code (PKCE) for tokens.
  const res = await requestImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, code, code_verifier: verifier }).toString(),
  });
  let token = {};
  try { token = JSON.parse(res.body); } catch { /* non-JSON */ }
  if (res.status !== 200 || !token.access_token) throw new Error('token_' + (token.error || res.status));
  return token;
}
