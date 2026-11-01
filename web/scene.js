/* Drawing is a pure function of (scene, time, stage, mass, distance); playback only advances time. */
(function(){
const ACCENT={mint:'#0e9f7a',blue:'#2563eb',gold:'#d97706'};
const TAU=Math.PI*2, FONT='-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif';
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
function rgba(hex,a){const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${a})`;}
function trace(ctx,points){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));}
// Labels drawn on the stage during one paint, so checks can hold every picture to a small label budget. Text that is
// the subject itself (the words of a sentence being studied) is passed with content: true and not counted.
let LABELS=null, lastLabels=[];
function text(ctx,value,x,y,{align='left',color='rgba(20,23,28,.64)',size=11,weight=500,spacing='0px',content=false}={}){
 if(LABELS&&!content)LABELS.push(String(value));
 ctx.font=`${weight} ${size}px ${FONT}`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;
 if('letterSpacing' in ctx)ctx.letterSpacing=spacing;ctx.fillText(value,x,y);if('letterSpacing' in ctx)ctx.letterSpacing='0px';
}

function drawStar(ctx,cx,cy,R,presence){
 // A star with a soft corona and a darker limb; it grows in with the mass.
 const r=R*(.35+.65*presence);ctx.globalAlpha=presence;
 const corona=ctx.createRadialGradient(cx,cy,r*.8,cx,cy,r*4.5);corona.addColorStop(0,'rgba(255,214,140,.35)');corona.addColorStop(.35,'rgba(255,190,110,.12)');corona.addColorStop(1,'rgba(255,190,110,0)');
 ctx.fillStyle=corona;ctx.fillRect(cx-r*4.5,cy-r*4.5,r*9,r*9);
 const body=ctx.createRadialGradient(cx-r*.15,cy-r*.15,r*.05,cx,cy,r);
 body.addColorStop(0,'#fffaf0');body.addColorStop(.45,'#ffe2a3');body.addColorStop(.82,'#f7a644');body.addColorStop(1,'#d9701c');
 ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.fillStyle=body;ctx.fill();
 ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.clip();
 for(let i=0;i<26;i++){const a=hash(i*3.1)*TAU, d=Math.sqrt(hash(i*7.7))*r*.85, sr=r*(.06+.08*hash(i*1.3));
  ctx.beginPath();ctx.arc(cx+Math.cos(a)*d,cy+Math.sin(a)*d,sr,0,TAU);ctx.fillStyle=`rgba(${hash(i)>.5?'255,255,255':'200,110,30'},${.06+.05*hash(i*2.2)})`;ctx.fill();}
 ctx.restore();ctx.globalAlpha=1;return r;
}
function drawPlanet(ctx,w,h,horizon,presence){
 // A rocky planet rises into view with its thin atmosphere; texture is deterministic.
 const cx=w/2, rise=horizon+(1-presence)*(h-horizon+h*.06), PR=Math.max(w*w/(8*(h-horizon)*.7),h), cy=rise+PR;
 ctx.globalAlpha=Math.min(1,presence*1.4);
 const air=ctx.createRadialGradient(cx,cy,PR,cx,cy,PR+h*.05);air.addColorStop(0,'rgba(160,200,255,.45)');air.addColorStop(1,'rgba(160,200,255,0)');
 ctx.beginPath();ctx.arc(cx,cy,PR+h*.05,0,TAU);ctx.fillStyle=air;ctx.fill();
 const body=ctx.createLinearGradient(0,rise,0,h);body.addColorStop(0,'#d9925a');body.addColorStop(.35,'#b8693a');body.addColorStop(1,'#7a3e1f');
 ctx.beginPath();ctx.arc(cx,cy,PR,0,TAU);ctx.fillStyle=body;ctx.fill();
 ctx.save();ctx.beginPath();ctx.arc(cx,cy,PR,0,TAU);ctx.clip();
 for(let i=0;i<40;i++){const x=hash(i*5.3)*w, y=rise+hash(i*2.9)*(h-rise)*1.2, rx=w*(.06+.1*hash(i*1.7)), ry=rx*.12;
  ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fillStyle=`rgba(${hash(i*4.1)>.5?'255,230,200':'90,40,20'},${.03+.04*hash(i*6.3)})`;ctx.fill();}
 const shade=ctx.createLinearGradient(0,0,w,0);shade.addColorStop(0,'rgba(60,25,10,.28)');shade.addColorStop(.5,'rgba(60,25,10,0)');shade.addColorStop(1,'rgba(60,25,10,.28)');
 ctx.fillStyle=shade;ctx.fillRect(0,rise-2,w,h-rise+2);ctx.restore();
 ctx.beginPath();ctx.arc(cx,cy,PR,Math.PI*1.08,Math.PI*1.92);ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=1.2;ctx.stroke();
 ctx.globalAlpha=1;
}

function drawLight(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.mint, s=Math.min(w/15,h/9), cx=w*.5, cy=h*.47, m=st.mass, small=w<520;
 // Tilted view of the optical mesh: distance on it is light travel time, its dip drawn for six times the model mass.
 const tilt=1.2, mu=6*Physics.m(m), lift=Math.sin(tilt), drop=Math.cos(tilt), rim=Physics.meshHeight(mu,9.5);
 // The mesh opens to a circle of radius core + 2mu around the mass; the star is sized and placed to fill it.
 const R=(9+m*9)*clamp(s/40,.6,1.4), core=Math.max(.2,R/s-2*mu);
 const at=(x,y)=>{const r=Math.max(Math.hypot(x,y),1e-6), f=(r+2*mu)/r, dip=Math.max(0,rim-Physics.meshHeight(mu,Math.max(r,core)));
  return [cx+x*f*s,cy-y*f*s*lift+dip*s*drop];};
 const centre=[cx,cy+Math.max(0,rim-Physics.meshHeight(mu,core))*s*drop];
 // Mesh lines darken where the surface is steep, lit from the far side, so the dip's depth reads.
 const line=(pts)=>{let prev=null;for(const [x,y] of pts){const r=Math.hypot(x,y);if(m>.001&&r<core){prev=null;continue;}const q=at(x,y);
  if(prev){const steep=mu>1e-6?clamp(Math.sqrt(4*mu/r+4*mu*mu/(r*r))*.7):0, light=.5+.5*y/Math.max(r,1e-6);
   ctx.beginPath();ctx.moveTo(prev[0],prev[1]);ctx.lineTo(q[0],q[1]);ctx.strokeStyle=`rgba(20,23,28,${.12+steep*(.12+.22*(1-light))})`;ctx.stroke();}
  prev=q;}};
 if(mu>1e-6){const [sx,sy]=centre, g=ctx.createRadialGradient(sx,sy,0,sx,sy,3*s);
  g.addColorStop(0,`rgba(60,45,25,${.16*clamp(mu/.05)})`);g.addColorStop(1,'rgba(60,45,25,0)');ctx.fillStyle=g;
  ctx.beginPath();ctx.ellipse(sx,sy,3*s,3*s*lift,0,0,TAU);ctx.fill();}
 ctx.lineWidth=1;
 for(let i=-10;i<=10;i++){const x=i*.75;line(Array.from({length:81},(_,j)=>[x,-4+8.5*j/80]));}
 for(let j=0;j<=11;j++){const y=-4+j*.75;line(Array.from({length:121},(_,i)=>[-7.5+15*i/120,y]));}
 if(m>.001){
  const r=drawStar(ctx,centre[0],centre[1],Math.max(R,(core+2*mu)*s),clamp(m/.25));
  if(st.labels)text(ctx,'MASS',cx,centre[1]+r+16,{align:'center',size:10,weight:600,spacing:'1.5px'});
 }else{
  ctx.setLineDash([3,5]);ctx.beginPath();ctx.ellipse(cx,cy,R,R*lift,0,0,TAU);ctx.strokeStyle='rgba(20,23,28,.22)';ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);
  if(st.labels)text(ctx,'no mass',cx,cy+R+18,{align:'center',size:10,weight:600,spacing:'1px'});
 }
 const count=spec.ray_count||1, N=240;
 for(let r=count-1;r>=0;r--){
  const b=st.distance+r*.4, main=r===0, path=Physics.lightPath(mu,b), points=path.filter((_,i)=>i%Math.max(1,Math.floor(path.length/N))===0).concat([path.at(-1)]).map(([x,y])=>at(x,y));
  const n=points.length-1;
  if(spec.show_reference){ctx.setLineDash([4,6]);trace(ctx,[[cx-7.5*s,cy-b*s*lift],[cx+7.5*s,cy-b*s*lift]]);ctx.strokeStyle='rgba(20,23,28,.25)';ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);}
  ctx.lineCap='round';ctx.lineJoin='round';
  trace(ctx,points);ctx.strokeStyle=rgba(accent,main?.14:.06);ctx.lineWidth=(main?spec.line_width:1.2)*5;ctx.stroke();
  trace(ctx,points);ctx.strokeStyle=rgba(accent,main?.95:.4);ctx.lineWidth=main?spec.line_width:1.2;ctx.stroke();
  // Pulses are moving markers along the path, not a measurement of coordinate speed.
  for(let k=0;k<3;k++){
   const phase=((st.t/6+k/3+r*.13)%1+1)%1, fade=smooth(phase/.06)*smooth((1-phase)/.06);
   for(let i=14;i>=1;i--){const p=phase-i*.0055;if(p<0)continue;const [x,y]=points[Math.floor(p*n)];
    ctx.beginPath();ctx.arc(x,y,(main?3.2:2)*(1-i/16),0,TAU);ctx.fillStyle=rgba(accent,.4*(1-i/15)*fade);ctx.fill();}
   const [x,y]=points[Math.floor(phase*n)];
   const glow=ctx.createRadialGradient(x,y,0,x,y,main?16:9);glow.addColorStop(0,rgba(accent,.38*fade));glow.addColorStop(1,rgba(accent,0));
   ctx.fillStyle=glow;ctx.fillRect(x-16,y-16,32,32);
   ctx.beginPath();ctx.arc(x,y,main?4:2.6,0,TAU);ctx.fillStyle=rgba(accent,fade);ctx.fill();
   ctx.beginPath();ctx.arc(x,y,main?1.6:1,0,TAU);ctx.fillStyle=`rgba(255,255,255,${fade})`;ctx.fill();
  }
  if(st.labels&&main){
   const end=points[n], size=small?10:11, x=Math.min(w-16,end[0]);
   // Name the light where it enters: beside its start when there is room, else just above it.
   const [lx0,ly0]=points[0];if(lx0>70)text(ctx,'LIGHT',lx0-10,ly0,{align:'right',size:10,weight:600,spacing:'1.5px'});else text(ctx,'LIGHT',lx0+6,ly0+16,{size:10,weight:600,spacing:'1.5px'});
   if(m>.001){text(ctx,'straightest line across the mesh',x,Math.min(h-14,end[1]+16),{align:'right',size,weight:600,color:accent});
    if(spec.show_reference)text(ctx,'dashed: without the mass',Math.min(w-16,cx+7.5*s),cy-(st.distance+(count-1)*.4)*s*lift-14,{align:'right',size});}
   else text(ctx,'flat mesh: light goes straight',x,end[1]+16,{align:'right',size,weight:600,color:accent});
  }
 }
}

function drawClocks(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.blue, m=st.mass, presence=clamp(m/.3);
 const ratio=Physics.clockRatio(m,st.distance), rate=1-12*(1-ratio), small=w<520;
 const cx=w*.5, rad=Math.min(w*.13,h*.135), horizon=h*.9;
 let lowerY=h*(.68-.09*(st.distance-1)), upperY=lowerY-Math.max(h*.34,rad*2.5);
 // Keep the top clock and its label clear of the stage notes.
 const clear=(st.labels?(small?92:24):6)-(upperY-rad-(st.labels&&small?13:0));
 if(clear>0){upperY+=clear;lowerY+=clear;}
 // Warm haze marks "deeper in gravity".
 if(presence>0){
  const haze=ctx.createLinearGradient(0,h,0,h*.4);haze.addColorStop(0,`rgba(245,158,66,${.2*presence})`);haze.addColorStop(1,'rgba(245,158,66,0)');
  ctx.fillStyle=haze;ctx.fillRect(0,h*.4,w,h*.6);
  drawPlanet(ctx,w,h,horizon,presence);
 }else{
  ctx.setLineDash([3,5]);trace(ctx,[[w*.08,horizon],[w*.92,horizon]]);ctx.strokeStyle='rgba(20,23,28,.2)';ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);
  if(st.labels)text(ctx,'no mass',cx,horizon+(h-horizon)*.5,{align:'center',size:10,weight:600,spacing:'1px'});
 }
 // Fixed gap bracket.
 const gx=small?cx-rad-Math.min(40,w*.09):cx-rad-150;
 ctx.strokeStyle='rgba(20,23,28,.28)';ctx.lineWidth=1;
 trace(ctx,[[gx-4,upperY],[gx+4,upperY]]);ctx.stroke();trace(ctx,[[gx-4,lowerY],[gx+4,lowerY]]);ctx.stroke();
 ctx.setLineDash([2,4]);trace(ctx,[[gx,upperY],[gx,lowerY]]);ctx.stroke();ctx.setLineDash([]);
 if(st.labels){ctx.save();ctx.translate(gx-12,(upperY+lowerY)/2);ctx.rotate(-Math.PI/2);text(ctx,'SAME GAP',0,0,{align:'center',size:9,weight:600,spacing:'1.5px'});ctx.restore();}
 // Both clocks start together at each chapter, so the lag shown is the lag since that start.
 const clockT=st.since??st.t, reference=clockT*.5;
 function face(y,speed,name,lower){
  const angle=clockT*.5*speed;
  ctx.save();ctx.shadowColor='rgba(20,30,50,.14)';ctx.shadowBlur=26;ctx.shadowOffsetY=10;
  ctx.beginPath();ctx.arc(cx,y,rad,0,TAU);ctx.fillStyle='#fff';ctx.fill();ctx.restore();
  ctx.beginPath();ctx.arc(cx,y,rad,0,TAU);ctx.strokeStyle='rgba(20,23,28,.12)';ctx.lineWidth=1;ctx.stroke();
  for(let i=0;i<60;i++){const a=i*TAU/60, major=i%5===0, r0=rad*(major?.8:.86);
   trace(ctx,[[cx+Math.sin(a)*r0,y-Math.cos(a)*r0],[cx+Math.sin(a)*rad*.92,y-Math.cos(a)*rad*.92]]);
   ctx.strokeStyle=major?'rgba(20,23,28,.5)':'rgba(20,23,28,.14)';ctx.lineWidth=major?1.5:1;ctx.stroke();}
  if(lower&&spec.show_reference&&presence>0){
   const lag=((reference-angle)%TAU+TAU)%TAU;
   if(lag>.004){ctx.beginPath();ctx.moveTo(cx,y);ctx.arc(cx,y,rad*.88,-Math.PI/2+angle,-Math.PI/2+angle+lag);ctx.closePath();ctx.fillStyle=`rgba(234,88,12,${.22*presence})`;ctx.fill();}
   ctx.setLineDash([3,4]);trace(ctx,[[cx,y],[cx+Math.sin(reference)*rad*.74,y-Math.cos(reference)*rad*.74]]);
   ctx.strokeStyle='rgba(20,23,28,.38)';ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);
  }
  ctx.lineCap='round';
  trace(ctx,[[cx-Math.sin(angle)*rad*.12,y+Math.cos(angle)*rad*.12],[cx+Math.sin(angle)*rad*.76,y-Math.cos(angle)*rad*.76]]);
  ctx.strokeStyle=accent;ctx.lineWidth=Math.max(2.5,rad*.045);ctx.stroke();
  ctx.beginPath();ctx.arc(cx,y,Math.max(3.5,rad*.06),0,TAU);ctx.fillStyle=accent;ctx.fill();
  ctx.beginPath();ctx.arc(cx,y,Math.max(1.5,rad*.025),0,TAU);ctx.fillStyle='#fff';ctx.fill();
  if(st.labels){const o={size:small?10:11,weight:600,spacing:'1.5px',color:'rgba(20,23,28,.62)'};
   if(small)text(ctx,name,cx,y-rad-13,{...o,align:'center'});else text(ctx,name,cx-rad-22,y,{...o,align:'right'});}
 }
 face(upperY,1,'HIGHER CLOCK',false);
 face(lowerY,rate,'LOWER CLOCK',true);
 if(st.labels&&spec.show_reference&&presence>0){
  const lx=cx+rad+16, size=small?10:11;
  ctx.fillStyle=`rgba(234,88,12,${.5*presence})`;ctx.fillRect(lx,lowerY-13,9,9);
  text(ctx,'fallen behind',lx+15,lowerY-8,{size});
  ctx.setLineDash([3,3]);trace(ctx,[[lx,lowerY+12],[lx+9,lowerY+12]]);ctx.strokeStyle='rgba(20,23,28,.45)';ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);
  text(ctx,small?'higher pace':'higher clock’s pace',lx+15,lowerY+12,{size});
 }
}

function pill(ctx,value,x,y,opts={}){
 // A label on a soft white backing so moving labels stay legible over lines and other text.
 const size=opts.size||11;ctx.font=`${opts.weight||500} ${size}px ${FONT}`;if('letterSpacing' in ctx)ctx.letterSpacing=opts.spacing||'0px';
 const width=ctx.measureText(value).width, left=opts.align==='right'?x-width:opts.align==='center'?x-width/2:x;
 ctx.fillStyle='rgba(255,255,255,.88)';ctx.beginPath();ctx.roundRect?ctx.roundRect(left-5,y-size*.75,width+10,size*1.5,size*.75):ctx.rect(left-5,y-size*.75,width+10,size*1.5);ctx.fill();
 if('letterSpacing' in ctx)ctx.letterSpacing='0px';text(ctx,value,x,y,opts);
}
function drawSpacetime(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.blue, v=Physics.speed(st.mass), g=Physics.gamma(v), T=Physics.turnaround(st.distance), H=2*T, small=w<520;
 // Scale to the whole trip, so the drawing fills the stage; the shape (and the percentage) does not depend on trip length.
 const k=Math.min((h-(st.labels?(small?128:92):52))/(H+.1),(w*.62)/Math.max(.9,v*T+1.1)), x0=w*.5-v*T*k*.5, y0=h-28, map=(x,t)=>[x0+x*k,y0-t*k];
 const top=y0/k;
 ctx.beginPath();ctx.moveTo(...map(0,0));ctx.lineTo(...map(top,top));ctx.lineTo(...map(-top,top));ctx.closePath();ctx.fillStyle=rgba(accent,.045);ctx.fill();
 ctx.setLineDash([2,5]);ctx.strokeStyle=rgba('#d97706',.6);ctx.lineWidth=1.2;
 trace(ctx,[map(-top,top),map(0,0),map(top,top)]);ctx.stroke();ctx.setLineDash([]);
 const tc=Math.min(H,((st.t*.42*Math.max(1,H/4.8))%(H+1.4)+H+1.4)%(H+1.4));
 const xAt=t=>t<=T?v*t:v*(H-t);
 ctx.lineCap='round';
 // Home: a tick every half year, a numbered mark every year.
 trace(ctx,[map(0,0),map(0,H)]);ctx.strokeStyle='rgba(20,23,28,.5)';ctx.lineWidth=2;ctx.stroke();
 for(let s=.5;s<=H+1e-9;s+=.5){const whole=Math.abs(s-Math.round(s))<1e-9,[x,y]=map(0,s);trace(ctx,[[x-(whole?7:4),y],[x+(whole?7:4),y]]);ctx.strokeStyle=whole?'rgba(20,23,28,.6)':'rgba(20,23,28,.3)';ctx.lineWidth=whole?1.6:1;ctx.stroke();
  if(whole&&st.labels)text(ctx,String(s),x-12,y,{align:'right',size:9,weight:600,color:'rgba(20,23,28,.5)'});}
 if(v>.001){
  trace(ctx,[map(0,0),map(v*T,T),map(0,H)]);ctx.strokeStyle=accent;ctx.lineWidth=Math.max(2.2,spec.line_width||2.5);ctx.stroke();
  // Traveller: one mark per half year of the traveller's own time, numbered each year; dilation spaces them out.
  for(let s=.5;s*g<=H+1e-9;s+=.5){const whole=Math.abs(s-Math.round(s))<1e-9,t=s*g,[x,y]=map(xAt(t),t);
   ctx.beginPath();ctx.arc(x,y,whole?4.2:2.4,0,TAU);ctx.fillStyle=accent;ctx.fill();
   if(whole){ctx.beginPath();ctx.arc(x,y,1.6,0,TAU);ctx.fillStyle='#fff';ctx.fill();if(st.labels)text(ctx,String(s),x+10,y,{size:9,weight:600,color:rgba(accent,.85)});}}
  if(st.labels||spec.show_reference){
   const slope=tc<=T?v:-v, xc=xAt(tc), left=-1.1, right=v*T+1.4, a=map(left,tc+slope*(left-xc)), b=map(right,tc+slope*(right-xc));
   ctx.setLineDash([5,5]);trace(ctx,[a,b]);ctx.strokeStyle=rgba(accent,.45);ctx.lineWidth=1.2;ctx.stroke();ctx.setLineDash([]);
   if(st.labels)pill(ctx,'traveller’s “now”',b[0],b[1],{align:'right',size:10,weight:500,color:rgba(accent,.9)});
  }
 }
 const [hx,hy]=map(0,tc),[tx,ty]=map(xAt(tc),tc);
 for(const [x,y,c] of [[hx,hy,'#14171c'],[tx,ty,accent]]){const glow=ctx.createRadialGradient(x,y,0,x,y,15);glow.addColorStop(0,rgba(c,.3));glow.addColorStop(1,rgba(c,0));ctx.fillStyle=glow;ctx.fillRect(x-15,y-15,30,30);
  ctx.beginPath();ctx.arc(x,y,5.5,0,TAU);ctx.fillStyle=c;ctx.fill();ctx.beginPath();ctx.arc(x,y,2,0,TAU);ctx.fillStyle='#fff';ctx.fill();}
 if(st.labels){
  const size=small?10:11, close=Math.abs(tx-hx)<150;
  if(Math.abs(hy-map(0,H*.5)[1])>34&&!small)text(ctx,'time ↑',x0-34,map(0,H*.5)[1],{align:'right',size:10});
  text(ctx,'space →',x0+12,y0+16,{size:10});
  text(ctx,'LIGHT',map(top*.8,top*.8)[0]+8,map(0,top*.8)[1],{size:9,weight:600,spacing:'1.5px',color:'rgba(217,119,6,.8)'});
  pill(ctx,`HOME  ${tc.toFixed(1)} yr`,hx-30,hy,{align:'right',size,weight:600,color:'rgba(20,23,28,.8)',spacing:'.5px'});
  if(v>.001)pill(ctx,`TRAVELLER  ${(tc/g).toFixed(1)} yr`,Math.max(tx,hx)+16,close?Math.min(ty,hy)-16:ty,{size,weight:600,color:accent,spacing:'.5px'});
  else pill(ctx,'traveller stays home',hx+16,hy,{size,weight:500,color:accent});
 }
}

// A screen lit by brightness samples [[x, 0..1], ...], drawn as one smooth gradient so no seams show.
function screenStrip(ctx,pts,y,band){
 const x0=pts[0][0], x1=pts.at(-1)[0], g=ctx.createLinearGradient(x0,0,x1,0);
 for(const [x,I] of pts)g.addColorStop((x-x0)/(x1-x0),`rgba(255,244,214,${Math.min(1,Math.max(0,I))})`);
 ctx.fillStyle=g;ctx.fillRect(x0,y,x1-x0,band);
}
let fieldBuffer=null;
function drawInterference(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.blue, A=st.mass, lam=Math.max(22,Math.min(w,h)/9), k=TAU/lam, d=Physics.separation(st.distance)*lam;
 const cx=w/2, sy=st.labels&&w<520?h*.22:h*.1, screen=st.labels?h*.8:h, s1=[cx-d/2,sy], s2=[cx+d/2,sy], phase=st.t*TAU*.55;
 const cell=w<520?3:4, cols=Math.ceil(w/cell), rows=Math.ceil(screen/cell);
 fieldBuffer=fieldBuffer||document.createElement('canvas');
 if(fieldBuffer.width!==cols||fieldBuffer.height!==rows){fieldBuffer.width=cols;fieldBuffer.height=rows;}
 const fctx=fieldBuffer.getContext('2d'), image=fctx.createImageData(cols,rows), data=image.data;
 const n=parseInt(accent.slice(1),16), ar=n>>16, ag=n>>8&255, ab=n&255;
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
  const x=i*cell, y=j*cell, r1=Math.hypot(x-s1[0],y-s1[1]), r2=Math.hypot(x-s2[0],y-s2[1]);
  const f=(Math.cos(k*r1-phase)/Math.sqrt(1+r1/lam)+A*Math.cos(k*r2-phase)/Math.sqrt(1+r2/lam))/2;
  const o=4*(j*cols+i), a=Math.min(1,Math.abs(f)*1.15);
  if(f>0){data[o]=ar;data[o+1]=ag;data[o+2]=ab;data[o+3]=a*150;}else{data[o]=20;data[o+1]=30;data[o+2]=50;data[o+3]=a*55;}
 }
 fctx.putImageData(image,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(fieldBuffer,0,0,cols*cell,rows*cell);
 // Time-averaged brightness on the screen: crests meeting crests stay bright.
 const band=h*.08, sx0=w*.04, sx1=w*.96;
 if(st.labels){
 const pts=[];for(let i=0;i<=200;i++){const x=sx0+(sx1-sx0)*i/200, dr=Math.hypot(x-s1[0],screen-s1[1])-Math.hypot(x-s2[0],screen-s2[1]);pts.push([x,Physics.brightness(A,k*dr)]);}
 ctx.fillStyle='rgba(255,255,255,.7)';ctx.fillRect(0,screen,w,h-screen);
 ctx.fillStyle='#1e1d1b';ctx.fillRect(sx0,screen+6,sx1-sx0,band);
 screenStrip(ctx,pts.map(([x,I])=>[x,I*1.05]),screen+6,band);
 }
 for(const [p,on] of [[s1,1],[s2,A]]){ctx.globalAlpha=on>0.001?.4+.6*Math.min(1,on):.25;ctx.beginPath();ctx.arc(p[0],p[1],6,0,TAU);ctx.fillStyle=on>0.001?accent:'#fff';ctx.fill();ctx.strokeStyle='rgba(20,23,28,.4)';ctx.lineWidth=1;ctx.stroke();ctx.globalAlpha=1;}
 if(st.labels){
  const size=w<520?10:11;
  text(ctx,'SOURCE',s1[0]-12,s1[1],{align:'right',size,weight:600,spacing:'1.5px'});
  const far=s2[0]+130>w;text(ctx,A>0.001?'SECOND SOURCE':'second source off',far?s2[0]-12:s2[0]+12,far?s2[1]+18:s2[1],{size,weight:600,spacing:A>0.001?'1.5px':'0px',color:A>0.001?'rgba(20,23,28,.64)':'rgba(20,23,28,.5)'});
  text(ctx,'SCREEN · brightness averaged over time',sx0,screen+band+22,{size:10,weight:600,spacing:'1px'});
 }
}

const hash=i=>{let x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x);};
let patternCache={key:'',cdf:null};
function slitPattern(A,sep,bins){
 const key=A.toFixed(3)+'|'+sep.toFixed(3)+'|'+bins;
 if(patternCache.key===key)return patternCache;
 const p=[];let total=0;
 for(let i=0;i<bins;i++){const y=(i+.5)/bins*2-1, env=Math.pow(Math.cos(y*Math.PI/2.15),2), I=env*Physics.intensity(A,TAU*sep*y*.9);p.push(I);total+=I;}
 const cdf=[];let run=0;for(const v of p){run+=v/total;cdf.push(run);}
 patternCache={key,p:p.map(v=>v/Math.max(...p)),cdf};return patternCache;
}
function drawParticles(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.mint, A=st.mass, sep=Physics.separation(st.distance), small=w<520;
 const srcX=w*.08, wallX=w*.42, scrX=w*.8, midY=st.labels&&small?h*.58:h*.5, span=st.labels&&small?h*.32:h*.38, gap=span*.075*sep, slit=Math.max(6,h*.025);
 const bins=120, pat=slitPattern(A,sep,bins);
 // Probability ripples: possibilities spread through every open slit; no path is drawn.
 const phase=(st.t*.8)%1;
 for(let r=0;r<5;r++){const rad=((r+phase)/5)*(wallX-srcX);ctx.beginPath();ctx.arc(srcX,midY,rad,-.6,.6);ctx.strokeStyle=rgba(accent,.18*(1-r/5));ctx.lineWidth=1.2;ctx.stroke();}
 for(const [y,on] of [[midY-gap/2,1],[midY+gap/2,A]]){if(on<.001)continue;for(let r=0;r<6;r++){const rad=((r+phase)/6)*(scrX-wallX);ctx.beginPath();ctx.arc(wallX,y,rad,-.9,.9);ctx.strokeStyle=rgba(accent,.14*on*(1-r/6));ctx.lineWidth=1.1;ctx.stroke();}}
 ctx.beginPath();ctx.arc(srcX,midY,6,0,TAU);ctx.fillStyle=accent;ctx.fill();
 // Barrier with two slits; the second opens with the first slider.
 ctx.fillStyle='rgba(20,23,28,.78)';
 const y1=midY-gap/2, y2=midY+gap/2;
 ctx.fillRect(wallX-3,midY-span,6,y1-slit-(midY-span));ctx.fillRect(wallX-3,y1+slit,6,y2-slit-(y1+slit));ctx.fillRect(wallX-3,y2+slit,6,midY+span-(y2+slit));
 if(A<1){ctx.fillStyle=`rgba(20,23,28,${.78*(1-A)})`;ctx.fillRect(wallX-3,y2-slit,6,2*slit);}
 // Screen and arrivals, accumulated one at a time.
 const sw=small?14:18;ctx.fillStyle='#fff';ctx.fillRect(scrX,midY-span,sw,2*span);ctx.strokeStyle='rgba(20,23,28,.15)';ctx.strokeRect(scrX,midY-span,sw,2*span);
 const count=Math.min(2400,Math.floor(st.t*55)), counts=new Array(bins).fill(0);
 for(let i=0;i<count;i++){
  const u=hash(i+1);let lo=0,hi=bins-1;while(lo<hi){const m=(lo+hi)>>1;if(pat.cdf[m]<u)lo=m+1;else hi=m;}
  counts[lo]++;const y=midY-span+(lo+hash(i+7.3))/bins*2*span, x=scrX+2+hash(i+3.1)*(sw-4), fresh=i>=count-3;
  ctx.beginPath();ctx.arc(x,y,fresh?2.6:1.1,0,TAU);ctx.fillStyle=fresh?accent:rgba(accent,.55);ctx.fill();
 }
 const hx=scrX+sw+8, hw=w-hx-16, peak=Math.max(1,...counts);
 for(let i=0;i<bins;i++){if(!counts[i])continue;const y=midY-span+i/bins*2*span;ctx.fillStyle=rgba(accent,.35);ctx.fillRect(hx,y,counts[i]/peak*hw*.9,2*span/bins+.5);}
 if(spec.show_reference){trace(ctx,pat.p.map((v,i)=>[hx+v*hw*.9,midY-span+(i+.5)/bins*2*span]));ctx.setLineDash([3,4]);ctx.strokeStyle='rgba(20,23,28,.4)';ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);}
 if(st.labels){
  const size=small?9:11;
  text(ctx,'ONE AT A TIME',srcX,midY-24,{size,weight:600,spacing:'1px'});
  text(ctx,A>0.001?'TWO SLITS':'ONE SLIT OPEN',wallX,midY-span-12,{align:'center',size,weight:600,spacing:'1px'});
  text(ctx,`${count} arrivals`,scrX,midY+span+16,{size,weight:600,color:accent});
  if(!small)text(ctx,'each lands at one random spot; the pattern is not random',scrX+sw,midY-span-12,{align:'right',size:10});
 }
}

// The rope: simulated, not drawn from a formula. Each chapter has its own shaking plan; the simulation runs from the
// chapter's start, is advanced frame by frame during playback and rebuilt when seeking, so frames match playback.
const ROPE={key:'',s:null,rate:0,size:0,on:0,held:0};
function ropePlan(spec,st){
 const lines=timeline?.chapters?.[st.stage]?.lines||[], c0=timeline?.chapters?.[st.stage]?.start||0;
 const third=lines[1]?lines[1].start-c0:8;
 if(st.stage===0)return {key:'pulse',plan:{pulse:true},t:Math.max(0,st.since-1.2)*.125,rate:0};
 const rates=st.stage===1?[[.8,1]]:st.stage===2?[[.8,1.5]]:[[.8,2],[third,3]];
 const t=Math.max(0,st.since), seg=rates.filter(([t0])=>t>=t0).at(-1)||rates[0];
 return {key:`${st.stage}|${third.toFixed(2)}`,plan:{rates},t,rate:seg[1],held:t-seg[0]};
}
function ropeAdvance(spec,st){
 const P=Physics, {key,plan,t,rate,held}=ropePlan(spec,st);
 if(ROPE.key!==key||!ROPE.s||t<ROPE.s.t-1e-6){ROPE.key=key;ROPE.s=P.ropeStart();}
 P.ropeStep(ROPE.s,t,P.ropeHand(plan));
 ROPE.rate=rate;ROPE.held=held??0;ROPE.on=st.stage===0?0:1;
 ROPE.size=ROPE.rate>0?P.ropeSize(ROPE.s,ROPE.rate):0;
 return ROPE.s;
}
// A fist gripping the rope's end, seen from the side: the forearm in a sleeve, the back of the hand, four curled
// fingers wrapped around the rope and the thumb laid across them. (x, y) is where the rope leaves the fist.
function drawHand(ctx,x,y,size){
 const skin='#e0ad86', edge='rgba(110,62,35,.55)', u=size;
 const blob=(x0,y0,w,h,r)=>{ctx.beginPath();ctx.roundRect(x0,y0,w,h,r);ctx.fill();ctx.stroke();};
 // The rope runs into the grip, hidden by the fingers.
 trace(ctx,[[x-u*1.2,y],[x,y]]);ctx.strokeStyle='rgba(37,99,235,.9)';ctx.lineWidth=2.5;ctx.stroke();
 // Sleeve and cuff.
 ctx.fillStyle='#4a5566';ctx.beginPath();ctx.roundRect(x-u*4.8,y-u*.52,u*3.2,u*1.04,u*.24);ctx.fill();
 ctx.fillStyle='#3a4352';ctx.beginPath();ctx.roundRect(x-u*1.78,y-u*.6,u*.3,u*1.2,u*.1);ctx.fill();
 ctx.lineWidth=1.2;ctx.strokeStyle=edge;
 // Back of the hand.
 ctx.fillStyle=skin;blob(x-u*1.55,y-u*.66,u*1.05,u*1.32,u*.42);
 // Four curled fingers, top to bottom, each wrapping over the rope.
 ctx.fillStyle=skin;for(let k=3;k>=0;k--)blob(x-u*.82,y-u*.66+k*u*.33,u*.86,u*.36,u*.18);
 // The thumb, resting along the top of the fingers and pointing forward.
 ctx.save();ctx.translate(x-u*1.2,y-u*.62);ctx.rotate(.18);ctx.fillStyle=skin;blob(0,-u*.22,u*1.05,u*.36,u*.18);ctx.restore();
}
// The guitar string: pulled into a bend and let go; it rings in its in-step patterns, mostly the slowest. Pressing it
// at the middle leaves half the string ringing, twice as fast. Drawn slowed down 220 times; heard at the real pitch.
const GUITAR={active:false,len:1,plucked:[],tAbs:null,lastSince:-1,lastLen:null,key:''};
const guitarLen=b=>1-(b-1)/1.5*.5;
function guitarPlan(st){
 const c=timeline?.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0;
 const press=lines[2]?lines[2].start-c0:9;
 return {plucks:[[.9,1],[press+.9,.5]],press};
}
function drawGuitar(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.gold, warm='#c2410c', small=w<520, P=Physics, p=P.stringPluckAt;
 const x0=w*(small?.08:.12), x1=w*(small?.92:.88), yc=h*.46, W=x1-x0, amp=(small?.16:.1)*W*st.mass;
 let len, age, pull=0;
 if(st.live){
  // Exploring: each move of "Where you press" plucks the string again.
  len=guitarLen(st.distance);
  if(GUITAR.lastLen===null)GUITAR.lastLen=len;
  if(Math.abs(len-GUITAR.lastLen)>.004){GUITAR.lastLen=len;GUITAR.tAbs=st.t;soundPluck(220/len);GUITAR.plucked.push(Math.round(220/len));}
  age=GUITAR.tAbs===null?99:st.t-GUITAR.tAbs;
 }else{
  const {plucks,press}=guitarPlan(st), since=st.since;
  if(GUITAR.key!==String(st.stage)||since<GUITAR.lastSince){GUITAR.key=String(st.stage);GUITAR.lastSince=-1;}
  for(const [tp,L] of plucks)if(st.playing&&GUITAR.lastSince<tp&&since>=tp){soundPluck(220/L);GUITAR.plucked.push(Math.round(220/L));}
  GUITAR.lastSince=since;
  const last=plucks.filter(([tp])=>since>=tp).at(-1), next=plucks.find(([tp])=>since<tp);
  len=since>=press?.5:1;
  if(next&&next[0]-since<.6){pull=1-(next[0]-since)/.6;age=null;}
  else age=last?since-last[0]:null;
  GUITAR.tAbs=age===null?null:st.t-age;GUITAR.lastLen=len;
 }
 GUITAR.active=true;GUITAR.len=len;
 // The fretboard, its frets at real guitar spacing, the nut on the left and the bridge on the right.
 const board=small?h*.1:h*.13;
 ctx.fillStyle='#8a5a3b';ctx.beginPath();ctx.roundRect(x0-8,yc-board/2,W+16,board,6);ctx.fill();
 for(let k=1;k<=12;k++){const fx=x0+W*(1-Math.pow(2,-k/12));trace(ctx,[[fx,yc-board/2],[fx,yc+board/2]]);ctx.strokeStyle='rgba(235,225,210,.55)';ctx.lineWidth=1.4;ctx.stroke();}
 ctx.fillStyle='#efe6d4';ctx.fillRect(x0-6,yc-board/2-2,6,board+4);ctx.fillStyle='#2a2a2e';ctx.fillRect(x1,yc-board/2-2,7,board+4);
 // The string: still between the nut and a pressing finger; the ringing part from there to the bridge.
 const xs=x0+W*(1-len), N=200, ring=Array.from({length:N+1},(_,i)=>{const u=i/N;let v=0;
  if(pull>0)v=pull*(u<p?u/p:(1-u)/(1-p));else if(age!==null)v=P.stringY(u,age,len);return [xs+u*(x1-xs),yc-v*amp];});
 if(xs>x0+1){trace(ctx,[[x0,yc],[xs,yc]]);ctx.strokeStyle='rgba(225,225,230,.9)';ctx.lineWidth=2;ctx.stroke();}
 trace(ctx,ring);ctx.strokeStyle='rgba(245,240,230,.95)';ctx.lineWidth=2.4;ctx.stroke();
 trace(ctx,ring);ctx.strokeStyle=rgba(accent,.35);ctx.lineWidth=6;ctx.stroke();
 const skin='#e0ad86', edge='rgba(110,62,35,.55)';
 // A fingertip pulls the string before each pluck.
 if(pull>0){const fx=xs+p*(x1-xs), fy=yc-pull*amp;ctx.fillStyle=skin;ctx.strokeStyle=edge;ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(fx,fy-9,8,11,0,0,TAU);ctx.fill();ctx.stroke();}
 // A finger pressing the string at the middle.
 if(len<.999){const f=small?9:12;ctx.fillStyle=skin;ctx.strokeStyle=edge;ctx.lineWidth=1.2;
  ctx.beginPath();ctx.roundRect(xs-f*.9,yc-f*5.2,f*1.8,f*4.6,f*.9);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.ellipse(xs,yc-f*.35,f,f*1.25,0,0,TAU);ctx.fill();ctx.stroke();
  ctx.fillStyle='rgba(255,240,230,.9)';ctx.strokeStyle=edge;ctx.beginPath();ctx.roundRect(xs-f*.5,yc-f*1.05,f,f*.75,f*.3);ctx.fill();ctx.stroke();}
 if(!st.labels)return;
 const lsize=small?10:11, base=yc+board/2+(small?24:30);
 text(ctx,'a guitar string',(x0+x1)/2,yc-board/2-(small?40:52),{align:'center',size:lsize,weight:600,color:'rgba(20,23,28,.7)'});
 text(ctx,len<.999?(len>.51?`${Math.round(len*100)}% of it rings`:'pressed at the middle'):'open string',(x0+x1)/2,base,{align:'center',size:small?11:12,weight:600,color:len<.999?warm:accent});
 if(pull>0)pill(ctx,'pluck',xs+p*(x1-xs),yc-amp-34,{align:'center',size:lsize,weight:600,color:accent});
}
function drawRope(ctx,w,h,spec,st){
 if(st.stage>=4||st.live)return drawGuitar(ctx,w,h,spec,st);
 GUITAR.active=false;
 const accent=ACCENT[spec.accent]||ACCENT.gold, warm='#c2410c', small=w<520, P=Physics, A=P.ropeModel.A, N=P.ropeModel.N;
 const s=ropeAdvance(spec,st), y=s.y, x0=w*(small?.22:.17), x1=w*(small?.9:.86), yc=h*.46, W=x1-x0, size=small?15:24;
 // Heights use the rope's own scale; on a phone they are drawn 2.2 times taller so the swing stays easy to see.
 const V=small?W*2.2:W, X=i=>x0+i/N*W, Y=v=>yc-v*V;
 trace(ctx,[[x0,yc],[x1,yc]]);ctx.strokeStyle='rgba(20,23,28,.1)';ctx.lineWidth=1;ctx.setLineDash([3,5]);ctx.stroke();ctx.setLineDash([]);
 // The wall, with the ring the rope is tied to.
 ctx.fillStyle='rgba(20,23,28,.78)';ctx.fillRect(x1+5,yc-h*.24,10,h*.48);
 ctx.beginPath();ctx.arc(x1+3,yc,4.5,0,TAU);ctx.strokeStyle='rgba(20,23,28,.8)';ctx.lineWidth=2;ctx.stroke();
 const pts=Array.from({length:N+1},(_,i)=>[X(i),Y(y[i])]);
 ctx.lineCap='round';ctx.lineJoin='round';
 trace(ctx,pts);ctx.strokeStyle=rgba(accent,.16);ctx.lineWidth=(spec.line_width||2.5)*4;ctx.stroke();
 trace(ctx,pts);ctx.strokeStyle=accent;ctx.lineWidth=spec.line_width||2.5;ctx.stroke();
 drawHand(ctx,x0,Y(y[0]),size);
 // In step at a whole-number rate: mark the still points between the loops.
 const n=Math.round(ROPE.rate), inStep=ROPE.size>3.2&&ROPE.held>2.5&&n>=1&&Math.abs(ROPE.rate-n)<.04;
 if(inStep)for(let m=1;m<n;m++){ctx.beginPath();ctx.arc(x0+m/n*W,yc,4.5,0,TAU);ctx.fillStyle=warm;ctx.fill();}
 if(!st.labels)return;
 const lsize=small?10:11, base=yc+h*.3;
 if(st.stage===0)text(ctx,'your hand',x0-size*1.2,base,{align:'center',size:lsize,weight:600,color:'rgba(20,23,28,.7)'});
 if(st.stage===0)text(ctx,'wall',small?w-6:x1+10,base,{align:small?'right':'center',size:lsize,weight:600,color:'rgba(20,23,28,.7)'});
 const shakes=ROPE.rate, rateText=st.stage===0?'one shake, 8× slower':`${shakes%1?shakes.toFixed(1):shakes} shake${shakes===1?'':'s'} a second`;
 text(ctx,rateText,x0-size*1.2,base+18,{align:'center',size:small?11:13,weight:600,color:'rgba(20,23,28,.78)'});
 if(st.stage===0){
  // Follow the hump: out to the wall, then back upside down.
  let k=4;for(let i=4;i<N;i++)if(Math.abs(y[i])>Math.abs(y[k]))k=i;
  const leg=Math.floor(Math.max(0,2*(s.t-.15)));
  if(leg<2&&Math.abs(y[k])>.25*A){const up=y[k]>0;pill(ctx,leg?'← back, upside down':'hump →',X(k),Y(y[k])+(up?-22:22),{align:'center',size:lsize,weight:600,color:leg?warm:accent});}
 }else if(inStep){
  text(ctx,`in step: ${n} loop${n>1?'s':''}`,(x0+x1)/2,base,{align:'center',size:small?11:12,weight:600,color:accent});
  // The still point's tag sits below the swing, joined to its dot by a thin line.
  if(n>1){const px=x0+W/n, ty=yc+.17*V+14;trace(ctx,[[px,yc+6],[px,ty-8]]);ctx.strokeStyle=rgba(warm,.5);ctx.lineWidth=1;ctx.stroke();pill(ctx,'still point',px,ty,{align:'center',size:10,weight:600,color:warm});}
 }else if(shakes>0&&Math.abs(shakes-n)>.04&&st.since>3)text(ctx,'out of step',(x0+x1)/2,base,{align:'center',size:small?11:12,weight:600,color:warm});
}

function drawTunnel(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.blue, bar=Physics.barrier(st.mass,st.distance), small=w<520, C=Physics.cx;
 const xmin=-14,xmax=14, X=x=>w*.05+(x-xmin)/(xmax-xmin)*w*.9, y0=h*(small?.6:.56), amp=h*.15, phase=st.t*2.2;
 const rot=[Math.cos(-phase),Math.sin(-phase)];
 // Barrier band; its height relative to the particle's energy is printed on it.
 if(bar.V>1e-4){
  const x0=X(0),x1=X(bar.w);ctx.fillStyle=`rgba(20,23,28,${.06+.12*Math.min(1,bar.V/2)})`;ctx.fillRect(x0,h*.14,x1-x0,h*.72);
  ctx.strokeStyle='rgba(20,23,28,.3)';ctx.lineWidth=1;ctx.strokeRect(x0,h*.14,x1-x0,h*.72);
 }
 trace(ctx,[[X(xmin),y0],[X(xmax),y0]]);ctx.strokeStyle='rgba(20,23,28,.12)';ctx.stroke();
 const N=520, env=[], re=[];
 for(let i=0;i<=N;i++){const x=xmin+(xmax-xmin)*i/N, v=bar.psi(x), m=Math.sqrt(C.abs2(v)), r=C.mul(v,rot)[0];env.push([X(x),m]);re.push([X(x),y0-r*amp]);}
 ctx.beginPath();env.forEach(([x,m],i)=>i?ctx.lineTo(x,y0-m*amp):ctx.moveTo(x,y0-m*amp));for(let i=env.length-1;i>=0;i--)ctx.lineTo(env[i][0],y0+env[i][1]*amp);ctx.closePath();
 ctx.fillStyle=rgba(accent,.1);ctx.fill();
 ctx.lineJoin='round';trace(ctx,re);ctx.strokeStyle=accent;ctx.lineWidth=spec.line_width||2.4;ctx.stroke();
 if(st.labels){
  const size=small?10:11, top=h*.14-12;
  text(ctx,'COMING IN + BOUNCING BACK',X(-7),top,{align:'center',size,weight:600,spacing:'1px'});
  text(ctx,'GETS THROUGH',X(7.4),top,{align:'center',size,weight:600,spacing:'1px'});
  if(bar.V>1e-4)pill(ctx,`barrier ${(bar.V/bar.E).toFixed(1)}× the energy`,(X(0)+X(bar.w))/2,h*.86+14,{align:'center',size:10,weight:500});
  else text(ctx,'no barrier',X(.5),h*.86+14,{align:'center',size:10});
  pill(ctx,`${Math.round(bar.T*100)}% through`,X(10.5),y0-Math.sqrt(bar.T)*amp-18,{align:'center',size,weight:600,color:accent});
  text(ctx,'shaded band: how spread out the wave is · line: the wave at this instant',w/2,h-14,{align:'center',size:small?9:10});
 }
}

// A blend of waves. A long beep is one pitch; adding pitches in between, all at their crests in one place, makes a
// short click. A particle's wave works the same way, each wave length being a different speed. Each chapter has a
// fixed plan; after playback the viewer sets how wide the blend of speeds is.
const BLEND={mode:'',count:1};
const blendSk=a=>a<.02?0:.5*clamp(a);
function blendPlan(st){
 const P=Physics, c=timeline?.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since);
 const bell=sk=>P.blendRange(sk).map(j=>[j,P.blendAmp(j,sk),1]);
 if(st.since===undefined)return {mode:'particle',comps:bell(.25),rows:1,particle:1,band:1,speeds:0};
 if(st.live){const sk=blendSk(st.mass);return {mode:'live',sk,comps:bell(sk),rows:0,particle:1,band:1,speeds:1,brackets:1,extremes:true};}
 // 1: one steady wave draws in; from the second sentence a second, slightly higher one joins it.
 if(st.stage===0){const e=smooth((t-at(1)-.2)/1.4);
  return {mode:'beep',comps:[[-1,1,1],[1,e,1]],rows:1,particle:0,marks:smooth((t-at(1)-2)/.8)};}
 // 2: pitches in between join one by one, settling into a bell curve; together they make one short click.
 if(st.stage===1){const order=[0,2,-2,3,-3,4,-4], settle=smooth(t/2.2), sk=.25;
  const comps=[[-1,1+(P.blendAmp(1,sk)-1)*settle,1],[1,1+(P.blendAmp(1,sk)-1)*settle,1]];
  order.forEach((j,i)=>{const e=smooth((t-.6-i*.9)/.8);comps.push([j,P.blendAmp(j,sk)*e,1]);});
  const click=smooth((t-.6-order.length*.9-.4)/.8);
  return {mode:'click',comps,rows:1,particle:0,click,steps:click};}
 // 3: the same picture as a particle's wave: where it is big, the particle is likely to be; length sets speed.
 if(st.stage===2)return {mode:'particle',comps:bell(.25),rows:1,particle:smooth(t/1),band:smooth((t-1.4)/1),speeds:smooth((t-at(1))/1)};
 // 4: the rows fade; then the burst is squeezed until speeds spread everywhere, and spread out until one wave is left.
 const u=t-at(1), sk=u<2?.25+.65*smooth(u/2):u<3.2?.9:u<5.6?.9-.88*smooth((u-3.2)/2.4):.02;
 return {mode:'squeeze',sk,comps:bell(sk),rows:1-smooth((t-at(1)+.6)/1),particle:1,band:1,speeds:1,brackets:smooth((t-.8)/1),extremes:true};
}
function drawPacket(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.blue, small=w<520, P=Physics, plan=blendPlan(st), D=P.blendDelta, KC=P.blendCentre, warm='#c2410c';
 const half=small?12:16, X=x=>w/2+x/half*w*(small?.46:.45), lsize=small?10:12;
 const comps=plan.comps.filter(([,a])=>a>1e-3), B=P.blendWaves(comps.map(([j,a])=>[j,a])), total=comps.reduce((s,[,a])=>s+a,0)||1;
 Object.assign(BLEND,{mode:plan.mode,count:comps.filter(([,a])=>a>.02).length,sk:plan.sk??null,sound:plan.particle<=.5});
 // Each wave length has its own colour, from blue-green for the longest to violet for the shortest.
 const hue=(j,al=1)=>`hsla(${232+j*11},70%,${46-Math.min(6,Math.abs(j))}%,${al})`;
 const word=(sound,particle)=>plan.particle>.5?particle:sound, speedWord=(sound,particle)=>(plan.speeds??0)>.5?particle:sound;
 // The waves mixed in, one row each, slower (longer) waves at the top, each as tall as its share of the mix.
 const rTop=h*(small?.14:.1), rBot=h*(small?.4:.4), slot=(rBot-rTop)/9, rowY=j=>rTop+(j+4.5)*slot;
 // One scale for rows and their sum while the rows are shown, so the total really is the rows added up; once the rows
 // fade the total is drawn to fit.
 const full=P.blendRange(.25).reduce((s,j)=>s+P.blendAmp(j,.25),0), y0=h*((small?.56:.57)-(1-plan.rows)*(small?.14:.17)), amp=h*(small?.1:.11);
 const S=amp/full, scale=plan.rows*S+(1-plan.rows)*amp/total;
 if(plan.rows>.01){
  for(const [j,a] of comps){if(Math.abs(j)>4)continue;
   const pts=[];for(let i=0;i<=320;i++){const x=-half+2*half*i/320;pts.push([X(x),rowY(j)-a*S*Math.cos((KC+j*D)*x)]);}
   trace(ctx,pts);ctx.strokeStyle=hue(j,.95*plan.rows*Math.min(1,a*1.6));ctx.lineWidth=1.8;ctx.stroke();}
  if(st.labels){ctx.globalAlpha=plan.rows;
   if(plan.mode==='beep')text(ctx,'WAVES MIXED IN',small?X(half):X(-half),rTop-(small?12:14),{align:small?'right':'left',size:lsize,weight:600,spacing:'1px'});
   if(plan.speeds>0){ctx.globalAlpha=plan.rows*plan.speeds;
    pill(ctx,'slower',X(half),rowY(-1)-2,{align:'right',size:lsize,weight:600,color:hue(-1)});
    pill(ctx,'faster',X(half),rowY(1)+2,{align:'right',size:lsize,weight:600,color:hue(1)});}
   ctx.globalAlpha=1;}
 }
 // Where the crests line up, and where crest meets trough.
 const markTop=y0-amp-(small?6:8);
 if(plan.marks>0){ctx.globalAlpha=plan.marks;
  for(const x of [0,8,-8]){if(Math.abs(x)>half)continue;trace(ctx,[[X(x),rTop-4],[X(x),rBot+4]]);trace(ctx,[[X(x),markTop],[X(x),y0+amp+6]]);ctx.strokeStyle=x?'rgba(194,65,12,.55)':rgba(accent,.6);ctx.lineWidth=1.2;ctx.setLineDash([3,4]);ctx.stroke();ctx.setLineDash([]);}
  if(st.labels){pill(ctx,'loud',X(0),y0+amp+20,{align:'center',size:lsize,weight:600,color:accent});
  pill(ctx,'quiet',X(8),y0+amp+20,{align:'center',size:lsize,weight:600,color:warm});}
  ctx.globalAlpha=1;}
 if(plan.steps>0){ctx.globalAlpha=plan.steps;const far=7;
  for(const x of [0,far,-far]){trace(ctx,[[X(x),rTop-4],[X(x),rBot+4]]);ctx.strokeStyle=x?'rgba(194,65,12,.5)':rgba(accent,.6);ctx.lineWidth=1.2;ctx.setLineDash([3,4]);ctx.stroke();trace(ctx,[[X(x),markTop],[X(x),y0+amp+6]]);ctx.stroke();ctx.setLineDash([]);}
  if(st.labels)pill(ctx,'in step',X(0),y0+amp+20,{align:'center',size:lsize,weight:600,color:accent});
  ctx.globalAlpha=1;}
 // Everything added together; the shaded band shows where the particle is likely to be.
 const N=small?420:700, pts=[];
 if(plan.band>0){ctx.beginPath();for(let i=0;i<=N;i++){const x=-half+2*half*i/N;ctx.lineTo(X(x),y0-B.env(x)*total*scale);}
  for(let i=N;i>=0;i--){const x=-half+2*half*i/N;ctx.lineTo(X(x),y0+B.env(x)*total*scale);}ctx.closePath();ctx.fillStyle=rgba(accent,.13*plan.band);ctx.fill();}
 trace(ctx,[[X(-half),y0],[X(half),y0]]);ctx.strokeStyle='rgba(20,23,28,.12)';ctx.lineWidth=1;ctx.stroke();
 for(let i=0;i<=N;i++){const x=-half+2*half*i/N;pts.push([X(x),y0-B.sum(x)*total*scale]);}
 trace(ctx,pts);ctx.strokeStyle=accent;ctx.lineWidth=spec.line_width||2.4;ctx.lineJoin='round';ctx.stroke();
 const sk=plan.sk??.25, sx=sk>.01?.5/sk:Infinity;
 if(st.labels){
  if(plan.mode==='beep'||plan.mode==='particle')text(ctx,word('ALL ADDED TOGETHER','THE PARTICLE’S WAVE'),X(-half),y0-amp-(small?14:18),{size:lsize,weight:600,spacing:'1px'});
  if(plan.click>0){ctx.globalAlpha=plan.click;pill(ctx,'a short click',small?X(half):X(0),y0-amp-(small?14:18),{align:small?'right':'center',size:lsize,weight:600,color:accent});ctx.globalAlpha=1;}

 }
 // The recipe: how much of each wave length is mixed in, on a fixed scale.
 const bBase=h*.93, bTall=h*(small?.15:.17), K=k=>w/2+(k-KC)/(13*D)*w*(small?.44:.32), bw=Math.max(2,(K(KC+D)-K(KC))*.62);
 trace(ctx,[[K(KC-13*D),bBase],[K(KC+13*D),bBase]]);ctx.strokeStyle='rgba(20,23,28,.25)';ctx.lineWidth=1;ctx.stroke();
 const top=Math.max(...comps.map(([,a])=>a),1e-9);
 for(const [j,a] of comps){const hh=a/top*bTall;ctx.fillStyle=hue(j,.85);ctx.fillRect(K(KC+j*D)-bw/2,bBase-hh,bw,hh);}
 if(st.labels){
  text(ctx,speedWord('pitch: low → high','speed: slow → fast'),w/2,bBase+12,{align:'center',size:lsize,weight:600});
 }
 // Brackets: where the particle may be, and the speeds it may have (each covering most of its spread).
 if(plan.brackets>0){ctx.globalAlpha=plan.brackets;
  const brace=(x0,x1,y,label)=>{trace(ctx,[[x0,y+5],[x0,y],[x1,y],[x1,y+5]]);ctx.strokeStyle=warm;ctx.lineWidth=1.6;ctx.stroke();if(st.labels)pill(ctx,label,(x0+x1)/2,y-12,{align:'center',size:lsize,weight:600,color:warm});};
  if(2*sx<half*.95)brace(X(-2*sx),X(2*sx),y0-amp-(small?8:10),'where it may be');
  else if(st.labels)pill(ctx,'anywhere',X(0),y0-amp-(small?18:22),{align:'center',size:lsize,weight:600,color:warm});
  if(sk>.01)brace(K(KC-2*sk),K(KC+2*sk),bBase-bTall-(small?28:34),'its speeds');
  else if(st.labels)pill(ctx,'one exact speed',K(KC),bBase-bTall-(small?40:46),{align:'center',size:lsize,weight:600,color:warm});
  ctx.globalAlpha=1;}
}

// A trapped particle's wave at a trial energy, started fading into the left wall. Inside the trap it wiggles; in the
// walls it can only fade or grow. Only at a few energies does it fade into the right wall too: the allowed energies.
// Each chapter has a fixed plan; after playback the viewer chooses the energy and the trap's width.
const TRAP={mode:'',found:0,fits:false,colours:0,L:2};
const trapE=a=>-Physics.trapDepth*(1-.985*clamp(a)), trapL=b=>clamp(b,1,2.5);
// The energy control clicks onto an allowed energy when it comes close, like a dial finding a station.
const trapSnap=(E,levels)=>levels.find(e=>Math.abs(e-E)<.35)??E;
// Colour of the light given off by a drop, from red for the smallest drop to violet for the largest (illustrative).
function dropColour(f){
 const nm=1/(1/650+clamp(f)*(1/420-1/650));let r=0,g=0,b=0;
 if(nm<440){r=(440-nm)/60;b=1;}else if(nm<490){g=(nm-440)/50;b=1;}else if(nm<510){g=1;b=(510-nm)/20;}
 else if(nm<580){r=(nm-510)/70;g=1;}else if(nm<645){r=1;g=(645-nm)/65;}else r=1;
 const c=v=>Math.round(255*Math.pow(clamp(v),.8));return {nm,css:`rgb(${c(r)},${c(g)},${c(b)})`};
}
function trapPlan(st){
 const P=Physics, V=P.trapDepth, c=timeline?.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, dur=c?c.end-c.start:14;
 const at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since);
 if(st.live){const L=trapL(st.distance), lv=P.trapLevels(L);return {mode:'live',L,E:trapSnap(trapE(st.mass),lv),levels:lv,found:lv.map((_,i)=>i)};}
 const L=2, lv=P.trapLevels(L), mid=(lv[1]+lv[2])/2, floor=-V+.4;
 if(st.since===undefined)return {mode:'all',L,levels:lv,found:[0,1,2],show:[1,1,1]};
 // 1: the wave inside the trap; with the second sentence its energy rises and it wiggles more.
 if(st.stage===0)return {mode:'inside',L,E:-14+(mid+14)*smooth((t-at(1))/3.6),levels:lv,found:[],name:t<at(1)};
 // 2: the same wave with the walls: it fades into the left wall and grows in the right one. The second sentence
 // lights up the fading tail (the particle pokes in only a little), the third the growing one (impossible).
 if(st.stage===1)return {mode:'walls',L,E:mid,levels:lv,found:[],grow:smooth((t-.6)/1.6),focus:t>=at(2)?'right':t>=at(1)?'left':''};
 // 3: first the rule: a fade would need a sharp corner where the wave enters the right wall. Then the energy rises
 // through every value (almost every wave grows), drops back, and with the third sentence rises again, stopping at
 // each energy where the wave arrives at just the slope a fade needs.
 if(st.stage===2){
  const s2=at(1)-.2, s3=Math.max(s2+5,at(2)-.2);
  if(t<s2)return {mode:'corner',L,E:mid,levels:lv,found:[],corner:smooth((t-.5)/.8)};
  if(t<s3){const u=(t-s2)/(s3-s2), E=u<.6?mid+(-.6-mid)*smooth(u/.6):-.6+(floor+.6)*smooth((u-.6)/.4);return {mode:'sweep',L,E,levels:lv,found:[]};}
  const stops=[floor,...lv], seg=Math.max(1.2,(dur-(s3-0)-.4)/3), move=seg*.35;
  let u=t-s3, E=floor;const found=[];
  for(let i=0;i<3;i++){if(u<move){E=stops[i]+(stops[i+1]-stops[i])*smooth(u/move);break;}u-=move;E=stops[i+1];found.push(i);if(u<seg-move)break;u-=seg-move;}
  return {mode:'sweep',L,E,levels:lv,found};
 }
 // 4: the allowed waves together, one more loop each.
 if(st.stage===3)return {mode:'all',L,levels:lv,found:lv.map((_,i)=>i),show:lv.map((_,i)=>i?smooth((t-.3-i*1.1)/.8):1)};
 // 5: an atom: drops between allowed energies give off light, one colour per drop, one drop at a time.
 return {mode:'atom',L,levels:lv,found:lv.map((_,i)=>i),drops:[[1,0],[2,1],[2,0]].map(([u,d],i)=>({u,d,p:clamp((t-at(1)-.2-i*2.2)/1.1)}))};
}
function drawWell(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.blue, warm='#c2410c', small=w<520, P=Physics, V=P.trapDepth, plan=trapPlan(st);
 const xm=small?2.3:3.0, sx=(small?.94:.84)*w/(2*xm), cx=w/2, X=x=>cx+x*sx;
 const Etop=2.2, Ebot=-V-1.2, top=h*(small?.22:.15), bottom=h*.93, Y=E=>top+(Etop-E)/(Etop-Ebot)*(bottom-top);
 const half=plan.L/2, rim=Y(0), floor=Y(-V), A=small?22:30, lsize=small?10:12, lv=plan.levels;
 Object.assign(TRAP,{mode:plan.mode,found:plan.found.length,L:plan.L,fits:false,colours:0});
 // Ground: the walls and the rock under the floor. Being there takes more energy than the particle has.
 ctx.beginPath();ctx.moveTo(0,rim);ctx.lineTo(X(-half),rim);ctx.lineTo(X(-half),floor);ctx.lineTo(X(half),floor);ctx.lineTo(X(half),rim);ctx.lineTo(w,rim);ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();
 ctx.fillStyle='rgba(150,112,78,.12)';ctx.fill();
 trace(ctx,[[0,rim],[X(-half),rim],[X(-half),floor],[X(half),floor],[X(half),rim],[w,rim]]);ctx.strokeStyle='rgba(60,40,25,.7)';ctx.lineWidth=2.2;ctx.lineJoin='round';ctx.stroke();
 if(st.labels){
  for(const x of [(-xm-half)/2,(xm+half)/2])text(ctx,'WALL',X(x),floor+16,{align:'center',size:lsize,weight:600,spacing:'1.5px',color:'rgba(90,60,35,.8)'});
  text(ctx,'TRAP',cx,floor+16,{align:'center',size:lsize,weight:600,spacing:'1.5px',color:'rgba(90,60,35,.8)'});
  text(ctx,'↑ energy',small?6:14,rim-14,{size:lsize-1,weight:600,color:'rgba(20,23,28,.45)'});
 }
 // One wave at energy E, drawn around its energy line at the same size inside the trap for every energy; the shading
 // between wave and line shows how much wave is there, above or below. A tail that grows without end is drawn warm and
 // cut where it leaves the picture. sym: the symmetric wave inside the trap only, before the walls are discussed.
 const wave=(E,{alpha=1,inside=false,reach=1,sym=false}={})=>{
  const s=P.wellShoot(E,V,plan.L), y0=Y(E), N=small?280:460, lim=[rim+3,h*.975], left=[], mid=[], right=[];let cut=null;
  for(let i=0;i<=N;i++){
   const x=-xm+2*xm*i/N;if(inside&&Math.abs(x)>half+1e-9)continue;if(x>half&&(x-half)>(xm-half)*reach)break;
   const v=sym?Math.cos(s.k*x):s.psi(x)/s.top, y=y0-v*A, top=x>half?lim[0]:h*.02;
   if(y<top||y>lim[1]){cut={x:X(x),y:clamp(y,top,lim[1]),up:v>0};break;}
   const pt=[X(x),y];if(x<-half)left.push(pt);else if(x<=half)mid.push(pt);else right.push(pt);
  }
  if(!mid.length)return {fits:false,cut,s,y0,right:[],end:null};
  if(left.length)left.push(mid[0]);if(right.length)right.unshift(mid.at(-1));
  const fits=!cut&&Math.abs(s.psi(xm)/s.top)<.35;
  ctx.globalAlpha=alpha;ctx.lineCap='round';ctx.lineJoin='round';
  for(const [seg,col] of [[left,accent],[mid,accent],[right,fits||!reach?accent:warm]]){if(seg.length<2)continue;
   ctx.beginPath();ctx.moveTo(seg[0][0],y0);seg.forEach(([x,y])=>ctx.lineTo(x,y));ctx.lineTo(seg.at(-1)[0],y0);ctx.closePath();ctx.fillStyle=rgba(col,col===warm?.14:.1);ctx.fill();
   trace(ctx,seg);ctx.strokeStyle=rgba(col,.16);ctx.lineWidth=7;ctx.stroke();
   trace(ctx,seg);ctx.strokeStyle=col;ctx.lineWidth=spec.line_width||2.4;ctx.stroke();}
  if(cut){const d=cut.up?-1:1;ctx.beginPath();ctx.moveTo(cut.x,cut.y+d*2);ctx.lineTo(cut.x-6,cut.y-d*9);ctx.lineTo(cut.x+6,cut.y-d*9);ctx.closePath();ctx.fillStyle=warm;ctx.fill();}
  ctx.globalAlpha=1;
  return {fits,cut,s,y0,right,left,end:right.at(-1)||mid.at(-1)};
 };
 const junction=(r,{show=1,label=true}={})=>{if(show<=0)return;const s=r.s, e=1e-5, ph=s.psi(half-e), slope=(s.psi(half-e)-s.psi(half-3*e))/(2*e);
  const px=X(half), py=r.y0-ph/s.top*A, dx=.42, go=x=>r.y0-(ph+slope*x)/s.top*A, fade=x=>r.y0-ph*Math.exp(-s.kappa*x)/s.top*A;
  const match=Math.abs(slope+s.kappa*ph)/(Math.abs(slope)+s.kappa*Math.abs(ph)+1e-9)<.04;
  ctx.globalAlpha=show;
  trace(ctx,Array.from({length:12},(_,i)=>[X(half+dx*i/11),fade(dx*i/11)]));ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.setLineDash([4,4]);ctx.stroke();ctx.setLineDash([]);
  trace(ctx,[[px,py],[X(half+dx),go(dx)]]);ctx.strokeStyle=match?accent:warm;ctx.lineWidth=2;ctx.stroke();
  ctx.beginPath();ctx.arc(px,py,9,0,TAU);ctx.strokeStyle=match?accent:warm;ctx.lineWidth=2;ctx.stroke();
  if(st.labels&&label&&!match)pill(ctx,small?'needs a kink':'fading here needs a kink',px+14,py+(small?20:24),{size:lsize,weight:600,color:warm});
  ctx.globalAlpha=1;return match;};
 const line=E=>{trace(ctx,[[0,Y(E)],[w,Y(E)]]);ctx.strokeStyle='rgba(20,23,28,.28)';ctx.lineWidth=1;ctx.setLineDash([4,5]);ctx.stroke();ctx.setLineDash([]);
  };
 // Allowed energies found so far: a solid rung across the trap, labelled.
 const rungs=list=>{for(const i of list){trace(ctx,[[X(-half),Y(lv[i])],[X(half),Y(lv[i])]]);ctx.strokeStyle=rgba(accent,.45);ctx.lineWidth=1.6;ctx.stroke();
  }};
 const glow=(seg,col)=>{if(!seg||seg.length<2)return;trace(ctx,seg);ctx.strokeStyle=rgba(col,.28);ctx.lineWidth=14;ctx.lineCap='round';ctx.stroke();};
 const tailNote=(r,good,bad,extra)=>{if(!st.labels||!r.right.length)return null;
  const far=r.cut?Math.abs(r.cut.y-r.y0):0, pt=r.fits?r.end:(r.right.find(([,y])=>Math.abs(y-r.y0)>=.5*far)||r.end);
  const label=r.fits?good:bad;ctx.font=`600 ${lsize}px ${FONT}`;const room=ctx.measureText(extra&&!small?extra:label).width+18;
  const right=pt[0]+14+room<w, x=right?pt[0]+14:pt[0]-14, y=r.fits?pt[1]-18:pt[1];
  pill(ctx,label,x,y,{align:right?'left':'right',size:lsize,weight:600,color:r.fits?accent:warm});
  if(extra)pill(ctx,extra,x,y+(small?17:21),{align:right?'left':'right',size:lsize,weight:600,color:warm});
  return [x,y];};
 if(plan.mode==='inside'){
  line(plan.E);wave(plan.E,{inside:true});
  if(st.labels&&plan.name)pill(ctx,'the particle’s wave',cx,Y(plan.E)-A-18,{align:'center',size:lsize,weight:600,color:accent});
  return;
 }
 if(plan.mode==='walls'){
  line(plan.E);
  const r=wave(plan.E,{reach:plan.grow});
  if(plan.focus==='left')glow(r.left,accent);
  if(plan.focus==='right')glow(r.right,warm);
  if(st.labels&&plan.grow>.6){
   pill(ctx,plan.focus==='left'?'pokes in a little':'fades',X((-xm-half)/2),Y(plan.E)+(small?20:22),{align:'center',size:lsize,weight:600,color:accent});
   tailNote(r,'fades',plan.focus==='right'?'grows: impossible':'grows');
  }
  return;
 }
 if(plan.mode==='corner'){
  line(plan.E);const r=wave(plan.E,{reach:0});junction(r,{show:plan.corner});
  return;
 }
 if(plan.mode==='sweep'||plan.mode==='live'){
  rungs(plan.found);line(plan.E);
  const r=wave(plan.E);TRAP.fits=r.fits;
  if(r.fits)tailNote(r,'fits','');else if(plan.mode==='live')tailNote(r,'fits','grows');
  return;
 }
 if(plan.mode==='all'){
  lv.forEach((E,i)=>{if(plan.show[i]<=0)return;wave(E,{alpha:plan.show[i]});
   if(st.labels){ctx.globalAlpha=plan.show[i];pill(ctx,`${i+1} loop${i?'s':''}`,X(half)+(small?6:14),Y(E)-(small?12:16),{size:lsize,weight:600,color:rgba(accent,.95)});ctx.globalAlpha=1;}});
  return;
 }
 // An atom's light: each drop between allowed energies gives off one colour; a bigger drop gives bluer light.
 lv.forEach(E=>wave(E,{alpha:.35}));rungs(plan.found);
 const gaps=plan.drops.map(d=>lv[d.u]-lv[d.d]), lo=Math.min(...gaps), hi=Math.max(...gaps);
 // A spectrum strip from violet to red; each colour the atom gives off lights up as a line.
 const sw=small?150:260, sx0=small?w-sw-14:cx-sw/2, sy=h*(small?.07:.06), nm=x=>sx0+(x-390)/(700-390)*sw;
 const strip=ctx.createLinearGradient(sx0,0,sx0+sw,0);[[0,'rgba(120,60,200,.22)'],[.3,'rgba(40,120,230,.22)'],[.5,'rgba(40,180,90,.22)'],[.7,'rgba(240,200,40,.22)'],[1,'rgba(220,50,40,.22)']].forEach(([o,c])=>strip.addColorStop(o,c));
 ctx.fillStyle='#202028';ctx.beginPath();ctx.roundRect(sx0,sy,sw,14,4);ctx.fill();ctx.fillStyle=strip;ctx.beginPath();ctx.roundRect(sx0,sy,sw,14,4);ctx.fill();
 if(st.labels){text(ctx,'light from the atom',sx0+sw/2,sy+26,{align:'center',size:small?10:11,weight:600});
 }
 plan.drops.forEach((d,i)=>{if(d.p<=0)return;
  const x=X(-half*.55+i*half*.55), yu=Y(lv[d.u]), yd=Y(lv[d.d]), y=yu+(yd-yu)*smooth(d.p), col=dropColour((gaps[i]-lo)/(hi-lo||1));
  const done=d.p>=1, fade=done&&plan.drops[i+1]&&plan.drops[i+1].p>0?.45:1;
  ctx.globalAlpha=fade;trace(ctx,[[x,yu],[x,y]]);ctx.strokeStyle='rgba(20,23,28,.55)';ctx.lineWidth=1.6;ctx.stroke();
  if(done){ctx.beginPath();ctx.moveTo(x,yd);ctx.lineTo(x-5,yd-9);ctx.lineTo(x+5,yd-9);ctx.closePath();ctx.fillStyle='rgba(20,23,28,.7)';ctx.fill();}
  else{ctx.beginPath();ctx.moveTo(x,y+2);ctx.lineTo(x-5,y-7);ctx.lineTo(x+5,y-7);ctx.closePath();ctx.fillStyle='rgba(20,23,28,.8)';ctx.fill();}
  if(done){TRAP.colours++;
   const ym=(yu+yd)/2, x1=Math.min(w-10,X(half)+(small?70:200)), pts=[];
   for(let j=0;j<=80;j++){const xx=x+8+(x1-x-8)*j/80;pts.push([xx,ym+Math.sin(j*.9)*4]);}
   trace(ctx,pts);ctx.strokeStyle=col.css;ctx.lineWidth=2.4;ctx.stroke();
   ctx.globalAlpha=1;ctx.save();ctx.shadowColor=col.css;ctx.shadowBlur=8;ctx.fillStyle=col.css;ctx.fillRect(nm(col.nm)-3,sy,6,14);ctx.restore();}
  ctx.globalAlpha=1;
 });
}
function drawFall(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.blue, F=Physics.fall(st.mass,st.distance), small=w<520, warm='#c2410c';
 // Height against time, with a side view of the same throw at the left edge of the diagram.
 const col=small?w*.1:w*.07, x0=small?w*.2:w*.13, x1=small?w*.94:w*.5, ground=h*(small?.5:.76), topY=small?96:70, scaleA=Math.max(F.best,F.ref)*2;
 const X=t=>x0+t/F.T*(x1-x0), Y=hh=>ground-hh/scaleA*(ground-topY);
 const shade=ctx.createLinearGradient(0,ground,0,topY);shade.addColorStop(0,`rgba(245,158,66,${.24*Math.min(1,F.g/.8)})`);shade.addColorStop(1,'rgba(245,158,66,0)');
 ctx.fillStyle=shade;ctx.fillRect(col-18,topY,x1-col+18,ground-topY);
 trace(ctx,[[col-18,ground],[x1,ground]]);ctx.strokeStyle='rgba(20,23,28,.5)';ctx.lineWidth=1.6;ctx.stroke();
 // Candidate paths between the same two moments: stay put, a low throw, the real throw, a high throw.
 const unit=F.best>1e-9?F.best:F.ref, paths=[['Held at the ground',0,'#14171c'],['A low throw',.45*unit,'rgba(20,23,28,.4)'],[F.best>1e-9?'The real throw':'A throw',unit,accent],['A high throw',1.75*unit,'rgba(20,23,28,.4)']];
 const best=F.best>1e-9?2:0, u=Math.min(1,(st.since??st.t)*.18), t=u*F.T;
 const curve=apex=>Array.from({length:121},(_,i)=>{const s=F.T*i/120;return [X(s),Y(F.height(apex,s))];});
 paths.forEach(([,apex,c],i)=>{if(!apex)return;trace(ctx,curve(apex));if(i!==2)ctx.setLineDash([4,5]);ctx.strokeStyle=c;ctx.lineWidth=i===2?2.6:1.3;ctx.lineCap='round';ctx.stroke();ctx.setLineDash([]);});
 for(const [i,c] of [[0,'#14171c'],[2,accent]]){const p=[X(t),Y(F.height(paths[i][1],t))];ctx.beginPath();ctx.arc(p[0],p[1],5.5,0,TAU);ctx.fillStyle=c;ctx.fill();ctx.beginPath();ctx.arc(p[0],p[1],2,0,TAU);ctx.fillStyle='#fff';ctx.fill();}
 // The side view: the ball goes straight up and comes back to the hand.
 trace(ctx,[[col,ground],[col,topY]]);ctx.setLineDash([2,4]);ctx.strokeStyle='rgba(20,23,28,.15)';ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);
 const by=Y(F.height(paths[2][1],t));ctx.beginPath();ctx.arc(col,by,7,0,TAU);ctx.fillStyle=accent;ctx.fill();
 ctx.beginPath();ctx.ellipse(col,ground+5,11,5,0,0,TAU);ctx.fillStyle='rgba(122,84,52,.55)';ctx.fill();
 if(!st.labels)return;
 const size=small?10:11;
 text(ctx,'height ↑',x0,topY-16,{size:10});text(ctx,'time →',x1,ground+32,{align:'right',size:10});
 text(ctx,'leave',X(0),ground+16,{align:'center',size,weight:600,color:'rgba(20,23,28,.75)'});text(ctx,'meet again',X(F.T),ground+16,{align:'right',size,weight:600,color:'rgba(20,23,28,.75)'});
 text(ctx,'side view',col,ground+28,{align:'center',size:9,color:'rgba(20,23,28,.55)'});
 if(F.g>1e-4)text(ctx,'clocks run slower down here',X(F.T*.5),ground-12,{align:'center',size:10,color:'rgba(180,83,15,.9)'});
 // Scoreboard: each path's clock compared with the held one, built up as the clocks travel.
 const px=small?w*.06:w*.56, pr=small?w*.94:w*.94, py=small?h*.6:h*.18, lh=small?17:24, mid=small?w*.58:w*.8, half=Math.min((pr-mid)*.9,mid-px-(small?88:120));
 text(ctx,small?'Each clock measures its path':'Each clock measures its path. With gravity, two effects:',px,py,{size:small?12:16,weight:700,color:'#14171c'});
 text(ctx,'higher up: clocks run faster (gain)',px,py+lh,{size:small?10:13,weight:600,color:warm});
 text(ctx,'moving: clocks run slower (loss)',px,py+lh*(small?1.9:1.8),{size:small?10:13,weight:600,color:accent});
 const parts=paths.map(([,apex])=>[F.bonusUntil(apex,t),F.costUntil(apex,t)]), full=Math.max(1e-9,...paths.map(([,a])=>Math.max(F.bonusUntil(a,F.T),F.costUntil(a,F.T))));
 const y0=py+lh*(small?3.1:3.2), rh=small?22:34;
 trace(ctx,[[mid,y0-rh*.5],[mid,y0+rh*(paths.length-.5)]]);ctx.strokeStyle='rgba(20,23,28,.25)';ctx.lineWidth=1;ctx.stroke();
 paths.forEach(([name],i)=>{const y=y0+i*rh,[gain,loss]=parts[i],net=gain-loss,isBest=i===best&&u>=1;
  if(isBest){ctx.fillStyle=rgba(accent,.08);ctx.beginPath();ctx.roundRect(px-8,y-rh*.45,pr-px+16,rh*.9,8);ctx.fill();}
  text(ctx,name,px,y,{size:small?10:12,weight:isBest?700:500,color:i===2?accent:'rgba(20,23,28,.75)'});
  const bh=small?6:8;ctx.fillStyle=rgba(warm,.75);ctx.fillRect(mid,y-bh-1,gain/full*half,bh);ctx.fillStyle=rgba(accent,.6);ctx.fillRect(mid-loss/full*half,y+1,loss/full*half,bh);
  const nx=mid+net/full*half;trace(ctx,[[nx,y-bh-4],[nx,y+bh+4]]);ctx.strokeStyle='#14171c';ctx.lineWidth=2.2;ctx.stroke();});
 const ny=y0+rh*(paths.length-.2)+6;
 text(ctx,'loss ←',mid-6,ny,{align:'right',size:9,color:'rgba(20,23,28,.5)'});text(ctx,'→ gain   | = total',mid+6,ny,{size:9,color:'rgba(20,23,28,.5)'});
 if(u>=1)pill(ctx,F.g>1e-4?'The path that keeps the most time is the arc a real ball follows':'No gravity: staying put keeps the most time',small?w/2:(px+pr)/2,small?h*.965:ny+lh*1.4,{align:'center',size:small?10:12,weight:600});
}

let gapBuffer=null;
function drawGap(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.blue, G=Physics.gap(st.mass,st.distance), small=w<520;
 const u=Math.min(w,h)/12, k=TAU/(G.lambda*u), yb=h*(st.labels&&small?.3:.24), screen=st.labels?h*.8:h, cx=w/2, phase=st.t*TAU*.55, open=G.width!==Infinity;
 const half=open?Math.min(w*.45,G.width*u/2):w;
 // Huygens: the open gap acts as a row of in-phase sources; with no barrier the plane wave continues.
 const n=open?Math.max(6,Math.min(16,Math.ceil(G.width*u/(G.lambda*u)*4))):0, src=Array.from({length:n},(_,i)=>cx-half+(i+.5)/n*2*half);
 const ref=open?src.reduce((s,x)=>s+1/Math.sqrt(1+Math.hypot(x-cx,3*G.lambda*u)/(G.lambda*u)),0)/1.15:1;
 const cell=small?4:6, cols=Math.ceil(w/cell), rows=Math.ceil(screen/cell);
 gapBuffer=gapBuffer||document.createElement('canvas');
 if(gapBuffer.width!==cols||gapBuffer.height!==rows){gapBuffer.width=cols;gapBuffer.height=rows;}
 const g=gapBuffer.getContext('2d'), image=g.createImageData(cols,rows), data=image.data;
 const c=parseInt(accent.slice(1),16), ar=c>>16, ag=c>>8&255, ab=c&255;
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
  const x=i*cell, y=j*cell;let f;
  if(!open||y<yb)f=Math.cos(k*y-phase);
  else{f=0;for(const sx of src){const r=Math.hypot(x-sx,y-yb);f+=Math.cos(k*(yb+r)-phase)/Math.sqrt(1+r/(G.lambda*u));}f/=ref;}
  const o=4*(j*cols+i), a=Math.min(1,Math.abs(f)*1.1);
  if(f>0){data[o]=ar;data[o+1]=ag;data[o+2]=ab;data[o+3]=a*150;}else{data[o]=20;data[o+1]=30;data[o+2]=50;data[o+3]=a*55;}
 }
 g.putImageData(image,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(gapBuffer,0,0,cols*cell,rows*cell);
 if(open){ctx.fillStyle='rgba(20,23,28,.82)';ctx.fillRect(0,yb-4,cx-half,8);ctx.fillRect(cx+half,yb-4,w-cx-half,8);}
 // Screen: time-averaged brightness from the single-gap pattern.
 if(!st.labels)return;
 const band=h*.08;ctx.fillStyle='rgba(255,255,255,.7)';ctx.fillRect(0,screen,w,h-screen);
 ctx.fillStyle='#1e1d1b';ctx.fillRect(w*.04,screen+6,w*.92,band);
 screenStrip(ctx,Array.from({length:201},(_,i)=>{const x=w*.04+w*.92*i/200, dx=x-cx, s=dx/Math.hypot(dx,screen-yb);return [x,open?Physics.singleSlit(st.mass,st.distance,s):1];}),screen+6,band);
 if(open&&G.sinMin<1&&(spec.show_reference||st.labels)){
  const L=screen-yb, tan=G.sinMin/Math.sqrt(1-G.sinMin*G.sinMin);
  ctx.setLineDash([4,5]);ctx.strokeStyle='rgba(20,23,28,.4)';ctx.lineWidth=1.2;
  for(const sgn of [-1,1]){trace(ctx,[[cx,yb],[cx+sgn*L*tan,screen]]);ctx.stroke();}ctx.setLineDash([]);
 }
 if(st.labels){
  const size=small?10:11;
  pill(ctx,'WAVE COMING IN',cx,Math.max(16,yb-24),{align:'center',size,weight:600,spacing:'1px'});
  if(open)pill(ctx,`gap: ${(G.width/G.lambda).toFixed(1)} waves wide`,cx,yb+18,{align:'center',size:10,weight:500});
  else pill(ctx,'no barrier',cx,yb+18,{align:'center',size:10,weight:500});
  text(ctx,!open?'SCREEN · lit straight ahead':G.sinMin>=1?'SCREEN · lit on every side':'SCREEN · dashed: first dark bands',w*.04,screen+band+22,{size:10,weight:600,spacing:'.5px'});
 }
}

function clockDial(ctx,cx,cy,r,angle,accent){
 ctx.save();ctx.shadowColor='rgba(20,30,50,.14)';ctx.shadowBlur=18;ctx.shadowOffsetY=6;ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.fillStyle='#fff';ctx.fill();ctx.restore();
 ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.strokeStyle='rgba(20,23,28,.14)';ctx.lineWidth=1;ctx.stroke();
 for(let i=0;i<12;i++){const a=i*TAU/12;trace(ctx,[[cx+Math.sin(a)*r*.78,cy-Math.cos(a)*r*.78],[cx+Math.sin(a)*r*.9,cy-Math.cos(a)*r*.9]]);ctx.strokeStyle='rgba(20,23,28,.45)';ctx.lineWidth=1.3;ctx.stroke();}
 ctx.lineCap='round';trace(ctx,[[cx,cy],[cx+Math.sin(angle)*r*.72,cy-Math.cos(angle)*r*.72]]);ctx.strokeStyle=accent;ctx.lineWidth=Math.max(2,r*.07);ctx.stroke();
 ctx.beginPath();ctx.arc(cx,cy,Math.max(2.5,r*.08),0,TAU);ctx.fillStyle=accent;ctx.fill();
}
// Coastlines as [longitude, latitude] pairs, simplified to about a degree; inland seas are drawn back as water.
const LAND=[
 [[-166,68],[-156,71],[-141,70],[-128,70],[-117,68.5],[-108,68],[-95,72],[-85,70],[-82,66],[-90,63.5],[-94,59],[-92,57],[-85,55],[-80,52],[-79,55],[-77,60],[-78,62.5],[-72,61],[-65,60],[-61,56],[-56,52],[-60,47],[-66,45],[-70,42],[-74,40.5],[-76,37],[-75.5,35],[-81,31.5],[-80,27],[-80.5,25.2],[-82,26.5],[-83,29.8],[-89,30.2],[-94,29.6],[-97.4,27.5],[-97.5,22],[-95.5,18.8],[-91,19],[-90.5,21],[-87,21.5],[-88,17],[-83.5,15],[-83.5,11],[-79.5,9],[-77.5,8.5],[-80,7.3],[-85.5,10],[-87.5,13],[-91.5,14],[-95,16],[-105.5,20],[-105.5,22.5],[-109,26.5],[-112.5,29.5],[-114.7,31.7],[-114,30],[-112,27.8],[-110,24],[-111,24.3],[-114,28],[-115.7,30.5],[-117.1,32.5],[-120.5,34.5],[-122.5,37.8],[-124.2,40.4],[-124,46],[-124.7,48.4],[-123,49],[-127,50.5],[-131,54],[-133,57],[-137.5,58.5],[-141,60],[-146,61],[-150,59.5],[-154,57.5],[-158,56.5],[-163,54.8],[-158,58.5],[-162,60],[-165,62],[-164.5,64.5],[-168,65.6]],
 [[-80,73.5],[-72,71],[-62,66.5],[-65,63],[-71,62.5],[-78,64.5],[-81,68],[-88,70]],
 [[-118,73],[-102,73],[-101,69],[-117,69]],
 [[-90,77],[-80,76.5],[-63,82],[-80,83],[-92,81]],
 [[-73,78],[-60,82],[-35,83.5],[-20,82],[-18,77],[-22,70.5],[-32,68],[-40,65],[-43,60],[-48,61],[-52,65],[-54,69.5],[-58,75.5],[-66,76.5]],
 [[-22.7,64],[-21.9,65.4],[-22.4,66.4],[-16,66.5],[-14.5,65.8],[-13.6,65],[-14.9,64.3],[-18.7,63.4],[-21,63.8]],
 [[-77.5,8.5],[-75.5,10.8],[-71.5,12.4],[-68,10.6],[-62,10.7],[-60,8.5],[-57,6],[-52,5],[-50,1.8],[-48.5,-1],[-44,-2.5],[-39,-3.5],[-35,-5.5],[-35,-9],[-38.5,-13],[-39,-17.8],[-40.5,-22],[-44.5,-23.2],[-48.5,-26],[-49,-28.6],[-53,-33.5],[-58.5,-34.5],[-57,-36.5],[-58,-38.5],[-62,-39],[-65,-41],[-64,-42.5],[-67.5,-46],[-66,-47.8],[-69,-50.5],[-68.5,-52.5],[-71,-54],[-74.5,-52],[-75.5,-47],[-73.5,-42],[-73.5,-37],[-71.5,-32],[-71.3,-28],[-70.3,-18.5],[-75,-15.3],[-79,-8],[-81.2,-5.5],[-80,-2],[-80,1],[-78.8,1.8],[-77.5,4],[-77.3,7]],
 [[-9.5,43],[-8.8,37],[-6,36.2],[-2,36.7],[.2,38.8],[3.2,41.9],[4,43.5],[7.5,43.8],[10,44],[12.3,41.7],[15.7,38],[16.6,39],[18.5,40.1],[16,41.9],[12.4,44.5],[12.3,45.4],[13.7,45.6],[15.5,43.5],[19.5,42],[19.4,40.2],[21,38],[22.8,36.5],[24,38.2],[23,40.5],[26.2,40.8],[26.2,40],[27,38.5],[28,36.7],[32,36.1],[36,36.6],[35.9,34.5],[34.5,31.5],[34.9,29.5],[36.9,25.5],[39,21.5],[42.8,16],[43.4,12.7],[45,12.8],[49,14.1],[52.2,15.6],[55.5,17.8],[57.8,19],[59.8,22.5],[58.5,23.6],[56.4,24.9],[56.3,26.3],[55.5,25.5],[54,24.2],[51.6,24.3],[51.2,26.1],[50.1,26.2],[48.5,28.5],[48,30],[50.2,30.2],[51.5,27.9],[54.5,26.6],[56.5,27.1],[57.3,25.7],[61.5,25.2],[66.5,25.4],[67.5,24],[70,21],[72.8,21.5],[73,19],[74.9,13.5],[76.5,8.6],[77.6,8.1],[78.3,9],[80.3,13.3],[80.2,15.8],[83.3,17.6],[86.9,20.8],[88.5,21.7],[91.8,22.4],[92.6,21],[94.3,16],[97.5,16.8],[98.5,13],[98.3,8.5],[100.2,5.6],[101.4,2.8],[103.5,1.3],[104.2,1.6],[103.4,4.2],[102.4,6.2],[100.3,8.4],[99.2,10.8],[100.5,13.5],[102.5,12],[105,8.6],[106.8,10.4],[109.2,11.6],[108.8,15.5],[106.6,17.5],[105.7,19],[107.5,21.5],[109.7,21.5],[110.3,20.3],[113.5,22.2],[117,23.5],[119.6,26],[121.9,30.8],[120.5,33.5],[119.2,35],[122.5,37],[118,38],[117.8,39.2],[121.5,40.9],[121.3,39],[124.3,39.9],[126.5,37.5],[126.5,34.5],[129.3,35.2],[129.5,37],[128,39.5],[129.7,41],[131,42.6],[135.5,43.8],[140.5,48.5],[141.4,52.2],[137,54],[135.3,54.8],[141,59],[149,59.4],[155,59.4],[157,57.8],[156.5,51],[158.5,52.8],[162,56.2],[163.5,59.9],[170,60],[179,62.3],[180,65],[190,66],[185,67.5],[180,69],[170,70],[161,69.5],[150,71.5],[140,72.5],[130,71],[127,73.5],[113,73.7],[106,77],[100,79.5],[95,76],[88,75.5],[80,73.5],[73,73],[69,73],[69,68.5],[60,69.8],[54,68.3],[44,68.4],[43.5,66.3],[40,66.4],[36.5,64.5],[34.7,66],[32.5,67],[41,67.8],[38,69],[33,69.4],[28,71],[23,70.6],[18.5,69.8],[14.5,67.9],[12.5,65.5],[10,64],[5.1,62],[5,59.5],[6.5,58],[8,58],[10.6,59.4],[11.5,58.3],[12.7,56],[14.3,55.6],[16.4,56.6],[18,59.2],[17.5,61],[21.3,64.5],[25.3,65.6],[22.5,63],[21.3,61],[21.5,60.6],[25,60.2],[28.5,60.5],[24,59.3],[23.5,58.4],[21.1,57],[21.3,55.2],[19.8,54.4],[18.4,54.8],[14.5,53.9],[12.5,54.4],[10.9,54],[9.9,54.8],[10.5,57.5],[8.6,57.1],[8.1,55.5],[8.6,53.9],[5,53.4],[4.2,52],[3.3,51.3],[1.6,50.9],[-1.4,49.6],[-1.9,48.7],[-4.7,48.4],[-2.2,47.2],[-1.2,46],[-1.5,43.5],[-4,43.5],[-8,43.7],[-9.3,43.1]],
 [[-5.7,50],[1.4,51.2],[1.7,52.7],[0,53.5],[-1.6,55.5],[-2,57.6],[-3,58.6],[-5,58.6],[-6.2,57.5],[-5.6,55.3],[-3,54.9],[-3.2,53.4],[-4.6,53.3],[-4.2,52.3],[-5.3,51.7],[-3.2,51.4]],
 [[-6,52.2],[-6.2,54],[-5.5,54.9],[-7.3,55.3],[-10,54.2],[-9.8,52.1],[-8.4,51.6]],
 [[-17,21],[-16.5,24],[-13,27.7],[-9.8,29.8],[-9.6,32.5],[-6.8,34],[-5.9,35.8],[-2,35.1],[3,36.8],[9.8,37.3],[11,36.9],[10.2,34.3],[11.5,33.1],[15.2,32.3],[19.5,30.3],[20.1,32.3],[23.5,32.4],[25.2,31.6],[29.5,31],[32.3,31.3],[34.2,31.2],[34.9,29.5],[34.2,27.8],[32.6,29.9],[33.6,27.3],[35.5,23.9],[37.2,21],[38.5,18],[39.7,15.1],[42.4,12.5],[43.4,11.6],[44.5,10.4],[47.5,11.2],[51.2,11.8],[51,10.4],[49.8,7],[47.9,4.5],[43.6,.6],[40.9,-2.1],[39.2,-4.7],[39.7,-7.9],[40.5,-10.5],[40.6,-15.5],[37,-17.9],[35.4,-22.1],[35.5,-24],[32.8,-25.8],[32.4,-28.6],[30,-31.3],[27.5,-33.5],[25.6,-34],[22,-34.2],[20,-34.8],[18.4,-34.2],[17.9,-31.5],[15.2,-27],[14.5,-22.9],[11.8,-17.3],[12.3,-13.5],[13.6,-11.5],[13.2,-8.8],[12.2,-6],[9.4,-1.5],[9.8,2.8],[9.7,3.8],[8.5,4.5],[6,4.3],[4.5,6.3],[2,6.3],[-2,4.8],[-4,5.2],[-7.5,4.4],[-9.7,5.6],[-11.4,6.9],[-13.2,8.9],[-15,10.9],[-16.8,13],[-17.5,14.7],[-16.3,19]],
 [[49.3,-12],[50.5,-15.5],[49.8,-17],[47.1,-24.9],[45.2,-25.5],[43.7,-22.6],[43.3,-21],[44.3,-16.8],[46.3,-15.7],[48,-13.7]],
 [[79.8,6.1],[80.3,9.8],[81.9,7.4],[81.2,6.2]],
 [[95.3,5.6],[97.5,5.2],[100.4,2.3],[103.7,-1],[106,-3.2],[105.8,-5.8],[104.5,-5.9],[102.3,-4],[100.5,-1.2],[98.7,1.7],[96,4.2]],
 [[105.2,-6.8],[108.5,-6.4],[111,-6.4],[114.5,-7.8],[114.4,-8.7],[111,-8.2],[108.3,-7.8],[106,-7.4]],
 [[109,1.9],[110.4,1.7],[113,3.2],[115.4,5],[117,7],[119.2,5.2],[118.2,4.3],[117.8,1.8],[116.5,-1.6],[116,-3.9],[114.5,-3.9],[111.4,-3.2],[110.2,-1.7],[109,.4]],
 [[119.5,-5.5],[120.5,-2.5],[121,1.2],[124.8,1.5],[121.5,-.8],[123.3,-4.8],[121,-3],[120.5,-5.6]],
 [[131,-1.2],[134,-.9],[137.8,-1.5],[141,-2.6],[145.7,-4.8],[147.6,-6.1],[148,-8.1],[150.8,-10.3],[147,-10.1],[144,-7.8],[141,-9.1],[138.5,-8.3],[137.8,-5.5],[134.5,-4],[132,-2.9]],
 [[120.6,18.5],[122.3,18.3],[122,16.2],[124,13],[121.5,13.7],[120,14.8],[119.9,16.4]],
 [[122,7],[126.6,7.3],[125.4,9.8],[123.8,8.5]],
 [[120.2,22.7],[121,25.3],[121.9,24.6],[120.8,21.9]],
 [[130,31.3],[131.5,31.5],[132,33.8],[135,33.5],[137,34.6],[139.8,35],[141,37],[142,39.5],[141.5,41.4],[140,40.5],[139.5,38],[136.8,37.2],[133,35.5],[130.9,34.2],[129.6,33.2]],
 [[140,41.5],[141.7,42.6],[145.5,43.3],[143,44.5],[141.7,45.4],[141.3,43.3],[140.3,42.6]],
 [[113.5,-22.5],[114.1,-26],[115,-34.2],[117.9,-35.1],[123.5,-33.9],[126,-32.3],[131,-31.5],[134.5,-32.7],[137.8,-35.6],[138.5,-34.8],[140,-37.5],[143.5,-38.8],[146.3,-39.1],[150,-37.5],[151.3,-33.8],[153.6,-28.2],[153,-25.3],[150.8,-22.5],[146.3,-19],[145.4,-15],[143.5,-14],[142.5,-10.7],[141.6,-12.9],[141.5,-16.5],[139.3,-17.4],[135.9,-15],[136.7,-12.2],[132.6,-11.5],[130.1,-13.2],[129.3,-15],[127,-14],[125,-14.5],[122.2,-17.2],[121,-19.6],[117,-20.6],[114.2,-21.9]],
 [[144.6,-40.7],[148.3,-40.9],[148,-43.2],[146,-43.6],[145.2,-42.2]],
 [[172.7,-34.4],[174.6,-36.2],[178.5,-37.7],[177,-39.6],[175.2,-41.5],[174.6,-39.9],[173.8,-39.1],[174.4,-37]],
 [[172.7,-40.5],[174.3,-41.7],[173.2,-43.4],[171.2,-44.4],[169,-46.6],[166.5,-46],[166.6,-45.2],[168.5,-44],[171.1,-42.3]],
 [...Array.from({length:37},(_,i)=>{const lon=-180+i*10;return [lon,-70+3*Math.sin(lon*.05)+(lon>-75&&lon<-55?6:0)];}),[180,-90],[-180,-90]],
];
const SEAS=[
 [[28,41.6],[28.6,43.5],[30.7,46.5],[33,45.8],[32.5,45.3],[33.5,44.5],[36.5,45.2],[38.2,46.6],[39.5,47.2],[37.7,44.6],[41.6,41.6],[36.7,41.3],[35,42],[31.5,41.2],[29,41.2]],
 [[47,44.5],[49,46.5],[51.5,47],[53,45],[51.3,44.5],[52.8,41.5],[54,39],[53.9,37.3],[50.3,37.4],[49,38.5],[49.5,40.3],[47.5,42.9]],
];
const ICE=new Set([4,LAND.length-1]);
const earthCache=new Map();
// A globe in orthographic projection, centred on the given latitude and longitude; cached per size and view.
function earthImage(r,lat,lon){
 const key=`${Math.round(r)}|${lat}|${lon}`;if(earthCache.has(key))return earthCache.get(key);
 const size=Math.ceil(2*r+4), c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d'), o=size/2;
 const p0=lat*Math.PI/180, l0=lon*Math.PI/180;
 const proj=([lo,la])=>{const p=la*Math.PI/180, l=lo*Math.PI/180-l0, x=Math.cos(p)*Math.sin(l), y=Math.cos(p0)*Math.sin(p)-Math.sin(p0)*Math.cos(p)*Math.cos(l), z=Math.sin(p0)*Math.sin(p)+Math.cos(p0)*Math.cos(p)*Math.cos(l);
  // Points on the far side are pushed to the rim so shapes crossing the edge stay closed.
  if(z<0){const k=Math.hypot(x,y)||1;return [o+x/k*r,o-y/k*r];}return [o+x*r,o-y*r];};
 const sea=g.createRadialGradient(o-r*.35,o-r*.35,r*.1,o,o,r);sea.addColorStop(0,'#6fb2ee');sea.addColorStop(.6,'#2b6cc4');sea.addColorStop(1,'#163a7a');
 g.beginPath();g.arc(o,o,r,0,TAU);g.fillStyle=sea;g.fill();g.save();g.clip();
 const visible=([lo,la])=>{const p=la*Math.PI/180, l=lo*Math.PI/180-l0;return Math.sin(p0)*Math.sin(p)+Math.cos(p0)*Math.cos(p)*Math.cos(l)>0;};
 const fill=(poly,color)=>{if(!poly.some(visible))return;const pts=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];
   const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/3));for(let k=0;k<n;k++)pts.push(proj([a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n]));}
  g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fillStyle=color;g.fill();};
 // Antarctica wraps the pole, so it is drawn only when the view looks from the south.
 LAND.forEach((poly,i)=>{if(i===LAND.length-1&&lat>=0)return;fill(poly,ICE.has(i)?'#eef2f4':'#6f9a58');});
 SEAS.forEach(poly=>fill(poly,'#3577cf'));
 const shade=g.createRadialGradient(o-r*.4,o-r*.4,r*.2,o,o,r*1.02);shade.addColorStop(0,'rgba(255,255,255,.12)');shade.addColorStop(.7,'rgba(10,20,40,0)');shade.addColorStop(1,'rgba(10,20,40,.35)');
 g.fillStyle=shade;g.fillRect(0,0,size,size);g.restore();
 earthCache.set(key,c);return c;
}
function drawEarth(ctx,x,y,r,{lat=20,lon=10}={}){
 const air=ctx.createRadialGradient(x,y,r*.9,x,y,r*1.5);air.addColorStop(0,'rgba(120,180,255,.35)');air.addColorStop(1,'rgba(120,180,255,0)');ctx.fillStyle=air;ctx.beginPath();ctx.arc(x,y,r*1.5,0,TAU);ctx.fill();
 const img=earthImage(r,lat,lon);ctx.drawImage(img,x-img.width/2,y-img.height/2);
 const night=ctx.createLinearGradient(x-r,0,x+r,0);night.addColorStop(.55,'rgba(10,20,40,0)');night.addColorStop(1,'rgba(10,20,40,.3)');
 ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.clip();ctx.fillStyle=night;ctx.fillRect(x-r,y-r,2*r,2*r);ctx.restore();
}
function drawRocket(ctx,x,y,size,dir,thrust,t){
 ctx.save();ctx.translate(x,y);ctx.scale(dir,1);
 if(thrust){const f=.7+.3*Math.sin(t*40)*Math.sin(t*23);const flame=ctx.createLinearGradient(-size*1.9,0,-size*.9,0);flame.addColorStop(0,'rgba(255,170,60,0)');flame.addColorStop(1,'rgba(255,140,40,.9)');
  ctx.beginPath();ctx.moveTo(-size*.9,-size*.22);ctx.quadraticCurveTo(-size*(1.3+.6*f),0,-size*.9,size*.22);ctx.closePath();ctx.fillStyle=flame;ctx.fill();}
 ctx.beginPath();ctx.moveTo(size,0);ctx.quadraticCurveTo(size*.55,-size*.36,-size*.9,-size*.3);ctx.lineTo(-size*.9,size*.3);ctx.quadraticCurveTo(size*.55,size*.36,size,0);ctx.closePath();
 const hull=ctx.createLinearGradient(0,-size*.35,0,size*.35);hull.addColorStop(0,'#ffffff');hull.addColorStop(1,'#cfd6e0');ctx.fillStyle=hull;ctx.fill();ctx.strokeStyle='rgba(20,23,28,.35)';ctx.lineWidth=1;ctx.stroke();
 ctx.beginPath();ctx.moveTo(-size*.55,-size*.3);ctx.lineTo(-size*.95,-size*.62);ctx.lineTo(-size*.9,-size*.3);ctx.closePath();ctx.fillStyle='#e04f2c';ctx.fill();
 ctx.beginPath();ctx.moveTo(-size*.55,size*.3);ctx.lineTo(-size*.95,size*.62);ctx.lineTo(-size*.9,size*.3);ctx.closePath();ctx.fill();
 ctx.beginPath();ctx.arc(size*.35,0,size*.13,0,TAU);ctx.fillStyle='#5aa9ff';ctx.fill();ctx.strokeStyle='rgba(20,23,28,.4)';ctx.stroke();
 ctx.restore();
}
function drawTwinTrip(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.blue, v=Physics.speed(st.mass), g=Physics.gamma(v), T=Physics.turnaround(st.distance), H=2*T, small=w<520;
 // The trip runs once per chapter and then waits at the reunion.
 const tc=Math.min(H,(st.since??st.t)*.42*Math.max(1,H/4.8)), leg=tc<=T?tc/T:(H-tc)/T, moving=v>.001&&tc>0&&tc<H;
 const xE=w*(small?.16:.14), xS=w*(small?.86:.84), yTrip=h*(st.labels&&small?.33:.24), r=Math.min(w,h)*.055;
 // The route, Earth and the destination star.
 ctx.setLineDash([3,6]);trace(ctx,[[xE+r*1.3,yTrip],[xS-r*1.1,yTrip]]);ctx.strokeStyle='rgba(20,23,28,.2)';ctx.lineWidth=1.2;ctx.stroke();ctx.setLineDash([]);
 drawEarth(ctx,xE,yTrip,r);drawStar(ctx,xS,yTrip,r*.75,v>.001?1:.35);
 const rx=v>.001?xE+r*1.9+(xS-xE-r*3.7)*leg:xE+r*1.9, ry=yTrip-(v>.001?0:r*1.2);
 drawRocket(ctx,rx,ry,r*.75,tc<=T?1:-1,moving,st.t);
 // Ages: two bars that grow with each twin's own time; the gap between them is the whole story.
 const x0=w*(small?.4:.3), x1=w*(small?.82:.74), full=x1-x0, bh=small?14:18, rows=[[tc,'#14171c','Home twin',h*(small?.66:.62)],[tc/g,accent,'Traveller',h*(small?.8:.76)]];
 // A small clock (one turn per year of that twin's own time) and one notch per birthday.
 const cr=bh*.95;
 for(const [years,color,name,y] of rows){
  ctx.fillStyle='rgba(20,23,28,.07)';ctx.beginPath();ctx.roundRect(x0,y-bh/2,full,bh,bh/2);ctx.fill();
  if(years>0){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x0,y-bh/2,Math.max(bh,full*years/H),bh,bh/2);ctx.fill();}
  for(let i=1;i<H-1e-9;i++){const x=x0+full*i/H;trace(ctx,[[x,y-bh/2],[x,y+bh/2]]);ctx.strokeStyle=i<=years?'rgba(255,255,255,.85)':'rgba(20,23,28,.12)';ctx.lineWidth=1.5;ctx.stroke();}
  clockDial(ctx,x0-cr-12,y,cr,years*TAU,color);
  if(st.labels){text(ctx,name,x0-2*cr-24,y,{align:'right',size:small?11:13,weight:600,color:color==='#14171c'?'rgba(20,23,28,.8)':accent});
   text(ctx,`${years.toFixed(1)} yr`,x0+Math.max(bh,full*years/H)+10,y,{size:small?11:12,weight:600,color:'rgba(20,23,28,.7)'});}
 }
 if(st.labels){
  text(ctx,'EARTH',xE,yTrip+r*1.9,{align:'center',size:10,weight:600,spacing:'1.5px'});
  text(ctx,'STAR',xS,yTrip+r*1.9,{align:'center',size:10,weight:600,spacing:'1.5px'});
  if(tc>=H-1e-6&&v>.001)pill(ctx,`traveller: ${(H-H/g).toFixed(1)} years younger`,w/2,h*(small?.93:.9),{align:'center',size:small?11:13,weight:600});
 }
}

// Twin paths: one layout shared by drawing and dragging, so the handle sits exactly on the turnaround.
function pathsLayout(w,h,st){
 // Previews (no labels) use the wide layout with small margins, whatever their size.
 const small=w<520&&st.labels!==false, v=Physics.speed(st.mass), T=Physics.turnaround(st.distance), H=2*T, Hmax=2*Physics.turnaround(2.5);
 const top=st.labels===false?12:small?104:64, bottom=h*(small?.58:.74), k=Math.min((bottom-top)/Hmax,(w*(small?.62:.32))/(.9*Hmax/2+.6));
 const x0=w*(small?.2:.14), map=(x,t)=>[x0+x*k,bottom-t*k];
 return {small,v,T,H,k,x0,top,bottom,map,kink:map(v*T,T)};
}
// Why a moving clock ticks slowly: light crosses a light clock at the same speed for everyone, so on the moving
// rocket (seen from Earth) it must zigzag farther between the mirrors and each tick takes longer.
function drawLightClocks(ctx,w,h,spec,st,{vplan}={}){
 const accent=ACCENT[spec.accent]||ACCENT.blue, dark='#14171c', light='#d97706', small=w<520, v=Physics.speed(st.mass), since=Math.max(0,(st.since??st.t)-1);
 const L=small?h*.13:Math.min(h*.24,130), lanes=small?[h*.33,h*.7]:[h*.3,h*.7], xa=w*(small?.16:.12), xb=w*(small?.9:.88);
 // Light's speed on screen is chosen so the rocket crosses the stage about once per chapter: its slanted trail stays visible.
 const ch=timeline?.chapters?.[st.stage], span=ch?Math.max(6,ch.end-ch.start+1):18;
 const c=Math.min(L/1.1,(xb-xa)/(Math.max(vplan??Physics.speed(spec.mass),.2)*span)), slow=1/Physics.lightTick(v), moving=v>.01;
 const bounce=y=>{const f=((y%2)+2)%2;return f<1?f:2-f;}, step=L/c/5;
 const mirrors=(x,y0)=>{ctx.lineCap='round';for(const y of [y0-L/2,y0+L/2]){trace(ctx,[[x-18,y],[x+18,y]]);ctx.strokeStyle='rgba(20,23,28,.7)';ctx.lineWidth=3;ctx.stroke();}};
 const photon=(x,y)=>{const glow=ctx.createRadialGradient(x,y,0,x,y,12);glow.addColorStop(0,rgba(light,.5));glow.addColorStop(1,rgba(light,0));ctx.fillStyle=glow;ctx.fillRect(x-12,y-12,24,24);
  ctx.beginPath();ctx.arc(x,y,4,0,TAU);ctx.fillStyle=light;ctx.fill();};
 const dots=pts=>{ctx.fillStyle=rgba(light,.65);for(const [x,y] of pts){ctx.beginPath();ctx.arc(x,y,1.9,0,TAU);ctx.fill();}};
 const path=pts=>{trace(ctx,pts);ctx.setLineDash([3,4]);ctx.strokeStyle=rgba(light,.5);ctx.lineWidth=1.4;ctx.stroke();ctx.setLineDash([]);};
 // Earth clock: light goes straight up and down. Dots mark equal steps of time along its path.
 const homeTicks=since*c/L, ey=lanes[0];
 path([[xa,ey+L/2],[xa,ey-L/2]]);dots(Array.from({length:6},(_,k)=>[xa,ey-L/2+k*L/5]));
 drawEarth(ctx,xa,ey+L/2+(small?16:22),small?9:12);mirrors(xa,ey);photon(xa,ey+L/2-bounce(homeTicks)*L);
 // Rocket clock: it moves right at v; its light keeps light speed, so it climbs only at sqrt(1 - v^2) of it and
 // needs more equal time steps per crossing. A viewer pushing the speed past the plan sees the rocket start again at the left.
 const ry=lanes[1], lap=(xb-xa)/(Math.max(v,.01)*c), s0=moving?Math.floor(since/lap)*lap:0, x=xa+v*c*(since-s0), rocketTicks=since*c*slow/L;
 const at=t=>[xa+v*c*(t-s0),ry+L/2-bounce(t*c*slow/L)*L];
 if(moving){path(Array.from({length:161},(_,i)=>at(s0+(since-s0)*i/160)));dots(Array.from({length:Math.floor((since-s0)/step)+1},(_,k)=>at(s0+k*step)));}
 else{path([[xa,ry+L/2],[xa,ry-L/2]]);dots(Array.from({length:6},(_,k)=>[xa,ry-L/2+k*L/5]));}
 drawRocket(ctx,x,ry+L/2+(small?16:22),small?12:16,1,moving,st.t);mirrors(x,ry);photon(...at(since));
 if(!st.labels)return;
 const size=small?11:13, note=small?10:12, ticks=n=>`${n} tick${n===1?'':'s'}`;
 text(ctx,`Earth: ${ticks(Math.floor(homeTicks))}`,xa+40,ey-L/2+4,{size,weight:600,color:dark});
 const head=`Rocket: ${ticks(Math.floor(rocketTicks))}`;
 text(ctx,head,xa,ry-L/2-(small?34:42),{size,weight:600,color:accent});
 
 if(moving&&since>6)pill(ctx,`${Math.round(slow*10)} ticks to Earth’s 10`,w/2,small?h*.94:h*.9,{align:'center',size:small?11:13,weight:600});
}

function drawPaths(ctx,w,h,spec,st){
 if(st.stage===1&&st.labels!==false)return drawLightClocks(ctx,w,h,spec,st,{vplan:Physics.speed(spec.mass)});
 const accent=ACCENT[spec.accent]||ACCENT.blue, L=pathsLayout(w,h,st), {small,v,T,H,map,x0,bottom}=L, g=Physics.gamma(v);
 // The trip plays once per chapter, in step with Earth time, then waits at the reunion.
 const tc=st.stage===3?H:Math.min(H,(st.since??st.t)*.5*Math.max(1,H/5)), xAt=t=>t<=T?v*t:v*(H-t), own=Math.min(tc,H)/g;
 // Light from the goodbye: its path has zero length, the edge no clock can cross.
 const reach=Math.min(H,(w*(small?.75:.46)-x0)/L.k);
 ctx.setLineDash([2,5]);trace(ctx,[map(0,0),map(reach,reach)]);ctx.strokeStyle=rgba('#d97706',.6);ctx.lineWidth=1.2;ctx.stroke();ctx.setLineDash([]);
 // Home path: straight up. Traveller path: out to the turnaround and back.
 ctx.lineCap='round';ctx.lineJoin='round';
 trace(ctx,[map(0,0),map(0,H)]);ctx.strokeStyle='rgba(20,23,28,.55)';ctx.lineWidth=2.4;ctx.stroke();
 if(v>.001){trace(ctx,[map(0,0),L.kink,map(0,H)]);ctx.strokeStyle=accent;ctx.lineWidth=2.6;ctx.stroke();}
 // One dot per year of each twin's own time; the traveller's sit farther apart on paper because fewer fit.
 for(let s=1;s<=H+1e-9;s++){const [x,y]=map(0,s);ctx.beginPath();ctx.arc(x,y,s<=tc+1e-9?4.5:3,0,TAU);ctx.fillStyle=s<=tc+1e-9?'#14171c':'rgba(20,23,28,.25)';ctx.fill();}
 if(v>.001)for(let s=1;s*g<=H+1e-9;s++){const t=s*g,[x,y]=map(xAt(t),t);ctx.beginPath();ctx.arc(x,y,s<=own+1e-9?4.5:3,0,TAU);ctx.fillStyle=s<=own+1e-9?accent:rgba(accent,.3);ctx.fill();}
 const [hx,hy]=map(0,tc),[tx,ty]=map(xAt(tc),tc);
 for(const [x,y,c] of [[hx,hy,'#14171c'],[tx,ty,accent]]){const glow=ctx.createRadialGradient(x,y,0,x,y,16);glow.addColorStop(0,rgba(c,.32));glow.addColorStop(1,rgba(c,0));ctx.fillStyle=glow;ctx.fillRect(x-16,y-16,32,32);
  ctx.beginPath();ctx.arc(x,y,6,0,TAU);ctx.fillStyle=c;ctx.fill();ctx.beginPath();ctx.arc(x,y,2.2,0,TAU);ctx.fillStyle='#fff';ctx.fill();}
 // The turnaround is a handle: drag it to change the speed (sideways) and the trip (up).
 if(spec.controls!=='none'&&st.stage>0){const [kx,ky]=L.kink;ctx.beginPath();ctx.arc(kx,ky,11,0,TAU);ctx.fillStyle='rgba(255,255,255,.9)';ctx.fill();ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.stroke();
  ctx.beginPath();ctx.arc(kx,ky,3.5,0,TAU);ctx.fillStyle=accent;ctx.fill();}
 // The same trip seen as ordinary space: Earth under the home path, the star under the turnaround.
 const sy=h*(small?.665:.85), r=small?10:14;
 trace(ctx,[[x0,sy],[map(v*T,0)[0],sy]]);ctx.setLineDash([3,6]);ctx.strokeStyle='rgba(20,23,28,.2)';ctx.lineWidth=1.2;ctx.stroke();ctx.setLineDash([]);
 ctx.setLineDash([2,4]);trace(ctx,[[x0,bottom+6],[x0,sy-r-4]]);if(v>.001)trace(ctx,[[map(v*T,0)[0],bottom+6],[map(v*T,0)[0],sy-r-4]]);ctx.strokeStyle='rgba(20,23,28,.12)';ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);
 drawEarth(ctx,x0,sy,r);if(v>.001)drawStar(ctx,map(v*T,0)[0],sy,r*.8,1);
 if(v>.001&&tc>0&&tc<H)drawRocket(ctx,map(xAt(tc),0)[0],sy-r*1.3,r*.7,tc<=T?1:-1,true,st.t);
 if(!st.labels)return;
 const size=small?10:11, T2=n=>n.toFixed(1), leg=T/g;
 const intro=st.stage===0, ty0=(bottom+map(0,H)[1])/2;if(Math.abs(hy-ty0)>22)text(ctx,'time ↑',x0-14,ty0,{align:'right',size:10});
 text(ctx,'space →',x0+L.k*4.4,bottom+14,{size:10});
 if(intro)text(ctx,'goodbye',x0,bottom+14,{align:'center',size,weight:600,color:'rgba(20,23,28,.75)'});
 if(intro)text(ctx,'reunion',x0,map(0,H)[1]-14,{align:'center',size,weight:600,color:'rgba(20,23,28,.75)'});
 const [lx,ly]=map(Math.min(reach,H)*.82,Math.min(reach,H)*.82);if(intro)text(ctx,'light',lx+8,ly+4,{size:10,color:'rgba(180,83,9,.9)'});
 if(v>.001&&st.stage<=2&&tc<H-1e-6)pill(ctx,'turnaround',L.kink[0]+14,L.kink[1]+22,{size:10,weight:600,color:accent});
 text(ctx,'EARTH',x0,sy+r+12,{align:'center',size:9,weight:600,spacing:'1.5px'});
 const sx=map(v*T,0)[0], close=sx-x0<(small?90:150);
 if(v>.001)text(ctx,'STAR',close?sx+r+8:sx,close?sy:sy+r+12,{align:close?'left':'center',size:9,weight:600,spacing:'1px'});
 pill(ctx,`${T2(tc)} yr`,hx-14,hy,{align:'right',size,weight:600,color:'rgba(20,23,28,.85)'});
 if(v>.001&&tc>0)pill(ctx,`${T2(own)} yr`,tx+14,ty,{size,weight:600,color:accent});
 // Each twin's own clock so far: one dot per year on that twin's path.
 const px=small?w*.08:w*.56, right=small?w*.92:w*.93, py=small?h*.775:h*.3, lh=small?23:40, dark='rgba(20,23,28,.85)';
 
 
 

 if(tc>=H-1e-6&&v>.001)pill(ctx,`traveller: ${T2(H-H/g)} years younger`,small?w/2:(px+right)/2,small?h*.95:py+lh*3.3,{align:'center',size:small?11:13,weight:600});
}
function dragPaths(w,h,spec,st,x,y,grab){
 const L=pathsLayout(w,h,st);
 if(grab)return st.stage>0&&Math.hypot(x-L.kink[0],y-L.kink[1])<22;
 const t=Math.max(.1,(L.bottom-y)/L.k), xs=Math.max(0,(x-L.x0)/L.k);
 return {mass:Math.min(1,xs/t/.9),distance:Math.min(2.5,Math.max(1,t/1.6))};
}

// The river picture of a black hole. First a real river: it speeds up toward a waterfall, and a fish swims upstream at
// its own fixed speed; where the current matches that speed the fish holds still, and past it the fish is swept over.
// Then space around a black hole, pictured flowing inward the same way, with light as the swimmer. Both follow
// Physics.riverSwim: outward speed 1 through the flowing medium, inflow sqrt(rs/r). Fixed plan per chapter.
const RIVER={mode:'',re:1,rs:1};
const RIVER_K=.25;
function riverPlan(st){
 const c=timeline?.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since);
 const ch0=timeline?.chapters?.[0], first=ch0?ch0.end-ch0.start:12;
 if(st.since===undefined){const T=st.t||0;return {mode:'hole',rs:1,t:T,horizon:1,pulses:[{r0:1.8,from:T-3,ang:-.95},{r0:1,from:T-30,ang:0},{r0:.62,from:T-.8,ang:.75}]};}
 if(st.live){const rs=clamp(st.mass), re=.6+(st.distance-1);return {mode:'hole',rs,t,pulses:[{r0:re,every:2.6,label:true}],live:true};}
 // 1: one fish far from the falls gets away.
 if(st.stage===0)return {mode:'river',t,fish:[{r0:2.4,tau:t*RIVER_K,arrows:true}],line:0};
 // 2: it keeps going; a second fish holds still at the point of no return; a third, just past it, is swept over.
 if(st.stage===1)return {mode:'river',t,line:smooth((t-at(0)-.2)/.8),fish:[{r0:2.4,tau:(first+t)*RIVER_K,dim:true},
  {r0:1.2,tau:(t-at(0)-.2)*RIVER_K,show:smooth((t-at(0)-.2)/.6),arrows:true},{r0:.75,tau:(t-at(1)-.2)*RIVER_K,show:smooth((t-at(1)-.2)/.6),arrows:true,below:true}]};
 // 3: space around a black hole flows inward; light, far out, swims outward through it and gets away.
 const c2=timeline?.chapters?.[2], l2=c2?.lines||[], third=c2?c2.end-c2.start:15, from3=l2[1]?l2[1].start-c2.start-.4:6;
 if(st.stage===2)return {mode:'hole',rs:1,t,pulses:[{r0:2.3,from:from3,ang:-.95}]};
 // 4: at the horizon light holds still; just outside it escapes, slowly; inside it is carried in.
 if(st.stage===3)return {mode:'hole',rs:1,t,horizon:smooth((t-.4)/.8),pulses:[{r0:2.3,from:from3-third,ang:-.95,quiet:true},{r0:1,from:at(0)+.4,ang:0},{r0:1.35,from:at(1)+.2,ang:-.5},{r0:.62,from:at(1)+.2,ang:.75}]};
 // 5: inside, space flows in faster than light, yet light still moves through it at light speed.
 return {mode:'hole',rs:1,t,horizon:1,limit:smooth((t-at(0)-.6)/.8),pulses:[{r0:.75,from:at(0)+.2,ang:.75,slow:.5},{r0:1,from:-30,ang:0,quiet:true}]};
}
function drawFish(ctx,x,y,size,flap,alpha=1){
 // A small fish facing left, upstream: body, flapping tail and an eye.
 ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);const L=size, H=size*.44;
 ctx.fillStyle='#e07a2e';ctx.save();ctx.translate(L*.42,0);ctx.rotate(Math.sin(flap)*.4);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(L*.34,-H*.6);ctx.lineTo(L*.3,0);ctx.lineTo(L*.34,H*.6);ctx.closePath();ctx.fill();ctx.restore();
 ctx.beginPath();ctx.ellipse(0,0,L*.5,H*.5,0,0,TAU);ctx.fill();
 ctx.fillStyle='rgba(255,255,255,.95)';ctx.beginPath();ctx.arc(-L*.27,-H*.1,H*.16,0,TAU);ctx.fill();ctx.fillStyle='#14171c';ctx.beginPath();ctx.arc(-L*.3,-H*.1,H*.08,0,TAU);ctx.fill();
 ctx.restore();
}
// Two arrows above a swimmer: its own speed outward (gold) and the inflow carrying it in (blue).
function swimArrows(ctx,x,y,dir,own,flow,{small,labels,names}){
 const head=(x0,y0,dx,col)=>{const s=Math.sign(dx)||1;ctx.beginPath();ctx.moveTo(x0+dx,y0);ctx.lineTo(x0+dx-s*7,y0-4.5);ctx.lineTo(x0+dx-s*7,y0+4.5);ctx.closePath();ctx.fillStyle=col;ctx.fill();};
 const line=(x0,y0,dx,col)=>{trace(ctx,[[x0,y0],[x0+dx,y0]]);ctx.strokeStyle=col;ctx.lineWidth=2.4;ctx.stroke();head(x0,y0,dx,col);};
 const gold='#d97706', blue='#2563eb';
 line(x,y,dir*own,gold);line(x,y+11,-dir*Math.min(flow,own*2.6),blue);
 if(labels){const size=small?10:11;
  pill(ctx,names[0],x+dir*own+dir*6,y-1,{align:dir<0?'right':'left',size,weight:600,color:gold});
  pill(ctx,names[1],x-dir*Math.min(flow,own*2.6)-dir*6,y+12,{align:dir<0?'left':'right',size,weight:600,color:blue});}
}
function arrowLegend(ctx,x,y,names,small,dirs=[1,-1]){
 const size=small?10:12, gold='#d97706', blue='#2563eb', arrow=(x0,col,dir)=>{trace(ctx,[[x0,y],[x0+dir*18,y]]);ctx.strokeStyle=col;ctx.lineWidth=2.4;ctx.stroke();
  ctx.beginPath();ctx.moveTo(x0+dir*22,y);ctx.lineTo(x0+dir*15,y-4.5);ctx.lineTo(x0+dir*15,y+4.5);ctx.closePath();ctx.fillStyle=col;ctx.fill();};
 ctx.font=`600 ${size}px ${FONT}`;const w1=ctx.measureText(names[0]).width, w2=ctx.measureText(names[1]).width, gap=small?14:22, total=28+w1+gap+28+w2;
 let x0=x-total/2;arrow(dirs[0]>0?x0:x0+22,gold,dirs[0]);text(ctx,names[0],x0+28,y,{size,weight:600,color:gold});x0+=28+w1+gap;
 arrow(dirs[1]>0?x0:x0+22,blue,dirs[1]);text(ctx,names[1],x0+28,y,{size,weight:600,color:blue});
}
function drawRiver(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.gold, small=w<520, P=Physics, plan=riverPlan(st), lsize=small?10:12, warm='#c2410c';
 RIVER.mode=plan.mode;RIVER.live=!!plan.live;
 if(plan.mode==='river'){
  // Side view: the river runs left to right into a waterfall. r is the distance upstream from the edge.
  const R=small?3.3:4.2, rs=1.2, xe=w*(small?.84:.84), sx=(xe-w*(small?.03:.05))/R, X=r=>xe-r*sx;
  const yw=h*(small?.33:.34), yb=h*(small?.6:.62), tau=plan.t*RIVER_K, flow=r=>Math.sqrt(rs/Math.max(r,.05));
  const bank=ctx.createLinearGradient(0,yb,0,h);bank.addColorStop(0,'#a07a55');bank.addColorStop(1,'#7a5a3d');ctx.fillStyle=bank;ctx.fillRect(0,yb,xe,h-yb);
  ctx.fillStyle='#8a6a4a';ctx.fillRect(xe,yb,w-xe,h-yb);
  const water=ctx.createLinearGradient(0,yw,0,yb);water.addColorStop(0,'#7fb3e6');water.addColorStop(1,'#3f7fc4');ctx.fillStyle=water;ctx.fillRect(0,yw,xe,yb-yw);
  // The falls: the water sheet curves over the edge and drops.
  const fall=u=>[xe+u*w*(small?.1:.09),yw+u*u*(h-yw)*1.05];
  ctx.beginPath();ctx.moveTo(xe,yw);for(let i=1;i<=30;i++){const [x,y]=fall(i/30);ctx.lineTo(x,y);}
  for(let i=30;i>=0;i--){const [x,y]=fall(i/30);ctx.lineTo(x-w*.02*(1-i/30)*0,y+(yb-yw)*(1-i/30));}ctx.closePath();
  const sheet=ctx.createLinearGradient(xe,yw,xe,h);sheet.addColorStop(0,'#5d97d6');sheet.addColorStop(1,'rgba(220,235,250,.95)');ctx.fillStyle=sheet;ctx.fill();
  for(let i=0;i<14;i++){const u=hash(i*3.3), [fx,fy]=fall(.55+.45*hash(i*7.1));ctx.beginPath();ctx.arc(fx+u*20-10,Math.min(h-4,fy),3+5*hash(i*1.7),0,TAU);ctx.fillStyle='rgba(255,255,255,.55)';ctx.fill();}
  // The current: streaks carried along, faster near the edge.
  const span=(2/3)*(Math.pow(R,1.5)-Math.pow(.05,1.5))/Math.sqrt(rs);
  for(let i=0;i<46;i++){const lane=yw+(.15+.7*hash(i*5.7))*(yb-yw), ph=hash(i*2.3)*span, u=((tau+ph)%span+span)%span;
   const r=Math.pow(Math.max(0,Math.pow(R,1.5)-1.5*Math.sqrt(rs)*u),2/3);if(r<.06)continue;
   const len=Math.min(w*.06,6+10*flow(r));trace(ctx,[[X(r),lane],[X(r)-len,lane]]);ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=2;ctx.lineCap='round';ctx.stroke();}
  // The point of no return: where the current equals the fish's own speed.
  if(plan.line>0){ctx.globalAlpha=plan.line;trace(ctx,[[X(rs),yw-(small?34:44)],[X(rs),yb]]);ctx.strokeStyle=warm;ctx.lineWidth=1.6;ctx.setLineDash([5,5]);ctx.stroke();ctx.setLineDash([]);
   if(st.labels)pill(ctx,'point of no return',X(rs),yw-(small?44:56),{align:'center',size:lsize,weight:600,color:warm});ctx.globalAlpha=1;}
  if(st.labels){text(ctx,'WATERFALL',Math.min(w-8,xe+w*.05),h*.9,{align:small?'right':'center',size:lsize,weight:600,spacing:'1.5px',color:'rgba(255,255,255,.9)'});

   }
  // The fish: each swims upstream at the same speed through the water.
  plan.fish.forEach((f,i)=>{const show=f.show??1;if(show<=0)return;
   const m=P.riverSwim(f.r0,rs,Math.max(0,f.tau)), size=small?26:38, y=yw+(yb-yw)*[.3,.55,.8][i%3];
   let x=X(m.r), yy=y+Math.sin(st.t*2.2+i)*2, alpha=show*(f.dim?.55:1)*smooth((X(m.r)-8)/70);
   if(m.fell>=0){const u=Math.min(1,m.fell*RIVER_K*3.2), [fx,fy]=fall(.1+u*.9);x=fx;yy=fy;alpha*=1-smooth((u-.6)/.4);}
   if(alpha<=.01)return;
   drawFish(ctx,x,yy,size,st.t*9+i,alpha);
   if(f.arrows&&m.fell<0&&show>.6){ctx.globalAlpha=show;const own=small?30:48;
    swimArrows(ctx,x,f.below?yy+size*.62:yy-size*.75,-1,own,own*flow(m.r),{small,labels:false,names:[]});ctx.globalAlpha=1;}
   if(st.labels&&show>.6&&!f.dim){const drift=1-flow(m.r), note=m.fell>=0?'swept over':Math.abs(drift)<.01?'holds still':drift>0?'gets away':'swept along';
    pill(ctx,note,x+size*.8,yy,{size:lsize,weight:600,color:note==='gets away'?'#1f6f43':warm});}
  });
  if(st.labels)arrowLegend(ctx,w/2,h*(small?.08:.1),['swims','current'],small,[-1,1]);
  return;
 }
 // Top view of a black hole: space pictured flowing inward along spokes, faster closer in; light pulses swim outward.
 const rs=plan.rs, cx=w/2, cy=h*(small?.5:.53), rmax=3, k=Math.min(w*(small?.45:.4),h*(small?.41:.43))/rmax, tau=plan.t*RIVER_K;
 RIVER.rs=rs;
 const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,rmax*k);glow.addColorStop(0,`rgba(20,23,28,${.16*Math.min(1,rs)})`);glow.addColorStop(1,'rgba(20,23,28,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,cy,rmax*k,0,TAU);ctx.fill();
 // After playback the mass can be turned down to none: then there is no hole and no inflow, and light simply travels out.
 const hole=rs>=.01;
 if(hole){ctx.beginPath();ctx.arc(cx,cy,rs*k,0,TAU);const inner=ctx.createRadialGradient(cx,cy,0,cx,cy,rs*k);inner.addColorStop(0,'#05060a');inner.addColorStop(1,'#1b2233');ctx.fillStyle=inner;ctx.fill();
 const hz=plan.horizon??0;ctx.setLineDash([6,5]);ctx.strokeStyle=`rgba(217,119,6,${.6+.4*hz})`;ctx.lineWidth=2+1.5*hz;ctx.stroke();ctx.setLineDash([]);
 // Flowing space: dots on spokes, each carried inward at the local inflow speed, with a trail as long as its speed.
 const span=(2/3)*(Math.pow(rmax,1.5)-Math.pow(.06,1.5))/Math.sqrt(rs), spokes=small?12:16;
 for(let i=0;i<spokes;i++){const ang=i/spokes*TAU+.13;
  trace(ctx,[[cx+Math.cos(ang)*rmax*k,cy+Math.sin(ang)*rmax*k],[cx+Math.cos(ang)*.1*k,cy+Math.sin(ang)*.1*k]]);ctx.strokeStyle='rgba(37,99,235,.08)';ctx.lineWidth=1;ctx.stroke();
  for(let j=0;j<5;j++){const u=((tau+(j/5+hash(i*1.3)*.2)*span)%span+span)%span, r=Math.pow(Math.max(0,Math.pow(rmax,1.5)-1.5*Math.sqrt(rs)*u),2/3);if(r<.08)continue;
   const v=Math.sqrt(rs/r), len=Math.min(k*.5,k*.07*v), x=cx+Math.cos(ang)*r*k, y=cy+Math.sin(ang)*r*k, inside=r<rs;
   trace(ctx,[[x,y],[x+Math.cos(ang)*len,y+Math.sin(ang)*len]]);ctx.strokeStyle=inside?'rgba(180,200,255,.55)':'rgba(37,99,235,.45)';ctx.lineWidth=1.6;ctx.lineCap='round';ctx.stroke();
   ctx.beginPath();ctx.arc(x,y,2.2,0,TAU);ctx.fillStyle=inside?'rgba(200,215,255,.8)':'rgba(37,99,235,.75)';ctx.fill();}}}
 if(st.labels){if(hole)pill(ctx,'horizon',cx-rs*k-10,cy,{align:'right',size:lsize,weight:600,color:'rgba(180,83,9,.95)'});
 arrowLegend(ctx,w/2,h*(small?.1:.07),['light','space flows in'],small);}
 // Light pulses, each sent outward along its own direction.
 const states=[];
 plan.pulses.forEach((q,i)=>{
  const ang=plan.live?-.4:q.ang??0, start=q.from??0;
  // After playback the light is sent again every few seconds; the newest pulse carries the arrows.
  const draws=plan.live?Array.from({length:3},(_,n)=>plan.t%q.every+n*q.every):[plan.t-start];
  draws.forEach((age,n)=>{if(age<0)return;
   const m=P.riverSwim(q.r0,rs,age*RIVER_K*(q.slow||1)), r=m.r;if(m.fell>=0)return;if(r>rmax*1.02)return;
   const x=cx+Math.cos(ang)*r*k, y=cy+Math.sin(ang)*r*k, fade=Math.min(1,age/.4)*smooth((r-.06)/.12)*(n?.55:1);
   const g=ctx.createRadialGradient(x,y,0,x,y,14);g.addColorStop(0,`rgba(255,196,80,${.95*fade})`);g.addColorStop(1,'rgba(255,196,80,0)');ctx.fillStyle=g;ctx.fillRect(x-14,y-14,28,28);
   ctx.beginPath();ctx.arc(x,y,4,0,TAU);ctx.fillStyle=`rgba(255,250,235,${fade})`;ctx.fill();
   if(n===0)states.push({x,y,r,ang,q,i});
  });
 });
 RIVER.re=plan.pulses[0].r0;
 for(const s0 of states){const {x,y,r,q,ang}=s0, own=small?24:34, v=Math.sqrt(rs/Math.max(r,.05)), ux=Math.cos(ang), uy=Math.sin(ang), px=-uy*7, py=ux*7;
  // Along the light's own line: its own speed outward (gold) and the inflow carrying it in (blue).
  const ray=(x0,y0,len,dir,col)=>{const x1=x0+dir*ux*len, y1=y0+dir*uy*len;trace(ctx,[[x0,y0],[x1,y1]]);ctx.strokeStyle=col;ctx.lineWidth=2.4;ctx.stroke();
   ctx.beginPath();ctx.moveTo(x1+dir*ux*3,y1+dir*uy*3);ctx.lineTo(x1-dir*ux*5+px*.7,y1-dir*uy*5+py*.7);ctx.lineTo(x1-dir*ux*5-px*.7,y1-dir*uy*5-py*.7);ctx.closePath();ctx.fillStyle=col;ctx.fill();};
  if(q.quiet)continue;
  ray(x+px,y+py,own,1,'#d97706');if(v>.01)ray(x-px,y-py,Math.min(own*2.6,own*v),-1,'#2563eb');
  if(!st.labels)continue;
  const note=r<rs*.985?'carried in':Math.abs(r-rs)<.015*rs?'stands still':'escapes', inflow=Math.round(v*100);
  const lx=x+ux*(own+16)+(ux>=0?4:-4), ly=y+uy*(own+16), align=ux>=-.2?'left':'right';
  pill(ctx,note,lx,ly,{align,size:lsize,weight:700,color:note==='escapes'?'#1f6f43':warm});

 }
 // Inside the horizon: light still moves at light speed through space; it is the space that flows in faster.

}

// One toss, two views: from the ground (the ball arcs) and floating with the ball (the ground moves).
function viewsStage(st){
 const since=st.since??st.t, flight=x=>Math.min(1,(x*.16)%1.25);
 if(st.stage<=1)return {s:0,u:flight(since)};
 if(st.stage===2){const s=smooth((since-1.5)/3.5);return {s,u:since<5.5?0:flight(since-5.5)};}
 return {s:1,u:flight(since)};
}
function drawPerson(ctx,x,feet,size,color){
 ctx.strokeStyle=color;ctx.lineWidth=Math.max(2,size*.3);ctx.lineCap='round';ctx.lineJoin='round';
 trace(ctx,[[x-size*.4,feet],[x,feet-size*1.1],[x+size*.4,feet]]);ctx.stroke();
 trace(ctx,[[x,feet-size*1.1],[x,feet-size*2.2]]);ctx.stroke();
 trace(ctx,[[x-size*.7,feet-size*1.5],[x,feet-size*2],[x+size*.5,feet-size*2.6]]);ctx.stroke();
 ctx.beginPath();ctx.arc(x,feet-size*2.75,size*.45,0,TAU);ctx.fillStyle=color;ctx.fill();
}
function drawViews(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.blue, dark='#14171c', warm='#c2410c', small=w<520, V=Physics.views(st.mass,st.distance), full=Physics.views(1,st.distance), {s,u}=viewsStage(st), stage=st.stage;
 const apex=full.h(full.T/2), grav=Math.min(1,st.mass), tn=u*V.T, free=stage===0;
 // With no gravity the ball rises steadily; that chapter gets its own height scale so the whole straight path fits.
 const hi=free?Math.max(1.35*apex,1.08*V.h(V.T)):1.35*apex, lo=free?-.12*hi:-1.3*apex, top=free?hi*.92:apex*4/3;
 const M=small?{l:w*.3,r:w*.95,t:96,b:h*.8}:{l:w*.25,r:w*.88,t:70,b:h*.88};
 const X=t=>M.l+t/V.T*(M.r-M.l), Y=hh=>M.b-(hh-lo)/(hi-lo)*(M.b-M.t), shift=t=>s*V.h(t);
 ctx.save();ctx.beginPath();ctx.rect(M.l-10,M.t-6,M.r-M.l+20,M.b-M.t+12);ctx.clip();
 // The map: faint lines of equal height and of equal time. Changing the view bends them.
 for(let i=0;i<=4;i++){const hh=top*i/4;trace(ctx,Array.from({length:61},(_,j)=>{const t=V.T*j/60;return [X(t),Y(hh-shift(t))];}));ctx.strokeStyle='rgba(20,23,28,.08)';ctx.lineWidth=1;ctx.stroke();}
 for(let j=0;j<=8;j++){const t=V.T*j/8;trace(ctx,[[X(t),Y(-shift(t))],[X(t),Y(top-shift(t))]]);ctx.strokeStyle='rgba(20,23,28,.05)';ctx.lineWidth=1;ctx.stroke();}
 const path=f=>Array.from({length:81},(_,j)=>{const t=V.T*j/80;return [X(t),Y(f(t)-shift(t))];});
 ctx.lineCap='round';ctx.lineJoin='round';
 trace(ctx,path(()=>0));ctx.strokeStyle=dark;ctx.lineWidth=2.6;ctx.stroke();
 trace(ctx,path(V.h));ctx.strokeStyle=accent;ctx.lineWidth=2.8;ctx.stroke();
 for(const [hh,c] of [[-shift(tn),dark],[V.h(tn)-shift(tn),accent]]){const x=X(tn),y=Y(hh);ctx.beginPath();ctx.arc(x,y,6,0,TAU);ctx.fillStyle=c;ctx.fill();ctx.beginPath();ctx.arc(x,y,2.2,0,TAU);ctx.fillStyle='#fff';ctx.fill();}
 ctx.restore();
 // A ball that has left the chart is marked with an arrow at the top edge.
 if(Y(V.h(tn)-shift(tn))<M.t){let te=0;for(let j=1;j<=200;j++){const t=V.T*j/200;if(Y(V.h(t)-shift(t))<M.t){te=t;break;}}
  const ax=X(te);trace(ctx,[[ax,M.t+10],[ax,M.t-6]]);ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.stroke();trace(ctx,[[ax-4,M.t],[ax,M.t-6],[ax+4,M.t]]);ctx.stroke();}
 // Side view: the same moment as it looks. You stand on a scale; the ground pushes up through it.
 const sx=small?w*.14:w*.12, size=small?8:11, hand=Y(-shift(tn)), feet=hand+size*2.6, by=Y(V.h(tn)-shift(tn)), scaleH=grav>0?size*.55:0;
 ctx.save();ctx.beginPath();ctx.rect(sx-size*4.5,M.t-6,size*9,h-M.t);ctx.clip();
 if(grav>0){ctx.fillStyle='#e9e4da';ctx.strokeStyle='rgba(20,23,28,.45)';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(sx-size*1.3,feet,size*2.6,scaleH,3);ctx.fill();ctx.stroke();
  const g0=feet+scaleH, soil=ctx.createLinearGradient(0,g0,0,g0+size*5);soil.addColorStop(0,`rgba(122,84,52,${.32*grav})`);soil.addColorStop(1,'rgba(122,84,52,0)');ctx.fillStyle=soil;ctx.fillRect(sx-size*4,g0,size*8,size*5);
  trace(ctx,[[sx-size*4,g0],[sx+size*4,g0]]);ctx.strokeStyle=`rgba(122,84,52,${.8*grav})`;ctx.lineWidth=2;ctx.stroke();}
 drawPerson(ctx,sx,feet,size,dark);
 ctx.beginPath();ctx.arc(sx+size*.6,by-size*.6,size*.55,0,TAU);ctx.fillStyle=accent;ctx.fill();
 if(grav>0&&stage>=1){const g0=feet+scaleH,ay=g0+size*2.4;ctx.globalAlpha=grav;trace(ctx,[[sx,ay],[sx,g0+3]]);ctx.strokeStyle=warm;ctx.lineWidth=2.4;ctx.stroke();trace(ctx,[[sx-5,g0+9],[sx,g0+3],[sx+5,g0+9]]);ctx.stroke();ctx.globalAlpha=1;}
 ctx.restore();
 if(!st.labels)return;
 const size2=small?10:11, held=grav>.5&&u>=.999&&stage!==2;
 pill(ctx,stage===0?'far from any planet':s<.5?'from the ground':'from the ball',M.l,M.t-30,{size:small?11:13,weight:700,color:dark});
 text(ctx,'height ↑',M.l-10,M.t+6,{align:'right',size:10});text(ctx,'time →',M.r,M.b+14,{align:'right',size:10});
 if(grav>0&&stage>=1&&feet+scaleH+size*2<h-6)text(ctx,'push',sx+8,feet+scaleH+size*2,{size:10,weight:600,color:warm});
 if(!held&&by>M.t&&by<h-8)pill(ctx,'scale: 0',sx+size*1.6,by-size*.6,{size:10,weight:600,color:accent});
 if(stage>=3){const mid=V.T/2;
  pill(ctx,'straight',X(mid),Y(V.h(mid)-shift(mid))-16,{align:'center',size:size2,weight:600,color:accent});
  if(grav>.05)pill(ctx,'pushed',X(mid),Y(-shift(mid))+18,{align:'center',size:size2,weight:600,color:dark});
 }
}

// What curvature means: straight paths that start side by side come together or spread apart.
// Progress 0..1 of a motion that plays once per chapter, finishing at three quarters of it, then holds.
function onceInChapter(st,lead=.8){
 const c=timeline?.chapters?.[st.stage], span=c?Math.max(3,(c.end-c.start)*.75-lead):10;
 return clamp(((st.since??st.t)-lead)/span);
}
function drawTides(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.blue, dark='#14171c', warm='#c2410c', small=w<520, since=st.since??st.t, stage=st.stage, P=Physics.tides(Math.max(st.mass,1e-6));
 const dot=(x,y,r,c)=>{ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=c;ctx.fill();};
 if(stage===0){
  // A plain ball seen from a little above its middle; two walkers start side by side and walk straight ahead.
  const cx=w/2, cy=small?h*.46:h*.5, R=Math.min(small?w*.38:w*.24,small?h*.32:h*.4), tilt=.42;
  const G=(lat,lon)=>{const c=Math.cos(lat),x=c*Math.sin(lon),y=Math.sin(lat),z=c*Math.cos(lon);return [cx+R*x,cy-R*(y*Math.cos(tilt)-z*Math.sin(tilt)),y*Math.sin(tilt)+z*Math.cos(tilt)];};
  const sea=ctx.createRadialGradient(cx-R*.35,cy-R*.4,R*.1,cx,cy,R);sea.addColorStop(0,'#fdf9f1');sea.addColorStop(1,'#e8dcc6');ctx.beginPath();ctx.arc(cx,cy,R,0,TAU);ctx.fillStyle=sea;ctx.fill();ctx.strokeStyle='rgba(20,23,28,.18)';ctx.lineWidth=1;ctx.stroke();
  const arc=(f,n,style,width,dash)=>{let prev=null;for(let i=0;i<=n;i++){const p=f(i/n);if(prev&&p[2]>0&&prev[2]>0){trace(ctx,[prev,p]);ctx.strokeStyle=style;ctx.lineWidth=width;if(dash)ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}prev=p;}};
  for(let k=-5;k<=6;k++)arc(q=>G(-Math.PI/2+Math.PI*q,k*Math.PI/6),60,'rgba(20,23,28,.06)',1);
  for(let k=-2;k<=2;k++)arc(q=>G(k*Math.PI/6,TAU*q),120,k===0?'rgba(20,23,28,.25)':'rgba(20,23,28,.06)',k===0?1.3:1);
  const u=onceInChapter(st), lat=u*Math.PI/2*.999, lons=[-.35,.35];
  for(const lon of lons){arc(q=>G(Math.PI/2*q,lon),60,rgba(accent,.28),1.6,[3,4]);arc(q=>G(lat*q,lon),60,accent,2.8);}
  const a=G(lat,lons[0]),b=G(lat,lons[1]);trace(ctx,[a,b]);ctx.setLineDash([2,3]);ctx.strokeStyle=warm;ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);
  dot(...a.slice(0,2),6,accent);dot(...b.slice(0,2),6,accent);
  if(!st.labels)return;
  const gap=Math.sin(Math.acos(Math.sin(lat)**2+Math.cos(lat)**2*Math.cos(.7))/2)/Math.sin(.35);
  if(gap>.06)pill(ctx,'gap',(a[0]+b[0])/2,(a[1]+b[1])/2+16,{align:'center',size:small?10:11,weight:600,color:warm});
  else{const pole=G(Math.PI/2,0);pill(ctx,'they meet',pole[0],pole[1]-16,{align:'center',size:small?10:11,weight:600,color:warm});}
  return;
 }
 if(stage===1){
  // Two balls let go side by side, at rest, high above the Earth; beside them, their paths through time.
  const Re=small?h*.1:h*.14, ex=small?w*.24:w*.28, ey=small?h*.7:h*.8, r0=3, d=.3, tEnd=P.fallTime(r0,1.6), tt=tEnd*onceInChapter(st);
  drawEarth(ctx,ex,ey,Re);
  const gap=t=>{const [a,b]=[P.fall(-d,r0,t),P.fall(d,r0,t)];return Math.hypot(a[0]-b[0],a[1]-b[1]);};
  [-d,d].map(x=>P.fall(x,r0,tt)).forEach(([x,y])=>dot(ex+x*Re,ey-y*Re,5.5,accent));
  const D=small?{l:w*.5,r:w*.94,t:h*.24,b:h*.56}:{l:w*.5,r:w*.8,t:h*.3,b:h*.68}, mid=(D.t+D.b)/2, half=(D.b-D.t)*.32, Xt=t=>D.l+t/tEnd*(D.r-D.l);
  trace(ctx,[[D.l,D.t-6],[D.l,D.b+6]]);ctx.strokeStyle='rgba(20,23,28,.25)';ctx.lineWidth=1;ctx.stroke();
  for(const sgn of [-1,1]){trace(ctx,[[D.l,mid+sgn*half],[D.r,mid+sgn*half]]);ctx.setLineDash([3,4]);ctx.strokeStyle='rgba(20,23,28,.25)';ctx.lineWidth=1.2;ctx.stroke();ctx.setLineDash([]);
   const pts=Array.from({length:41},(_,i)=>{const t=tt*i/40;return [Xt(t),mid+sgn*half*gap(t)/(2*d)];});trace(ctx,pts);ctx.strokeStyle=accent;ctx.lineWidth=2.6;ctx.stroke();dot(...pts.at(-1),4.5,accent);}
  if(!st.labels)return;
  text(ctx,'their paths through time',(D.l+D.r)/2,D.t-26,{align:'center',size:small?10:12,weight:600,color:'rgba(20,23,28,.75)'});
  text(ctx,'time →',D.r,D.b+18,{align:'right',size:10});
  text(ctx,'dashed: far from any planet',D.r,mid-half-12,{align:'right',size:10,color:'rgba(20,23,28,.5)'});
  return;
 }
 if(stage===2){
  // A ring of balls let go all around the Earth shrinks; people on the ground are held off those paths.
  const cx=w/2, cy=small?h*.44:h*.5, r0=2.3, R=Math.min(small?w*.44:w*.26,small?h*.34:h*.42)/r0, n=12;
  const tEnd=P.fallTime(r0,1), tt=tEnd*onceInChapter(st);
  ctx.beginPath();ctx.arc(cx,cy,r0*R,0,TAU);ctx.setLineDash([3,5]);ctx.strokeStyle='rgba(20,23,28,.2)';ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);
  drawEarth(ctx,cx,cy,R);
  for(const ang of [-Math.PI/2,-Math.PI/2+TAU/3,-Math.PI/2-TAU/3]){ctx.save();ctx.translate(cx+Math.cos(ang)*R,cy+Math.sin(ang)*R);ctx.rotate(ang+Math.PI/2);drawPerson(ctx,0,0,small?4.5:6,dark);
   trace(ctx,[[0,small?16:20],[0,3]]);ctx.strokeStyle=warm;ctx.lineWidth=2.2;ctx.stroke();trace(ctx,[[-4,9],[0,3],[4,9]]);ctx.stroke();ctx.restore();}
  const pos=Array.from({length:n},(_,i)=>{const ang=-Math.PI/2+TAU*(i+.5)/n,[x,y]=P.fall(Math.cos(ang)*r0,Math.sin(ang)*r0,tt);return [cx+x*R,cy+y*R];});
  trace(ctx,[...pos,pos[0]]);ctx.strokeStyle=rgba(accent,.4);ctx.lineWidth=1.4;ctx.stroke();pos.forEach(([x,y])=>dot(x,y,5.5,accent));
  return;
 }
 // Tides: a small ring falling from high above, and the same ring seen floating with its middle ball.
 // After playback the viewer sets the Earth's mass; the fall lasts as long as with the real mass (Physics.tideStretch).
 const r0=3, rho=.3, n=12, Q=st.live?Physics.tides(clamp(st.mass)):P, tEnd=(st.live?Physics.tides(1):P).fallTime(r0,2.3), tt=tEnd*onceInChapter(st);
 const Re=small?h*.085:h*.14, ex=small?w*.26:w*.3, ey=small?h*.62:h*.82;
 drawEarth(ctx,ex,ey,Re);
 const start=[[0,r0],...Array.from({length:n},(_,i)=>{const a=TAU*i/n;return [rho*Math.cos(a),r0+rho*Math.sin(a)];})], now=start.map(([x,y])=>Q.fall(x,y,tt));
 now.forEach(([x,y],i)=>dot(ex+x*Re,ey-y*Re,i?2.6:3.4,i?accent:dark));
 const [cx0,cy0]=[ex+now[0][0]*Re,ey-now[0][1]*Re], box=rho*Re*2.2;
 ctx.strokeStyle='rgba(20,23,28,.3)';ctx.lineWidth=1;ctx.strokeRect(cx0-box,cy0-box,box*2,box*2);
 const ix=small?w*.72:w*.66, iy=small?h*.36:h*.48, Ri=Math.min(small?w*.12:w*.07,small?h*.1:h*.13);
 trace(ctx,[[cx0+box,cy0],[ix-Ri*1.6,iy]]);ctx.setLineDash([2,4]);ctx.strokeStyle='rgba(20,23,28,.2)';ctx.stroke();ctx.setLineDash([]);
 ctx.beginPath();ctx.arc(ix,iy,Ri,0,TAU);ctx.setLineDash([3,4]);ctx.strokeStyle='rgba(20,23,28,.3)';ctx.stroke();ctx.setLineDash([]);
 const rel=now.slice(1).map(([x,y])=>[ix+(x-now[0][0])/rho*Ri,iy-(y-now[0][1])/rho*Ri]);
 trace(ctx,[...rel,rel[0]]);ctx.strokeStyle=rgba(accent,.5);ctx.lineWidth=1.4;ctx.stroke();rel.forEach(([x,y])=>dot(x,y,5,accent));dot(ix,iy,5.5,dark);
 if(!st.labels||tt<tEnd*.4||(st.live&&st.mass<.05))return;
 text(ctx,'stretched ↕',ix+Ri*.9,iy-Ri*1.25,{size:small?10:11,weight:600,color:warm});text(ctx,'squeezed ↔',small?ix:ix+Ri*1.05,small?iy+Ri*1.95:iy+Ri*.3,{align:small?'center':'left',size:small?10:11,weight:600,color:warm});
}

// A person on a bathroom scale in a lift: parked at the bottom, one ride to the top, then the cable snaps and the lift
// falls freely for the rest of the guide. Each chapter continues where the last one ended; nothing loops.
const LIFT_SLOW=.28, LIFT_SNAP=1;
// The explore control: the lift's upward acceleration, from falling freely (-g) at the left, through steady (0), to +g.
const liftAccel=a=>Physics.lift().g*(2*clamp(a)-1);
const liftSpeedUp=a=>{const acc=liftAccel(a);return a<.005?'falling freely':Math.abs(acc)<.15?'steady':`${Math.round(Math.abs(acc)*3.6)} km/h a second, ${acc>0?'up':'down'}`;};
function liftFallTime(stage,since){
 // Seconds of free fall, slowed down for viewing; the last chapter carries on from the end of the previous one.
 const ch=timeline?.chapters?.[2], before=ch?Math.max(0,ch.end-ch.start-LIFT_SNAP):0;
 return stage===2?Math.max(0,since-LIFT_SNAP)*LIFT_SLOW:(before+since)*LIFT_SLOW;
}
function drawLift(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.blue, dark='#14171c', warm='#c2410c', small=w<520, since=st.since??st.t, stage=st.stage, L=Physics.lift();
 const sx0=small?w*.08:w*.28, sx1=small?w*.56:w*.5, top=small?40:30, bot=h*(small?.66:.94), carH=Math.min((bot-top)*.45,small?150:210), carW=(sx1-sx0)*.74, k=(bot-top-carH)/24;
 // Where the car is (metres above the lowest stop), its upward acceleration, and whether the cable still holds.
 const climb=t=>{let v=0,y=0;for(let q=0;q<t;q+=.02){v+=L.accelAt(q)*.02;y+=v*.02;}return y;}, topY=1+climb(30);
 // After playback the viewer sets how the lift speeds up (liftAccel): falling freely at the left, steady in the middle.
 const live=!!st.live, accLive=live?liftAccel(st.mass):0, readLive=live?L.reading(accLive):1;
 let yc=1,a=0,snapped=false,fall=0,tf=0;
 if(live){yc=topY;a=accLive;snapped=readLive<.005;}
 else if(stage===1){yc=1+climb(since);a=L.accelAt(since);}
 else if(stage>=2){tf=liftFallTime(stage,since);yc=topY;if(tf>0){snapped=true;fall=.5*L.g*tf*tf;a=-L.g;yc=topY-fall;}}
 // The dial's needle eases to each new reading instead of jumping: averaged over the last 0.7 s of the ride,
 // and swinging down over 0.7 s once the cable snaps. Computed from time alone, so seeking stays exact.
 const settle=.7, sinceSnap=stage===2?since-LIFT_SNAP:stage>2?99:-1;
 const reading=live?readLive:stage===1?Array.from({length:15},(_,i)=>L.reading(L.accelAt(Math.max(0,since-settle*i/14)))).reduce((x,y)=>x+y)/15
  :sinceSnap>0?1-smooth(sinceSnap/settle):1;
 const offset=snapped?fall:0, floorY=yw=>bot-(yw+offset)*k, cx=(sx0+sx1)/2;
 // The shaft: walls with a mark at every floor. While falling, the view follows the car and the walls stream past.
 ctx.fillStyle='rgba(20,23,28,.03)';ctx.fillRect(sx0,0,sx1-sx0,h);
 for(const x of [sx0,sx1]){trace(ctx,[[x,0],[x,h]]);ctx.strokeStyle='rgba(20,23,28,.25)';ctx.lineWidth=1.5;ctx.stroke();}
 for(let m=Math.floor((-offset-4)/3)*3;m<=-offset+30;m+=3){const y=floorY(m);if(y<-10||y>h+10)continue;
  for(const x of [sx0,sx1]){trace(ctx,[[x,y],[x+(x===sx0?10:-10),y]]);ctx.strokeStyle='rgba(20,23,28,.3)';ctx.lineWidth=1.2;ctx.stroke();}}
 const floor=floorY(yc), roof=floor-carH;
 // The cable: attached to the roof, or snapped and left behind in the shaft.
 if(!snapped){trace(ctx,[[cx,0],[cx,roof]]);ctx.strokeStyle='rgba(20,23,28,.55)';ctx.lineWidth=2;ctx.stroke();}
 else{const end=floorY(topY)-carH-8;trace(ctx,Array.from({length:12},(_,i)=>[cx+Math.sin(i*1.3)*3*(i/11),end-i*6]));ctx.strokeStyle='rgba(20,23,28,.5)';ctx.lineWidth=2;ctx.stroke();}
 ctx.fillStyle='#fffdf8';ctx.strokeStyle='rgba(20,23,28,.55)';ctx.lineWidth=1.6;ctx.beginPath();ctx.roundRect(cx-carW/2,roof,carW,carH,6);ctx.fill();ctx.stroke();
 // You, standing on a bathroom scale, holding an apple; after the snap the apple is let go and stays where it was.
 const size=carH/7.2, scaleH=size*.5, feet=floor-scaleH-3, px=cx-size*.6;
 ctx.fillStyle='#e9e4da';ctx.strokeStyle='rgba(20,23,28,.45)';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(px-size*1.2,feet,size*2.4,scaleH,3);ctx.fill();ctx.stroke();
 ctx.fillStyle=reading>.01?warm:'rgba(20,23,28,.25)';ctx.fillRect(px-size*.3,feet+scaleH*.25,size*.6,scaleH*.5);
 // Floating: once nothing pushes, you drift gently off the scale, bobbing and turning a little; so does the apple.
 const drift=live?clamp(1-reading*4):sinceSnap>0?smooth(sinceSnap/1.6):0, lift=size*drift*(.45+.12*Math.sin(since*1.3)), sway=.09*drift*Math.sin(since*.7);
 ctx.save();ctx.translate(px,feet-lift-size*1.3);ctx.rotate(sway);drawPerson(ctx,0,size*1.3,size,dark);ctx.restore();
 // The push: the scale pushing up on your feet, as long as the reading; gone once nothing pushes.
 if(reading>.03){const ux=px-size*1.7, len=size*1.5*reading;trace(ctx,[[ux,feet],[ux,feet-len]]);ctx.strokeStyle=warm;ctx.lineWidth=2.2;ctx.lineCap='round';ctx.stroke();
  trace(ctx,[[ux-4,feet-len+6],[ux,feet-len],[ux+4,feet-len+6]]);ctx.stroke();if(st.labels)text(ctx,'push',ux-6,feet-len/2,{align:'right',size:10,weight:600,color:warm});}
 const ax=px+size*(snapped?1.3+.45*drift+.15*drift*Math.sin(since*.9):.75), ay=feet-size*(snapped?2.35+.8*drift+.1*drift*Math.cos(since*1.1):2.75);
 ctx.beginPath();ctx.arc(ax,ay,size*.38,0,TAU);ctx.fillStyle='#d6453d';ctx.fill();
 // Which way the lift is speeding up.
 if(Math.abs(a)>.01){const ux=cx+carW/2+16,dir=a>0?-1:1,y0=(roof+floor)/2,len=Math.min(60,10+Math.abs(a)*5);trace(ctx,[[ux,y0-dir*len/2],[ux,y0+dir*len/2]]);ctx.strokeStyle=accent;ctx.lineWidth=2.4;ctx.stroke();
  trace(ctx,[[ux-5,y0+dir*(len/2-7)],[ux,y0+dir*len/2],[ux+5,y0+dir*(len/2-7)]]);ctx.stroke();}
 // The dial: what the scale reads, from zero to twice your weight.
 const dx=small?w*.79:w*.73, dy=small?h*.36:h*.5, R=Math.min(small?w*.17:w*.12,small?h*.16:h*.26);
 ctx.beginPath();ctx.arc(dx,dy,R,Math.PI*.9,Math.PI*2.1);ctx.strokeStyle='rgba(20,23,28,.15)';ctx.lineWidth=R*.14;ctx.lineCap='round';ctx.stroke();
 const ang=f=>Math.PI*.9+Math.PI*1.2*Math.min(1,f/2);
 ctx.beginPath();ctx.arc(dx,dy,R,Math.PI*.9,ang(reading));ctx.strokeStyle=reading>.01?warm:'rgba(20,23,28,.15)';ctx.stroke();ctx.lineCap='butt';
 for(const f of [0,1,2]){const t=ang(f);trace(ctx,[[dx+Math.cos(t)*R*.78,dy+Math.sin(t)*R*.78],[dx+Math.cos(t)*R*.9,dy+Math.sin(t)*R*.9]]);ctx.strokeStyle='rgba(20,23,28,.4)';ctx.lineWidth=1.5;ctx.stroke();}
 const na=ang(reading);trace(ctx,[[dx,dy],[dx+Math.cos(na)*R*.72,dy+Math.sin(na)*R*.72]]);ctx.strokeStyle=dark;ctx.lineWidth=3;ctx.lineCap='round';ctx.stroke();ctx.beginPath();ctx.arc(dx,dy,5,0,TAU);ctx.fillStyle=dark;ctx.fill();
 if(stage>=3&&!small&&!live){const ex=w*.88,ey=h*.16,er=16,ang2=st.t*.6;drawEarth(ctx,ex,ey,er);ctx.beginPath();ctx.arc(ex,ey,er*2.1,0,TAU);ctx.setLineDash([2,4]);ctx.strokeStyle='rgba(20,23,28,.3)';ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();ctx.arc(ex+Math.cos(ang2)*er*2.1,ey+Math.sin(ang2)*er*2.1,3.5,0,TAU);ctx.fillStyle=dark;ctx.fill();}
 if(!st.labels)return;
 text(ctx,'you weigh',dx,dy-R-(small?34:40),{align:'center',size:small?11:12,weight:600,color:'rgba(20,23,28,.6)'});
 text(ctx,`${Math.round(reading*70)} kg`,dx,dy+R*.35,{align:'center',size:small?22:30,weight:700,color:reading>.01?dark:accent});
 text(ctx,'0',dx+Math.cos(ang(0))*R*1.2,dy+Math.sin(ang(0))*R*1.2,{align:'center',size:10});

 if(snapped&&stage===2)pill(ctx,'apple let go',ax+size*.6,ay-size*.5,{size:10,weight:600,color:'#b3362f'});
 // While falling: how fast, so "faster and faster" can be seen; the fall is shown in slow motion.
 if(snapped&&!live){text(ctx,`falling at ${Math.round(L.g*tf*3.6)} km/h`,cx,small?bot+18:h*.06,{align:'center',size:small?11:12,weight:600,color:accent});
  }
 if(stage>=3&&!small&&!live)text(ctx,'orbiting',w*.88,h*.16+40,{align:'center',size:10,color:'rgba(20,23,28,.6)'});
}

// The Moon stretches the Earth: it pulls the near side more and the far side less than the centre, so the oceans bulge both ways.
function drawMoonTides(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.blue, dark='#14171c', warm='#c2410c', small=w<520, since=st.since??st.t, stage=st.stage, M=Physics.moonTides();
 // After playback the viewer sets the Moon's mass (1 = the real Moon): the bulges grow in step, and the Moon keeps its density.
 const mass=st.live?clamp(st.mass):1;
 // On a phone the Earth sits nearer the middle and a little smaller, so every label stays on screen.
 const ex=small?w*.42:w*.36, ey=small?h*.36:h*.5, Re=Math.min(small?w*.16:w*.15,small?h*.17:h*.27), mx=small?w*.88:w*.8, mr=Re*.27*Math.cbrt(mass);
 // How much of the stretch to show: none while the pulls are compared, growing as the Earth's own fall is taken away.
 const morph=stage===0?1:stage===1?0:stage===2?smooth((since-2.5)/4):1, b=.11*morph*mass;
 // Seen from above the North Pole the Earth turns anticlockwise: a negative angle on the canvas.
 const spin=stage>=3?-since*.35:0;
 const ocean=ctx.createRadialGradient(ex,ey,Re*.9,ex,ey,Re*1.3);ocean.addColorStop(0,'rgba(59,130,246,.35)');ocean.addColorStop(1,'rgba(59,130,246,.2)');
 ctx.beginPath();for(let i=0;i<=120;i++){const th=TAU*i/120,r=Re*(1.08+b*M.shape(th));const x=ex+Math.cos(th)*r,y=ey+Math.sin(th)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fillStyle=ocean;ctx.fill();ctx.strokeStyle='rgba(37,99,235,.45)';ctx.lineWidth=1;ctx.stroke();
 ctx.save();ctx.translate(ex,ey);ctx.rotate(spin);drawEarth(ctx,0,0,Re,{lat:90,lon:-10});ctx.restore();
 if(mr>.5){ctx.beginPath();ctx.arc(mx,ey,mr,0,TAU);const moon=ctx.createRadialGradient(mx-mr*.3,ey-mr*.3,mr*.1,mx,ey,mr);moon.addColorStop(0,'#f4f1ea');moon.addColorStop(1,'#a9a39a');ctx.fillStyle=moon;ctx.fill();}
 // Arrows: the Moon's pull at the near side, centre and far side (differences enlarged), or the stretch left after the Earth's own fall.
 if(stage===1||stage===2){const c=M.centre[0], E=.45/(M.tide(1,0)[0]/c), Lc=Re*.55;
  const pts=[[1,0],[0,0],[-1,0],[0,1],[0,-1]];
  for(const [x,y] of pts){const t=M.tide(x,y), pull=[c+E*t[0],E*t[1]], keep=[E*t[0],E*t[1]], v=stage===1?pull:[pull[0]+(keep[0]-pull[0])*morph,pull[1]+(keep[1]-pull[1])*morph];
   if(stage===1&&(y!==0))continue;
   const sx=ex+x*Re*(x?1.08:0), sy=ey+y*Re*1.08, L=Lc/c, vx=v[0]*L, vy=v[1]*L, len=Math.hypot(vx,vy);if(len<3)continue;
   trace(ctx,[[sx,sy],[sx+vx,sy+vy]]);ctx.strokeStyle=x===0&&y===0?dark:warm;ctx.lineWidth=2.6;ctx.lineCap='round';ctx.stroke();
   const ux=vx/len,uy=vy/len;trace(ctx,[[sx+vx-ux*8-uy*5,sy+vy-uy*8+ux*5],[sx+vx,sy+vy],[sx+vx-ux*8+uy*5,sy+vy-uy*8-ux*5]]);ctx.stroke();}}
 // Two tides a day: a place on the coast turns through both bulges; its water level is traced below.
 let mark=null;
 if(stage>=3){const ang=Math.PI*.75+spin;mark=[ex+Math.cos(ang)*Re,ey+Math.sin(ang)*Re];ctx.beginPath();ctx.arc(...mark,5,0,TAU);ctx.fillStyle=dark;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();
  const gx=small?w*.1:w*.6, gw=small?w*.8:w*.32, gy=small?h*.7:h*.72, gh=small?h*.12:h*.14;
  trace(ctx,[[gx,gy+gh/2],[gx+gw,gy+gh/2]]);ctx.strokeStyle='rgba(20,23,28,.15)';ctx.lineWidth=1;ctx.stroke();
  trace(ctx,Array.from({length:121},(_,i)=>{const f=i/120;return [gx+f*gw,gy+gh/2-M.shape(Math.PI*.75-f*TAU)*gh*.45*mass];}));ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.stroke();
  const f=((-spin%TAU)+TAU)%TAU/TAU;ctx.beginPath();ctx.arc(gx+f*gw,gy+gh/2-M.shape(Math.PI*.75+spin)*gh*.45*mass,4.5,0,TAU);ctx.fillStyle=dark;ctx.fill();
  if(st.labels){text(ctx,'your water level, one day',gx,gy-12,{size:small?10:11,weight:600,color:'rgba(20,23,28,.65)'});}}
 if(!st.labels)return;
 const size=small?10:11;
 if(mass>.05)text(ctx,'Moon',small?w-8:mx,ey+Re*.27+16,{align:small?'right':'center',size:10,color:'rgba(20,23,28,.55)'});
 if(stage===0||stage>=3&&mass>.05){pill(ctx,'high tide',ex+Re*1.25,ey-Re*.28,{size,weight:600,color:accent});pill(ctx,'high tide',ex-Re*1.25,ey-Re*.28,{align:'right',size,weight:600,color:accent});
  if(stage===0){pill(ctx,'low tide',ex,ey-Re*1.12-14,{align:'center',size,color:'rgba(20,23,28,.6)'});}}
 if(stage===1){pill(ctx,'pulled most',ex+Re*1.08,ey+24,{align:'center',size,weight:600,color:warm});pill(ctx,'centre',ex,ey+24,{align:'center',size,weight:600,color:dark});pill(ctx,'pulled least',ex-Re*1.08,ey+24,{align:'center',size,weight:600,color:warm});
  }
 if(stage===2&&morph>.6){pill(ctx,'pulled ahead',ex+Re*1.3,ey+22,{size,weight:600,color:warm});pill(ctx,'left behind',ex-Re*1.3,ey+22,{align:'right',size,weight:600,color:warm});pill(ctx,'squeezed',ex+12,ey-Re*1.2,{size,weight:600,color:warm});}
}

// Why nothing can travel faster than light. A rocket fires the same push again and again. By everyday adding each
// push adds half light speed, so the second would reach light speed and the third pass it. But light does not add:
// as the coasting rocket passes a lamp on the ground, both lamps flash together and, seen from the ground, the two
// flashes travel side by side at light speed. The crew time their own flash too and find it leaving them at full light
// speed, after every push, so they never gain on light. Seen from the ground the rocket's speed therefore climbs 50%,
// 80%, 93%... toward light speed without reaching it. Each chapter has a fixed plan; after playback the viewer sets the
// number of pushes. Exact for equal pushes (Physics.limitSpeed); motion on screen is slowed for viewing.
const LIMIT={mode:''};
// Whole percentages until the speed is within a few percent of light, then just enough decimals never to show 100%.
function limitPct(v){const d=Math.max(0,Math.floor(-Math.log10(Math.max(1e-9,1-v)))-1);return (v*100).toFixed(Math.min(4,d))+'%';}
// Light's speed on screen, in strip widths per second, shared by chapters 1 to 3 so light and the rocket keep their
// speeds: slow enough that chapter 2's flashes (fired a second before its second sentence) and chapter 3's flash (fired
// early in its first sentence) are still in flight as each chapter ends.
function limitLight(){
 const timing=i=>{const c=timeline?.chapters?.[i], lines=c?.lines||[], c0=c?.start||0, at=k=>lines[k]?lines[k].start-c0:3+4*k;return {lines,at,end:c?.end!=null?c.end-c0:null};};
 const two=timing(1), three=timing(2), flash=two.lines[1]?Math.max(1.2,two.at(1)-1):two.at(0)+1.2, crew=three.at(0)+.6;
 const speed=Math.min(.8/Math.max(3,(two.end??flash+6)-flash-.2),.84/Math.max(3,(three.end??crew+8)-crew-.2));
 return {flash,crew,speed};
}
function limitPlan(st){
 const c=timeline?.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since??0);
 if(st.since===undefined)return {mode:'thumb',n:4,t:2};
 if(st.live)return {mode:'live',n:Math.round(clamp(st.mass)*10),t:st.t||0};
 // 1: the rocket fires one push and coasts at half light speed along the strip; with the second sentence the strip
 // fades and everyday adding draws its line through light speed.
 if(st.stage===0)return {mode:'add',n:clamp((t-.5)/.6),everyday:smooth((t-at(1)-.2)/1.6),strip:1-smooth((t-at(1)+.4)/.6),t};
 // 2: seen from the ground, the rocket coasts past a lamp post; both lamps flash and the flashes travel side by side.
 if(st.stage===1)return {mode:'lamp',n:1,flash:limitLight().flash,dim:smooth(t/.6),t};
 // 3: seen from the rocket: the ground streams back at half light speed and the crew's flash leaves at light speed;
 // with the second sentence another push makes the ground stream faster, and the flash still pulls away at light speed.
 if(st.stage===2)return {mode:'crew',n:1,push:at(1)+.5,first:limitLight().crew,dim:1,t};
 // 4: the same push again and again: 80% and 93% with the first sentence, then 98%, 99.2% and 99.7%, under the faint
 // line of everyday adding.
 let n=1;for(const p of [at(0)+.9,at(0)+2.5,at(1)+.5,at(1)+1.5,at(1)+2.5])n+=clamp((t-p)/.6);
 return {mode:'climb',n,everyday:1,faint:.45,zoom:smooth((t-at(1)-3.1)/.6),t};
}
function drawLimit(ctx,w,h,spec,st){
 const plan=limitPlan(st), small=w<520, light='#d97706', accent=ACCENT[spec.accent]||ACCENT.blue, ink='rgba(20,23,28,.8)', muted='rgba(20,23,28,.55)';
 LIMIT.mode=plan.mode;
 const n=plan.n, v=Physics.limitSpeed(n), T=plan.t, size=small?10:12;
 const cw=w*(small?.76:.6), chart=small?{x0:w*.15,top:h*.5,base:h*.76}:{x0:w*.2,top:h*.42,base:h*.82};
 chart.x1=chart.x0+cw;
 const glow=(x,y,r,a=1)=>{const g=ctx.createRadialGradient(x,y,0,x,y,r*3);g.addColorStop(0,rgba(light,.5*a));g.addColorStop(1,rgba(light,0));ctx.fillStyle=g;ctx.fillRect(x-r*3,y-r*3,r*6,r*6);
  ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=rgba(light,a);ctx.fill();};
 // The strip: a separate window above the chart, showing the rocket's path and the ground. Light crosses the part
 // past the lamp post in chapter 2's flash time; the rocket coasts at half that speed.
 const x0=chart.x0, x1=chart.x1, lane=x1-x0, lampX=x0+lane*.2, win={top:h*(small?.11:.05),base:h*(small?.42:.31)};
 const ry=h*(small?.21:.12), gy=h*(small?.36:.25), head=gy-(small?16:20), r=small?13:19, lampY=ry-r*.4;
 const c=limitLight().speed*lane;
 const frame=(a,name)=>{ctx.save();ctx.globalAlpha=a;ctx.fillStyle='rgba(255,255,255,.55)';ctx.beginPath();ctx.roundRect(x0-14,win.top,lane+28,win.base-win.top,10);ctx.fill();
  ctx.strokeStyle='rgba(20,23,28,.1)';ctx.lineWidth=1;ctx.stroke();
  trace(ctx,[[x0,ry+r*.9],[x1,ry+r*.9]]);ctx.strokeStyle='rgba(20,23,28,.08)';ctx.stroke();
  trace(ctx,[[x0,gy],[x1,gy]]);ctx.strokeStyle='rgba(20,23,28,.32)';ctx.lineWidth=1.4;ctx.stroke();
  if(st.labels){text(ctx,'ground',x1,gy+(small?11:13),{align:'right',size:size-1,weight:600,color:muted});
   if(name)text(ctx,name,x0,win.top+(small?11:14),{size:size-1,weight:700,color:muted,spacing:'.5px'});}
  ctx.restore();};
 const rocket=(x,a,burn,flash)=>{ctx.save();ctx.globalAlpha=a;drawRocket(ctx,x,ry,r,1,burn,T);
  ctx.beginPath();ctx.arc(x,lampY,3.4,0,TAU);ctx.fillStyle='#fde68a';ctx.fill();ctx.strokeStyle='rgba(120,80,0,.6)';ctx.lineWidth=1;ctx.stroke();
  if(flash>0)glow(x,lampY,4+4*flash,flash);ctx.restore();};
 if(plan.mode==='add'&&plan.strip>0){
  // One push: the flame fires while the chart's first step rises, then the rocket coasts at half light speed.
  const u=.5*c, ramp=.6, go=Math.max(0,T-.5), moved=go<ramp?u*go*go/(2*ramp):u*(ramp/2+go-ramp), rx=x0+lane*.06+moved;
  frame(plan.strip,'');if(rx<x1)rocket(rx,plan.strip*clamp((x1-rx)/30),T>.5&&T<.5+ramp,0);
 }
 if(plan.mode==='lamp'){
  // As the rocket passes the lamp post, its own lamp and the post's lamp flash together; both flashes travel at light
  // speed, side by side, and the rocket falls behind.
  frame(plan.dim,'');
  const since=T-plan.flash, burst=since>=0?clamp(1-since/.35):0;
  ctx.save();ctx.globalAlpha=plan.dim;ctx.fillStyle='rgba(20,23,28,.5)';ctx.fillRect(lampX-1.2,head,2.4,gy-head);
  ctx.beginPath();ctx.arc(lampX,head,3.6,0,TAU);ctx.fillStyle='#fde68a';ctx.fill();ctx.strokeStyle='rgba(120,80,0,.6)';ctx.lineWidth=1;ctx.stroke();ctx.restore();
  if(burst>0)glow(lampX,head,4+4*burst,burst);
  const rx=lampX+.5*c*since;
  if(rx>x0-r&&rx<x1+r)rocket(rx,clamp((rx-x0+r)/30)*clamp((x1-rx)/30),false,burst);
  const travel=(x1-lampX)/c;
  if(since>.05&&since<travel+.4){const px=Math.min(x1,lampX+c*since), fade=clamp((travel+.4-since)/.4);
   ctx.save();ctx.globalAlpha=fade;
   // Faint trails back to the post show that both flashes left it together.
   for(const y of [lampY,head]){const g=ctx.createLinearGradient(lampX,0,px,0);g.addColorStop(0,rgba(light,0));g.addColorStop(1,rgba(light,.45));
    trace(ctx,[[lampX,y],[px,y]]);ctx.strokeStyle=g;ctx.lineWidth=2;ctx.stroke();}
   glow(px,lampY,4);glow(px,head,4);
   ctx.setLineDash([3,4]);trace(ctx,[[px,lampY+7],[px,head-7]]);ctx.strokeStyle=rgba(light,.6);ctx.lineWidth=1.2;ctx.stroke();ctx.setLineDash([]);
   // The label rides beside the flashes, and switches to their left side where the stage ends.
   ctx.font=`600 ${size}px ${FONT}`;const right=px+16+ctx.measureText('same speed').width<x1;
   if(st.labels)pill(ctx,'same speed',right?px+10:px-10,(ry+r*.9+head)/2,{align:right?'left':'right',size,weight:600,color:light});ctx.restore();}
 }
 if(plan.mode==='crew'){
  // Seen from the rocket: the crew stay put while the ground streams backward at the rocket's speed. Their lamp flashes
  // once and the flash pulls away at light speed; after another push the ground streams faster, and the same flash
  // still pulls away at exactly the same speed.
  frame(1,'seen from the rocket');
  const rx=x0+lane*.16, ramp=.6, g0=.5*c, g1=Physics.limitSpeed(2)*c, go=T-plan.push;
  const back=g0*T+(go<=0?0:go<ramp?(g1-g0)*go*go/(2*ramp):(g1-g0)*(ramp/2+go-ramp)), gap=lane/7;
  for(let k=0;k<7;k++){const px=x0+((k*gap-back)%lane+lane)%lane;ctx.fillStyle='rgba(20,23,28,.38)';ctx.fillRect(px-1,gy-9,2,9);}
  const since=T-plan.first, burst=since>=0?clamp(1-since/.35):0;
  if(since>.05){const px=Math.min(x1,rx+c*since), fade=clamp((x1+4-px)/40);
   ctx.save();ctx.globalAlpha=fade;const g=ctx.createLinearGradient(rx,0,px,0);g.addColorStop(0,rgba(light,0));g.addColorStop(1,rgba(light,.45));
   trace(ctx,[[rx,lampY],[px,lampY]]);ctx.strokeStyle=g;ctx.lineWidth=2;ctx.stroke();glow(px,lampY,4);
   if(st.labels&&px>rx+50){ctx.font=`600 ${size}px ${FONT}`;const half=ctx.measureText('full light speed').width/2+6;
    pill(ctx,'full light speed',clamp(px,x0+half,x1-half),lampY-(small?14:17),{align:'center',size,weight:600,color:light});}
   ctx.restore();}
  rocket(rx,1,go>0&&go<ramp,burst);
 }
 // The chart: the speed seen from the ground after each push, under the line at light speed. While a strip chapter
 // runs it stays dim and unlabelled.
 const yOf=s=>chart.base-s*(chart.base-chart.top), gap=(chart.x1-chart.x0)/11, xOf=k=>chart.x0+k*gap, quiet=(plan.dim||0)>0;
 ctx.save();ctx.globalAlpha=1-.7*(plan.dim||0);
 trace(ctx,[[chart.x0,chart.base],[chart.x1,chart.base]]);ctx.strokeStyle='rgba(20,23,28,.25)';ctx.lineWidth=1;ctx.stroke();
 trace(ctx,[[chart.x0,chart.top],[chart.x1,chart.top]]);ctx.strokeStyle=rgba(light,.8);ctx.lineWidth=2;ctx.stroke();
 // Everyday adding: each push adds another half of light speed, so two reach it and three pass it.
 if(plan.everyday>0){const e=plan.everyday, pts=[[chart.x0,chart.base]];for(let k=1;k<=3;k++)pts.push([xOf(k),yOf(k*.5)]);
  const end=Math.max(1,Math.floor(e*3.999)+1), cut=pts.slice(0,end+1);
  ctx.save();ctx.globalAlpha*=Math.min(1,e*2)*(plan.faint||1);ctx.setLineDash([5,5]);trace(ctx,cut);ctx.strokeStyle='rgba(20,23,28,.45)';ctx.lineWidth=1.6;ctx.stroke();ctx.setLineDash([]);
  for(const [x,y] of cut.slice(1)){ctx.beginPath();ctx.arc(x,y,3.4,0,TAU);ctx.fillStyle='rgba(255,255,255,.95)';ctx.fill();ctx.strokeStyle='rgba(20,23,28,.45)';ctx.lineWidth=1.4;ctx.stroke();}
  if(st.labels&&e>.7&&!(plan.zoom>0))text(ctx,'everyday adding',xOf(3)+10,yOf(1.5),{size,weight:600,color:'rgba(20,23,28,.6)'});ctx.restore();}
 const shown=Math.ceil(n-1e-9);let last=[chart.x0,chart.base];
 for(let k=1;k<=shown;k++){const s=Physics.limitSpeed(Math.min(k,n)), x=xOf(k), y=yOf(s);
  trace(ctx,[last,[x,last[1]],[x,y]]);ctx.strokeStyle=rgba(accent,.85);ctx.lineWidth=2.2;ctx.stroke();
  ctx.beginPath();ctx.arc(x,y,small?3.4:4,0,TAU);ctx.fillStyle=accent;ctx.fill();last=[x,y];}
 // Zoomed in on the last steps: from 96.5% to 100.5% of light speed, they stay clearly below the line.
 if(plan.zoom>0&&shown>=6){const R=small?38:58, cx=xOf(small?7.4:8.2), cy=chart.top-(small?62:78), zx=k=>cx-R*.75+(k-4)*R*.62, zy=v=>cy-R*.45+(1.005-v)/.04*R*1.1;
  ctx.save();ctx.globalAlpha*=plan.zoom;
  trace(ctx,[[xOf(5),chart.top+4],[cx-R*.72,cy+R*.7]]);ctx.strokeStyle='rgba(20,23,28,.25)';ctx.lineWidth=1;ctx.setLineDash([2,3]);ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();ctx.arc(cx,cy,R,0,TAU);ctx.fillStyle='rgba(255,255,255,.96)';ctx.fill();ctx.strokeStyle='rgba(20,23,28,.3)';ctx.lineWidth=1.2;ctx.stroke();
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,R-1,0,TAU);ctx.clip();
  trace(ctx,[[cx-R,zy(1)],[cx+R,zy(1)]]);ctx.strokeStyle=rgba(light,.85);ctx.lineWidth=2;ctx.stroke();
  let prev=[cx-R,zy(Physics.limitSpeed(3))];
  for(let k=4;k<=6;k++){const x=zx(k), y=zy(Physics.limitSpeed(k));trace(ctx,[prev,[x,prev[1]],[x,y],[x+R*.62,y]]);ctx.strokeStyle=rgba(accent,.85);ctx.lineWidth=2.2;ctx.stroke();
   ctx.beginPath();ctx.arc(x,y,small?3:3.6,0,TAU);ctx.fillStyle=accent;ctx.fill();prev=[x+R*.62,y];}
  ctx.restore();
  if(st.labels)text(ctx,'zoomed in',cx,cy-R-(small?10:12),{align:'center',size:size-1,weight:600,color:muted});
  ctx.restore();}
 if(st.labels&&!quiet){
  ctx.save();ctx.translate(chart.x0-(small?12:18),(chart.top+chart.base)/2);ctx.rotate(-Math.PI/2);
  text(ctx,'speed seen from the ground',0,0,{align:'center',size,weight:600,color:ink});ctx.restore();
  pill(ctx,'light speed',chart.x1,chart.top-(small?12:15),{align:'right',size,weight:700,color:light});
  text(ctx,'equal pushes',chart.x1,chart.base+(small?12:15),{align:'right',size:size-1,weight:600,color:muted});
  if(shown>0)pill(ctx,limitPct(v),last[0]+10,last[1]+(small?14:16),{size:size+1,weight:700,color:accent});}
 ctx.restore();
}

// Why the night sky is dark (Olbers' paradox). You stand on a hill under the night sky. If stars filled space evenly,
// forever and unchanging, each shell of stars around you would add the same light and every sight line would end on a
// star, so the sky would blaze like the Sun's surface. The universe began 13.8 billion years ago, so only light from a
// bubble around you has arrived, and within it stars cover a tiny share of the sky (Physics.nightCover). The shells are
// a slice through space. After playback the viewer sets how long the stars have shone in an unchanging universe.
// Layouts and star layers are cached per stage size (the player and the previews differ).
const NIGHT={mode:'',sky:new Map(),field:new Map()};
const nightKeep=(map,key,value)=>{if(map.size>5)map.delete(map.keys().next().value);map.set(key,value);return value;};
const nightRand=seed=>{let x=seed;return ()=>{x=(x*1103515245+12345)%2147483648;return x/2147483648;};};
// Fixed stars and Milky Way dust, as fractions of the sky, so every frame matches.
const NIGHT_STARS=(()=>{const r=nightRand(17);return Array.from({length:280},()=>[r(),r(),r(),r()]);})();
const NIGHT_DUST=(()=>{const r=nightRand(29);return Array.from({length:1400},()=>[r(),(r()+r()+r()-1.5)/1.5,r()]);})();
const nightMix=(a,b,f)=>a.map((v,i)=>Math.round(v+(b[i]-v)*clamp(f)));
const nightRgb=(c,a=1)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
// Years in words, from "no time" to powers of ten.
function nightAge(y){
 if(y<=0)return 'no time';
 if(y<1e15){const [s,name]=y>=1e12?[1e12,'trillion']:[1e9,'billion'], x=y/s;return `${x<100?x.toFixed(1).replace(/\.0$/,''):Math.round(x).toLocaleString('en-US')} ${name} years`;}
 let e=Math.floor(Math.log10(y)), m=Math.round(y/10**e);if(m>=10){m=1;e++;}
 return `${m===1?'':m+' × '}10${String(e).split('').map(d=>'⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]).join('')} years`;
}
// A share of the sky in words: tiny shares as one part in so many.
function nightShare(v){
 if(v<=0)return 'none';
 if(v>=.9995)return 'all of it';
 if(v>=.01)return Math.round(v*100)+'%';
 if(v>=1e-3)return (v*100).toFixed(1)+'%';
 const n=1/v;
 for(const [s,name] of [[1e12,'trillion'],[1e9,'billion'],[1e6,'million'],[1e3,'thousand']])
  if(n>=s){const x=n/s;return `1 part in ${x<10?x.toFixed(1).replace(/\.0$/,''):Math.round(x).toLocaleString('en-US')} ${name}`;}
 return `1 part in ${Math.round(n)}`;
}
function nightPlan(st){
 const c=timeline?.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since??0);
 const last=at(Math.max(1,lines.length-1));
 if(st.since===undefined)return {mode:'thumb',t:2};
 if(st.live)return {mode:'live',years:Physics.nightYears(clamp(st.mass)),t:st.t||0};
 // 1: dusk turns to night while the stars come out; with the second sentence a dark gap between them is ringed.
 if(st.stage===0)return {mode:'night',night:smooth((t-.2)/Math.max(2.4,at(1)-.4)),gap:smooth((t-at(1)-.3)/.8),t};
 // 2: shells of stars appear one after another out to the stage edge; with the second sentence a near and a far shell
 // are compared; with the last, sight lines reach out until each ends on a star, and the sky blazes.
 if(st.stage===1)return {mode:'shells',shells:clamp((t-.3)/Math.max(1.6,at(1)-1)),compare:smooth((t-at(1)+.4)/.5)*(1-smooth((t-last+.1)/.5)),reach:clamp((t-last-.3)/3.6),t};
 // 3: the blaze fades and a bubble grows around you to the distance light has crossed since the beginning; with the
 // second sentence light from stars beyond it creeps inward, still on its way; with the last, sight lines go out and
 // most find only darkness.
 if(st.stage===2)return {mode:'bubble',fade:smooth(t/.9),grow:smooth((t-.7)/Math.max(1.6,at(1)-1)),travel:Math.max(0,t-at(1)-.2),way:smooth((t-at(1)-.2)/.6),look:lines.length>2?clamp((t-last-.3)/1.8):0,t};
 // 4: back to the night; with the last sentence the oldest light travels toward you, stretching and fading.
 return {mode:'end',back:smooth(t/1.2),wave:lines.length>1?clamp((t-last-.2)/3.4):0,t};
}
function nightLayout(w,h){
 const small=w<520, gy=h*(small?.84:.8), cx=w*.5, s=small?20:25, eye=[cx-s*.09,gy-s*.93];
 const ax=small?(w/2-8)/9:(w/2-18)/14, ay=small?(eye[1]-10)/15:Math.min(ax*.8,(eye[1]-12)/12);
 return {small,gy,cx,s,eye,ax,ay,rho:Math.max(1.9,.075*Math.sqrt(ax*ay)),H:3.4,gap:small?[w*.72,h*.3,22]:[w*.73,h*.36,30]};
}
// The slice of space: shells k = 1, 2, ... around your eye, 2k stars on shell k (even spacing in the slice), each
// covering the same share of the shell, so every shell covers the same share of the sky. Sight lines spread evenly
// across the sky end on the first star they meet; the layout is chosen so each ends on a star inside the stage.
function nightField(L,w,h){
 const key=`${w}x${h}`;if(NIGHT.field.has(key))return NIGHT.field.get(key);
 const K=L.small?24:22, rays=L.small?15:25, lo=L.small?.5:.2, hi=Math.PI-lo, pos=(k,a)=>[L.eye[0]+k*Math.cos(a)*L.ax,L.eye[1]-k*Math.sin(a)*L.ay];
 const inside=([x,y])=>x>8&&x<w-8&&y>8;
 let best=null;
 for(let seed=1;seed<400&&!(best&&best.hits.length===rays);seed++){
  const r=nightRand(seed*7919+3), stars=[];
  for(let k=1;k<=K;k++)for(let i=0;i<k;i++){const a=(i+.15+.7*r())/k*Math.PI;stars.push({k,a,half:.24/k,p:pos(k,a)});}
  const hits=[];
  for(let j=0;j<rays;j++){const th=lo+(hi-lo)*(j+.5)/rays, star=stars.find(s=>Math.abs(s.a-th)<=s.half);if(star&&inside(star.p))hits.push({th,star});}
  if(!best||hits.length>best.hits.length)best={stars,hits};
 }
 // Stars beyond the bubble whose light is shown on its way, spread around the sky at varied distances.
 const pulses=[];
 for(let i=0;i<8;i++){const want=.35+(Math.PI-.7)*i/7, wantK=L.H+3+(i*3)%6;
  const pick=best.stars.filter(s=>s.k>=L.H+3&&inside(s.p)&&s.p[1]>24&&!pulses.includes(s)).sort((a,b)=>Math.abs(a.a-want)*6+Math.abs(a.k-wantK)-(Math.abs(b.a-want)*6+Math.abs(b.k-wantK)))[0];
  if(pick)pulses.push(pick);}
 return nightKeep(NIGHT.field,key,{K,pos,stars:best.stars,hits:best.hits,pulses,far:Math.max(...best.hits.map(x=>x.star.k))});
}
// The sky's own stars and the Milky Way, drawn once per stage size.
function nightStarsLayer(w,h,L){
 const dpr=window.devicePixelRatio||1, key=`${w}x${h}x${dpr}`;
 if(NIGHT.sky.has(key))return NIGHT.sky.get(key);
 const c=document.createElement('canvas');c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);
 const g=c.getContext('2d');g.scale(dpr,dpr);
 const A=[-.05*w,L.gy*.95], B=[1.05*w,L.gy*.0], dx=B[0]-A[0], dy=B[1]-A[1], len=Math.hypot(dx,dy), nx=-dy/len, ny=dx/len, wide=h*(L.small?.075:.1);
 g.save();g.translate((A[0]+B[0])/2,(A[1]+B[1])/2);g.rotate(Math.atan2(dy,dx));g.scale(1,wide*1.7/(len/2));
 const band=g.createRadialGradient(0,0,0,0,0,len/2);band.addColorStop(0,'rgba(178,186,236,.17)');band.addColorStop(.55,'rgba(150,160,220,.08)');band.addColorStop(1,'rgba(150,160,220,0)');
 g.fillStyle=band;g.beginPath();g.arc(0,0,len/2,0,TAU);g.fill();g.restore();
 const [gx,gy,gr]=L.gap, clear=(x,y)=>Math.hypot(x-gx,y-gy)>gr*1.15;
 for(const [u,n,s] of NIGHT_DUST){const x=A[0]+dx*u+nx*n*wide, y=A[1]+dy*u+ny*n*wide;if(!clear(x,y))continue;
  g.fillStyle=`rgba(215,222,255,${((.1+.28*s)*(1-Math.abs(n)*.85)).toFixed(3)})`;g.fillRect(x,y,.9,.9);}
 for(const [u,v,s,warm] of NIGHT_STARS){const x=u*w, y=v*(L.gy-8);if(!clear(x,y))continue;
  const fade=clamp((L.gy-y)/(h*.2)), r=.45+1.5*s**5, col=nightMix([200,214,255],[255,224,190],warm), a=(.3+.7*s)*fade;
  if(s>.965){const halo=g.createRadialGradient(x,y,0,x,y,r*6);halo.addColorStop(0,nightRgb(col,.35*fade));halo.addColorStop(1,nightRgb(col,0));g.fillStyle=halo;g.fillRect(x-r*6,y-r*6,r*12,r*12);
   g.strokeStyle=nightRgb(col,.3*fade);g.lineWidth=.7;trace(g,[[x-r*5,y],[x+r*5,y]]);g.stroke();trace(g,[[x,y-r*5],[x,y+r*5]]);g.stroke();}
  g.beginPath();g.arc(x,y,r,0,TAU);g.fillStyle=nightRgb(col,a.toFixed(3));g.fill();}
 return nightKeep(NIGHT.sky,key,c);
}
function nightDot(ctx,x,y,r,a){
 const g=ctx.createRadialGradient(x,y,0,x,y,r*2.6);g.addColorStop(0,`rgba(255,253,244,${a})`);g.addColorStop(.3,`rgba(255,236,196,${a*.8})`);g.addColorStop(.45,`rgba(255,220,160,${a*.25})`);g.addColorStop(1,'rgba(255,214,150,0)');
 ctx.fillStyle=g;ctx.fillRect(x-r*2.6,y-r*2.6,r*5.2,r*5.2);
}
function nightTag(ctx,value,x,y,{align='center',size=11,color='rgba(228,234,255,.9)',back='rgba(5,9,24,.72)',weight=600}={}){
 ctx.font=`${weight} ${size}px ${FONT}`;const width=ctx.measureText(value).width, left=align==='right'?x-width:align==='center'?x-width/2:x;
 ctx.fillStyle=back;ctx.beginPath();ctx.roundRect?ctx.roundRect(left-6,y-size*.8,width+12,size*1.6,size*.8):ctx.rect(left-6,y-size*.8,width+12,size*1.6);ctx.fill();
 text(ctx,value,x,y,{align,size,weight,color});
}
// You, as a silhouette sitting on the hilltop: knees up, leaning back on one arm, head tipped up to the sky. The head
// sits where the sight lines meet; a faint rim of skylight keeps the figure readable against the dark hill.
function nightPerson(ctx,x,feet,s,col,rim){
 const hx=x-s*.09, hy=feet-s*.93, hip=[x+s*.06,feet-s*.09], shoulder=[hx-s*.02,hy+s*.21];
 const knee=[x+s*.34,feet-s*.55], foot=[x+s*.6,feet-s*.04], hand=[x-s*.42,feet-s*.03];
 const body=grow=>{
  const limb=(pts,width)=>{ctx.lineWidth=width+grow;trace(ctx,pts);ctx.stroke();};
  limb([hip,knee,foot],s*.15);
  limb([shoulder,hip],s*.25);
  // Leaning back on a straight arm.
  limb([shoulder,hand],s*.1);
  // The near arm rests across the knee.
  limb([[shoulder[0]+s*.04,shoulder[1]+s*.06],[x+s*.22,feet-s*.38],[knee[0]+s*.04,knee[1]+s*.02]],s*.1);
  // Head tipped back, chin up.
  ctx.beginPath();ctx.ellipse(hx,hy,s*.13+grow/2,s*.14+grow/2,-.5,0,TAU);ctx.fill();
  ctx.beginPath();ctx.moveTo(hx+s*.06,hy+s*.05);ctx.lineTo(hx+s*.2+grow/2,hy-s*.02);ctx.lineTo(hx+s*.1,hy-s*.1);ctx.closePath();ctx.fill();};
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 if(rim){ctx.strokeStyle=rim;ctx.fillStyle=rim;body(2.4);}
 ctx.strokeStyle=col;ctx.fillStyle=col;body(0);ctx.restore();
}
function nightGround(ctx,w,h,L,blaze){
 const far=x=>L.gy-h*.042+h*.016*Math.sin(x/w*6.3+1.1)+h*.011*Math.sin(x/w*15.7+.4);
 const near=x=>L.gy+((x-L.cx)/(w*.5))**2*h*(L.small?.06:.085)+h*.005*Math.sin((x-L.cx)/w*21);
 const shape=(f,col)=>{ctx.beginPath();ctx.moveTo(0,h);for(let x=0;x<=w+4;x+=4)ctx.lineTo(x,f(x));ctx.lineTo(w,h);ctx.closePath();ctx.fillStyle=col;ctx.fill();};
 const glow=ctx.createLinearGradient(0,L.gy-h*.14,0,L.gy);glow.addColorStop(0,'rgba(80,100,170,0)');glow.addColorStop(1,`rgba(80,100,170,${.2*(1-blaze)})`);
 ctx.fillStyle=glow;ctx.fillRect(0,L.gy-h*.14,w,h*.14);
 shape(far,nightRgb(nightMix([16,24,50],[150,118,96],blaze)));
 shape(near,nightRgb(nightMix([6,9,19],[52,40,34],blaze)));
 ctx.beginPath();for(let x=0;x<=w+4;x+=4)x?ctx.lineTo(x,near(x)):ctx.moveTo(x,near(x));
 ctx.strokeStyle=blaze>0?`rgba(255,238,205,${.85*blaze})`:'rgba(140,160,230,.2)';ctx.lineWidth=1.2;ctx.stroke();
 // Two pines on the hillside.
 const dark=nightRgb(nightMix([4,6,14],[40,30,26],blaze));ctx.fillStyle=dark;
 for(const [fx,fh] of [[L.small?.34:.27,L.small?.13:.16],[L.small?.42:.31,L.small?.09:.11]]){
  const tx=L.cx+w*fx, ty=near(tx)+2, th=h*fh;ctx.fillRect(tx-th*.025,ty-th*.2,th*.05,th*.22);
  for(let i=0;i<4;i++){const y0=ty-th*.14-i*th*.19, wd=th*(.27-.05*i);ctx.beginPath();ctx.moveTo(tx-wd,y0);ctx.lineTo(tx,y0-th*.36);ctx.lineTo(tx+wd,y0);ctx.closePath();ctx.fill();}}
 nightPerson(ctx,L.cx,L.gy+1,L.s,dark,blaze>.5?null:'rgba(150,170,240,.22)');
}
function drawNight(ctx,w,h,spec,st){
 const plan=nightPlan(st), L=nightLayout(w,h), F=['shells','bubble','end'].includes(plan.mode)?nightField(L,w,h):null, size=L.small?10:12, m=plan.mode, [ex,ey]=L.eye;
 NIGHT.mode=m;
 let night=1, blaze=0, diagram=0, bg=1;
 if(m==='night')night=plan.night;
 // Live: the eye judges brightness by ratios, so the glow follows the covered share on a log scale, from a
 // ten-thousandth (no visible glow) to all of it; the readout gives the real share.
 if(m==='live'){const c=Physics.nightCover(plan.years);blaze=c>0?clamp(1+Math.log10(c)/4):0;bg=plan.years>0?1:0;}
 if(m==='shells'){diagram=1;bg=.35;blaze=smooth((plan.reach-.72)/.22);}
 if(m==='bubble'){diagram=1;bg=.35;blaze=1-plan.fade;}
 if(m==='end'){diagram=1-plan.back;bg=.35+.65*plan.back;}
 // The sky: dusk to night, then the stars and the Milky Way.
 const sky=ctx.createLinearGradient(0,0,0,L.gy);
 sky.addColorStop(0,nightRgb(nightMix([38,58,112],[3,6,18],night)));sky.addColorStop(.62,nightRgb(nightMix([110,100,142],[8,13,34],night)));sky.addColorStop(1,nightRgb(nightMix([240,164,112],[22,32,64],night)));
 ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
 const starsOn=bg*smooth((night-.25)/.6);
 if(starsOn>0){ctx.save();ctx.globalAlpha=starsOn;ctx.drawImage(nightStarsLayer(w,h,L),0,0,w,h);ctx.restore();}
 const lit=m==='bubble'?plan.grow*L.H:Infinity, shown=m==='shells'?plan.shells*F.K:F?F.K:0, NEAR=3, FAR=6, hl=m==='shells'?plan.compare:0;
 if(diagram>0){
  ctx.save();ctx.globalAlpha=diagram;
  // The shells, then their stars: the same size everywhere, each looking dimmer from farther away.
  for(let k=1;k<=F.K;k++){const on=clamp(shown-k+1);if(on<=0)break;const focus=k===NEAR||k===FAR;
   ctx.beginPath();ctx.ellipse(ex,ey,k*L.ax,k*L.ay,0,Math.PI,TAU);ctx.strokeStyle=`rgba(150,172,255,${((.13+(focus?.4*hl:0))*on*(1-(focus?0:.6*hl))*(k>lit?.5:1)).toFixed(3)})`;ctx.lineWidth=focus&&hl>0?1.5:1;ctx.stroke();}
  if(m==='bubble'&&lit>0){
   // The bubble whose light has had time to reach you since the beginning.
   const fill=ctx.createRadialGradient(ex,ey,0,ex,ey,lit*Math.max(L.ax,L.ay));fill.addColorStop(0,'rgba(120,150,255,.03)');fill.addColorStop(1,'rgba(120,150,255,.12)');
   ctx.beginPath();ctx.ellipse(ex,ey,lit*L.ax,lit*L.ay,0,Math.PI,TAU);ctx.closePath();ctx.fillStyle=fill;ctx.fill();
   ctx.beginPath();ctx.ellipse(ex,ey,lit*L.ax,lit*L.ay,0,Math.PI,TAU);ctx.strokeStyle='rgba(255,214,150,.75)';ctx.lineWidth=1.6;ctx.stroke();}
  const front=m==='shells'?plan.reach/.7*(F.far+.4):0;
  const ended=new Set(F.hits.filter(x=>front>=x.star.k).map(x=>x.star));
  for(const s of F.stars){const on=clamp(shown-s.k+1);if(on<=0)continue;const [x,y]=s.p;if(y<-10||x<-10||x>w+10)continue;
   const focus=s.k===NEAR||s.k===FAR, a=on*Math.min(1,1.6/Math.sqrt(s.k))*(1-(focus?0:.6*hl));
   // Beyond the bubble the stars are there, but their light has not arrived: faint marks, rings for those whose light is shown.
   if(s.k>lit){if(m==='bubble'&&plan.way>0&&F.pulses.includes(s)){ctx.beginPath();ctx.arc(x,y,L.rho*1.1,0,TAU);ctx.strokeStyle=`rgba(255,214,150,${(.55*plan.way).toFixed(3)})`;ctx.lineWidth=1;ctx.stroke();}
    else{ctx.beginPath();ctx.arc(x,y,L.rho*.55,0,TAU);ctx.fillStyle='rgba(170,185,240,.16)';ctx.fill();}continue;}
   nightDot(ctx,x,y,L.rho*(ended.has(s)?1.25:1),ended.has(s)?1:a);}
  if(front>0){
   // Sight lines spread across the sky; each ends on the first star it meets.
   ctx.lineWidth=1.1;
   for(const {star} of F.hits){const f=clamp(front/star.k), [x,y]=star.p;
    trace(ctx,[[ex,ey],[ex+(x-ex)*f,ey+(y-ey)*f]]);ctx.strokeStyle='rgba(255,226,170,.5)';ctx.stroke();}}
  if(m==='bubble'&&plan.way>0){
   // Light from stars beyond the bubble, still on its way toward you.
   for(const s of F.pulses){const [x,y]=s.p, d=Math.min(.3+plan.travel*.22,s.k-L.H-.6), f=d/s.k, px=x+(ex-x)*f, py=y+(ey-y)*f;
    ctx.save();ctx.globalAlpha*=plan.way;const g=ctx.createLinearGradient(x,y,px,py);g.addColorStop(0,'rgba(255,214,150,0)');g.addColorStop(1,'rgba(255,214,150,.75)');
    trace(ctx,[[x,y],[px,py]]);ctx.strokeStyle=g;ctx.lineWidth=1.6;ctx.stroke();nightDot(ctx,px,py,L.small?1.8:2.4,1);ctx.restore();}}
  if(m==='bubble'&&plan.look>0){
   // Sight lines again: a few end on stars inside the bubble; the rest cross it and find only darkness.
   ctx.lineWidth=1.1;
   for(const [j,{th,star}] of F.hits.entries()){if(j%2)continue;const inner=star.k<=L.H, k=(inner?star.k:L.H+1.4)*plan.look, [tx,ty]=inner?star.p:F.pos(L.H+1.4,th);
    const f=clamp(k/(inner?star.k:L.H+1.4)), px=ex+(tx-ex)*f, py=ey+(ty-ey)*f, g=ctx.createLinearGradient(ex,ey,tx,ty);
    g.addColorStop(0,'rgba(255,226,170,.5)');g.addColorStop(inner?1:L.H/(L.H+1.4),'rgba(255,226,170,.5)');g.addColorStop(1,inner?'rgba(255,226,170,.5)':'rgba(255,226,170,0)');
    trace(ctx,[[ex,ey],[px,py]]);ctx.strokeStyle=g;ctx.stroke();}}
  ctx.restore();}
 // The blaze: warm gold as it grows, so the sky brightens like sunlight rather than greying.
 if(blaze>0){const top=nightMix([255,196,120],[255,252,243],blaze), low=nightMix([255,170,90],[255,228,176],blaze), b=ctx.createLinearGradient(0,0,0,L.gy);
  b.addColorStop(0,nightRgb(top,(blaze**1.6).toFixed(3)));b.addColorStop(1,nightRgb(low,(blaze**.6).toFixed(3)));ctx.fillStyle=b;ctx.fillRect(0,0,w,L.gy+h*.02);}
 // The oldest light comes in from far away, stretching as space expands, from gold through red to out of sight.
 let wave=null;
 if(m==='end'&&plan.wave>0){
  const u=plan.wave, P0=[w*(L.small?.16:.2),h*(L.small?.07:.09)], P1=[ex+L.s*.05,ey-L.s*.25], dx=P1[0]-P0[0], dy=P1[1]-P0[1], len=Math.hypot(dx,dy), ux=dx/len, uy=dy/len;
  const reach=len*(.06+.92*smooth(u)), lam=(L.small?8:10)*(1+3.2*u), amp=L.small?3.4:4.4, col=nightMix(nightMix([255,224,150],[244,104,64],u*1.7),[214,84,96],u*1.7-.7), alpha=1-.7*smooth(u);
  ctx.beginPath();for(let d=0;d<=reach;d+=1.2){const off=amp*Math.sin(TAU*(d-reach)/lam), x=P0[0]+ux*d-uy*off, y=P0[1]+uy*d+ux*off;d?ctx.lineTo(x,y):ctx.moveTo(x,y);}
  ctx.strokeStyle=nightRgb(col,alpha.toFixed(3));ctx.lineWidth=2.1;ctx.lineCap='round';ctx.stroke();
  wave={P0,head:[P0[0]+ux*reach,P0[1]+uy*reach],u,ux,uy};}
 nightGround(ctx,w,h,L,blaze);
 if(!st.labels||m==='thumb')return;
 const ink=blaze>.5?'rgba(52,38,24,.82)':'rgba(226,232,255,.82)';
 if(m==='night'&&plan.gap>0){const [gx,gy,gr]=L.gap;ctx.save();ctx.globalAlpha=plan.gap;ctx.setLineDash([3,4]);ctx.beginPath();ctx.arc(gx,gy,gr,0,TAU);ctx.strokeStyle='rgba(200,212,255,.55)';ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);
  text(ctx,'dark between stars',gx,gy+gr+(L.small?12:15),{align:'center',size,weight:600,color:'rgba(226,232,255,.85)'});ctx.restore();}
 if(hl>.05){ctx.save();ctx.globalAlpha=hl;
  nightTag(ctx,'nearer shell',ex,ey-NEAR*L.ay-(L.small?9:11),{size});
  nightTag(ctx,'more stars, each dimmer',ex,ey-FAR*L.ay-(L.small?9:11),{size});ctx.restore();}
 if(m==='shells'&&blaze>.5){ctx.save();ctx.globalAlpha=smooth((blaze-.5)/.4);text(ctx,'as bright as the Sun',w/2,h*(L.small?.2:.17),{align:'center',size:size+3,weight:700,color:'rgba(120,70,10,.85)'});ctx.restore();}
 if(m==='live'&&Physics.nightCover(plan.years)>.99)text(ctx,'as bright as the Sun',w/2,h*(L.small?.2:.17),{align:'center',size:size+3,weight:700,color:'rgba(120,70,10,.85)'});
 if(m==='bubble'&&plan.grow>.6){ctx.save();ctx.globalAlpha=smooth((plan.grow-.6)/.3);nightTag(ctx,'13.8 billion light-years',ex,ey-L.H*L.ay-(L.small?10:12),{size,color:'rgba(255,222,170,.95)'});ctx.restore();}
 if(m==='bubble'&&plan.way>0&&F.pulses.length){
  // The pulse nearest the upper right whose label stays clear of the bubble's label and inside the stage.
  const where=s=>{const d=Math.min(.3+plan.travel*.22,s.k-L.H-.6), f=d/s.k;return [s.p[0]+(ex-s.p[0])*f,s.p[1]+(ey-s.p[1])*f];};
  const clear=s=>{const [x,y]=where(s);return y<ey-L.H*L.ay-(L.small?40:34)&&y>30;};
  const s=[...F.pulses].sort((a,b)=>Math.abs(a.a-.75)-Math.abs(b.a-.75)).find(clear)||F.pulses[0], [px,py]=where(s);
  ctx.font=`600 ${size}px ${FONT}`;const right=px+16+ctx.measureText('light still on its way').width<w-6;
  ctx.save();ctx.globalAlpha=plan.way;nightTag(ctx,'light still on its way',right?px+10:px-10,py-(L.small?12:14),{align:right?'left':'right',size});ctx.restore();}
 if(wave){ctx.save();ctx.globalAlpha=smooth(wave.u/.15);text(ctx,'oldest light',wave.P0[0]+(L.small?6:10),wave.P0[1]-(L.small?11:13),{size,weight:600,color:'rgba(255,214,160,.9)'});ctx.restore();
  if(wave.u>.6){ctx.save();ctx.globalAlpha=smooth((wave.u-.6)/.25);text(ctx,'stretched out of sight',wave.head[0]-(L.small?10:16),wave.head[1]-(L.small?16:20),{align:'right',size,weight:600,color:'rgba(226,232,255,.85)'});ctx.restore();}}
}

// Why a positive test for a rare disease is usually a false alarm. A thousand people take a test that is right 99
// times in 100 for a disease that 1 person in 1,000 has. The test catches the sick person but also wrongly flags about
// 10 of the 999 healthy ones, so of the 11 who test positive only 1 is sick; with 1 in 100 sick, right positives match
// the false alarms. Dots are the expected numbers rounded to whole people (Physics.rateTest); after playback the viewer
// sets how common the disease is.
const RATE={mode:''};
// Seats in the grid, shuffled once: the sick take seats from the front of the list, false alarms from the back.
const RATE_SEATS=(()=>{const s=[...Array(1000).keys()];let x=11;for(let i=999;i>0;i--){x=(x*1103515245+12345)%2147483648;const j=x%(i+1);[s[i],s[j]]=[s[j],s[i]];}return s;})();
function ratePlan(st){
 const c=timeline?.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since??0);
 if(st.since===undefined)return {mode:'thumb',sick:1,caught:1,red:1,ring:1,alarms:10,gather:1,t:0};
 if(st.live){const p=Physics.ratePrevalence(st.mass), r=Physics.rateTest(p);
  return {mode:'live',p,share:r.share,sick:Math.round(r.sick),caught:Math.round(r.caught),red:1,ring:1,alarms:Math.round(r.alarms),gather:1,t:st.t||0};}
 // 1: a thousand people; with the first sentence one of them turns red.
 if(st.stage===0)return {mode:'meet',sick:1,caught:1,red:smooth((t-at(0)-1)/.6),ring:0,alarms:0,gather:0,t};
 // 2: the test catches the sick person, then with the second sentence wrongly flags ten healthy people, one by one.
 if(st.stage===1)return {mode:'test',sick:1,caught:1,red:1,ring:smooth((t-at(0)-.8)/.5),alarms:clamp((t-at(1)-.8)/3)*10,gather:0,t};
 // 3: everyone who tested positive gathers on the right, and the count of the sick among them follows.
 if(st.stage===2)return {mode:'gather',sick:1,caught:1,red:1,ring:1,alarms:10,gather:clamp((t-at(0)-.6)/2.4),count:smooth((t-at(0)-3.2)/.5),t};
 // 4: the healthy group is far bigger than the sick one; with the second sentence nine more people are sick, as if 1
 // in 100 had the disease: all are caught and join the positives, as many as the false alarms.
 const more=clamp((t-at(1)-1)/3)*9;
 return {mode:'common',sick:1+more,caught:1+more,red:1,ring:1,alarms:10,gather:1,count:1,healthy:smooth((t-at(0)-.4)/.6)*(1-smooth((t-at(1)-.2)/.5)),t};
}
function drawRate(ctx,w,h,spec,st){
 const plan=ratePlan(st), small=w<520, accent=ACCENT[spec.accent]||ACCENT.blue, red='#dc2626', ink='rgba(20,23,28,.8)', muted='rgba(20,23,28,.55)', size=small?10:12;
 RATE.mode=plan.mode;
 // The thousand seats: 40 across and 25 down, on the left of wide stages and at the top of phones.
 const s=small?Math.min(w*.86/40,h*.42/25):Math.min(w*.4/40,h*.56/25), gx=small?(w-40*s)/2:w*.07, gy=small?h*.1:h*.5-12.5*s;
 const seat=i=>[gx+(i%40+.5)*s,gy+(Math.floor(i/40)+.5)*s], dot=s*.3;
 const sick=Math.ceil(plan.sick-1e-9), caughtN=Math.ceil(plan.caught-1e-9), alarmN=Math.ceil(plan.alarms-1e-9);
 const sickSeats=RATE_SEATS.slice(0,sick), alarmSeats=Array.from({length:alarmN},(_,k)=>RATE_SEATS[999-k]);
 // Everyone who tested positive, sick first; each flies to its place in the group on the right, one after another.
 const positives=[...sickSeats.slice(0,caughtN).map((i,k)=>({i,sick:true,grow:k===0?1:clamp(plan.sick-k)})),...alarmSeats.map((i,k)=>({i,sick:false,grow:clamp(plan.alarms-k)}))];
 // The group on the right: the sick who tested positive on the top rows, the false alarms below, both from the left
 // edge, so their lengths compare like bars.
 const count=positives.length, per=small?12:14, room=small?h*.34:h*.66, nA=positives.filter(p=>p.sick).length, nB=count-nA;
 const la=Math.ceil(nA/per), lb=Math.ceil(nB/per), span=Math.max(0,la+lb-1+(la&&lb?.4:0));
 const gap=Math.min(small?24:28,room/(span+1),(small?w*.86:w*.4)/per), block={x:small?w/2:w*.76,y:small?h*.73:h*.5}, rr=Math.min(small?5:7,gap*.26), left=block.x-(per-1)/2*gap;
 const slot=k=>{const inA=k<nA, j=inA?k:k-nA, row=inA?Math.floor(j/per):la+(la?.4:0)+Math.floor(j/per);return [left+(j%per)*gap,block.y+(row-span/2)*gap];};
 const fly=k=>plan.mode==='common'&&k>0&&k<caughtN?clamp((positives[k].grow-.45)/.55):clamp(plan.gather*(count+3)/3-k/3);
 const flown=new Map(positives.map((p,k)=>[p.i,{p,k,f:fly(k)}]));
 // The grid: healthy people grey, the sick red; a ring marks a positive test.
 const healthyA=.2+.25*(plan.healthy||0);
 for(let i=0;i<1000;i++){const [x,y]=seat(i), f=flown.get(i)?.f||0;
  if(f>=1){ctx.beginPath();ctx.arc(x,y,dot*1.1,0,TAU);ctx.strokeStyle=rgba(accent,.4);ctx.lineWidth=1;ctx.stroke();continue;}
  const sk=sickSeats.indexOf(i);
  if(sk<0||f>0){if(f>0)continue;ctx.beginPath();ctx.arc(x,y,dot,0,TAU);ctx.fillStyle=`rgba(20,23,28,${healthyA})`;ctx.fill();continue;}
  const a=sk===0?plan.red:clamp((plan.sick-sk)/.45);
  ctx.beginPath();ctx.arc(x,y,dot*(1+.4*a),0,TAU);ctx.fillStyle=a<1?`rgba(20,23,28,${healthyA*(1-a)})`:red;ctx.fill();
  if(a>0&&a<1){ctx.beginPath();ctx.arc(x,y,dot*(1+.4*a),0,TAU);ctx.fillStyle=rgba(red,a);ctx.fill();}}
 const ringAt=(x,y,r,a)=>{if(a<=0)return;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.strokeStyle=rgba(accent,a);ctx.lineWidth=small?1.3:1.7;ctx.stroke();};
 positives.forEach((p,k)=>{const f=flown.get(p.i).f, [sx,sy]=seat(p.i), [tx,ty]=slot(k), e=smooth(f), x=sx+(tx-sx)*e, y=sy+(ty-sy)*e;
  const ring=p.sick?(k===0?plan.ring:clamp((p.grow-.25)/.2)):1, pop=p.sick?1:1+.8*(1-clamp((p.grow)/.25));
  if(!p.sick&&p.grow<=0)return;
  const r=dot+(rr-dot)*e;
  if(f>0){ctx.beginPath();ctx.arc(x,y,r*(p.sick?1.35:1),0,TAU);ctx.fillStyle=p.sick?red:'rgba(20,23,28,.42)';ctx.fill();}
  ringAt(x,y,(f>0?r*1.65:dot*2.1)*pop,ring*(p.sick?1:clamp(p.grow/.25)));});
 // Missed by the test: the few sick people without a ring stay in the grid.
 if(st.labels){
  // In the live view the heading gives the average number of sick people, which need not be whole.
  const avg=plan.mode==='live'?1000*plan.p:0, many=avg>=9.95||Math.abs(avg-Math.round(avg))<.05?Math.round(avg).toLocaleString('en-US'):avg.toFixed(1);
  const title=(plan.healthy||0)>.5?'999 healthy · 1 sick':`1,000 people · ${plan.mode==='common'&&plan.sick>1.01?10:plan.mode==='live'?many:1} sick`;
  text(ctx,title,gx,gy-(small?10:14),{size,weight:700,color:ink});
  if(plan.mode==='meet'&&plan.red>.5){const [x,y]=seat(RATE_SEATS[0]);pill(ctx,'sick',x+(small?9:12),y,{size,weight:700,color:red});}
  if(plan.mode==='test'&&plan.alarms>9.5)text(ctx,'1 found · 10 false alarms',gx,gy+25*s+(small?12:18),{size,weight:600,color:accent});
  const top=block.y-span/2*gap-rr*1.65-(small?10:13), bottom=block.y+span/2*gap+rr*1.65+(small?13:16);
  if(plan.gather>.3)text(ctx,'tested positive',left-rr,top,{size,weight:700,color:accent});
  if((plan.count||0)>.5||plan.mode==='live'||plan.mode==='thumb'){let right=positives.filter((p,k)=>p.sick&&fly(k)>=1).length, all=positives.filter((p,k)=>fly(k)>=1).length;
   // The live view gives the exact long-run share in the guide's own terms; the chapters count the dots.
   const share=plan.mode==='live'?plan.share:0, words=share<=0?'none are sick':share<.5?`1 in ${Math.round(1/share)} is sick`:`${Math.round(share*10)} in 10 are sick`;
   if(all)pill(ctx,plan.mode==='live'?words:`${right} of ${all} ${right===1?'is':'are'} sick`,left-rr,bottom,{size:size+1,weight:700,color:right||share>0?red:muted});}}
}

// Why 23 people are enough for a shared birthday to be likely. Someone shares your own birthday only about 6% of the
// time, from 22 chances; but a match can be between any two people, and 23 people make 253 pairs. As people arrive
// one at a time, each newcomer must miss every birthday already in the room, so the chance of a shared birthday
// passes one half with the 23rd person and reaches 97% with 50. Exact for 365 equally likely birthdays
// (Physics.birthdayShared); after playback the viewer sets how many people are in the room.
const BDAY={mode:''};
function bdayPlan(st){
 const c=timeline?.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since??0);
 const last=lines.length?at(lines.length-1):3;
 if(st.since===undefined)return {mode:'thumb',n:23,arrived:23,pairs:253,you:0,t:0};
 if(st.live){const n=Math.max(1,Math.round(1+59*clamp(st.mass)));return {mode:'live',n,arrived:n,pairs:n*(n-1)/2,you:0,t:st.t||0};}
 // 1: 23 people; with the first sentence the 22 chances that someone shares your birthday, one line each.
 if(st.stage===0)return {mode:'you',n:23,arrived:23,pairs:0,you:clamp((t-at(0)-1.2)/2)*22,t};
 // 2: every pair is a chance: all 253 lines, then with the second sentence the count, and with the third the chance
 // that any two match.
 if(st.stage===1){const count=smooth((t-at(1)-.2)/.5);return {mode:'pairs',n:23,arrived:23,pairs:22+clamp((t-at(0)-1)/3.5)*231,you:22,count,odds:lines.length>2?smooth((t-at(2)-.2)/.5):count,t};}
 // 3: people arrive one at a time through both sentences, each with lines to everyone already there, while the
 // chance of a shared birthday grows.
 if(st.stage===2){const a=1+clamp((t-at(0)-1)/Math.max(3,last+1.5-at(0)-1))*22;return {mode:'arrive',n:23,arrived:a,pairs:null,you:0,bar:1,t};}
 // 4: 27 more arrive, to 50 people and 1,225 pairs.
 const n=23+clamp((t-at(0)-.8)/3.2)*27;return {mode:'more',n,arrived:n,pairs:null,you:0,bar:1,t};
}
function drawBirthdays(ctx,w,h,spec,st){
 const plan=bdayPlan(st), small=w<520, accent=ACCENT[spec.accent]||ACCENT.blue, gold=ACCENT.gold, ink='rgba(20,23,28,.8)', muted='rgba(20,23,28,.55)', size=small?10:12;
 BDAY.mode=plan.mode;
 // The room: people evenly around a circle; when more arrive the circle makes room for them.
 const R=small?Math.min(w*.4,h*.27):h*.37, cx=small?w/2:w*.33, cy=small?h*.33:h*.5, N=Math.max(1,plan.n), whole=Math.ceil(N-1e-9);
 // While the room fills, everyone slides from the spacing for the people already there to the spacing that includes
 // the newcomer, who fades in at their own place, so no two people ever overlap.
 const base=Math.floor(N+1e-9), part=N-base, pos=k=>{const ang=n=>-Math.PI/2+TAU*k/n, a=part>1e-9&&k<base?ang(base)+(ang(base+1)-ang(base))*part:ang(part>1e-9?base+1:base);
  return [cx+R*Math.cos(a),cy+R*Math.sin(a)];};
 const arrived=plan.arrived, newest=Math.ceil(arrived-1e-9)-1, fresh=arrived-newest;
 const lineA=whole>30?.075:whole>23?.1:.13;
 // Lines between pairs. While people arrive, a newcomer's lines to everyone already there light up, then settle.
 ctx.lineWidth=whole>30?(small?.5:.7):small?.8:1;
 if(plan.mode==='you'||plan.mode==='pairs'){const total=plan.mode==='you'?Math.ceil(plan.you-1e-9):Math.ceil(plan.pairs-1e-9);let k=0;
  for(let i=0;i<23&&k<total;i++)for(let j=i+1;j<23&&k<total;j++,k++){const [x1,y1]=pos(i),[x2,y2]=pos(j), a=plan.mode==='you'?.4:i===0?.22:lineA*1.4;
   trace(ctx,[[x1,y1],[x2,y2]]);ctx.strokeStyle=rgba(accent,a*clamp((plan.mode==='you'?plan.you:plan.pairs)-k));ctx.stroke();}}
 else{const upto=Math.min(whole,Math.ceil(arrived-1e-9));
  for(let i=0;i<upto;i++)for(let j=i+1;j<upto;j++){const [x1,y1]=pos(i),[x2,y2]=pos(j), lit=plan.mode==='arrive'&&j===newest?.5*(1-smooth(fresh*1.2))+lineA:lineA;
   const grow=j===newest&&plan.mode!=='live'&&plan.mode!=='thumb'?clamp(fresh*2.5):1;trace(ctx,[[x1,y1],[x1+(x2-x1)*grow,y1+(y2-y1)*grow]]);ctx.strokeStyle=rgba(accent,lit);ctx.stroke();}}
 // People: dark dots; not yet arrived, faint; you, in blue, while the chapters are about your own birthday.
 const youShown=plan.mode==='you'||plan.mode==='pairs';
 for(let k=0;k<whole;k++){const [x,y]=pos(k), here=plan.mode==='arrive'?clamp(arrived-k):plan.mode==='more'?clamp(arrived-k):1;
  ctx.beginPath();ctx.arc(x,y,(small?3.6:5)*(k===0&&plan.mode==='you'?1.35:1),0,TAU);
  ctx.fillStyle=k===0&&youShown&&here>=1?accent:here>=1?'rgba(20,23,28,.72)':`rgba(20,23,28,${.16+.56*here})`;ctx.fill();}
 const people=Math.min(whole,Math.ceil(arrived-1e-9)), pairs=people*(people-1)/2;
 if(st.labels){
  if(plan.mode==='you'||plan.mode==='pairs'){const [x,y]=pos(0);text(ctx,'you',x,y-(small?12:15),{align:'center',size,weight:700,color:accent});}
  const centre=plan.mode==='you'?(plan.you>21.5?'22 pairs with you':''):plan.mode==='pairs'?(plan.count>.5?'253 pairs':''):`${pairs.toLocaleString('en-US')} pair${pairs===1?'':'s'}`;
  if(centre)pill(ctx,centre,cx,cy,{align:'center',size:size+1,weight:700,color:plan.mode==='you'?accent:ink});}
 // Two chances: that someone shares your own birthday, while the chapters are about you, and that any two people
 // match, which fades in with the pair count in chapter 2 and stays on its own afterwards. Each bar has a mark at one
 // half.
 const mine=plan.mode==='you'?1-Math.pow(364/365,Math.min(22,plan.you)):Physics.birthdayMine(people), shared=Physics.birthdayShared(people);
 const anyShow=plan.mode==='you'?0:plan.mode==='pairs'?plan.odds:1;
 const bx=small?w*.1:w*.62, bw=small?w*.7:w*.29, bh=small?11:15, rows=[[mine,'shares your birthday',small?h*.7:h*.4,accent,youShown?1:0],[shared,'any two match',small?h*.85:h*.6,gold,anyShow]];
 for(const [v,name,by,color,show] of rows){if(show<=0)continue;
  ctx.save();ctx.globalAlpha=show;
  ctx.fillStyle='rgba(20,23,28,.08)';ctx.beginPath();ctx.roundRect(bx,by-bh/2,bw,bh,bh/2);ctx.fill();
  if(v>0){ctx.fillStyle=rgba(color,.85);ctx.beginPath();ctx.roundRect(bx,by-bh/2,Math.max(bh,bw*v),bh,bh/2);ctx.fill();}
  trace(ctx,[[bx+bw/2,by-bh/2-4],[bx+bw/2,by+bh/2+4]]);ctx.strokeStyle='rgba(20,23,28,.5)';ctx.lineWidth=1.3;ctx.stroke();
  if(st.labels&&show>.5){text(ctx,name,bx,by-bh/2-(small?10:13),{size,weight:700,color:ink});
   text(ctx,v<.995?Math.round(v*100)+'%':(v*100).toFixed(1)+'%',bx+bw+(small?8:12),by,{size:size+1,weight:700,color});}
  ctx.restore();}
 const lowest=anyShow>.5?rows[1]:rows[0];
 if(st.labels&&(anyShow>.5||youShown))text(ctx,'half',bx+bw/2,lowest[2]+bh/2+(small?11:14),{align:'center',size:size-1,weight:600,color:muted});
}

// Why the sky is blue and sunsets are red. With no air, as on the Moon, the daytime sky is black. Light is a wave that
// shakes the electrons in each air molecule, and shaken electrons send light out in every direction; blue, a quicker
// wave than red, shakes them faster and is scattered about six times as much. So blue reaches you from all over the
// sky, while at sunset the light crosses so much air that most of its blue is scattered away before it arrives.
// Rayleigh scattering by clean air at sea level (Physics.skyThrough); after playback the viewer sets the Sun's height.
const SKY={mode:''};
// Fixed scattered positions, so the air, the sparks and the lines to the eye are the same at every frame.
const SKY_DOTS=(()=>{let x=5;const r=()=>{x=(x*1103515245+12345)%2147483648;return x/2147483648;};return Array.from({length:150},()=>[r(),r(),r()]);})();
function skyPlan(st){
 const c=timeline?.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since??0);
 if(st.since===undefined)return {mode:'thumb',air:1,t:2};
 if(st.live)return {mode:'live',sun:clamp(st.mass)*90,t:st.t||0};
 // 1: no air, as on the Moon: a black sky. With the second sentence the air arrives and the sky turns blue.
 if(st.stage===0)return {mode:'air',air:smooth((t-at(1)-.3)/1.5),t};
 // 2: one molecule, magnified, in red light and in blue light; the blue one sends out far more, labelled with the
 // sentence that says so (the last one).
 if(st.stage===1)return {mode:'shake',more:smooth((t-at(Math.max(1,lines.length-1))-.6)/.5),t};
 // 3: sunlight crosses the sky and the air sends blue off in all directions; with the second sentence, lines show
 // blue reaching your eyes from all over the sky.
 if(st.stage===2)return {mode:'scatter',air:1,eye:clamp((t-at(1)-.4)/2.4),t};
 // 4: the noon ray crosses little air; the sunset ray, drawn with the first sentence, crosses far more, and with the
 // second sentence its colour shows the blue being scattered away along the path.
 return {mode:'sunset',noon:smooth((t-at(0)-.4)/.8),dusk:clamp((t-at(0)-1.6)/1.6),tint:smooth((t-at(1)-.3)/1.4),t};
}
// The colour of light that has crossed m air masses of clean air, as 0-255 RGB.
function skyLight(m){
 const T=nm=>Math.exp(-Physics.skyDepth(nm)*m), r=T(700);
 return [255,Math.round(255*Math.pow(T(550)/r,.45)),Math.round(255*Math.pow(T(450)/r,.45))];
}
// A landscape under the sky in the box x, y, w, h: the sky is black with stars without air, blue with it (deep overhead,
// pale at the horizon), and gold near the horizon at dusk. Without air the ground is grey and cratered, with the Earth
// hanging in the black sky; with air there are hazy hills, green ground and a tree. air and dusk run from 0 to 1; sun
// gives the Sun's place as fractions of the box; behind draws things in the sky that the hills hide. Returns the
// height of the near ground at a fraction across the box.
// The height of the near ground in a landscape box at top y and height h, at a fraction u across it.
const skyNear=(y,h)=>u=>y+h*.86-h*.022*(.6*Math.sin(.7*u*TAU+2.4)+.4*Math.sin(1.61*u*TAU+4.08));
function skyLand(ctx,x,y,w,h,{air=1,dusk=0,sun=[.12,.2],sunR=20,sunCol=[255,250,240],tree=true,behind=null}={}){
 const mix=(a,b,f)=>a.map((v,i)=>Math.round(v+(b[i]-v)*f)), c=a=>`rgb(${a})`, horizon=y+h*.74;
 const top=mix(mix([5,7,14],[44,104,196],air),[34,44,100],dusk), mid=mix(mix([9,11,20],[112,166,228],air),[154,110,150],dusk), low=mix(mix([14,16,26],[200,226,247],air),[255,160,86],dusk);
 const g=ctx.createLinearGradient(0,y,0,horizon);g.addColorStop(0,c(top));g.addColorStop(.6,c(mid));g.addColorStop(1,c(low));ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
 const stars=1-air;
 if(stars>.02){for(const [u,v,z] of SKY_DOTS.slice(60,130)){ctx.beginPath();ctx.arc(x+w*u,y+h*.66*v,z<.2?1.4:.8,0,TAU);ctx.fillStyle=`rgba(255,255,255,${stars*(.3+.6*z)})`;ctx.fill();}
  // The Earth seen from the Moon: half lit, with a white swirl of cloud.
  const ex=x+w*.8, ey=y+h*.2, er=Math.max(6,h*.05);ctx.globalAlpha=stars;
  ctx.beginPath();ctx.arc(ex,ey,er,0,TAU);ctx.fillStyle='#3b82c4';ctx.fill();
  ctx.beginPath();ctx.ellipse(ex-er*.2,ey-er*.25,er*.55,er*.18,-.4,0,TAU);ctx.fillStyle='rgba(255,255,255,.8)';ctx.fill();
  ctx.beginPath();ctx.arc(ex,ey,er,-Math.PI/2,Math.PI/2);ctx.ellipse(ex,ey,er*.35,er,0,Math.PI/2,-Math.PI/2,true);ctx.fillStyle='rgba(5,7,14,.7)';ctx.fill();ctx.globalAlpha=1;}
 // The Sun, with a glow of light scattered by air around it, so no glow without air.
 const sx=x+w*sun[0], sy=y+h*sun[1];
 if(air>0){const gc=mix([255,248,225],[255,176,96],dusk), glow=ctx.createRadialGradient(sx,sy,0,sx,sy,sunR*(4+3*dusk));
  glow.addColorStop(0,`rgba(${gc},${.9*air})`);glow.addColorStop(1,`rgba(${gc},0)`);ctx.fillStyle=glow;ctx.fillRect(sx-sunR*7,sy-sunR*7,sunR*14,sunR*14);}
 ctx.beginPath();ctx.arc(sx,sy,sunR,0,TAU);ctx.fillStyle=c(sunCol);ctx.fill();
 behind?.();
 const ridge=(base,amp,f,ph)=>u=>base-amp*(.6*Math.sin(f*u*TAU+ph)+.4*Math.sin(2.3*f*u*TAU+ph*1.7));
 const fill=(at,col)=>{ctx.beginPath();ctx.moveTo(x,y+h);for(let i=0;i<=60;i++)ctx.lineTo(x+w*i/60,at(i/60));ctx.lineTo(x+w,y+h);ctx.closePath();ctx.fillStyle=c(col);ctx.fill();};
 fill(ridge(horizon,h*.05,1.1,.8),mix(mix([62,62,68],[150,182,188],air),[112,84,108],dusk));
 const near=skyNear(y,h);
 fill(near,mix(mix([112,112,116],[126,172,100],air),[82,92,70],dusk));
 // Craters on the Moon's ground.
 if(stars>.02)for(const [u,v,z] of SKY_DOTS.slice(10,22)){const cx=x+w*u, cy=near(u)+h*(.03+.09*v), r=w*(.012+.03*z);
  ctx.beginPath();ctx.ellipse(cx,cy,r,r*.32,0,0,TAU);ctx.fillStyle=`rgba(60,60,66,${.5*stars})`;ctx.fill();
  ctx.beginPath();ctx.ellipse(cx,cy+r*.06,r*.8,r*.22,0,0,Math.PI);ctx.fillStyle=`rgba(170,170,176,${.45*stars})`;ctx.fill();}
 // A tree on the Earth's ground.
 if(tree&&air>.02){const tx=x+w*.86, ty=near(.86), s=h*.1;ctx.globalAlpha=air;
  ctx.fillStyle=c(mix([92,68,48],[60,44,40],dusk));ctx.fillRect(tx-s*.06,ty-s*.7,s*.12,s*.72);
  for(const [dx,dy,r] of [[0,-.95,.42],[-.28,-.72,.3],[.28,-.72,.3]]){ctx.beginPath();ctx.arc(tx+dx*s,ty+dy*s,r*s,0,TAU);ctx.fillStyle=c(mix([70,128,72],[56,70,52],dusk));ctx.fill();}
  ctx.globalAlpha=1;}
 return u=>near(u);
}
// A round view of what you see when the Sun is e degrees up: its colour and the sky's follow the air its light crosses.
function skyView(ctx,cx,cy,r,e,dusk,sunCol){
 ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.clip();
 skyLand(ctx,cx-r,cy-r,2*r,2*r,{air:1,dusk,sun:[.42,.72-.58*clamp(e/90)],sunR:r*.12,sunCol,tree:true});
 ctx.restore();ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=3;ctx.stroke();
}
function drawSky(ctx,w,h,spec,st){
 const plan=skyPlan(st), small=w<520, ink='rgba(20,23,28,.8)', muted='rgba(20,23,28,.55)', size=small?10:12, T=plan.t;
 const blue=ACCENT.blue, red='#dc2626';
 SKY.mode=plan.mode;
 if(plan.mode==='shake'){
  // One molecule, magnified, twice: a red wave and a blue wave pass at the same speed; the blue one is shorter and
  // quicker, so it shakes the electrons faster, and the rings of light they send out are about six times as bright.
  const x0=w*.08, x1=w*.92, mx=w*(small?.5:.42), speed=small?60:90, lanes=[[red,'red light',small?h*.28:h*.3,small?70:120,1],[blue,'blue light',small?h*.66:h*.66,(small?70:120)*450/700,Physics.skyScatter(450)]];
  // A pale sky behind the magnified molecule, so this chapter sits in the same world as the others.
  const pale=ctx.createLinearGradient(0,h*.03,0,h*.97);pale.addColorStop(0,'#eaf2fd');pale.addColorStop(1,'#f6f9fe');
  ctx.beginPath();ctx.roundRect(w*.03,h*.03,w*.94,h*.94,16);ctx.fillStyle=pale;ctx.fill();
  for(const [color,name,y,len,bright] of lanes){
   const k=TAU/len, field=x=>Math.sin(k*(x-x0-speed*T));
   // Rings: one per wave, growing at the wave's speed and fading out before they reach the other lane. Sunlight
   // shakes the electrons every way across its path, so they send light out in every direction: forward and back
   // most, sideways half as much. The blue molecule's rings are brighter, thicker and reach farther, as it sends out
   // about six times as much light.
   const strong=bright>1, period=len/speed, reach=h*(strong?.22:.12);
   for(let j=0;j<6;j++){const age=(T%period)+j*period, r=age*speed;if(r<6||r>reach)continue;const a0=(strong?.9:.3)*(1-(r/reach)**2);
    for(let q=0;q<48;q++){const th=q/48*TAU, way=(1+Math.cos(th)**2)/2;
     ctx.beginPath();ctx.arc(mx,y,r,th,th+TAU/48+.005);ctx.strokeStyle=rgba(color,a0*way);ctx.lineWidth=(small?1.6:2.4)*(strong?1.8:1);ctx.stroke();}}
   const pts=[];for(let x=x0;x<=x1;x+=3)pts.push([x,y-(small?14:20)*field(x)]);
   trace(ctx,pts);ctx.strokeStyle=rgba(color,.8);ctx.lineWidth=2;ctx.stroke();
   // The molecule: a soft cloud of electrons around its nucleus, pushed up and down by the wave's field.
   const shift=(small?5:7)*field(mx), cr=small?15:24, cloud=ctx.createRadialGradient(mx,y-shift,0,mx,y-shift,cr);
   cloud.addColorStop(0,'rgba(99,102,241,.42)');cloud.addColorStop(.7,'rgba(99,102,241,.16)');cloud.addColorStop(1,'rgba(99,102,241,0)');
   ctx.beginPath();ctx.arc(mx,y-shift,cr,0,TAU);ctx.fillStyle=cloud;ctx.fill();
   ctx.beginPath();ctx.arc(mx,y,small?2.6:3.4,0,TAU);ctx.fillStyle='rgba(20,23,28,.8)';ctx.fill();
   if(st.labels)text(ctx,name,x0,y-h*.13,{size,weight:700,color});}
  if(st.labels){text(ctx,'air molecules, magnified',w/2,h*.07,{align:'center',size,weight:700,color:muted});
   if(plan.more>.5)pill(ctx,'sends out about 6× more',mx+(small?30:70),lanes[1][2]-h*.12,{size:size+1,weight:700,color:blue});}
  return;
 }
 if(plan.mode==='sunset'||plan.mode==='live'){
  // Space, and a slice of the Earth with the glow of its air. Light from the Sun crosses the air to you: from overhead
  // it crosses little; from the horizon, far more, losing its blue on the way. A round view shows what you see.
  const Re=small?h*.75:h*1.6, H=small?h*.09:h*.13, ox=small?w*.66:w/2, oy=small?h*.62:h*.74, ecx=ox, ecy=oy+Re, gapOut=small?14:110;
  const path=e=>{const a=e*Math.PI/180, d=[-Math.cos(a),-Math.sin(a)], b=Re*Math.sin(a), L=Math.sqrt((Re+H)**2-Re*Re*Math.cos(a)**2)-b;return {d,L};};
  const bx=w*.02, by=h*.03, bw=w*.96, bh=h*.94;
  ctx.save();ctx.beginPath();ctx.roundRect(bx,by,bw,bh,16);ctx.clip();
  const space=ctx.createLinearGradient(0,by,0,by+bh);space.addColorStop(0,'#090e1f');space.addColorStop(1,'#1b2648');ctx.fillStyle=space;ctx.fillRect(bx,by,bw,bh);
  for(const [u,v,z] of SKY_DOTS.slice(0,80)){ctx.beginPath();ctx.arc(bx+bw*u,by+bh*.62*v,z<.15?1.3:.7,0,TAU);ctx.fillStyle=`rgba(255,255,255,${.2+.5*z})`;ctx.fill();}
  const atm=ctx.createRadialGradient(ecx,ecy,Re,ecx,ecy,Re+H);atm.addColorStop(0,'rgba(132,190,255,.8)');atm.addColorStop(.55,'rgba(110,170,250,.35)');atm.addColorStop(1,'rgba(110,170,250,0)');
  ctx.beginPath();ctx.arc(ecx,ecy,Re+H,0,TAU);ctx.fillStyle=atm;ctx.fill();
  const sea=ctx.createLinearGradient(0,oy,0,oy+Re*.45);sea.addColorStop(0,'#3274b8');sea.addColorStop(1,'#132f5c');
  ctx.beginPath();ctx.arc(ecx,ecy,Re,0,TAU);ctx.fillStyle=sea;ctx.fill();
  ctx.save();ctx.beginPath();ctx.arc(ecx,ecy,Re,0,TAU);ctx.clip();
  ctx.beginPath();ctx.ellipse(ox+w*.03,oy+Re*.07,w*(small?.32:.2),Re*.12,0,0,TAU);ctx.fillStyle='#6d9a5a';ctx.fill();
  ctx.beginPath();ctx.ellipse(ox-w*(small?.5:.3),oy+Re*.2,w*.12,Re*.06,.2,0,TAU);ctx.fillStyle='#5f8a52';ctx.fill();ctx.restore();
  drawPerson(ctx,ox,oy,small?5:7,'#14171c');
  const ray=(e,show,tint,label)=>{if(show<=0)return;const {d,L}=path(e), m=Physics.skyAirMass(e), sx=ox+d[0]*(L+gapOut), sy=oy+d[1]*(L+gapOut), ex=ox+d[0]*L, ey=oy+d[1]*L;
   // From the Sun to the edge of the air the light is unchanged; inside the air its colour follows the air crossed.
   const steps=24, upto=show;
   ctx.lineWidth=small?4:6;ctx.lineCap='round';
   const inside=clamp(upto*2-1), tip=[ex-d[0]*L*inside,ey-d[1]*L*inside];
   trace(ctx,[[sx,sy],[sx+(ex-sx)*Math.min(1,upto*2),sy+(ey-sy)*Math.min(1,upto*2)]]);ctx.strokeStyle='rgba(255,252,240,.98)';ctx.lineWidth=small?4:6;ctx.stroke();
   // Inside the air the light's colour follows the air crossed so far, drawn as one smooth stroke.
   if(inside>0){const gr=ctx.createLinearGradient(ex,ey,tip[0],tip[1]);
    for(let i=0;i<=steps;i++){const f=i/steps, [r,g,b]=skyLight(m*(tint?f*inside:0));gr.addColorStop(f,`rgb(${r},${g},${b})`);}
    trace(ctx,[[ex,ey],tip]);ctx.strokeStyle=gr;ctx.stroke();}
   // The Sun itself, in space, gives out white light; only the light that crosses the air changes colour.
   const R=small?11:16, glow=ctx.createRadialGradient(sx,sy,0,sx,sy,R*3.4);
   glow.addColorStop(0,'rgba(255,244,214,.75)');glow.addColorStop(1,'rgba(255,244,214,0)');ctx.fillStyle=glow;ctx.fillRect(sx-R*4,sy-R*4,R*8,R*8);
   ctx.beginPath();ctx.arc(sx,sy,R,0,TAU);ctx.fillStyle='#fffaf0';ctx.fill();
   // Blue leaving the ray along its way through the air, as small rings: plenty where the light enters the air, none
   // by the time its blue has run out.
   if(tint>0)for(const [u,v,z] of SKY_DOTS.slice(0,48)){const f=u*inside, left=Math.exp(-Physics.skyDepth(450)*m*f), px=ex-d[0]*L*f, py=ey-d[1]*L*f, age=((T*.6+v+z)%1);
    ctx.beginPath();ctx.arc(px,py,Math.max(.5,age*(small?8:12)),0,TAU);ctx.strokeStyle=rgba('#7db4ff',.85*(1-age)*tint*left*clamp(m/8));ctx.lineWidth=1.2;ctx.stroke();}
   if(st.labels&&label&&inside>=1)pill(ctx,label,Math.max(sx,bx+(small?30:40)),sy+(small?20:28),{align:'center',size,weight:700,color:ink});};
  // What you see: the Sun high in a blue sky at noon. With the second sentence it sinks to the horizon, and the Sun
  // and the sky near the horizon take the colours the model gives for its height, turning gold and red.
  let view=null;
  const seen=e=>({e,dusk:1-Physics.skyThrough(450,e)/Physics.skyThrough(450,90),col:skyLight(Physics.skyAirMass(e))});
  if(plan.mode==='live')view={...seen(Math.max(0,plan.sun)),show:1};
  else view={...seen(90*(1-plan.tint)),show:plan.noon};
  if(plan.mode==='live')ray(Math.max(0,plan.sun),1,1,'');
  else{ray(90,plan.noon,plan.tint,'noon');ray(0,plan.dusk*1.0001,plan.tint,'sunset');}
  drawPerson(ctx,ox,oy,small?5:7,'#14171c');
  ctx.restore();
  const vr=small?w*.17:h*.21, vx=small?w*.25:w*.82, vy=small?h*.17:h*.31;
  if(view.show>0){ctx.globalAlpha=view.show;skyView(ctx,vx,vy,vr,view.e,view.dusk,view.col);ctx.globalAlpha=1;}
  if(st.labels){text(ctx,'you',ox+(small?10:14),oy-(small?6:9),{size,weight:700,color:'#f8fafc'});
   if(view.show>.5)text(ctx,'what you see',vx,small?vy+vr+14:vy-vr-14,{align:'center',size,weight:700,color:'#f8fafc'});}
  return;
 }
 // The sky: a landscape with the Sun at the upper left and you on the ground; on the Moon, with no air, the sky is
 // black and the ground grey.
 const air=plan.air??1, wx=w*.03, wy=h*.04, ww=w*.94, wh=h*.9, sunF=[small?.16:.1,.2], R=small?14:20;
 const sx=wx+ww*sunF[0], sy=wy+wh*sunF[1], youF=small?.66:.62, px=wx+ww*youF, ground=skyNear(wy,wh)(youF), eyeY=ground-(small?14:20), skyLow=wy+wh*.76;
 const scatter=plan.mode==='scatter'||plan.mode==='thumb';
 // Sunlight fills the whole sky, drawn as parallel rays from the Sun's direction. All along each ray the air bounces
 // a little blue off in every direction, drawn as small blue rings growing out of the rays; the hills hide both.
 const ang=Math.atan2(eyeY-sy,px-sx), dir=[Math.cos(ang),Math.sin(ang)], nrm=[-dir[1],dir[0]], span=Math.hypot(ww,wh);
 const rays=[];for(let k=0;k<9;k++){const o=(k/8-.4)*span*.75;rays.push([sx+nrm[0]*o,sy+nrm[1]*o]);}
 const inside=([x,y])=>x>wx+8&&x<wx+ww-8&&y>wy+8&&y<skyLow-h*.06;
 const spots=SKY_DOTS.map(([u,v,z],i)=>{const [x0,y0]=rays[i%9], s=(u-.5)*span;return [x0+dir[0]*s,y0+dir[1]*s,z];}).filter(inside).slice(0,24);
 // Places on the rays that your eye sees in nine directions fanned evenly across the sky, from low on the left to low
 // on the right: where each sight line meets a ray at about the middle distance. They get rings too.
 const cross=(a,b)=>a[0]*b[1]-a[1]*b[0], from=[];
 for(let i=0;i<9;i++){const th=-2.85+2.55*i/8, look=[Math.cos(th),Math.sin(th)], want=wh*(small?.36:.42);let best=null;
  for(const [x0,y0] of rays){const den=cross(look,dir);if(Math.abs(den)<1e-6)continue;const t=cross([x0-px,y0-eyeY],dir)/den, q=[px+look[0]*t,eyeY+look[1]*t];
   if(t>0&&inside(q)&&q[1]<skyLow-h*.12&&(!best||Math.abs(t-want)<Math.abs(best[2]-want)))best=[q[0],q[1],t];}
  if(best){from.push(best);spots.push([best[0],best[1],SKY_DOTS[i][2]]);}}
 const beams=()=>{
  for(const [x0,y0] of rays){
   trace(ctx,[[x0-dir[0]*span,y0-dir[1]*span],[x0+dir[0]*span,y0+dir[1]*span]]);ctx.strokeStyle='rgba(255,250,230,.55)';ctx.lineWidth=small?1.6:2.4;ctx.stroke();}
  for(const [x,y,z] of spots){const age=(T*.45+z)%1, r=age*(small?9:14);
   ctx.beginPath();ctx.arc(x,y,Math.max(.5,r),0,TAU);ctx.strokeStyle=`rgba(29,78,216,${.85*(1-age)})`;ctx.lineWidth=1.6;ctx.stroke();}};
 ctx.save();ctx.beginPath();ctx.roundRect(wx,wy,ww,wh,16);ctx.clip();
 skyLand(ctx,wx,wy,ww,wh,{air,sun:sunF,sunR:R,behind:scatter?beams:null});
 if(scatter){
  // Dashed lines to your eye from those places, fanned around the sky: bounced blue arrives from every part of it.
  if(plan.eye>0)from.forEach(([qx,qy],i)=>{const show=clamp(plan.eye*9-i);if(show<=0)return;
   const ex=qx+(px-qx)*show, ey=qy+(eyeY-qy)*show;
   ctx.setLineDash([4,5]);trace(ctx,[[qx,qy],[ex,ey]]);ctx.strokeStyle='rgba(30,64,175,.85)';ctx.lineWidth=1.6;ctx.stroke();ctx.setLineDash([]);});
  if(st.labels){pill(ctx,'sunlight',sx+R+(small?36:60),sy-(small?14:18),{size,weight:700,color:ink});
   if(plan.eye>.95)pill(ctx,'bounced blue',px+(small?12:18),ground+(small?16:24),{size,weight:700,color:blue});}
 }
 ctx.restore();
 drawPerson(ctx,px,ground,small?5:7,'#14171c');
 if(st.labels){text(ctx,'you',px+(small?10:14),ground-(small?16:22),{size,weight:700,color:'#14171c'});
  if(plan.mode==='air')text(ctx,air<.5?'no air, like the Moon':'with air',wx+16,wy+(small?16:20),{size,weight:700,color:'rgba(248,250,252,.92)'});}
}

// Why we have seasons. Many people think summer comes when Earth is closest to the Sun, but the orbit is almost a
// circle and Earth is closest in early January, in the northern winter. Earth's axis is tilted and points the same way
// all year, so in June the north leans toward the Sun: there the noon Sun is high, its light lands on a smaller patch
// of ground, and more of each day is lit; half a year later the south leans in and the seasons swap. Exact for the
// tilt, the distances and the noon Sun at 40 degrees north (Physics.seasonNoon, seasonRatio); after playback the
// viewer sets the tilt.
const SEASON={mode:''};
function seasonPlan(st){
 const c=timeline?.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since??0);
 if(st.since===undefined)return {mode:'thumb',lean:1,t:0};
 if(st.live)return {mode:'live',tilt:clamp(st.mass)*40,area:1,t:st.t||0};
 // 1: the orbit many people picture, then with the second sentence the real one: almost a circle, closest in January.
 if(st.stage===0)return {mode:'orbit',real:smooth((t-at(1)-.3)/1.2),t};
 // 2: the orbit tips from the view from above into the view from the side, with Earth in June and December, its
 // tilted axis pointing the same way; with the second sentence, how much of the circle at 40 degrees north is lit.
 if(st.stage===1)return {mode:'tilt',tip:smooth(t/1.4),lean:smooth((t-at(1)-.3)/.8),t};
 // 3: the same beam of sunlight at June noon and at December noon, 40 degrees north; with the second sentence, the
 // December patch is about twice as wide.
 if(st.stage===2)return {mode:'beam',tilt:Physics.seasonTilt,area:smooth((t-at(1)-.4)/.6),t};
 // 4: June and December again, with summer and winter named in each half: June's at once, December's as the first
 // sentence turns to the south leaning in.
 return {mode:'swap',lean:1,june:smooth((t-.2)/.5),dec:smooth((t-at(0)-2.5)/.6),t};
}
function drawSeasons(ctx,w,h,spec,st){
 const plan=seasonPlan(st), small=w<520, ink='rgba(20,23,28,.8)', muted='rgba(20,23,28,.55)', size=small?10:12, T=plan.t, sunC='#f6b73c';
 SEASON.mode=plan.mode;
 const sun=(x,y,r)=>{const g=ctx.createRadialGradient(x,y,0,x,y,r*2.6);g.addColorStop(0,'rgba(246,183,60,.55)');g.addColorStop(1,'rgba(246,183,60,0)');ctx.fillStyle=g;ctx.fillRect(x-r*3,y-r*3,r*6,r*6);
  ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=sunC;ctx.fill();};
 const globe=(x,y,r)=>{ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle='#4a8fd4';ctx.fill();};
 if(plan.mode==='orbit'){
  // Seen from above. The pictured orbit is a long oval with the Sun near one end; the real orbit is so nearly a circle
  // that the Sun sits only 2.5 million km from its centre.
  const cx=w*.5, cy=h*.47, a=Math.min(w*(small?.4:.3),h*.34), real=plan.real;
  const orbit=(e,alpha,dash)=>{const b=a*Math.sqrt(1-e*e), f=a*e;ctx.save();ctx.globalAlpha=alpha;if(dash)ctx.setLineDash([5,6]);
   ctx.beginPath();ctx.ellipse(cx-f,cy,a,b,0,0,TAU);ctx.strokeStyle='rgba(20,23,28,.4)';ctx.lineWidth=1.4;ctx.stroke();ctx.restore();return f;};
  const fake=.62, ef=fake+(Physics.seasonFar/Physics.seasonNear-1)/(Physics.seasonFar/Physics.seasonNear+1)*0;
  const e=(1-real)*fake+real*((Physics.seasonFar-Physics.seasonNear)/(Physics.seasonFar+Physics.seasonNear));
  orbit(fake,1-real,true);orbit(e,real,false);
  const f=a*e, near=[cx-f+a,cy], far=[cx-f-a,cy];
  sun(cx,cy,small?12:16);
  for(const [x,y] of [near,far])globe(x,y,small?6:8);
  if(st.labels){
   if(real<.5){pill(ctx,'closer: summer?',near[0],near[1]+(small?18:22),{align:'center',size,weight:700,color:ink});
    pill(ctx,'farther: winter?',far[0],far[1]+(small?18:22),{align:'center',size,weight:700,color:ink});}
   else{pill(ctx,'January · 147 million km',near[0],near[1]+(small?18:22),{align:small?'right':'center',size,weight:700,color:ink});
    pill(ctx,'July · 152 million km',far[0],far[1]+(small?34:22),{align:small?'left':'center',size,weight:700,color:ink});}}
  return;
 }
 if(plan.mode==='beam'||plan.mode==='live'){
  // The same beam of sunlight, five rays wide, at noon in June and in December at 40 degrees north: the lower the Sun,
  // the wider the patch of ground it lands on.
  const tilt=plan.tilt, panels=[['June noon',Physics.seasonNoon(40,tilt)],['December noon',Physics.seasonNoon(40,-tilt)]], Wb=small?40:64;
  panels.forEach(([name,elev],i)=>{
   // d: the direction the light travels, down from the Sun toward the ground.
   const px=small?w*.5:w*(i?.72:.28), gy=small?h*(i?.9:.45):h*.74, a=elev*Math.PI/180, d=[Math.cos(a),Math.sin(a)];
   const patch=Wb/Math.sin(a), half=small?w*.42:w*.2, len=Math.min(small?h*.26:h*.5,(half-14)/Math.max(.2,Math.cos(a))), across=[-Math.sin(a),Math.cos(a)];
   trace(ctx,[[px-half,gy],[px+half,gy]]);ctx.strokeStyle='rgba(20,23,28,.45)';ctx.lineWidth=1.5;ctx.stroke();
   ctx.fillStyle='rgba(246,183,60,.45)';ctx.fillRect(px-patch/2,gy-4,patch,8);
   const S=[px-d[0]*len,gy-d[1]*len];
   for(let k=0;k<5;k++){const off=(k/4-.5)*Wb, start=[S[0]+across[0]*off,S[1]+across[1]*off], reach=(gy-start[1])/d[1];
    trace(ctx,[start,[start[0]+d[0]*reach,gy]]);ctx.strokeStyle='rgba(222,150,20,.8)';ctx.lineWidth=1.6;ctx.stroke();}
   sun(S[0]-d[0]*(small?10:14),S[1]-d[1]*(small?10:14),small?8:11);
   if(st.labels){text(ctx,name,px,gy+(small?14:20),{align:'center',size,weight:700,color:ink});
    if(i===1&&(plan.area||0)>.5&&plan.mode!=='live')pill(ctx,'twice the ground',px,gy+(small?30:40),{align:'center',size,weight:700,color:'#b26b00'});}});
  if(st.labels&&plan.mode!=='live')text(ctx,'same light, 40° north',w/2,small?h*.06:h*.08,{align:'center',size,weight:700,color:muted});
  return;
 }
 // June and December, seen from the side. The axis tilts 23.4 degrees the same way at both, so the north leans toward
 // the Sun in June and away in December. Light falls on the half facing the Sun; the line across each Earth is the
 // circle at 40 degrees north, seen edge on, yellow where it is in daylight.
 // At the start of chapter 2 the circle seen from above tips over at the same width, then the whole view grows
 // evenly to this side view, so it is plainly the same orbit and never looks stretched.
 const tip=plan.tip??1, tilt=clamp(tip/.5), grow=clamp((tip-.5)/.5), top=Math.min(w*(small?.4:.3),h*.34), RX=small?w*.36:w*.33, RY=h*.08;
 const zoom=1+(RX/top-1)*grow, cx=w*.5, cy=(small?h*.47+(h*.42-h*.47)*tip:h*.47+(h*.46-h*.47)*tip);
 const rx=top*zoom, ry=(top+(top*RY/RX-top)*tilt)*zoom, R=(small?6:8)+((small?Math.min(w*.13,h*.08):h*.12)-(small?6:8))*grow, tl=Physics.seasonTilt*Math.PI/180;
 ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,TAU);ctx.strokeStyle=`rgba(20,23,28,${.4-.22*tip})`;ctx.lineWidth=1.2;ctx.stroke();
 sun(cx,cy,small?14:20);
 const axis=[Math.sin(tl),-Math.cos(tl)], across=[Math.cos(tl),Math.sin(tl)];
 const earths=[[cx-rx,'June',1],[cx+rx,'December',-1]];
 for(const [ex,name,toward] of earths){
  globe(ex,cy,R);
  ctx.save();ctx.globalAlpha=clamp((tip-.5)/.5);
  // Night: the half facing away from the Sun.
  ctx.save();ctx.beginPath();ctx.arc(ex,cy,R,0,TAU);ctx.clip();ctx.fillStyle='rgba(12,18,32,.55)';ctx.fillRect(toward>0?ex-R:ex,cy-R,R,2*R);ctx.restore();
  ctx.beginPath();ctx.arc(ex,cy,R,0,TAU);ctx.strokeStyle='rgba(20,23,28,.35)';ctx.lineWidth=1;ctx.stroke();
  trace(ctx,[[ex-axis[0]*R*1.35,cy-axis[1]*R*1.35],[ex+axis[0]*R*1.35,cy+axis[1]*R*1.35]]);ctx.strokeStyle='rgba(20,23,28,.75)';ctx.lineWidth=1.6;ctx.stroke();
  ctx.restore();
  // The circle at 40 degrees north, edge on: yellow on the daylight side of the line between day and night.
  if((plan.lean||0)>0){const lat=40*Math.PI/180, c0=[ex+axis[0]*R*Math.sin(lat),cy+axis[1]*R*Math.sin(lat)], half=R*Math.cos(lat);
   const p1=[c0[0]-across[0]*half,c0[1]-across[1]*half], p2=[c0[0]+across[0]*half,c0[1]+across[1]*half];
   const cut=(ex-p1[0])/(p2[0]-p1[0]), m=[p1[0]+(p2[0]-p1[0])*cut,p1[1]+(p2[1]-p1[1])*cut], day=toward>0?[m,p2]:[p1,m], dark=toward>0?[p1,m]:[m,p2];
   ctx.save();ctx.globalAlpha=plan.lean;ctx.lineCap='round';
   trace(ctx,dark);ctx.strokeStyle='rgba(200,205,215,.9)';ctx.lineWidth=3;ctx.stroke();
   trace(ctx,day);ctx.strokeStyle='#fcd34d';ctx.lineWidth=3.5;ctx.stroke();
   // Noon at 40 degrees north: the end of the circle facing the Sun, where chapter 3's ground stands, marked by a
   // short post standing out from the surface.
   const noon=toward>0?p2:p1, out=[(noon[0]-ex)/R,(noon[1]-cy)/R];
   trace(ctx,[noon,[noon[0]+out[0]*(small?7:10),noon[1]+out[1]*(small?7:10)]]);ctx.strokeStyle='rgba(20,23,28,.8)';ctx.lineWidth=2;ctx.stroke();
   if(st.labels&&plan.mode==='tilt')text(ctx,'noon',noon[0]+out[0]*(small?12:16),noon[1]+out[1]*(small?12:16)-(small?6:8),{align:toward>0?'left':'right',size:size-1,weight:700,color:ink});
   ctx.restore();}
  if(st.labels&&tip>.8){text(ctx,name,ex,cy+R+(small?16:24),{align:'center',size,weight:700,color:ink});
   if(plan.mode==='tilt'&&toward>0)text(ctx,'north',ex+axis[0]*R*1.35+(small?8:10),cy+axis[1]*R*1.35-(small?4:6),{size:size-1,weight:700,color:muted});}}
 if(st.labels&&plan.mode==='tilt'&&tip>.8){if(plan.lean<.5)text(ctx,'orbit seen from the side',cx,cy+ry+(small?14:18),{align:'center',size:size-1,weight:600,color:muted});
  if(plan.lean>.5)text(ctx,'circle at 40° north',earths[0][0]+R+(small?6:10),cy-R*.62,{size:size-1,weight:700,color:'#b26b00'});}
 if(st.labels&&(plan.mode==='swap'||plan.mode==='thumb')){const show=[[plan.june??1,earths[0][0],'summer','winter'],[plan.dec??1,earths[1][0],'winter','summer']];
  for(const [a,ex,north,south] of show){if(a<=.5)continue;
   pill(ctx,`north: ${north}`,ex,cy-R*1.35-(small?12:16),{align:'center',size,weight:700,color:north==='summer'?'#b26b00':'#2563eb'});
   pill(ctx,`south: ${south}`,ex,cy+R+(small?32:44),{align:'center',size,weight:700,color:south==='summer'?'#b26b00':'#2563eb'});}}
}

// Attention, told as the story behind chatbots. A chatbot guesses the next word; the clue it needs ("France") is five
// words back; an old one-at-a-time memory lets it fade, while attention looks straight back at every earlier word and
// gives the biggest share to the one that answers what the guess needs ("which language?"). Practice sentences show
// where that match comes from. Built from attention alone, every word is worked on at once; stacked many times, that
// is the Transformer, the T in GPT. Each chapter has a fixed plan; after playback the viewer turns attention down and
// up. Shares are the exact softmax of hand-made scores (Physics.lookBack); the guesses come from a toy rule
// (Physics.lookGuess).
const ATTN={mode:'',strength:1};
function lookPlan(st){
 const c=timeline?.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since??0);
 // Thumbnails, and the stage before playback starts, show the whole sentence with its lines.
 if(st.since===undefined||(st.stage===0&&!st.playing&&!st.live&&(st.since??0)<.05))return {mode:'attend',typed:9,blank:1,arcs:1,strength:1,guess:1,clue:1};
 if(st.live)return {mode:'live',typed:9,arcs:1,strength:clamp(st.mass),guess:1,clue:1};
 // 1: the sentence types itself; the model guesses; with the second sentence it adds "French" and guesses again.
 if(st.stage===0){const typed=Math.min(9,Math.floor(t/.38)+1);return {mode:'type',typed,blank:smooth((t-3.6)/.4),guess:t<at(1)?smooth((t-3.9)/.6):1-smooth((t-at(1)-.6)/.5),fill:smooth((t-at(1)-.4)/.6),next:smooth((t-at(1)-1.1)/.5),strength:1};}
 // 2: the clue is marked; with the second sentence a memory reads the words one at a time, and the clue fades in it.
 if(st.stage===1)return {mode:'memory',typed:9,blank:1,clue:smooth((t-.3)/.6),mem:clamp((t-at(1)-.1)/4.2),guess:smooth((t-at(1)-4.4)/.6),strength:0};
 // 3: equal lines from the guess back to every earlier word; with the second sentence "speak fluent" is marked and
 // the guess asks which language; with the third the lines take their real shares, the clue's glows, and the guess
 // becomes clear.
 if(st.stage===2){const s=smooth((t-at(2)-.2)/1.4);return {mode:'attend',typed:9,blank:1,arcs:smooth((t-.3)/1.2),strength:s,ask:smooth((t-at(1))/.7),clue:s,answer:smooth((t-at(2)-1.2)/.6),guess:1};}
 // 4: how it knows: with the second sentence, sentences it practised on appear one by one; with the third, each
 // one's language is linked back to its country.
 if(st.stage===3)return {mode:'learn',typed:9,blank:1,arcs:1,strength:1,clue:1,guess:1-smooth(t/.6),examples:[0,1,2].map(i=>smooth((t-at(1)-.3-i*1.4)/.6)),links:smooth((t-at(2))/.8)};
 // 5: every word looks back at once; with the second sentence all the lines pulse together.
 if(st.stage===4)return {mode:'parallel',typed:9,blank:1,arcs:1,strength:1,clue:1,guess:1,web:smooth((t-.3)/1.2),pulse:t>=at(1)?t-at(1):-1};
 // 6: the web stacked in layers; with the second sentence the answer fills in.
 return {mode:'stack',typed:9,blank:1,arcs:1,strength:1,clue:1,guess:1,web:1,layers:smooth((t-.3)/1.6),fill:smooth((t-at(1))/.8)};
}
function drawAttention(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.blue, warm='#e07a2e', P=Physics, plan=lookPlan(st), ink='rgba(20,23,28,.85)';
 const words=P.lookWords, n=words.length, clue=P.lookClue, shares=P.lookBack(plan.strength??1), top1=Math.max(...shares);
 Object.assign(ATTN,{mode:plan.mode,strength:plan.strength??1});
 const guessRows=P.lookGuess(plan.mode==='memory'?0:plan.strength??1);
 const phone=w<520&&st.since!==undefined;
 // Sentences it practised on: the country and the language picked out, linked when link > 0.
 const example=([ws,ci,li],x,y,size,alpha,link)=>{if(alpha<=0)return;ctx.globalAlpha=alpha;
  const pos=[];let xx=x;ctx.font=`500 ${size}px ${FONT}`;const space=ctx.measureText(' ').width;
  ws.forEach((wd,i)=>{const key=i===ci||i===li;ctx.font=`${key?700:500} ${size}px ${FONT}`;const ww=ctx.measureText(wd).width;pos.push(xx+ww/2);
   text(ctx,wd,xx,y,{size,weight:key?700:500,color:key?warm:'rgba(20,23,28,.6)',content:true});xx+=ww+space;});
  if(link>0){const a=pos[li], b=pos[ci], top=y-size*.8;ctx.beginPath();ctx.moveTo(a,top);ctx.quadraticCurveTo((a+b)/2,top-size*.9-Math.abs(a-b)*.12,b,top);
   ctx.strokeStyle=rgba(warm,.85*link);ctx.lineWidth=Math.max(1.5,size*.13);ctx.lineCap='round';ctx.stroke();}
  ctx.globalAlpha=1;};
 const PRACTICE=[[['We','moved','to','Spain,','so','we','speak','Spanish.'],3,7],[['She','grew','up','in','Japan','and','speaks','Japanese.'],4,7],[['My','family','is','from','Brazil,','so','I','speak','Portuguese.'],4,8]];
 // The guess: the three likeliest next words, as bars.
 const guessBars=(x,y,size,alpha)=>{if(alpha<=0)return;ctx.globalAlpha=alpha;
  guessRows.forEach(([wd,v],i)=>{const yy=y+i*size*1.7, bw=v*size*9;
   text(ctx,wd,x,yy,{size,weight:i===0?700:500,color:i===0?ink:'rgba(20,23,28,.6)'});
   ctx.fillStyle=i===0?'rgba(20,23,28,.55)':'rgba(20,23,28,.18)';ctx.beginPath();ctx.roundRect(x+size*4.6,yy-size*.35,Math.max(2,bw),size*.7,size*.35);ctx.fill();});
  ctx.globalAlpha=1;};
 if(phone){
  // Phone: one row per word, bars for how much the guess looks back at each, and the guess at the bottom.
  const top=h*.17, rowH=Math.min(28,h*.56/(n+1)), xw=w*.34, bx=w*.4, bw=w*.46, fs=Math.min(15,rowH*.62);
  for(let j=0;j<n;j++){if(j>=plan.typed)continue;const y=top+j*rowH;
   if(plan.clue>0&&j===clue){ctx.globalAlpha=plan.clue;ctx.strokeStyle=warm;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(xw-fs*4.2,y-rowH*.42,fs*4.6,rowH*.84,6);ctx.stroke();ctx.globalAlpha=1;}
   if((plan.ask??0)>0&&j>=n-2){ctx.globalAlpha=plan.ask;ctx.strokeStyle='rgba(20,23,28,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(xw-fs*4.2,y-rowH*.42,fs*4.6,rowH*.84,6);ctx.stroke();ctx.globalAlpha=1;}
   text(ctx,words[j],xw,y,{align:'right',size:fs,weight:600,color:ink,content:true});
   const k=plan.mode==='memory'?0:(plan.arcs??0)*shares[j]/top1;
   if(k>0){const pulse=plan.pulse>=0?.75+.25*Math.sin(plan.pulse*6):1;ctx.fillStyle=j===clue&&plan.clue>0?rgba(warm,.85*pulse):rgba(accent,(.3+.5*k)*pulse);ctx.beginPath();ctx.roundRect(bx,y-rowH*.18,Math.max(2,k*bw),rowH*.36,4);ctx.fill();}}
  const by=top+n*rowH;
  if(plan.blank>0){ctx.globalAlpha=plan.blank;ctx.setLineDash([4,3]);ctx.strokeStyle='rgba(20,23,28,.4)';ctx.lineWidth=1.4;ctx.beginPath();ctx.roundRect(xw-fs*4.2,by-rowH*.42,fs*4.6,rowH*.84,6);ctx.stroke();ctx.setLineDash([]);
   text(ctx,(plan.fill??0)>.5?'French':'?',xw,by,{align:'right',size:fs,weight:700,color:(plan.fill??0)>.5?warm:'rgba(20,23,28,.35)',content:true});ctx.globalAlpha=1;}
  if(plan.mode==='memory'&&plan.mem>0){const j=Math.min(n-1,Math.floor(plan.mem*n)), y=top+j*rowH, mx=w*.86;
   ctx.fillStyle='#fff';ctx.strokeStyle='rgba(20,23,28,.3)';ctx.lineWidth=1.2;ctx.beginPath();ctx.roundRect(mx-20,y-14,40,28,6);ctx.fill();ctx.stroke();
   for(let i=0;i<=j;i++){const keep=Math.pow(P.memoryFade,j-i+1);ctx.fillStyle=i===clue?rgba(warm,keep):rgba(accent,.7*keep);ctx.fillRect(mx-16+i*3.6,y-8,2.8,16);}
   if(st.labels)text(ctx,'memory',mx,y+24,{align:'center',size:10,weight:600});}
  if(st.labels&&(plan.ask??0)>.05){ctx.globalAlpha=plan.ask;pill(ctx,'which language?',bx,by,{size:11,weight:700,color:ink});ctx.globalAlpha=1;}
  if(st.labels&&(plan.answer??0)>.05){ctx.globalAlpha=plan.answer;pill(ctx,'French',bx+bw,top+(clue-.62)*rowH,{align:'right',size:11,weight:700,color:warm});ctx.globalAlpha=1;}
  if(plan.mode==='learn')PRACTICE.forEach((ex,i)=>example(ex,w*.08,by+rowH*1.5+i*rowH*1.15,Math.min(12,w/32),plan.examples[i],plan.links));
  if(st.labels){if(plan.mode==='parallel'&&plan.pulse>=0)pill(ctx,'all at once',bx,top-rowH*.9+rowH,{size:11,weight:700,color:accent});
   if(plan.mode==='stack'&&plan.layers>.5)pill(ctx,'Transformer',bx,top-rowH*.9+rowH,{size:11,weight:700,color:accent});}
  guessBars(w*.1,by+rowH*1.2,11,plan.guess??0);
  return;
 }
 // Wide screens (and thumbnails, scaled to fit): the sentence as a row of tiles with lines from the guess back to
 // every earlier word, thicker for a bigger share.
 const V=1240, k=Math.min(w/V,h/580);ctx.save();ctx.translate((w-V*k)/2,(h-580*k)/2);ctx.scale(k,k);
 const size=24, padX=14, gap=11, tileH=52, rowY=320;
 ctx.font=`600 ${size}px ${FONT}`;
 const widths=[...words.map(wd=>ctx.measureText(wd).width+2*padX), ctx.measureText('French').width+2*padX+8];
 let x=(V-widths.reduce((s,v)=>s+v,0)-gap*n)/2-60;
 const tiles=widths.map(tw=>{const t={x,w:tw,cx:x+tw/2};x+=tw+gap;return t;}), top=rowY-tileH/2, blank=tiles[n];
 const curve=(from,to,lift=.5)=>[[to.cx,top-2],[(to.cx+from.cx)/2,top-30-Math.abs(to.cx-from.cx)*lift],[from.cx,top-2]];
 const stroke=(c,width,col)=>{ctx.beginPath();ctx.moveTo(...c[0]);ctx.quadraticCurveTo(...c[1],...c[2]);ctx.strokeStyle=col;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke();};
 // Every word looking back at the ones before it (the web), once per layer when stacked.
 const web=(alpha,dy)=>{for(let j=1;j<=n;j++)for(let i=0;i<j;i++){const c=curve(tiles[j],tiles[i],.35).map(([px,py])=>[px,py+dy]);stroke(c,1,`rgba(37,99,235,${alpha})`);}};
 const pulse=plan.pulse>=0?.7+.3*Math.sin(plan.pulse*5):1;
 if(plan.web>0){const layers=plan.layers??0;
  for(let L=2;L>=1;L--)if(layers>0)web(.06*layers*pulse,-L*34*layers);
  web(.12*plan.web*pulse,0);}
 // The guess looking back at each earlier word.
 if((plan.arcs??0)>0&&plan.mode!=='memory'){
  for(let j=0;j<n;j++){const sh=shares[j], c=curve({cx:blank.cx+blank.w*.3*(1-2*j/(n-1))},tiles[j]);
   const isClue=j===clue&&(plan.clue??0)>0;
   stroke(c,(1.5+26*sh)*(plan.arcs),isClue?rgba(warm,(.35+.6*Math.min(1,sh/.3))*plan.clue*pulse):rgba(accent,(.2+.55*Math.min(1,sh/.3))*plan.arcs*pulse));
   if(isClue&&plan.clue<1)stroke(c,(1.5+26*sh)*plan.arcs,rgba(accent,(.2+.55*Math.min(1,sh/.3))*(1-plan.clue)));}}
 // The tiles; the clue is outlined; the guess's tile is dashed until the answer fills it.
 tiles.forEach((t,j)=>{
  if(j<n&&j>=plan.typed)return;
  if(j===n){if(!(plan.blank>0))return;ctx.globalAlpha=plan.blank;}
  ctx.fillStyle='#fff';ctx.strokeStyle='rgba(20,23,28,.16)';ctx.lineWidth=1.2;
  if(j===n){ctx.setLineDash([5,4]);ctx.strokeStyle='rgba(20,23,28,.45)';}
  ctx.beginPath();ctx.roundRect(t.x,top,t.w,tileH,9);ctx.fill();ctx.stroke();ctx.setLineDash([]);
  if(j===clue&&(plan.clue??0)>0){ctx.globalAlpha=plan.clue;ctx.strokeStyle=warm;ctx.lineWidth=2.5;ctx.beginPath();ctx.roundRect(t.x-3,top-3,t.w+6,tileH+6,11);ctx.stroke();ctx.globalAlpha=1;}
  if(j<n&&j>=n-2&&(plan.ask??0)>0){ctx.globalAlpha=plan.ask;ctx.strokeStyle='rgba(20,23,28,.5)';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(t.x-3,top-3,t.w+6,tileH+6,11);ctx.stroke();ctx.globalAlpha=1;}
  if(j<n)text(ctx,words[j],t.cx,rowY,{align:'center',size,weight:600,color:ink,content:true});
  else{const filled=(plan.fill??0)>.5;text(ctx,filled?'French':'?',t.cx,rowY,{align:'center',size,weight:700,color:filled?warm:'rgba(20,23,28,.35)',content:true});ctx.globalAlpha=1;}
 });
 // Chapter 1: after "French" is added, the next guess waits.
 if((plan.next??0)>0){const t={x:blank.x+blank.w+gap,w:56};ctx.globalAlpha=plan.next;ctx.setLineDash([5,4]);ctx.strokeStyle='rgba(20,23,28,.45)';ctx.lineWidth=1.2;ctx.fillStyle='#fff';
  ctx.beginPath();ctx.roundRect(t.x,top,t.w,tileH,9);ctx.fill();ctx.stroke();ctx.setLineDash([]);text(ctx,'?',t.x+t.w/2,rowY,{align:'center',size,weight:700,color:'rgba(20,23,28,.35)',content:true});ctx.globalAlpha=1;}
 // Chapter 2: a memory reads the words one at a time; each new word squeezes the older ones, and the clue fades.
 if(plan.mode==='memory'&&plan.mem>0){const pos=plan.mem*(n-.001), j=Math.floor(pos), mx=tiles[j].cx+(tiles[Math.min(n,j+1)].cx-tiles[j].cx)*smooth(pos-j), my=top+tileH+150;
  trace(ctx,[[mx,top+tileH+6],[mx,my-22]]);ctx.strokeStyle='rgba(20,23,28,.25)';ctx.lineWidth=1.2;ctx.setLineDash([3,3]);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#fff';ctx.strokeStyle='rgba(20,23,28,.3)';ctx.lineWidth=1.4;ctx.beginPath();ctx.roundRect(mx-58,my-22,116,44,9);ctx.fill();ctx.stroke();
  for(let i=0;i<=j;i++){const keep=Math.pow(P.memoryFade,pos-i);ctx.fillStyle=i===clue?rgba(warm,Math.min(1,keep*1.1)):rgba(accent,.7*keep);ctx.fillRect(mx-50+i*11.4,my-13,8,26);}
  if(st.labels)text(ctx,'memory',mx,my+36,{align:'center',size:12,weight:600});}
 if(st.labels){
  if(plan.mode==='type'&&plan.blank>.5&&(plan.fill??0)<.5)pill(ctx,'next word?',blank.cx,top-22,{align:'center',size:13,weight:600,color:'rgba(20,23,28,.7)'});
  if(plan.mode==='memory'&&plan.clue>.5)pill(ctx,'the clue',tiles[clue].cx,top-24,{align:'center',size:13,weight:700,color:warm});
  if((plan.ask??0)>.05){const a=tiles[n-2].x, b=tiles[n-1].x+tiles[n-1].w, y=top+tileH+12;ctx.globalAlpha=plan.ask;
   trace(ctx,[[a,y-6],[a,y],[b,y],[b,y-6]]);ctx.strokeStyle='rgba(20,23,28,.45)';ctx.lineWidth=1.6;ctx.lineCap='round';ctx.stroke();
   pill(ctx,'which language?',(a+b)/2,y+20,{align:'center',size:15,weight:700,color:ink});ctx.globalAlpha=1;}
  if((plan.answer??0)>.05){ctx.globalAlpha=plan.answer;pill(ctx,'French',tiles[clue].cx,top+tileH+28,{align:'center',size:15,weight:700,color:warm});ctx.globalAlpha=1;}
  if(plan.mode==='parallel'&&plan.pulse>=0)pill(ctx,'all at once',tiles[0].x,top-170,{size:13,weight:700,color:accent});
  if(plan.mode==='stack'&&plan.layers>.5)pill(ctx,'Transformer',tiles[0].x,top-200,{size:13,weight:700,color:accent});
 }
 if(plan.mode==='learn')PRACTICE.forEach((ex,i)=>example(ex,tiles[0].x,top+tileH+78+i*58,19,plan.examples[i],plan.links));
 guessBars(blank.x,top+tileH+36,15,plan.guess??0);
 ctx.restore();
}

// Intuition Lab: a small living world on the home page where the AI agents make the investigations, drawn as
// scientists in lab coats with an AI sparkle on the coat, each at the station of their role in the code. The
// coordinator, the program that runs the lab and is not an agent, is the room's machinery: pneumatic tubes that carry
// each piece of work to the next station, the machine that renders the frames, and the door where notes arrive. It
// follows the real run (labModel in app.js): the question arrives on the board; the researcher gathers sources; the
// scientist writes up the research; the designer sketches how the picture will show the idea; the writer writes the
// chapters on the board; the machine renders the frames; four reviewers (visual, blind viewer, beginner, accuracy)
// give their marks; a draft sent back is crumpled into the bin; a published guide drops into place on the wall, one
// frame per published investigation. Between runs they rest: a nap, tea, chess, doodling, a comic, the plants and the
// paper. When the schedule is off the lab is dark and only the cat stays. They notice a visitor arriving and react
// when clicked; a note sent from the page flies in as a paper plane to the notes board by the door. On a phone the
// view moves to where the work is. lab: {t, still, mode: closed|resting|working|done, phase: choose|research|record|
// design|write|render|review|revise|publish, since, question, rejected, reviews: [beginner, visual, accuracy, blind]
// each 0 or 1, wall, outcome, notes: [{status}], events: {arrive, note, poke: {who, at}}}. CouncilLab.hit maps a point
// on the canvas to what is drawn there; who: 0 researcher, 1 writer, 2 scientist, 3 visual reviewer, 4 accuracy
// reviewer, 5 cat, 6 designer, 7 beginner reviewer, 8 blind viewer.
const LAB_SPOTS={choose:[[806,120]],research:[[350,90]],record:[[496,96]],design:[[660,84]],write:[[806,120]],revise:[[806,120]],
 render:[[962,80]],review:[[1024,40],[1064,40],[1104,40],[1202,48]],publish:[[1100,150]]};
const LAB_DROPS={door:1262,research:340,record:452,design:632,write:760,render:960,review:1110};
const LAB_FROM={choose:'door',research:'write',record:'research',design:'record',write:'design',render:'write',review:'render',revise:'review',publish:'review'};
let labPan=null, labXf=null, labHits=[];
function drawLab(ctx,w,h,lab={}){
 const {t=0,still=false,mode='resting',phase='',since=0,question='',rejected=0,reviews=[0,0,0,0],wall=0,outcome='',notes=[],events={}}=lab;
 const VW=1300, VH=320, phone=w/h<2.9, span=phone?560:VW, k=Math.abs(w/span-h/VH)<.02*h/VH?w/span:Math.min(w/span,h/VH);
 const working=mode==='working', open=mode!=='closed', resting=mode==='resting', T=still?5.6:t;
 const noteAge=events.note==null||still?Infinity:T-events.note, plane=noteAge<1.7?noteAge/1.7:-1;
 const aim=!phone?0:noteAge<6?740:!working?(mode==='done'?526:0):({research:130,record:250,design:400,render:700,review:740,publish:740}[phase]??526);
 labPan=still||labPan===null||!phone?aim:labPan+(aim-labPan)*.06;
 const ox=(w-span*k)/2, oy=h-VH*k;labXf={ox,oy,k,pan:labPan};labHits=[];
 ctx.save();ctx.translate(ox,oy);ctx.scale(k,k);ctx.translate(-labPan,0);
 ctx.beginPath();ctx.rect(labPan,0,span,VH);ctx.clip();
 const FL=296, bt=250, BASE=270, u=1.22, ink='#1f2937', glass='rgba(255,255,255,.72)', edge='rgba(31,41,55,.42)', wood='#a47c5b', top='#cdb08c', ai='#7c3aed';
 const at=p=>working&&phase===p, s=Math.max(0,since), busy=open&&!still;
 ctx.lineCap='round';ctx.lineJoin='round';
 const circ=(x,y,r,col)=>{ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=col;ctx.fill();};
 const box=(x,y,bw,bh,col,r=0)=>{ctx.beginPath();ctx.roundRect(x,y,bw,bh,r);ctx.fillStyle=col;ctx.fill();};
 const line=(pts,col,lw)=>{trace(ctx,pts);ctx.strokeStyle=col;ctx.lineWidth=lw;ctx.stroke();};
 const tick=(x,y,r,col)=>{circ(x,y,r,col);line([[x-r*.45,y],[x-r*.1,y+r*.38],[x+r*.5,y-r*.38]],'#fff',Math.max(1.2,r*.3));};
 // The AI sparkle: a four-pointed star.
 const spark=(x,y,r,col,a=1)=>{if(a<=0)return;ctx.globalAlpha=a;ctx.beginPath();ctx.moveTo(x,y-r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.quadraticCurveTo(x,y,x,y+r);
  ctx.quadraticCurveTo(x,y,x-r,y);ctx.quadraticCurveTo(x,y,x,y-r);ctx.fillStyle=col;ctx.fill();ctx.globalAlpha=1;};
 // An agent: a white lab coat with the AI sparkle over a coloured shirt, sleeves reaching to the hands, a head with
 // hair of their own and goggles. face turns them (-1 left, 1 right, 0 to the viewer), bow bends the head forward,
 // walk swings the legs, sit puts the hips on a seat at that height, hop lifts them, phones and muffs cover the ears,
 // neck hangs the muffs around the neck.
 const person=(x,feet,{skin,hair,style=0,shirt,face=0,hands=[],bow=0,walk=null,phones=false,muffs=false,neck=false,sit=null,hop=0}={})=>{
  feet-=hop;const seat=sit===null?null:sit-hop, base=seat===null?feet:seat+15*u;
  if(seat===null){const spread=(walk===null?5:5+Math.sin(walk)*3.5)*u;
   for(const d of [-1,1]){line([[x+d*4*u,feet-18*u],[x+d*spread,feet-2.5]],'#4b5563',5*u);
    ctx.fillStyle=ink;ctx.beginPath();ctx.ellipse(x+d*spread+face*1.5*u,feet-2,4.2*u,2.1*u,0,0,TAU);ctx.fill();}}
  else for(const d of [-1,1]){const kx=face?x+face*14*u+d*1.6*u:x+d*7*u, ky=face?seat+1:seat+5*u;
   line([[x+d*3.5*u,seat],[kx,ky]],'#4b5563',5.2*u);line([[kx,ky],[kx,feet-2.5]],'#4b5563',5*u);
   ctx.fillStyle=ink;ctx.beginPath();ctx.ellipse(kx+face*2*u,feet-2,4.2*u,2.1*u,0,0,TAU);ctx.fill();}
  ctx.beginPath();ctx.moveTo(x-9*u,base-50*u);ctx.lineTo(x+9*u,base-50*u);ctx.lineTo(x+12.5*u,base-15*u);ctx.lineTo(x-12.5*u,base-15*u);ctx.closePath();
  ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='rgba(31,41,55,.32)';ctx.lineWidth=1.2;ctx.stroke();
  ctx.fillStyle=shirt;ctx.beginPath();ctx.moveTo(x-3.8*u,base-50*u);ctx.lineTo(x+3.8*u,base-50*u);ctx.lineTo(x,base-40*u);ctx.closePath();ctx.fill();
  line([[x,base-40*u],[x,base-16*u]],'rgba(31,41,55,.2)',1);
  spark(x+6*u,base-40*u,2.8*u,ai,.95);
  for(const [hx,hy] of hands){const sx=x+(hx<x?-8:8)*u, sy=base-46*u;
   line([[sx,sy],[hx,hy]],'rgba(31,41,55,.32)',6.6*u);line([[sx,sy],[hx,hy]],'#fff',5*u);circ(hx,hy,2.8*u,skin);}
  const hx0=x+face*(1.5+bow*5)*u, hy0=base-(59-bow*6)*u;
  if(neck){line([[hx0-7*u,hy0+9*u],[hx0+7*u,hy0+9*u]],'#f472b6',2.2*u);circ(hx0-7*u,hy0+9*u,3*u,'#f9a8d4');circ(hx0+7*u,hy0+9*u,3*u,'#f9a8d4');}
  if(style===2)box(hx0-9.6*u,hy0-6*u,19.2*u,17*u,hair,6*u);
  if(style===3)circ(hx0,hy0-1.5*u,11.6*u,hair);
  circ(hx0,hy0,8.6*u,skin);
  if(style<3){ctx.beginPath();ctx.arc(hx0,hy0-.8*u,9*u,Math.PI*1.04,Math.PI*1.96);ctx.fillStyle=hair;ctx.fill();}
  if(style===1)circ(hx0-face*3*u,hy0-10.5*u,4.3*u,hair);
  if(style===4){circ(hx0-7.2*u,hy0-1.5*u,3.2*u,hair);circ(hx0+7.2*u,hy0-1.5*u,3.2*u,hair);}
  if(phones){ctx.beginPath();ctx.arc(hx0,hy0-1*u,10.6*u,Math.PI*1.1,Math.PI*1.9);ctx.strokeStyle='#374151';ctx.lineWidth=1.8;ctx.stroke();
   box(hx0-11.6*u,hy0-3*u,4*u,6.5*u,'#374151',2);box(hx0+7.6*u,hy0-3*u,4*u,6.5*u,'#374151',2);}
  if(muffs){ctx.beginPath();ctx.arc(hx0,hy0-1*u,10.4*u,Math.PI*1.1,Math.PI*1.9);ctx.strokeStyle='#f472b6';ctx.lineWidth=2.2;ctx.stroke();
   circ(hx0-9.6*u,hy0+.5*u,3.6*u,'#f9a8d4');circ(hx0+9.6*u,hy0+.5*u,3.6*u,'#f9a8d4');}
  line([[hx0-8.6*u,hy0-1.2*u],[hx0+8.6*u,hy0-1.2*u]],'rgba(31,41,55,.6)',1.2);
  for(const d of [-3.5,3.5]){ctx.beginPath();ctx.arc(hx0+face*2*u+d*u,hy0-.8*u,3*u,0,TAU);ctx.fillStyle='rgba(191,219,254,.95)';ctx.fill();ctx.stroke();}
  ctx.beginPath();ctx.arc(hx0+face*2.4*u,hy0+3.4*u,2.1*u,.2*Math.PI,.8*Math.PI);ctx.strokeStyle='rgba(31,41,55,.55)';ctx.lineWidth=1.1;ctx.stroke();
  return [hx0,hy0];
 };
 // The lab's cat (not an agent): curled up asleep, or sitting with its tail swaying.
 const cat=(x,y,{sleep=false,dir=1,hop=0}={})=>{
  const fur='#e0913f', dark='#b8692a';y-=hop;
  if(sleep){ctx.fillStyle=fur;ctx.beginPath();ctx.ellipse(x,y-5,13,6.5,0,0,TAU);ctx.fill();circ(x-dir*9,y-7,5,fur);
   ctx.beginPath();ctx.moveTo(x-dir*12.5,y-10);ctx.lineTo(x-dir*11,y-15);ctx.lineTo(x-dir*7.5,y-11);ctx.closePath();ctx.fill();
   for(let j=0;j<3;j++)line([[x-4+j*4,y-10.5],[x-2.4+j*4,y-6]],dark,1.2);
   line([[x+dir*12,y-3],[x+dir*6,y+1],[x-dir*5,y+.5]],fur,3);line([[x-dir*11,y-7],[x-dir*9,y-7]],ink,1);
   labHits.push({kind:'person',who:5,x0:x-15,x1:x+15,y0:y-16,y1:y+2});return;}
  ctx.fillStyle=fur;ctx.beginPath();ctx.ellipse(x,y-8,7.5,8,0,0,TAU);ctx.fill();
  const hx=x+dir*2, hy=y-19;circ(hx,hy,5.6,fur);
  for(const e of [-1,1]){ctx.beginPath();ctx.moveTo(hx+e*5,hy-2);ctx.lineTo(hx+e*4,hy-8.5);ctx.lineTo(hx+e*1,hy-4.5);ctx.closePath();ctx.fill();}
  circ(hx-2,hy-.5,1,ink);circ(hx+2,hy-.5,1,ink);
  const sw=busy?Math.sin(T*2.2)*4:0;line([[x-dir*6,y-3],[x-dir*13,y-8+sw*.4],[x-dir*12+sw,y-18]],fur,2.6);
  for(let j=0;j<2;j++)line([[x-4+j*5,y-14],[x-3+j*5,y-10]],dark,1.1);box(x-5,y-2,4,2.5,fur,1);box(x+1,y-2,4,2.5,fur,1);
  labHits.push({kind:'person',who:5,x0:x-12,x1:x+12,y0:y-28,y1:y+2});
 };
 const bubble=(x,y,kind,a=1)=>{if(a<=0)return;ctx.globalAlpha=a;circ(x,y,7.5,'#fff');ctx.beginPath();ctx.arc(x,y,7.5,0,TAU);ctx.strokeStyle='rgba(31,41,55,.25)';ctx.lineWidth=1;ctx.stroke();
  if(kind==='!'){line([[x,y-3.8],[x,y+1.2]],'#e07a2e',2.1);circ(x,y+3.8,1.15,'#e07a2e');}
  else if(kind==='heart'){ctx.beginPath();ctx.moveTo(x,y+3.6);ctx.bezierCurveTo(x-6.2,y-1,x-2.6,y-5.6,x,y-2.2);ctx.bezierCurveTo(x+2.6,y-5.6,x+6.2,y-1,x,y+3.6);ctx.fillStyle='#ef4444';ctx.fill();}
  else if(kind==='tick'){line([[x-3.2,y],[x-.9,y+2.5],[x+3.3,y-2.7]],'#16a34a',1.9);}
  else spark(x,y,4.6,ai);
  ctx.globalAlpha=1;};
 const zzz=(x,y)=>{for(let j=0;j<3;j++){const q=still?j/3:(T*.4+j/3)%1;ctx.globalAlpha=Math.min(1,(1-q)*1.8)*.75;
  ctx.font=`700 ${7+q*6}px "Chalkboard SE","Comic Sans MS",cursive`;ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillStyle='#64748b';ctx.fillText('z',x+q*16,y-q*24);}ctx.globalAlpha=1;};
 const steam=(x,y,n=2)=>{if(!busy)return;for(let j=0;j<n;j++){const q=(T*.5+j/n)%1;ctx.globalAlpha=.5*(1-q);line([[x,y-q*14],[x+Math.sin(T*2+j*2+q*4)*2.5,y-q*14-5]],'#cbd5e1',1.6);}ctx.globalAlpha=1;};
 const sketch=(x,y,sw,sh,kind,col,lw=1)=>{const pts=[];
  for(let i=0;i<=18;i++){const q=i/18;pts.push(kind%4===0?[x+sw*(.12+.76*q),y+sh*(.55-.28*Math.sin(q*TAU))]:kind%4===1?[x+sw*(.12+.76*q),y+sh*(.8-2.4*q*(1-q))]:
   kind%4===2?[x+sw/2+sw*.3*Math.cos(q*TAU),y+sh/2+sh*.22*Math.sin(q*TAU)]:[x+sw*(.15+.7*q),y+sh*(.8-.5*Math.exp(-(((q-.5)/.18)**2)))]);}
  line(pts,col,lw);if(kind%4===2)circ(x+sw/2,y+sh/2,Math.max(1,sw*.06),col);};
 // How each agent reacts: noticing a visitor (everyone, a little apart), being clicked, or, for the accuracy reviewer by
 // the door, a note that has just landed.
 const react=i=>{if(still)return null;const n=events.arrive==null?-1:T-events.arrive-(i%9)*.1;if(n>=0&&n<2.6)return {q:n,kind:'!'};
  const p=events.poke&&events.poke.who===i?T-events.poke.at:-1;if(p>=0&&p<1.8)return {q:p,kind:i===5?'heart':'spark'};
  if(i===4&&noteAge>=1.6&&noteAge<3.4)return {q:noteAge-1.6,kind:'tick'};return null;};
 const hopOf=r=>r&&r.q<.36?Math.sin(r.q/.36*Math.PI)*5:0, fade=r=>r?Math.min(1,(1.5-r.q)*3):0;
 const slot=i=>[1242+(i%3)*17,64+Math.floor(i/3)*20];
 const pinned=notes.filter(n=>n.status!=='taken').slice(-6);
 const planeAt=q=>{const A=[labPan+span/2,VH+14], B=slot(Math.max(0,pinned.length-1)).map((v,j)=>v+(j?6:7)), C=[A[0]*.3+B[0]*.7,-30];
  return [(1-q)**2*A[0]+2*(1-q)*q*C[0]+q*q*B[0],(1-q)**2*A[1]+2*(1-q)*q*C[1]+q*q*B[1]];};
 const follow=x=>plane>=0?Math.sign(planeAt(plane)[0]-x)||1:null;
 // The room: a pale wall, a wooden floor, a window with the sky outside, three hanging lamps and a clock.
 ctx.fillStyle='#eef3f1';ctx.fillRect(0,0,VW,234);ctx.fillStyle='#e6eeeb';ctx.fillRect(0,184,VW,50);line([[0,184],[VW,184]],'rgba(255,255,255,.9)',1.5);
 ctx.fillStyle='#e9dfcf';ctx.fillRect(0,234,VW,VH-234);line([[0,234],[VW,234]],'rgba(120,90,60,.28)',1.5);
 for(let i=1;i<4;i++)line([[0,234+i*21],[VW,234+i*21]],'rgba(120,90,60,.07)',1);
 const clock=new Date(), hr=clock.getHours()+clock.getMinutes()/60, night=hr<6||hr>=20.5, dusk=!night&&(hr<7.5||hr>=18.5);
 const wx=40, wy=78, ww=116, wh=86, sky=ctx.createLinearGradient(0,wy,0,wy+wh);
 if(night){sky.addColorStop(0,'#1e2a4a');sky.addColorStop(1,'#3b4a7a');}else if(dusk){sky.addColorStop(0,'#9db4e6');sky.addColorStop(1,'#f7c19a');}else{sky.addColorStop(0,'#a8d8f7');sky.addColorStop(1,'#e3f3fd');}
 ctx.fillStyle=sky;ctx.fillRect(wx,wy,ww,wh);
 if(night){for(let i=0;i<10;i++)circ(wx+8+hash(i*3.1)*(ww-16),wy+6+hash(i*5.7)*wh*.55,.8+hash(i)*.8,`rgba(255,255,255,${.55+.45*Math.sin(T*1.3+i)})`);
  circ(wx+ww-30,wy+22,9,'#f8fafc');circ(wx+ww-26,wy+19,8,'#26345c');}
 else{circ(wx+ww-30,dusk?wy+wh-20:wy+22,dusk?11:9,dusk?'#fb923c':'#fde68a');
  const cx=wx+((T*3)%(ww+40))-20;ctx.fillStyle='rgba(255,255,255,.9)';ctx.beginPath();ctx.ellipse(cx,wy+36,14,5,0,0,TAU);ctx.ellipse(cx+8,wy+32,9,5,0,0,TAU);ctx.fill();}
 ctx.fillStyle=night?'#1a2440':dusk?'#7d8f7a':'#9cc59a';ctx.beginPath();ctx.moveTo(wx,wy+wh);ctx.quadraticCurveTo(wx+30,wy+wh-20,wx+60,wy+wh-8);
 ctx.quadraticCurveTo(wx+90,wy+wh-24,wx+ww,wy+wh-10);ctx.lineTo(wx+ww,wy+wh);ctx.closePath();ctx.fill();
 ctx.strokeStyle='#9a6b45';ctx.lineWidth=5;ctx.strokeRect(wx,wy,ww,wh);line([[wx+ww/2,wy],[wx+ww/2,wy+wh]],'#9a6b45',3);line([[wx,wy+wh/2],[wx+ww,wy+wh/2]],'#9a6b45',3);
 box(wx-8,wy+wh+2,ww+16,5,'#9a6b45',2);line([[wx-14,wy-9],[wx+ww+14,wy-9]],'#6b4a2f',2.5);
 for(const [cx2,dir] of [[wx-8,1],[wx+ww+8,-1]]){ctx.fillStyle='rgba(224,122,46,.5)';ctx.beginPath();ctx.moveTo(cx2,wy-9);ctx.lineTo(cx2+dir*20,wy-9);
  ctx.quadraticCurveTo(cx2+dir*9,wy+wh*.5,cx2+dir*14,wy+wh+4);ctx.lineTo(cx2,wy+wh+4);ctx.closePath();ctx.fill();}
 box(126,wy+wh-8,14,10,'#c2703d',2);for(let j=0;j<4;j++){ctx.fillStyle='#4f9a6a';ctx.beginPath();ctx.ellipse(129+j*3,wy+wh-12-j%2*3,3,7,(j-1.5)*.5,0,TAU);ctx.fill();}
 const lampsOn=working||mode==='done';
 for(const lx of [486,806,1068]){
  if(lampsOn){const g=ctx.createLinearGradient(0,22,0,FL);g.addColorStop(0,'rgba(255,224,160,.3)');g.addColorStop(1,'rgba(255,224,160,0)');
   ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(lx-9,22);ctx.lineTo(lx+9,22);ctx.lineTo(lx+120,FL);ctx.lineTo(lx-120,FL);ctx.closePath();ctx.fill();}
  line([[lx,0],[lx,12]],'#4b5563',1.4);ctx.fillStyle='#374151';ctx.beginPath();ctx.moveTo(lx-5,12);ctx.lineTo(lx+5,12);ctx.lineTo(lx+11,22);ctx.lineTo(lx-11,22);ctx.closePath();ctx.fill();
  circ(lx,22.5,2.6,lampsOn?'#fde68a':'#d1d5db');}
 if(working)for(const [x,r] of LAB_SPOTS[phase]||[]){const a=.28+.06*Math.sin(T*2), g=ctx.createLinearGradient(0,0,0,FL);
  g.addColorStop(0,`rgba(255,214,120,${a})`);g.addColorStop(1,`rgba(255,214,120,${a*.4})`);
  ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x-r*.18,0);ctx.lineTo(x+r*.18,0);ctx.lineTo(x+r,FL);ctx.lineTo(x-r,FL);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.ellipse(x,FL-1,r*.95,7,0,0,TAU);ctx.fillStyle=`rgba(255,200,90,${a})`;ctx.fill();}
 const hrs=clock.getHours()%12+clock.getMinutes()/60, mins=clock.getMinutes()+clock.getSeconds()/60;
 circ(1186,104,13,'#fff');ctx.beginPath();ctx.arc(1186,104,13,0,TAU);ctx.strokeStyle='#4b5563';ctx.lineWidth=2;ctx.stroke();
 for(let i=0;i<12;i++){const a=i/12*TAU;line([[1186+Math.sin(a)*10.4,104-Math.cos(a)*10.4],[1186+Math.sin(a)*11.6,104-Math.cos(a)*11.6]],'rgba(31,41,55,.5)',1);}
 line([[1186,104],[1186+Math.sin(hrs/12*TAU)*6.5,104-Math.cos(hrs/12*TAU)*6.5]],ink,1.8);line([[1186,104],[1186+Math.sin(mins/60*TAU)*9.6,104-Math.cos(mins/60*TAU)*9.6]],ink,1.2);
 // The coordinator's tubes: a glass pipe along the ceiling with a drop at every station. As each phase begins, a
 // capsule carries the work from the last station to the next; at publication it carries the new guide to the wall.
 line([[322,44],[1276,44]],'#b8c2c8',7);line([[322,42.5],[1276,42.5]],'rgba(255,255,255,.6)',1.6);
 for(const x of Object.values(LAB_DROPS)){line([[x,44],[x,62]],'#b8c2c8',6);ctx.fillStyle='#9aa6ad';ctx.beginPath();ctx.moveTo(x-7,62);ctx.lineTo(x+7,62);ctx.lineTo(x+4,68);ctx.lineTo(x-4,68);ctx.closePath();ctx.fill();}
 labHits.push({kind:'machine',x0:322,x1:1276,y0:34,y1:70});
 const hanging=at('publish'), count=wall+(hanging?1:0), shownWall=Math.min(17,count), first=Math.max(0,count-17), newSlot=400+(shownWall-1)*30;
 const target=phase==='publish'?newSlot+12:LAB_DROPS[{choose:'write',revise:'write'}[phase]||phase], source=LAB_DROPS[LAB_FROM[phase]];
 if(working&&busy&&target!=null&&source!=null&&s<1.25){const q=smooth(s/1.05), cx=source+(target-source)*q, cy=44+(s>1.05?(s-1.05)/.2*18:0);
  box(cx-8,cy-4,16,8,'#f59e0b',4);box(cx-2,cy-4,4,8,'rgba(255,255,255,.65)',1);}
 // The wall of investigations: one frame for every published guide; a new one drops into place from the tube.
 for(let i=0;i<shownWall;i++){const x=400+i*30, y=84, last=i===shownWall-1, drop=hanging&&last?smooth((s-1.1)/.7):1;
  if(hanging&&last&&s<1.1)continue;const fy=44+(y-44)*drop;
  if(last&&(hanging||mode==='done'&&outcome==='published')){const g=ctx.createRadialGradient(x+12,fy+10,1,x+12,fy+10,22);g.addColorStop(0,'rgba(253,224,71,.55)');g.addColorStop(1,'rgba(253,224,71,0)');ctx.fillStyle=g;ctx.fillRect(x-12,fy-12,48,44);}
  box(x,fy,24,20,'#9a6b45',2);box(x+2,fy+2,20,16,'#fffaf0',1);sketch(x+2,fy+2,20,16,first+i,['#2563eb','#d97706','#0e9f7a','#7c3aed'][(first+i)%4],1);
  if(!(hanging&&last))labHits.push({kind:'frame',index:first+i,x0:x,x1:x+24,y0:y,y1:y+20});}
 // The notes board by the door, where the owner's guidance notes are pinned, and the door itself.
 box(1236,58,60,62,'#9a6b45',3);box(1239,61,54,56,'#d8b98f',2);labHits.push({kind:'notes',x0:1236,x1:1296,y0:58,y1:120});
 pinned.forEach((n,i)=>{if(plane>=0&&i===pinned.length-1&&n.status==='new')return;const [x,y]=slot(i);
  ctx.globalAlpha=n.status==='applied'?.75:1;box(x,y,14,12,'#fde68a',1.5);for(let j=0;j<3;j++)line([[x+3,y+4.5+j*2.6],[x+11-j*2,y+4.5+j*2.6]],'rgba(120,90,40,.45)',.8);
  circ(x+7,y+1.4,1.5,'#ef4444');if(n.status==='applied')tick(x+12,y+10,3.6,'#16a34a');ctx.globalAlpha=1;
  if(n.status==='new'&&noteAge<3.4){const q=(noteAge-1.7)/1.7;for(let j=0;j<4;j++){const a=j/4*TAU+q;spark(x+7+Math.cos(a)*12*q,y+6+Math.sin(a)*12*q,2.4*(1-q),'#f59e0b');}}});
 box(1244,144,50,90,'#c8a27a',3);box(1250,152,38,30,'rgba(255,255,255,.18)',2);box(1250,194,38,32,'rgba(255,255,255,.18)',2);
 box(1258,185,22,4,'#4b5563',1);circ(1252,204,2.4,'#6b4a2f');labHits.push({kind:'notes',x0:1244,x1:1294,y0:144,y1:234});
 // Research: shelves of books with a Newton's cradle on top; sources fly from the shelves to a growing pile.
 box(276,138,80,4,wood,1);box(276,138,5,132,wood);box(351,138,5,132,wood);
 [172,206,240,268].forEach((y,r)=>{box(276,y,80,3,wood);if(r===3)return;let x=283;
  for(let i=0;x<345;i++){const bw=Math.min(6+3*hash(i+r*7),349-x), bh=18+9*hash(i*3.7+r);if(bw<4)break;
   box(x,y-bh,bw,bh,['#5b8def','#e2a33c','#3fb58f','#d9634f','#9b7fe0','#7b8794'][(i*2+r)%6],1);x+=bw+1.5;}});
 line([[290,138],[290,118],[342,118],[342,138]],'#6b7280',1.6);
 const swing=open&&!still?.6*Math.sin(T*(working?2.6:1.2)):0;
 for(let i=0;i<5;i++){const px=303.6+i*6.2, a=i===0&&swing<0||i===4&&swing>0?swing:0, bx=px+16*Math.sin(a), by=118+16*Math.cos(a);
  line([[px,118],[bx,by]],'rgba(31,41,55,.4)',.8);circ(bx,by,3.1,'#9ca3af');circ(bx-1,by-1,1,'#f3f4f6');}
 const gathered=working?(phase==='research'?Math.min(6,Math.floor(s/1.6)):phase==='choose'?0:6):mode==='done'?6:0;
 for(let i=0;i<gathered;i++)box(386+(hash(i*2.1)-.5)*3,FL-4-i*2.6,20,2.4,i%2?'#fffaf0':'#f5efe2',.6);
 if(at('research')&&busy){const q=(s%1.6)/1.6, n=Math.floor(s/1.6), from=[286+hash(n)*58,146+hash(n*3.3)*110], to=[396,FL-6-gathered*2.6];
  const px=from[0]+(to[0]-from[0])*q, py=from[1]+(to[1]-from[1])*q-Math.sin(q*Math.PI)*34;
  ctx.save();ctx.translate(px,py);ctx.rotate(q*4);box(-6,-4,12,8,'#fffaf0',1);ctx.strokeStyle='rgba(31,41,55,.25)';ctx.lineWidth=.8;ctx.strokeRect(-6,-4,12,8);ctx.restore();}
 // The bench, where the scientist writes up the research, testing beside a bubbling burner.
 box(396,bt,190,5,top,1);box(402,bt+5,178,20,'#d9c3a3');line([[491,bt+8],[491,bt+22]],'rgba(120,90,60,.3)',1);
 box(398,bt-3,22,3,'#6b7280',1);line([[404,bt-3],[404,bt-56]],'#6b7280',2);line([[404,bt-30],[427,bt-30]],'#6b7280',1.6);
 box(421,bt-4,12,4,'#4b5563',1);box(424.5,bt-16,5,12,'#6b7280',1);
 if(open){const fh=(working?9:5)+1.6*Math.sin(T*13)+.8*Math.sin(T*29);
  for(const [s2,col] of [[1,'rgba(59,130,246,.7)'],[.55,'rgba(191,219,254,.95)']]){ctx.beginPath();ctx.moveTo(427,bt-16);
   ctx.quadraticCurveTo(427-4*s2,bt-16-fh*s2*.45,427,bt-16-fh*s2);ctx.quadraticCurveTo(427+4*s2,bt-16-fh*s2*.45,427,bt-16);ctx.fillStyle=col;ctx.fill();}}
 box(424,bt-62,6,14,glass,1);ctx.strokeStyle=edge;ctx.lineWidth=1.2;ctx.strokeRect(424,bt-62,6,14);
 ctx.beginPath();ctx.arc(427,bt-40,10,0,TAU);ctx.fillStyle=glass;ctx.fill();ctx.save();ctx.clip();box(414,bt-42,26,14,'rgba(251,146,60,.8)');
 if(open)for(let i=0;i<4;i++){const q=(T*(working?1.1:.5)+hash(i*1.9))%1;circ(427+(hash(i*3.1)-.5)*12,bt-31-q*10,1.1+hash(i*4.7),'rgba(255,255,255,.85)');}
 ctx.restore();ctx.beginPath();ctx.arc(427,bt-40,10,0,TAU);ctx.strokeStyle=edge;ctx.lineWidth=1.2;ctx.stroke();
 if(open)for(let i=0;i<3;i++){const q=(T*.4+i/3)%1, vx=427+q*12+Math.sin(T*1.3+i*2)*2.5, vy=bt-66-q*36, r=3+q*9, g=ctx.createRadialGradient(vx,vy,0,vx,vy,r);
  g.addColorStop(0,`rgba(148,163,184,${.5*(1-q)})`);g.addColorStop(1,'rgba(148,163,184,0)');ctx.fillStyle=g;ctx.fillRect(vx-r,vy-r,2*r,2*r);}
 const fx=462, cycle=at('record')?6:working?12:0, c6=cycle?T%cycle:0, lift=busy&&cycle?smooth((c6-.3)/.6)*(1-smooth((c6-3.7)/.6)):0, pour=busy&&cycle?smooth((c6-.9)/.5)*(1-smooth((c6-3.1)/.5)):0;
 const level=.38+(cycle?.3*smooth((c6-1.2)/2)-.3*smooth((c6-4)/2):0);
 const flask=()=>{ctx.beginPath();ctx.moveTo(fx-4,bt-36);ctx.lineTo(fx-4,bt-22);ctx.lineTo(fx-14,bt);ctx.lineTo(fx+14,bt);ctx.lineTo(fx+4,bt-22);ctx.lineTo(fx+4,bt-36);ctx.closePath();};
 flask();ctx.fillStyle=glass;ctx.fill();ctx.save();ctx.clip();box(fx-15,bt-22*level,30,22*level,'rgba(52,211,153,.78)');
 if(open)for(let i=0;i<3+Math.round(4*(level-.38)/.3);i++){const q=(T*.9+hash(i*1.7))%1;circ(fx+(hash(i*2.9)-.5)*16*(1-q*.6),bt-2-q*(22*level-3),1+hash(i*4.3),'rgba(255,255,255,.85)');}
 ctx.restore();flask();ctx.strokeStyle=edge;ctx.lineWidth=1.2;ctx.stroke();
 const bk=[481-7*lift,bt-8-37*lift], tilt=-1.15*pour, lip=[bk[0]-6*Math.cos(tilt)+8*Math.sin(tilt),bk[1]-6*Math.sin(tilt)-8*Math.cos(tilt)];
 if(pour>.85)line([lip,[fx,bt-37]],'rgba(52,211,153,.85)',2);
 [['#93c5fd',534],['#c4b5fd',546],['#fca5a5',558],['#86efac',570]].forEach(([c,x],i)=>{box(x-3,bt-30,6,28,glass,2.5);box(x-2.4,bt-12-hash(i)*6,4.8,10+hash(i)*6,rgba(c,.88),2);
  ctx.beginPath();ctx.roundRect(x-3,bt-30,6,28,2.5);ctx.strokeStyle=edge;ctx.lineWidth=1;ctx.stroke();});
 box(524,bt-14,56,3,wood,1);box(526,bt-14,3,14,wood);box(575,bt-14,3,14,wood);
 // The designer's drafting table: a tilted board where the storyboard is sketched, under a desk lamp.
 const thumbs=!open?0:resting?1:working?({choose:0,research:0,record:0,design:Math.min(4,Math.floor(s/2)+1)}[phase]??4):mode==='done'?4:0;
 ctx.save();ctx.translate(604,244);ctx.rotate(-.22);box(0,-12,64,22,'#e8dcc6',2);ctx.strokeStyle='rgba(120,90,60,.45)';ctx.lineWidth=1.2;ctx.strokeRect(0,-12,64,22);
 box(4,-10,56,18,'#fffdf7',1);for(let i=0;i<thumbs;i++){const f=at('design')&&i===thumbs-1?clamp((s-i*2)/1.2):1;ctx.globalAlpha=f;
  ctx.strokeStyle='rgba(31,41,55,.45)';ctx.lineWidth=.8;ctx.strokeRect(6+i*13.5,-8,11,9);sketch(6+i*13.5,-8,11,9,i,'#2563eb',.9);ctx.globalAlpha=1;}ctx.restore();
 line([[636,252],[636,BASE]],wood,4);ctx.fillStyle=wood;ctx.beginPath();ctx.ellipse(636,BASE,12,2.6,0,0,TAU);ctx.fill();
 line([[664,230],[672,200],[688,196]],'#4b5563',2.2);ctx.fillStyle='#4b5563';ctx.beginPath();ctx.moveTo(682,190);ctx.lineTo(696,198);ctx.lineTo(684,206);ctx.closePath();ctx.fill();
 if(open&&(at('design')||resting)){const g=ctx.createRadialGradient(676,214,2,676,214,40);g.addColorStop(0,`rgba(255,220,140,${at('design')?.4:.2})`);g.addColorStop(1,'rgba(255,220,140,0)');ctx.fillStyle=g;ctx.fillRect(636,174,80,80);}
 // The blackboard: the question arriving, the chapters the writer writes, and the guidance note in use.
 const bd={x:708,y:130,w:196,h:94};
 box(bd.x-6,bd.y-6,bd.w+12,bd.h+12,'#9a6b45',3);box(bd.x,bd.y,bd.w,bd.h,open?'#2f3e3a':'#28332f',1);box(bd.x-9,bd.y+bd.h+5,bd.w+18,4,'#9a6b45',1);
 box(bd.x+30,bd.y+bd.h+2,7,3,'#f8fafc',1);box(bd.x+44,bd.y+bd.h+2,6,3,'#fde68a',1);labHits.push({kind:'board',x0:bd.x-6,x1:bd.x+bd.w+6,y0:bd.y-6,y1:bd.y+bd.h+6});
 const taken=notes.find(n=>n.status==='taken'), chalk='rgba(255,255,255,.86)', textW=bd.w-22-(taken&&working?24:0), shown=open&&question&&k>.7;
 const reveal=at('choose')?clamp((s-1.3)/3):1;
 if(shown){ctx.font=`600 11px "Chalkboard SE","Comic Sans MS","Segoe Print",cursive`;ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillStyle=chalk;
  const words=question.split(/\s+/), lines=[''];for(const wd of words){const tryLine=(lines.at(-1)+' '+wd).trim();if(ctx.measureText(tryLine).width>textW&&lines.at(-1)){if(lines.length===3){lines[2]+='\u2026';break;}lines.push(wd);}else lines[lines.length-1]=tryLine;}
  const total=lines.join('').length;let left=Math.floor(total*reveal);
  lines.forEach((ln,i)=>{const part=ln.slice(0,Math.max(0,left));left-=ln.length;if(part)ctx.fillText(part,bd.x+11,bd.y+18+i*14);});}
 else if(open&&resting)sketch(bd.x+50,bd.y+16,100,34,0,'rgba(255,255,255,.32)',1.6);
 const blocks=!working?(mode==='done'?(outcome==='stopped'?2:4):0):({choose:0,research:0,record:0,design:0,write:Math.min(4,Math.floor(s/2.2)+1)}[phase]??4);
 const redo=at('revise')?clamp((s-1)/3):1;
 for(let i=0;i<blocks;i++){const px=bd.x+10+i*46, py=bd.y+66, f=at('write')&&i===blocks-1?clamp((s-i*2.2)/1.4):i===3&&at('revise')?redo:1;ctx.globalAlpha=f;
  line([[px,py],[px+24,py]],'rgba(255,255,255,.9)',2.4);
  for(let j=0;j<2;j++){const pts=[];for(let q=0;q<=10;q++)pts.push([px+q*3.8,py+9+j*7+Math.sin(q*1.7+i+j)*1.2]);line(pts,'rgba(255,255,255,.6)',1.1);}ctx.globalAlpha=1;}
 if(at('revise')&&s<1.2){ctx.fillStyle='rgba(255,255,255,.18)';ctx.fillRect(bd.x+146,bd.y+60,44,30);}
 if(mode==='done'){if(outcome==='published')line([[bd.x+bd.w-40,bd.y+58],[bd.x+bd.w-30,bd.y+70],[bd.x+bd.w-10,bd.y+42]],'rgba(134,239,172,.95)',3.4);
  else{ctx.font=`700 26px "Chalkboard SE","Comic Sans MS",cursive`;ctx.fillStyle='rgba(253,224,71,.9)';ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillText('?',bd.x+bd.w-24,bd.y+76);}}
 if(taken&&working){const fly=phase==='choose'&&!still?smooth(s/1.6):1, x=bd.x+bd.w-22+(slot(0)[0]-(bd.x+bd.w-22))*(1-fly), y=bd.y+4+(slot(0)[1]-(bd.y+4))*(1-fly)-Math.sin(fly*Math.PI)*24;
  box(x,y,14,12,'#fde68a',1.5);for(let j=0;j<3;j++)line([[x+3,y+4.5+j*2.6],[x+11-j*2,y+4.5+j*2.6]],'rgba(120,90,40,.45)',.8);box(x+4,y-1.5,6,3,'rgba(255,255,255,.6)',1);}
 // The render machine (the coordinator): it captures the frames in a browser on its own and prints them onto a strip.
 box(920,bt,84,5,top,1);box(924,bt+5,5,15,wood);box(995,bt+5,5,15,wood);
 box(952,bt-6,12,6,'#374151',2);box(926,194,64,52,'#1f2937',5);box(930,198,56,44,open?'#0b2a1f':'#111827',2);
 if(open&&at('render')){box(933,201,50,38,'#f7f2e8',2);ctx.save();ctx.beginPath();ctx.rect(933,201,50,38);ctx.clip();sketch(933,201,50,38,Math.floor(s/1.2)%4,'#2563eb',1.8);ctx.restore();
  if(busy){const fl=1-((s%1.2)/.25);if(fl>0){ctx.fillStyle=`rgba(255,255,255,${.85*fl})`;ctx.fillRect(930,198,56,44);}}}
 else if(open){const sc=[];for(let i=0;i<=40;i++)sc.push([932+52*i/40,220-Math.sin(i*.4-T*(working?3:.6))*9]);line(sc,'#4ade80',1.5);}
 circ(984,204,2.2,open?(at('render')&&Math.floor(T*4)%2?'#22c55e':'#86efac'):'#4b5563');
 box(988,bt-12,14,12,'#d1d5db',2);box(990,bt-10,10,2,'#6b7280',1);
 const strip=working?(phase==='render'?Math.min(1,s/4):['review','revise','publish'].includes(phase)?1:0):0;
 if(strip>0){const len=strip*34;ctx.fillStyle='#fffaf0';ctx.fillRect(990,bt-2,10,Math.min(len,40));
  for(let i=0;i*9<len-4;i++){ctx.strokeStyle='rgba(37,99,235,.55)';ctx.lineWidth=.8;ctx.strokeRect(991,bt-1+i*9,8,6);}}
 labHits.push({kind:'machine',x0:920,x1:1004,y0:190,y1:BASE});
 // The review wall screen, where the four reviewers inspect the rendered frames.
 box(1010,130,116,70,'#1f2937',5);box(1014,134,108,62,open&&(at('review')||at('revise')||at('publish')||mode==='done')?'#f7f2e8':'#141c26',3);
 if(open&&(at('review')||at('revise')||at('publish')||mode==='done'))for(let i=0;i<3;i++){ctx.strokeStyle='rgba(31,41,55,.35)';ctx.lineWidth=1;ctx.strokeRect(1020+i*34,146,30,24);sketch(1020+i*34,146,30,24,i,'#2563eb',1.3);}
 // The microscope table, for the accuracy review.
 box(1130,bt,60,5,top,1);box(1136,bt+5,5,15,wood);box(1180,bt+5,5,15,wood);
 box(1154,bt-5,24,5,'#374151',2);line([[1160,bt-4],[1161,bt-19],[1171,bt-24]],'#374151',4.5);line([[1156,bt-9],[1184,bt-9]],'#6b7280',2.4);
 line([[1170,bt-12],[1183,bt-25]],'#374151',5.5);line([[1183,bt-25],[1186,bt-28]],'#1f2937',7);line([[1170,bt-12],[1169,bt-10]],'#4b5563',3);
 line([[1168,bt-10.5],[1180,bt-10.5]],'rgba(147,197,253,.95)',1.4);circ(1161,bt-15,2.6,'#9ca3af');
 // Front furniture: the couch under the window, a floor lamp, the armchair, the chess table and stools, the designer's
 // stool, a beanbag, a potted plant, the chair by the door and the bin.
 ctx.fillStyle='#e4d4bc';ctx.beginPath();ctx.ellipse(104,FL-1,98,9,0,0,TAU);ctx.fill();
 box(24,230,152,42,'#5f8aa0',10);box(18,260,168,20,'#6f9bb1',6);line([[102,263],[102,278]],'rgba(255,255,255,.25)',1);
 box(28,278,5,14,'#4b5563',2);box(171,278,5,14,'#4b5563',2);box(40,248,30,14,'#f5efe2',6);
 line([[198,FL],[198,184]],'#4b5563',2);ctx.fillStyle='#4b5563';ctx.beginPath();ctx.ellipse(198,FL,9,2.5,0,0,TAU);ctx.fill();
 ctx.fillStyle=open&&!working?'#fde68a':'#e5e7eb';ctx.beginPath();ctx.moveTo(189,166);ctx.lineTo(207,166);ctx.lineTo(212,184);ctx.lineTo(184,184);ctx.closePath();ctx.fill();
 box(216,234,44,44,'#c27c5a',9);box(212,270,52,12,'#d08b68',5);box(218,282,4,12,'#6b4a2f',1);box(254,282,4,12,'#6b4a2f',1);
 ctx.fillStyle=wood;ctx.beginPath();ctx.ellipse(548,260,17,4,0,0,TAU);ctx.fill();line([[548,262],[548,FL-2]],'#6b4a2f',3);ctx.beginPath();ctx.ellipse(548,FL-1,9,2.4,0,0,TAU);ctx.fill();
 for(let i=0;i<6;i++)box(537+i*3.7,254.5,3.7,3.5,i%2?'#f5efe2':'#4b5563',.4);
 const move=Math.floor(T/7);for(let i=0;i<4;i++){const px=538+((i*5+move*(i%2?3:7))%20);circ(px,253,1.5,i<2?'#f8fafc':'#111827');}
 for(const sx of [522,574,688]){box(sx-8,278,16,4,'#6b4a2f',2);line([[sx,282],[sx,FL-2]],'#6b4a2f',2.4);}
 ctx.fillStyle='#8fb3c9';ctx.beginPath();ctx.ellipse(1040,FL-11,24,13,0,0,TAU);ctx.fill();ctx.fillStyle='rgba(255,255,255,.18)';ctx.beginPath();ctx.ellipse(1032,FL-16,10,5,-.3,0,TAU);ctx.fill();
 box(1118,FL-22,18,22,'#c2703d',3);for(let j=0;j<5;j++){ctx.fillStyle=j%2?'#3f8a5a':'#4f9a6a';ctx.beginPath();ctx.ellipse(1121+j*3,FL-30-(j%2)*6,4,11,(j-2)*.35,0,TAU);ctx.fill();}
 box(1206,278,18,4,'#6b4a2f',2);line([[1222,246],[1222,282]],'#6b4a2f',3);line([[1208,282],[1208,FL-2]],'#6b4a2f',2.2);line([[1220,282],[1220,FL-2]],'#6b4a2f',2.2);
 ctx.fillStyle='#9ca3af';ctx.beginPath();ctx.moveTo(894,270);ctx.lineTo(914,270);ctx.lineTo(911,292);ctx.lineTo(897,292);ctx.closePath();ctx.fill();line([[893,270],[915,270]],'#6b7280',1.6);
 for(let i=0;i<Math.min(4,Math.max(0,rejected-(at('revise')&&busy&&s<1.2?1:0)));i++)circ(898+i*4.6,268-(i%2)*2.5,3.6,'#f5efe2');
 if(at('revise')&&busy&&s<1.2){const q=s/1.2;circ(884+(904-884)*q,214+(266-214)*q-Math.sin(q*Math.PI)*30,3.6,'#f5efe2');}
 // The agents.
 const thinking=i=>working&&{research:[0],record:[2],design:[6],write:[1],revise:[1],review:[3,4,7,8]}[phase]?.includes(i);
 const crown=(i,hx,hy)=>{if(!busy||!thinking(i))return;for(let j=0;j<3;j++){const q=(T*.8+j/3)%1, side=j%2?1:-1;spark(hx+side*(14+j*2),hy-8-q*16,2+1.6*Math.sin(q*Math.PI),ai,Math.sin(q*Math.PI)*.9);}};
 const tag=(i,hx,hy,r)=>{labHits.push({kind:'person',who:i,x0:hx-18,x1:hx+18,y0:hy-14,y1:FL});if(r)bubble(hx+12,hy-20,r.kind,fade(r));};
 if(open){
  // The researcher: gathers sources at the shelves; naps on the couch between runs.
  const r0=react(0), researcher={skin:'#8d5524',hair:'#2a1a12',style:3,shirt:'#34d399'};
  if(resting&&!(r0&&r0.q<2.4)){ctx.save();ctx.translate(126,262);ctx.rotate(-Math.PI/2);person(0,0,{...researcher,face:0,hands:[[-9*u,-37*u],[9*u,-37*u]]});ctx.restore();
   ctx.save();ctx.translate(86,260);ctx.rotate(-.2);box(-11,-8,22,15,'#2563eb',2);box(-10,-7,9.5,13,'#fffaf0',1);box(.5,-7,9.5,13,'#fffaf0',1);ctx.restore();
   zzz(50,240);labHits.push({kind:'person',who:0,x0:40,x1:132,y0:240,y1:280});}
  else if(resting){const [hx,hy]=person(72,FL,{...researcher,sit:270,face:0,hop:hopOf(r0),hands:[[60,260],[86,260]]});tag(0,hx,hy,r0);}
  else{const by=FL-50, flip=!busy?1:(T%(at('research')?1.1:3.2))/.8;
   const [hx,hy]=person(368,FL,{...researcher,face:r0?0:follow(368)??1,bow:r0?0:.3,hop:hopOf(r0),hands:[[359,by+5],[383,by+5]]});
   box(357,by-9,28,18,'#2563eb',2);box(358,by-8,13,16,'#fffaf0',1);box(371,by-8,13,16,'#fffaf0',1);
   for(let j=0;j<3;j++){line([[360,by-4+j*4],[369,by-4+j*4]],'rgba(31,41,55,.22)',.8);line([[373,by-4+j*4],[382,by-4+j*4]],'rgba(31,41,55,.22)',.8);}
   if(flip<1){const f=Math.cos(flip*Math.PI);ctx.beginPath();ctx.roundRect(371+Math.min(0,13*f),by-8,Math.abs(13*f)+.6,16,1);ctx.fillStyle='#fffdf7';ctx.fill();ctx.strokeStyle='rgba(31,41,55,.3)';ctx.lineWidth=.8;ctx.stroke();}
   circ(358,by+6,2.8*u,researcher.skin);circ(384,by+6,2.8*u,researcher.skin);crown(0,hx,hy);tag(0,hx,hy,r0);}
  // The writer: writes the chapters and narration on the board; has tea in the armchair between runs.
  const r1=react(1), writer={skin:'#f1c27d',hair:'#a0522d',style:1,shirt:'#fbbf24'};
  if(resting){const wave=r1&&r1.kind==='!'&&r1.q>.3&&r1.q<1.9, cup=[254,246+(busy&&!r1?Math.max(0,Math.sin(T*.7))*-6:0)];
   const [hx,hy]=person(238,FL,{...writer,sit:272,face:r1?0:follow(238)??1,hop:hopOf(r1),hands:[wave?[254,210+Math.sin(T*14)*3]:cup,[228,270]]});
   if(!wave){box(cup[0]-3,cup[1]-6,8,8,'#f8fafc',2);ctx.strokeStyle='rgba(31,41,55,.35)';ctx.lineWidth=1;ctx.strokeRect(cup[0]-3,cup[1]-6,8,8);steam(cup[0]+1,cup[1]-7);}
   tag(1,hx,hy,r1);}
  else{const writing=busy&&(at('write')||at('revise')&&redo<1), along=at('write')?Math.min(3,s/2.2):3, blockX=bd.x+10+Math.floor(along)*46;
   const sx=at('choose')?bd.x+46:at('write')||at('revise')?bd.x+44+along*46:mode==='done'?bd.x+30:bd.x+bd.w-4;
   const hand=writing?[blockX+12+Math.sin(T*6)*10,bd.y+76+Math.cos(T*5)*5]:at('choose')?[sx-6,FL-62]:[sx+(mode==='done'?13:-13),FL-46];
   const [hx,hy]=person(sx,FL,{...writer,face:r1?0:mode==='done'?1:-1,hop:hopOf(r1),walk:at('write')&&along<3&&busy?sx*.25:null,hands:[hand,[sx+12,FL-36]]});
   if(writing)for(let i=0;i<3;i++){const q=(T*1.7+hash(i*2.3))%1;circ(hand[0]+(hash(i*5.1)-.5)*5,hand[1]+q*20,1.1,`rgba(255,255,255,${.75*(1-q)})`);}
   crown(1,hx,hy);tag(1,hx,hy,r1);}
  // The scientist: writes up the research at the bench; plays chess between runs.
  const r2=react(2), scientist={skin:'#ffdbac',hair:'#d4a03c',style:2,shirt:'#f87171'};
  if(resting){const reach=busy&&!r2?smooth(((T%7)-5.2)/.5)*(1-smooth(((T%7)-6.3)/.4)):0;
   const [hx,hy]=person(522,FL,{...scientist,sit:278,face:r2?0:follow(522)??1,hop:hopOf(r2),hands:[[536+reach*8,260-reach*6],[532,272]]});tag(2,hx,hy,r2);}
  else{const [hx,hy]=person(496,FL,{...scientist,face:r2?0:follow(496)??-1,hop:hopOf(r2),hands:[[bk[0]+6,bk[1]+4],[509,FL-34]]});
   ctx.save();ctx.translate(...bk);ctx.rotate(tilt);box(-6,-8,12,16,glass,2);box(-5,0,10,7,'rgba(52,211,153,.78)',1);ctx.strokeStyle=edge;ctx.lineWidth=1.2;ctx.strokeRect(-6,-8,12,16);ctx.restore();
   crown(2,hx,hy);tag(2,hx,hy,r2);}
  // The designer: sketches the storyboard at the drafting table; doodles in a sketchbook between runs.
  const r6=react(6), designer={skin:'#a16b47',hair:'#5b3a29',style:0,shirt:'#2dd4bf'};
  if(resting){const doodle=busy&&!r6?Math.sin(T*3)*3:0;
   const [hx,hy]=person(688,FL,{...designer,sit:278,face:r6?0:follow(688)??-1,bow:r6?0:.35,hop:hopOf(r6),hands:[[674+doodle,262],[682,266]]});
   box(664,258,20,13,'#fef3c7',1.5);ctx.strokeStyle='rgba(120,90,40,.5)';ctx.lineWidth=.8;ctx.strokeRect(664,258,20,13);sketch(666,259,16,10,2,'#d97706',.8);tag(6,hx,hy,r6);}
  else{const drawing=busy&&at('design'), reach=drawing?Math.min(3,s/2):2;
   const [hx,hy]=person(680,FL,{...designer,face:r6?0:follow(680)??-1,bow:r6?0:.3,hop:hopOf(r6),hands:[drawing?[612+reach*13+Math.sin(T*7)*3,236-reach*2.6]:[652,236],[668,244]]});
   crown(6,hx,hy);tag(6,hx,hy,r6);}
  // The visual reviewer: checks the frames on the wall screen with a magnifier; plays chess between runs.
  const r3=react(3), visual={skin:'#c68642',hair:'#1b130e',style:0,shirt:'#a78bfa'};
  if(resting){const think=busy&&!r3&&(T%9)<3;
   const [hx,hy]=person(574,FL,{...visual,sit:278,face:r3?0:follow(574)??-1,hop:hopOf(r3),hands:[think?[566,230]:[558,260],[566,272]]});tag(3,hx,hy,r3);}
  else{const inspecting=at('review'), mx=1046+Math.sin(T*1.5)*4, my=198+Math.cos(T*1.1)*3;
   const [hx,hy]=person(1024,FL,{...visual,face:r3?0:follow(1024)??1,hop:hopOf(r3),hands:inspecting?[[mx-6,my+8],[1012,FL-40]]:[[1012,FL-40],[1036,FL-40]]});
   if(inspecting){ctx.beginPath();ctx.arc(mx,my,7,0,TAU);ctx.fillStyle='rgba(191,219,254,.35)';ctx.fill();ctx.strokeStyle='#374151';ctx.lineWidth=2;ctx.stroke();line([[mx-5,my+5],[mx-6,my+8]],'#374151',2.4);}
   crown(3,hx,hy);tag(3,hx,hy,r3);}
  // The blind viewer: watches the frames with earmuffs on, so no words reach them; waters the plants between runs.
  const r8=react(8), blind={skin:'#f2d0b0',hair:'#3f3f46',style:2,shirt:'#fb923c'};
  if(resting){const pour=busy&&!r8?(T%8)<4:false;
   const [hx,hy]=person(1098,FL,{...blind,face:r8?0:follow(1098)??1,neck:true,hop:hopOf(r8),hands:[[1110,FL-50],[1090,FL-40]]});
   box(1106,FL-56,12,10,'#60a5fa',2);line([[1118,FL-52],[1124,FL-58]],'#60a5fa',2);
   if(pour)for(let j=0;j<3;j++){const q=(T*1.6+j/3)%1;circ(1125+q*2,FL-56+q*22,1.1,'rgba(96,165,250,.8)');}
   tag(8,hx,hy,r8);}
  else{const [hx,hy]=person(1064,FL,{...blind,face:r8?0:follow(1064)??1,muffs:true,hop:hopOf(r8),hands:[[1056,FL-30],[1072,FL-30]]});crown(8,hx,hy);tag(8,hx,hy,r8);}
  // The beginner reviewer: reads the guide on a tablet as a beginner would; reads a comic on the beanbag between runs.
  const r7=react(7), beginner={skin:'#e8b88a',hair:'#111827',style:4,shirt:'#f472b6'};
  if(resting){const [hx,hy]=person(1040,FL,{...beginner,sit:286,face:r7?0:follow(1040)??1,bow:r7?0:.3,hop:hopOf(r7),hands:[[1032,262],[1050,262]]});
   box(1030,252,22,15,'#facc15',2);box(1031,253,10,13,'#fef9c3',1);box(1042,253,9,13,'#fde68a',1);circ(1036,258,2,'#ef4444');circ(1046,260,2,'#3b82f6');tag(7,hx,hy,r7);}
  else{const reading=at('review');
   const [hx,hy]=person(1104,FL,{...beginner,face:r7?0:follow(1104)??-1,bow:r7?0:reading?.3:0,hop:hopOf(r7),hands:[[1094,FL-46],[1112,FL-46]]});
   box(1092,FL-58,22,15,'#1f2937',2);box(1094,FL-56,18,11,reading?'#f8fafc':'#cbd5e1',1);if(reading)for(let j=0;j<3;j++)line([[1096,FL-53+j*3],[1109-j*2,FL-53+j*3]],'rgba(31,41,55,.4)',.8);
   crown(7,hx,hy);tag(7,hx,hy,r7);}
  // The accuracy reviewer: checks the physics or the mathematics at the microscope; reads the paper by the door
  // between runs.
  const r4=react(4), reviewer={skin:'#e0ac69',hair:'#9ca3af',style:4,shirt:'#38bdf8'}, rvx=1202;
  if(resting){const turn=busy&&!r4?smooth(((T%9)-8.2)/.4):0;
   const [hx,hy]=person(1214,FL,{...reviewer,sit:278,face:r4?0:follow(1214)??-1,bow:r4?0:.25,hop:hopOf(r4),hands:[[1192,244],[1204,248]]});
   if(!(r4&&r4.q<2.4)){box(1182,228,26,24,'#f3f4f6',1);ctx.strokeStyle='rgba(31,41,55,.3)';ctx.lineWidth=.8;ctx.strokeRect(1182,228,26,24);
    for(let j=0;j<5;j++)line([[1185,233+j*4],[1196-(j%2)*3,233+j*4]],'rgba(31,41,55,.3)',.8);box(1198,232,7,7,'rgba(31,41,55,.18)',.5);
    if(turn>0){ctx.globalAlpha=1-turn;box(1195,228,13*(1-turn),24,'#fafafa',1);ctx.globalAlpha=1;}}
   tag(4,hx,hy,r4);}
  else{const c=T%(working?9:14), lw=at('review')?1:!busy?1:smooth(c/.6)*(1-smooth((c-(working?4.4:3.4))/.6)), look=lw>.5&&!r4, bow=at('review')&&!r4?.85+.15*Math.sin(T*2):r4?0:lw*.8;
   const [hx,hy]=person(rvx,FL,{...reviewer,face:r4?0:follow(rvx)??-1,bow,hop:hopOf(r4),hands:look?[[1174,bt-11],[1184,bt-6]]:[[rvx-14,FL-44],[rvx-6,FL-52]]});
   if(!look){box(rvx-24,FL-60,15,20,'#b08968',2);box(rvx-22.5,FL-57,12,16,'#fffdf7',1);box(rvx-19,FL-62,6,3,'#6b7280',1);
    for(let j=0;j<3;j++)line([[rvx-20.5,FL-52+j*4],[rvx-13,FL-52+j*4]],'rgba(31,41,55,.25)',.8);circ(rvx-14,FL-44,2.8*u,reviewer.skin);}
   crown(4,hx,hy);tag(4,hx,hy,r4);}
 }
 // The armrests in front of whoever sits on the couch and in the armchair.
 box(10,246,22,38,'#577f94',9);box(172,246,22,38,'#577f94',9);box(208,256,10,26,'#b06a4a',5);box(258,256,10,26,'#b06a4a',5);
 // The cat: asleep on the couch between runs and while the lab is closed, else near the work; it jumps at a note.
 const r5=react(5), chase=plane>=0&&plane>.2&&plane<.7?Math.sin((plane-.2)/.5*Math.PI)*12:0;
 if(!working&&mode!=='done'&&!r5&&chase<=0)cat(160,266,{sleep:true,dir:1});
 else{const cx=working?({choose:840,research:410,record:530,design:720,write:860,revise:860,render:960,review:1150,publish:1150}[phase]??860):mode==='done'?640:160, cy=working||mode==='done'?FL:266;
  cat(cx,cy,{dir:cx<labPan+span/2?1:-1,hop:Math.max(hopOf(r5),chase)});if(r5)bubble(cx+12,cy-36,r5.kind,fade(r5));}
 // The reviewers' marks: dots while they read, a grey tick once a review is saved, then green when the review passes or
 // orange when it sends the draft back.
 const marks=working?(phase==='review'?'reading':phase==='revise'&&s<4?'changes':phase==='publish'?'passed':''):mode==='done'?({published:'passed',draft:'changes'}[outcome]||''):'';
 if(marks&&open)[[1104,196],[1024,196],[1196,198],[1064,196]].forEach(([x,y],i)=>{
  if(marks==='reading'&&!reviews[i]){for(let d=0;d<3;d++)circ(x-5+d*5,y,1.6,`rgba(31,41,55,${.25+.5*(Math.floor(T*3)%3===d)})`);return;}
  if(marks==='passed')tick(x,y,6,'#16a34a');else if(marks==='changes'){circ(x,y,6,'#e07a2e');ctx.beginPath();ctx.arc(x,y,2.8,Math.PI*.2,Math.PI*1.7);ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();
   line([[x+2.6,y-2.4],[x+.6,y-1.4],[x+2.9,y]],'#fff',1.3);}else tick(x,y,6,'#9ca3af');});
 // A guidance note on its way in: a paper plane from the page to the notes board.
 if(plane>=0){const [px,py]=planeAt(plane), [qx,qy]=planeAt(Math.max(0,plane-.03)), a=Math.atan2(py-qy,px-qx);
  ctx.save();ctx.translate(px,py);ctx.rotate(a);ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(-7,-5.5);ctx.lineTo(-3.5,0);ctx.lineTo(-7,5.5);ctx.closePath();
  ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='rgba(31,41,55,.45)';ctx.lineWidth=1;ctx.stroke();line([[9,0],[-3.5,0]],'rgba(31,41,55,.35)',.8);ctx.restore();}
 // Lighting: a cosy lamp between runs, dark when the schedule is off.
 if(resting){ctx.fillStyle='rgba(30,41,74,.13)';ctx.fillRect(labPan,0,span,VH);ctx.save();ctx.globalCompositeOperation='lighter';
  const g=ctx.createRadialGradient(198,184,4,198,184,150);g.addColorStop(0,'rgba(255,190,110,.24)');g.addColorStop(1,'rgba(255,190,110,0)');ctx.fillStyle=g;ctx.fillRect(40,20,330,VH);ctx.restore();}
 if(mode==='closed'){ctx.fillStyle='rgba(15,23,42,.36)';ctx.fillRect(labPan,0,span,VH);}
 ctx.restore();
}
// What the point (x, y), in CSS pixels on the canvas, falls on: an agent or the cat, a frame on the wall, the notes
// board or door, the coordinator's machinery, or the blackboard; the last drawn wins.
function labHit(x,y){
 if(!labXf)return null;const vx=(x-labXf.ox)/labXf.k+labXf.pan, vy=(y-labXf.oy)/labXf.k;
 for(let i=labHits.length-1;i>=0;i--){const hit=labHits[i];if(vx>=hit.x0&&vx<=hit.x1&&vy>=hit.y0&&vy<=hit.y1)return hit;}
 return null;
}

const ENGINES={
 'light-bending':{draw:drawLight,a:['Mass','how much mass sits nearby'],b:['Passing distance','how close the light passes','×'],
  fa:a=>a.toFixed(2),fb:b=>b.toFixed(2)+'×',
  measure:['Real bend of the nearest ray',(a,b)=>(Physics.deflection(a,b)*180/Math.PI).toFixed(2)+'°'],scale:'',disclosure:'The mesh measures distance as the time light needs to cross it, timed far away; light’s straightest line across it is the drawn path. Its dip and the bending are drawn for six times the model mass; the readout is the model value for the nearest ray, in the model’s own units. The dip is not a slope, and the star is an illustration.',demoEnd:s=>Math.min(2.5,s.distance+1),
  try:'Slide Mass to zero, then back up. Now move the beam farther away. When does it bend most?',aria:'Light passing a massive object, compared with a straight path without the mass.'},
 'gravity-clocks':{draw:drawClocks,a:['Mass','how much mass sits nearby'],b:['Lower radius','gap stays 2 units',' units'],
  fa:a=>a.toFixed(2),fb:b=>b.toFixed(2)+' units',
  measure:['Lower clock runs slower by',(a,b)=>((1-Physics.clockRatio(a,b))*100).toFixed(2)+'%'],scale:'',disclosure:'The difference between the clock hands is drawn twelve times larger; the slowdown readout is the model value in arbitrary units, not an Earth figure. The planet and distances are illustrations.',demoEnd:()=>2.5,
  try:'Slide Mass to zero. Do the clocks agree? Bring it back, then move the Lower radius outward.',aria:'Two stationary clocks at different heights above a mass. The lower clock counts less time.'},
 'spacetime':{draw:drawSpacetime,a:['Speed','how fast the traveller flies'],b:['Trip','time out before turning back',''],
  fa:a=>Math.round(Physics.speed(a)*100)+'% of light',fb:b=>Physics.turnaround(b).toFixed(1)+' years out',
  measure:['Traveller comes home younger by',a=>(Physics.agingGap(a)*100).toFixed(1)+'%'],scale:'Time runs up · light moves at 45°',disclosure:'Speeds and times are exact for the model; the turnaround is treated as instant.',demoEnd:()=>2.5,
  try:'Set Speed to zero: do the twins agree? Push it up. Then make the trip longer: does the percentage change?',aria:'A spacetime diagram: a home twin stays put while a traveller goes out and back. The traveller collects fewer ticks.'},
 'interference':{draw:drawInterference,a:['Second source','strength of the second wave'],b:['Source spacing','in wavelengths',''],
  fa:a=>a<.005?'off':Math.round(a*100)+'%',fb:b=>Physics.separation(b).toFixed(1)+' λ',
  measure:['Stripe contrast',a=>(Physics.visibility(a)*100).toFixed(0)+'%'],scale:'Seen from above',disclosure:'Wave sizes are illustrative; the stripe contrast is computed exactly for two point sources.',demoEnd:()=>2.5,
  try:'Turn the second source off: what happens to the stripes? Bring it back, then spread the sources apart.',aria:'Two circular wave sources overlapping, making bright and dark stripes on a screen.'},
 'two-slit-particles':{draw:drawParticles,a:['Second slit','how open the second slit is'],b:['Slit spacing','relative distance between the slits',''],
  fa:a=>a<.005?'closed':Math.round(a*100)+'% open',fb:b=>b.toFixed(2)+'×',
  measure:['Stripe contrast',a=>(Physics.visibility(a)*100).toFixed(0)+'%'],scale:'',disclosure:'Arrivals are pseudo-random samples from the predicted pattern; the ripples show possibilities, not paths.',demoEnd:()=>2.5,
  try:'Close the second slit: do the stripes survive? Open it again, then move the slits apart.',aria:'Particles arrive one at a time on a screen behind two slits and slowly build up stripes.'},
 'standing-waves':{draw:drawRope,demo:false,plucks:true,
  a:['How hard you pluck','how far you pull the string'],b:['Where you press','toward the middle, a shorter string rings',''],
  fa:a=>Math.round(a*100)+'%',fb:b=>{const L=guitarLen(b);return L>.996?'open string':Math.round(L*100)+'% rings';},
  measure:[()=>GUITAR.active?'Note':'Rope swings',a=>GUITAR.active?(a>.001?Math.round(220/GUITAR.len):0)+' swings a second':ROPE.key==='pulse'||ROPE.size<.05?'':ROPE.size.toFixed(1)+'× as far as your hand'],tryAny:true,scale:'',demoEnd:()=>2.5,
  disclosure:'The rope is simulated: the wave equation with a little friction, which is why an in-step swing stops growing at about 6 times the hand. Everything is slowed down, the single shake 8 times more; on phones the swing is drawn taller. The rope makes no sound: at a few swings a second it is far too slow to hear. The guitar string is drawn 220 times slower and bigger than it really moves; its sound is a synthesized plucked string at the real pitch, 220 Hz open and 440 Hz pressed at the middle.',
  try:'Move “Where you press” toward the middle: each move plucks the string, and the shorter it rings, the higher the note.',aria:'A hand shakes one end of a rope tied to a wall. At one, two or three shakes a second the rope swings big in one, two or three loops; at other speeds it only jiggles. Then a guitar string is plucked, open and pressed at the middle.'},
 'tunneling':{draw:drawTunnel,a:['Barrier height','compared with the particle’s energy'],b:['Barrier width','how thick the barrier is',''],
  fa:a=>a<.005?'none':(2*a).toFixed(1)+'× energy',fb:b=>(.6*b/(2*Math.PI)).toFixed(2)+' wavelengths',
  measure:['Bounces back',(a,b)=>(Physics.reflected(a,b)*100).toFixed(0)+'%'],scale:'A steady stream, shown at one instant',disclosure:'Exact steady-state solution in units where ħ = 1 and 2m = 1.',demoEnd:()=>2.5,
  try:'Remove the barrier: does anything bounce back? Raise it above the energy, then make it thicker.',aria:'A quantum wave meets a barrier: part bounces back, part leaks through.'},
 'wave-packet':{draw:drawPacket,demo:false,tryAny:true,a:['Blend of speeds','how many wave lengths are mixed in'],b:['Unused','',''],
  fa:a=>{const n=Physics.blendRange(blendSk(a)).length;return n===1?'one wave':n+' waves';},fb:b=>'',
  // The modelled effect for the render checks: the blend's width (zero for one wave).
  effect:a=>blendSk(a),
  measure:[()=>BLEND.sound?'Pitches mixed in':'Spread of speeds',()=>BLEND.sound?String(BLEND.count):BLEND.sk===null?String(BLEND.count)+' waves':BLEND.sk<=.01?'none: one exact speed':(BLEND.sk/.25).toFixed(1)+'×'],scale:'',demoEnd:()=>1.4,
  disclosure:'Exact sums of waves. The particle is free and in one dimension, drawn at one instant in units where ħ = 1; speed is shown as wave length, since a particle’s momentum is set by its wave length. Real beeps and clicks are messier mixtures, but the trade-off is the same: a burst short in time is a wide blend of pitches. The blend is a bell curve, the shape that makes the trade-off as small as it can be.',
  try:'Slide “Blend of speeds” down to one wave: it spreads everywhere, with one exact speed. Widen the blend and the burst gets narrower.',aria:'Waves of slightly different lengths, each in its own row, are added together. Two make a pattern that swells and fades; many make one short burst. For a particle, a narrower burst needs a wider blend of speeds.'},
 'quantum-well':{draw:drawWell,demo:false,tryAny:true,a:['Energy','slide it to try other energies'],b:['Trap width','a wider trap holds more allowed energies',''],
  fa:a=>{const lv=Physics.trapLevels(TRAP.L||2), n=lv.findIndex(e=>Math.abs(e-trapE(a))<.35);return n<0?'in between':`allowed energy ${n+1}`;},fb:b=>Physics.trapLevels(trapL(b)).length+' allowed',
  // The modelled effect for the render checks: how far the chosen energy sits above the trap's floor.
  effect:a=>trapE(a)+Physics.trapDepth,
  measure:[()=>({live:'This energy',atom:'Colours given off',all:'Allowed energies',sweep:'Allowed energies found'})[TRAP.mode]||'',()=>TRAP.mode==='live'?(TRAP.fits?'allowed':'not allowed'):TRAP.mode==='atom'?String(TRAP.colours):TRAP.mode==='inside'||TRAP.mode==='walls'||TRAP.mode==='corner'?'':String(TRAP.found)],scale:'',demoEnd:()=>2,
  disclosure:'Exact one-dimensional quantum model of a particle in a square pit, in units where ħ = 1 and 2m = 1. Each wave is drawn at one instant: an allowed wave keeps its shape over time, and a wave that grows without end is not a possible state at all. The energy control clicks onto an allowed energy when it comes close. A real atom traps its electrons with a pull of a different shape, and the colours are illustrative.',
  try:'Slide “Energy” until the wave fades into both walls; it does so only at the marked energies. Then widen the trap: more energies fit, and they sit lower.',aria:'A particle’s wave in a pit. At most energies the wave grows without end in one wall, which is impossible; only at a few energies does it fade into both walls. Those are the allowed energies, and drops between them give off light of certain colours.'},
 'falling-time':{draw:drawFall,a:['Gravity','how strong gravity is'],b:['Time in the air','between leaving and meeting again',''],
  fa:a=>a<.005?'none':Math.round(a*100)+'%',fb:b=>(2+2*(b-1)).toFixed(1)+' units',
  measure:['Thrown clock gains',(a,b)=>(Physics.fallGain(a,b)*100).toFixed(1)+'%'],scale:'',disclosure:'Time effects are enormously exaggerated so they can be seen; the shape of the result is exact for weak gravity.',demoEnd:()=>2.5,
  try:'Turn gravity off: which path keeps the most time? Turn it on and give the ball longer in the air.',aria:'Clocks held at the ground and thrown upward; the path a thrown ball takes is the one that keeps the most time.'},
 'diffraction':{draw:drawGap,a:['Gap','narrower to the right; 0 removes the barrier'],b:['Wavelength','length of one wave',''],
  fa:a=>a<.005?'no barrier':Physics.gap(a,1).width.toFixed(1)+' units',fb:b=>Physics.gap(1,b).lambda.toFixed(2)+' units',
  measure:['Spreads by',(a,b)=>Physics.spreadAngle(a,b).toFixed(0)+'°'],scale:'Seen from above',disclosure:'Sizes are illustrative; the spreading angle is the exact single-gap value.',demoEnd:()=>2.5,
  try:'Remove the barrier: does the wave spread? Narrow the gap, then lengthen the waves.',aria:'A wave passes through a gap and spreads out, with bright and dark bands on a screen.'},
 'twin-trip':{draw:drawTwinTrip,a:['Speed','how fast the rocket flies'],b:['Trip','time out before turning back',''],
  fa:a=>Math.round(Physics.speed(a)*100)+'% of light',fb:b=>Physics.turnaround(b).toFixed(1)+' years out',
  measure:['Traveller comes home younger by',a=>(Physics.agingGap(a)*100).toFixed(1)+'%'],scale:'',demoEnd:()=>2.5,
  disclosure:'Ages and speeds are exact special relativity; the rocket turns around instantly.',
  try:'Set Speed to zero: do the twins still agree? Speed up, then make the trip longer and compare the two bars.',aria:'Twins: one stays on Earth while the other flies to a star and back. Two bars show how much each twin has aged.'},
 'light-clock':{draw:(ctx,w,h,spec,st)=>drawLightClocks(ctx,w,h,spec,st,{vplan:Physics.speed(st.stage===timeline?.chapters?.length-1?1:spec.mass)}),
  demo:(p,spec)=>({mass:spec.mass+(1-spec.mass)*smooth(p/.12),distance:spec.distance}),a:['Speed','how fast the rocket flies'],b:['Unused','',''],
  fa:a=>Math.round(Physics.speed(a)*100)+'% of light',fb:b=>'',
  measure:['Rocket clock ticks slower by',a=>(Physics.agingGap(a)*100).toFixed(0)+'%'],scale:'Seen from Earth',demoEnd:s=>s.distance,
  disclosure:'Exact special relativity: light moves at the same speed for every observer. The clocks are slowed down for viewing; the rocket clock ticks normally for its crew.',
  try:'Slide the speed down to zero: the clocks agree. Push it toward light speed: the slanted path grows and the rocket clock nearly stops.',aria:'Two light clocks: one on Earth with light going straight up and down, one on a moving rocket whose light must slant to hit the moving mirrors, so it ticks less often.'},
 'spacetime-paths':{draw:drawPaths,drag:dragPaths,demo:false,a:['Speed','how fast the traveller flies'],b:['Trip','time out before turning back',''],
  fa:a=>Math.round(Physics.speed(a)*100)+'% of light',fb:b=>Physics.turnaround(b).toFixed(1)+' years out',
  measure:['Traveller’s clock counts less by',a=>(Physics.agingGap(a)*100).toFixed(1)+'%'],scale:'',demoEnd:()=>2.5,
  disclosure:'Exact special relativity in years and light-years; the turnaround is instant. The light clocks are slowed down for viewing. Distances on the page are not spacetime lengths: tilted paths look longer than they hold.',
  try:'Drag the turnaround sideways: a faster trip leaves less time on the traveller’s clock. Drag it back to the home path: the twins agree again.',aria:'A spacetime diagram: the home twin’s straight path and the traveller’s bent path between the same goodbye and reunion, with one dot per year of each twin’s own time.'},
 'river':{draw:drawRiver,demo:false,tryAny:true,a:['Black hole mass','sets the size of the horizon'],b:['Light starts at','how far from the centre the light is sent',''],
  fa:a=>a<.005?'none':Math.round(clamp(a)*100)+'%',fb:b=>{const re=.6+(b-1);return re.toFixed(2)+' units out';},
  // The modelled effect for the render checks: how fast space flows in where the light starts, in light speeds.
  effect:(a,b)=>Physics.riverInflow(clamp(a),.6+(b-1)),
  measure:['Where the light starts, space flows in at',(a,b)=>RIVER.live?Math.round(Physics.riverInflow(clamp(a),.6+(b-1))*100)+'% of light speed':''],scale:'',demoEnd:()=>1,
  disclosure:'A picture with exact numbers: for a non-rotating black hole, Einstein’s equations can be written as if space flowed inward at the speed a dropped object reaches (the river, or Painlevé–Gullstrand, picture), and light always moves at light speed through the space around it. Space is not a substance and nothing is really carried; the flowing dots only show the inflow speed. Distances are measured in units of the horizon at full mass, and motion is slowed down. The fish and the waterfall are an analogy that follows the same rule; a real river’s current depends on its shape.',
  try:'Move “Light starts at” inside the horizon: can the light get out? Then make the black hole smaller and try again.',aria:'A fish swims upstream in a river that speeds up toward a waterfall: far away it gets away, at one point it holds still, and past it it is swept over. Then space flows into a black hole the same way, and light, always moving at light speed through it, escapes from outside the horizon, stands still on it and is carried in from inside.'},
 'fall-views':{draw:drawViews,demo:false,tryAny:true,measure:null,a:['Gravity','how strong gravity is'],b:['Time in the air','between the toss and the catch',''],
  fa:a=>a<.005?'none':Math.round(a*100)+'% of Earth’s',fb:b=>Physics.views(1,b).T.toFixed(1)+' units',scale:'',demoEnd:()=>1.6,
  // The modelled effect for the render checks: how fast, seen from the ball, the ground speeds up (the push on you).
  effect:(a,b)=>Physics.views(clamp(a),b).g,
  disclosure:'Air resistance is ignored, and heights and times are in made-up units. The view from the ball is exact for a short toss. The first chapter, with no gravity, uses its own height scale so the whole path fits.',
  try:'Turn gravity down to none: from the ball, the ground drifts away in a straight line, and nothing pushes you. Turn it up: the ground curves back to the ball, pushed harder.',aria:'A ball tossed up and caught, drawn on a map of height and time, first as seen from the ground and then as seen from the ball, where the ball stays still and the ground moves.'},
 'tides':{draw:drawTides,demo:false,tryAny:true,measure:null,a:['Earth’s mass','how strongly it pulls'],b:['Unused','',''],
  fa:a=>a<.005?'none':Math.round(a*100)+'% of real',fb:b=>'',scale:'',demoEnd:()=>1,
  // The modelled effect for the render checks: how much the small falling ring has stretched by the end of its fall.
  effect:a=>Physics.tideStretch(clamp(a)),
  disclosure:'The ball is an analogy: a curved surface in space. Curved spacetime also makes straight paths come together or spread apart, but it involves time and cannot be drawn exactly. The balls follow Newton’s law of gravity exactly, which is accurate for weak gravity like the Earth’s. In three dimensions, a small falling ring stretches one way and squeezes in the other two, so at first the space it encloses stays the same.',
  try:'Set Earth’s mass to none: the small ring stays round. Give the Earth back its mass and the ring stretches again.',aria:'Two walkers heading north on a globe come together; a ring of falling balls around the Earth shrinks; a small falling ring stretches into an egg shape.'},
 'lift':{draw:drawLift,demo:false,tryAny:true,measure:null,a:['Lift speeds up','falling freely at the left, steady in the middle'],b:['Unused','',''],
  fa:liftSpeedUp,fb:b=>'',scale:'',demoEnd:()=>1.25,
  // The modelled effect for the render checks: the scale's reading, in units of your weight.
  effect:a=>Physics.lift().reading(liftAccel(a)),
  disclosure:'Newtonian physics, exact for a lift on Earth: a scale reads the floor’s push, which is your weight times (g + a)/g, where g is gravity’s pull and a is how fast the lift speeds up upward. The ride’s speeds and the 70 kg person are made up for the example; air resistance is ignored, and real lifts have safety brakes. The dial’s needle eases to each reading like a real scale’s, and the fall is shown in slow motion.',
  try:'Slide to the left end: the lift falls freely and the scale reads 0 kg. Slide right of the middle: the lift speeds up upward and you weigh more.',aria:'A person stands on a bathroom scale in a lift. The dial reads their weight when parked, more or less while the lift speeds up or slows down, and zero when the cable snaps.'},
 'moon-tides':{draw:drawMoonTides,demo:false,tryAny:true,measure:null,a:['Moon’s mass','how heavy the Moon is'],b:['Unused','',''],
  fa:a=>a<.005?'no Moon':Math.round(clamp(a)*100)+'% of real',fb:b=>'',scale:'',demoEnd:()=>1.25,
  // The modelled effect for the render checks: how much harder the Moon pulls the near side than the Earth's centre.
  effect:a=>Physics.moonTides(60.3,clamp(a)).tide(1,0)[0],
  disclosure:'The arrows come from Newton’s law of gravity at the real distance between the Earth and the Moon. Real tides are also shaped by coastlines and the depth of the oceans, and the Sun raises tides about half as big as the Moon’s.',
  try:'Slide the Moon’s mass down to none: its two bulges flatten away. Half the mass gives half the stretch.',aria:'The Earth with its oceans and the Moon. The Moon pulls the near side most and the far side least, so the oceans bulge toward and away from the Moon, and a place on the coast passes two high tides a day.'},
 'speed-limit':{draw:drawLimit,demo:false,tryAny:true,a:['Pushes','how many times the rocket fires the same push'],b:['Unused','',''],
  fa:a=>{const n=Math.round(clamp(a)*10);return `${n} push${n===1?'':'es'}`;},fb:b=>'',
  // The modelled effect for the render checks: the speed seen from the ground after the chosen number of pushes.
  effect:a=>Physics.limitSpeed(Math.round(clamp(a)*10)),
  measure:['Speed seen from the ground',a=>LIMIT.mode==='live'?limitPct(Physics.limitSpeed(Math.round(clamp(a)*10)))+' of light':''],scale:'',
  disclosure:'Exact special relativity for equal pushes: each push leaves the rocket moving at half light speed relative to a marker it dropped just before, so the speed seen from the ground after n pushes is tanh(0.549 n) times light speed. Motion on screen is slowed for viewing.',
  try:'Set “Pushes” to 10: the speed seen from the ground is 99.997% of light speed, never 100%.',
  aria:'A rocket fires the same push again and again. Seen from the ground, light from the moving rocket travels at the same speed as light from a lamp on the ground, and the crew see their own light pull away at full light speed after every push. So, seen from the ground, the rocket’s speed climbs to 50%, 80%, 93% of light speed, ever closer but never reaching it.'},
 'night-sky':{draw:drawNight,demo:false,tryAny:true,a:['Age of the universe','if the stars had shone, unchanged, that long'],b:['Unused','',''],
  fa:a=>nightAge(Physics.nightYears(clamp(a))),fb:b=>'',
  // The modelled effect for the render checks: the share of the sky covered by stars whose light has arrived.
  effect:a=>Physics.nightCover(Physics.nightYears(clamp(a))),
  measure:['Sky covered by stars',a=>NIGHT.mode==='live'?nightShare(Physics.nightCover(Physics.nightYears(clamp(a)))):''],scale:'',demoEnd:()=>1,
  disclosure:'Stars are treated as Sun-like and spread evenly: about 10²² of them in today’s observable universe, a rough count (estimates run from 10²² to 10²⁴). A sight line then travels about 2 × 10²⁴ light-years, on average, before it meets a star. Within the 13.8 billion light-years that light has crossed since the beginning, stars cover about 1 part in 180 trillion of the sky. The slider imagines an unchanging universe whose stars have shone for the chosen time. The picture is a slice through space: a ring twice as far holds twice as many stars, where a full shell holds four times as many. The expansion of the universe, which stretches and dims distant light further, is left out of the numbers.',
  try:'Set the age to 13.8 billion years: stars cover about 1 part in 180 trillion of the sky. How old would an unchanging universe have to be before the whole night sky lit up?',
  aria:'You stand on a hill under a dark, starry sky. If stars filled endless, unchanging space, every shell of stars around you would add the same light and every line of sight would end on a star, so the whole sky would blaze like the Sun. But the universe began about 13.8 billion years ago, so only light from a bubble around you has had time to arrive; light from farther stars is still on its way, and the night stays dark.'},
 'base-rate':{draw:drawRate,demo:false,tryAny:true,a:['How common','how many people have the disease'],b:['Unused','',''],
  fa:a=>{const p=Physics.ratePrevalence(a);return p<=0?'nobody':`1 in ${Math.round(1/p).toLocaleString('en-US')}`;},fb:b=>'',
  // The modelled effect for the render checks: the share of positive results that are right.
  effect:a=>Physics.rateTest(Physics.ratePrevalence(a)).share,
  measure:['Positives who are sick',a=>RATE.mode==='live'?(v=>v<.1?(v*100).toFixed(1)+'%':Math.round(v*100)+'%')(Physics.rateTest(Physics.ratePrevalence(a)).share):''],scale:'',demoEnd:()=>1,
  disclosure:'Assumes the people tested are picked at random, without symptoms, and that the test finds 99 in 100 sick people and clears 99 in 100 healthy ones; people tested because of symptoms start with higher odds. Dots are the average numbers in a group of 1,000, rounded to whole people; real tests differ.',
  try:'Move “How common” past 1 in 100: once the disease is more common than the test’s false alarms, most positive results are right.',
  aria:'A grid of 1,000 people, one of them sick. The test flags the sick person and about 10 healthy people, so of the 11 positive results only 1 is right. If the disease were as common as the test’s false alarms, 1 in 100, the right results would match the false alarms.'},
 'birthdays':{draw:drawBirthdays,demo:false,tryAny:true,a:['People','how many people are in the room'],b:['Unused','',''],
  fa:a=>{const n=Math.max(1,Math.round(1+59*clamp(a)));return `${n} ${n===1?'person':'people'}`;},fb:b=>'',
  // The modelled effect for the render checks: the chance of a shared birthday for the chosen number of people.
  effect:a=>Physics.birthdayShared(Math.max(1,Math.round(1+59*clamp(a)))),
  measure:['Chance two share a birthday',a=>BDAY.mode==='live'?(v=>v<.995?Math.round(v*100)+'%':(v*100).toFixed(1)+'%')(Physics.birthdayShared(Math.max(1,Math.round(1+59*clamp(a))))):''],scale:'',demoEnd:()=>1,
  disclosure:'Exact for 365 equally likely birthdays, ignoring 29 February and twins. Real birthdays are slightly uneven, which makes a match a little more likely.',
  try:'Set “People” to 40: there are 780 pairs, and a shared birthday is 89% likely.',
  aria:'People sit around a circle with a line between every pair. With 23 people there are 253 pairs, and the chance that two share a birthday passes one half; with 50 people it is 97%.'},
 'sky-colour':{draw:drawSky,demo:false,tryAny:true,a:['Sun height','how high the Sun is above the horizon'],b:['Unused','',''],
  fa:a=>a<.006?'on the horizon':`${Math.round(clamp(a)*90)}° up`,fb:b=>'',
  // The modelled effect for the render checks: the share of the Sun's blue light that reaches you directly.
  effect:a=>a<=0?0:Physics.skyThrough(450,clamp(a)*90),
  measure:['Sunlight’s blue that gets through',a=>SKY.mode==='live'?(v=>v<.01?(v*100).toFixed(2)+'%':Math.round(v*100)+'%')(a<=0?0:Physics.skyThrough(450,clamp(a)*90)):''],scale:'',demoEnd:()=>1,
  disclosure:'Scattering by the molecules of clean air at sea level; it grows as the inverse fourth power of the wavelength, with blue taken as 450 nm and red as 700 nm. Sunlight shakes the electrons across its path, so they send light out in all directions, most strongly forward and back. Dust and haze add to real sunsets.',
  try:'Lower the Sun to the horizon: almost none of its blue gets through, and the light that reaches you turns red.',
  aria:'On the Moon, with no air, the daytime sky is black. On Earth, sunlight shakes tiny charged specks in the air, which send light off in every direction, blue about six times as much as red. That bounced blue reaches you from all over the sky: it is the blue sky. At sunset the light crosses far more air and loses almost all its blue the same way, so what is left looks red and orange.'},
 'seasons':{draw:drawSeasons,demo:false,tryAny:true,a:['Tilt','how far Earth’s axis leans'],b:['Unused','',''],
  fa:a=>`${Math.round(clamp(a)*40)}°`,fb:b=>'',
  // The modelled effect for the render checks: how much more sunlight a June day gets than a December day, 40° north.
  effect:a=>Physics.seasonRatio(40,clamp(a)*40)-1,
  measure:['June’s sunlight, against December’s',a=>SEASON.mode==='live'?(v=>v<1.05?'the same':v.toFixed(1)+'×')(Physics.seasonRatio(40,clamp(a)*40)):''],scale:'',demoEnd:()=>1,
  disclosure:'Exact for a tilt of 23.4° and for 40° north. The day’s sunlight is counted at the top of the air, on level ground, and leaves out the changing distance, which trims June’s lead at 40° north from 3.3 to 3.1 times. The edge-on line shows which part of the circle is lit; real daylight there is about 15 hours in June and 9 in December. The orbit’s shape is to scale; Earth and the Sun are not.',
  try:'Set the tilt to 0°: June and December get the same sunlight, apart from the small change in distance.',
  aria:'Earth’s orbit is almost a circle, and Earth is closest to the Sun in January. Its axis tilts the same way all year, so in June the north leans toward the Sun: the noon Sun is high, its light lands on a smaller patch of ground and the days are long. In December the south leans in, and the seasons swap.'},
 'attention':{draw:drawAttention,demo:false,tryAny:true,a:['Attention','off: one word at a time · on: look straight back'],b:['Unused','',''],
  fa:a=>a<.02?'off':Math.round(a*100)+'%',fb:b=>'',
  measure:['Chance of “French”',a=>ATTN.mode==='live'?Math.round(Physics.lookGuess(ATTN.strength)[0][1]*100)+'%':''],
  // The modelled effect for the render checks: how much likelier "French" gets with attention on.
  effect:a=>Physics.lookGuess(a)[0][1]-Physics.lookGuess(0)[0][1],scale:'',demoEnd:()=>1,
  disclosure:'The shares are exact attention, the softmax of scaled dot products from “Attention Is All You Need” (2017), but on one hand-made sentence with four numbers per word; real models learn theirs, split words into pieces and run many attention heads in each of dozens of layers. The guesses come from a toy rule, not a real model. The older one-at-a-time models (recurrent networks) kept more than this fading memory suggests, but long text was hard for them and they could not be trained on all words at once. Attention itself is older than 2017; the paper’s step was to build the whole model from it. The first GPT appeared in 2018.',
  try:'Turn “Attention” down: the lines thin out and the guess grows unsure. Turn it back up.',aria:'A chatbot guesses the next word of “I grew up in France, so I speak fluent”. A fading memory loses the clue “France”; attention draws lines straight back to every earlier word, thickest to “France”, and the guess “French” becomes clear. Every word looks back at once, and the step stacked in layers is the Transformer.'}
};
const engineOf=spec=>ENGINES[spec?.kind]||ENGINES['light-bending'];

function draw(ctx,w,h,spec,state){engineOf(spec).draw(ctx,w,h,spec,state);}
window.CouncilDraw={draw,accent:spec=>ACCENT[spec.accent]||ACCENT.mint,disclosure:spec=>engineOf(spec).disclosure||''};
window.CouncilLab={draw:drawLab,hit:labHit,view:()=>labXf};

const $=id=>document.getElementById(id);
const canvas=$('universe');
if(!canvas)return;
const ctx=canvas.getContext('2d');
let spec=null, time=0, mass=.7, distance=1.25, stage=2, mode='live', last=0, shown=0, started=false, ended=false, captionKey='';
const listeners=new Set(), emit=type=>listeners.forEach(fn=>fn(type));
// Subtitle pacing: comfortable reading speed, a minimum time on screen, and a pause between sentences.
const READING={cps:14,minimum:2.8,pause:.9,lead:.8,tail:.8};
let timeline=null;
function buildTimeline(){
 let t=0;
 const chapters=spec.beats.map(beat=>{
  const start=t;t+=READING.lead;
  const lines=sentences(beat.body).map(text=>{const shown=Math.max(READING.minimum,text.length/READING.cps),line={text,start:t,end:t+shown};t+=shown+READING.pause;return line;});
  t+=READING.tail;return {start,end:t,lines};
 });
 // A scene may ask for a longer duration than reading needs; stretch evenly, never compress.
 const stretch=Math.max(1,spec.duration/t);
 for(const c of chapters){c.start*=stretch;c.end*=stretch;for(const l of c.lines){l.start*=stretch;l.end*=stretch;}}
 timeline={chapters,total:t*stretch};
}
const chapterAt=t=>{const i=timeline.chapters.findIndex(c=>t<c.end);return i<0?timeline.chapters.length-1:i;};
const target=()=>stage===0?0:mass;
const fmt=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;

// Sound: only plucked strings make a sound, at the moments an engine plucks one (playback crossing a pluck, or the
// viewer moving a control). Nothing sounds before the viewer presses play.
const SOUND={ctx:null,out:null,buffers:new Map(),queue:[],on:(()=>{try{return localStorage.getItem('council-sound')!=='off';}catch{return true;}})()};
function audioStart(){
 if(SOUND.ctx||!engineOf(spec).plucks)return SOUND.ctx?.resume?.();
 const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
 const a=SOUND.ctx=new AC(), out=SOUND.out=a.createGain(), warm=a.createBiquadFilter();
 a.resume?.();out.gain.value=.5;warm.type='lowpass';warm.frequency.value=3200;out.connect(warm);warm.connect(a.destination);
}
// A plucked string (Karplus-Strong): a short burst of softened noise circulating in a delay line one period long,
// averaged on each pass so it mellows and fades like a real string.
function stringBuffer(freq){
 const key=Math.round(freq);if(SOUND.buffers.has(key))return SOUND.buffers.get(key);
 const a=SOUND.ctx, rate=a.sampleRate, n=Math.floor(rate*2.6), y=new Float32Array(n), N=Math.max(2,Math.floor(rate/freq)), decay=.996;
 let prev=0;for(let i=0;i<N;i++){prev=.5*prev+.5*(hash(i*1.37+freq)*2-1);y[i]=prev;}
 for(let i=N;i<n;i++)y[i]=decay*.5*(y[i-N]+y[Math.max(0,i-N-1)]);
 let peak=0;for(const v of y)peak=Math.max(peak,Math.abs(v));const fade=Math.floor(rate*.08);
 for(let i=0;i<n;i++)y[i]=y[i]/(peak||1)*(i>n-fade?(n-i)/fade:1);
 const buffer=a.createBuffer(1,n,rate);buffer.copyToChannel(y,0);SOUND.buffers.set(key,buffer);return buffer;
}
function soundPluck(freq){SOUND.queue.push(freq);}
function voice(){
 if(!SOUND.ctx||!SOUND.on){SOUND.queue.length=0;return;}
 while(SOUND.queue.length){const src=SOUND.ctx.createBufferSource();src.buffer=stringBuffer(SOUND.queue.shift());src.connect(SOUND.out);src.start();}
}
// A hidden tab freezes the picture, so its sound pauses too.
document.addEventListener('visibilitychange',()=>{if(!SOUND.ctx)return;if(document.hidden)SOUND.ctx.suspend?.();else SOUND.ctx.resume?.();});
function paint(){
 if(!spec)return;
 const box=canvas.getBoundingClientRect(), w=box.width, h=box.height, dpr=window.devicePixelRatio||1;
 if(!w||!h)return;
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
 // Reset drawing state as well as pixels so seeking never inherits a prior frame.
 if(ctx.reset)ctx.reset();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const since=started&&timeline?Math.max(0,time-timeline.chapters[stage].start):time;
 const live=started&&mode==='live';
 LABELS=[];
 draw(ctx,w,h,spec,{t:time,since,stage,mass:shown,distance,labels:spec.show_labels,live,playing:mode==='playing'});
 lastLabels=LABELS;LABELS=null;
 voice();
 const value=target();
 // An engine may leave its readout empty for a moment, hiding the pill (the rope during its single shake).
 const m=engineOf(spec).measure;
 if(m){const v=m[1](value,distance);$('bend-value').textContent=v;$('bend-value').closest('.stage-note').hidden=v==='';if(typeof m[0]==='function')$('measure-label').textContent=m[0]();}
 captions();transport();
}
// A sentence ends at . ! or ? followed by a space or the end, so decimals such as 4.8 stay whole.
function sentences(body){return body.match(/(?:[^.!?]|[.!?](?=[^\s.!?"”’)]))+[.!?]*["”’)]*(?:\s+|$)/g)?.map(s=>s.trim()).filter(Boolean)||[body];}
function captions(){
 let chapter, line, reveal=1, hint='';
 if(!started&&spec.opening){chapter=`Before you watch · ${fmt(timeline.total)}`;line=spec.opening;hint='Press play to find out.';}
 else if(!started){chapter=`${spec.beats.length} chapters · ${fmt(timeline.total)}`;line='Press play to watch the explanation.';}
 else if(ended&&mode!=='playing'){const c=spec.controls||'both', e=engineOf(spec);chapter='The idea';line=spec.takeaway||'';
  hint=spec.next||(c==='none'?'':c==='both'||e.tryAny?'Now try it: '+e.try:`Now try it: move ${(c==='first'?e.a:e.b)[0]} and watch “${e.measure[0]}”.`);}
 else{
  const beat=spec.beats[stage];chapter='';line=beat.body;
  {
   // Show the latest sentence that has started; it stays up through the pause that follows.
   const lines=timeline.chapters[stage].lines;line=(lines.filter(l=>l.start<=time).at(-1)||lines[0]).text;
  }
 }
 $('beat-title').textContent=chapter;
 $('try-hint').textContent=hint;
 const body=$('beat-body'), key=stage+'|'+chapter+'|'+line;
 if(key!==captionKey){captionKey=key;body.textContent=line;body.classList.remove('enter');if(mode==='playing'){void body.offsetWidth;body.classList.add('enter');}}
}
function transport(){
 const progress=started?clamp(time/timeline.total):0, scrub=$('scrub');
 scrub.style.setProperty('--p',progress);scrub.setAttribute('aria-valuenow',String(Math.round(progress*100)));
 document.querySelectorAll('#ticks [data-beat]').forEach((tick,i)=>tick.classList.toggle('passed',started&&time>=timeline.chapters[i].start));
 $('clock-time').textContent=`${fmt(started?Math.min(time,timeline.total):0)} / ${fmt(timeline.total)}`;
 const play=$('play'), playing=mode==='playing';
 play.classList.toggle('is-playing',playing);play.setAttribute('aria-label',playing?'Pause':ended?'Replay':'Play');
 $('poster').hidden=started;
 document.querySelector('.workspace')?.classList.toggle('is-playing',playing);
 document.querySelector('.workspace')?.classList.toggle('started',started);
 document.querySelector('.workspace')?.classList.toggle('ended',ended&&!playing);
 document.body.classList.toggle('idea-shown',ended&&!playing);
 // The sliders show once playback has ended, or when the viewer opens them; never while it plays.
 const exploring=!playing&&(exploreOpen??ended);
 document.querySelector('.workspace')?.classList.toggle('exploring',exploring);
 $('explore').setAttribute('aria-pressed',String(exploring));
}
// null: sliders follow playback (shown at the end); true or false: the viewer opened or closed them.
let exploreOpen=null;
function syncControls(){
 const control=$('mass');control.disabled=stage===0;control.value=stage===0?0:mass;
 $('distance').value=distance;
 const shownA=stage===0?0:mass;
 $('mass-value').textContent=engineOf(spec).fa(shownA);$('mass-value').dataset.value=String(shownA);
 $('distance-value').textContent=engineOf(spec).fb(distance);
}
function setStage(n){stage=n;syncControls();}
function configure(){
 soundButton();
 const e=engineOf(spec), controls=spec.controls||'both';
 const ws=document.querySelector('.workspace');
 ws?.setAttribute('data-controls',controls);
 $('mass').closest('.control').hidden=!['both','first'].includes(controls);
 $('distance').closest('.control').hidden=!['both','second'].includes(controls);
 document.documentElement.style.setProperty('--accent',CouncilDraw.accent(spec));
 document.querySelector('.workspace')?.setAttribute('data-kind',spec.kind||'light-bending');
 $('mass-label').textContent=e.a[0];$('mass-hint').textContent=e.a[1];
 $('distance-label').textContent=e.b[0];$('distance-hint').textContent=e.b[1];
 // Engines without a readout hide the readout pill.
 $('measure-label').closest('.stage-note').hidden=!e.measure;$('measure-label').textContent=typeof e.measure?.[0]==='function'?e.measure[0]():e.measure?.[0]||'';$('scale-label').textContent=e.scale;
 canvas.setAttribute('aria-label',e.aria);
}
function load(scene){
 exploreOpen=null;SOUND.queue.length=0;
 // Before playback the stage shows the opening frame of chapter 1.
 spec=scene;buildTimeline();
 $('ticks').replaceChildren(...timeline.chapters.slice(1).map((c,i)=>{const tick=document.createElement('button');tick.type='button';tick.dataset.beat=String(i+1);tick.style.left=`calc(12px + (100% - 24px) * ${c.start/timeline.total})`;tick.title=`Chapter ${i+2}: ${spec.beats[i+1].title}`;tick.setAttribute('aria-label',tick.title);tick.onclick=e=>{e.stopPropagation();chapter(i+1);};return tick;}));mass=scene.mass;distance=scene.distance;time=0;mode='live';started=false;ended=false;captionKey='';
 configure();setStage(0);shown=target();paint();
}
function restore(){mass=spec.mass;distance=spec.distance;demoed=false;}
function play(){
 if(!spec)return;
 if(!started||ended||time>=timeline.total){time=0;restore();setStage(0);shown=0;}
 audioStart();started=true;ended=false;mode='playing';exploreOpen=null;last=0;emit('play');paint();
}
function pause(){if(mode==='playing'){mode='paused';paint();}}
function toggle(){mode==='playing'?pause():play();}
// Seeking shows exactly what playback shows at that moment, including the last chapter's control demo.
let demoed=false;
function seek(t,beat=2){
 mode='paused';started=true;ended=false;time=t;
 const last=timeline.chapters.length-1, c=timeline.chapters[last];
 if(beat===last&&engineOf(spec).demo!==false)demo(clamp((t-c.start)/(c.end-c.start)));else if(demoed)restore();
 setStage(beat);shown=target();paint();
}
function chapter(n){
 if(!spec)return;n=clamp(n,0,spec.beats.length-1);
 const wasPlaying=mode==='playing';
 restore();started=true;ended=false;time=timeline.chapters[n].start+.001;setStage(n);shown=target();
 mode=wasPlaying?'playing':'paused';last=0;paint();
}
function demo(p){
 // The last chapter moves the controls themselves so the viewer sees what each one does.
 demoed=true;
 // An engine may script its own demo, returning both control values for progress p.
 const own=engineOf(spec).demo;if(typeof own==='function'){({mass,distance}=own(p,spec));syncControls();return;}
 // Otherwise: in the first half the first control dips and returns; in the second half the second control
 // moves to its end value. Both move whichever sliders the viewer is given, because narrations describe both.
 const end=engineOf(spec).demoEnd(spec);
 mass=p<.5?spec.mass*(1-.55*Math.sin(Math.PI*p/.5)):spec.mass;
 distance=spec.distance+(end-spec.distance)*smooth((p-.5)/.42);
 syncControls();
}
function tick(stamp){
 const dt=last?Math.min((stamp-last)/1000,.1):0;last=stamp;
 // Nothing moves until the viewer presses play or touches a control.
 if(spec&&started&&mode!=='paused'){
  time+=dt;
  if(mode==='playing'){
   const next=chapterAt(time), last=timeline.chapters.length-1, c=timeline.chapters[last];
   if(next!==stage)setStage(next);
   if(stage===last&&engineOf(spec).demo!==false)demo(clamp((time-c.start)/(c.end-c.start)));
   if(time>=timeline.total){time=timeline.total;mode='live';ended=true;emit('ended');}
  }
  shown+=(target()-shown)*(1-Math.exp(-dt*(mode==='playing'?1.6:7)));
  paint();
 }
 requestAnimationFrame(tick);
}
// Taking control jumps to the last chapter; its scene clock starts there so trips and arrivals play out.
function explore(){if(!started){started=true;ended=true;}mode='live';const last=timeline.chapters.length-1;if(time<timeline.chapters[last].start)time=timeline.chapters[last].start;setStage(last);}
function input(id,value){
 // Touching a control before playing means exploring; during playback it hands control to the viewer.
 if(id==='mass')mass=value;else distance=value;
 audioStart();
 explore();paint();
}

window.CouncilScene={load,seek,play,pause,toggle,chapter,render:t=>{time=t;paint();},labels:()=>lastLabels.slice(),
 getState:()=>({time,mass,distance,stage,mode,ended}),
 sound:()=>({on:SOUND.on,state:SOUND.ctx?.state||null,plucked:GUITAR.plucked.slice(),rope:{rate:ROPE.rate,size:+ROPE.size.toFixed(2)}}),
 timeline:()=>timeline&&JSON.parse(JSON.stringify(timeline)),on:fn=>listeners.add(fn),
 checks:()=>Physics.checksFor(spec?.kind)};
// The size of the modelled effect at the current controls, for render checks: the readout's number unless the engine
// measures it itself (attention's readout is a share, which is not zero when focus is off).
window.CouncilScene.effect=()=>{const e=engineOf(spec);return e.effect?e.effect(target(),distance):parseFloat($('bend-value').textContent);};
$('play').onclick=toggle;$('poster').onclick=play;
$('reset').onclick=()=>{started=false;play();};
$('sound').onclick=()=>{SOUND.on=!SOUND.on;try{localStorage.setItem('council-sound',SOUND.on?'on':'off');}catch{}audioStart();soundButton();paint();};
function soundButton(){const b=$('sound');b.hidden=!engineOf(spec)?.plucks;b.setAttribute('aria-pressed',String(SOUND.on));b.setAttribute('aria-label',SOUND.on?'Mute the sound':'Turn the sound on');}
$('explore').onclick=()=>{exploreOpen=!document.querySelector('.workspace').classList.contains('exploring');pause();paint();};
// Scrubbing: click or drag anywhere on the bar; playback continues if it was playing.
function scrubTo(clientX){
 const box=$('scrub').getBoundingClientRect(), t=clamp((clientX-box.left-12)/(box.width-24))*timeline.total, n=chapterAt(t);
 started=true;ended=false;restore();time=t;setStage(n);shown=target();if(mode!=='playing')mode='paused';last=0;paint();
}
$('scrub').addEventListener('pointerdown',e=>{if(!spec||e.target.closest('[data-beat]'))return;$('scrub').setPointerCapture(e.pointerId);scrubTo(e.clientX);});
$('scrub').addEventListener('pointermove',e=>{if(e.buttons&&$('scrub').hasPointerCapture(e.pointerId))scrubTo(e.clientX);});
$('scrub').addEventListener('keydown',e=>{if(!spec)return;const step=e.key==='ArrowRight'?5:e.key==='ArrowLeft'?-5:0;if(!step)return;e.preventDefault();const box=$('scrub').getBoundingClientRect();scrubTo(box.left+clamp((time+step)/timeline.total)*box.width);});
for(const id of ['mass','distance'])$(id).addEventListener('input',e=>input(id,Number(e.target.value)));
document.addEventListener('keydown',e=>{
 if(e.target.closest('input,textarea,select,button,a,summary')||e.metaKey||e.ctrlKey||e.altKey)return;
 if(e.key===' '){e.preventDefault();toggle();}
 else if(e.key==='ArrowRight'&&started){chapter(stage+1);}
 else if(e.key==='ArrowLeft'&&started){chapter(stage-1);}
});
// Engines with a handle let the viewer drag the scene itself; it moves the same values as the sliders.
let dragging=false;
const at=e=>{const b=canvas.getBoundingClientRect();return [e.clientX-b.left,e.clientY-b.top,b.width,b.height];};
const dragState=()=>({stage,mass:shown,distance,since:0,t:time});
canvas.addEventListener('pointerdown',e=>{const d=engineOf(spec)?.drag;if(!d||!started)return;const [x,y,w,h]=at(e);if(d(w,h,spec,dragState(),x,y,true)){dragging=true;canvas.setPointerCapture(e.pointerId);e.preventDefault();}});
canvas.addEventListener('pointermove',e=>{const d=engineOf(spec)?.drag;if(!d)return;const [x,y,w,h]=at(e);
 if(dragging){const v=d(w,h,spec,dragState(),x,y,false),c=spec.controls||'both';ended=true;if(c!=='second')mass=shown=Math.round(v.mass*100)/100;if(c!=='first')distance=Math.round(v.distance*100)/100;explore();paint();}
 else canvas.style.cursor=started&&d(w,h,spec,dragState(),x,y,true)?'grab':'';});
canvas.addEventListener('pointerup',()=>{dragging=false;});
new ResizeObserver(paint).observe(canvas);requestAnimationFrame(tick);
})();
