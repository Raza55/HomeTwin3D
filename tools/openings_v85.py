"""Run on v84. Keep the source intact; separate the inspected original sash faces."""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector, Matrix

root=Path('..')
source=bpy.data.objects['Bestand_Grundriss_Fenster_weitere_Raeume']
assert len(source.data.vertices)==40737, 'Expected inspected v84 topology'
collection=bpy.data.collections.new('3Dash_Fenstertueren_v85');bpy.context.scene.collection.children.link(collection)
control=bpy.data.objects.new('FENSTERTUEREN__Oeffnen_und_Kippen',None);collection.objects.link(control)
control.empty_display_type='PLAIN_AXES';control.empty_display_size=.15
control['Anleitung']='Von innen gesehen: links nach links, rechts nach rechts. Oeffnung 0–100 Grad; Kippen 0–12 Grad. Oeffnung hat Vorrang.'
used=set();report=[]
for group in ['WZ_Schraeg','WZ_Mitte','WZ_Essplatz']:
 for side in ['Links','Rechts']:
  for mode in ['Oeffnung','Kippen']:control[group+'_'+side+'_'+mode]=0.0
control['Balkontuer_Links_Oeffnung']=0.0

def extract(name, ids):
 ids=set(ids);assert not used.intersection(ids);used.update(ids)
 mesh=source.data.copy();bm=bmesh.new();bm.from_mesh(mesh);bm.verts.ensure_lookup_table()
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index not in ids],context='VERTS');bm.to_mesh(mesh);bm.free();mesh.update()
 obj=bpy.data.objects.new(name,mesh);collection.objects.link(obj);obj.matrix_world=source.matrix_world.copy()
 return obj

def rig(name,objects,hinge,normal,sign,can_tilt=True):
 key=name+'_Oeffnung';control[key]=0.0;control.id_properties_ui(key).update(min=0,max=100,description='Nach innen öffnen (Grad)')
 tiltkey=name+'_Kippen'
 if can_tilt:
  control[tiltkey]=0.0;control.id_properties_ui(tiltkey).update(min=0,max=12,description='Oben nach innen kippen (Grad), unten angeschlagen')
 swing=bpy.data.objects.new(name+'_Drehband',None);collection.objects.link(swing);swing.location=hinge
 tilt=bpy.data.objects.new(name+'_Kippband',None);collection.objects.link(tilt);tilt.parent=swing
 tilt.rotation_mode='AXIS_ANGLE';tilt.rotation_axis_angle=(0,-normal[1],normal[0],0)
 def drive(obj,path,index,expression,keys):
  d=obj.driver_add(path,index).driver;d.type='SCRIPTED';d.expression=expression
  for var,prop in keys:
   v=d.variables.new();v.name=var;v.type='SINGLE_PROP';v.targets[0].id=control;v.targets[0].data_path='["'+prop+'"]'
 drive(swing,'rotation_euler',2,f'{sign}*min(max(open,0),100)*pi/180',[('open',key)])
 if can_tilt:drive(tilt,'rotation_axis_angle',0,'min(max(tilt,0),12)*pi/180 if open <= 0 else 0',[('open',key),('tilt',tiltkey)])
 bpy.context.view_layer.update()
 for obj in objects:
  world=obj.matrix_world.copy();obj.parent=tilt;obj.matrix_world=world
 # Verify inward travel and a fixed bottom hinge, then restore the closed pose.
 top=Vector(hinge)+Vector((0,0,1.8));local=tilt.matrix_world.inverted()@top
 if can_tilt:
  control[tiltkey]=10.0;control.update_tag();bpy.context.scene.frame_set(bpy.context.scene.frame_current);bpy.context.view_layer.update()
  delta=tilt.matrix_world@local-top
  assert delta.dot(Vector(normal))>.3,(name,'tilt points outside',list(delta),[(d.driver.is_valid,[(v.name,v.targets[0].data_path,v.targets[0].id.path_resolve(v.targets[0].data_path)) for v in d.driver.variables]) for d in tilt.animation_data.drivers])
  assert (tilt.matrix_world.translation-Vector(hinge)).length<1e-5
  control[tiltkey]=0.0
 control[key]=90.0;control.update_tag();bpy.context.scene.frame_set(bpy.context.scene.frame_current);bpy.context.view_layer.update()
 # The free edge is on the appropriate side of each hinge.
 tangent=Vector((-normal[1],normal[0],0))*(-sign)
 free=Vector(hinge)+tangent*.7
 rotated=swing.matrix_world@Vector((tangent.x*.7,tangent.y*.7,0))
 assert (rotated-free).dot(Vector(normal))>.65,(name,'swing points outside')
 control[key]=0.0;control.update_tag();bpy.context.scene.frame_set(bpy.context.scene.frame_current)
 report.append(dict(name=name,objects=[o.name for o in objects],hinge=list(hinge),normal=normal,tilt=can_tilt))

# All three full-height living-room pairs. Frame and hinge barrels stay fixed.
for group,offset,glass,hinges,normal in [
 ('WZ_Schraeg',0,4183,[(10.54,-9.835,.168),(8.99,-10.818,.168)],(-.535,.845,0)),
 ('WZ_Mitte',507,4231,[(10.98,-7.27,.168),(10.98,-9.102,.168)],(-1,0,0)),
 ('WZ_Essplatz',1014,4279,[(10.98,-4.077,.168),(10.98,-5.909,.168)],(-1,0,0)),
]:
 for side,span,gstart,hinge,sign in [('Links',(2329,2506),glass,hinges[0],-1),('Rechts',(2608,2682),glass+24,hinges[1],1)]:
  name=group+'_'+side
  obj=extract(name, list(range(span[0]+offset,span[1]+offset))+list(range(gstart,gstart+24)))
  rig(name,[obj],hinge,normal,sign)

# Balcony: original leaf profiles, glazing and handle, excluding the fixed jamb.
ids=[i for i in range(1768,2086) if (source.matrix_world@source.data.vertices[i].co).x>7.8]
balcony=extract('Balkontuer_Links',ids)
assert balcony.dimensions.x < 1, 'Balcony leaf must not include adjacent room windows'
rig('Balkontuer_Links',[balcony],(8.70,-10.66,.03),(.840,.543,0),-1,False)

# Remove only faces that were transferred to the new moving leaves.
bm=bmesh.new();bm.from_mesh(source.data);bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index in used],context='VERTS');bm.to_mesh(source.data);bm.free();source.data.update()
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT');control.select_set(True);bpy.context.view_layer.objects.active=control
text=bpy.data.texts.new('Fenstertueren_Bedienung.txt');text.write(control['Anleitung']+'\nRegler: Objekt FENSTERTUEREN__Oeffnen_und_Kippen → Objekteigenschaften → Benutzerdefinierte Eigenschaften.\nAlle drei Wohnzimmerpaare und die Balkontür sind separat steuerbar.\n')
bpy.ops.wm.save_as_mainfile(filepath=str(root/'blender/Wohnung_v85_3Dash_Fenstertueren.blend'))
Path('.qa/v85-openings.json').write_text(json.dumps(report,indent=2))
