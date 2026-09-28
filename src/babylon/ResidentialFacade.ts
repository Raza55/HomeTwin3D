import { DynamicTexture, Texture, type Scene } from '@babylonjs/core';
/** Four bays/floors per tile, drawn from the courtyard photo proportions. */
export function createResidentialFacadeTexture(scene:Scene){
 const texture=new DynamicTexture('residential-plaster-windows',{width:1024,height:1024},scene,true);
 const c=texture.getContext();c.fillStyle='#e7e6df';c.fillRect(0,0,1024,1024);
 let seed=17;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<65000;i++){c.fillStyle=i%2?'#b9b8aa16':'#ffffff35';c.fillRect(rnd()*1024,rnd()*1024,1,1);}
 for(let row=0;row<4;row++)for(let col=0;col<4;col++){
  const loggia=(row===1&&col===0)||(row===3&&col===3);
  const tall=row===3&&!loggia;
  const w=loggia?158:col===2?137:120,h=loggia?166:tall?178:139;
  const x=col*256+(256-w)/2,y=row*256+49;
  c.fillStyle='#c5c5bd';c.fillRect(x-5,y-3,w+10,h+8);
  c.fillStyle='#303837';c.fillRect(x,y,w,h);
  if(loggia){
   c.fillStyle='#666b65';c.fillRect(x+8,y+6,w-16,h-12);
   c.fillStyle='#96988d';c.beginPath();c.moveTo(x+w-8,y+6);c.lineTo(x+w-26,y+23);c.lineTo(x+w-26,y+h-28);c.lineTo(x+w-8,y+h-6);c.fill();
   c.fillStyle='#333f40';c.fillRect(x+25,y+27,w-68,h-54);
   c.fillStyle='#b7b2a0';c.fillRect(x+8,y+h-23,w-16,17);
  }else{
   const glass=c.createLinearGradient(x,y,x+w,y+h);glass.addColorStop(0,'#71828a');glass.addColorStop(.48,'#53666b');glass.addColorStop(1,'#344548');
   c.fillStyle=glass;c.fillRect(x+6,y+6,w-12,h-12);
   // Soft indoor curtains and muted reflections; no exterior photographs baked in.
   if((col+row)%3===0){c.fillStyle='#bab9a777';c.fillRect(x+8,y+7,w*.24,h-14);c.fillRect(x+w*.73,y+7,w*.2,h-14);}
   c.fillStyle='#b8c9cd22';c.beginPath();c.moveTo(x+7,y+7);c.lineTo(x+w-8,y+7);c.lineTo(x+7,y+h*.6);c.fill();
   c.fillStyle='#333a39';c.fillRect(x+w*.5-2,y+3,4,h-6);
   const shutter=[0,.3,0,.85,.55,0,1,0][(row*3+col)%8];
   if(shutter){const sh=(h-10)*shutter;c.fillStyle='#7b7e75';c.fillRect(x+5,y+5,w-10,sh);c.fillStyle='#535950';for(let sl=0;sl<sh;sl+=5)c.fillRect(x+5,y+6+sl,w-10,1);}
  }
  if(loggia||tall){
   c.fillStyle='#353d3b';c.fillRect(x-1,y+h-51,w+2,3);c.fillRect(x-1,y+h-7,w+2,2);
   for(let bar=0;bar<12;bar++)c.fillRect(x+bar*(w/11),y+h-49,1.5,43);
  }
  c.fillStyle='#a6aaa4';c.fillRect(x-6,y+h,w+12,3);
  c.fillStyle='#f7f5ed';c.fillRect(x-6,y+h-2,w+12,2);
 }
 texture.update(false);texture.wrapU=Texture.WRAP_ADDRESSMODE;texture.wrapV=Texture.WRAP_ADDRESSMODE;texture.anisotropicFilteringLevel=8;return texture;
}
