"""Add confirmed Home Connect bindings to the existing Siemens model."""
import bpy, json, importlib.util
from pathlib import Path
root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('floorplan', root / 'tools/blender_3dash.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
coffee = dict(statusEntityId='sensor.kaffeevollautomat_operation_state',
    activeProgramEntityId='select.kaffeevollautomat_aktives_programm',
    remainingEntityId='sensor.kaffeevollautomat_remaining_program_time',
    progressEntityId='sensor.kaffeevollautomat_program_progress',
    remoteStartEntityId='binary_sensor.kaffeevollautomat_remote_start',
    connectivityEntityId='binary_sensor.kaffeevollautomat_konnektivitat',
    localControlEntityId='binary_sensor.kaffeevollautomat_lokale_steuerung',
    stopEntityId='button.kaffeevollautomat_programm_stoppen')
parts = [o for o in bpy.context.scene.objects if o.name.startswith('TI9558_')]
assert parts
for obj in parts:
    module.tag(obj, 'switch', 'Kaffeemaschine', 'Siemens Kaffeevollautomat')
    obj['ha_room'] = 'Wohnzimmer'
    obj['ha_label'] = 'Siemens Kaffeevollautomat'
    obj['ha_coffee'] = json.dumps(coffee)
    obj['ha_entity_id'] = 'switch.kaffeevollautomat_power'
manifest = module.build_manifest(bpy.context.scene)
objects = [o for o in manifest['objects'] if o['id'] == parts[0]['ha_id']]
assert len(objects) == 1
(root / '.qa/coffee-v97-tags.json').write_text(json.dumps(dict(objects=objects),ensure_ascii=False),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(root.parent / 'blender/Wohnung_v97_3Dash_Kaffee.blend'))
