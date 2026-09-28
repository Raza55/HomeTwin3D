import bpy,json
from pathlib import Path
objects=[o for o in bpy.data.objects if o.name.startswith('SZ_Fensterausblick_Fotoreferenz')]
assert objects
assert all(not o.get('ha_id') for o in objects)
names=[o.name for o in objects]
for o in objects:bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath='../blender/Wohnung_v81_3Dash_Aussenblick.blend')
Path('./.qa/window-photo-v81.json').write_text(json.dumps(names))
