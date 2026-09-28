import bpy, bmesh, json
from pathlib import Path
from mathutils import Vector
root=Path('./.qa')
scene=bpy.context.scene;control=bpy.data.objects['FENSTERTUEREN__Oeffnen_und_Kippen']
checks=[]
for pose,opening,tilt in [('geschlossen',0.,0.),('offen',75.,0.),('gekippt',0.,10.)]:
 for key in control.keys():
  if key.endswith('_Oeffnung'):control[key]=opening
  if key.endswith('_Kippen'):control[key]=tilt
 control.update_tag();scene.frame_set(scene.frame_current+1);bpy.context.view_layer.update()
 drivers=[d for o in bpy.data.objects if o.animation_data for d in o.animation_data.drivers if o.name.endswith(('_Drehband','_Kippband'))]
 assert all(d.driver.is_valid for d in drivers)
 checks.append({'pose':pose,'validDrivers':len(drivers)})
 # An isolated pair makes the preserved jamb and moving original sashes visible.
 temp=bpy.data.scenes.new('QA '+pose);temp.render.engine='BLENDER_WORKBENCH'
 temp.render.resolution_x=900;temp.render.resolution_y=700;temp.render.resolution_percentage=100
 temp.world=bpy.data.worlds.new('QA World');temp.world.color=(.18,.18,.18)
 temp.display.shading.light='STUDIO';temp.display.shading.color_type='MATERIAL';temp.display.shading.show_shadows=True
 temp.display.shading.show_cavity=True;temp.display.shading.background_type='WORLD'
 deps=bpy.context.evaluated_depsgraph_get()
 for name in ['WZ_Essplatz_Links','WZ_Essplatz_Rechts','Bestand_Grundriss_Fenster_weitere_Raeume']:
  original=bpy.data.objects[name];mesh=bpy.data.meshes.new_from_object(original.evaluated_get(deps),depsgraph=deps)
  obj=bpy.data.objects.new('QA '+name,mesh);temp.collection.objects.link(obj);obj.matrix_world=original.matrix_world.copy()
  if name.startswith('Bestand'):
   bm=bmesh.new();bm.from_mesh(mesh)
   remove=[]
   for v in bm.verts:
    p=obj.matrix_world@v.co
    if not (10.9<p.x<11.4 and -5.98<p.y<-4.01 and .09<p.z<2.11):remove.append(v)
   bmesh.ops.delete(bm,geom=remove,context='VERTS');bm.to_mesh(mesh);bm.free()
 camera=bpy.data.objects.new('QA Camera',bpy.data.cameras.new('QA Camera'));temp.collection.objects.link(camera)
 camera.location=(7.2,-6.8,2.6);target=Vector((10.8,-5,1.1));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
 camera.data.type='ORTHO';camera.data.ortho_scale=3.6;temp.camera=camera
 temp.render.filepath=str(root/('fenstertueren-'+pose+'.png'))
 bpy.context.window.scene=temp;bpy.ops.render.render(write_still=True);bpy.context.window.scene=scene
root.joinpath('v85-verified.json').write_text(json.dumps(checks))
