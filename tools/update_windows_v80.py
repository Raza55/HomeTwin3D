"""Window-only material update; pair with patch_windows_glb.py for identical export settings."""
import bpy,json
from pathlib import Path
NAMES={'Wohnzimmer_Fensterglas_klar','Film_B37_Fenster_Klarglas','SZ_Neues_Fensterglas','SZ_Fenster_Klarglas'}
updated=[]
for mat in bpy.data.materials:
 if mat.name not in NAMES:continue
 mat.use_nodes=True
 nodes=mat.node_tree.nodes;nodes.clear()
 p=nodes.new('ShaderNodeBsdfPrincipled');out=nodes.new('ShaderNodeOutputMaterial')
 p.inputs['Base Color'].default_value=(.82,.94,1,1);p.inputs['Roughness'].default_value=.08
 p.inputs['Metallic'].default_value=0;p.inputs['IOR'].default_value=1.45
 p.inputs['Transmission Weight'].default_value=.95;p.inputs['Alpha'].default_value=.12
 mat.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface'])
 mat.diffuse_color=(.82,.94,1,.12);mat.surface_render_method='DITHERED';mat['ha_window_glass']=True
 updated.append(mat.name)
assert 'Wohnzimmer_Fensterglas_klar' in updated and 'SZ_Neues_Fensterglas' in updated
bpy.ops.wm.save_as_mainfile(filepath='../blender/Wohnung_v80_3Dash_Fenster.blend')
Path('./.qa/windows-v80-source.json').write_text(json.dumps(updated))
