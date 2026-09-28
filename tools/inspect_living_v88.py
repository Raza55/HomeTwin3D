import bpy,json
from mathutils import Vector
from pathlib import Path
items=[]
for o in bpy.data.objects:
 if any(s in o.name.lower() for s in ['sofa','couch','ess','stuhl','ensis','stehlamp']):
  bb=[o.matrix_world@Vector(v) for v in o.bound_box]
  items.append(dict(name=o.name,parent=o.parent.name if o.parent else None,type=o.type,loc=list(o.matrix_world.translation),min=[min(v[i] for v in bb) for i in range(3)],max=[max(v[i] for v in bb) for i in range(3)],props={k:str(o[k]) for k in o.keys() if k.startswith('ha_')}))
Path('./.qa/v88-inspect.json').write_text(json.dumps(items,indent=2),encoding='utf8')
