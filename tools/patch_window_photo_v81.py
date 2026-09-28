import json,struct
from pathlib import Path
root=Path('../blender');b=(root/'Wohnung_v80_3Dash_Fenster.glb').read_bytes()
n=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+n]);tail=b[20+n:]
ids={i for i,m in enumerate(doc['materials']) if m.get('name')=='SZ_aussen'}
removed={i for i,m in enumerate(doc['meshes']) if all(p.get('material') in ids for p in m['primitives'])}
assert len(removed)==1
mapping={i:i-sum(r<i for r in removed) for i in range(len(doc['meshes'])) if i not in removed}
for node in doc['nodes']:
 if 'mesh' in node:
  if node['mesh'] in removed:del node['mesh'];node['name']='Removed legacy window photo'
  else:node['mesh']=mapping[node['mesh']]
doc['meshes']=[m for i,m in enumerate(doc['meshes']) if i not in removed]
for scene in doc['scenes']:
 raw=scene.get('extras',{}).get('3dash_manifest')
 if raw:
  m=json.loads(raw);m['source']='Wohnung_v81_3Dash_Aussenblick.blend';scene['extras']['3dash_manifest']=json.dumps(m,ensure_ascii=False)
p=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode();p+=b' '*((-len(p))%4)
(root/'Wohnung_v81_3Dash_Aussenblick.glb').write_bytes(struct.pack('<4sII',b'glTF',2,20+len(p)+len(tail))+struct.pack('<I4s',len(p),b'JSON')+p+tail)
print('Removed one photo mesh; retained all entity meshes and binary geometry.')
