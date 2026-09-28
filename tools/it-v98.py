"""IT metadata, using the confirmed PCs & NAS dashboard switches."""
import bpy, json, importlib.util
from pathlib import Path
root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('floorplan', root / 'tools/blender_3dash.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
def metric(key, label, entity, **kwargs):
    return dict(key=key, label=label, entityId=entity, **kwargs)
def action(key, label, entity, kind='button'):
    return dict(id=key,label=label,entityId=entity,kind=kind)
def device(key,label,kind,status,metrics,actions,**kwargs):
    return dict(id=key,label=label,kind=kind,statusEntityId=status,statusMode='power',metrics=metrics,actions=actions,**kwargs)
desktop_main=device('desktop_main','DesktopMain','pc','switch.desktop_main_power',[
    metric('cpu','CPU','sensor.desktop_main_satellite_cpulast'),metric('gpu','GPU','sensor.desktop_main_satellite_gpulast'),
    metric('ram','RAM','sensor.desktop_main_satellite_speichernutzung'),metric('temperature','GPU-Temperatur','sensor.desktop_main_satellite_gputemperatur',positiveOnly=True),
    metric('uptime','Laufzeit','sensor.desktop_main_satellite_letzterboot',format='uptime')],[
    action('power','Hauptschalter','switch.desktop_main_power','toggle'),action('sleep','Schlafen','button.desktop_main_schlafen'),action('shutdown','Herunterfahren','button.desktop_main_herunterfahren')],
    screenMaterials=['SZ_monitor'],rgbMaterials=['SZ_PC67_LED_Gruen'])
child=json.loads(json.dumps(desktop_main));child.update(id='child-pc',label='PC Kinderzimmer',statusEntityId='',screenMaterials=['KZ_Monitor_Dunkelglas'],rgbMaterials=[])
for entry in child['metrics']+child['actions']: entry['entityId']=''
nas=device('qnap','QNAP · StorageServer','nas','switch.storage_server',[
    metric('status','Systemstatus','sensor.storage_server_status'),metric('cpu','CPU','sensor.storage_server_cpu_usage'),metric('ram','RAM','sensor.storage_server_memory_usage'),
    metric('temp','Temperatur','sensor.storage_server_system_temperature',positiveOnly=True),metric('disk','DataVol1 belegt','sensor.storage_server_volume_used_datavol1')],[action('power','Hauptschalter','switch.storage_server','toggle')])
desktop_secondary=device('desktop_secondary','DesktopSecondary','pc','switch.desktop_secondary_power',[
    metric('cpu','CPU','sensor.desktop_secondary_cpulast'),metric('gpu','GPU','sensor.desktop_secondary_gpulast'),metric('ram','RAM','sensor.desktop_secondary_speichernutzung'),
    metric('temp','GPU-Temperatur','sensor.desktop_secondary_gputemperatur',positiveOnly=True),metric('uptime','Laufzeit','sensor.desktop_secondary_letzterboot',format='uptime')],[
    action('power','Hauptschalter','switch.desktop_secondary_power','toggle'),action('sleep','Schlafen','button.desktop_secondary_schlafen'),action('restart','Neu starten','button.desktop_secondary_neustarten')])
host=device('hassio','Home Assistant · Raspberry Pi','host','device_tracker.homeassistant',[
    metric('cpu','CPU','sensor.processor_use'),metric('ram','RAM','sensor.memory_use_percent'),metric('temp','CPU-Temperatur','sensor.processor_temperature',positiveOnly=True),
    metric('disk','Speicher belegt','sensor.disk_use_percent_config'),metric('uptime','Laufzeit','sensor.last_boot',format='uptime')],[])
host['statusMode']='connection'
router=device('fritzbox','Netzwerkrouter','router','binary_sensor.network_router_verbindung',[
    metric('download','Download','sensor.network_router_download_durchsatz'),metric('upload','Upload','sensor.network_router_upload_durchsatz'),
    metric('uptime','Laufzeit','sensor.network_router_betriebszeit',format='uptime')],[
    action('guest','Gast-WLAN','switch.network_router_wi_fi_guest','toggle'),action('restart','Router neu starten','button.network_router_neu_starten')])
router['statusMode']='connection'
specs=[('SZ_IT_DesktopMain','DesktopMain PC','Schlafzimmer',(10.1,-3.007,1.45),dict(kind='pc',devices=[desktop_main])),
       ('KZ_IT_PC','PC Kinderzimmer','Kinderzimmer',(3.646,-9.314,1.32),dict(kind='pc',devices=[child])),
       ('AK_IT_Server','Server & Netzwerk','Abstellraum',(4.38,-1.4,2.25),dict(kind='rack',devices=[nas,desktop_secondary,host,router]))]
for name,label,room,position,config in specs:
    obj=bpy.data.objects.get(name)
    if obj is None:
        obj=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(obj)
    obj.location=position;obj.empty_display_size=.12
    module.tag(obj,'sensor',name,label);obj['ha_room']=room;obj['ha_it']=json.dumps(config)
    obj['ha_entity_id']=''
for obj in bpy.context.scene.objects:
    if obj.get('ha_id')=='cfeb684f-ab77-51ef-8677-8fb7af317deb':
        for key in list(obj.keys()):
            if key.startswith('ha_'):del obj[key]
        obj['ha_visual_only']=True
bpy.context.view_layer.update()
manifest=module.build_manifest(bpy.context.scene)
objects=[o for o in manifest['objects'] if o.get('it')]
assert len(objects)==3
(root/'.qa/it-v98-tags.json').write_text(json.dumps(dict(objects=objects),ensure_ascii=False),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(root.parent/'blender/Wohnung_v98_3Dash_IT.blend'))
