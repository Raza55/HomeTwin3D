import bpy, math, json, uuid
from pathlib import Path
from mathutils import Vector

out=Path('../blender/Wohnung_v84_3Dash_Waesche.blend')
created=[]
manifest=[]
def material(name,color,metal=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=.6
    return m
steel=material('3Dash_Trommel_Stahl',(.19,.22,.24),.65)
cloths=[material('3Dash_Waesche_'+str(i),c) for i,c in enumerate([(.17,.32,.43),(.7,.68,.6),(.28,.42,.38)])]
for kind,label,z,radius in [('washer','Waschmaschine',.513,.181),('dryer','Trockner',1.389,.178)]:
    uid=str(uuid.uuid5(uuid.NAMESPACE_URL,'3dash:appliance:'+kind))
    center=Vector((4.729,-1.062,z))
    parts=[]
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=radius,depth=.008,location=center,rotation=(math.pi/2,0,0))
    plate=bpy.context.object;plate.data.materials.append(steel);parts.append(plate)
    for i in range(3):
        a=i*math.tau/3
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=1,location=center+Vector((math.cos(a)*.085,-.011,math.sin(a)*.085)))
        o=bpy.context.object;o.scale=(.07,.016,.045);o.rotation_euler.y=-a;o.data.materials.append(cloths[i]);parts.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=plate;bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    plate.name='3Dash_Appliance_'+kind
    for k,v in {'ha_id':uid,'ha_domain':'sensor','ha_entity_id':'','ha_label':label,'ha_room':'Abstellkammer','ha_appliance':kind}.items():plate[k]=v
    for frame,angle in [(1,0),(31,math.pi/2),(61,math.pi),(91,math.pi*1.5),(121,math.tau)]:
        plate.rotation_euler.y=angle;plate.keyframe_insert(data_path='rotation_euler',frame=frame)
    plate.animation_data.action.name='3Dash_Appliance_'+kind
    # Blender 4/5 layered actions expose their curves through channel bags.
    action=plate.animation_data.action
    curves=getattr(action,'fcurves',[])
    if not curves:
        curves=[fc for layer in action.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]
    for fc in curves:
        for key in fc.keyframe_points:key.interpolation='LINEAR'
    created.append(plate)
    manifest.append(dict(id=uid,label=label,domain='sensor',entityId='',room='Abstellkammer',position=dict(x=-center.x,y=center.z,z=-center.y),size=dict(width=.6,height=.84,depth=.65),rotationY=0,appliance=dict(kind=kind,powerThreshold=5)))
bpy.context.scene.frame_set(1)
bpy.context.scene.render.fps=30
bpy.ops.wm.save_as_mainfile(filepath=str(out))
bpy.ops.object.select_all(action='DESELECT')
for o in created:o.select_set(True)
bpy.ops.export_scene.gltf(filepath='./.qa/v84-appliances.glb',export_format='GLB',use_selection=True,export_extras=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False,export_cameras=False,export_lights=False)
Path('./.qa/v84-appliances.json').write_text(json.dumps(manifest),encoding='utf8')
