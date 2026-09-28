"""TV-wall additions from the user's annotated photo. Leaves the v75 source untouched."""
import bpy, sys, json, math
from pathlib import Path
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).parent))
import blender_3dash as addon

ROOT=Path('../blender')
collection=bpy.data.collections.get('3Dash_TV_Wand_v76')
if collection:
    for o in list(collection.objects): bpy.data.objects.remove(o,do_unlink=True)
else:
    collection=bpy.data.collections.new('3Dash_TV_Wand_v76');bpy.context.scene.collection.children.link(collection)

def material(name,color,roughness=.5):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness
    p.inputs['Emission Strength'].default_value=0
    return m
black=material('TV76_HuePlay_Schwarz',(.018,.02,.025),.58)
opal=material('TV76_LED_Opal',(.72,.75,.78),.48)
profile=material('TV76_Strip_Profil',(.09,.1,.12),.65)

def box(name,center,size,mat,bevel=0,rotation=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=center);o=bpy.context.object;o.name=name;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Abgerundete Kanten','BEVEL');mod.width=bevel;mod.segments=5
        bpy.ops.object.modifier_apply(modifier=mod.name)
    o.rotation_euler.x=rotation
    for c in list(o.users_collection):c.objects.unlink(o)
    collection.objects.link(o);o.data.materials.append(mat)
    return o

def light(o,key,label,kind,flux,reach,direction):
    addon.tag(o,'light',key,label)
    o['ha_room']='Wohnzimmer';o['ha_light_type']='rgbw';o['ha_light_kind']=kind;o['ha_light_lumens']=flux;o['ha_light_range']=reach;o['ha_light_angle']=170. if kind=='strip' else 140.;o['ha_light_direction']=direction

for side,x,z in [('Links',7.80,2.12),('Rechts',10.76,2.07)]:
    key=f'TV_HuePlay_Oben_{side}'
    # Nominal Play Bar body 253 x 44 x 36 mm, lying behind the cabinet decoration.
    box(key+'_Gehaeuse',(x,-3.442,z+.025),(.253,.044,.036),black,.017)
    box(key+'_Standfuss',(x,-3.442,z+.005),(.10,.04,.01),black,.004)
    diffuser=box(key+'_Diffusor',(x,-3.426,z+.040),(.231,.033,.005),opal,.002,-math.pi/4)
    light(diffuser,key,f'Hue Play oben {side.lower()}','panel',500.,5.,(0,.70710678,.70710678))

# Separate controller groups; each segment keeps the same stable fixture ID.
def strip(key,label,segments,flux):
    for i,(center,size) in enumerate(segments):
        o=box(f'{key}_Diffusor_{i+1}',center,size,opal,.001)
        light(o,key,label,'strip',flux,3.,(0,1,0))

def frame(x0,x1,z0,z1,y):
    w=.010;d=.004
    return [(((x0+x1)/2,y,z1),(x1-x0,d,w)),(((x0+x1)/2,y,z0),(x1-x0,d,w)),((x0,y,(z0+z1)/2),(w,d,z1-z0)),((x1,y,(z0+z1)/2),(w,d,z1-z0))]
strip('TV_Strip_Rueckseite','TV Lightstrip Rückseite',frame(8.597,10.103,.772,1.608,-3.405),1400.)
strip('TV_Strip_Box_Links','TV Lautsprecher Lightstrip links',frame(8.395,8.525,.69,1.67,-3.451),500.)
strip('TV_Strip_Box_Rechts','TV Lautsprecher Lightstrip rechts',frame(10.175,10.305,.69,1.67,-3.451),500.)
strip('TV_Strip_Lowboard','TV Lowboard Lightstrip obere Kante',[((9.35,-3.375,.492),(2.00,.006,.010))],1000.)
bpy.context.view_layer.update()
addon.discover(bpy.context.scene)
manifest=addon.build_manifest(bpy.context.scene)
added=[o for o in manifest['objects'] if any(o['id']==x.get('ha_id') for x in collection.objects)]
assert len(added)==6
assert len({o['id'] for o in added})==6
assert all(o['emitters'] and not o['entityId'] for o in added)
assert all(abs(e['direction']['z'])>.7 for o in added if 'Strip' in o['label'] or 'strip' in o['label'] for e in o['emitters'])
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Wohnung_v76_3Dash_TV.blend'))
report=addon.export_floorplan(str(ROOT/'Wohnung_v76_3Dash_TV.glb'))
Path('./.qa/tv-v76-added.json').write_text(json.dumps(added,ensure_ascii=False,indent=2),encoding='utf-8')
print('TV_V76_OK',json.dumps({'added':len(added),'total':report['entities'],'labels':[o['label'] for o in added]}))
