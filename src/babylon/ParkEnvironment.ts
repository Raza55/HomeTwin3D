import {MeshBuilder,Mesh,StandardMaterial,ShaderMaterial,ShaderLanguage,Color3,Vector3,VertexData,Curve3,Scene,type AbstractMesh} from '@babylonjs/core';
import {mapToModel,hostBuildingLayout,SITE_SCALE,type FrontFacade} from './SiteLayout';
import {createResidentialFacadeTexture} from './ResidentialFacade';
import {referenceBuildings,referencePaths,referenceTrees,referenceRoundabouts,referenceTransform,triangulateFootprint,REFERENCE_GROVE,REFERENCE_PLAYGROUND} from './SiteReference';
import {createCourtyardDetails} from './CourtyardDetails';
import {createParkAtmosphereUpdater} from './ParkAtmosphere';
import {ExteriorMeshPool} from './ExteriorMeshPool';
import {mergeStaticExterior} from './ExteriorMerge';
/** Decorative exterior only: no picking, no HA objects, no influence on model framing. */
export function createParkEnvironment(scene:Scene,center:Vector3,size:Vector3,windowFacadeX?:number,frontFacade?:FrontFacade){
 // Legacy imported geometry has stray bounds beyond the facade; anchor to the real cover line.
 if(windowFacadeX!==undefined){const rear=center.x+size.x/2;center=new Vector3((windowFacadeX+rear)/2,center.y,center.z);size=new Vector3(rear-windowFacadeX,size.y,size.z);}
 if(scene.activeCamera)scene.activeCamera.maxZ=Math.max(scene.activeCamera.maxZ,650);
 const root=MeshBuilder.CreateBox('park-root',{size:.01},scene);root.isVisible=false;root.isPickable=false;
 const hostRoot=MeshBuilder.CreateBox('house-99-root',{size:.01},scene);hostRoot.isVisible=false;hostRoot.isPickable=false;
 const materials:StandardMaterial[]=[];
 const material=(name:string,color:string)=>{const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor=Color3.Black();materials.push(m);return m;};
 const grass=material('park-grass','#60734e'),path=material('park-path','#b8ae97'),road=material('park-road','#687078'),wood=material('park-wood','#69513e');
 const facade=material('park-neighbor-facade','#c2c2b6'),roof=material('park-neighbor-roof','#626a6b');
 const residential=material('park-residential-facade','#ffffff');
 const facadeTexture=createResidentialFacadeTexture(scene);residential.diffuseTexture=facadeTexture;residential.backFaceCulling=false;
 const leaves=[material('park-leaves-1','#3f654c'),material('park-leaves-2','#5a7950'),material('park-leaves-3','#75834e')];
 const apartmentBaseY=center.y-size.y/2-.10;
 const storeyHeight=3.2,groundY=apartmentBaseY-storeyHeight,halfX=size.x/2+1,halfZ=size.z/2+1;
 scene.metadata={...scene.metadata,weatherBounds:{x:center.x,z:center.z,halfX,halfZ,groundY}};
 // Scale every exterior element about the apartment's facade corner, including distances.
 root.scaling.setAll(SITE_SCALE);
 root.position.set((center.x-size.x/2)*(1-SITE_SCALE),groundY*(1-SITE_SCALE),(center.z-size.z/2)*(1-SITE_SCALE));
 const pool=new ExteriorMeshPool();
 const pooledBox=(name:string,dimensions:{width:number;height:number;depth:number},mat:StandardMaterial)=>pool.create(`box:${mat.uniqueId}:${dimensions.width}:${dimensions.height}:${dimensions.depth}`,name,()=>MeshBuilder.CreateBox(name,dimensions,scene));
 const place=<T extends AbstractMesh>(mesh:T,mat:StandardMaterial,x:number,y:number,z:number)=>{mesh.material=mat;mesh.position.set(x,y,z);mesh.parent=root;mesh.isPickable=false;mesh.receiveShadows=false;return mesh;};
 // Reference-map east (u) faces the apartment's main window side (-X).
 // Distances and building heights are illustrative, not a cadastral reconstruction.
 const world=(u:number,v:number,y=groundY)=>{const [x,z]=mapToModel(u,v);return new Vector3(center.x+x,y,center.z+z);};
 place(MeshBuilder.CreateGround('park-base',{width:360,height:360},scene),grass,center.x,groundY-.02,center.z);
 const host=hostBuildingLayout(size.x,size.z,frontFacade?{slope:frontFacade.slope,intercept:frontFacade.intercept+frontFacade.slope*center.x-center.z}:undefined);
 // Roads sit slightly above footpaths so crossings never z-fight.
 const walkway=(name:string,points:number[][],width:number,mat:StandardMaterial,modelSpace=false,lift=.008)=>{
  const line=Curve3.CreateCatmullRomSpline(points.map(([u,v])=>modelSpace?new Vector3(center.x+u,groundY+lift,center.z+v):world(u,v,groundY+lift)),12).getPoints();
  const left:Vector3[]=[],right:Vector3[]=[];
  line.forEach((p,i)=>{const tangent=line[Math.min(i+1,line.length-1)].subtract(line[Math.max(0,i-1)]).normalize();const normal=new Vector3(-tangent.z,0,tangent.x).scale(width/2);left.push(p.add(normal));right.push(p.subtract(normal));});
  const mesh=place(MeshBuilder.CreateRibbon(name,{pathArray:[left,right],sideOrientation:Mesh.DOUBLESIDE},scene),mat,0,0,0);if(modelSpace)mesh.parent=hostRoot;
 };
 const near=halfX+3;
 const pathX=host.entrance[0]-3.5*SITE_SCALE,entryZ=host.entrance[1];
 // The map is fitted to the host footprint; grove and playground follow their mapped positions.
 const fromReference=referenceTransform(host);
 const grove=fromReference(REFERENCE_GROVE),playground=fromReference(REFERENCE_PLAYGROUND);
 const benchNorth:[number,number]=[pathX,entryZ-5],benchSouth:[number,number]=[pathX,entryZ+14];
 for(const route of referencePaths){
  const points=route.points.map(fromReference);
  // Run a few metres along the bench-side segment so the joint has no notch.
  if(route.bench==='end')points.push(benchNorth,[pathX,entryZ-2]);
  if(route.bench==='start')points.unshift([pathX,entryZ+11],benchSouth);
  walkway('park-'+route.name,points,route.road?route.width??3.5:(route.width??1.6)*SITE_SCALE,route.road?road:path,true,route.road?.014:.008);
 }
 for(const [i,{center:c,radius}] of referenceRoundabouts.entries()){
  const ring=Array.from({length:33},(_,n)=>fromReference([c[0]+radius*Math.cos(n*Math.PI/16),c[1]+radius*Math.sin(n*Math.PI/16)]));
  walkway('park-turning-circle-'+i,ring,3.5,road,true,.014);
 }
 // Keep the short, confirmed entrance and bench-side segment in their current positions.
 walkway('park-home-entrance',[[pathX,entryZ],host.entrance],1.5*SITE_SCALE,path,true);
 walkway('park-bench-side-path',[benchNorth,[pathX,entryZ],benchSouth],1.6*SITE_SCALE,path,true);
 const setbackHeight=2.0;
 // Outlines and roof heights (world space) for anything that must fly around them (wildlife).
 const buildings:{points:[number,number][];top:number}[]=[];
 const building=(name:string,points:[number,number][],height:number)=>{
  const poly=points.map(([x,z])=>new Vector3(center.x+x,groundY,center.z+z));
  buildings.push({points:poly.map(q=>[q.x,q.z] as [number,number]),top:groundY+height});
  const middle=poly.reduce((sum,p)=>sum.add(p),Vector3.Zero()).scale(1/poly.length);
  const shell=(outline:Vector3[],base:number,h:number,suffix:string)=>{
   const positions:number[]=[],indices:number[]=[],uvs:number[]=[];
   outline.forEach((a,i)=>{const b=outline[(i+1)%outline.length],offset=positions.length/3;
    for(const [p,y] of [[a,base],[b,base],[b,base+h],[a,base+h]] as [Vector3,number][])positions.push(p.x,groundY+y,p.z);
    const bays=Math.max(1,Math.round(Vector3.Distance(a,b)/2.7));
    const textureHeight=suffix==='-setback'?.25:h/(10.8*SITE_SCALE);
    uvs.push(0,0,bays/4,0,bays/4,textureHeight,0,textureHeight);indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
   });
   const mesh=new Mesh(name+suffix,scene),data=new VertexData();data.positions=positions;data.indices=indices;data.uvs=uvs;const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);data.normals=normals;data.applyToMesh(mesh);place(mesh,residential,0,0,0);mesh.parent=hostRoot;
   const cap=new Mesh(name+suffix+'-roof',scene),capData=new VertexData();
   capData.positions=outline.flatMap(q=>[q.x,groundY+base+h+.025,q.z]);capData.indices=triangulateFootprint(outline.map(q=>[q.x,q.z]));
   const capNormals:number[]=[];VertexData.ComputeNormals(capData.positions,capData.indices,capNormals);capData.normals=capNormals;capData.applyToMesh(cap);roof.backFaceCulling=false;place(cap,roof,0,0,0);cap.parent=hostRoot;
   // Thin off-white parapets frame the flat roofs and recessed top storey.
   outline.forEach((a,i)=>{const b=outline[(i+1)%outline.length],dx=b.x-a.x,dz=b.z-a.z;
    const lip=place(pooledBox(name+suffix+'-parapet',{width:Math.hypot(dx,dz),height:.18,depth:.16},facade),facade,(a.x+b.x)/2,groundY+base+h+.10,(a.z+b.z)/2);lip.parent=hostRoot;lip.rotation.y=-Math.atan2(dz,dx);
   });
  };
  const mainHeight=height-setbackHeight*SITE_SCALE;
  shell(poly,0,mainHeight,'-main');
  shell(poly.map(q=>Vector3.Lerp(middle,q,.66)),mainHeight,setbackHeight*SITE_SCALE,'-setback');
 };
 // Neighbor silhouettes follow the supplied map: 101/95 above, 93 east, 97/91 below.
 // Hauptgebäude contains the apartment. Fill only the remaining floor area, not a detached block.
 const hostFloor=material('house-99-cutaway','#929a9d');
 const slab=(name:string,points:number[][],base:number,height:number,mat:StandardMaterial)=>{
  const positions:number[]=[],indices:number[]=[],n=points.length;
  for(const h of [base,base+height])for(const [x,z] of points)positions.push(center.x+x,h,center.z+z);
  for(let i=1;i<n-1;i++)indices.push(n,n+i,n+i+1);
  for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(i,j,n+j,i,n+j,n+i);}
  const mesh=new Mesh(name,scene),data=new VertexData();data.positions=positions;data.indices=indices;const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);data.normals=normals;data.applyToMesh(mesh);mat.backFaceCulling=false;place(mesh,mat,0,0,0);mesh.parent=hostRoot;
 };
 slab('house-99-shared-foundation',host.footprint,groundY-.06,.05,roof);
 // Ground-floor exterior below the first-floor apartment. No ceiling across the apartment.
 host.footprint.forEach((a,i)=>{const b=host.footprint[(i+1)%host.footprint.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const mesh=new Mesh('house-99-ground-floor-'+i,scene),data=new VertexData();
  data.positions=[center.x+a[0],groundY,center.z+a[1],center.x+b[0],groundY,center.z+b[1],center.x+b[0],apartmentBaseY,center.z+b[1],center.x+a[0],apartmentBaseY,center.z+a[1]];
  data.indices=[0,1,2,0,2,3];data.uvs=[0,0,Math.max(1,Math.round(length/3.2))/4,0,Math.max(1,Math.round(length/3.2))/4,.25,0,.25];
  const normals:number[]=[];VertexData.ComputeNormals(data.positions,data.indices,normals);data.normals=normals;data.applyToMesh(mesh);mesh.material=residential;mesh.parent=hostRoot;mesh.isPickable=false;
 });
 // Continuous ceiling over the ground floor, below the imported apartment floor.
 // The apartment's trimmed outline must not leave a rectangular hole in this slab.
 slab('house-99-continuous-floor',host.footprint,apartmentBaseY,.28,hostFloor);
 // A low enclosing wall shows the single building footprint while keeping the apartment visible.
 host.footprint.forEach((a,i)=>{const b=host.footprint[(i+1)%host.footprint.length];
  if(i===0)return; // Existing window facade completes this side of the shared building.
  const dx=b[0]-a[0],dz=b[1]-a[1];
  const wall=place(pooledBox('house-99-perimeter',{width:Math.hypot(dx,dz),height:1.1,depth:.18},facade),facade,center.x+(a[0]+b[0])/2,apartmentBaseY+.55,center.z+(a[1]+b[1])/2);wall.parent=hostRoot;wall.rotation.y=-Math.atan2(dz,dx);
 });
 // Five complete texture rows: four full floors and one setback floor.
 const neighborHeight=4*2.7+setbackHeight;
 for(const block of referenceBuildings)building('context-house-'+block.id,block.points.map(fromReference),neighborHeight*SITE_SCALE);
 // Trees stand on the map's tree symbols; root is scaled, so convert model space into its local space.
 const parkTrees:{x:number;z:number;trunk:number;perches:Vector3[]}[]=[];
 referenceTrees.forEach((point,i)=>{
  const [x,z]=fromReference(point),h=2.2+(i%4)*.4;
  // Crown top for perching birds, in world space (root is scaled about its position).
  parkTrees.push({x:center.x+x,z:center.z+z,trunk:.12*SITE_SCALE,perches:[new Vector3(center.x+x,root.position.y+(groundY+h+1.2+(2.7+(i%3)*.3)*.5)*SITE_SCALE,center.z+z)]});
  const p=new Vector3((center.x+x-root.position.x)/SITE_SCALE,groundY,(center.z+z-root.position.z)/SITE_SCALE);
  place(pool.create(`trunk:${h}`,'park-trunk',()=>MeshBuilder.CreateCylinder('park-trunk',{height:h,diameter:.24,tessellation:7},scene)),wood,p.x,groundY+h/2,p.z);
  for(let k=0;k<3;k++){
   const a=k*2.1+i,offset=k===0?0:.75;
   const crown=place(pool.create(`crown:${i%3}:${(i+k)%3}`,'park-tree',()=>MeshBuilder.CreateSphere('park-tree',{diameter:2.7+(i%3)*.3,segments:7},scene)),leaves[(i+k)%3],p.x+Math.cos(a)*offset,groundY+h+.5+(k===0?.7:0),p.z+Math.sin(a)*offset);crown.scaling.y=1.1;
  }
 });
 // A third vent bench stands beside the south path where it curves away, 10.4 m (centre to
 // centre) beyond the second bench and on the same side of the path, turned with it.
 const extraVentBenches:{x:number;z:number;angle:number}[]=[];
 const southRoute=referencePaths.find(route=>route.bench==='start');
 if(southRoute){
  const line=Curve3.CreateCatmullRomSpline([[pathX,entryZ+11],benchSouth,...southRoute.points.map(fromReference)]
   .map(([x,z])=>new Vector3(x,0,z)),12).getPoints();
  // The spline starts at entryZ + 11; the second bench of the straight row is centred at entryZ + 9.6.
  let remaining=10.4-1.4;
  for(let i=1;i<line.length;i++){
   const step=Vector3.Distance(line[i-1],line[i]);
   if(step<remaining){remaining-=step;continue;}
   const tangent=line[i].subtract(line[i-1]).normalize(),at=Vector3.Lerp(line[i-1],line[i],remaining/step);
   const angle=Math.atan2(tangent.x,tangent.z);
   // Same 2.05 m offset to the path's left (−X while the path runs +Z) as the first two benches.
   extraVentBenches.push({x:at.x-2.05*Math.cos(angle),z:at.z+2.05*Math.sin(angle),angle});
   break;
  }
 }
 // Photo references: open plane-tree grove, ventilation benches and balcony play area.
 const courtyard=createCourtyardDetails(scene,hostRoot,center,groundY,
  {x:grove[0],z:grove[1]},pathX,material,{x:playground[0],z:playground[1]},entryZ+1,extraVentBenches);
 scene.metadata={...scene.metadata,courtyard,parkTrees,buildings:[...buildings,{points:host.footprint.map(([x,z])=>[center.x+x,center.z+z] as [number,number]),top:center.y+size.y/2}],siteReference:{north:fromReference([272,0]),south:fromReference([272,925]),fromReference,host:host.footprint,entrance:host.entrance,grove,pathX}};
 // Everything above is static: one draw per material instead of ~100 meshes and instances.
 const merge=mergeStaticExterior([root,hostRoot],hostRoot,m=>m.name.endsWith('-batch'));
 hostRoot.getChildMeshes(false).forEach(m=>{if(m.name.endsWith('-batch'))m.freezeWorldMatrix();});
 scene.metadata.exteriorMerge=merge;
 const sky=MeshBuilder.CreateSphere('park-sky',{diameter:600,segments:16,sideOrientation:Mesh.BACKSIDE},scene);
 sky.position.copyFrom(center);sky.scaling.setAll(SITE_SCALE);sky.isPickable=false;sky.infiniteDistance=true;sky.applyFog=false;
 // WebGPU needs WGSL; both variants compute the same gradient.
 const webgpu=scene.getEngine().isWebGPU;
 const skyMat=new ShaderMaterial('park-sky-gradient',scene,webgpu
  ?{vertexSource:'attribute position: vec3f;uniform worldViewProjection: mat4x4f;varying height: f32;@vertex fn main(input: VertexInputs)->FragmentInputs{vertexOutputs.height=input.position.y/300.0;vertexOutputs.position=uniforms.worldViewProjection*vec4f(input.position,1.0);}',fragmentSource:'varying height: f32;uniform zenith: vec3f;uniform horizon: vec3f;@fragment fn main(input: FragmentInputs)->FragmentOutputs{fragmentOutputs.color=vec4f(mix(uniforms.horizon,uniforms.zenith,smoothstep(-0.1,0.85,input.height)),1.0);}'}
  :{vertexSource:'precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying float height;void main(){height=position.y/300.;gl_Position=worldViewProjection*vec4(position,1.);}',fragmentSource:'precision highp float;varying float height;uniform vec3 zenith;uniform vec3 horizon;void main(){gl_FragColor=vec4(mix(horizon,zenith,smoothstep(-0.1,0.85,height)),1.);}'},
  {attributes:['position'],uniforms:['worldViewProjection','zenith','horizon'],shaderLanguage:webgpu?ShaderLanguage.WGSL:ShaderLanguage.GLSL});
 skyMat.backFaceCulling=false;skyMat.disableDepthWrite=true;sky.material=skyMat;
 const observer=scene.onBeforeRenderObservable.add(createParkAtmosphereUpdater(scene,skyMat,materials,[grass,path,road]));
 return {dispose:()=>{scene.onBeforeRenderObservable.remove(observer);root.dispose();hostRoot.dispose();courtyard.dispose();sky.dispose();skyMat.dispose();facadeTexture.dispose();materials.forEach(m=>m.dispose());}};
}
