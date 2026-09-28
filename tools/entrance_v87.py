import bpy, json, math, uuid, traceback, importlib.util
from pathlib import Path
from mathutils import Vector
root=Path('..');qa=Path('.qa')
try:
 source=bpy.context.scene
 names=['F53_Wohnungseingang_'+n for n in ['Tuerblatt','Langschild','Drehknauf','Spion','Drueckerhals','Druecker']]
 objects=[source.objects[n] for n in names]
 hinge=source.objects['F53_Wohnungseingang_Scharnier'].matrix_world.translation.copy();hinge.z=.005
 control=source.objects['FENSTERTUEREN__Oeffnen_und_Kippen'];control['Haustuer_Rechts_Oeffnung']=0.0
 control.id_properties_ui('Haustuer_Rechts_Oeffnung').update(min=0,max=100,description='Haustür von innen nach rechts öffnen')
 pivot=bpy.data.objects.new('Haustuer_Rechts_Drehband',None);source.collection.objects.link(pivot);pivot.location=hinge
 d=pivot.driver_add('rotation_euler',2).driver;d.type='SCRIPTED'

 for old in list(d.variables):d.variables.remove(old)
 v=d.variables.new();v.name='angle';v.type='SINGLE_PROP';v.targets[0].id=control;v.targets[0].data_path='["Haustuer_Rechts_Oeffnung"]'
 d.expression='angle*0.017453292519943295'
 bpy.context.view_layer.update()
 uid=str(uuid.uuid5(uuid.NAMESPACE_URL,'3dash:door:Haustuer_Rechts'))
 geometry=dict(hinge=[hinge.x,hinge.z,-hinge.y],swingAxis=[0,1,0],tiltAxis=[1,0,0],swingDegrees=90,tiltDegrees=0)
 for o in objects:
  world=o.matrix_world.copy();o.parent=pivot;o.matrix_world=world
  for k,val in dict(ha_id=uid,ha_domain='binary_sensor',ha_entity_id='',ha_label='Haustür',ha_room='Flur',ha_door_kind='entrance',ha_door_geometry=json.dumps(geometry)).items():o[k]=val
 lock=bpy.data.objects.new('Haustuer_Schloss_Zuordnung',None);source.collection.objects.link(lock);lock.location=objects[2].matrix_world.translation
 for k,val in dict(ha_id=str(uuid.uuid5(uuid.NAMESPACE_URL,'3dash:lock:Haustuer')),ha_domain='lock',ha_entity_id='',ha_label='Haustür Schloss',ha_room='Flur',ha_door_lock=uid).items():lock[k]=val
 bpy.context.view_layer.update()
 free=objects[0].matrix_world.translation.copy();control['Haustuer_Rechts_Oeffnung']=90.0;control.update_tag();pivot.update_tag();d.expression=d.expression;source.frame_set(source.frame_current+1);bpy.context.view_layer.update()
 delta=objects[0].matrix_world.translation-free
 assert delta.x>.1 and delta.y>.1, (list(delta),d.is_valid,d.type,v.type,list(pivot.rotation_euler),list(hinge),list(objects[0].matrix_world.translation),control['Haustuer_Rechts_Oeffnung'], [(v.name, v.targets[0].id_type, v.targets[0].data_path, v.targets[0].id.path_resolve(v.targets[0].data_path)) for v in d.variables], d.expression, bpy.app.autoexec_fail, bpy.app.autoexec_fail_message) # Hallway is northeast of entrance.
 control['Haustuer_Rechts_Oeffnung']=0.0;control.update_tag();pivot.update_tag();d.expression=d.expression;source.frame_set(source.frame_current+1);bpy.context.view_layer.update()
 bpy.ops.wm.save_as_mainfile(filepath=str(root/'blender/Wohnung_v87_3Dash_Haustuer.blend'))
 spec=importlib.util.spec_from_file_location('addon',Path('tools/blender_3dash.py'));addon=importlib.util.module_from_spec(spec);spec.loader.exec_module(addon)
 manifest=addon.build_manifest(source)
 qa.joinpath('v87-entrance.json').write_text(json.dumps([o for o in manifest['objects'] if o['id'] in [uid,lock['ha_id']]]))
 # Export only the moving parts, with their original materials referenced by name.
 for o in objects:
  for mod in o.modifiers:
   if mod.type=='BEVEL':mod.segments=1
  if o.type=='CURVE':o.data.resolution_u=min(o.data.resolution_u,3);o.data.bevel_resolution=min(o.data.bevel_resolution,1)
 bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();temp=bpy.data.scenes.new('Entrance export');mats={}
 for o in objects:
  mesh=bpy.data.meshes.new_from_object(o.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
  obj=bpy.data.objects.new(o.name,mesh);temp.collection.objects.link(obj);obj.matrix_world=o.matrix_world.copy();obj['ha_id']=uid;obj['ha_door']=geometry
  for i,m in enumerate(mesh.materials):
   if m.name not in mats:
    placeholder=bpy.data.materials.new('v87placeholder_'+m.name);placeholder.diffuse_color=m.diffuse_color;mats[m.name]=placeholder
   mesh.materials[i]=mats[m.name]
 bpy.context.window.scene=temp
 bpy.ops.export_scene.gltf(filepath=str(qa/'v87-entrance-geometry.glb'),export_format='GLB',use_active_scene=True,export_materials='EXPORT',export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
 qa.joinpath('v87-done.json').write_text(json.dumps({'names':names,'inwardDelta':list(delta)}))
except Exception:
 qa.joinpath('v87-error.txt').write_text(traceback.format_exc());raise
