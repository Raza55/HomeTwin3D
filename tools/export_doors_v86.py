"""Export only changed architecture and leaves; reuse verified v84 materials/textures."""
import bpy, json, traceback
from pathlib import Path
root=Path('./.qa')
try:
    source=bpy.context.scene
    names=['Bestand_Grundriss_Fenster_weitere_Raeume']+[o.name for o in source.objects if o.type=='MESH' and (o.name.startswith(('WZ_Schraeg_','WZ_Mitte_','WZ_Essplatz_')) or o.name=='Balkontuer_Links')]
    assert len(names)==8
    temp=bpy.data.scenes.new('Doors export')
    placeholders={}
    for name in names:
        original=source.objects[name];obj=bpy.data.objects.new(name,original.data.copy());temp.collection.objects.link(obj);obj.matrix_world=original.matrix_world.copy()
        for i,material in enumerate(obj.data.materials):
            if not material:continue
            if material.name not in placeholders:
                placeholder=bpy.data.materials.new('v86placeholder_'+material.name)
                placeholder.diffuse_color=material.diffuse_color
                placeholders[material.name]=placeholder
            obj.data.materials[i]=placeholders[material.name]
        if original.get('ha_id'):
            obj['ha_id']=original['ha_id'];obj['ha_door']=json.loads(original['ha_door_geometry'])
    bpy.context.window.scene=temp
    bpy.ops.export_scene.gltf(filepath=str(root/'v86-door-geometry.glb'),export_format='GLB',use_active_scene=True,
        export_materials='EXPORT',export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
    root.joinpath('v86-partial-done.json').write_text(json.dumps({'names':names}))
except Exception:
    root.joinpath('v86-partial-error.txt').write_text(traceback.format_exc());raise
