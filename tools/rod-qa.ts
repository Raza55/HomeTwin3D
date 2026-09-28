import {ArcRotateCamera,Engine,HemisphericLight,Scene,Vector3} from '@babylonjs/core';
import {loadModel} from '../src/babylon/ModelLoader';
import {getModelBlob} from '../src/services/configApi';
const canvas=document.querySelector<HTMLCanvasElement>('#scene')!,engine=new Engine(canvas,true),scene=new Scene(engine);
const camera=new ArcRotateCamera('preview',-1.8,.65,2.7,new Vector3(-9.418,.2,5.4584),scene);camera.attachControl(canvas,true);
new HemisphericLight('sun',new Vector3(0,1,0),scene).intensity=1.3;
engine.runRenderLoop(()=>scene.render());window.addEventListener('resize',()=>engine.resize());
await loadModel(scene,(await getModelBlob())!,undefined,{showTextures:true});
scene.onPointerObservable.add(()=>{const p=scene.pick(scene.pointerX,scene.pointerY);if(p?.hit)document.getElementById('root')!.textContent=JSON.stringify({name:p.pickedMesh?.name,point:p.pickedPoint?.asArray()});});
