"""v106 bedroom: headboard lower (top 1.09 -> 0.92 m), wall switches out of the door reveal onto the wall,
wall shelf narrowed flush with the triptych and raised; everything on it follows.
Run headless via tools/blender_run.py on Wohnung_v105_3Dash_Tuerteile.blend (docs/MODEL_PIPELINE.md).
Writes .qa/bedroom-v106.json: one op per object (bounds, materials, operation) for bedroom-v106.mjs."""
import bpy, json
from pathlib import Path
from mathutils import Matrix, Vector
root = Path(__file__).resolve().parent.parent
assert Path(bpy.data.filepath).name == 'Wohnung_v105_3Dash_Tuerteile.blend', 'Open the v105 source first.'
scene = bpy.context.scene; obj = bpy.data.objects
deps = bpy.context.evaluated_depsgraph_get()

def bounds(objects):
    pts = []
    for o in objects:
        ev = o.evaluated_get(deps); me = ev.to_mesh()
        pts += [ev.matrix_world @ v.co for v in me.vertices]; ev.to_mesh_clear()
    return [min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]
def materials(o): return sorted({m.name for m in o.data.materials if m})
ops = []
def record(o, op):
    lo, hi = bounds([o])
    ops.append(dict(name=o.name, materials=materials(o), lo=lo, hi=hi, ha_id=o.get('ha_id'), **op))

# 1. Headboard: top edge down to the marked line. Only the upper vertices move (bevel stays intact).
HEAD_DZ, HEAD_ABOVE = -.17, .95
for n in ('SZ_Gepolstertes_Kopfteil', 'SZ_Gepolstertes_Kopfteil.001'):
    o = obj[n]; record(o, dict(op='lift_above', z=HEAD_ABOVE, d=[0, 0, HEAD_DZ]))
    mw, inv = o.matrix_world, o.matrix_world.inverted()
    for v in o.data.vertices:
        w = mw @ v.co
        if w.z > HEAD_ABOVE: v.co = inv @ (w + Vector((0, 0, HEAD_DZ)))
# The Hue strip lies on the headboard top edge (HA light, one node in the GLB).
for o in [o for o in scene.objects if o.name.startswith('SZ_HueStrip_Kopfteil_Diffusor_')]:
    record(o, dict(op='translate', d=[0, 0, HEAD_DZ])); o.matrix_world = Matrix.Translation((0, 0, HEAD_DZ)) @ o.matrix_world

# 2. Wall switches: out of the door reveal (ends at y -2.262) onto the wall, 1.75 cm clear of it.
reveal = bounds([obj['F53_Zimmer_Laibung.001']])[1][1]
switches = [obj[n] for n in ('SZ_Wandschalter', 'SZ_Wandschalter.001', 'SZ_Wandschalter.002')]
dy = reveal + .0175 - bounds(switches)[0][1]
for o in switches:
    record(o, dict(op='translate', d=[0, dy, 0])); o.matrix_world = Matrix.Translation((0, dy, 0)) @ o.matrix_world

# 3. Shelf: flush with the outer triptych edges, raised; items keep their relative position.
RAISE = .06
pics = [obj[f'SZ_triptych_{i}_Leinwand'] for i in (1, 2, 3)]
plo, phi = bounds(pics)
board, panel = obj['SZ_Wandregal_Eichenbrett'], obj['SZ_Wandregal_Weisse_Rueckwand']
blo, bhi = bounds([board])
c_old, len_old = (blo[1] + bhi[1]) / 2, bhi[1] - blo[1]
c_new, len_new = (plo[1] + phi[1]) / 2, phi[1] - plo[1]
d = (len_old - len_new) / 2; shift = c_new - c_old
for o in (board, panel):
    record(o, dict(op='squeeze_y', c=c_old, d=d, shift=[0, shift, RAISE]))
    mw, inv = o.matrix_world, o.matrix_world.inverted()
    for v in o.data.vertices:
        w = mw @ v.co
        w.y += (d if w.y < c_old else -d) + shift; w.z += RAISE
        v.co = inv @ w
scale = len_new / len_old
def items(prefix, test=lambda o: True): return [o for o in scene.objects if o.name.startswith(prefix) and test(o)]
groups = [items('SZ_Skulptur_Sprinter'), items('SZ_Skulptur_Vorbeuge'), items('SZ_Relief_'),
          items('SZ_Moospolster', lambda o: sum(b[1] for b in bounds([o])) / 2 < c_old),
          items('SZ_Moospolster', lambda o: sum(b[1] for b in bounds([o])) / 2 >= c_old)]
for g in groups:
    assert g, 'empty item group'
    lo, hi = bounds(g); cy = (lo[1] + hi[1]) / 2
    move = [0, c_new + (cy - c_old) * scale - cy, RAISE]
    for o in g:
        record(o, dict(op='translate', d=move)); o.matrix_world = Matrix.Translation(move) @ o.matrix_world

(root / '.qa').mkdir(exist_ok=True)
(root / '.qa' / 'bedroom-v106.json').write_text(json.dumps(dict(ops=ops, shelf=dict(old=[blo[1], bhi[1]], new=[plo[1], phi[1]], raise_=RAISE), switchDy=dy), indent=1), encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(root.parent / 'blender' / 'Wohnung_v106_3Dash_Schlafzimmer.blend'), copy=False)
