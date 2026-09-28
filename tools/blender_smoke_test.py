"""Run in background Blender; creates an isolated disposable scene, never saves a .blend."""
import bpy, json, traceback, tempfile
from pathlib import Path
import blender_3dash as addon

output = Path(__file__).resolve().parent.parent / '.qa' / 'blender-smoke.json'
output.parent.mkdir(exist_ok=True)
try:
    scene = bpy.data.scenes.new('3Dash smoke test')
    bpy.context.window.scene = scene
    for x in (0, 1):
        bpy.ops.mesh.primitive_cube_add(size=.1, location=(x,0,2))
        addon.tag(bpy.context.object, 'light', 'test-fixture')
    uid = bpy.context.object['ha_id']
    manifest = addon.build_manifest(scene)
    assert len(manifest['objects']) == 1
    item = manifest['objects'][0]
    item.update(entityId='light.smoke', lightType='rgbw', lightCalibration={'lumens':900,'range':4})
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / 'bindings.json'
        path.write_text(json.dumps(manifest), encoding='utf-8')
        result = bpy.ops.scene.threedash_import_bindings(filepath=str(path))
        assert result == {'FINISHED'}
        assert all(o['ha_entity_id'] == 'light.smoke' for o in scene.objects)
        exported = addon.build_manifest(scene)['objects'][0]
        assert exported['lightType'] == 'rgbw'
        assert abs(sum(e['lumens'] for e in exported['emitters']) - 900) < .001
        assert all(e['range'] == 4 for e in exported['emitters'])
        report = addon.export_floorplan(Path(directory) / 'test.glb')
        assert report['entities'] == 1
        assert bpy.context.scene == scene and len(scene.objects) == 2
        assert all(o['ha_id'] == uid for o in scene.objects)
    output.write_text(json.dumps({'passed':True,'checks':['JSON binding import','group calibration','GLB export','source scene restoration']}),encoding='utf-8')
except Exception:
    output.write_text(json.dumps({'passed':False,'error':traceback.format_exc()}),encoding='utf-8')
    raise
