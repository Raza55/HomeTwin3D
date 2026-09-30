import type { TVScreenContent } from '../services/tvMedia';
import { mediaTime } from '../services/tvMedia';

function rounded(ctx: CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number) {
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);
}
function fitText(ctx:CanvasRenderingContext2D,value:string,width:number):string {
  if(ctx.measureText(value).width<=width)return value;
  let result=value;while(result.length && ctx.measureText(result+'…').width>width)result=result.slice(0,-1);
  return result+'…';
}
function titleLines(ctx:CanvasRenderingContext2D,title:string,width:number):string[] {
  const words=title.split(/\s+/), lines:string[]=[];let line='';
  for(let i=0;i<words.length;i++) {
    const next=[line,words[i]].filter(Boolean).join(' ');
    if(line && ctx.measureText(next).width>width) {
      lines.push(fitText(ctx,line,width));line=words[i];
      if(lines.length===2){lines.push(fitText(ctx,words.slice(i).join(' '),width));return lines;}
    } else line=next;
  }
  if(line)lines.push(fitText(ctx,line,width));return lines;
}

/** Original vector artwork: no external assets or screenshot claims for HDMI inputs. */
function drawInputArt(ctx:CanvasRenderingContext2D,kind:TVScreenContent['kind'],accent:string) {
  ctx.save();ctx.translate(705,260);ctx.strokeStyle=accent;ctx.lineWidth=5;
  ctx.shadowColor=accent;ctx.shadowBlur=28;
  if(kind==='pc') {
    ctx.fillStyle='#0a1728';rounded(ctx,-150,-112,300,188,16);ctx.fill();ctx.stroke();
    ctx.shadowBlur=0;
    const gradient=ctx.createLinearGradient(-130,-90,130,60);gradient.addColorStop(0,'#245ca6');gradient.addColorStop(1,'#6744a8');
    ctx.fillStyle=gradient;rounded(ctx,-133,-95,266,153,8);ctx.fill();
    ctx.strokeStyle='#b2d9ff';ctx.lineWidth=2;
    for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(-120,-60+i*28);ctx.bezierCurveTo(-10,20+i*20,45,-150+i*45,122,-30+i*25);ctx.stroke();}
    ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(0,80);ctx.lineTo(0,114);ctx.moveTo(-65,117);ctx.lineTo(65,117);ctx.stroke();
    ctx.fillStyle='#19324d';rounded(ctx,-153,147,306,24,7);ctx.fill();
    ctx.fillStyle='#6389ba';for(let i=0;i<12;i++)ctx.fillRect(-137+i*23,153,15,5);
  } else if(kind==='playstation') {
    ctx.fillStyle='#e5edfc';ctx.strokeStyle='#a3bfff';
    ctx.beginPath();ctx.moveTo(-115,-65);ctx.bezierCurveTo(-153,-56,-180,68,-150,100);ctx.bezierCurveTo(-122,127,-87,51,-64,40);ctx.lineTo(64,40);ctx.bezierCurveTo(87,51,122,127,150,100);ctx.bezierCurveTo(180,68,153,-56,115,-65);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.shadowBlur=0;ctx.fillStyle='#192943';rounded(ctx,-53,-57,106,65,12);ctx.fill();
    ctx.strokeStyle='#233651';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(-110,-34);ctx.lineTo(-110,8);ctx.moveTo(-131,-13);ctx.lineTo(-89,-13);ctx.stroke();
    for(const x of [-50,50]){ctx.beginPath();ctx.arc(x,38,21,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle='#56719d';ctx.lineWidth=3;
    for(const [x,y] of [[110,-35],[132,-13],[110,9],[88,-13]]){ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.stroke();}
  } else {
    ctx.fillStyle='#18332d';rounded(ctx,-122,-108,244,216,25);ctx.fill();ctx.stroke();
    ctx.fillStyle=accent;ctx.beginPath();ctx.moveTo(-25,-45);ctx.lineTo(53,0);ctx.lineTo(-25,45);ctx.closePath();ctx.fill();
  }
  ctx.restore();
}

export function drawTVMediaScreen(ctx:CanvasRenderingContext2D,content:TVScreenContent,artwork?:HTMLImageElement):void {
  const w=1024,h=576;
  ctx.save();ctx.clearRect(0,0,w,h);ctx.fillStyle='#030508';ctx.fillRect(0,0,w,h);
  if(content.kind==='off'){ctx.restore();return;}
  const accent=content.kind==='pc'?'#88caff':content.kind==='playstation'?'#a9baff':content.kind==='unavailable'?'#9da6b4':'#dcc38c';
  const bg=ctx.createLinearGradient(0,h,w,0);bg.addColorStop(0,'#080e18');bg.addColorStop(1,content.kind==='pc'?'#193658':content.kind==='playstation'?'#15224e':'#26312e');
  ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  if(artwork && (content.kind==='shield'||content.kind==='pc') && content.artworkKind==='screenshot') {
    const scale=Math.max(w/artwork.naturalWidth,h/artwork.naturalHeight);
    ctx.drawImage(artwork,(w-artwork.naturalWidth*scale)/2,(h-artwork.naturalHeight*scale)/2,artwork.naturalWidth*scale,artwork.naturalHeight*scale);
    const shade=ctx.createLinearGradient(0,0,w,0);
    shade.addColorStop(0,'#030508c9');shade.addColorStop(.6,'#03050855');shade.addColorStop(1,'#03050812');
    ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
    const footer=ctx.createLinearGradient(0,380,0,h);
    footer.addColorStop(0,'#03050800');footer.addColorStop(1,'#030508d9');
    ctx.fillStyle=footer;ctx.fillRect(0,380,w,h-380);
  } else if(artwork && content.kind==='shield') {
    const scale=Math.max(440/artwork.naturalWidth,576/artwork.naturalHeight);
    ctx.save();ctx.beginPath();ctx.rect(584,0,440,576);ctx.clip();
    ctx.drawImage(artwork,804-artwork.naturalWidth*scale/2,288-artwork.naturalHeight*scale/2,artwork.naturalWidth*scale,artwork.naturalHeight*scale);
    ctx.restore();
    const shade=ctx.createLinearGradient(500,0,w,0);shade.addColorStop(0,'#0b111b');shade.addColorStop(.4,'#0b111b88');shade.addColorStop(1,'#0b111b22');ctx.fillStyle=shade;ctx.fillRect(500,0,524,576);
  } else if(content.kind!=='unavailable') drawInputArt(ctx,content.kind,accent);
  ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillStyle=accent;ctx.font='600 18px system-ui';
  ctx.fillText(fitText(ctx,content.kind==='shield'?(content.position!==undefined?'SHIELD  /  NOW PLAYING':'SHIELD'):content.kind==='unavailable'?'WOHNZIMMER':'HDMI  /  '+content.title.toUpperCase(),500),52,50);
  ctx.fillStyle='#f5f7fc';ctx.font='650 48px system-ui';
  const lines=titleLines(ctx,content.title,510);
  lines.forEach((line,i)=>ctx.fillText(line,52,206+i*58));
  ctx.fillStyle=accent;ctx.font='400 22px system-ui';ctx.fillText(fitText(ctx,content.subtitle,500),52,Math.max(298,206+lines.length*58+12));
  ctx.fillStyle='#e1e7f2';ctx.font='500 19px system-ui';
  ctx.fillText((content.status==='Pausiert'?'Ⅱ  ':content.status==='Wiedergabe'?'▶  ':'')+content.status,52,439);
  if(content.duration!==undefined && content.position!==undefined) {
    const progress=Math.max(0,Math.min(1,content.position/content.duration));
    ctx.fillStyle='#ffffff29';rounded(ctx,52,484,920,5,2);ctx.fill();
    if(progress>0){ctx.fillStyle=accent;rounded(ctx,52,484,920*progress,5,2);ctx.fill();}
    ctx.font='400 17px system-ui';ctx.fillStyle='#c7d0de';ctx.fillText(mediaTime(content.position),52,520);
    ctx.textAlign='right';ctx.fillText(mediaTime(content.duration),972,520);
  } else {
    ctx.fillStyle='#96a5bc';ctx.font='400 16px system-ui';ctx.fillText(content.kind==='pc'||content.kind==='playstation'?'HDMI-Eingang aktiv':'',52,520);
  }
  if(content.kind!=='unavailable') {
    const source=content.kind==='shield'?'SHIELD':content.kind==='pc'?'PC':content.kind==='playstation'?'PLAYSTATION':content.title.toUpperCase();
    ctx.save();ctx.font='800 32px system-ui';
    const label=fitText(ctx,source,340), badgeWidth=Math.max(112,ctx.measureText(label).width+48);
    const x=w-32-badgeWidth;
    ctx.fillStyle='#060b14ed';ctx.strokeStyle=accent;ctx.lineWidth=2;
    rounded(ctx,x,24,badgeWidth,64,12);ctx.fill();ctx.stroke();
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ffffff';
    ctx.fillText(label,x+badgeWidth/2,56);
    ctx.restore();
  }
  ctx.restore();
}
