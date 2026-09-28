import bpy, math, json, uuid, importlib.util, traceback, random
from pathlib import Path
from mathutils import Vector
import numpy as np
root=Path('..');qa=Path('.qa')
source=bpy.context.scene
spec=importlib.util.spec_from_file_location('addon',Path('tools/blender_3dash.py'));addon=importlib.util.module_from_spec(spec);spec.loader.exec_module(addon)
sofa=[o for o in source.objects if o.name.startswith('Sofa_')]
dining=[o for o in source.objects if o.name.startswith(('Esstisch_','Stuhl_','Polsterknopf','Essplatz_Kraeutertopf','Hue_Pendel_')) or o.name=='Tischdecke_Leinen_mit_Ueberhang']
floors=[o for o in source.objects if o.name.startswith(('SZ_Parkettstab','KZ_Eiche_Parkettstab'))]
changed=sofa+dining+floors
assert len(sofa)>10 and len(floors)>300
oldmats={m.name for o in changed if o.type in {'MESH','CURVE'} for m in o.data.materials if m}
def export_part(objects,name):
    temp=bpy.data.scenes.new(name); copies=[];placeholders={};settings=[]
    try:
        for o in objects:
            for mod in o.modifiers:
                if mod.type=='BEVEL':settings.append((mod,'segments',mod.segments));mod.segments=1
            if o.type=='CURVE':
                settings.extend([(o.data,'resolution_u',o.data.resolution_u),(o.data,'bevel_resolution',o.data.bevel_resolution)])
                o.data.resolution_u=min(3,o.data.resolution_u);o.data.bevel_resolution=min(1,o.data.bevel_resolution)
        bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
        for o in objects:
            if not addon.is_exportable(o):continue
            mesh=bpy.data.meshes.new_from_object(o.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
            c=bpy.data.objects.new(o.name,mesh);temp.collection.objects.link(c);c.matrix_world=o.matrix_world.copy();copies.append(c)
            if o.get('ha_id'):c['ha_id']=o['ha_id']
            for i,m in enumerate(mesh.materials):
                if m and not m.name.startswith('V88_'):
                    if m.name not in placeholders:
                        p=bpy.data.materials.new('v88placeholder_'+m.name);p.diffuse_color=m.diffuse_color;placeholders[m.name]=p
                    mesh.materials[i]=placeholders[m.name]
        bpy.context.window_manager.windows[0].scene=temp
        bpy.ops.export_scene.gltf(filepath=str(qa/(name+'.glb')),export_format='GLB',use_active_scene=True,export_materials='EXPORT',export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
    finally:
        bpy.context.window_manager.windows[0].scene=source
        for obj,attr,val in settings:setattr(obj,attr,val)
        for c in copies:bpy.data.objects.remove(c,do_unlink=True)
        bpy.data.scenes.remove(temp)
        for p in placeholders.values():bpy.data.materials.remove(p)
export_part(changed,'v88-old')
for o in sofa:o.location.y-=.75
for o in dining:o.location.y-=.4
# Match the original living-room floor's image and metric UV projection.
base=source.objects['Bestand_Grundriss_Fenster_weitere_Raeume'];mesh=base.data
woodfaces=[p for p in mesh.polygons if mesh.materials[p.material_index].name=='room_27_158' and abs((base.matrix_world.to_3x3()@p.normal).normalized().z)>.95]
p=max(woodfaces,key=lambda p:p.area)
points=[base.matrix_world@mesh.vertices[mesh.loops[i].vertex_index].co for i in p.loop_indices]
uv=[list(mesh.uv_layers.active.data[i].uv) for i in p.loop_indices]
projection=np.linalg.lstsq(np.array([[v.x,v.y,1] for v in points]),np.array(uv),rcond=None)[0]
for o in floors:
    o.data=o.data.copy();o.data.materials.clear();o.data.materials.append(bpy.data.materials['room_27_158'])
    layer=o.data.uv_layers.new(name='LivingRoomWoodUV')
    for i,loop in enumerate(o.data.loops):
        v=o.matrix_world@o.data.vertices[loop.vertex_index].co
        layer.data[i].uv=tuple(np.array([v.x,v.y,1])@projection)
    for p in o.data.polygons:p.material_index=0
# Editable paper/bamboo standing lamp. Broad faces face the living room (-X).
lamp=[];cx,cy=10.43,-7.38
def material(name,color):
    m=bpy.data.materials.new('V88_'+name);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=.75
    return m
paper=material('Naturpapier',(.83,.78,.65));bamboo=material('Bambus',(.38,.20,.075));dark=material('Dunkle_Rippen',(.065,.032,.012));black=material('Fuesse',(.022,.023,.021))
def objmesh(name,verts,faces,mat):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.materials.append(mat)
    o=bpy.data.objects.new('WZ_Bambus_Stehlampe_'+name,mesh);source.collection.objects.link(o);lamp.append(o);return o
def profile(t):return .14+.065*t-.045*math.sin(math.pi*t),.028*math.sin(2*math.pi*t)
def pos(u,v,t):
    w,shift=profile(t);return (cx+v*.105,cy+u*w+shift,.045+t*1.48)
def tube(name,pts,r,mat):
    verts=[];faces=[]
    for i,p in enumerate(pts):
        tangent=Vector(pts[min(i+1,len(pts)-1)])-Vector(pts[max(0,i-1)])
        tangent.normalize();a=tangent.cross(Vector((1,0,0)))
        if a.length<.01:a=tangent.cross(Vector((0,1,0)))
        a.normalize();b=tangent.cross(a)
        for j in range(6):verts.append(Vector(p)+r*(math.cos(j*math.tau/6)*a+math.sin(j*math.tau/6)*b))
        if i:
            for j in range(6):faces.append(((i-1)*6+j,(i-1)*6+(j+1)%6,i*6+(j+1)%6,i*6+j))
    return objmesh(name,verts,faces,mat)
verts=[];faces=[]
for t in [i/32 for i in range(33)]:
    for u,v in [(-1,-1),(1,-1),(1,1),(-1,1)]:verts.append(pos(u,v,t))
for i in range(32):
    for j in range(4):faces.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
shade=objmesh('Papier_Diffusor',verts,faces,paper)
for u in [-1,1]:
    for v in [-1,1]:tube('Eckrahmen',[pos(u,v,i/32) for i in range(33)],.006,bamboo)
for u in [-1,1]:
    for j in range(12):tube('Seitenrippe',[pos(u*1.012,-1+2*j/11,i/32) for i in range(33)],.004,dark)
for j in range(7):
    tube('Bambusbogen',[pos(.25+j*.11+ .18*math.sin(i/32*math.pi),-1.04,i/32) for i in range(33)],.0035,bamboo)
random.seed(88)
for row in range(21):
    t=.06+row*.041
    for col in range(3):
        u=.12+col*.27+.12*math.sin(t*math.tau);p=Vector(pos(u,-1.07,t));r=.010+random.random()*.008
        tube('Bambusring',[p+Vector((0,math.cos(j*math.tau/16)*r,math.sin(j*math.tau/16)*r*1.3)) for j in range(17)],.003,bamboo)
for t in [0,.25,.5,.75,1]:
    corners=[pos(u,v,t) for u,v in [(-1,-1),(1,-1),(1,1),(-1,1),(-1,-1)]];tube('Bindung',corners,.004,bamboo)
for u in [-1,1]:
    for v in [-1,1]:
        p=Vector(pos(u,v,0));tube('Fuss',[p-Vector((0,0,.043)),p],.014,black)
uid=str(uuid.uuid5(uuid.NAMESPACE_URL,'3dash:WZ_Bambus_Stehlampe'))
for k,val in dict(ha_id=uid,ha_domain='light',ha_entity_id='',ha_label='Bambus-Stehlampe am Essplatz',ha_room='Wohn- und Essbereich',ha_light_kind='point',ha_light_lumens=600.,ha_light_range=4.).items():shade[k]=val
bpy.context.view_layer.update()
manifest=addon.build_manifest(source)
uids={o.get('ha_id') for o in dining if o.get('ha_id')}|{uid}
qa.joinpath('v88-manifest.json').write_text(json.dumps([o for o in manifest['objects'] if o['id'] in uids]),encoding='utf8')
bpy.ops.wm.save_as_mainfile(filepath=str(root/'blender/Wohnung_v88_3Dash_Wohnen.blend'))
export_part(changed+lamp,'v88-new')
qa.joinpath('v88-done.json').write_text(json.dumps(dict(sofa=len(sofa),dining=len(dining),floorPlanks=len(floors),lampParts=len(lamp),uid=uid,uvProjection=projection.tolist())),encoding='utf8')
