#!/usr/bin/env node
// One-time helper to obtain a KALO offline refresh token for the HomeTwin3D add-on.
// Run it locally; it talks only to KALO. Nothing is stored except a short-lived PKCE
// file in .private/ (gitignored), and the token is printed to your terminal only so
// you can paste it into the add-on option "kalo_refresh_token". The add-on then
// refreshes on its own. Direct password login is disabled for the public client, so
// this uses the normal browser login (Authorization Code + PKCE) with offline access.
//
// Step 1 — start the flow:
//     node tools/kalo-login.mjs
//   It prints a login URL. Open it in the browser where you are signed in to KALO,
//   with DevTools -> Network open and "Preserve log" enabled. The page briefly loads
//   https://meine.kalo.de/bewohnerportal/?...&code=XXXXX . Copy the value of "code".
//
// Step 2 — exchange the code for the offline token (within ~60 seconds):
//     node tools/kalo-login.mjs --code XXXXX
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { login } from '../3dash-addon/kalo-login-flow.mjs';

const TOKEN_URL = 'https://meine.kalo.de/auth/realms/consumer/protocol/openid-connect/token';
const AUTH_URL = 'https://meine.kalo.de/auth/realms/consumer/protocol/openid-connect/auth';
const API_BASE = 'https://api.kalo.de/resident/v2';
const CLIENT_ID = 'web';
// A static file under /bewohnerportal/ so the single-page app does NOT load and
// strip the code: it stays in the address bar for you to copy. Must stay identical
// in the authorize request and the token exchange.
const REDIRECT_URI = 'https://meine.kalo.de/bewohnerportal/favicon.ico';
const STATE_FILE = path.join('.private', 'kalo-pkce.json');
const b64 = buffer => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function start() {
  const verifier = b64(crypto.randomBytes(48));
  const challenge = b64(crypto.createHash('sha256').update(verifier).digest());
  const state = b64(crypto.randomBytes(12));
  const nonce = b64(crypto.randomBytes(12));
  fs.mkdirSync('.private', { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ verifier, state }), { mode: 0o600 });
  const url = AUTH_URL + '?' + new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
    scope: 'openid profile email roles', code_challenge: challenge, code_challenge_method: 'S256',
    state, nonce,
  }).toString();
  console.log('\n1) Diese URL im eingeloggten Browser oeffnen (DevTools -> Network, "Preserve log" an):\n');
  console.log(url);
  console.log('\n2) Die Seite laedt kurz  https://meine.kalo.de/bewohnerportal/?...&code=XXXXX');
  console.log('   Den Wert von "code" kopieren (im Network-Tab beim Dokument-Request), dann:\n');
  console.log('   node tools/kalo-login.mjs --code XXXXX\n');
}

async function exchange(code) {
  let saved;
  try { saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { console.error('Kein PKCE-Zustand gefunden. Bitte zuerst "node tools/kalo-login.mjs" ausfuehren.'); process.exit(2); }
  const body = new URLSearchParams({
    grant_type: 'authorization_code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
    code, code_verifier: saved.verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
    },
    body,
  });
  const raw = await res.text();
  let data = {};
  try { data = JSON.parse(raw); } catch { /* non-JSON body */ }
  if (!res.ok || !data.refresh_token) {
    console.error('\nTausch fehlgeschlagen (HTTP ' + res.status + ').');
    console.error('Fehler: ' + (data.error || '(kein JSON)'));
    if (data.error_description) console.error('Beschreibung: ' + data.error_description);
    console.error('Rohantwort (gekuerzt): ' + raw.slice(0, 400));
    if (data.error === 'invalid_grant') console.error('> Der Code ist abgelaufen oder schon benutzt. Login-URL erneut oeffnen und frischen Code nehmen.');
    process.exit(1);
  }
  try { fs.unlinkSync(STATE_FILE); } catch { /* best effort */ }

  console.log('\n=== Erfolg ===');
  console.log('scope: ' + (data.scope ?? 'n/a'));
  console.log('access_token expires_in: ' + (data.expires_in ?? 'n/a') + ' s');
  console.log('refresh_expires_in: ' + (data.refresh_expires_in ?? 'n/a') + ' s  (0 = unbegrenzt)');

  // Probe: refresh once to confirm the add-on can renew it and to read the renewed lifetime.
  try {
    const probe = await fetch(TOKEN_URL, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: CLIENT_ID, refresh_token: data.refresh_token }),
    });
    const r = await probe.json().catch(() => ({}));
    if (probe.ok && r.refresh_token) {
      console.log('Refresh-Test: OK  (neues refresh_expires_in: ' + (r.refresh_expires_in ?? 'n/a') + ' s, rotiert: ' + (r.refresh_token !== data.refresh_token) + ')');
      data.refresh_token = r.refresh_token; // hand the freshest token to the add-on
    } else {
      console.log('Refresh-Test: FEHLGESCHLAGEN (' + (r.error || probe.status) + ')');
    }
  } catch { console.log('Refresh-Test: Fehler'); }

  try {
    const residents = await fetch(API_BASE + '/residents', {
      headers: { Authorization: 'Bearer ' + data.access_token, accept: 'application/json' },
    }).then(r => (r.ok ? r.json() : null));
    if (residents) {
      console.log('\n--- Gefundene IDs (fuer die Add-on-Optionen) ---');
      console.log(JSON.stringify(residents, null, 2).slice(0, 4000));
    }
  } catch { /* ID discovery is best-effort */ }

  console.log('\n--- In die HomeTwin3D-Add-on-Konfiguration eintragen ---');
  console.log('kalo_refresh_token: (der folgende Wert, GEHEIM halten)\n');
  console.log(data.refresh_token);
  console.log('\nkalo_resident_id / kalo_billing_unit / kalo_occupancy_id / kalo_residential_unit:');
  console.log('aus den api.kalo.de-URLs: .../residents/<RESIDENT>/billing-units/<BILLING>/residential-units/<RESIDENTIAL>/occupancies/<OCCUPANCY>/...');
}

function codeFromArg(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.includes('code=')) { // allow pasting the whole redirect URL
    try { return new URL(trimmed).searchParams.get('code'); }
    catch { return (trimmed.match(/[?&]code=([^&\s]+)/) || [])[1] ?? null; }
  }
  return trimmed;
}
async function testPasswordLogin() {
  const username = process.env.KALO_USER;
  const password = process.env.KALO_PASS;
  if (!username || !password) {
    console.error('Bitte KALO_USER und KALO_PASS als Umgebungsvariablen setzen (werden nicht geloggt).');
    console.error('PowerShell:  $env:KALO_USER="..."; $env:KALO_PASS="..."; node tools/kalo-login.mjs --password');
    process.exit(2);
  }
  try {
    const token = await login({ username, password });
    console.log('\n=== Login OK (ohne Browser, durch Cloudflare) ===');
    console.log('access_token expires_in: ' + (token.expires_in ?? 'n/a') + ' s');
    try {
      const residents = await fetch('https://api.kalo.de/resident/v2/residents', {
        headers: { Authorization: 'Bearer ' + token.access_token, accept: 'application/json' },
      }).then(r => (r.ok ? r.json() : null));
      if (residents) { console.log('\n--- Gefundene IDs ---'); console.log(JSON.stringify(residents, null, 2).slice(0, 4000)); }
      else console.log('ID-Abruf ueber /residents lieferte nichts; IDs aus den api.kalo.de-URLs ablesen.');
    } catch { console.log('ID-Abruf nicht moeglich; IDs aus den api.kalo.de-URLs ablesen.'); }
    console.log('\nDer Auto-Login funktioniert. Fuer das Add-on brauche ich kein Token, nur Benutzername + Passwort in der Konfiguration.');
  } catch (error) {
    console.error('\nAuto-Login fehlgeschlagen: ' + (error?.message || error));
    console.error('(invalid_credentials = falsche Daten; blocked_or_unexpected_page = evtl. Cloudflare/Captcha; login_page_xxx/no_redirect_xxx = anderer Fehler)');
    process.exit(1);
  }
}

if (process.argv.includes('--password')) testPasswordLogin();
else {
  const codeArg = process.argv.includes('--code') ? codeFromArg(process.argv[process.argv.indexOf('--code') + 1]) : null;
  if (codeArg) exchange(codeArg).catch(error => { console.error('Fehler: ' + (error?.message || error)); process.exit(1); });
  else start();
}
