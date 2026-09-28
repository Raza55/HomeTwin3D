/** Approximate map alignment from the user-marked park-facing facade (about 20° east of south). */
export const SITE_FACADE_ANGLE=20*Math.PI/180;
export const SITE_SCALE=1.35;
export function mapToModel(u:number,v:number):[number,number]{
 const c=Math.cos(SITE_FACADE_ANGLE),s=Math.sin(SITE_FACADE_ANGLE);
 return [-c*u+s*v,s*u+c*v];
}
export type SitePoint=[number,number];
export type FrontFacade={slope:number;intercept:number};
/** Outermost angled window wall, excluding recessed balcony/kitchen windows. */
export function findFrontFacade(covers:{position:{x:number;z:number};rotationY?:number}[],scale=1):FrontFacade|undefined{
 const candidates=covers.filter(o=>o.rotationY!==undefined&&o.rotationY>130&&o.rotationY<160).map(o=>{
  const slope=-Math.tan(o.rotationY!*Math.PI/180);
  return {slope,intercept:(o.position.z-slope*o.position.x+.12)*scale};
 });
 return candidates.sort((a,b)=>b.intercept-a.intercept)[0];
}
function clip(poly:SitePoint[],axis:0|1,bound:number,above:boolean):SitePoint[]{
 const out:SitePoint[]=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-bound)*(above?1:-1),db=(b[axis]-bound)*(above?1:-1);
  if(da>=0)out.push(a);
  if((da>=0)!==(db>=0)){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
 }
 return out;
}
/** One host-building footprint; its cutout reserves the existing apartment geometry. */
export function hostBuildingLayout(width:number,depth:number,front?:FrontFacade){
 const x=width/2,z=depth/2;
 // Trace the supplied building plan. Pink apartment: right-hand facade below
 // the entrance (reference y=480..627); the building continues north to y=227.
 // Fit the reference's lower sloping edge to the actual front facade. Model
 // bounds include protrusions and cannot determine the building's outer edge.
 const cornerZ=front?front.intercept-front.slope*x:z;
 const planDepth=front?width/170*front.slope*215/137:depth/147;
 const fromPlan=(px:number,py:number):SitePoint=>[-x+(680-px)*width/170,cornerZ+(py-627)*planDepth];
 const footprint:SitePoint[]=[[680,227],[680,627],[465,764],[253,428],[380,227]].map(([px,py])=>fromPlan(px,py));
 const entrance=fromPlan(680,455);
 const rear=clip(footprint,0,x,true);
 const middle=clip(clip(footprint,0,-x,true),0,x,false);
 const wings=[rear,clip(middle,1,z,true),clip(middle,1,-z,false)].filter(p=>p.length>=3&&Math.abs(p.reduce((area,a,i)=>{const b=p[(i+1)%p.length];return area+a[0]*b[1]-b[0]*a[1];},0))>1e-8);
 return {footprint,wings,entrance};
}
