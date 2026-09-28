import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const hook = execFileSync('git',['rev-parse','--git-path','hooks/pre-push'],{encoding:'utf8'}).trim();
const contents = '#!/bin/sh\n# HomeTwin3D public-data gate\nnode tools/check-public-data.mjs --pre-push "$1"\n';
if(fs.existsSync(hook) && fs.readFileSync(hook,'utf8')!==contents) throw Error('An existing pre-push hook must be integrated manually; it was not overwritten.');
fs.writeFileSync(hook,contents,{mode:0o755});
console.log('HomeTwin3D pre-push privacy gate installed.');
