import {Mesh,MeshBuilder,StandardMaterial,Vector3,DynamicTexture,VertexData,type Scene} from '@babylonjs/core';

/** On top of the leaf clusters that reach furthest out (and up) from the trunk. */
function outerPerches(leaves:{m:Mesh;r:number}[],x:number,z:number,count:number):Vector3[]{
 const reach=(l:{m:Mesh})=>Math.hypot(l.m.position.x-x,l.m.position.z-z)+l.m.position.y*.35;
 return [...leaves].sort((a,b)=>reach(b)-reach(a)).slice(0,count).map(({m,r})=>m.position.add(new Vector3(0,r*m.scaling.y*.92,0)));
}

/** Photo-based courtyard details in metres. Static parts are batched by material. */
export function createCourtyardDetails(scene:Scene,parent:Mesh,center:Vector3,groundY:number,
 treeCenter:{x:number;z:number},pathX:number,material:(name:string,color:string)=>StandardMaterial,
 playCenter:{x:number;z:number}={x:treeCenter.x-1,z:treeCenter.z+23},benchAnchorZ=treeCenter.z){
 const bark=material('courtyard-plane-bark','#9c9c80'),patch=material('courtyard-bark-cream','#d1cab0');
 const foliage=['#516a34','#698440','#7e9148','#415d31'].map((c,i)=>material('courtyard-leaf-'+i,c));
 const timber=material('courtyard-weathered-timber','#98917c'),concrete=material('courtyard-vent-concrete','#b9b5a4');
 const metal=material('courtyard-louvres','#717c7b'),dark=material('courtyard-recess','#303c3c');
 const sand=material('courtyard-sand','#c9bc94'),soil=material('courtyard-earth','#766b50');
 const dry=material('courtyard-dry-grass','#92916c');
 const batches=new Map<StandardMaterial,Mesh[]>();
 let seed=927;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const textures=[soil,sand,dry,timber].map((mat,index)=>{
  const texture=new DynamicTexture(mat.name+'-surface',128,scene,false),c=texture.getContext();
  c.fillStyle='#acacac';c.fillRect(0,0,128,128);
  for(let i=0;i<6500;i++){const v=75+Math.floor(random()*120);c.fillStyle=`rgb(${v},${v},${v})`;c.fillRect(random()*128,random()*128,index===3?8:1,index===3?.5:1);}
  texture.update(false);mat.diffuseTexture=texture;return texture;
 });
 const add=(mesh:Mesh,mat:StandardMaterial,p:Vector3)=>{mesh.position.copyFrom(p);mesh.material=mat;mesh.isPickable=false;
  const list=batches.get(mat)??[];list.push(mesh);batches.set(mat,list);return mesh;};
 const p=(x:number,y:number,z:number)=>new Vector3(center.x+x,groundY+y,center.z+z);
 const box=(name:string,at:Vector3,w:number,h:number,d:number,mat:StandardMaterial)=>add(MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene),mat,at);
 const branch=(name:string,a:Vector3,b:Vector3,r:number,mat=bark)=>add(MeshBuilder.CreateTube(name,{path:[a,b],radiusFunction:i=>r*(i===0?1:.55),tessellation:6,cap:Mesh.CAP_ALL},scene),mat,Vector3.Zero());
 const tuft=(at:Vector3,r:number,mat:StandardMaterial)=>{const m=add(MeshBuilder.CreateIcoSphere('leaf-cluster',{radius:r,subdivisions:1,flat:false},scene),mat,at);m.scaling.set(.75+random()*.5,.7+random()*.6,.75+random()*.5);return m;};
 const groundPatch=(name:string,x:number,z:number,rx:number,rz:number,mat:StandardMaterial,y=.015)=>{
  const positions=[0,0,0],uvs=[.5,.5],indices:number[]=[],count=40;
  for(let i=0;i<count;i++){const a=i/count*Math.PI*2,r=.91+random()*.09;positions.push(Math.cos(a)*rx*r,0,Math.sin(a)*rz*r);uvs.push(.5+Math.cos(a)*r*.5,.5+Math.sin(a)*r*.5);}
  for(let i=0;i<count;i++)indices.push(0,i+1,(i+1)%count+1);
  const data=new VertexData();data.positions=positions;data.indices=indices;data.uvs=uvs;const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);data.normals=normals;mat.backFaceCulling=false;
  const m=new Mesh(name,scene);data.applyToMesh(m);return add(m,mat,p(x,y,z));
 };
 const {x:tx,z:tz}=treeCenter,bz=benchAnchorZ;
 // Trunks and crown perches for the optional wildlife (world positions; hostRoot is unscaled).
 const trees:{x:number;z:number;trunk:number;perches:Vector3[]}[]=[];
 groundPatch('plane-grove-earth',tx,tz,11,11,soil);
 // Five separate trees around the clearing: open lower trunks and forked crowns.
 for(let i=0;i<5;i++){
  const angle=-Math.PI/2+i*Math.PI*2/5,x=tx+7*Math.cos(angle),z=tz+7*Math.sin(angle),h=[16,18,17,16.5,17.5][i];
  branch('plane-trunk',p(x,0,z),p(x+.2,h*.57,z-.15),.43);
  const leaves:{m:Mesh;r:number}[]=[];
  trees.push({x:center.x+x,z:center.z+z,trunk:.43,perches:[]});
  for(let j=0;j<17;j++){
   const a=j*2.4+i,at=p(x+Math.cos(a)*.33,.35+j*.43,z+Math.sin(a)*.33);
   const m=tuft(at,.15,patch);m.scaling.set(.7,2.1,.4);m.rotation.y=-a;
  }
  for(let j=0;j<9;j++){
   const a=j*2.399+i*.7,r=2.3+(j%3)*.8;
   const fork=p(x+Math.cos(a)*r*.55,h*(.47+(j%3)*.05),z+Math.sin(a)*r*.55);
   const end=p(x+Math.cos(a)*r,h*(.67+(j%3)*.065),z+Math.sin(a)*r);
   branch('plane-primary',p(x,h*(.30+(j%3)*.065),z),fork,.14);branch('plane-fork',fork,end,.12);
   for(let k=0;k<5;k++){
    const b=a+k*1.7,tip=end.add(new Vector3(Math.cos(b)*(1+random()),random()*2,Math.sin(b)*(1+random())));
    branch('plane-twig',end,tip,.045);
    for(let n=0;n<12;n++){const at=tip.add(new Vector3((random()-.5)*2.6,(random()-.5)*2.4,(random()-.5)*2.6)),r=.30+random()*.44;leaves.push({m:tuft(at,r,foliage[(i+j+k+n)%4]),r});}
   }
  }
  // Birds land on the outermost leaf clusters, where they stay visible (inside the crown they would vanish).
  trees[trees.length-1].perches=outerPerches(leaves,center.x+x,center.z+z,8);
 }
 // Scattered dry patches, rather than an even lawn below the mature trees.
 for(let i=0;i<240;i++){const a=random()*Math.PI*2,r=Math.sqrt(random())*10;groundPatch('grove-ground-cover',tx+Math.cos(a)*r,tz+Math.sin(a)*r,.06+random()*.2,.07+random()*.2,i%3?dry:foliage[0],.025);}
 // Broad seat decks on two concrete ventilation housings facing the window/path.
 // First plinth starts 2.15 m beyond the entrance centre, clear of the side path.
 const benchShift=6.5,benchX=pathX-2.05; // 1.08 m half-path + 0.78 m half-plinth + narrow verge.
 for(let i=0;i<2;i++){
  const z=bz+benchShift-3.1+i*5.2;
  box('vent-bench-plinth',p(benchX,.09,z),1.55,.18,4.5,concrete);
  box('vent-bench-body',p(benchX,.46,z),1.35,.65,4.2,concrete);
  for(const side of [-1,1]){
   box('vent-dark-opening',p(benchX+side*.683,.46,z),.025,.40,3.8,dark);
   for(let n=0;n<6;n++)box('vent-horizontal-louvre',p(benchX+side*.71,.29+n*.066,z),.045,.025,3.78,metal);
  }
  for(let n=0;n<11;n++)box('vent-bench-seat-slat',p(benchX,.825,z-1.95+n*.39),1.48,.09,.355,timber);
 }
 const bin=add(MeshBuilder.CreateCylinder('courtyard-bin',{height:.85,diameter:.38,tessellation:12},scene),dark,p(benchX-1.2,.7,bz+benchShift+5));
 box('bin-post',p(bin.position.x-center.x,.28,bin.position.z-center.z),.08,.56,.08,metal);
 // The balcony looks further along the courtyard, toward a small sand play area.
 const playX=playCenter.x,playZ=playCenter.z;
 groundPatch('playground-sand',playX,playZ,5.7,4.2,sand,.03);
 const posts=[[-3,-1,2.4],[-.6,-1.5,2.8],[1.8,-.5,2.3],[2.5,1.5,1.5],[-1,1.6,1.1]];
 for(const [x,z,h] of posts)branch('playground-timber-post',p(playX+x,0,playZ+z),p(playX+x,h,playZ+z),.12,timber);
 branch('playground-balance-log',p(playX-3,.4,playZ-1),p(playX-.6,.5,playZ-1.5),.14,timber);
 branch('playground-low-log',p(playX-.6,.5,playZ-1.5),p(playX+1.8,.4,playZ-.5),.12,timber);
 for(let i=0;i<5;i++){
  const z=playZ-1.4+i*.36;
  branch('playground-rope-net',p(playX-.5,.65,z),p(playX+1.7,1.2,z),.016,dark);
 }
 for(let i=0;i<6;i++)branch('playground-net-upright',p(playX-.5+i*.44,.65,playZ-1.4),p(playX-.5+i*.44,1.2,playZ+.04),.016,dark);
 groundPatch('ground-trampoline',playX-1,playZ+6,1.0,1.0,dark,.035);
 const ring=add(MeshBuilder.CreateTorus('trampoline-rim',{diameter:2.15,thickness:.16,tessellation:32},scene),concrete,p(playX-1,.07,playZ+6));ring.isPickable=false;
 // Balcony photo: a solid timber beam to the left of a conventional backed bench.
 // Both face the play area, beside its planted edge; these are separate from the vent seats.
 const beamX=playX+2.5,beamZ=playZ+4.5,seatX=playX+6,seatZ=playZ+9.5;
 box('playground-beam-seat',p(beamX,.47,beamZ),.48,.27,2.25,timber);
 for(const dz of [-.78,.78])box('playground-beam-support',p(beamX,.18,beamZ+dz),.35,.36,.24,dark);
 for(let i=0;i<4;i++)box('playground-bench-seat-slat',p(seatX-.21+i*.14,.47,seatZ),.12,.065,1.95,timber);
 for(const dz of [-.7,.7]){
  box('playground-bench-leg',p(seatX,.23,seatZ+dz),.44,.46,.055,metal);
  box('playground-bench-back-support',p(seatX-.27,.63,seatZ+dz),.055,.66,.055,metal);
 }
 for(let i=0;i<3;i++)box('playground-bench-back-slat',p(seatX-.28,.66+i*.12,seatZ),.065,.10,1.95,timber);
 // Loose multi-stem shrubs and young trees leave the play area and existing paths clear.
 const shrubs=[[-7,13],[-4,14],[3,14],[6,16],[-8,20],[7,22],[-6,29],[0,30],[5,30],[8,27],[-7,7],[8,-4.5]];
 // Offsets were laid out with the play area at (-1, 23) from the grove; the far ones follow the play area.
 const aroundPlay=(dx:number,dz:number)=>dz>10?[playX+1+dx,playZ-23+dz]:[tx+dx,tz+dz];
 for(const [i,[dx,dz]] of shrubs.entries()){
  const [x,z]=aroundPlay(dx,dz),h=1.5+(i%3)*.55;
  for(let k=0;k<5;k++){
   const a=k*2.4,top=p(x+Math.cos(a)*.7,h,z+Math.sin(a)*.7);
   branch('shrub-stem',p(x,.05,z),top,.028);
   for(let n=0;n<14;n++)tuft(top.add(new Vector3((random()-.5)*1.5,(random()-.4)*1.6,(random()-.5)*1.5)),.15+random()*.22,foliage[(i+k+n)%4]);
  }
 }
 // Larger multi-stem shrub at the beginning of the shifted ventilation seats.
 const entryShrubX=benchX-.25,entryShrubZ=bz+benchShift-7.5;
 for(let k=0;k<7;k++){
  const a=k*2.4,top=p(entryShrubX+Math.cos(a)*.9,2.55,entryShrubZ+Math.sin(a)*.9);
  branch('bench-entry-shrub-stem',p(entryShrubX,.05,entryShrubZ),top,.038);
  for(let n=0;n<19;n++)tuft(top.add(new Vector3((random()-.5)*1.8,(random()-.4)*2,(random()-.5)*1.8)),.20+random()*.24,foliage[(k+n)%4]);
 }
 for(const [dx,dz] of [[2,12],[-5,25],[6,34]]){
  const [x,z]=aroundPlay(dx,dz);branch('young-tree-trunk',p(x,0,z),p(x,4.7,z),.09);
  trees.push({x:center.x+x,z:center.z+z,trunk:.09,perches:[]});
  groundPatch('young-tree-mulch',x,z,.9,.9,soil,.035);
  const leaves:{m:Mesh;r:number}[]=[];
  for(let i=0;i<22;i++){const a=i*2.4,y=2.6+random()*2.8,r=(5.9-y)*.38;const tip=p(x+Math.cos(a)*r,y,z+Math.sin(a)*r);branch('young-tree-branch',p(x,y-.7,z),tip,.025);leaves.push({m:tuft(tip,.5,foliage[i%4]),r:.5});}
  trees[trees.length-1].perches=outerPerches(leaves,center.x+x,center.z+z,3);
 }
 // Footprints the courtyard cat walks around (world space, centre and half extents).
 const box2=(x:number,z:number,halfX:number,halfZ:number)=>({x:center.x+x,z:center.z+z,halfX,halfZ});
 // Geometry is static: reduce thousands of individual details to one draw per material.
 for(const [mat,parts] of batches){const merged=Mesh.MergeMeshes(parts,true,true,undefined,false,false);if(merged){merged.name=mat.name+'-batch';merged.material=mat;merged.parent=parent;merged.isPickable=false;merged.receiveShadows=true;}}
 return {treeCenter:p(tx,0,tz),playCenter:p(playX,0,playZ),benchCenter:p(benchX,0,bz+benchShift),playBenchCenter:p((beamX+seatX)/2,0,(beamZ+seatZ)/2),planeTreeCount:5,ventBenchCount:2,trees,
  // Solid vent benches (centre, half extents) and seats an animal could jump onto (top heights).
  obstacles:[
   // Both vent benches as one block: the 0.7 m gap between them is no path.
   box2(benchX,bz+benchShift-.5,.78,4.85),
   box2(beamX,beamZ,.3,1.15),box2(seatX-.1,seatZ,.35,1.0),box2(benchX-1.2,bz+benchShift+5,.22,.22),
   ...posts.map(([x,z])=>box2(playX+x,playZ+z,.16,.16)),box2(playX+.6,playZ-.7,1.15,.75), // posts, rope net
   ...shrubs.map(([dx,dz])=>{const [x,z]=aroundPlay(dx,dz);return box2(x,z,.75,.75);}),box2(entryShrubX,entryShrubZ,.95,.95),
   ...[[2,12],[-5,25],[6,34]].map(([dx,dz])=>{const [x,z]=aroundPlay(dx,dz);return box2(x,z,.2,.2);}),
  ],
  // The two broad vent-bench decks in front of the flat (seat top, centre, half extents of the slats).
  decks:[0,1].map(i=>({x:center.x+benchX,z:center.z+bz+benchShift-3.1+i*5.2,y:groundY+.87,halfX:.68,halfZ:2.05})),
  seats:[...[0,1].map(i=>p(benchX,.87,bz+benchShift-3.1+i*5.2)),p(beamX,.61,beamZ),p(seatX+.03,.5,seatZ),p(playX-1,1.1,playZ+1.6)],dispose:()=>textures.forEach(t=>t.dispose())};
}
