"""v105: tags everything mounted on an interior door leaf (hooks, hangers, robes, jackets, handles)
with ha_room_door_attach=<door id> and writes their evaluated bounds for door-attach-v105.mjs.
Run headless via tools/blender_run.py on Wohnung_v104_3Dash_Skulpturen.blend (see docs/MODEL_PIPELINE.md)."""
import bpy, json, re
from pathlib import Path
from mathutils import Vector
root = Path(__file__).resolve().parent.parent
assert Path(bpy.data.filepath).name == 'Wohnung_v104_3Dash_Skulpturen.blend', 'Open the v104 source first.'
# Blender-space boxes covering each door leaf plus what hangs on it (both sides).
REGIONS = {
    'Bad': ((3.35, -3.2, .15), (3.9, -2.25, 2.1)),
    'Abstellraum': ((3.3, -6.1, .15), (4.25, -5.25, 2.1)),
    'Zimmer': ((5.05, -3.2, .15), (5.35, -2.25, 2.1)),
}
# Wall/frame items inside those boxes stay static.
STATIC = re.compile(r'Scharnier|Wandschalter|Steckdose|Runddimmer|Tuerzarge|HueStrip|Laibung')
deps = bpy.context.evaluated_depsgraph_get()
parts = []
for o in bpy.context.scene.objects:
    if o.type not in ('MESH', 'CURVE') or STATIC.search(o.name):
        continue
    ev = o.evaluated_get(deps); me = ev.to_mesh()
    try:
        pts = [ev.matrix_world @ v.co for v in me.vertices]
        if not pts: continue
        lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
        for door, (a, b) in REGIONS.items():
            if all(lo[i] >= a[i] - .01 and hi[i] <= b[i] + .01 for i in range(3)):
                o['ha_room_door_attach'] = door
                mats = sorted({me.materials[p.material_index].name for p in me.polygons if me.materials and me.materials[p.material_index]})
                parts.append(dict(door=door, name=o.name, materials=mats, lo=list(lo), hi=list(hi)))
    finally:
        ev.to_mesh_clear()
(root / '.qa').mkdir(exist_ok=True)
(root / '.qa' / 'door-attach-v105.json').write_text(json.dumps(parts, indent=1), encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(root.parent / 'blender' / 'Wohnung_v105_3Dash_Tuerteile.blend'), copy=False)
