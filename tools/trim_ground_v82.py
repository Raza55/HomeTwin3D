import bpy,bmesh,math,json
from pathlib import Path
ROOT=Path('../blender');QA=Path('./.qa')
slope=-math.tan(math.radians(147.32672237126025));intercept=10.443757057189941+slope*9.838128089904785+.12
report=[]
for name in ['Bestand_Grundriss_Fenster_weitere_Raeume','Original_gesamte_Wohnung']:
 o=bpy.data.objects[name];bm=bmesh.new();bm.from_mesh(o.data)
 faces=[f for f in bm.faces if o.data.materials[f.material_index].name=='ground_1']
 changed=0
 for f in faces:
  pts=[v.co.copy() for v in f.verts]
  def distance(p):
   w=o.matrix_world@p
   x,z=(-w.x/100,w.z/100) if name.startswith('Original') else (-w.x,-w.y)
   return z-slope*x-intercept
  if max(map(distance,pts))<=1e-6:continue
  clipped=[]
  for a,b in zip(pts,pts[1:]+pts[:1]):
   da,db=distance(a),distance(b)
   if da<=0:clipped.append(a)
   if (da<=0)!=(db<=0):clipped.append(a.lerp(b,da/(da-db)))
  mi=f.material_index;bm.faces.remove(f);changed+=1
  if len(clipped)>=3:
   nf=bm.faces.new([bm.verts.new(p) for p in clipped]);nf.material_index=mi
 bm.to_mesh(o.data);bm.free();o.data.update();report.append(dict(name=name,clippedFaces=changed))
 assert changed>0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Wohnung_v82_3Dash_Fassadenkante.blend'))
# Export only the changed ground primitive. Preserve its exact node transform so
# it can replace that primitive in the verified GLB without rebaking other meshes.
o=bpy.data.objects['Bestand_Grundriss_Fenster_weitere_Raeume'];tmp=o.copy();tmp.data=o.data.copy();bpy.context.scene.collection.objects.link(tmp)
bm=bmesh.new();bm.from_mesh(tmp.data)
bmesh.ops.delete(bm,geom=[f for f in bm.faces if tmp.data.materials[f.material_index].name!='ground_1'],context='FACES')
bm.to_mesh(tmp.data);bm.free()
bpy.ops.object.select_all(action='DESELECT');tmp.hide_set(False);tmp.hide_viewport=False;tmp.hide_render=False;tmp.select_set(True);bpy.context.view_layer.objects.active=tmp
bpy.ops.export_scene.gltf(filepath=str(QA/'v82-ground.glb'),export_format='GLB',use_selection=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False)
QA.joinpath('v82-ground-report.json').write_text(json.dumps(report,indent=2))
