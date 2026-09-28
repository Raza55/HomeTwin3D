import fs from 'node:fs';
import assert from 'node:assert/strict';
import {readGlb,writeGlb} from './optimize-glb.mjs';
const {json,bin}=readGlb(fs.readFileSync('../blender/Wohnung_v97_3Dash_Kaffee.glb'));
const tags=JSON.parse(fs.readFileSync('.qa/it-v98-tags.json','utf8'));
const scene=json.scenes[json.scene??0],manifest=JSON.parse(scene.extras['3dash_manifest']);
const old='cfeb684f-ab77-51ef-8677-8fb7af317deb';
assert(manifest.objects.some(o=>o.id===old));
manifest.objects=manifest.objects.filter(o=>o.id!==old);
manifest.objects.push(...tags.objects);manifest.source='Wohnung_v98_3Dash_IT.blend';
for(const node of json.nodes??[])if(node.extras?.ha_id===old){for(const key of Object.keys(node.extras))if(key.startsWith('ha_'))delete node.extras[key];}
scene.extras['3dash_manifest']=JSON.stringify(manifest);
const output=writeGlb(json,bin);assert(readGlb(output).bin.equals(bin));
fs.writeFileSync('../blender/Wohnung_v98_3Dash_IT.glb',output);fs.writeFileSync('.qa/it-v98.glb',output);
console.log(tags.objects.map(o=>({id:o.id,label:o.label,position:o.position})));console.log('Geometrie unverändert, IT-Metadaten ergänzt.');
