import { getConfig } from '../src/services/configApi';
const config=getConfig();
document.querySelector('#report')!.textContent=JSON.stringify(config.lights.filter(l=>l.position.x < -7.4 && l.position.x > -11.3 && l.position.z>3 && l.position.z<4.3).map(l=>({entityId:l.entityId,label:l.label,position:l.position,shape:l.shape,size:l.size,floorplanIds:l.floorplanIds})),null,2);
