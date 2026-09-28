"""Run with the desired Blender installation, using --background --python."""
import bpy
import addon_utils
import shutil
import json
from pathlib import Path

source = Path(__file__).with_name('blender_3dash.py')
directory = Path(bpy.utils.user_resource('SCRIPTS', path='addons', create=True))
target = directory / source.name
shutil.copy2(source, target)
bpy.utils.refresh_script_paths()
addon_utils.enable('blender_3dash', default_set=True, persistent=True)
if 'blender_3dash' not in bpy.context.preferences.addons:
    raise RuntimeError('3Dash add-on did not activate')
bpy.ops.wm.save_userpref()
source.with_name('blender_install_result.json').write_text(json.dumps({'installed': str(target), 'blender': bpy.app.version_string}), encoding='utf-8')
