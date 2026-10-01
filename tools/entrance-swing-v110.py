"""v110 entrance door: swing 77 -> 75 degrees (user choice).
Run headless via tools/blender_run.py on Wohnung_v109_3Dash_Haustuer77.blend (docs/MODEL_PIPELINE.md).
Writes .qa/entrance-swing-v110.json for entrance-swing-v110.mjs."""
import bpy, json
from pathlib import Path
root = Path(__file__).resolve().parent.parent
assert Path(bpy.data.filepath).name == 'Wohnung_v109_3Dash_Haustuer77.blend', 'Open the v109 source first.'
SWING = 75.0
pivot = bpy.data.objects['Haustuer_Rechts_Drehband']
parts = [o for o in pivot.children if o.get('ha_door_geometry')]
assert parts
geom = json.loads(parts[0]['ha_door_geometry']); assert geom['swingDegrees'] == 77, geom
geom['swingDegrees'] = SWING
for o in parts: o['ha_door_geometry'] = json.dumps(geom)
bpy.data.objects['FENSTERTUEREN__Oeffnen_und_Kippen'].id_properties_ui('Haustuer_Rechts_Oeffnung').update(min=0, max=SWING)
(root / '.qa' / 'entrance-swing-v110.json').write_text(json.dumps(dict(doorGeometry=geom)), encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(root.parent / 'blender' / 'Wohnung_v110_3Dash_Haustuer75.blend'), copy=False)
