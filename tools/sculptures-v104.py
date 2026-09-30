"""v104: bedroom bronze sculptures after the reference photos (sprinter, forward bend, shoulder stand).
Run: blender -b ../blender/Wohnung_v103_3Dash_Wohnzimmer.blend --python tools/sculptures-v104.py [-- preview]
Replaces the old stick figures, saves Wohnung_v104_3Dash_Skulpturen.blend and exports the new
objects to .qa/sculptures-v104-part.glb for sculptures-v104.mjs. With "preview" only renders QA images."""
import bpy, bmesh, json, math, random, sys
from pathlib import Path
from mathutils import Matrix, Vector
root = Path(__file__).resolve().parent.parent
assert Path(bpy.data.filepath).name == 'Wohnung_v103_3Dash_Wohnzimmer.blend', 'Open the v103 source first.'
preview = 'preview' in sys.argv[1:]
scene = bpy.context.scene
random.seed(104)

def world_bounds(objects):
    pts = [o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])

# Old stick figures: remember their bounds for the GLB patch, then delete.
OLD = ['SZ_Regal_Sportfigur_links_', 'SZ_Regal_Sportfigur_rechts_', 'SZ_Kommode_Bronzefigur_']
old_bounds = []
for prefix in OLD:
    objs = [o for o in scene.objects if o.name.startswith(prefix)]
    assert len(objs) == 7, prefix
    lo, hi = world_bounds(objs)
    old_bounds.append(dict(prefix=prefix, lo=list(lo), hi=list(hi)))
    for o in objs:
        data = o.data; bpy.data.objects.remove(o, do_unlink=True)
        if data.users == 0: (bpy.data.meshes if isinstance(data, bpy.types.Mesh) else bpy.data.curves).remove(data)
shelf_top = world_bounds([bpy.data.objects['SZ_Wandregal_Eichenbrett']])[1].z
dresser_top = world_bounds([bpy.data.objects['SZ_Kommode_Marmor']])[1].z

def material(name, color, roughness, metallic):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metallic
    m.diffuse_color = (*color, 1); m.roughness = roughness; m.metallic = metallic
    return m
bronze = material('SZ_Bronze_Skulptur', (.43, .25, .105), .3, .88)
patina = material('SZ_Bronze_Patina', (.105, .075, .045), .62, .55)
collection = bpy.data.collections.get('SZ_06_Wandkunst_und_Dekoration')

def body(name, joints, bones, radii, heads, s, mat):
    """Skin-modifier body. joints/radii in human metres (X forward, Y left, Z up), scaled by s."""
    keys = list(joints)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([Vector(joints[k]) * s for k in keys], [(keys.index(a), keys.index(b)) for a, b in bones], [])
    obj = bpy.data.objects.new(name, mesh); collection.objects.link(obj)
    skin = obj.modifiers.new('Skin', 'SKIN'); skin.branch_smoothing = .7; skin.use_smooth_shade = True
    for i, k in enumerate(keys):
        r = radii[k]; r = (r, r) if isinstance(r, (int, float)) else r
        obj.data.skin_vertices[0].data[i].radius = (r[0] * s, r[1] * s)
    obj.data.skin_vertices[0].data[keys.index(keys[0])].use_root = True
    sub = obj.modifiers.new('Subdivision', 'SUBSURF'); sub.levels = 2; sub.render_levels = 2
    obj.data.materials.append(mat)
    parts = [obj]
    for hname, center, size, tilt in heads:
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1)
        me = bpy.data.meshes.new(name + '_' + hname); bm.to_mesh(me); bm.free()
        h = bpy.data.objects.new(name + '_' + hname, me); collection.objects.link(h)
        h.data.transform(Matrix.Rotation(tilt, 4, 'Y') @ Matrix.Diagonal((*(Vector(size) * s), 1)))
        h.data.transform(Matrix.Translation(Vector(center) * s))
        for p in h.data.polygons: p.use_smooth = True
        h.data.materials.append(mat); parts.append(h)
    return parts

def join(parts, name):
    """Apply modifiers and merge into one editable mesh object."""
    deps = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new(); mats = []
    for o in parts:
        me = bpy.data.meshes.new_from_object(o.evaluated_get(deps), depsgraph=deps)
        for m in me.materials:
            if m not in mats: mats.append(m)
        remap = [mats.index(m) for m in me.materials]
        for p in me.polygons: p.material_index = remap[p.material_index]
        me.transform(o.matrix_world); bm.from_mesh(me); bpy.data.meshes.remove(me)
    for o in parts:
        data = o.data; bpy.data.objects.remove(o, do_unlink=True); bpy.data.meshes.remove(data)
    mesh = bpy.data.meshes.new(name); bm.to_mesh(mesh); bm.free()
    for m in mats: mesh.materials.append(m)
    for p in mesh.polygons: p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh); collection.objects.link(obj)
    return obj

def place(obj, target, yaw, floor):
    """Rotate about Z, then move so the footprint centre sits on target and the lowest point on floor."""
    obj.data.transform(Matrix.Rotation(yaw, 4, 'Z'))
    lo, hi = world_bounds([obj]); c = (lo + hi) / 2
    obj.data.transform(Matrix.Translation((target[0] - c.x, target[1] - c.y, floor - lo.z)))
    obj.data.update()

# --- Sprinter in the set position (shelf, left end as seen from the bed). ---
J = dict(
    pelvis=(-.55, 0, .80), hipL=(-.55, .10, .77), hipR=(-.55, -.10, .77),
    spine=(-.38, 0, .81), chest=(-.20, 0, .75), upper=(-.07, 0, .70), neck=(.05, 0, .67),
    shL=(-.03, .19, .66), shR=(-.03, -.19, .66),
    bicL=(-.02, .205, .52), bicR=(-.02, -.205, .52), elL=(0, .21, .38), elR=(0, -.21, .38),
    forL=(.01, .215, .24), forR=(.01, -.215, .24), wrL=(.02, .215, .09), wrR=(.02, -.215, .09),
    fiL=(.08, .225, .01), fiR=(.08, -.225, .01), thL=(.0, .19, .02), thR=(.0, -.19, .02),
    thighL=(-.42, .11, .60), kneeL=(-.28, .12, .41), calfL=(-.38, .11, .26), ankL=(-.47, .10, .09), toeL=(-.33, .10, .02),
    thighR=(-.70, -.10, .58), kneeR=(-.84, -.10, .36), calfR=(-1.02, -.10, .25), ankR=(-1.19, -.10, .15), toeR=(-1.11, -.10, .012),
)
B = [('pelvis', 'hipL'), ('pelvis', 'hipR'), ('pelvis', 'spine'), ('spine', 'chest'), ('chest', 'upper'), ('upper', 'neck'),
     ('upper', 'shL'), ('upper', 'shR')]
for s in 'LR':
    B += [('sh' + s, 'bic' + s), ('bic' + s, 'el' + s), ('el' + s, 'for' + s), ('for' + s, 'wr' + s), ('wr' + s, 'fi' + s), ('wr' + s, 'th' + s),
          ('hip' + s, 'thigh' + s), ('thigh' + s, 'knee' + s), ('knee' + s, 'calf' + s), ('calf' + s, 'ank' + s), ('ank' + s, 'toe' + s)]
R = dict(pelvis=(.16, .14), hipL=.11, hipR=.11, spine=(.14, .13), chest=(.19, .16), upper=(.20, .14), neck=.065,
         shL=.09, shR=.09, bicL=.068, bicR=.068, elL=.045, elR=.045, forL=.055, forR=.055, wrL=.03, wrR=.03,
         fiL=(.042, .018), fiR=(.042, .018), thL=.017, thR=.017,
         thighL=.105, kneeL=.056, calfL=.072, ankL=.04, toeL=(.038, .024),
         thighR=.10, kneeR=.056, calfR=.07, ankR=.04, toeR=(.036, .024))
sprinter = join(body('SZ_Skulptur_Sprinter', J, B, R, [('Kopf', (.13, 0, .60), (.10, .082, .105), .5)], .155, bronze), 'SZ_Skulptur_Sprinter')
place(sprinter, (5.30, -2.035), math.radians(-78), shelf_top)

# --- Standing forward bend on a rock base (shelf, right end). ---
J = dict(
    pelvis=(0, 0, .92), hipL=(0, .09, .89), hipR=(0, -.09, .89), lumbar=(.13, 0, .97), chest=(.27, 0, .92), upper=(.36, 0, .80), neck=(.40, 0, .66),
    shL=(.35, .17, .79), shR=(.35, -.17, .79), elL=(.39, .16, .50), elR=(.39, -.16, .50), wrL=(.40, .15, .19), wrR=(.40, -.15, .19),
    fiL=(.44, .15, .02), fiR=(.44, -.15, .02),
    thighL=(.04, .085, .70), kneeL=(.07, .08, .50), calfL=(.10, .075, .30), ankL=(.12, .07, .08), toeL=(.25, .07, .012), heelL=(.09, .07, .02),
    thighR=(-.03, -.085, .70), kneeR=(-.05, -.085, .50), calfR=(-.08, -.09, .31), ankR=(-.11, -.10, .12), toeR=(-.02, -.10, .01),
    hair1=(.40, 0, .40), hair2=(.38, 0, .30),
)
B = [('pelvis', 'hipL'), ('pelvis', 'hipR'), ('pelvis', 'lumbar'), ('lumbar', 'chest'), ('chest', 'upper'), ('upper', 'neck'),
     ('upper', 'shL'), ('upper', 'shR'), ('neck', 'hair1'), ('hair1', 'hair2'), ('ankL', 'heelL')]
for s in 'LR':
    B += [('sh' + s, 'el' + s), ('el' + s, 'wr' + s), ('wr' + s, 'fi' + s),
          ('hip' + s, 'thigh' + s), ('thigh' + s, 'knee' + s), ('knee' + s, 'calf' + s), ('calf' + s, 'ank' + s), ('ank' + s, 'toe' + s)]
R = dict(pelvis=(.16, .13), hipL=.10, hipR=.10, lumbar=(.12, .10), chest=(.13, .11), upper=(.14, .1), neck=.045,
         shL=.055, shR=.055, elL=.034, elR=.034, wrL=.024, wrR=.024, fiL=(.03, .012), fiR=(.03, .012),
         thighL=.082, kneeL=.045, calfL=.05, ankL=.027, toeL=(.028, .016), heelL=.024,
         thighR=.082, kneeR=.045, calfR=.05, ankR=.027, toeR=(.026, .016),
         hair1=(.075, .06), hair2=(.045, .035))
parts = body('SZ_Skulptur_Vorbeuge', J, B, R, [('Kopf', (.405, 0, .52), (.075, .07, .095), 0)], .2, bronze)
# Irregular rock base: dome with flat underside and noisy outline.
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=10, radius=1)
for v in bm.verts:
    a = math.atan2(v.co.y, v.co.x); wob = 1 + .09 * math.sin(3 * a + .7) + .05 * math.sin(5 * a) + random.uniform(-.025, .025)
    v.co = Vector((.12 + v.co.x * .44 * wob, v.co.y * .28 * wob, max(v.co.z, -.35) * .14 - .05 + (random.uniform(0, .012) if v.co.z > .2 else 0)))
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
me = bpy.data.meshes.new('SZ_Skulptur_Vorbeuge_Sockel'); bm.to_mesh(me); bm.free()
me.transform(Matrix.Scale(.2, 4)); me.materials.append(patina)
rock = bpy.data.objects.new('SZ_Skulptur_Vorbeuge_Sockel', me); collection.objects.link(rock)
rock.modifiers.new('Subdivision', 'SUBSURF').levels = 1
bend = join(parts + [rock], 'SZ_Skulptur_Vorbeuge')
place(bend, (5.29, -0.60), math.radians(-70), shelf_top)

# --- Shoulder stand (dresser corner beside the Echo). ---
J = dict(
    pelvis=(0, 0, .62), hipL=(0, .08, .62), hipR=(0, -.08, .62), waist=(-.01, 0, .47), mid=(0, 0, .33), back=(.03, 0, .16), neck=(.13, 0, .09),
    shL=(.04, .17, .075), shR=(.04, -.17, .075), elL=(-.15, .20, .04), elR=(-.15, -.20, .04), wrL=(-.11, .13, .26), wrR=(-.11, -.13, .26),
    fiL=(-.08, .08, .34), fiR=(-.08, -.08, .34),
    thighL=(.012, .07, .82), kneeL=(.02, .065, 1.0), calfL=(.025, .06, 1.17), ankL=(.035, .055, 1.36), toeL=(.05, .05, 1.49),
    thighR=(-.005, -.07, .81), kneeR=(-.012, -.065, .98), calfR=(-.02, -.06, 1.14), ankR=(-.03, -.055, 1.31), toeR=(-.02, -.05, 1.43),
)
B = [('pelvis', 'hipL'), ('pelvis', 'hipR'), ('pelvis', 'waist'), ('waist', 'mid'), ('mid', 'back'), ('back', 'neck'), ('back', 'shL'), ('back', 'shR')]
for s in 'LR':
    B += [('sh' + s, 'el' + s), ('el' + s, 'wr' + s), ('wr' + s, 'fi' + s),
          ('hip' + s, 'thigh' + s), ('thigh' + s, 'knee' + s), ('knee' + s, 'calf' + s), ('calf' + s, 'ank' + s), ('ank' + s, 'toe' + s)]
R = dict(pelvis=(.15, .12), hipL=.095, hipR=.095, waist=(.10, .085), mid=(.12, .10), back=(.13, .10), neck=.045,
         shL=.06, shR=.06, elL=.035, elR=.035, wrL=.025, wrR=.025, fiL=(.03, .013), fiR=(.03, .013),
         thighL=.08, kneeL=.045, calfL=.05, ankL=.026, toeL=(.024, .016),
         thighR=.08, kneeR=.045, calfR=.05, ankR=.026, toeR=(.024, .016))
stand = join(body('SZ_Skulptur_Schulterstand', J, B, R, [('Kopf', (.24, 0, .085), (.1, .075, .08), 0)], .16, bronze), 'SZ_Skulptur_Schulterstand')
place(stand, (8.108, -0.47), math.radians(-90), dresser_top)

new = [sprinter, bend, stand]
for o in new: o['ha_visual_only'] = True
bpy.context.view_layer.update()
report = dict(old=old_bounds, shelfTop=shelf_top, dresserTop=dresser_top,
              new=[dict(name=o.name, triangles=sum(len(p.vertices) - 2 for p in o.data.polygons),
                        lo=list(world_bounds([o])[0]), hi=list(world_bounds([o])[1])) for o in new])
(root / '.qa').mkdir(exist_ok=True)
(root / '.qa' / 'sculptures-v104.json').write_text(json.dumps(report, indent=1), encoding='utf-8')

if preview:
    # Close-ups with Workbench for a quick visual check.
    scene.render.engine = 'BLENDER_WORKBENCH'; scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'MATERIAL'
    scene.render.resolution_x, scene.render.resolution_y = 900, 600
    cam = bpy.data.objects.new('QA_Kamera', bpy.data.cameras.new('QA_Kamera')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.lens = 60; cam.data.clip_start = .01
    shots = [('sprinter_front', sprinter, Vector((.55, -.05, .10))), ('sprinter_side', sprinter, Vector((.1, -.5, .08))),
             ('bend_front', bend, Vector((.55, 0, .08))), ('bend_side', bend, Vector((.2, .5, .06))),
             ('stand_front', stand, Vector((-.25, -.45, .1))), ('stand_side', stand, Vector((-.12, -.5, .3))),
             ('shelf', sprinter, None)]
    for name, o, offset in shots:
        lo, hi = world_bounds([o]); c = (lo + hi) / 2
        if offset is None:
            c = Vector((5.3, -1.31, 1.33)); offset = Vector((1.6, 0, .25)); cam.data.lens = 28
        cam.location = c + offset
        cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(root / '.qa' / f'sculptures-v104-{name}.png'); bpy.ops.render.render(write_still=True)
        cam.data.lens = 60
else:
    temp = bpy.data.scenes.new('Skulpturen v104 partial export'); copies = []
    try:
        for o in new:
            clone = bpy.data.objects.new(o.name, o.data.copy()); clone.matrix_world = o.matrix_world.copy()
            temp.collection.objects.link(clone); copies.append(clone)
        bpy.context.window.scene = temp
        bpy.ops.export_scene.gltf(filepath=str(root / '.qa' / 'sculptures-v104-part.glb'), export_format='GLB', use_active_scene=True,
                                  export_yup=True, export_apply=True, export_normals=True, export_texcoords=True, export_extras=True,
                                  export_materials='EXPORT', export_animations=False, export_cameras=False, export_lights=False)
    finally:
        bpy.context.window.scene = scene
        for o in copies:
            data = o.data; bpy.data.objects.remove(o, do_unlink=True); bpy.data.meshes.remove(data)
        bpy.data.scenes.remove(temp)
    bpy.ops.wm.save_as_mainfile(filepath=str(root.parent / 'blender' / 'Wohnung_v104_3Dash_Skulpturen.blend'), copy=False)
