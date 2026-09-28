import bpy, json
from pathlib import Path
from mathutils import Vector
o=bpy.data.objects['Bestand_Grundriss_Fenster_weitere_Raeume']
m=o.data
# Connected mesh islands retain the original sash/frame construction.
adj=[[] for v in m.vertices]
for e in m.edges:
 a,b=e.vertices;adj[a].append(b);adj[b].append(a)
seen=set();rows=[]
for v in m.vertices:
 if v.index in seen:continue
 stack=[v.index];seen.add(v.index);ids=[]
 while stack:
  i=stack.pop();ids.append(i)
  for j in adj[i]:
   if j not in seen:seen.add(j);stack.append(j)
 points=[o.matrix_world@m.vertices[i].co for i in ids]
 lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)]
 if lo[0]<7.8 or hi[2]<.1:continue
 mats=sorted(set(m.materials[p.material_index].name for p in m.polygons if p.vertices[0] in set(ids)))
 rows.append(dict(ids=ids,min=lo,max=hi,materials=mats))
Path('./.qa/v85-islands.json').write_text(json.dumps(rows))
