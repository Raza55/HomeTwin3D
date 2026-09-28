import bpy,json
from pathlib import Path
from mathutils import Vector
s=bpy.context.scene;c=s.objects['FENSTERTUEREN__Oeffnen_und_Kippen'];o=s.objects['F53_Wohnungseingang_Tuerblatt'];p=s.objects['Haustuer_Rechts_Drehband']
start=o.matrix_world.translation.copy()
c['Haustuer_Rechts_Oeffnung']=90.;c.update_tag();s.frame_set(s.frame_current);bpy.context.view_layer.update()
delta=o.matrix_world.translation-start
assert delta.x>.1 and delta.y>.1,(list(delta),p.animation_data.drivers[0].driver.is_valid)
c['Haustuer_Rechts_Oeffnung']=0.;c.update_tag();s.frame_set(s.frame_current);bpy.context.view_layer.update()
assert (o.matrix_world.translation-start).length<1e-5
Path('./.qa/v87-verified.json').write_text(json.dumps({'inwardDelta':list(delta),'driverAfterReload':True}))
