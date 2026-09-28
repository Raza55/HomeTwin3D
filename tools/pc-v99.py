"""Improve DesktopMain glazing and the light zones marked in the reference photo."""
import bpy, math, json
from pathlib import Path
root=Path(__file__).resolve().parent.parent
scene=bpy.context.scene
assert Path(bpy.data.filepath).name == 'Wohnung_v98_3Dash_IT.blend', 'Open the v98 source before running this one-time upgrade.'
def surface(name,color,alpha=1,emission=0,roughness=.25,metallic=0):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes=True;m.node_tree.nodes.clear()
    p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');out=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface'])
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Alpha'].default_value=alpha
    p.inputs['Roughness'].default_value=roughness;p.inputs['Metallic'].default_value=metallic
    p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    m.diffuse_color=(*color,alpha)
    if alpha<1:m.surface_render_method='DITHERED';m.use_transparency_overlap=False
    return m
glass=surface('SZ_PC67_Seitenglas_Reflexionsarm',(.38,.47,.54),.065,roughness=.12)
acrylic=surface('SZ_PC67_Klarglas',(.65,.79,.84),.14,roughness=.16)
led=surface('SZ_PC67_LED_Gruen',(.55,.015,1),emission=2)
fan=surface('SZ_PC67_RAM_Tuerkis',(.4,.02,1),emission=1.4)
liquid=surface('SZ_PC67_Kuehlmittel',(.9,.025,.32),.6,emission=.9)
cpu=surface('SZ_PC99_CPU_RGB',(.55,.015,1),emission=2)
front=surface('SZ_PC99_Front_RGB',(.55,.015,1),emission=2)
ram=led
for o in scene.objects:
    if o.name.startswith('SZ_PC67_RAM_RGB'):
        o.data.materials.clear();o.data.materials.append(ram)
new=[]
def line(name,points,radius,mat,closed=False):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=radius;curve.bevel_resolution=2
    spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
    for p,co in zip(spline.points,points):p.co=(*co,1)
    spline.use_cyclic_u=closed
    o=bpy.data.objects.new(name,curve);scene.collection.objects.link(o);curve.materials.append(mat);o['ha_visual_only']=True;new.append(o)
    return o
# CPU waterblock perimeter and two illuminated fittings, visible through the acrylic face.
line('SZ_PC99_CPU_Leuchtrahmen',[(10.145,-3.016,.445),(10.205,-3.016,.445),(10.205,-3.016,.511),(10.145,-3.016,.511)],.0017,cpu,True)
for z in [.463,.492]:
    line('SZ_PC99_CPU_Anschluss_'+str(z),[(10.175+.008*math.cos(i*math.tau/32),-3.014,z+.008*math.sin(i*math.tau/32)) for i in range(32)],.0015,cpu,True)
# Segmented front vent, retaining the black ribs from the original case.
for i in range(36):
    z=.097+i*.014
    line('SZ_PC99_Front_LED_'+str(i),[(9.824,-2.786,z),(9.839,-2.786,z)],.0025,front)
# RAM already has four detailed bars using the common case RGB material.
obj=bpy.data.objects['SZ_IT_DesktopMain'];config=json.loads(obj['ha_it'])
config['devices'][0]['rgbMaterials']=['SZ_PC67_LED_Gruen','SZ_PC67_RAM_Tuerkis','SZ_PC67_Kuehlmittel','SZ_PC99_CPU_RGB','SZ_PC99_Front_RGB']
obj['ha_it']=json.dumps(config)
# Export additions and corrected materials. Existing geometry stays byte-for-byte intact.
temp=bpy.data.scenes.new('PC v99 partial export');copies=[];materials=[glass,acrylic,led,fan,liquid,cpu,front]
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
try:
    for o in new:
        mesh=bpy.data.meshes.new_from_object(o.evaluated_get(deps),depsgraph=deps)
        clone=bpy.data.objects.new(o.name,mesh);temp.collection.objects.link(clone);copies.append(clone)
        clone.matrix_world=o.matrix_world.copy()
    # Material carriers are excluded by the patcher; no duplicate old geometry.
    for m in materials:
        mesh=bpy.data.meshes.new('carrier');mesh.from_pydata([(0,0,0),(.001,0,0),(0,.001,0)],[],[(0,1,2)]);mesh.materials.append(m)
        clone=bpy.data.objects.new('material_carrier_'+m.name,mesh);temp.collection.objects.link(clone);copies.append(clone)
    bpy.context.window.scene=temp
    bpy.ops.export_scene.gltf(filepath=str(root/'.qa/pc-v99-part.glb'),export_format='GLB',use_active_scene=True,export_materials='EXPORT',export_animations=False,export_cameras=False,export_lights=False)
finally:
    bpy.context.window.scene=scene
    for o in copies:
        mesh=o.data;bpy.data.objects.remove(o,do_unlink=True);bpy.data.meshes.remove(mesh)
    bpy.data.scenes.remove(temp)
(root/'.qa/pc-v99-config.json').write_text(json.dumps(config),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(root.parent/'blender/Wohnung_v99_3Dash_PC_RGB.blend'))
