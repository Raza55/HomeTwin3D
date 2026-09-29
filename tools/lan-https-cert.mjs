// Creates a local CA and an HTTPS certificate for `vite preview` in the LAN
// (Safari offers WebGPU only on secure pages). Output goes to .private/tls,
// which never leaves this machine. The certificate covers localhost and the
// current IPv4 addresses of this PC; run again after an address change.
// Install ca.crt on the tablet once (served at /HomeTwin3D/hometwin-ca.crt)
// and enable full trust for it.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

const dir = '.private/tls';
mkdirSync(dir, { recursive: true });
const file = name => join(dir, name);
// MSYS_NO_PATHCONV: Git for Windows' openssl would otherwise rewrite "/CN=..." as a path.
const openssl = (...args) => execFileSync('openssl', args, { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, MSYS_NO_PATHCONV: '1' } });

if (!existsSync(file('ca.key'))) {
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '3650',
    '-subj', '/CN=HomeTwin3D local CA', '-keyout', file('ca.key'), '-out', file('ca.crt'),
    '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
}

const addresses = Object.values(networkInterfaces()).flat()
  .filter(entry => entry && entry.family === 'IPv4' && !entry.internal).map(entry => entry.address);
const names = ['DNS:localhost', 'IP:127.0.0.1', ...addresses.map(address => `IP:${address}`)];
writeFileSync(file('lan.ext'), [
  'basicConstraints=CA:FALSE',
  'keyUsage=digitalSignature,keyEncipherment',
  'extendedKeyUsage=serverAuth',
  `subjectAltName=${names.join(',')}`,
].join('\n'));
openssl('req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=HomeTwin3D LAN', '-keyout', file('lan.key'), '-out', file('lan.csr'));
// Apple accepts server certificates valid for at most 825 days.
openssl('x509', '-req', '-in', file('lan.csr'), '-CA', file('ca.crt'), '-CAkey', file('ca.key'), '-CAcreateserial',
  '-days', '800', '-sha256', '-extfile', file('lan.ext'), '-out', file('lan.crt'));
console.log(`HTTPS certificate written to ${dir} (${addresses.length} LAN address(es), not shown).`);
