import {MeshBuilder,Mesh,StandardMaterial,ShaderMaterial,Color3,Vector3,VertexData,Curve3,Scene,type AbstractMesh} from '@babylonjs/core';
import {mapToModel,hostBuildingLayout,SITE_SCALE,type FrontFacade} from './SiteLayout';
import {createResidentialFacadeTexture} from './ResidentialFacade';
import {referenceBuildings,referencePaths,referenceRoundabouts,referenceTransform,triangulateFootprint} from './SiteReference';
import {createCourtyardDetails} from './CourtyardDetails';
import {createParkAtmosphereUpdater} from './ParkAtmosphere';
import {ExteriorMeshPool} from './ExteriorMeshPool';
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
 const walkway=(name:string,points:number[][],width:number,mat:StandardMaterial,modelSpace=false)=>{
  const line=Curve3.CreateCatmullRomSpline(points.map(([u,v])=>modelSpace?new Vector3(center.x+u,groundY+.008,center.z+v):world(u,v,groundY+.008)),12).getPoints();
  const left:Vector3[]=[],right:Vector3[]=[];
  line.forEach((p,i)=>{const tangent=line[Math.min(i+1,line.length-1)].subtract(line[Math.max(0,i-1)]).normalize();const normal=new Vector3(-tangent.z,0,tangent.x).scale(width/2);left.push(p.add(normal));right.push(p.subtract(normal));});
  const mesh=place(MeshBuilder.CreateRibbon(name,{pathArray:[left,right],sideOrientation:Mesh.DOUBLESIDE},scene),mat,0,0,0);if(modelSpace)mesh.parent=hostRoot;
 };
 const near=halfX+3;
 const pathX=host.entrance[0]-3.5*SITE_SCALE,entryZ=host.entrance[1];
 const grove:[number,number]=[host.entrance[0]-7*SITE_SCALE-13,entryZ+1];
 const fromReference=referenceTransform(host,grove);
 for(const route of referencePaths){
  const points=route.points.map(fromReference);
  if(route.name==='west-courtyard'||route.name==='north-courtyard')points[0]=[pathX,entryZ-5];
  if(route.name==='west-courtyard')points[1]=[pathX,entryZ+14];
  walkway('park-'+route.name,points,route.road?3.5:1.6*SITE_SCALE,route.road?road:path,true);
 }
 for(const [i,c] of referenceRoundabouts.entries()){
  const ring=Array.from({length:33},(_,n)=>fromReference([c[0]+31*Math.cos(n*Math.PI/16),c[1]+31*Math.sin(n*Math.PI/16)]));
  walkway('park-turning-circle-'+i,ring,3.5,road,true);
 }
 // Keep the short, confirmed entrance and bench-side segment in their current positions.
 walkway('park-home-entrance',[[pathX,entryZ],host.entrance],1.5*SITE_SCALE,path,true);
 walkway('park-bench-side-path',[[pathX,entryZ-5],[pathX,entryZ],[pathX,entryZ+14]],1.6*SITE_SCALE,path,true);
 const setbackHeight=2.0;
 const building=(name:string,points:[number,number][],height:number)=>{
  const poly=points.map(([x,z])=>new Vector3(center.x+x,groundY,center.z+z));
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
 const trees=[[17,-31],[24,-26],[21,34],[15,46],[37,51],[2,-46],[-23,-21],[62,-22],[60,12],[55,39],[-32,62],[26,-44]];
 trees.forEach(([u,v],i)=>{
  const h=2.2+(i%4)*.4,p=world(u,v);
  place(pool.create(`trunk:${h}`,'park-trunk',()=>MeshBuilder.CreateCylinder('park-trunk',{height:h,diameter:.24,tessellation:7},scene)),wood,p.x,groundY+h/2,p.z);
  for(let k=0;k<3;k++){
   const a=k*2.1+i,offset=k===0?0:.75;
   const crown=place(pool.create(`crown:${i%3}:${(i+k)%3}`,'park-tree',()=>MeshBuilder.CreateSphere('park-tree',{diameter:2.7+(i%3)*.3,segments:7},scene)),leaves[(i+k)%3],p.x+Math.cos(a)*offset,groundY+h+.5+(k===0?.7:0),p.z+Math.sin(a)*offset);crown.scaling.y=1.1;
  }
 });
 // Photo references: open plane-tree grove, ventilation benches and balcony play area.
 const courtyard=createCourtyardDetails(scene,hostRoot,center,groundY,
  {x:host.entrance[0]-7*SITE_SCALE-13,z:entryZ+1},pathX,material);
 scene.metadata={...scene.metadata,courtyard,siteReference:{north:fromReference([285,45]),south:fromReference([285,940])}};
 const sky=MeshBuilder.CreateSphere('park-sky',{diameter:600,segments:16,sideOrientation:Mesh.BACKSIDE},scene);
 sky.position.copyFrom(center);sky.scaling.setAll(SITE_SCALE);sky.isPickable=false;sky.infiniteDistance=true;sky.applyFog=false;
 const skyMat=new ShaderMaterial('park-sky-gradient',scene,{vertexSource:'precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying float height;void main(){height=position.y/300.;gl_Position=worldViewProjection*vec4(position,1.);}',fragmentSource:'precision highp float;varying float height;uniform vec3 zenith;uniform vec3 horizon;void main(){gl_FragColor=vec4(mix(horizon,zenith,smoothstep(-0.1,0.85,height)),1.);}'},{attributes:['position'],uniforms:['worldViewProjection','zenith','horizon']});
 skyMat.backFaceCulling=false;skyMat.disableDepthWrite=true;sky.material=skyMat;
 const observer=scene.onBeforeRenderObservable.add(createParkAtmosphereUpdater(scene,skyMat,materials,[grass,path,road]));
 return {dispose:()=>{scene.onBeforeRenderObservable.remove(observer);root.dispose();hostRoot.dispose();courtyard.dispose();sky.dispose();skyMat.dispose();facadeTexture.dispose();materials.forEach(m=>m.dispose());}};
}
