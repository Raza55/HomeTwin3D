import bpy, json, sys
from pathlib import Path
from mathutils import Vector
rows = []
for o in bpy.context.scene.objects:
    if o.hide_render:
        continue
    points = [o.matrix_world @ Vector(p) for p in o.bound_box] if o.type in {'MESH', 'CURVE', 'FONT'} else [o.matrix_world.translation]
    rows.append(dict(name=o.name, type=o.type, vertices=len(o.data.vertices) if o.type == 'MESH' else 0,
                     min=[min(p[i] for p in points) for i in range(3)], max=[max(p[i] for p in points) for i in range(3)],
                     materials=[m.name for m in getattr(o.data, 'materials', []) if m],
                     properties={k: str(o[k])[:150] for k in o.keys()}))
Path(sys.argv[sys.argv.index('--')+1]).write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
print('INSPECTED', len(rows), 'objects')
