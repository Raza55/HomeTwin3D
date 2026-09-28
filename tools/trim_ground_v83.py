import bpy,bmesh,math,json
from pathlib import Path
ROOT=Path('../blender');QA=Path('./.qa')
slope=-math.tan(math.radians(147.32672237126025));intercept=10.443757057189941+slope*9.838128089904785+.12
report=[]
for name in ['Bestand_Grundriss_Fenster_weitere_Raeume','Original_gesamte_Wohnung']:
 o=bpy.data.objects[name];bm=bmesh.new();bm.from_mesh(o.data)
 faces=[f for f in bm.faces if o.data.materials[f.material_index].name=='ground_1']
 changed=0
 # Rear wall trace measured from the original wall_1_2 base vertices.
 # Keep its recessed corner instead of replacing it with a convex hull.
 edge=[(.009,1.408),(3.013,5.986),(1.512,6.885),(5.766,13.339)]
 def coords(p):
  w=o.matrix_world@p
  return (w.x/100,w.z/100) if name.startswith('Original') else (w.x,-w.y)
 def clip(pts,distance):
  out=[]
  for a,b in zip(pts,pts[1:]+pts[:1]):
   da,db=distance(a),distance(b)
   if da<=1e-8:out.append(a)
   if (da<=0)!=(db<=0):out.append(a.lerp(b,da/(da-db)))
  return out
 bands=[(-100,edge[0][1],0,-.05)]
 for i,(a,b) in enumerate(zip(edge,edge[1:])):
  slope=(b[0]-a[0])/(b[1]-a[1]);offset=a[0]-slope*a[1]-.025
  bands.append((a[1],100 if i==2 else b[1],slope,offset))
 for f in faces:
  pts=[v.co.copy() for v in f.verts];mi=f.material_index
  pieces=[]
  for lo,hi,slope,offset in bands:
   part=clip(pts,lambda p:lo-coords(p)[1])
   part=clip(part,lambda p:coords(p)[1]-hi)
   part=clip(part,lambda p:slope*coords(p)[1]+offset-coords(p)[0])
   if len(part)>=3:pieces.append(part)
  bm.faces.remove(f);changed+=1
  for part in pieces:
   nf=bm.faces.new([bm.verts.new(p) for p in part]);nf.material_index=mi
 bm.to_mesh(o.data);bm.free();o.data.update();report.append(dict(name=name,clippedFaces=changed))
 assert changed>0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Wohnung_v83_3Dash_Bodenrand.blend'))
# Export only the changed ground primitive. Preserve its exact node transform so
# it can replace that primitive in the verified GLB without rebaking other meshes.
o=bpy.data.objects['Bestand_Grundriss_Fenster_weitere_Raeume'];tmp=o.copy();tmp.data=o.data.copy();bpy.context.scene.collection.objects.link(tmp)
bm=bmesh.new();bm.from_mesh(tmp.data)
bmesh.ops.delete(bm,geom=[f for f in bm.faces if tmp.data.materials[f.material_index].name!='ground_1'],context='FACES')
bm.to_mesh(tmp.data);bm.free()
bpy.ops.object.select_all(action='DESELECT');tmp.hide_set(False);tmp.hide_viewport=False;tmp.hide_render=False;tmp.select_set(True);bpy.context.view_layer.objects.active=tmp
bpy.ops.export_scene.gltf(filepath=str(QA/'v83-ground.glb'),export_format='GLB',use_selection=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False)
QA.joinpath('v83-ground-report.json').write_text(json.dumps(report,indent=2))
