"""Add two bedroom lightstrip circuits to v76; retain all existing fixture IDs."""
import bpy, sys, json, traceback
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import blender_3dash as addon
ROOT=Path('../blender')
def main():
    collection=bpy.data.collections.get('3Dash_Schlafzimmer_v77')
    if collection:
        for o in list(collection.objects):bpy.data.objects.remove(o,do_unlink=True)
    else:
        collection=bpy.data.collections.new('3Dash_Schlafzimmer_v77');bpy.context.scene.collection.children.link(collection)
    mat=bpy.data.materials.get('SZ77_LED_Opal') or bpy.data.materials.new('SZ77_LED_Opal')
    mat.use_nodes=True;p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.75,.77,.8,1);p.inputs['Emission Strength'].default_value=0
    def strip(key,label,center,length,axis,direction,flux,count):
        for i in range(count):
            pos=list(center);pos[axis]+=length*((i+.5)/count-.5)
            dims=[.01,.01,.004];dims[axis]=length/count
            bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.name=f'{key}_Diffusor_{i+1}';o.dimensions=dims
            bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
            for c in list(o.users_collection):c.objects.unlink(o)
            collection.objects.link(o);o.data.materials.append(mat)
            addon.tag(o,'light',key,label)
            o['ha_room']='Schlafzimmer';o['ha_light_type']='rgbw';o['ha_light_kind']='strip'
            o['ha_light_lumens']=flux;o['ha_light_range']=3.;o['ha_light_angle']=170.;o['ha_light_direction']=direction
    # Rear upper edge of both upholstered headboard panels; cast up toward the wall.
    strip('SZ_HueStrip_Kopfteil','Schlafzimmer Hue Lightstrip Kopfteil',(5.183,-1.262,1.094),1.78,1,(-.35,0,.9367497),1000.,6)
    # Behind the books on the upper rear edge of the drawer cabinet.
    strip('SZ_HueStrip_Nachttisch','Schlafzimmer Hue Lightstrip Nachttisch obere Kante',(7.75,-.362,1.078),.79,0,(0,.5,.8660254),500.,3)
    bpy.context.view_layer.update();addon.discover(bpy.context.scene)
    manifest=addon.build_manifest(bpy.context.scene)
    added=[o for o in manifest['objects'] if o['id'] in {x.get('ha_id') for x in collection.objects}]
    assert len(added)==2 and all(not o['entityId'] and o['emitters'] for o in added)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Wohnung_v77_3Dash_Schlafzimmer.blend'))
    addon.export_floorplan(str(ROOT/'Wohnung_v77_3Dash_Schlafzimmer.glb'))
    Path(__file__).parent.parent.joinpath('.qa/bedroom-v77-complete.json').write_text(json.dumps(added,ensure_ascii=False,indent=2),encoding='utf-8')
try:main()
except Exception:
    Path(__file__).parent.parent.joinpath('.qa/bedroom-v77-error.log').write_text(traceback.format_exc(),encoding='utf-8');raise
