"""Refresh only TV strip beam angles; preserve the already exported geometry bytes."""
import bpy, sys, json, struct
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import blender_3dash as addon
root=Path('../blender')
path=root/'Wohnung_v76_3Dash_TV.glb'
raw=path.read_bytes(); n=struct.unpack_from('<I',raw,12)[0]
gltf=json.loads(raw[20:20+n])
old=json.loads(gltf['scenes'][0]['extras']['3dash_manifest'])
for o in bpy.data.collections['3Dash_TV_Wand_v76'].objects:
    if o.get('ha_light_kind')=='strip':o['ha_light_angle']=170.
updated=addon.build_manifest(bpy.context.scene)
new=json.loads(json.dumps(old))
ids={o.get('ha_id') for o in bpy.data.collections['3Dash_TV_Wand_v76'].objects if o.get('ha_light_kind')=='strip'}
for before in new['objects']:
    if before['id'] not in ids:continue
    after=next(o for o in updated['objects'] if o['id']==before['id'])
    assert all(abs(before['position'][k]-after['position'][k])<1e-5 for k in ['x','y','z'])
    assert all(abs(before['size'][k]-after['size'][k])<1e-5 for k in ['width','height','depth'])
    before['emitters']=after['emitters']
gltf['scenes'][0]['extras']['3dash_manifest']=json.dumps(new,ensure_ascii=False)
chunk=json.dumps(gltf,ensure_ascii=False,separators=(',',':')).encode('utf-8')
chunk+=b' '*((-len(chunk))%4)
tail=raw[20+n:]
path.write_bytes(struct.pack('<III',0x46546c67,2,20+len(chunk)+len(tail))+struct.pack('<II',len(chunk),0x4e4f534a)+chunk+tail)
report_path=path.with_suffix('.report.json');report=json.loads(report_path.read_text(encoding='utf-8'));report['objects']=new['objects'];report['bytes']=path.stat().st_size
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(root/'Wohnung_v76_3Dash_TV.blend'))
print('TV_CALIBRATION_OK')
