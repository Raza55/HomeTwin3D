"""Lossless material-only update of the v79 Blender export. Binary geometry stays byte-identical."""
import json,struct
from pathlib import Path
root=Path('../blender');src=root/'Wohnung_v79_3Dash_HueGo.glb';out=root/'Wohnung_v80_3Dash_Fenster.glb'
b=src.read_bytes();n=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+n]);tail=b[20+n:]
updated=[]
for m in doc['materials']:
 if m.get('name') not in {'Wohnzimmer_Fensterglas_klar','Film_B37_Fenster_Klarglas','SZ_Neues_Fensterglas','SZ_Fenster_Klarglas'}:continue
 m['pbrMetallicRoughness']={'baseColorFactor':[.82,.94,1,.12],'metallicFactor':0,'roughnessFactor':.08}
 m['alphaMode']='BLEND';m['doubleSided']=True;m['extras']={**m.get('extras',{}),'ha_window_glass':True}
 # Alpha blending provides portable real-time see-through; avoid double attenuation from transmission.
 m.pop('extensions',None);updated.append(m['name'])
for scene in doc.get('scenes',[]):
 raw=scene.get('extras',{}).get('3dash_manifest')
 if raw:
  manifest=json.loads(raw);manifest['source']='Wohnung_v80_3Dash_Fenster.blend';scene['extras']['3dash_manifest']=json.dumps(manifest,ensure_ascii=False)
assert len(updated)>=3
payload=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();payload+=b' '*((-len(payload))%4)
out.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(payload)+len(tail))+struct.pack('<I4s',len(payload),b'JSON')+payload+tail)
Path('./.qa/windows-v80-export.json').write_text(json.dumps({'materials':updated,'binaryUnchanged':out.read_bytes()[20+len(payload):]==tail}))
