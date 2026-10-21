#!/usr/bin/env node
// One-time helper to obtain a KALO offline refresh token for the HomeTwin3D add-on.
// Run it locally; it talks only to KALO. Nothing is stored or logged by this tool,
// and it prints the token to your terminal only so you can paste it into the add-on
// configuration (option "kalo_refresh_token"). The add-on then refreshes on its own.
//
//   node tools/kalo-login.mjs
//   KALO_USER=you@example.com KALO_PASS='secret' node tools/kalo-login.mjs   # non-interactive
//
// If direct login is disabled for the public client, the tool says so and points you
// to the browser fallback (read the token from DevTools).
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const TOKEN_URL = 'https://meine.kalo.de/auth/realms/consumer/protocol/openid-connect/token';
const API_BASE = 'https://api.kalo.de/resident/v2';
const CLIENT_ID = 'web';

async function ask(question, { mute = false } = {}) {
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
  if (mute) {
    const onData = () => { stdout.write('\u001b[2K\r' + question); }; // keep prompt, hide typed chars
    stdin.on('data', onData);
    const answer = await rl.question(question);
    stdin.off('data', onData); stdout.write('\n'); rl.close();
    return answer;
  }
  const answer = await rl.question(question);
  rl.close();
  return answer;
}

async function main() {
  const username = process.env.KALO_USER || (await ask('KALO Benutzername (E-Mail): ')).trim();
  const password = process.env.KALO_PASS || (await ask('KALO Passwort: ', { mute: true }));
  if (!username || !password) { console.error('Benutzername und Passwort werden benoetigt.'); process.exit(2); }

  const body = new URLSearchParams({
    grant_type: 'password', client_id: CLIENT_ID,
    username, password, scope: 'openid offline_access',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.refresh_token) {
    console.error('\nAnmeldung fehlgeschlagen (HTTP ' + res.status + ', ' + (data.error || 'unbekannt') + ').');
    if (['unauthorized_client', 'invalid_client', 'invalid_grant'].includes(data.error)) {
      console.error('Die direkte Anmeldung ist fuer den Client "web" vermutlich deaktiviert.');
      console.error('Fallback: refresh_token im Browser aus den DevTools (Network -> token-Antwort) kopieren.');
    }
    process.exit(1);
  }

  const offline = /offline/.test(String(data.scope || '')) || Number(data.refresh_expires_in) === 0;
  console.log('\n=== Erfolg ===');
  console.log('Offline-Token: ' + (offline ? 'ja (laeuft nicht im Leerlauf ab)' : 'NEIN - Realm hat offline_access evtl. nicht fuer "web" freigegeben'));
  console.log('refresh_expires_in: ' + (data.refresh_expires_in ?? 'n/a') + ' (0 = unbegrenzt)');

  // Try to discover the apartment identifiers for the add-on options.
  try {
    const residents = await fetch(API_BASE + '/residents', {
      headers: { Authorization: 'Bearer ' + data.access_token, accept: 'application/json' },
    }).then(r => (r.ok ? r.json() : null));
    if (residents) {
      console.log('\n--- Gefundene IDs (fuer die Add-on-Optionen) ---');
      console.log(JSON.stringify(residents, null, 2).slice(0, 4000));
      console.log('--- Falls hier nichts Brauchbares steht: IDs aus den DevTools-URLs ablesen ---');
    }
  } catch { /* ID discovery is best-effort */ }

  console.log('\n--- In die HomeTwin3D-Add-on-Konfiguration eintragen ---');
  console.log('kalo_refresh_token: (der folgende Wert, GEHEIM halten)\n');
  console.log(data.refresh_token);
  console.log('\nkalo_resident_id / kalo_billing_unit / kalo_occupancy_id / kalo_residential_unit:');
  console.log('aus den api.kalo.de-URLs: .../residents/<RESIDENT>/billing-units/<BILLING>/residential-units/<RESIDENTIAL>/occupancies/<OCCUPANCY>/...');
}

main().catch(error => { console.error('Fehler: ' + (error?.message || error)); process.exit(1); });
