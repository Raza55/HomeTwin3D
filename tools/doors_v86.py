"""Tag v85 right leaves for the HA contact wizard and export a closed live model."""
import bpy, json, uuid, sys, traceback
from pathlib import Path
root=Path('..')
sys.path.insert(0,str(root/'3Dash_webapp/tools'))
import importlib.util
spec=importlib.util.spec_from_file_location('blender_3dash_current',Path('tools/blender_3dash.py'))
blender_3dash=importlib.util.module_from_spec(spec);spec.loader.exec_module(blender_3dash)

def gltf(v):return [v[0],v[2],-v[1]]
try:
    report=json.loads(Path('.qa/v85-openings.json').read_text())
    labels={'WZ_Schraeg_Rechts':'Fenstertür Wohnzimmer schräg', 'WZ_Mitte_Rechts':'Fenstertür Wohnzimmer Mitte',
            'WZ_Essplatz_Rechts':'Fenstertür Essplatz', 'Balkontuer_Links':'Balkontür'}
    for row in report:
        if row['name'] not in labels:continue
        o=bpy.data.objects[row['objects'][0]]
        normal=row['normal'];sign=-1 if row['name']=='Balkontuer_Links' else 1
        props={'ha_id':str(uuid.uuid5(uuid.NAMESPACE_URL,'3dash:door:'+row['name'])),
               'ha_domain':'binary_sensor','ha_entity_id':'','ha_label':labels[row['name']],
               'ha_room':'Wohn- und Essbereich','ha_door_kind':'single' if sign==-1 else 'double',
               'ha_door_geometry':json.dumps({'hinge':gltf(row['hinge']),'swingAxis':gltf((0,0,1)),
                    'tiltAxis':gltf((-normal[1],normal[0],0)),'swingDegrees':90*sign,'tiltDegrees':10})}
        for key,value in props.items():o[key]=value
    path=root/'blender/Wohnung_v86_3Dash_Tuerkontakte.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    manifest=blender_3dash.build_manifest(bpy.context.scene)
    Path('.qa/v86-doors.json').write_text(json.dumps([o for o in manifest['objects'] if 'door' in o]))
    # export_doors_v86.py + patch_doors_v86.mjs preserve the verified v84 export.
except Exception:
    Path('.qa/v86-error.txt').write_text(traceback.format_exc())
    raise
