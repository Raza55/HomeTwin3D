import { installationEntity } from './installationConfig.ts';
import type {HAState} from '../types';
import {LIVING_ROOM_TV} from './tvMedia.ts';
export const TV_DIAL_AUTOMATION=installationEntity('automation.tv_dial_hdmi1');
export const TV_DIAL_CHOICES=[
  {id:'shield',label:'SHIELD',source:'SHIELD Media'},
  {id:'pc',label:'PC · DesktopMain',source:'PC'},
  {id:'playstation',label:'PlayStation',source:'Playststion'},
  {id:'retropie',label:'RetroPie',source:'Media Player'},
] as const;
export type TVDialChoice=typeof TV_DIAL_CHOICES[number]['id']|'aus';
export function tvDialRequest(choice:TVDialChoice){
  if(choice!=='aus'&&!TV_DIAL_CHOICES.some(c=>c.id===choice))throw Error('Unbekannte TV-Auswahl');
  return {type:'fire_event',event_type:'hometwin_tv_dial',event_data:{source:choice}};
}
export function tvDialSelected(states:Record<string,HAState>,connected:boolean):TVDialChoice|undefined{
  if(!connected)return;
  const tv=states[LIVING_ROOM_TV.television],avr=states[LIVING_ROOM_TV.receiver];
  if([tv,avr].some(s=>!s||['unknown','unavailable'].includes(s.state)))return;
  if([tv,avr].some(s=>['off','standby'].includes(s!.state)))return 'aus';
  return TV_DIAL_CHOICES.find(c=>c.source===avr.attributes.source)?.id;
}
