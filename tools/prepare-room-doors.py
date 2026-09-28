"""Read-only extraction of original door parts for lossless GLB unbatching."""
import bpy, json
from pathlib import Path

doors = []
for room in ['Abstellraum', 'Bad', 'Stirntuer', 'Zimmer']:
    prefix = 'F53_' + room + '_'
    hinge = bpy.data.objects[prefix + 'Scharnier'].matrix_world.translation
    parts = []
    for obj in list(bpy.context.scene.objects):
        if obj.type not in ['MESH', 'FONT', 'CURVE']:
            continue
        front = obj.name.startswith(prefix) and any(obj.name[len(prefix):].startswith(p) for p in ['Tuerblatt', 'Rosette', 'Schluesselloch', 'Druecker', 'Schild', 'Beschriftung'])
        back = (room == 'Bad' and obj.name.startswith(('BAD_Tuer', 'BAD_Hakenleiste', 'BAD_Bademantel', 'BAD_Holzbuegel'))
                or room == 'Zimmer' and obj.name.startswith(('SZ_Tuerhaken', 'SZ_Haengende_Jacke', 'SZ_Jackenaermel'))
                or room == 'Abstellraum' and obj.name.startswith(('KZ_Zimmertuer', 'KZ_Tuerdruecker', 'KZ_Tuerhakenleiste', 'KZ_Jacke_an_Tuer')))
        if not front and not back:
            continue
        # Static export uses one-segment bevels. Evaluate a temporary copy only.
        copy = obj.copy()
        copied_curve = None
        if obj.type == 'CURVE':
            copy.data = obj.data.copy()
            copied_curve = copy.data
            copy.data.resolution_u = min(copy.data.resolution_u, 3)
            copy.data.bevel_resolution = min(copy.data.bevel_resolution, 1)
        bpy.context.scene.collection.objects.link(copy)
        for modifier in copy.modifiers:
            if modifier.type == 'BEVEL': modifier.segments = 1
        bpy.context.view_layer.update()
        evaluated = copy.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        points = [obj.matrix_world @ v.co for v in mesh.vertices]
        parts.append({'name': obj.name, 'materials': [m.name for m in mesh.materials if m],
                      'vertices': [[p.x, p.z, -p.y] for p in points], 'triangles': len(mesh.loop_triangles)})
        evaluated.to_mesh_clear()
        bpy.data.objects.remove(copy, do_unlink=True)
        if copied_curve: bpy.data.curves.remove(copied_curve)
    doors.append({'id': room, 'hinge': [hinge.x, 0, -hinge.y],
                  'closedDegrees': 100 if room == 'Stirntuer' else 0,
                  'openDegrees': 0 if room == 'Stirntuer' else -90, 'parts': parts})
Path('./.qa/room-door-source.json').write_text(json.dumps(doors))
result = {'doors': [{'id': d['id'], 'parts': len(d['parts']), 'triangles': sum(p['triangles'] for p in d['parts'])} for d in doors]}
