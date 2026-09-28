import type { Scene, AbstractMesh } from '@babylonjs/core';
import { createDisplayMesh, updateDisplayTexture, type DisplayMeshEntry } from './DisplayMeshFactory';
import { floorplanId } from './FloorplanBindings';
import { LIVING_ROOM_TV } from '../services/tvMedia';

/** Fit an overlay to the actual exported screen; leave the model/materials intact. */
export function createLivingRoomTVDisplay(scene:Scene, meshes:AbstractMesh[]):DisplayMeshEntry | undefined {
  const screen=meshes.find(m=>floorplanId(m)==='4784bb9f-40cd-5e6b-9165-63d8ffbe0dc1' && /Fernseher_Bildschirm/.test(m.name) && m.getTotalVertices()>0);
  if(!screen)return undefined;
  screen.computeWorldMatrix(true);
  const box=screen.getBoundingInfo().boundingBox;
  const width=box.maximumWorld.x-box.minimumWorld.x, height=box.maximumWorld.y-box.minimumWorld.y;
  const entry=createDisplayMesh(scene,{
    id:'living-room-tv-media',label:'Wohnzimmer TV',kind:'tv',tvMedia:LIVING_ROOM_TV,
    sources:[{entityId:LIVING_ROOM_TV.television}],
    position:{x:box.centerWorld.x,y:box.centerWorld.y,z:box.maximumWorld.z+.01},normal:{x:0,y:0,z:-1},
    width:width*.995,height:height*.995,opacity:1,
  });
  // Preserve world placement while following subsequent model scaling/transforms.
  entry.plane.setParent(screen);
  updateDisplayTexture(entry, {});
  return entry;
}
