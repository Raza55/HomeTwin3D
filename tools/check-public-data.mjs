import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const entityPattern = /\b(?:automation|binary_sensor|button|camera|cover|fan|light|lock|media_player|number|select|sensor|switch)\.[a-z][a-z0-9_]*/g;
export const entitiesIn = text => [...new Set(text.match(entityPattern) ?? [])];
const privateIp = /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/;
const secret = /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
export function inspectText(text, policy, denied = []) {
  const issues = [];
  if (privateIp.test(text)) issues.push('private IPv4 address');
  if (/\b(?:fd|fc)[a-f\d]{2}:(?:[a-f\d:]+:)[a-f\d]+\b/i.test(text)) issues.push('private IPv6 address');
  if (/[A-Za-z]:[\\/](?:Users|projects)[\\/](?!<)/i.test(text)) issues.push('absolute workstation path');
  if (secret.test(text)) issues.push('credential or private key');
  if (denied.some(value => value && text.toLowerCase().includes(value.toLowerCase()))) issues.push('private local denylist match');
  if (entitiesIn(text).some(id => !policy.entities.includes(id))) issues.push('unreviewed entity identifier (review public-data-policy.json)');
  return issues;
}
const git = (...args) => execFileSync('git', args, { maxBuffer: 32 * 1024 * 1024 });
const textExtensions = /\.(?:ts|tsx|js|mjs|py|ps1|md|json|yaml|yml|html|css|conf|txt|svg|sh)$|(?:^|\/)(?:LICENSE|NOTICE|Dockerfile|\.gitignore|\.gitattributes)$/;
export function checkRef(ref, policy, denied = []) {
  const entries = git('ls-tree','-r','-z',ref).toString().split('\0').filter(Boolean).map(line => {
    const tab=line.indexOf('\t'); return {path:line.slice(tab+1),sha:line.slice(0,tab).split(' ')[2]};
  });
  const packed = execFileSync('git',['cat-file','--batch'],{input:entries.map(e=>e.sha).join('\n')+'\n',maxBuffer:64*1024*1024});
  const blobs=new Map();let offset=0;
  for(const entry of entries){const end=packed.indexOf(10,offset),size=Number(packed.subarray(offset,end).toString().split(' ')[2]);if(!Number.isFinite(size))throw Error('Unable to read Git object');blobs.set(entry.path,packed.subarray(end+1,end+1+size));offset=end+size+2;}
  const failures = [];
  if(git('cat-file','-t',ref).toString().trim()==='commit') {
    const metadata=git('show','-s','--format=%B%n%an%n%ae%n%cn%n%ce',ref).toString();
    const issues=inspectText(metadata,policy,denied);
    if(issues.length) failures.push('commit metadata: '+issues.join(', '));
  }
  for (const {path} of entries) {
    const issues = [];
    if (/(^|\/)(?:\.private|\.qa|\.venv|__pycache__|node_modules|dist)(\/|$)|(^|\/)\.env(?:\..*)?\.local$/.test(path)) issues.push('local-only path');
    if (denied.some(value => path.toLowerCase().includes(value.toLowerCase()))) issues.push('private filename');
    const bytes = blobs.get(path);
    if (textExtensions.test(path) || path.startsWith('.github/')) {
      issues.push(...inspectText(bytes.toString('utf8'),policy,denied));
      if(path==='src/constants/location.ts' && !/latitude:\s*0\s*,\s*longitude:\s*0\s*,/.test(bytes.toString())) issues.push('location default must be anonymous (0, 0)');
    } else if (policy.binarySha256[path] !== createHash('sha256').update(bytes).digest('hex')) issues.push('new or changed binary requires visual/privacy review');
    if (issues.length) failures.push(`${path}: ${[...new Set(issues)].join(', ')}`);
  }
  return failures;
}
function main() {
  const policy = JSON.parse(fs.readFileSync('public-data-policy.json','utf8'));
  const denied = fs.existsSync('.private/public-denylist.json') ? JSON.parse(fs.readFileSync('.private/public-denylist.json','utf8')) : [];
  let refs = [];
  if(process.argv.includes('--pre-push')) {
    const remote = process.argv[process.argv.indexOf('--pre-push')+1];
    if(remote!=='origin') throw Error('Publishing is configured for origin only. Review the target before pushing.');
    for(const line of fs.readFileSync(0,'utf8').trim().split('\n').filter(Boolean)) {
      const [,local,,remoteSha]=line.split(/\s+/);
      if(/^0+$/.test(local)) continue;
      const args = /^0+$/.test(remoteSha) ? [local,'--not','--remotes=origin'] : [`${remoteSha}..${local}`];
      refs.push(...git('rev-list',...args).toString().trim().split('\n').filter(Boolean),local);
    }
  } else refs=[process.argv[2] ?? 'HEAD'];
  const failures=[];
  for(const ref of new Set(refs)) failures.push(...checkRef(ref,policy,denied).map(f=>`${ref.slice(0,12)} ${f}`));
  if(failures.length) {console.error(failures.join('\n'));console.error('Publication blocked. Anonymize the data; do not bypass the hook or auto-approve the allowlist.');process.exitCode=1;}
  else console.log(`Public-data check passed (${new Set(refs).size} Git tree(s)).`);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)main();
