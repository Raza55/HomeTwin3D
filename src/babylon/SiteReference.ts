import type {SitePoint} from './SiteLayout';
// Traced from the user supplied north-up plan (581 x 997 reference pixels).
// Footprints and paths share one transform; the furnished apartment stays fixed.
export const referenceBuildings:{id:number;points:SitePoint[]}[]=[
 {id:105,points:[[291,50],[404,70],[435,199],[386,213],[361,123],[282,103]]},
 {id:103,points:[[224,165],[301,168],[330,222],[271,303],[220,266]]},
 {id:101,points:[[214,378],[269,347],[319,433],[284,481],[211,479]]},
 {id:95,points:[[371,287],[416,260],[477,358],[416,468],[369,442],[415,358]]},
 {id:93,points:[[331,591],[383,585],[413,510],[477,535],[431,648],[338,659]]},
 {id:97,points:[[67,647],[142,649],[172,700],[115,782],[64,749]]},
 {id:91,points:[[267,684],[330,675],[345,748],[404,783],[375,867],[282,834]]},
 {id:89,points:[[91,820],[138,848],[207,809],[243,870],[137,929],[58,885]]},
];
export const referencePaths:{name:string;road?:boolean;points:SitePoint[]}[]=[
 {name:'west-access',road:true,points:[[35,919],[38,779],[43,646],[49,548],[48,477],[90,434],[158,439],[184,412],[198,329],[198,175],[209,143]]},
 {name:'north-east-access',road:true,points:[[247,86],[280,45],[411,60],[446,205],[472,337],[488,426],[488,446]]},
 {name:'east-access',road:true,points:[[493,501],[489,550],[469,624],[440,709],[426,781],[423,849]]},
 {name:'south-street',road:true,points:[[-25,939],[87,936],[238,898],[400,853],[582,795]]},
 {name:'west-courtyard',points:[[210,505],[213,549],[184,601],[177,641],[196,683],[192,733],[175,770]]},
 {name:'north-courtyard',points:[[210,505],[193,465],[199,414],[191,367],[204,334],[270,329],[309,322]]},
 {name:'around-101',points:[[309,322],[327,360],[340,396],[337,438],[343,466],[364,489],[387,506]]},
 {name:'south-courtyard',points:[[175,770],[220,782],[251,765],[267,704],[285,669],[320,639],[325,600],[326,572],[368,557],[387,506],[417,495],[445,483]]},
 {name:'north-garden',points:[[209,145],[280,156],[318,171],[338,208],[365,246],[399,235],[451,214]]},
 {name:'103-south-access',points:[[365,246],[330,283],[309,322]]},
 {name:'south-exit',points:[[251,765],[257,821],[269,883]]},
 {name:'89-west-access',points:[[175,770],[158,804],[138,848]]},
];
export const referenceRoundabouts:SitePoint[]=[[230,117],[473,475]];
/** Fit the existing Hauptgebäude facade and plane-tree clearing without moving either. */
export function referenceTransform(host:{footprint:SitePoint[]},grove:SitePoint){
 // A similarity transform preserves angles and footprint proportions (no stretching).
 // The entrance at Hauptgebäude and the existing grove are the two survey anchors.
 const anchor:SitePoint=[173,510],g:SitePoint=[285,521];
 const start:SitePoint=[host.footprint[0][0],host.footprint[0][1]+.57*(host.footprint[1][1]-host.footprint[0][1])];
 const dx=g[0]-anchor[0],dy=g[1]-anchor[1],mx=grove[0]-start[0],mz=grove[1]-start[1],d=dx*dx+dy*dy;
 // Reflected similarity: image east points toward model -X, image south toward +Z.
 const a=(mx*dx-mz*dy)/d,b=(mx*dy+mz*dx)/d;
 return ([x,y]:SitePoint):SitePoint=>{const u=x-anchor[0],v=y-anchor[1];return [start[0]+a*u+b*v,start[1]+b*u-a*v];};

}
/** Ear clipping also handles the L-shaped blocks, unlike a centre triangle fan. */
export function triangulateFootprint(points:SitePoint[]):number[]{
 const cross=(a:SitePoint,b:SitePoint,c:SitePoint)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const area=points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a[0]*b[1]-b[0]*a[1];},0);
 const remaining=points.map((_,i)=>i);if(area<0)remaining.reverse();const triangles:number[]=[];
 while(remaining.length>3){let found=false;
  for(let i=0;i<remaining.length;i++){const a=remaining[(i+remaining.length-1)%remaining.length],b=remaining[i],c=remaining[(i+1)%remaining.length];
   if(cross(points[a],points[b],points[c])<=1e-8)continue;
   if(remaining.some(j=>j!==a&&j!==b&&j!==c&&cross(points[a],points[b],points[j])>=-1e-8&&cross(points[b],points[c],points[j])>=-1e-8&&cross(points[c],points[a],points[j])>=-1e-8))continue;
   triangles.push(a,b,c);remaining.splice(i,1);found=true;break;
  }
  if(!found)throw new Error('Invalid courtyard footprint');
 }
 return [...triangles,...remaining];
}
