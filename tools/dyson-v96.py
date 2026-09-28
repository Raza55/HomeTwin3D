"""Replace the user-identified folded-table placeholder by an editable Dyson tower."""
import bpy, math, json, importlib.util
from pathlib import Path
from mathutils import Matrix, Vector

root = Path(__file__).resolve().parent.parent
scene = bpy.context.scene
spec = importlib.util.spec_from_file_location('floorplan', root / 'tools/blender_3dash.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def export_part(objects, path, placeholders=False):
    temp = bpy.data.scenes.new('Dyson partial export')
    mats = {}
    clones = []
    settings = []
    try:
        if placeholders:
            for obj in objects:
                for mod in obj.modifiers:
                    if mod.type == 'BEVEL':
                        settings.append((mod, mod.segments)); mod.segments = 1
            bpy.context.view_layer.update()
        deps = bpy.context.evaluated_depsgraph_get()
        for original in objects:
            mesh = bpy.data.meshes.new_from_object(original.evaluated_get(deps), depsgraph=deps)
            obj = bpy.data.objects.new(original.name, mesh)
            temp.collection.objects.link(obj)
            clones.append(obj)
            obj.matrix_world = original.matrix_world.copy()
            for key in original.keys():
                if key.startswith('ha_'): obj[key] = original[key]
            if placeholders:
                for i, material in enumerate(mesh.materials):
                    if material.name not in mats:
                        p = bpy.data.materials.new('v96placeholder_' + material.name)
                        p.diffuse_color = material.diffuse_color
                        mats[material.name] = p
                    mesh.materials[i] = mats[material.name]
        bpy.context.window.scene = temp
        bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_active_scene=True,
            export_materials='EXPORT', export_extras=True, export_animations=False,
            export_cameras=False, export_lights=False)
    finally:
        bpy.context.window.scene = scene
        for mod, segments in settings: mod.segments = segments
        for obj in clones:
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.meshes.remove(mesh)
        bpy.data.scenes.remove(temp)
        for material in mats.values(): bpy.data.materials.remove(material)

old = [bpy.data.objects[n] for n in ['B37_Klapptisch_gefaltet', 'B37_Klapptisch_Fuge']]
export_part(old, root / '.qa/v96-old.glb', True)
center = old[0].matrix_world.translation.copy()
transform = Matrix.Translation(Vector((center.x, center.y, .025))) @ Matrix.Rotation(math.radians(33), 4, 'Z')
parts = []
original_id = bpy.data.objects['B37_Weisses_Standgeraet']['ha_id']
for name in ['B37_Weisses_Standgeraet', 'B37_Standgeraet_Fuge']:
    obj = bpy.data.objects[name]
    for key in list(obj.keys()):
        if key.startswith('ha_'): del obj[key]
def material(name, color, metal=0, rough=.35):
    m = bpy.data.materials.new('B37_Dyson_' + name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    return m
white = material('Porzellanweiss', (.82,.84,.85))
silver = material('Filter_Silber', (.49,.53,.57), .65)
dark = material('Graphit', (.025,.035,.043), .2)
blue = material('Display', (.045,.36,.55), .15)
def finish(obj, name, mat):
    obj.name = 'B37_Dyson_' + name
    obj.data.materials.append(mat)
    bpy.context.view_layer.update()
    obj.matrix_world = transform @ obj.matrix_world
    module.tag(obj, 'fan', 'B37_Dyson', 'Dyson Balkon')
    obj['ha_id'] = original_id
    obj['ha_entity_id'] = 'fan.balcony_air_purifier'
    parts.append(obj)
    return obj
def cylinder(name, radius, depth, z, mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=depth, location=(0,0,z))
    obj = bpy.context.object
    for face in obj.data.polygons: face.use_smooth = len(face.vertices)==4
    bevel = obj.modifiers.new('Feine Kanten', 'BEVEL'); bevel.width=.004; bevel.segments=3
    return finish(obj, name, mat)
cylinder('Sockel', .117, .025, .0125, dark)
cylinder('Drehbasis', .105, .035, .041, white)
cylinder('Filtergehaeuse', .108, .30, .205, silver)
cylinder('Unterer_Filterrahmen', .109, .015, .061, white)
cylinder('Oberer_Filterrahmen', .109, .028, .364, white)

# Rounded rectangular annulus: open center, curved profile and shallow oval depth.
def loop(name, width, height, thickness, depth, z, mat):
    n=96; verts=[]; faces=[]
    for j in range(12):
        a=2*math.pi*j/12
        r=width/2 - thickness/2 + math.cos(a)*thickness/2
        y=math.sin(a)*depth/2
        straight=height/2-width/2
        for i in range(n):
            t=2*math.pi*i/n
            verts.append((r*math.cos(t),y,z+r*math.sin(t)+(straight if math.sin(t)>=0 else -straight)))
    for j in range(12):
        for i in range(n):
            faces.append((j*n+i,j*n+(i+1)%n,((j+1)%12)*n+(i+1)%n,((j+1)%12)*n+i))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); scene.collection.objects.link(obj)
    for face in mesh.polygons: face.use_smooth=True
    finish(obj,name,mat)
loop('Offener_Luftring', .235, .665, .030, .075, .706, white)
loop('Innere_Luftduese', .184, .614, .007, .044, .706, dark)

# Small recessed perforation dots on the cylindrical metal filter, combined mesh.
verts=[]; faces=[]
for row in range(22):
    for col in range(48):
        a=2*math.pi*(col+(row%2)*.5)/48
        c=Vector((.1085*math.cos(a),.1085*math.sin(a),.079+row*.012))
        tangent=Vector((-math.sin(a),math.cos(a),0))
        start=len(verts)
        for k in range(6):
            t=2*math.pi*k/6
            verts.append(c+tangent*(.0019*math.cos(t))+Vector((0,0,.0019*math.sin(t))))
        faces.append(tuple(range(start,start+6)))
mesh=bpy.data.meshes.new('Filterperforation'); mesh.from_pydata(verts,[],faces); mesh.update()
obj=bpy.data.objects.new('Filterperforation',mesh); scene.collection.objects.link(obj)
finish(obj,'Filterperforation',dark)
for name,radius,depth,loc,mat in [('Rundes_Display',.018,.005,(0,.108,.328),dark),('Displayanzeige',.006,.006,(0,.111,.328),blue)]:
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=radius,depth=depth,location=loc,rotation=(math.pi/2,0,0))
    finish(bpy.context.object,name,mat)
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,1.048))
remote=bpy.context.object; remote.scale=(.032,.065,.012)
finish(remote,'Fernbedienung',silver)
for obj in old: bpy.data.objects.remove(obj,do_unlink=True)
bpy.context.view_layer.update()
export_part(parts, root / '.qa/v96-new.glb')
manifest=module.build_manifest(scene)
updates=[o for o in manifest['objects'] if o['id']==parts[0]['ha_id']]
(root / '.qa/v96-manifest.json').write_text(json.dumps(updates,ensure_ascii=False),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(root.parent / 'blender/Wohnung_v96_3Dash_DysonBalkon.blend'))
