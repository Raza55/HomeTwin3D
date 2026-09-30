"""v103: bamboo floor lamp 30 % lower; coffee table, POAENG and beanbag closer to the sofa.
Run: blender -b ../blender/Wohnung_v100_3Dash_Ohne_Stab.blend --python tools/living-v103.py
Writes Wohnung_v103_3Dash_Wohnzimmer.blend and .qa/living-v103.json for living-v103.mjs."""
import bpy, json
from pathlib import Path
from mathutils import Matrix, Vector
root = Path(__file__).resolve().parent.parent
assert Path(bpy.data.filepath).name == 'Wohnung_v100_3Dash_Ohne_Stab.blend', 'Open the v100 source first.'
scene = bpy.context.scene

def world_bounds(objects):
    points = [o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
    return [min(p[i] for p in points) for i in range(3)], [max(p[i] for p in points) for i in range(3)]

# Moves towards the sofa (-Y). POAENG also shifts left to clear the Dyson and audio box.
MOVES = {'Couchtisch_': (0, -.70, 0), 'POAENG_': (-.15, -.50, 0), 'Sitzsack_kompakt': (0, -.60, 0)}
groups = []
for prefix, delta in MOVES.items():
    objs = [o for o in scene.objects if o.name.startswith(prefix)]
    assert objs, prefix
    lo, hi = world_bounds(objs)
    for o in objs:
        o.matrix_world = Matrix.Translation(delta) @ o.matrix_world
    groups.append(dict(prefix=prefix, delta=delta, lo=lo, hi=hi, objects=len(objs)))

# Lamp: 30 % lower overall. Feet keep their size, rings and bindings keep their shape.
lamp = [o for o in scene.objects if o.name.startswith('WZ_Bambus_Stehlampe_')]
feet = [o for o in lamp if '_Fuss' in o.name]
rigid = [o for o in lamp if '_Bambusring' in o.name or '_Bindung' in o.name]
body = [o for o in lamp if o not in feet]
z0 = world_bounds(body)[0][2]
top = world_bounds(lamp)[1][2]
scale = (.7 * top - z0) / (top - z0)
squash = Matrix.Translation((0, 0, z0)) @ Matrix.Diagonal((1, 1, scale, 1)) @ Matrix.Translation((0, 0, -z0))
for o in body:
    if o in rigid:
        lo, hi = world_bounds([o]); zc = (lo[2] + hi[2]) / 2
        o.matrix_world = Matrix.Translation((0, 0, z0 + scale * (zc - z0) - zc)) @ o.matrix_world
    else:
        o.matrix_world = squash @ o.matrix_world
bpy.context.view_layer.update()
new_top = world_bounds(lamp)[1][2]
spec = dict(groups=groups, lamp=dict(z0=z0, top=top, newTop=new_top, scale=scale, objects=len(lamp)))
out = root / '.qa' / 'living-v103.json'
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(spec, indent=1), encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(root.parent / 'blender' / 'Wohnung_v103_3Dash_Wohnzimmer.blend'), copy=False)
