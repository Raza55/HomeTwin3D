"""v107 hallway cabinet: the glazed pine cabinet next to the entrance door moves along its wall up to the corner and
gets 28 cm narrower, so the entrance door opens much further; the door swing is limited to the free angle.
Run headless via tools/blender_run.py on Wohnung_v106_3Dash_Schlafzimmer.blend (docs/MODEL_PIPELINE.md),
optionally with argument 'preview'. Writes .qa/entrance-cabinet-v107.json for entrance-cabinet-v107.mjs.

Narrowing: each glass door loses 14 cm inside its glazing (between frame and ring handle), as a continuous
piecewise-linear map along the cabinet axis, so frames, handles and side panels keep their shape.
The castle on the crown is scaled uniformly along the axis (towers become slightly oval, 77 %)."""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Matrix, Vector
root = Path(__file__).resolve().parent.parent
assert Path(bpy.data.filepath).name == 'Wohnung_v106_3Dash_Schlafzimmer.blend', 'Open the v106 source first.'
preview = 'preview' in sys.argv
scene = bpy.context.scene; obj = bpy.data.objects
NARROW, CORNER_GAP, MARGIN_DEG = .28, .005, 2.0

def verts(o):
    deps = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(deps); me = ev.to_mesh()
    p = [ev.matrix_world @ v.co for v in me.vertices]; ev.to_mesh_clear(); return p
def bounds(objects):
    pts = [p for o in objects for p in verts(o)]
    return [min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]
def materials(o): return sorted({m.name for m in o.data.materials if m})

cabinet = [o for o in scene.objects if o.name.startswith(('F53_Schrank_', 'F53_Schublade')) and o.type in ('MESH', 'CURVE')]
castle = [o for o in scene.objects if o.name.startswith('F53_Burg_') and o.type in ('MESH', 'CURVE')]
assert len(cabinet) > 20 and len(castle) > 50, (len(cabinet), len(castle))
assert not any(o.get('ha_id') for o in cabinet + castle), 'HA objects on the cabinet need node moves'

# Cabinet axis: long side of the back panel, pointing away from the entrance door (towards the corner).
back = obj['F53_Schrank_Rueckwand']
i = max(range(2), key=lambda k: back.dimensions[k])
axis = back.matrix_world.col[i].xy.normalized().to_3d()
hinge = obj['Haustuer_Rechts_Drehband'].matrix_world.translation.copy()
if (back.matrix_world.translation - hinge).dot(axis) < 0: axis = -axis
S = lambda p: p.x * axis.x + p.y * axis.y

cab_s = [S(p) for o in cabinet for p in verts(o)]
lo_s, hi_s = min(cab_s), max(cab_s)
corner = max(S(p) for p in verts(obj['F53_Sockelleiste']))  # baseboard ends where the wall turns away
shift = corner - CORNER_GAP - hi_s
assert 0 < shift < .12, shift

def srange(name): v = [S(p) for p in verts(obj[name])]; return min(v), max(v)
g1, g2 = srange('F53_Schrank_Glasscheibe.001'), srange('F53_Schrank_Glasscheibe')
h1 = min(srange('F53_Schrank_Ringgriff.001')[0], srange('F53_Schrank_Griffschild.001')[0])
h2 = max(srange('F53_Schrank_Ringgriff')[1], srange('F53_Schrank_Griffschild')[1])
if g1[0] > g2[0]: g1, g2, h1, h2 = g2, g1, h2, h1
I1 = [g1[0] + .015, min(g1[1] - .015, h1 - .01)]   # left glass door, handle on its right
I2 = [max(g2[0] + .015, h2 + .01), g2[1] - .015]   # right glass door, handle on its left
for a, b in (I1, I2): assert b - a > NARROW, (a, b)
spec = dict(axis=[axis.x, axis.y], intervals=[I1, I2], half=NARROW / 2, shift=shift)

def m(s):
    d = 0.0
    for a, b in (I1, I2): d += spec['half'] * min(max((b - s) / (b - a), 0.0), 1.0)
    return s + shift + d
c0 = (lo_s + hi_s) / 2; k = (m(hi_s) - m(lo_s)) / (hi_s - lo_s)
castle_fn = lambda s: m(c0) + (s - c0) * k
spec.update(castle=dict(c0=c0, mc0=m(c0), k=k))

ops = []
def record(o, op):
    lo, hi = bounds([o]); ops.append(dict(name=o.name, materials=materials(o), lo=lo, hi=hi, **op))
def vertex_map(o, fn):
    mw, inv = o.matrix_world, o.matrix_world.inverted()
    for v in o.data.vertices:
        w = mw @ v.co; s = S(w); v.co = inv @ (w + axis * (fn(s) - s))
def translate(o, d):
    record(o, dict(op='translate', d=list(d))); o.matrix_world = Matrix.Translation(d) @ o.matrix_world

# Objects resting in or on the cabinet that are neither cabinet nor castle (reported, must be empty).
T = lambda p: -p.x * axis.y + p.y * axis.x
cab_pts = [p for o in cabinet for p in verts(o)]
t_lo, t_hi = min(T(p) for p in cab_pts), max(T(p) for p in cab_pts)
z_lo, z_hi = min(p.z for p in cab_pts), max(p.z for p in cab_pts) + .5
others = []
for o in scene.objects:
    if o.type != 'MESH' or o in cabinet or o in castle: continue
    c = sum((o.matrix_world @ Vector(b) for b in o.bound_box), Vector()) / 8
    if lo_s < S(c) < hi_s and t_lo < T(c) < t_hi and z_lo < c.z < z_hi: others.append(o.name)
assert not others, others

# Castle: scaled uniformly along the axis (one function for every part, so shared GLB vertices stay welded).
def s_ext(o): v = [S(p) for p in verts(o)]; return min(v), max(v)

# Parts outside the glazing (side panels, handles, ...) only move; parts crossing it are remapped per vertex.
for o in cabinet:
    a, b = s_ext(o)
    if not any(a < hi and b > lo for lo, hi in (I1, I2)):
        assert abs((m(a) - a) - (m(b) - b)) < 1e-6, o.name
        translate(o, axis * (m(a) - a)); continue
    if o.type != 'MESH':  # small curve fittings (drawer pulls) keep their shape and follow their centre
        assert b - a < .2, o.name; c = (a + b) / 2
        translate(o, axis * (m(c) - c)); continue
    if o.data.users > 1: o.data = o.data.copy()
    record(o, dict(op='map_axis')); vertex_map(o, m)
for o in castle:
    if o.type != 'MESH':
        a, b = s_ext(o); c = (a + b) / 2; assert b - a < .1, o.name
        translate(o, axis * (castle_fn(c) - c)); continue
    if o.data.users > 1: o.data = o.data.copy()
    record(o, dict(op='scale_axis')); vertex_map(o, castle_fn)

# Free entrance door angle: 2D separating-axis test of each moving door part against the cabinet footprint.
bpy.context.view_layer.update()
def hull(points):
    pts = sorted({(round(p.x, 5), round(p.y, 5)) for p in points})
    if len(pts) < 3: return pts
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0: lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0: upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]
def overlap(A, B):
    for P in (A, B):
        for j in range(len(P)):
            ex, ey = P[(j + 1) % len(P)][0] - P[j][0], P[(j + 1) % len(P)][1] - P[j][1]; nx, ny = -ey, ex
            pa = [x * nx + y * ny for x, y in A]; pb = [x * nx + y * ny for x, y in B]
            if max(pa) < min(pb) or max(pb) < min(pa): return False
    return True
pivot = obj['Haustuer_Rechts_Drehband']
door_parts = [o for o in pivot.children if o.type in ('MESH', 'CURVE')]
door_z = max(p.z for o in door_parts for p in verts(o))
cab_hull = hull([p for o in cabinet for p in verts(o) if p.z < door_z])
parts = [[(p - hinge) for p in verts(o)] for o in door_parts]
geom = json.loads(door_parts[0]['ha_door_geometry'])
assert geom['swingDegrees'] == 90 and all(json.loads(o['ha_door_geometry']) == geom for o in door_parts)
def free(deg):
    r = Matrix.Rotation(math.radians(deg), 3, 'Z')
    return not any(overlap(hull([hinge + r @ p for p in P]), cab_hull) for P in parts)
assert free(0)
angle = 0.0
while angle < 90 and free(angle + .5): angle += .5
swing = 90.0 if angle >= 90 and free(90 + MARGIN_DEG) else float(math.floor(angle - MARGIN_DEG))
geom['swingDegrees'] = swing
for o in door_parts: o['ha_door_geometry'] = json.dumps(geom)
ctl = obj['FENSTERTUEREN__Oeffnen_und_Kippen']
ctl.id_properties_ui('Haustuer_Rechts_Oeffnung').update(min=0, max=swing)

new_s = [S(p) for o in cabinet for p in verts(o)]
info = dict(spec, ops=ops, others=others, corner=corner,
            widthOld=hi_s - lo_s, widthNew=max(new_s) - min(new_s), cabinetS=[min(new_s), max(new_s)],
            freeAngle=angle, swingDegrees=swing, doorGeometry=geom)
(root / '.qa').mkdir(exist_ok=True)
(root / '.qa' / 'entrance-cabinet-v107.json').write_text(json.dumps(info, indent=1), encoding='utf-8')

if preview:
    ctl['Haustuer_Rechts_Oeffnung'] = swing; ctl.update_tag(); pivot.update_tag()
    scene.frame_set(scene.frame_current + 1); bpy.context.view_layer.update()
    scene.render.engine = 'BLENDER_WORKBENCH'; scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'; scene.render.resolution_x, scene.render.resolution_y = 1200, 900
    cam = bpy.data.cameras.new('qa'); co = bpy.data.objects.new('qa', cam); scene.collection.objects.link(co); scene.camera = co
    mid = hinge + axis * ((lo_s + hi_s) / 2 - S(hinge))
    cam.type = 'ORTHO'; cam.ortho_scale = 3.2; cam.clip_start = .05
    co.matrix_world = Matrix.Translation(Vector((mid.x, mid.y, 2.45))) @ Matrix.Rotation(math.atan2(axis.y, axis.x), 4, 'Z')
    scene.render.filepath = str(root / '.qa' / 'entrance-cabinet-v107-top.png'); bpy.ops.render.render(write_still=True)
    cam.type = 'PERSP'; cam.lens = 12
    side = (center(obj['F53_Schrank_Glasscheibe']) - center(back)); side.z = 0; side.normalize()
    eye = mid + side * 1.15 + Vector((0, 0, 1.7)) - axis * .2
    co.matrix_world = Matrix.Translation(eye) @ (Vector((mid.x, mid.y, 1.0)) - eye).to_track_quat('-Z', 'Y').to_matrix().to_4x4()
    scene.render.filepath = str(root / '.qa' / 'entrance-cabinet-v107-front.png'); bpy.ops.render.render(write_still=True)
else:
    bpy.ops.wm.save_as_mainfile(filepath=str(root.parent / 'blender' / 'Wohnung_v107_3Dash_Flurschrank.blend'), copy=False)
