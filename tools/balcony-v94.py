"""Tag existing balcony geometry; save a new source copy without re-exporting geometry."""
import bpy
import importlib.util
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('floorplan', root / 'tools/blender_3dash.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
groups = [
    ('B37_Turmventilator', 'Balkon Turmventilator', 'fan.turmventilator',
     [o for o in bpy.context.scene.objects if o.name.startswith(('B37_Turmventilator', 'B37_Ventilator_')) or o.name == 'B37_Fernbedienung']),
    ('B37_Weisses_Standgeraet', 'Balkon Luftreiniger', 'fan.balcony_air_purifier',
     [o for o in bpy.context.scene.objects if o.name in {'B37_Weisses_Standgeraet', 'B37_Standgeraet_Fuge'}]),
]
assert all(objects for _, _, _, objects in groups)
for key, label, entity, objects in groups:
    for obj in objects:
        module.tag(obj, 'fan', key, label)
        if not obj['ha_entity_id']:
            obj['ha_entity_id'] = entity

smoke = bpy.data.objects.get('B37_Rauchstatus')
if smoke is None:
    smoke = bpy.data.objects.new('B37_Rauchstatus', None)
    bpy.context.scene.collection.objects.link(smoke)
    # Above the balcony floor, between the two existing fans.
    a, b = [bpy.data.objects[key].matrix_world.translation for key, _, _, _ in groups]
    smoke.location = ((a.x + b.x) / 2, (a.y + b.y) / 2, 1.5)
module.tag(smoke, 'sensor', 'B37_Rauchstatus', 'Rauch unter dem Balkon')
smoke['ha_entity_id'] = 'sensor.rauchstatus_balkon'
smoke['ha_status_indicator'] = json.dumps(dict(kind='smoke', activeStates=['Ja']))

ids = {objects[0]['ha_id'] for _, _, _, objects in groups} | {smoke['ha_id']}
bpy.context.view_layer.update()
manifest = module.build_manifest(bpy.context.scene)
objects = [o for o in manifest['objects'] if o['id'] in ids]
assert len(objects) == 3
payload = dict(objects=objects, nodes={o.name: o['ha_id'] for _, _, _, group in groups for o in group})
(root / '.qa').mkdir(exist_ok=True)
(root / '.qa/balcony-v94-tags.json').write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(root.parent / 'blender/Wohnung_v94_3Dash_Balkon.blend'))
