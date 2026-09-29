import type {SitePoint} from './SiteLayout';
// Traced from the user supplied north-up OpenStreetMap excerpt (703 x 925 reference pixels).
// Footprints and paths share one transform; the furnished apartment stays fixed.
export const referenceBuildings:{id:number;points:SitePoint[]}[]=[
 {id:105,points:[[270,18],[395,28],[422,158],[372,168],[342,76],[268,55]]},
 {id:103,points:[[212,120],[290,125],[317,177],[260,260],[207,222]]},
 {id:101,points:[[197,345],[257,300],[305,372],[278,436],[200,437]]},
 {id:95,points:[[360,242],[402,215],[462,310],[400,422],[355,395],[400,312]]},
 {id:93,points:[[318,543],[365,537],[398,465],[462,487],[420,600],[320,613]]},
 {id:97,points:[[52,600],[130,602],[159,655],[102,737],[50,707]]},
 {id:91,points:[[257,660],[327,655],[340,728],[392,748],[372,832],[272,808]]},
 {id:89,points:[[77,780],[120,802],[195,765],[230,822],[125,885],[45,837]]},
];
/**
 * Roads are the dotted access lanes and the public street; everything else is a footpath.
 * The map has no lane around 105 or along the east side of 95: only footpaths run there.
 * `bench: 'end'|'start'` joins the route to the confirmed bench-side path at the entrance.
 */
export const referencePaths:{name:string;road?:boolean;width?:number;bench?:'start'|'end';points:SitePoint[]}[]=[
 {name:'west-access',road:true,points:[[15,965],[18,880],[22,800],[25,700],[28,600],[32,510],[38,450],[58,410],[90,390],[135,385],[162,380],[178,358],[185,310],[186,250],[184,180],[187,125],[200,93]]},
 {name:'east-access',road:true,points:[[405,858],[402,800],[402,755],[406,712],[432,680],[447,640],[457,580],[465,530],[470,490],[471,462]]},
 {name:'south-street',road:true,width:6.5,points:[[-40,980],[100,942],[200,915],[300,888],[400,860],[500,832],[600,805],[740,768]]},
 // Central footpath east of the host building, split around the confirmed bench-side segment.
 {name:'courtyard-north',bench:'end',points:[[168,380],[171,405],[170,424]]},
 {name:'courtyard-south',bench:'start',points:[[193,524],[179,550],[169,575],[168,600],[180,635],[180,665],[166,700],[162,718],[182,737]]},
 {name:'101-west-access',points:[[168,380],[200,375]]},
 {name:'south-courtyard-link',points:[[182,737],[238,737]]},
 {name:'south-exit',points:[[238,737],[241,780],[248,830],[256,868],[259,892]]},
 {name:'97-access',points:[[182,737],[133,693]]},
 {name:'89-access',points:[[182,737],[150,755],[128,780],[121,800]]},
 {name:'99-west-link',points:[[97,518],[80,548],[52,567],[32,574]]},
 {name:'97-lane-stub',points:[[26,655],[52,658]]},
 {name:'103-lane-stub',points:[[186,175],[210,175]]},
 {name:'north-garden',points:[[243,92],[272,108],[300,118],[320,135],[336,165],[356,199]]},
 {name:'105-north',points:[[263,8],[256,40],[244,50]]},
 {name:'105-east',points:[[395,12],[399,60],[417,125],[435,177],[474,165]]},
 {name:'95-north',points:[[435,177],[392,182],[356,199]]},
 {name:'95-east',points:[[356,199],[400,201],[435,250],[471,318],[470,360],[462,407]]},
 {name:'103-south',points:[[356,199],[318,237],[296,275]]},
 {name:'103-door',points:[[290,216],[318,237]]},
 {name:'103-west',points:[[296,275],[260,276],[188,288]]},
 {name:'around-101',points:[[296,275],[302,300],[316,330],[326,370],[326,425],[345,447],[368,457]]},
 {name:'101-door',points:[[316,330],[286,346]]},
 {name:'turning-circle-link',points:[[368,457],[400,448],[433,441]]},
 {name:'93-west',points:[[368,457],[364,505],[330,515],[300,535],[262,612],[243,660],[238,737]]},
 {name:'93-south',points:[[372,612],[380,680],[402,702]]},
 {name:'91-street',points:[[318,800],[262,858]]},
 // Wider park paths east of the lane.
 {name:'woods-north',width:2.2,points:[[442,-10],[458,80],[475,160],[490,225],[505,310],[525,410],[545,487]]},
 {name:'woods-north-east',width:2.2,points:[[490,225],[560,185],[600,155],[622,90],[645,-10]]},
 {name:'park-west',width:2.2,points:[[545,487],[520,545],[495,630],[465,680],[455,760],[447,830]]},
 {name:'park-east',width:2.2,points:[[545,487],[590,560],[605,600],[612,650],[640,720],[665,790]]},
 {name:'park-diagonal',width:2.2,points:[[465,680],[560,720],[665,778]]},
];
export const referenceRoundabouts:{center:SitePoint;radius:number}[]=[{center:[221,70],radius:29},{center:[458,434],radius:27}];
/** Individual tree symbols of the map; the plane-tree cluster is built by CourtyardDetails. */
export const referenceTrees:SitePoint[]=[[220,60],[208,70],[228,72],[366,299],[348,317],[339,384],[374,434],[338,460],[336,494],
 [128,580],[305,604],[248,612],[210,626],[202,664],[224,709],[497,310],[616,295],[533,550],[516,590],[512,624],[341,854],[304,921]];
/** Building 99 in the map, listed in the vertex order of `hostBuildingLayout().footprint`. */
export const REFERENCE_HOST:SitePoint[]=[[137,410],[177,502],[142,557],[57,500],[65,442]];
/** Plane-tree cluster and sand playground east of the host building (map pixels). */
export const REFERENCE_GROVE:SitePoint=[257,478],REFERENCE_PLAYGROUND:SitePoint=[265,565];
/**
 * Fit the map to the host footprint, which is derived from the real apartment and stays fixed.
 * Least-squares reflected similarity (no stretching): image east points toward model -X,
 * image south toward +Z. The traced building 99 matches the footprint to about 0.4 m.
 */
export function referenceTransform(host:{footprint:SitePoint[]}){
 const src=REFERENCE_HOST,dst=host.footprint,n=src.length;
 if(dst.length!==n)throw new Error('Host footprint does not match the reference building');
 // Model = A·conj(p) + B with complex A = a + ib, solved on centred coordinates.
 const sc=src.reduce((s,p)=>[s[0]+p[0]/n,s[1]+p[1]/n],[0,0]),dc=dst.reduce((s,p)=>[s[0]+p[0]/n,s[1]+p[1]/n],[0,0]);
 let a=0,b=0,d=0;
 for(let i=0;i<n;i++){const u=src[i][0]-sc[0],v=src[i][1]-sc[1],x=dst[i][0]-dc[0],z=dst[i][1]-dc[1];a+=x*u-z*v;b+=x*v+z*u;d+=u*u+v*v;}
 a/=d;b/=d;
 return ([x,y]:SitePoint):SitePoint=>{const u=x-sc[0],v=y-sc[1];return [dc[0]+a*u+b*v,dc[1]+b*u-a*v];};
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
