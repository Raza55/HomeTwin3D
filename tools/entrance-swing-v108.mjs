// v108 entrance door: copies the swing limit of entrance-swing-v108.py (.qa/entrance-swing-v108.json) into the
// door rig extras of the v107 GLB. Geometry is untouched.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {readGlb,writeGlb,optimizeGlb} from './optimize-glb.mjs';
const [input='../blender/Wohnung_v107_3Dash_Flurschrank.glb',output='../blender/Wohnung_v108_3Dash_Haustuerwinkel.glb']=process.argv.slice(2);
const {doorGeometry:g}=JSON.parse(fs.readFileSync('.qa/entrance-swing-v108.json','utf8'));
const {json:d,bin}=readGlb(fs.readFileSync(input));
const doors=d.nodes.filter(n=>n.extras?.ha_door&&n.extras.ha_door.hinge.every((v,k)=>Math.abs(v-g.hinge[k])<1e-6));
assert.equal(doors.length,1);assert.equal(doors[0].extras.ha_door.swingDegrees,90);
doors[0].extras.ha_door.swingDegrees=g.swingDegrees;
const scene=d.scenes[d.scene??0],manifest=JSON.parse(scene.extras['3dash_manifest']);
manifest.source='Wohnung_v108_3Dash_Haustuerwinkel.blend';scene.extras['3dash_manifest']=JSON.stringify(manifest);
const bytes=optimizeGlb(writeGlb(d,bin)).bytes;
fs.writeFileSync(output,bytes,{flag:'wx'});fs.writeFileSync('.qa/entrance-swing-v108.glb',bytes);
console.log(JSON.stringify({door:doors[0].name,swingDegrees:g.swingDegrees,bytes:bytes.length}));
