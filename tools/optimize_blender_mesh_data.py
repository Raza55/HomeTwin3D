"""Lossless mesh datablock sharing in a NEW blend file; no topology simplification.
Run: blender --background SOURCE.blend --python this.py -- NEW.blend
"""
import bpy
import hashlib
import json
import sys
from array import array
from pathlib import Path


def signature(mesh):
    if mesh.shape_keys or mesh.animation_data or mesh.has_custom_normals or mesh.library:
        return None
    h = hashlib.sha256()
    def values(collection, field, count, code):
        data = array(code, [0]) * (len(collection) * count)
        collection.foreach_get(field, data)
        h.update(data.tobytes())
    h.update(json.dumps([len(mesh.vertices), len(mesh.edges), len(mesh.loops), len(mesh.polygons),
                         [m.name_full if m else None for m in mesh.materials],
                         dict(mesh.items())], sort_keys=True, default=str).encode())
    values(mesh.vertices, 'co', 3, 'f')
    values(mesh.edges, 'vertices', 2, 'i')
    values(mesh.loops, 'vertex_index', 1, 'i')
    values(mesh.loops, 'edge_index', 1, 'i')
    for field, code in [('loop_start', 'i'), ('loop_total', 'i'), ('material_index', 'i'), ('use_smooth', 'b')]:
        values(mesh.polygons, field, 1, code)
    layouts = {'FLOAT': ('value', 1, 'f'), 'INT': ('value', 1, 'i'), 'BOOLEAN': ('value', 1, 'b'),
               'FLOAT_VECTOR': ('vector', 3, 'f'), 'FLOAT2': ('vector', 2, 'f'),
               'FLOAT_COLOR': ('color', 4, 'f'), 'BYTE_COLOR': ('color', 4, 'f')}
    for attr in sorted(mesh.attributes, key=lambda a: a.name):
        if attr.data_type not in layouts:
            return None
        h.update(json.dumps([attr.name, attr.domain, attr.data_type]).encode())
        values(attr.data, *layouts[attr.data_type])
    h.update(json.dumps([(u.name, u.active_render, u.active_clone) for u in mesh.uv_layers]).encode())
    h.update(str(mesh.uv_layers.active_index).encode())
    h.update(str(mesh.color_attributes.active_color_index).encode())
    h.update(str(mesh.color_attributes.render_color_index).encode())
    return h.hexdigest()


output = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
source = Path(bpy.data.filepath).resolve()
if output == source or output.exists():
    raise RuntimeError('Output must be a new file; the source is never overwritten')
objects = [o for o in bpy.data.objects if o.type == 'MESH']
before = len({o.data.as_pointer() for o in objects})
seen, links, unused = {}, [], []
for obj in objects:
    # Deform weights belong to the mesh but group meanings are object-local.
    if obj.vertex_groups or obj.library or obj.data.users != 1:
        continue
    key = signature(obj.data)
    if key is None:
        continue
    if key not in seen:
        seen[key] = obj.data
        continue
    old = obj.data
    obj.data = seen[key]
    if signature(obj.data) != key:
        raise RuntimeError('Geometry verification failed')
    links.append({'object': obj.name, 'sourceMesh': old.name, 'sharedMesh': obj.data.name})
    unused.append(old)
# Only datablocks made unused by this operation, inside this new-file process.
for mesh in unused:
    if mesh.users == 0:
        bpy.data.meshes.remove(mesh)
bpy.ops.wm.save_as_mainfile(filepath=str(output))
report = {'source': str(source), 'output': str(output), 'meshDatablocksBefore': before,
          'meshDatablocksAfter': len({o.data.as_pointer() for o in objects}), 'linkedObjects': len(links),
          'objects': len(objects), 'topologyChanged': False, 'links': links}
output.with_suffix('.mesh-sharing.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k != 'links'}))
