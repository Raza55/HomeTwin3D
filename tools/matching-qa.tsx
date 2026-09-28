import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import FloorplanEntities from '../src/components/FloorplanEntities';
import { SimulationModeProvider, useSimulationMode } from '../src/contexts/SimulationModeContext';
import { getConfig, setSimulationConfigOverride } from '../src/services/configApi';
import { setActiveHAConnection } from '../src/services/haWebSocket';
import { getEntityCache, setEntityCache } from '../src/services/entityCache';
import '../src/App.css';
import '../src/components/SettingsModal.css';
const cache = getEntityCache();
window.addEventListener('pagehide', () => setEntityCache(cache));
function Test() {
  const { setSimulationMode } = useSimulationMode();
  const [ready, setReady] = useState(false), [report,setReport] = useState('Noch nicht gespeichert');
  useEffect(() => {
    setSimulationMode(true);
    setSimulationConfigOverride({ location:{latitude:0,longitude:0},lights:[],model:{floorplan:{version:1,source:'Testdaten – keine Gerätesteuerung',coordinateSystem:'babylon-lh-meters',objects:[
      { id:'spot',label:'Küchenspot 2',room:'Küche',domain:'light',entityId:'',position:{x:-3,y:2,z:4},size:{width:.1,height:.1,depth:.1},rotationY:0 },
      { id:'cover',label:'Wohnzimmer Rollo',room:'Wohnzimmer',domain:'cover',entityId:'',position:{x:-4,y:1,z:4},size:{width:1,height:2,depth:.03},rotationY:0 },
    ]}}});
    setActiveHAConnection({ isConnected:true, dispose(){}, forceReconnect(){}, async callService(){throw new Error('Gerätesteuerung im Test verboten');}, async request(msg){
      if(msg.type==='get_states') return [
        {entity_id:'light.kuchenspot_1',state:'on',attributes:{friendly_name:'Küchenspot 2',supported_color_modes:['xy','color_temp']}},
        {entity_id:'light.kuchenspot_2',state:'off',attributes:{friendly_name:'Küchenspot 3'}},
        {entity_id:'cover.links',state:'open',attributes:{friendly_name:'Wohnzimmer Rollo links'}},
        {entity_id:'cover.rechts',state:'open',attributes:{friendly_name:'Wohnzimmer Rollo rechts'}},
      ];
      if(msg.type==='config/area_registry/list') return [{area_id:'k',name:'Küche'},{area_id:'w',name:'Wohnzimmer'}];
      if(msg.type==='config/device_registry/list') return [{id:'device',area_id:'k'}];
      if(msg.type==='config/entity_registry/list') return [{entity_id:'light.kuchenspot_1',device_id:'device'},{entity_id:'light.kuchenspot_2',area_id:'k'},{entity_id:'cover.links',area_id:'w'},{entity_id:'cover.rechts',area_id:'w'}];
      throw new Error('Unerwartete Anfrage');
    }});
    setReady(true);
  },[setSimulationMode]);
  return <main style={{maxWidth:850,margin:'20px auto',padding:20}}><h1>Auto-Match · isolierte Funktionsprüfung</h1><p>Simulierte HA-Antworten. Änderungen bleiben im Arbeitsspeicher.</p>{ready && <FloorplanEntities onApply={() => setReport(`Gespeichert: ${getConfig().lights.length} Licht, ${getConfig().blinds?.length ?? 0} Rollo`)} />}<p role="status">{report}</p></main>;
}
createRoot(document.getElementById('root')!).render(<SimulationModeProvider><Test /></SimulationModeProvider>);
