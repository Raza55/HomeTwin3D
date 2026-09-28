import type { AppConfig, HAState } from '../types';
import type {MatchEntity} from './floorplanMatching';
export type CoverAction='open_cover'|'close_cover'|'stop_cover'|'set_cover_position';
export function coverSupports(state:HAState|undefined|null,action:CoverAction){
 if(!state||['unknown','unavailable'].includes(state.state))return false;
 const bit={open_cover:1,close_cover:2,set_cover_position:4,stop_cover:8}[action];
 const features=state.attributes.supported_features;
 return typeof features==='number' && (features&bit)!==0;
}
export function coverRoom(config:AppConfig,entityId:string,inventory:MatchEntity[]=[]){
 const objects=config.model?.floorplan?.objects??[];
 const current=objects.find(o=>o.domain==='cover'&&o.entityId===entityId);
 const room=current?.room?.trim();
 const registered=inventory.find(e=>e.entity_id===entityId);
 const area=registered?.areaId||current?.haAreaId;
 if(area){
  const mapped=new Set([...(config.blinds??[]).map(b=>b.entityId),...objects.filter(o=>o.domain==='cover').map(o=>o.entityId)]);
  const ids=[...mapped].filter(id=>id&&(inventory.find(e=>e.entity_id===id)?.areaId||objects.find(o=>o.domain==='cover'&&o.entityId===id)?.haAreaId)===area);
  return {name:registered?.areaName||room||'Raum',ids:ids.length?ids:[entityId]};
 }
 const ids=objects.filter(o=>o.domain==='cover'&&o.entityId && (current?.haAreaId&&o.haAreaId ? current.haAreaId===o.haAreaId : !!room&&o.room?.trim()===room)).map(o=>o.entityId);
 return {name:room||'Raum',ids:[...new Set(ids.length?ids:[entityId])]};
}
