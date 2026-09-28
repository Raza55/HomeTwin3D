"""Tag the three user-identified Echo objects in the v94 source; save v95."""
import bpy
import importlib.util
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('floorplan', root / 'tools/blender_3dash.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
groups = [
    ('Echo_Dot_Schlafzimmer', 'Echo Dot Schlafzimmer', 'media_player.bedroom_speaker', 'dot', 'Schlafzimmer', ['SZ_Kugel_Uhr', 'SZ_Uhrzeit']),
    ('Echo_Dot_Wohnzimmer', 'Echo Dot Wohnzimmer', 'media_player.schlafzimmer_echo', 'dot', 'Wohnzimmer', ['F41_Rundes_Messgeraet', 'F41_Messgeraet_Skala']),
    ('Echo_Show_Kinderzimmer', 'Echo Show Kinderzimmer', 'media_player.room_display', 'show', 'Kinderzimmer', ['KZ_Tabletgehaeuse', 'KZ_Tablet_Display', 'KZ_Tablet_Uhrzeit']),
]
ids = set()
for key, label, entity, kind, room, names in groups:
    for name in names:
        obj = bpy.data.objects[name]
        module.tag(obj, 'media_player', key, label)
        obj['ha_room'] = room
        obj['ha_echo_kind'] = kind
        if not obj['ha_entity_id']:
            obj['ha_entity_id'] = entity
        ids.add(obj['ha_id'])
bpy.context.view_layer.update()
manifest = module.build_manifest(bpy.context.scene)
objects = [o for o in manifest['objects'] if o['id'] in ids]
assert len(objects) == 3
(root / '.qa/echo-v95-tags.json').write_text(json.dumps(dict(objects=objects), ensure_ascii=False), encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(root.parent / 'blender/Wohnung_v95_3Dash_Echos.blend'))
