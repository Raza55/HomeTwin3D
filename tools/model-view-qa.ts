import {Engine,Scene,ArcRotateCamera,Vector3,HemisphericLight,DirectionalLight,Plane} from '@babylonjs/core';
import {loadModel} from '../src/babylon/ModelLoader';
import {RoomDoors} from '../src/babylon/RoomDoors';
import {createDoorRigs,setDoorPose} from '../src/babylon/DoorAnimation';

// Before/after renders of model GLBs through the app's own loader, from a fixed camera.
// ?a=../.qa/old.glb&b=../.qa/new.glb&t=x,y,z&alphas=3.14,2.6&beta=1.3&r=1.7&clip=1.9&find=SZ_Skulptur&doors=open
// doors=open swings every room door (walk mode) and every HA door rig to its open pose before rendering.
// Coordinates are app/Babylon world: (x,y,z) = (-Blender X, Blender Z, -Blender Y).
// ArcRotate camera: position = target + r*(cos(alpha)*sin(beta), cos(beta), sin(alpha)*sin(beta)).
const out=document.querySelector('#result')!,W=900,H=560;
const p=new URLSearchParams(location.search);
const models=['a','b'].map(k=>p.get(k)).filter((u):u is string=>!!u);
const target=Vector3.FromArray((p.get('t')??'-9.3,0.3,5.6').split(',').map(Number));
const alphas=(p.get('alphas')??'3.14').split(',').map(Number),beta=+(p.get('beta')??1.2),radius=+(p.get('r')??3);
const clip=p.get('clip'),find=p.get('find'),openDoors=p.get('doors')==='open';

async function shoot(url:string){
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  canvas.style.cssText=`width:${W}px;height:${H}px;position:fixed;left:-9999px`;document.body.append(canvas);
  const engine=new Engine(canvas,true,{preserveDrawingBuffer:true,antialias:true}),scene=new Scene(engine);
  const cam=new ArcRotateCamera('c',0,beta,radius,Vector3.Zero(),scene);cam.minZ=.01;
  new HemisphericLight('h',Vector3.Up(),scene).intensity=.9;
  new DirectionalLight('s',new Vector3(-1,-2,1).normalize(),scene).intensity=.5;
  await loadModel(scene,await (await fetch(url)).blob(),undefined,{showTextures:true,edgeRendering:false});
  scene.render();scene.meshes.forEach(m=>m.computeWorldMatrix(true));
  // Optional clip height (floor + clip metres) removes ceilings for interior views.
  if(openDoors){
    const room=new RoomDoors(scene.meshes),seen=new Set<unknown>();
    for(const mesh of scene.meshes){if(!room.has(mesh))continue;let id:unknown;for(let n:any=mesh;n&&id===undefined;n=n.parent)id=n.metadata?.gltf?.extras?.ha_room_door?.id;if(seen.has(id))continue;seen.add(id);room.toggle(mesh);}
    for(let i=0;i<200;i++)room.update(.05);
    for(const rig of createDoorRigs(scene))setDoorPose(rig,'open');
  }
  if(clip)scene.clipPlane=new Plane(0,1,0,-+clip);
  await scene.whenReadyAsync();
  const found=find?scene.meshes.filter(m=>m.name.startsWith(find)).map(m=>{const b=m.getHierarchyBoundingVectors(true);return {name:m.name,min:b.min.asArray().map(v=>+v.toFixed(3)),max:b.max.asArray().map(v=>+v.toFixed(3))};}):undefined;
  const row=document.createElement('div');row.textContent=url;document.querySelector('#shots')!.append(row);
  for(const a of alphas){
    cam.setTarget(target.clone());cam.alpha=a;cam.beta=beta;cam.radius=radius;
    for(let i=0;i<8;i++){scene.render();await new Promise(r=>setTimeout(r,16));}
    const img=new Image();img.src=canvas.toDataURL();img.title=`${url} alpha=${a}`;img.style.cssText=`width:${W/2}px;margin:2px`;row.append(img);
  }
  const meshes=scene.meshes.length;engine.dispose();canvas.remove();
  return {url,meshes,found};
}
try{
  if(!models.length)throw Error('Parameter a (und optional b) mit GLB-URL angeben, z. B. ?a=../.qa/modell.glb');
  const result=[];for(const url of models)result.push(await shoot(url));
  out.textContent=JSON.stringify(result,null,1);(window as any).__result=result;
}catch(e){out.textContent='ERROR '+(e as Error).stack;(window as any).__result={error:String(e)};}
