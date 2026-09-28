import bpy,json
for o in bpy.context.scene.objects:
    kind=o.get('ha_appliance')
    if not kind:continue
    config=dict(kind=kind,runningStates=['on'],powerThreshold=5)
    if kind=='washer':
        o['ha_entity_id']='binary_sensor.washer_running'
        config.update(remainingEntityId='sensor.aeg_waschmaschine_timetoend_2',programEntityId='select.aeg_waschmaschine_userselections_programuid')
    else:o['ha_entity_id']='binary_sensor.dryer_running'
    o['ha_appliance_config']=json.dumps(config)
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)

import importlib.util
spec=importlib.util.spec_from_file_location('threedash','./tools/blender_3dash.py')
addon=importlib.util.module_from_spec(spec);spec.loader.exec_module(addon)
manifest=addon.build_manifest(bpy.context.scene)
from pathlib import Path
Path('./.qa/v84-blender-check.json').write_text(json.dumps(dict(appliances=[o for o in manifest['objects'] if o.get('appliance')],actions=[a.name for a in bpy.data.actions if a.name.startswith('3Dash_Appliance_')]),indent=2))
