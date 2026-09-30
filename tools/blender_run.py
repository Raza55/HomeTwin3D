"""Headless wrapper: the Store Blender launcher drops stdout/stderr, so this writes 'OK' or the
traceback to .qa/blender-run.log. Usage (PowerShell, see docs/MODEL_PIPELINE.md):
Start-Process -Wait -NoNewWindow "$env:LOCALAPPDATA\\Microsoft\\WindowsApps\\blender-launcher.exe" `
  -ArgumentList '-b','<source.blend>','--python','tools/blender_run.py','--','<script.py>','[preview]'"""
import runpy, sys, traceback
from pathlib import Path
log = Path(__file__).resolve().parent.parent / '.qa' / 'blender-run.log'
log.parent.mkdir(exist_ok=True)
args = sys.argv[sys.argv.index('--') + 1:]
sys.argv = args
try:
    runpy.run_path(str(Path(args[0]).resolve()), run_name='__main__')
    log.write_text('OK', encoding='utf-8')
except BaseException:
    log.write_text(traceback.format_exc(), encoding='utf-8')
