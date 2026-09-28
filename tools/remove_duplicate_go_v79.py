"""Remove only the obsolete Hue fixture by the cable box, keeping the floor Hue Go."""
import bpy,sys,json,traceback
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import blender_3dash as addon
ROOT=Path('../blender');QA=Path(__file__).parent.parent/'.qa'
REMOVED='4b5356c8-c8c5-5839-8d1d-fc87d5ce0bc1'
try:
 before=addon.build_manifest(bpy.context.scene)
 names=[o.name for o in bpy.data.objects if o.name.startswith('Kabelbox_Hue_')]
 assert 'Kabelbox_Hue_Diffusor' in names
 for name in names:bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
 bpy.context.view_layer.update()
 after=addon.build_manifest(bpy.context.scene)
 assert {o['id'] for o in after['objects']}=={o['id'] for o in before['objects']}-{REMOVED}
 bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Wohnung_v79_3Dash_HueGo.blend'))
 QA.joinpath('huego-v79-change.json').write_text(json.dumps({'removed':names,'id':REMOVED,'remaining':len(after['objects'])}),encoding='utf-8')
 addon.export_floorplan(str(ROOT/'Wohnung_v79_3Dash_HueGo.glb'))
 QA.joinpath('huego-v79-complete.json').write_text(json.dumps({'objects':len(after['objects'])}),encoding='utf-8')
except Exception:
 QA.joinpath('huego-v79-error.log').write_text(traceback.format_exc(),encoding='utf-8');raise
