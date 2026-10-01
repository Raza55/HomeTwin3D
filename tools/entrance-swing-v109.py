"""v109 entrance door: swing 80 -> 77 degrees (user choice).
Run headless via tools/blender_run.py on Wohnung_v108_3Dash_Haustuerwinkel.blend (docs/MODEL_PIPELINE.md).
Writes .qa/entrance-swing-v109.json for entrance-swing-v109.mjs."""
import bpy, json
from pathlib import Path
root = Path(__file__).resolve().parent.parent
assert Path(bpy.data.filepath).name == 'Wohnung_v108_3Dash_Haustuerwinkel.blend', 'Open the v108 source first.'
SWING = 77.0
pivot = bpy.data.objects['Haustuer_Rechts_Drehband']
parts = [o for o in pivot.children if o.get('ha_door_geometry')]
assert parts
geom = json.loads(parts[0]['ha_door_geometry']); assert geom['swingDegrees'] == 80, geom
geom['swingDegrees'] = SWING
for o in parts: o['ha_door_geometry'] = json.dumps(geom)
bpy.data.objects['FENSTERTUEREN__Oeffnen_und_Kippen'].id_properties_ui('Haustuer_Rechts_Oeffnung').update(min=0, max=SWING)
(root / '.qa' / 'entrance-swing-v109.json').write_text(json.dumps(dict(doorGeometry=geom)), encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(root.parent / 'blender' / 'Wohnung_v109_3Dash_Haustuer77.blend'), copy=False)
