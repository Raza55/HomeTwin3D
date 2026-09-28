"""Correct the two former square spots while preserving their stable mapping IDs."""
import bpy, sys, json, math, traceback
from pathlib import Path
from mathutils import Vector, Matrix
sys.path.insert(0,str(Path(__file__).parent))
import blender_3dash as addon
ROOT=Path('../blender')
QA=Path(__file__).parent.parent/'.qa'
def main():
    before=addon.build_manifest(bpy.context.scene)
    old=[bpy.data.objects[f'Hue_Quadratspot_{i}_Diffusor'] for i in (1,2)]
    properties=[dict(o.items()) for o in old]
    collection=bpy.data.collections.new('3Dash_Wohnzimmer_Korrektur_v78')
    bpy.context.scene.collection.children.link(collection)
    def clone(source,name,matrix):
        src=bpy.data.objects[source];o=src.copy();o.data=src.data.copy();o.name=name
        collection.objects.link(o);o.parent=None;o.matrix_world=matrix@src.matrix_world
        for key in list(o.keys()):
            if key.startswith('ha_'):del o[key]
        return o
    # Existing Hue Go mesh has its lowest point at z=.518; put its base on the floor.
    go_origin=Vector((8.0335,-6.3,.518))
    go_delta=Vector((10.55,-6.37,.015))-go_origin
    go_matrix=Matrix.Translation(go_delta)
    clone('HueGo_Weisse_Halbkugelschale','WZ_HueGo_Sofa_Schale',go_matrix)
    go=clone('HueGo_Diffusor','WZ_HueGo_Sofa_Diffusor',go_matrix)
    # Match the Play bars already modelled above the TV cabinets, rotated toward this wall.
    play_matrix=Matrix.Translation(Vector((11.005,-6.90,2.02))) @ Matrix.Rotation(-math.pi/2,4,'Z') @ Matrix.Translation(Vector((-7.80,3.442,-2.12)))
    for part in ('Gehaeuse','Standfuss'):
        clone('TV_HuePlay_Oben_Links_'+part,'WZ_HuePlay_Fenstervitrine_'+part,play_matrix)
    play=clone('TV_HuePlay_Oben_Links_Diffusor','WZ_HuePlay_Fenstervitrine_Diffusor',play_matrix)
    for o,props,label,kind,flux,direction in [
        (go,properties[0],'Hue Go neben Sofa','point',520.,(0,0,1)),
        (play,properties[1],'Hue Play Fenstervitrine oben','panel',500.,(.70710678,0,.70710678))]:
        for k,v in props.items():o[k]=v
        o['ha_label']=label;o['ha_light_type']='rgbw';o['ha_light_kind']=kind
        o['ha_light_lumens']=flux;o['ha_light_range']=4.;o['ha_light_angle']=140.;o['ha_light_direction']=direction
    for o in list(bpy.data.objects):
        if o.name.startswith(('Hue_Quadratspot_1_','Hue_Quadratspot_2_','Hue_Einzelspot_Deckenhalter','Hue_Deckenkabel')):
            bpy.data.objects.remove(o,do_unlink=True)
    bpy.context.view_layer.update();addon.discover(bpy.context.scene)
    after=addon.build_manifest(bpy.context.scene)
    assert {o['id'] for o in before['objects']}=={o['id'] for o in after['objects']}
    changed=[o for o in after['objects'] if o['id'] in {p['ha_id'] for p in properties}]
    assert len(changed)==2
    QA.joinpath('living-v78-changed.json').write_text(json.dumps(changed,ensure_ascii=False,indent=2),encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Wohnung_v78_3Dash_Wohnzimmer.blend'))
    addon.export_floorplan(str(ROOT/'Wohnung_v78_3Dash_Wohnzimmer.glb'))
    QA.joinpath('living-v78-complete.json').write_text(json.dumps({'count':len(after['objects']),'changed':changed},ensure_ascii=False),encoding='utf-8')
try:main()
except Exception:
    QA.joinpath('living-v78-error.log').write_text(traceback.format_exc(),encoding='utf-8');raise
