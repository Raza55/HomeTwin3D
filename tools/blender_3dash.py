"""Install this file as a Blender add-on, or run it with --python and -- --output PATH.

The source scene stays editable. Only a temporary export scene is flattened/batched.
"""
bl_info = {'name': '3Dash Floorplan', 'author': '3Dash', 'version': (1, 0, 0), 'blender': (4, 2, 0),
           'location': 'File > Export > 3Dash Floorplan', 'category': 'Import-Export'}

import bpy
import json
import math
import re
import sys
import uuid
import struct
from collections import defaultdict
from pathlib import Path
from mathutils import Vector
from bpy_extras.io_utils import ExportHelper, ImportHelper

DOMAINS = ('light', 'cover', 'switch', 'fan', 'vacuum', 'media_player', 'sensor', 'binary_sensor', 'button', 'climate', 'lock')

def preserve_procedural_base_colors(filepath, materials):
    """Keep authored fallback colors when glTF cannot serialize a color ramp.

    Does not replace baked/image textures or alter the editable Blender shader.
    Procedural grain still requires baking; report every fallback explicitly.
    """
    colors = {}
    for material in materials:
        if not material or not material.use_nodes:
            continue
        shader = next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if shader and shader.inputs['Base Color'].is_linked:
            upstream = shader.inputs['Base Color'].links[0].from_node
            if upstream.type == 'VALTORGB':
                colors[material.name] = list(material.get('ha_export_base_color', material.diffuse_color))
    data = Path(filepath).read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20+size])
    corrected = []
    for material in document.get('materials', []):
        color = colors.get(material.get('name'))
        pbr = material.setdefault('pbrMetallicRoughness', {})
        if color is not None and 'baseColorTexture' not in pbr:
            pbr['baseColorFactor'] = color
            corrected.append(material['name'])
    encoded = json.dumps(document, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    encoded += b' ' * (-len(encoded) % 4)
    tail = data[20+size:]
    output = b'glTF' + struct.pack('<II', 2, 20+len(encoded)+len(tail))
    output += struct.pack('<I', len(encoded)) + b'JSON' + encoded + tail
    Path(filepath).write_bytes(output)
    return corrected

def room_for(name):
    for prefix, room in [('BAD_', 'Bad'), ('WC', 'WC'), ('SZ_', 'Schlafzimmer'), ('KZ_', 'Kinderzimmer'),
                         ('AK_', 'Abstellkammer'), ('A72_', 'Abstellkammer'), ('F53_', 'Flur'), ('B37_', 'Balkon')]:
        if name.startswith(prefix):
            return room
    return 'Wohn- und Essbereich'

def tag(obj, domain, key=None, label=None):
    # Existing user assignments always win.
    if not obj.get('ha_domain'):
        obj['ha_domain'] = domain
    if not obj.get('ha_id'):
        obj['ha_id'] = str(uuid.uuid5(uuid.NAMESPACE_URL, '3dash:' + (key or obj.name)))
    if 'ha_entity_id' not in obj:
        obj['ha_entity_id'] = ''
    if not obj.get('ha_label'):
        obj['ha_label'] = label or (key or obj.name).replace('_', ' ')
    if not obj.get('ha_room'):
        obj['ha_room'] = room_for(obj.name)

def discover(scene):
    """Conservative lamp detection plus explicit v75 fixture/device groups.

    Render fill lights, decorative controller LEDs and miniature lighthouses are
    not physical smart-home devices. They are intentionally not auto-mapped.
    """
    for o in scene.objects:
        n = o.name
        if n.startswith('Weisse_Decke_') or n in {'BAD_Decke', 'KZ_Decke', 'AK_Decke'}:
            o['ha_cutaway'] = True
        if o.get('ha_visual_only'):
            continue
        if o.get('ha_domain') in DOMAINS:
            tag(o, o['ha_domain'])
            continue
        if o.get('ha_ignore'):
            continue
        if o.type in {'MESH', 'CURVE', 'FONT'}:
            if ('Diffusor' in n or n in {'BAD_LED_Ring', 'BAD_Spiegelleuchte', 'F53_Lampe_1_Quadratisches_Glas', 'AK_Deckenlampe_Opalglas'}
                or re.match(r'TV_Wallwasher_.*_Geneigte_Optik', n) or n.startswith('B37_Solarleuchte')):
                tag(o, 'light')
            elif n.startswith('KZ_Geometrisches_Lichtpanel'):
                tag(o, 'light', 'KZ_Lichtpanels', 'Kinderzimmer Lichtpanels')
            elif n == 'KZ_Kopfteil_Lichtkante':
                tag(o, 'light')
            elif re.match(r'0[1-5]_.*__(Lamelle_|Untere_Abschlussleiste)', n):
                key = n.split('__')[0]
                tag(o, 'cover', key, key[3:].replace('_', ' '))
            elif n.startswith('Saugroboter_'):
                tag(o, 'vacuum', 'Saugroboter', 'Saugroboter')
            elif n.startswith('Dyson_'):
                tag(o, 'fan', 'Dyson', 'Dyson Luftreiniger')
            elif n in {'SZ_Kugel_Uhr', 'SZ_Uhrzeit', 'F41_Rundes_Messgeraet', 'F41_Messgeraet_Skala', 'KZ_Tabletgehaeuse', 'KZ_Tablet_Display', 'KZ_Tablet_Uhrzeit'}:
                room = 'Schlafzimmer' if n.startswith('SZ_') else 'Kinderzimmer' if n.startswith('KZ_') else 'Wohnzimmer'
                kind = 'show' if n.startswith('KZ_') else 'dot'
                label = 'Echo ' + ('Show' if kind == 'show' else 'Dot') + ' ' + room
                tag(o, 'media_player', label.replace(' ', '_'), label)
                o['ha_echo_kind'] = kind
                o['ha_room'] = room
            elif n.startswith(('B37_Turmventilator', 'B37_Ventilator_')) or n == 'B37_Fernbedienung':
                tag(o, 'fan', 'B37_Turmventilator', 'Balkon Turmventilator')
            elif n.startswith('B37_Dyson_'):
                tag(o, 'fan', 'B37_Weisses_Standgeraet', 'Dyson Balkon')
            elif n in {'Fernseher_Rahmen', 'Fernseher_Bildschirm'}:
                tag(o, 'media_player', 'Fernseher', 'Fernseher Wohnzimmer')
            elif n.startswith('TI9558_'):
                tag(o, 'switch', 'Kaffeemaschine', 'Siemens Kaffeemaschine')
            elif n in {'A72_Waschmaschine_Display', 'A72_Trockner_Display'}:
                tag(o, 'sensor')
        elif o.type == 'LIGHT' and not re.search(r'Tageslicht|Aufhell|Raumlicht|Bettlicht|Innenlicht|Tuerlicht|^(BAD|SZ|KZ|AK)_Deckenlicht$|^BAD_Spiegellicht$', n, re.I):
            if o.data.type != 'SUN':
                tag(o, 'light')
    return len({o.get('ha_id') for o in scene.objects if o.get('ha_domain')})

def is_exportable(o):
    return o.type in {'MESH', 'CURVE', 'FONT', 'SURFACE', 'META'} and not o.hide_render and o.visible_get() and not o.get('ha_ignore')

def bounds(objects, unit):
    points = [o.matrix_world @ Vector(p) * unit for o in objects for p in o.bound_box]
    lo = Vector([min(p[i] for p in points) for i in range(3)])
    hi = Vector([max(p[i] for p in points) for i in range(3)])
    return lo, hi

def light_emitters(objects, unit):
    """Sample real diffuser geometry, conserving total fixture flux.

    Defaults are explicit estimates, editable as ha_light_* properties. glTF/
    Babylon coordinates use (-X, Z, -Y); directions use the same linear map.
    """
    o = objects[0]
    name = o.name.lower()
    kind = o.get('ha_light_kind')
    if not kind:
        kind = 'strip' if any(s in name for s in ['lightstrip', 'lichtkante', 'pc67_led']) else 'point' if any(s in name for s in ['huego', 'solar', 'opalglas']) else 'spot' if 'spot' in name or 'wallwasher' in name else 'panel'
    flux = float(o.get('ha_light_lumens', 350 if kind == 'spot' else 700 if kind in {'strip', 'point'} else 1800))
    reach = float(o.get('ha_light_range', 5 if kind in {'strip', 'point'} else 7))
    angle = float(o.get('ha_light_angle', 55 if kind == 'spot' else 140))
    samples = []
    geom = [x for x in objects if x.type in {'MESH', 'CURVE', 'FONT'}]
    for obj in geom or objects:
        if obj.type in {'MESH', 'CURVE', 'FONT'}:
            corners = [Vector(p) for p in obj.bound_box]
            lo = Vector([min(p[i] for p in corners) for i in range(3)])
            hi = Vector([max(p[i] for p in corners) for i in range(3)])
            center = (lo+hi)/2
            extents = [(hi[i]-lo[i])*abs(obj.scale[i])*unit for i in range(3)]
            thin = min(range(3), key=lambda i: extents[i])
            long = max(range(3), key=lambda i: extents[i])
            count = min(4, max(1, math.ceil(extents[long]/.6))) if kind in {'strip', 'panel'} else 1
            if len(geom) > 4:
                count = 1
            local_normal = Vector((0,0,0)); local_normal[thin] = 1
            normal = (obj.matrix_world.to_3x3() @ local_normal).normalized()
            world_center = obj.matrix_world @ center
            if 'pendel_up' in obj.name.lower():
                normal = Vector((0,0,1))
            elif abs(normal.z) > .7:
                if normal.z > 0: normal.negate()
            else:
                anchors = {'Kinderzimmer': Vector((4,-8,1.2)), 'Schlafzimmer': Vector((8,-1.7,1.2)), 'Bad': Vector((2,-2,1.2)), 'Abstellkammer': Vector((4.8,-1.5,1.2))}
                target = anchors.get(room_for(obj.name), Vector((8,-6,1.2)))
                if normal.dot(target-world_center) < 0: normal.negate()
            if 'wallwasher' in obj.name.lower():
                normal = Vector((-.1,.38,.96)).normalized()
            if 'ha_light_direction' in o:
                normal = Vector(o['ha_light_direction']).normalized()
            for i in range(count):
                p = center.copy()
                p[long] += (hi[long]-lo[long]) * ((i+.5)/count-.5)
                world = (obj.matrix_world @ p) * unit
                # Move just outside the emitting surface, avoiding self-shadowing.
                world += normal * (extents[thin]/2 + .015)
                samples.append((world, normal))
        else:
            samples.append((obj.matrix_world.translation*unit, Vector((0,0,-1))))
    if len(samples) > 32:
        raise ValueError('More than 32 emitter samples for ' + o.name)
    if not 0 < flux <= 100000 or not 0 < reach <= 100 or not 1 <= angle < 180:
        raise ValueError('Invalid light calibration for ' + o.name)
    return [dict(kind='point' if kind == 'point' else 'spot', position=dict(x=-p.x,y=p.z,z=-p.y),
                 direction=dict(x=-n.x,y=n.z,z=-n.y), lumens=flux/len(samples), range=reach, angle=angle, radius=.04)
            for p,n in samples]

def build_manifest(scene):
    unit = scene.unit_settings.scale_length if scene.unit_settings.system != 'NONE' else 1.0
    groups = defaultdict(list)
    for o in scene.objects:
        if o.get('ha_domain') in DOMAINS and not o.get('ha_ignore') and not o.hide_render and o.visible_get():
            groups[o['ha_id']].append(o)
    result = []
    for uid, objects in sorted(groups.items()):
        o = objects[0]
        domains = {x['ha_domain'] for x in objects}
        entities = {x.get('ha_entity_id', '') for x in objects if x.get('ha_entity_id')}
        if len(domains) != 1 or len(entities) > 1:
            raise ValueError('Conflicting group metadata: ' + o.name)
        entity = next(iter(entities), '')
        if entity and not re.fullmatch(('(sensor|binary_sensor|switch|input_boolean)' if o.get('ha_appliance') else re.escape(o['ha_domain'])) + r'\.[a-z0-9_]+', entity):
            raise ValueError('Invalid HA entity: ' + entity)
        geom = [x for x in objects if x.type in {'MESH', 'CURVE', 'FONT'}]
        if geom:
            lo, hi = bounds(geom, unit)
            center = (lo + hi) / 2
            size = hi - lo
        else:
            center = o.matrix_world.translation * unit
            size = Vector((.12, .12, .12))
        rotation = 0.0
        width, depth = size.x, size.y
        if o['ha_domain'] == 'cover':
            # Local X is the slat's width axis in v75. Preserve diagonal windows.
            axis = o.matrix_world.to_3x3() @ Vector((1, 0, 0))
            rotation = math.degrees(math.atan2(axis.y, -axis.x))
            width = max((x.dimensions.x for x in objects), default=size.x) * unit
            # Dimensions are local-axis lengths, including object scale.
            depth = max(.025, min(size.x, size.y, .06))
        result.append(dict(id=uid, label=o.get('ha_label', o.name), domain=o['ha_domain'], entityId=entity,
                           room=o.get('ha_room', ''), position=dict(x=-center.x, y=center.z, z=-center.y),
                           size=dict(width=max(.01, width), height=max(.01, size.z), depth=max(.01, depth)), rotationY=rotation))
        if o.get('ha_appliance'):
            result[-1]['appliance'] = json.loads(o.get('ha_appliance_config', '{}')) or dict(kind=o['ha_appliance'], powerThreshold=5)
        if o.get('ha_door_lock'):
            result[-1]['doorLock'] = dict(doorId=o['ha_door_lock'])
        if o.get('ha_door_kind'):
            result[-1]['door'] = dict(kind=o['ha_door_kind'])
        if o.get('ha_status_indicator'):
            result[-1]['statusIndicator'] = json.loads(o['ha_status_indicator'])
        if o.get('ha_echo_kind'):
            result[-1]['echo'] = dict(kind=o['ha_echo_kind'])
        if o.get('ha_coffee'):
            result[-1]['coffee'] = json.loads(o['ha_coffee'])
        if o.get('ha_it'):
            result[-1]['it'] = json.loads(o['ha_it'])
        if o.get('ha_light_type'):
            result[-1]['lightType'] = o['ha_light_type']
        if o['ha_domain'] == 'light':
            result[-1]['emitters'] = light_emitters(objects, unit)
    return dict(version=1, source=Path(bpy.data.filepath).name, coordinateSystem='babylon-lh-meters', objects=result)

def export_floorplan(filepath, optimize=True):
    source = bpy.context.scene
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    discover(source)
    control = source.objects.get('ROLLOS__Oeffnung_0_bis_100_Prozent')
    cover_values = {}
    door_control = source.objects.get('FENSTERTUEREN__Oeffnen_und_Kippen')
    door_values = {}
    restored = []
    temp = None
    created_meshes = []
    try:
        # Live door poses are applied by HA after loading; always export closed geometry.
        if door_control:
            for key in door_control.keys():
                if key.endswith(('_Oeffnung', '_Kippen')):
                    door_values[key] = door_control[key]
                    door_control[key] = 0.0
            door_control.update_tag()
            source.frame_set(source.frame_current)
        if control:
            for key in control.keys():
                if re.match(r'^0[1-5]_', key):
                    cover_values[key] = control[key]
                    control[key] = 0
            control.update_tag()
            source.frame_set(source.frame_current)
        bpy.context.view_layer.update()
        manifest = build_manifest(source)
        originals = [o for o in source.objects if is_exportable(o)]
        if optimize:
            # Tiny bevels and spline tessellation dominate this architectural scene.
            # Lower their preview tessellation only for export, restoring it below.
            seen_curves = set()
            for o in originals:
                for mod in o.modifiers:
                    if mod.type == 'BEVEL' and mod.segments > 1:
                        restored.append((mod, 'segments', mod.segments))
                        mod.segments = 1
                if o.type == 'CURVE' and o.data.name not in seen_curves:
                    seen_curves.add(o.data.name)
                    for key, maximum in [('resolution_u', 3), ('bevel_resolution', 1)]:
                        if getattr(o.data, key) > maximum:
                            restored.append((o.data, key, getattr(o.data, key)))
                            setattr(o.data, key, maximum)
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        # Bake evaluated geometry (curves, text, modifiers and cover drivers) once.
        copies = []
        for o in originals:
            mesh = bpy.data.meshes.new_from_object(o.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
            if not mesh:
                continue
            created_meshes.append(mesh)
            obj = bpy.data.objects.new(o.name, mesh)
            obj.matrix_world = o.matrix_world.copy()
            if o.get('ha_id'):
                obj['ha_id'] = o['ha_id']
            if o.get('ha_door_geometry'):
                obj['ha_door'] = json.loads(o['ha_door_geometry'])
            if o.get('ha_cutaway'):
                obj['ha_cutaway'] = True
            if o.get('ha_appliance'):
                obj['ha_appliance'] = o['ha_appliance']
                if o.animation_data and o.animation_data.action:
                    obj.animation_data_create()
                    obj.animation_data.action = o.animation_data.action
                    if hasattr(o.animation_data, 'action_slot'): obj.animation_data.action_slot = o.animation_data.action_slot
            copies.append((obj, room_for(o.name)))
        temp = bpy.data.scenes.new('3Dash temporary export')
        temp.unit_settings.system = source.unit_settings.system
        temp.unit_settings.scale_length = source.unit_settings.scale_length
        temp['3dash_manifest'] = json.dumps(manifest, ensure_ascii=False)
        for o, _ in copies:
            temp.collection.objects.link(o)
        bpy.context.window.scene = temp
        buckets = defaultdict(list)
        for o, room in copies:
            materials = () if o.get('ha_door') else tuple(m.name if m else '' for m in o.data.materials)
            buckets[(room, materials, o.get('ha_id', ''), bool(o.get('ha_cutaway')))].append(o)
        if optimize:
            # Batch only static objects with identical material slots. Entity meshes
            # remain independent, retaining IDs, interaction and material response.
            for index, group in enumerate(buckets.values()):
                if len(group) < 2 or any(o.animation_data for o in group):
                    continue
                bpy.ops.object.select_all(action='DESELECT')
                for o in group:
                    o.select_set(True)
                bpy.context.view_layer.objects.active = group[0]
                bpy.ops.object.join()
                group[0].name = 'Static_' + str(index).zfill(4)
        export_objects = len(temp.objects)
        bpy.ops.export_scene.gltf(filepath=str(filepath), export_format='GLB', use_active_scene=True,
                                  export_extras=True, export_yup=True, export_lights=False, export_cameras=False,
                                  export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_range=False, export_apply=True, export_texcoords=True,
                                  export_normals=True, export_materials='EXPORT')
        report = dict(source=manifest['source'], sourceObjects=len(originals), exportedObjects=export_objects,
                      entities=len(manifest['objects']), bytes=Path(filepath).stat().st_size,
                      objects=manifest['objects'])
        report['proceduralColorFallbacks'] = preserve_procedural_base_colors(filepath, bpy.data.materials)
        report['bytes'] = Path(filepath).stat().st_size
        Path(filepath).with_suffix('.report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        return report
    finally:
        for owner, key, value in restored:
            setattr(owner, key, value)
        bpy.context.window.scene = source
        if door_control:
            for key, value in door_values.items():
                door_control[key] = value
            door_control.update_tag()
            source.frame_set(source.frame_current)
        if temp:
            for o in list(temp.objects):
                bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.scenes.remove(temp)
        for mesh in created_meshes:
            try:
                if mesh.users == 0:
                    bpy.data.meshes.remove(mesh)
            except ReferenceError:
                pass
        if control:
            for key, value in cover_values.items():
                control[key] = value
            control.update_tag()
            source.frame_set(source.frame_current)
        bpy.context.view_layer.update()

class THREEDASH_OT_discover(bpy.types.Operator):
    bl_idname = 'scene.threedash_discover'
    bl_label = 'Lampen und Geräte erkennen'
    bl_options = {'REGISTER', 'UNDO'}
    def execute(self, context):
        self.report({'INFO'}, f'{discover(context.scene)} 3Dash-Objekte vorbereitet')
        return {'FINISHED'}

class THREEDASH_OT_export(bpy.types.Operator, ExportHelper):
    bl_idname = 'export_scene.threedash'
    bl_label = '3Dash Floorplan exportieren'
    filename_ext = '.glb'
    filter_glob: bpy.props.StringProperty(default='*.glb', options={'HIDDEN'})
    optimize: bpy.props.BoolProperty(name='Statische Geometrie bündeln', default=True)
    def execute(self, context):
        try:
            report = export_floorplan(self.filepath, self.optimize)
            self.report({'INFO'}, f"{report['entities']} Geräte, {report['exportedObjects']} Objekte exportiert")
            return {'FINISHED'}
        except Exception as error:
            self.report({'ERROR'}, str(error))
            return {'CANCELLED'}

class THREEDASH_PT_object(bpy.types.Panel):
    bl_label = '3Dash / Home Assistant'
    bl_idname = 'THREEDASH_PT_object'
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = 'object'
    def draw(self, context):
        layout = self.layout
        layout.operator('scene.threedash_discover')
        o = context.object
        if o:
            for key in ('ha_id', 'ha_domain', 'ha_entity_id', 'ha_label', 'ha_room', 'ha_light_kind', 'ha_light_lumens', 'ha_light_range', 'ha_light_angle', 'ha_light_direction'):
                if key in o:
                    layout.prop(o, f'["{key}"]', text=key)
            layout.label(text='Weitere Objekte: Custom Property ha_domain setzen.')
        layout.operator('export_scene.threedash')
        layout.operator('scene.threedash_import_bindings')

class THREEDASH_OT_import_bindings(bpy.types.Operator, ImportHelper):
    bl_idname = 'scene.threedash_import_bindings'
    bl_label = '3Dash Zuordnungen importieren'
    bl_options = {'REGISTER', 'UNDO'}
    filename_ext = '.json'
    filter_glob: bpy.props.StringProperty(default='*.json', options={'HIDDEN'})
    def execute(self, context):
        try:
            data = json.loads(Path(self.filepath).read_text(encoding='utf-8'))
            if data.get('version') != 1 or data.get('coordinateSystem') != 'babylon-lh-meters':
                raise ValueError('Keine 3Dash-Zuordnungsdatei')
            bindings = {}
            for item in data['objects']:
                entity, domain = item['entityId'], item['domain']
                if domain not in DOMAINS or (entity and not re.fullmatch(('(sensor|binary_sensor|switch|input_boolean)' if item.get('appliance') else re.escape(domain)) + r'\.[a-z0-9_]+', entity)):
                    raise ValueError('Ungültige Entity')
                if item['id'] in bindings:
                    raise ValueError('Doppelte Objektkennung')
                for key, value in item.get('lightCalibration', {}).items():
                    if key not in {'lumens', 'range'} or not isinstance(value, (float, int)) or not 0 < value <= (100 if key == 'range' else 100000):
                        raise ValueError('Ungültige Lichtkalibrierung')
                bindings[item['id']] = item
            targets = [(o, bindings[o['ha_id']]) for o in context.scene.objects if o.get('ha_id') in bindings]
            if any(o.get('ha_domain') != item['domain'] for o, item in targets):
                raise ValueError('Gerätetyp stimmt nicht mit Blender überein')
            for o, item in targets:
                o['ha_entity_id'] = item['entityId']
                if item.get('appliance'): o['ha_appliance_config'] = json.dumps(item['appliance'])
                if item.get('statusIndicator'): o['ha_status_indicator'] = json.dumps(item['statusIndicator'])
                if item.get('echo'): o['ha_echo_kind'] = item['echo']['kind']
                if item.get('coffee'): o['ha_coffee'] = json.dumps(item['coffee'])
                if item.get('it'): o['ha_it'] = json.dumps(item['it'])
                if item.get('lightType'): o['ha_light_type'] = item['lightType']
                for key, value in item.get('lightCalibration', {}).items(): o['ha_light_' + key] = value
            self.report({'INFO'}, f'{len({o["ha_id"] for o, _ in targets})} Zuordnungen übernommen')
            return {'FINISHED'}
        except Exception as error:
            self.report({'ERROR'}, str(error))
            return {'CANCELLED'}

def menu_export(self, context):
    self.layout.operator(THREEDASH_OT_export.bl_idname, text='3Dash Floorplan (.glb)')

CLASSES = (THREEDASH_OT_discover, THREEDASH_OT_export, THREEDASH_OT_import_bindings, THREEDASH_PT_object)
def register():
    for cls in CLASSES:
        bpy.utils.register_class(cls)
    bpy.types.TOPBAR_MT_file_export.append(menu_export)

def unregister():
    bpy.types.TOPBAR_MT_file_export.remove(menu_export)
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)

if __name__ == '__main__':
    if '--' in sys.argv:
        import argparse
        parser = argparse.ArgumentParser()
        parser.add_argument('--output', required=True)
        parser.add_argument('--save-copy')
        args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
        try:
            discover(bpy.context.scene)
            if args.save_copy:
                bpy.ops.wm.save_as_mainfile(filepath=args.save_copy, copy=True)
            report = export_floorplan(args.output)
            print('3DASH_EXPORT_OK', json.dumps({k: v for k, v in report.items() if k != 'objects'}))
        except Exception:
            import traceback
            Path(args.output).with_suffix('.error.txt').write_text(traceback.format_exc(), encoding='utf-8')
            raise
    else:
        register()
