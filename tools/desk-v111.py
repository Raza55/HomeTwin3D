"""v111 bedroom desk: monitor (screen, back, webcam) 8 cm up out of its V stand, headphones onto the
riser instead of into it, and a studio microphone (grille head, body, yoke with knobs, thin post)
instead of the plain ellipsoid on a thick rod. Run headless via tools/blender_run.py on
Wohnung_v110_3Dash_Haustuer75.blend (docs/MODEL_PIPELINE.md); `preview` only renders close-ups.
Writes .qa/desk-v111.json: per object its op and the exact world vertices (triangles in the GLB are
matched by their corners, because monitor, stand, headphones and microphone share one material
and their boxes overlap), plus the new microphone as .qa/desk-v111-part.glb."""
import bpy, bmesh, json, math, sys
from pathlib import Path
from mathutils import Matrix, Vector
root = Path(__file__).resolve().parent.parent
assert Path(bpy.data.filepath).name == 'Wohnung_v110_3Dash_Haustuer75.blend', 'Open the v110 source first.'
preview = 'preview' in sys.argv[1:]
scene = bpy.context.scene; obj = bpy.data.objects
deps = bpy.context.evaluated_depsgraph_get()

def world_verts(o):
    ev = o.evaluated_get(deps); me = ev.to_mesh()
    pts = [tuple(round(c, 5) for c in (ev.matrix_world @ v.co)) for v in me.vertices]
    ev.to_mesh_clear(); return pts
def bounds(objects):
    pts = [p for o in objects for p in world_verts(o)]
    return [min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]
def materials(o): return sorted({m.name for m in o.data.materials if m})
ops = []
def record(o, op):
    lo, hi = bounds([o])
    ops.append(dict(name=o.name, materials=materials(o), lo=lo, hi=hi, verts=world_verts(o), **op))

# 1. Monitor: screen, back panel, canvas and webcam up, out of the stand's joint.
MONITOR_DZ = .08
monitor = [obj[n] for n in ('SZ_Monitor_Rueckseite', 'SZ_monitor', 'SZ_monitor_Leinwand', 'SZ_Webcam')]
for o in monitor:
    record(o, dict(op='translate', d=[0, 0, MONITOR_DZ])); o.matrix_world = Matrix.Translation((0, 0, MONITOR_DZ)) @ o.matrix_world
# The stand stays: recorded so the patch can tell its triangles from the monitor's and the headphones'.
for n in ('SZ_Monitor_Standfuss', 'SZ_Monitor_Standfuss.001'): record(obj[n], dict(op='keep'))

# 2. Headphones: ear cups rest on the riser (they reached 1.8 cm into it); the band follows.
riser_top = bounds([obj['SZ_Monitor_Erhöhung']])[1][2]
phones = [obj[n] for n in ('SZ_Kopfhoerermuschel', 'SZ_Kopfhoerermuschel.001', 'SZ_Kopfhoerer_Buegel')]
cups_bottom = bounds(phones[:2])[0][2]
PHONES_DZ = round(riser_top + .001 - cups_bottom, 4)
for o in phones:
    record(o, dict(op='translate', d=[0, 0, PHONES_DZ])); o.matrix_world = Matrix.Translation((0, 0, PHONES_DZ)) @ o.matrix_world

# 3. Microphone: the old capsule and its rod go; base and wall board stay.
old_mic = [obj['SZ_Mikrofon'], obj['SZ_Mikrofon_Stativ']]
for o in old_mic: record(o, dict(op='remove'))
base_lo, base_hi = bounds([obj['SZ_Mikrofon_Standfuss']])
cx, cy, base_top = (base_lo[0] + base_hi[0]) / 2, (base_lo[1] + base_hi[1]) / 2, base_hi[2]
collection = old_mic[0].users_collection[0]
for o in old_mic: bpy.data.objects.remove(o, do_unlink=True)

def material(name, color, metallic=0., roughness=.5):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Metallic'].default_value = metallic; b.inputs['Roughness'].default_value = roughness
    return m
black = bpy.data.materials['SZ_Schwarz']
grille = material('SZ_Mikrofon_Korb', (.30, .31, .33), .85, .38)
metal = bpy.data.materials.get('SZ_Aluminium') or material('SZ_Aluminium', (.8, .8, .82), 1., .3)

parts = {}
def add(group, mat, build):
    bm = bmesh.new(); build(bm)
    me = bpy.data.meshes.new(group + '_mesh'); bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    parts.setdefault(group, []).append(me)
def cylinder(r, z0, z1, x=0., y=0., segments=28, caps=True):
    return lambda bm: bmesh.ops.create_cone(bm, cap_ends=caps, segments=segments, radius1=r, radius2=r, depth=z1 - z0,
                                            matrix=Matrix.Translation((cx + x, cy + y, (z0 + z1) / 2)))
def box(sx, sy, sz, x, y, z):
    return lambda bm: bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((cx + x, cy + y, z)) @ Matrix.Diagonal((sx, sy, sz, 1)))
def dome(r, z):
    def build(bm):
        bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=14, radius=r, matrix=Matrix.Translation((cx, cy, z)))
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < z - 1e-6], context='VERTS')
    return build

# Proportions of a desktop studio microphone (about 15 cm tall on its yoke).
R = .025
YOKE_Z, BODY_Z0, BODY_Z1, HEAD_Z1 = base_top + .118, base_top + .128, base_top + .2, base_top + .252
add('SZ_Mikrofon', black, cylinder(.0055, base_top - .002, YOKE_Z, segments=16))                     # thin post
add('SZ_Mikrofon', black, box(.078, .014, .008, 0, 0, YOKE_Z))                                       # yoke bottom
for side in (-1, 1): add('SZ_Mikrofon', black, box(.007, .014, .085, side * .036, 0, YOKE_Z + .0425))  # yoke arms
add('SZ_Mikrofon', black, cylinder(R, BODY_Z0, BODY_Z1))                                              # body
for z in (BODY_Z1 + .014, BODY_Z1 + .028, BODY_Z1 + .042):
    add('SZ_Mikrofon', black, cylinder(R + .0006, z - .0008, z + .0008, caps=False))                  # grille bands
add('SZ_Mikrofon_Korb', grille, cylinder(R + .0003, BODY_Z1, HEAD_Z1 - R * .2))                       # mesh head
add('SZ_Mikrofon_Korb', grille, dome(R + .0003, HEAD_Z1 - R * .2 - .0001))
add('SZ_Mikrofon_Ring', metal, cylinder(R + .0012, BODY_Z1 - .002, BODY_Z1 + .002, caps=False))       # trim ring
for side in (-1, 1):                                                                                 # yoke knobs
    add('SZ_Mikrofon_Ring', metal, lambda bm, s=side: bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=.0095, radius2=.0095, depth=.012,
        matrix=Matrix.Translation((cx + s * .046, cy, YOKE_Z + .062)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')))
# Badge on the front (towards the room, +y): a small metal plate.
add('SZ_Mikrofon_Ring', metal, box(.014, .002, .006, 0, R + .0008, BODY_Z0 + .03))

new = []
for group, meshes in parts.items():
    objs = []
    for me in meshes:
        o = bpy.data.objects.new(group, me); collection.objects.link(o); objs.append(o)
    with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    o = objs[0]; o.name = group; o.data.name = group + '_mesh'
    new.append(o)
new_info = [dict(name=o.name, materials=materials(o), triangles=sum(len(p.vertices) - 2 for p in o.data.polygons), lo=bounds([o])[0], hi=bounds([o])[1]) for o in new]

(root / '.qa').mkdir(exist_ok=True)
(root / '.qa' / 'desk-v111.json').write_text(json.dumps(dict(ops=ops, new=new_info, monitorDz=MONITOR_DZ, phonesDz=PHONES_DZ), indent=1), encoding='utf-8')

def look(name, eye, target, lens=50):
    cam = bpy.data.objects.new('qa_cam', bpy.data.cameras.new('qa_cam')); scene.collection.objects.link(cam)
    cam.location = eye; cam.data.lens = lens
    cam.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    scene.render.engine = 'BLENDER_WORKBENCH'; scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'MATERIAL'
    scene.render.resolution_x, scene.render.resolution_y = 900, 600
    scene.render.filepath = str(root / '.qa' / f'desk-v111-{name}.png'); bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)

if preview:
    look('desk', (10.1, -1.75, 1.35), (10.1, -3.0, 1.05), 32)
    look('mic', (10.5, -2.45, 1.32), (cx, cy, base_top + .12), 55)
    look('phones', (10.6, -2.45, 1.1), (10.6, -2.92, .95), 55)
else:
    # Part GLB with the new microphone only.
    tmp = bpy.data.scenes.new('desk_v111_part')
    for o in new: tmp.collection.objects.link(o.copy())
    win = bpy.context.window; prev = win.scene; win.scene = tmp
    bpy.ops.export_scene.gltf(filepath=str(root / '.qa' / 'desk-v111-part.glb'), use_active_scene=True, export_yup=True, export_apply=True,
                              export_normals=True, export_texcoords=True, export_extras=True, export_materials='EXPORT',
                              export_animations=False, export_cameras=False, export_lights=False)
    win.scene = prev
    for o in list(tmp.collection.objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.scenes.remove(tmp)
    bpy.ops.wm.save_as_mainfile(filepath=str(root.parent / 'blender' / 'Wohnung_v111_3Dash_Schreibtisch.blend'), copy=False)
