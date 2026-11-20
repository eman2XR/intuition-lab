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
   const [lx0,ly0]=points[0];if(lx0>70)text(ctx,'LIGHT',lx0-10,ly0,{align:'right',size:10,weight:600,spacing:'1.5px'});else text(ctx,'LIGHT',Math.max(6,lx0+6),ly0+16,{size:10,weight:600,spacing:'1.5px'});
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

// A soft shaded sphere lit from the upper left, with a faint shadow, for pictures drawn in a rounder 3D style.
function sphere(ctx,x,y,r,hex,a=1){
 ctx.save();ctx.globalAlpha=a;
 const shade=ctx.createRadialGradient(x,y+r*.9,0,x,y+r*.9,r*1.2);shade.addColorStop(0,'rgba(0,0,0,.18)');shade.addColorStop(1,'rgba(0,0,0,0)');
 ctx.fillStyle=shade;ctx.beginPath();ctx.ellipse(x,y+r*.95,r*1.05,r*.35,0,0,TAU);ctx.fill();
 const body=ctx.createRadialGradient(x-r*.35,y-r*.4,r*.08,x,y,r);body.addColorStop(0,'#ffffff');body.addColorStop(.18,rgba(hex,1));body.addColorStop(1,rgba(hex,1));
 ctx.fillStyle=body;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
 const rim=ctx.createRadialGradient(x,y,r*.6,x,y,r);rim.addColorStop(0,'rgba(0,0,0,0)');rim.addColorStop(1,'rgba(0,0,0,.28)');ctx.fillStyle=rim;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
 ctx.restore();
}
// Ink for lines and words: dark on a light stage, light on a dark one.
const inkOf=(st,a=1)=>st?.dark?`rgba(229,233,240,${a})`:`rgba(20,23,28,${a})`;
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
function slitPattern(A,geo,bins,known=false){
 const key=[A.toFixed(3),geo.L.toFixed(1),geo.d.toFixed(2),geo.lam.toFixed(3),geo.span.toFixed(1),bins,known].join('|');
 if(patternCache.key===key)return patternCache;
 const p=[];let total=0;
 // The waves from the two drawn slits meet each point of the screen out of step by their path difference over the
 // drawn wavelength, so the stripes fall exactly where the drawn ripples meet top on top.
 for(let i=0;i<bins;i++){const y=(i+.5)/bins*2-1, Y=y*geo.span, env=Math.pow(Math.cos(y*Math.PI/2.15),2);
  const dl=Math.hypot(geo.L,Y-geo.d/2)-Math.hypot(geo.L,Y+geo.d/2), I=env*(known?Physics.knownPath:Physics.intensity)(A,TAU*dl/geo.lam);p.push(I);total+=I;}
 const cdf=[];let run=0;for(const v of p){run+=v/total;cdf.push(run);}
 patternCache={key,p:p.map(v=>v/Math.max(...p)),cdf};return patternCache;
}
// The double-slit experiment in perspective, like a lab bench seen from the side and a little above: a laser fires
// particles one at a time at an upright barrier with two tall slits (a mustard shutter covers the second), and each
// lands as one glowing dot on a dark screen beyond. Arrivals are deterministic samples of the predicted pattern.
// Chapter plan: one slit, a few dots; one slit, thousands (one soft patch); both slits, a few dots; both slits,
// thousands (stripes, with the dots one slit sent into the gaps shown faintly); the waves through both slits, drawn
// as ripples on the level plane through the slits' middle; the screen cleared and one slit covered again; then a
// sensor at one slit that clicks when a particle passes it, and the stripes give way to one soft patch; then why: the
// sensed slit's ripples are marked by the record, so the two no longer blend. A particle's path is drawn
// only where the setup makes it known.
const PARTICLES={A:null,from:-1e9,geo:null};
const PARTICLES_TOUCH={hint:'tap the second slit to cover or uncover it.',
 grab(w,h,spec,st,x,y){const g=PARTICLES.geo;return g&&Math.abs(x-g.wallX)<g.slab/2+16&&Math.abs(y-g.y2)<g.slit+16?{cursor:'pointer'}:null;},
 release(w,h,spec,st,x,y,hd,moved){return moved?null:{mass:st.target>.5?0:1};}};
// The double-slit bench as plain state in bench coordinates: x along the beam (laser at 0, barrier at XB, screen at
// XS), y across (the slits sit side by side), z up; panels are 2 across and 2 high. drawParticles projects it, and
// other renderers (the visionOS app runs this file in JavaScriptCore) read it through CouncilBench. `small` is the
// phone layout, which draws a slightly shorter wavelength.
function particlesBench(spec,st,small=false){
 const preview=st.since===undefined, live=!!st.live, CLEAR=5, SENSE=6, WHY=7;
 const stage=preview?3:live?WHY:Math.min(st.stage,WHY), since=preview?99:Math.max(0,st.since), ch=st.chapters?.[stage];
 const at=i=>ch?.lines?.[i]?ch.lines[i].start-ch.start:1+4*i, dur=ch?Math.max(1,ch.end-ch.start):20, pT=since/dur;
 // In chapter 3 the cover slides off the second slit with its first sentence; in chapter 6 the screen is cleared,
 // then the second slit is covered, then the dots land again.
 const A=stage<=1?0:stage===2&&!preview?smooth((since-.4)/1.2):stage===CLEAR?1-smooth((pT-.07)/.08):1;
 const known=stage>=SENSE, sep=Physics.separation(spec.distance);
 const XB=1.3, L=1.5, XS=XB+L, yc=.25*sep, sw=.04, zs=.34, lam=(small?.25:.3)*2*yc/L, geo={L,d:2*yc,span:1,lam};
 const bins=60, pat=slitPattern(A,geo,bins,known);
 // Particles that pass the sensor's slit (chapters 7 and 8): about half, as for two equal slits.
 const clicked=i=>stage>=SENSE&&hash(i+11.7)<.5;
 const spot=(i,p)=>{const u=hash(i+1);let lo=0,hi=bins-1;while(lo<hi){const m=(lo+hi)>>1;if(p.cdf[m]<u)lo=m+1;else hi=m;}
  return [lo,-1+(lo+hash(i+7.3))/bins*2,(hash(i+3.1)*2-1)*.62];};
 // How many have landed so far in this chapter; chapters 2 and 4 carry on from the dots already there.
 const t1=at(1), t2=at(2);
 const n=preview||live?2400:Math.floor(stage===0?Math.min(14,Math.max(0,since-1)/1.1):stage===1?14+2386*smooth((since-.3)/8):
  stage===2?Math.min(18,Math.max(0,since-1.9)/.45):stage===3?18+2382*smooth((since-.2)/9):stage===4?2400:
  stage===CLEAR?(pT<.05?2400:pT<.16?0:2400*smooth((pT-.16)/.5)):stage===WHY?2400:since<t1?0:since<t2?Math.min(12,1+(since-t1)/.75):12+2388*smooth((since-t2)/4));
 const slow=stage===0||stage===2||stage===SENSE&&n<=12, rate=stage===0?1.1:stage===2?.45:.75;
 const fire=slow?(stage===SENSE?(since-t1)%rate:(since-1)%rate):9, flash=fire>=0&&fire<.25?1-fire/.25:0;
 // The photon in flight during the one-at-a-time stretches: it leaves the laser as the laser flashes and lands as the
 // next dot. Its path is drawn only where it is known: through the open slit when one is covered, and through the
 // sensor's slit or the other when the sensor is there.
 const fly=slow&&(stage===0?n<14&&since>=1:stage===2?n<18&&since>=1.9:n<12&&since>=t1)?{i:n,u:clamp(fire/rate)}:null;
 // Waves (chapters 5, 6 and 8), one drawn wavelength apart on the level plane through the slits' middle: the laser's
 // light arrives with flat fronts, and each open slit sends out ripples to the screen. Where tops from the two slits
 // meet at the screen, the stripes are bright. In chapter 6 they hold still and dim; in chapter 8 the ripples from
 // the slit with the sensor are violet, marked by its record, so they no longer match the other slit's.
 const waves=stage===4||stage===CLEAR||stage===WHY, still=stage===CLEAR, ph=still?0:(since*.8)%1, dimW=still?.55:1;
 const fronts=[], arcs=[];
 if(waves){const nS=Math.ceil(XB/lam);for(let r=0;r<nS;r++){const x=(r+ph)*lam+.06;if(x<=XB-.02)fronts.push(x);}
  const nW=Math.ceil(L/lam);
  for(const [y,on] of [[-yc,1],[yc,A]]){if(on<.01)continue;for(let r=0;r<nW;r++){const rad=(r+ph)*lam;if(rad<.03)continue;
   const marked=stage===WHY&&y<0;arcs.push({y,r:rad,alpha:(marked?.55:.4)*dimW*on*(1-.45*r/nW),marked});}}}
 // Where the photon in flight is: from the laser to the slit it takes, then from that slit to its dot. With both
 // slits open and no sensor it is not known which slit it takes, so it fades out as it nears the barrier and is next
 // seen as its dot. Each point carries the position a moment earlier, for a short fading trail.
 let leg=null;
 if(fly){const [,yl,zl]=spot(fly.i,pat), ys=stage===0?-yc:stage===SENSE?(clicked(fly.i)?-yc:yc):null, zb=clamp(zl*XB/XS,-zs*.85,zs*.85);
  const k=.45, go=(a,b,f)=>a.map((v,j)=>v+(b[j]-v)*clamp(f)), src=[0,0,0], slit=[XB,ys??0,zb], land=[XS,yl,zl];
  if(fly.u<k){const f=fly.u/k, to=ys===null?[XB*.9,0,zb*.9]:slit;leg={pos:go(src,to,f),prev:go(src,to,f-.18),a:ys===null?1-smooth((f-.45)/.5):1,c:'#ffb46b'};}
  else if(ys!==null){const f=(fly.u-k)/(1-k);leg={pos:go(slit,land,f),prev:f<.12?slit:go(slit,land,f-.12),a:1,c:clicked(fly.i)?'#c79cff':'#ffb46b'};}}
 // The sensor at the first slit (chapters 7 and 8) drops in from above in chapter 7; it glows each time a particle
 // passes that slit.
 const sensor=stage>=SENSE, up=sensor?(stage===SENSE?1-smooth((since-.3)/1):0)*1.6:0;
 const click=sensor&&fly&&clicked(fly.i)&&fly.u>=.45?Math.max(0,1-(fly.u-.45)/.5):0;
 // For comparison in chapter 4, the dots one slit alone sent into what are now the dark gaps.
 const compare=stage===3&&since>=at(2)-.2, dimD=compare?1-.55*smooth((since-at(2)+.2)/.8):1, fade=compare?smooth((since-at(2)+.2)/.8):0, rings=[];
 let gapY=null;
 if(compare){const one=slitPattern(0,geo,bins), two=slitPattern(1,geo,bins);
  for(let i=0;i<2400;i+=small?4:3){const [lo,y,z]=spot(i,one);if(two.p[lo]>.15*one.p[lo])continue;if(gapY===null&&y>.12)gapY=y;rings.push([y,z]);}
  slitPattern(A,geo,bins,known);}
 return {stage,since,A,known,XB,L,XS,yc,sw,zs,lam,n,slow,fly,flash,fronts,frontAlpha:.26*dimW,arcs,leg,sensor,up,click,compare,dimD,fade,rings,gapY,
  dot:i=>{const [,y,z]=spot(i,pat);return [y,z,clicked(i)];}};
}
// Labels for renderers that place their own text: the words the 2D picture shows, each at a point on the bench.
function particlesLabels(spec,st,b){
 if(!st.labels)return [];
 const out=[], add=(id,text,at,tone='ink')=>out.push({id,text,at,tone});
 if(b.stage===0)add('source',spec.source_label||'SOURCE',[-.11,0,.34]);
 add('screen','SCREEN',[b.XS-.06,0,1.16]);
 add('barrier',b.A<.5?'ONE SLIT OPEN':'TWO SLITS',[b.XB-.18,0,-1.18]);
 add('count',`${b.n.toLocaleString('en-US')} ${spec.count_noun||'particle'}${b.n===1?'':'s'}`,[b.XS-.12,0,-1.18],'accent');
 if(b.compare&&b.gapY!==null)add('compare','one slit',[b.XS-.05,b.gapY,.82],'pill');
 if(b.A<.5)add('covered','COVERED',[b.XB-.12,b.yc+b.sw+.2,b.zs*.4],'pill');
 if(b.sensor){add('sensor','SENSOR',[b.XB-.32,-b.yc,1.12+b.up],'violet');if(b.click>.15)add('click','click',[b.XB-.12,-b.yc-b.sw-.22,-b.zs*.2],'violet');}
 return out;
}
function drawParticles(ctx,w,h,spec,st){
 const small=w<520, b=particlesBench(spec,st,small);
 const {stage,since,A,XB,L,XS,yc,sw,zs,n,slow,fly,flash,leg,click,compare,dimD,gapY}=b;
 const barC='#7d8796', barEdge='#3c4350', shutter='#f2b134', screenC='#141d2b', dot='#ffb46b', wave='#4c9be8', violet='#7a3fb2', hole='#fdf6f3';
 // The view is a fixed oblique projection of the bench.
 const cz=Math.min(h*.3,w*(small?.27:.25)), bx=cz*(small?.38:.62), by=cz*.36;
 const ox=w*(small?.12:.1), oy=h*(small?.5:.52), ax=(w*.96-ox-bx)/XS;
 const P=(x,y,z)=>[ox+x*ax+y*bx,oy+y*by-z*cz];
 const poly=(pts,fill,stroke,lw=1.2)=>{trace(ctx,pts);ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}};
 const panel=(x,y0,y1,z0,z1)=>[P(x,y0,z0),P(x,y1,z0),P(x,y1,z1),P(x,y0,z1)];
 const sub=pts=>{pts.forEach(([a,c],k)=>k?ctx.lineTo(a,c):ctx.moveTo(a,c));ctx.closePath();};
 PARTICLES.geo={wallX:P(XB,yc,0)[0],slab:bx*.25,y2:P(XB,yc,0)[1],slit:zs*cz};
 const [lx,ly]=P(0,0,0), lr=cz*(small?.13:.12);
 const ripple=(cx,cy,r,x0,x1,alpha,ymax=1,col=wave)=>{ctx.strokeStyle=rgba(col,alpha);let seg=[];
  const flush=()=>{if(seg.length>1){trace(ctx,seg);ctx.stroke();}seg=[];};
  for(let k=0;k<=64;k++){const a=-Math.PI/2+Math.PI*k/64, x=cx+r*Math.cos(a), y=cy+r*Math.sin(a);
   if(x>x0&&x<x1&&Math.abs(y)<=ymax)seg.push(P(x,y,0));else flush();}flush();};
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 if(b.fronts.length||b.arcs.length){ctx.lineWidth=small?2:2.6;for(const x of b.fronts){ctx.strokeStyle=rgba(wave,b.frontAlpha);trace(ctx,[P(x,-.62,0),P(x,.62,0)]);ctx.stroke();}}
 const photon=({pos,prev,a,c})=>{if(a<.02)return;const [px,py]=P(...pos), [qx,qy]=P(...prev), core=c==='#ffb46b'?'#ffe0b0':'#e3ccff';
  const tr=ctx.createLinearGradient(qx,qy,px,py);tr.addColorStop(0,rgba(c,0));tr.addColorStop(1,rgba(c,.7*a));
  ctx.strokeStyle=tr;ctx.lineWidth=small?2.4:3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(qx,qy);ctx.lineTo(px,py);ctx.stroke();
  const g=ctx.createRadialGradient(px,py,0,px,py,small?9:12);g.addColorStop(0,rgba(core,.95*a));g.addColorStop(1,rgba(c,0));
  ctx.fillStyle=g;ctx.fillRect(px-12,py-12,24,24);ctx.beginPath();ctx.arc(px,py,small?2.6:3.2,0,TAU);ctx.fillStyle=rgba('#fff6e8',a);ctx.fill();};
 // The barrier, with its two slits cut through it.
 poly(panel(XB,-1,1,-1,1),barC,barEdge,1.4);
 for(const [y,open] of [[-yc,1],[yc,A]]){poly(panel(XB,y-sw,y+sw,-zs,zs),hole,barEdge,1.2);
  if(open<.999)poly(panel(XB,y-sw-.02,y+sw+.02,-zs-.03,zs+.03),rgba(shutter,1-open),rgba('#9a6b10',.8*(1-open)),1.2);}
 if(b.fronts.length||b.arcs.length){ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);sub(panel(XB,-1,1,-1,1));ctx.clip('evenodd');ctx.lineWidth=small?2:2.6;
  for(const arc of b.arcs)ripple(XB,arc.y,arc.r,XB+.005,XS-.01,arc.alpha,1,arc.marked?violet:wave);ctx.restore();}
 // The sensor: a violet frame around the slit, which stays open, on a stem rising above the barrier.
 if(b.sensor){const up=b.up, f=.035;
  if(click){const [gx,gy]=P(XB,-yc,0), g=ctx.createRadialGradient(gx,gy,0,gx,gy,cz*.55);g.addColorStop(0,rgba('#c89bff',.8*click));g.addColorStop(1,rgba('#c89bff',0));ctx.fillStyle=g;ctx.fillRect(gx-cz*.55,gy-cz*.55,cz*1.1,cz*1.1);}
  poly(panel(XB-.01,-yc-.012,-yc+.012,zs+f+up,1.3+up),violet,'#3f1d63',1);
  const out=panel(XB-.01,-yc-sw-f,-yc+sw+f,-zs-f+up,zs+f+up), inn=panel(XB-.01,-yc-sw,-yc+sw,-zs+up,zs+up);
  ctx.beginPath();sub(out);sub(inn);ctx.fillStyle=rgba(violet,click?1:.9);ctx.fill('evenodd');ctx.strokeStyle='#3f1d63';ctx.lineWidth=1;ctx.stroke();}
 // The laser: a small box on the bench, its open end facing the barrier, with a red glow at the opening that
 // flashes as each particle leaves.
 {const L0=small?.36:.22, hy=.07, hz=.1;
  poly([P(-L0,hy,-hz),P(0,hy,-hz),P(0,hy,hz),P(-L0,hy,hz)],'#3a4250','#1d222b',1.2);
  poly([P(-L0,-hy,hz),P(0,-hy,hz),P(0,hy,hz),P(-L0,hy,hz)],'#5a6474','#1d222b',1.2);
  poly([P(0,-hy,-hz),P(0,hy,-hz),P(0,hy,hz),P(0,-hy,hz)],'#2a303a','#1d222b',1.2);
  const r=lr*(1.6+1.4*flash), g=ctx.createRadialGradient(lx,ly,0,lx,ly,r);g.addColorStop(0,rgba('#ff4d3d',.75));g.addColorStop(1,rgba('#ff4d3d',0));ctx.fillStyle=g;ctx.fillRect(lx-r,ly-r,2*r,2*r);
  ctx.beginPath();ctx.arc(lx,ly,Math.max(2.5,lr*.22),0,TAU);ctx.fillStyle='#ff6b5a';ctx.fill();}
 // The screen and the landings, one glowing dot each; the latest is larger.
 poly(panel(XS,-1,1,-1,1),screenC,'#06090f',1.4);
 for(let i=0;i<n;i++){const [y,z,isClicked]=b.dot(i), [x,yy]=P(XS,y,z), fresh=slow&&!fly&&i>=n-1, c=isClicked?'#c79cff':dot;
  if(fresh){const g=ctx.createRadialGradient(x,yy,0,x,yy,12);g.addColorStop(0,rgba(c,.95));g.addColorStop(1,rgba(c,0));ctx.fillStyle=g;ctx.fillRect(x-12,yy-12,24,24);}
  ctx.beginPath();ctx.arc(x,yy,fresh?3.4:n>200?(small?1:1.25):2.4,0,TAU);ctx.fillStyle=fresh?'#fff6e8':rgba(c,(n>200?.75:.95)*dimD);ctx.fill();}
 // The photon in flight, drawn over everything so it is seen entering the slit and landing on the screen.
 if(leg)photon(leg);
 // The dots one slit alone sent into what are now the dark gaps, as faint rings.
 if(compare){ctx.strokeStyle=rgba('#d6dde8',.6*b.fade);ctx.lineWidth=1.1;
  for(const [y,z] of b.rings){const [x,yy]=P(XS,y,z);ctx.beginPath();ctx.arc(x,yy,small?1.3:1.7,0,TAU);ctx.stroke();}}
 ctx.restore();
 if(!st.labels)return;
 const size=small?10:12, label=(s,x,y,o={})=>text(ctx,s,x,y,{size,weight:700,spacing:'1.2px',color:'rgba(20,23,28,.75)',...o});
 if(stage===0)label(spec.source_label||'SOURCE',lx,ly-lr*1.4-12,{align:'center'});
 label('SCREEN',P(XS,0,1)[0],P(XS,-1,1)[1]-14,{align:'center'});
 const below=x=>[P(x,0,-1)[0],P(x,1,-1)[1]+(small?16:20)];
 const [wx,wy]=below(XB);label(A<.5?'ONE SLIT OPEN':'TWO SLITS',wx,wy,{align:'center'});
 const [cx,cy]=below(XS);text(ctx,`${n.toLocaleString('en-US')} ${spec.count_noun||'particle'}${n===1?'':'s'}`,cx,cy,{align:'center',size,weight:700,color:'#c2410c'});
 if(compare&&gapY!==null){const [gx,gy]=P(XS,gapY,1);pill(ctx,'one slit',gx,gy-14,{align:'center',size:small?10:11,weight:600,color:'rgba(20,23,28,.8)'});}
 if(A<.5){const [px,py]=P(XB,yc+sw+.06,zs*.4);pill(ctx,'COVERED',px+8,py,{size:small?9:10,weight:700,spacing:'1.2px',color:'rgba(20,23,28,.75)'});}
 if(b.sensor){const [sx,sy]=P(XB,-yc,1.32);label('SENSOR',sx,sy-12,{align:'center',color:violet});
  if(click>.15){const [kx,ky]=P(XB,-yc-sw-.06,-zs*.2);pill(ctx,'click',kx-6,ky,{align:'right',size:small?10:11,weight:700,color:violet});}}
}

// The rope: simulated, not drawn from a formula. Each chapter has its own shaking plan; the simulation runs from the
// chapter's start, is advanced frame by frame during playback and rebuilt when seeking, so frames match playback.
const ROPE={key:'',s:null,rate:0,size:0,held:0};
function ropePlan(spec,st){
 const c=st.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0;
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
 ROPE.rate=rate;ROPE.held=held??0;
 ROPE.size=ROPE.rate>0?P.ropeSize(ROPE.s,ROPE.rate):0;
 return {y:ROPE.s.y,t:ROPE.s.t,rate:ROPE.rate,size:ROPE.size,held:ROPE.held};
}
// Previews: a still frame of the steady swing at two shakes a second, in two loops at their biggest, sized by the exact
// steady swing; the player's simulation is left alone.
function ropeStill(){
 const {N,A}=Physics.ropeModel, size=Physics.ropeSteady(2);
 return {y:Array.from({length:N+1},(_,i)=>size*A*Math.sin(2*Math.PI*i/N)),t:0,rate:2,size,held:Infinity};
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
const GUITAR={active:false,len:1,plucked:[],tAbs:null,lastSince:-1,lastLen:null,key:'',p:.25,sign:1,hold:null,geo:null};
const guitarLen=b=>1-(b-1)/1.5*.5;
function guitarPlan(st){
 const c=st.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0;
 const press=lines[2]?lines[2].start-c0:9;
 return {plucks:[[.9,1],[press+.9,.5]],press};
}
function drawGuitar(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.gold, warm='#c2410c', small=w<520, P=Physics;
 let p=P.stringPluckAt, sign=1;
 const x0=w*(small?.08:.12), x1=w*(small?.92:.88), yc=h*.46, W=x1-x0, amp=(small?.16:.1)*W*st.mass;
 let len, age, pull=0;
 if(st.live){
  // Exploring: the viewer pulls the string and lets go (GUITAR.hold while it is pulled), or presses it somewhere new,
  // which plucks it again at the new length.
  len=guitarLen(st.distance);
  if(GUITAR.lastLen===null)GUITAR.lastLen=len;
  if(Math.abs(len-GUITAR.lastLen)>.004){GUITAR.lastLen=len;GUITAR.hold=null;GUITAR.p=P.stringPluckAt;GUITAR.sign=1;GUITAR.tAbs=st.t;soundPluck(220/len,st.mass);GUITAR.plucked.push(Math.round(220/len));}
  if(GUITAR.hold){pull=GUITAR.hold.sign;p=GUITAR.hold.p;age=null;}
  else{p=GUITAR.p;sign=GUITAR.sign;age=GUITAR.tAbs===null?99:st.t-GUITAR.tAbs;}
 }else{
  GUITAR.p=P.stringPluckAt;GUITAR.sign=1;GUITAR.hold=null;
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
  if(pull!==0)v=pull*(u<p?u/p:(1-u)/(1-p));else if(age!==null)v=sign*P.stringY(u,age,len,16,p);return [xs+u*(x1-xs),yc-v*amp];});
 GUITAR.geo={x0,x1,xs,yc,W,board,reach:(small?.16:.1)*W,len};
 if(xs>x0+1){trace(ctx,[[x0,yc],[xs,yc]]);ctx.strokeStyle='rgba(225,225,230,.9)';ctx.lineWidth=2;ctx.stroke();}
 trace(ctx,ring);ctx.strokeStyle='rgba(245,240,230,.95)';ctx.lineWidth=2.4;ctx.stroke();
 trace(ctx,ring);ctx.strokeStyle=rgba(accent,.35);ctx.lineWidth=6;ctx.stroke();
 const skin='#e0ad86', edge='rgba(110,62,35,.55)';
 // A fingertip pulls the string before each pluck.
 if(pull!==0){const fx=xs+p*(x1-xs), fy=yc-pull*amp;ctx.fillStyle=skin;ctx.strokeStyle=edge;ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(fx,fy-9*Math.sign(pull),8,11,0,0,TAU);ctx.fill();ctx.stroke();}
 // A finger pressing the string at the middle.
 if(len<.999){const f=small?9:12;ctx.fillStyle=skin;ctx.strokeStyle=edge;ctx.lineWidth=1.2;
  ctx.beginPath();ctx.roundRect(xs-f*.9,yc-f*5.2,f*1.8,f*4.6,f*.9);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.ellipse(xs,yc-f*.35,f,f*1.25,0,0,TAU);ctx.fill();ctx.stroke();
  ctx.fillStyle='rgba(255,240,230,.9)';ctx.strokeStyle=edge;ctx.beginPath();ctx.roundRect(xs-f*.5,yc-f*1.05,f,f*.75,f*.3);ctx.fill();ctx.stroke();}
 if(!st.labels)return;
 const lsize=small?10:11, base=yc+board/2+(small?24:30);
 text(ctx,'a guitar string',(x0+x1)/2,yc-board/2-(small?40:52),{align:'center',size:lsize,weight:600,color:'rgba(20,23,28,.7)'});
 text(ctx,len<.999?(len>.51?`${Math.round(len*100)}% of it rings`:'pressed at the middle'):'open string',(x0+x1)/2,base,{align:'center',size:small?11:12,weight:600,color:len<.999?warm:accent});
 if(pull>0&&!st.live)pill(ctx,'pluck',xs+p*(x1-xs),yc-amp-34,{align:'center',size:lsize,weight:600,color:accent});
}
// Playing the string directly: pull it up or down and let go to pluck it (how far sets how hard), or tap a fret to
// press the string there, which plucks it at the new length; a tap on the pressed fret lets the string go open.
const GUITAR_TOUCH={hint:'pull the string and let go, or tap a fret to press it.',
 grab(w,h,spec,st,x,y){const g=GUITAR.geo;return GUITAR.active&&g&&x>g.x0-10&&x<g.x1+10&&Math.abs(y-g.yc)<g.board/2+(w<520?26:20)?{cursor:'grab'}:null;},
 move(w,h,spec,st,x,y){const g=GUITAR.geo;if(x<g.xs+4)return null;
  const d=(g.yc-y)/g.reach;GUITAR.hold={p:clamp((x-g.xs)/(g.x1-g.xs),.06,.94),sign:d<0?-1:1};return {mass:clamp(Math.abs(d),.04,1)};},
 release(w,h,spec,st,x,y,hd,moved){const g=GUITAR.geo;
  if(GUITAR.hold){const {p,sign}=GUITAR.hold;GUITAR.hold=null;Object.assign(GUITAR,{p,sign,tAbs:st.t});soundPluck(220/g.len,st.mass);GUITAR.plucked.push(Math.round(220/g.len));return {};}
  if(moved)return null;
  // Fret k leaves 2^(-k/12) of the string ringing; frets past the twelfth (the middle) are not offered.
  const k=Math.round(-12*Math.log2(Math.max(1e-6,1-(x-g.x0)/g.W))), now=Math.round(-12*Math.log2(g.len));
  if(k>12){Object.assign(GUITAR,{p:Physics.stringPluckAt,sign:1,tAbs:st.t});soundPluck(220/g.len,Math.max(.5,st.mass));GUITAR.plucked.push(Math.round(220/g.len));return {};}
  const len=Math.pow(2,-(k===now?0:k)/12);return {distance:1+(1-len)/.5*1.5};}};
function drawRope(ctx,w,h,spec,st){
 if(st.stage>=4||st.live)return drawGuitar(ctx,w,h,spec,st);
 const still=st.since===undefined;if(!still)GUITAR.active=false;
 const accent=ACCENT[spec.accent]||ACCENT.gold, warm='#c2410c', small=w<520, P=Physics, A=P.ropeModel.A, N=P.ropeModel.N;
 const r=still?ropeStill():ropeAdvance(spec,st), y=r.y, x0=w*(small?.22:.17), x1=w*(small?.9:.86), yc=h*.46, W=x1-x0, size=small?15:24;
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
 const n=Math.round(r.rate), inStep=r.size>3.2&&r.held>2.5&&n>=1&&Math.abs(r.rate-n)<.04;
 if(inStep)for(let m=1;m<n;m++){ctx.beginPath();ctx.arc(x0+m/n*W,yc,4.5,0,TAU);ctx.fillStyle=warm;ctx.fill();}
 if(!st.labels)return;
 const lsize=small?10:11, base=yc+h*.3, rsize=small?11:13, shakes=r.rate, rateText=st.stage===0?'one shake, 8× slower':`${shakes%1?shakes.toFixed(1):shakes} shake${shakes===1?'':'s'} a second`;
 // The hand's labels sit under it, kept inside the stage.
 ctx.font=`600 ${rsize}px ${FONT}`;const hx=Math.max(x0-size*1.2,ctx.measureText(rateText).width/2+6);
 if(st.stage===0)text(ctx,'your hand',hx,base,{align:'center',size:lsize,weight:600,color:'rgba(20,23,28,.7)'});
 if(st.stage===0)text(ctx,'wall',small?w-6:x1+10,base,{align:small?'right':'center',size:lsize,weight:600,color:'rgba(20,23,28,.7)'});
 text(ctx,rateText,hx,base+18,{align:'center',size:rsize,weight:600,color:'rgba(20,23,28,.78)'});
 if(st.stage===0){
  // Follow the hump: out to the wall, then back upside down.
  let k=4;for(let i=4;i<N;i++)if(Math.abs(y[i])>Math.abs(y[k]))k=i;
  const leg=Math.floor(Math.max(0,2*(r.t-.15)));
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
const BLEND={count:1};
const blendSk=a=>a<.02?0:.5*clamp(a);
function blendPlan(st){
 const P=Physics, c=st.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since);
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
 Object.assign(BLEND,{count:comps.filter(([,a])=>a>.02).length,sk:plan.sk??null,sound:plan.particle<=.5});
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
const TRAP={mode:'',found:0,fits:false,colours:0,L:2,geo:null};
// Trying energies directly: drag the energy line up or down (it clicks onto an allowed energy when close), or drag a
// wall sideways to make the trap wider or narrower.
const TRAP_TOUCH={hint:'drag the energy line up and down, or drag a wall to widen the trap.',
 grab(w,h,spec,st,x,y){const g=TRAP.geo;if(TRAP.mode!=='live'||!g)return null;
  for(const s of [-1,1])if(Math.abs(x-(g.cx+s*g.half*g.sx))<14&&y>g.rim-10&&y<g.floor+10)return {kind:'wall',cursor:'ew-resize'};
  return Math.abs(y-g.yE)<Math.max(16,g.A*.8)?{kind:'energy',cursor:'ns-resize'}:null;},
 move(w,h,spec,st,x,y,hd){const g=TRAP.geo;if(hd.kind==='wall')return {distance:clamp(2*Math.abs(x-g.cx)/g.sx,1,2.5)};
  const E=g.Etop-(y-g.top)/(g.bottom-g.top)*(g.Etop-g.Ebot);return {mass:clamp((1+E/Physics.trapDepth)/.985)};}};
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
 const P=Physics, V=P.trapDepth, c=st.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, dur=c?c.end-c.start:14;
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
 Object.assign(TRAP,{mode:plan.mode,found:plan.found.length,L:plan.L,fits:false,colours:0,geo:{cx,sx,half,rim,floor,top,bottom,Etop,Ebot,A,yE:Y(plan.E??0)}});
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
function drawRocket(ctx,x,y,size,dir,thrust,t,jet){
 ctx.save();ctx.translate(x,y);ctx.scale(dir,1);
 if(jet){
  // A steady jet always burns from the nozzle; an active push flares it longer and brighter. The gentle flicker is
  // driven by the scene time t, never a clock or randomness, so a seeked frame is identical.
  const flick=.9+.1*Math.sin(t*9)*Math.sin(t*5.7), reach=(thrust?1.5:.8)*flick, spread=thrust?.26:.18, bright=thrust?.95:.82;
  const flame=ctx.createLinearGradient(-size*(.9+reach),0,-size*.9,0);flame.addColorStop(0,'rgba(255,170,60,0)');flame.addColorStop(.6,`rgba(255,150,45,${(bright*.55).toFixed(3)})`);flame.addColorStop(1,`rgba(255,138,38,${bright.toFixed(3)})`);
  ctx.beginPath();ctx.moveTo(-size*.9,-size*spread);ctx.quadraticCurveTo(-size*(.9+reach),0,-size*.9,size*spread);ctx.closePath();ctx.fillStyle=flame;ctx.fill();
  // A hot inner core keeps the jet legible on the dark background.
  const core=ctx.createLinearGradient(-size*(.9+reach*.55),0,-size*.9,0);core.addColorStop(0,'rgba(255,241,205,0)');core.addColorStop(1,`rgba(255,244,214,${(bright*.9).toFixed(3)})`);
  ctx.beginPath();ctx.moveTo(-size*.9,-size*spread*.52);ctx.quadraticCurveTo(-size*(.9+reach*.55),0,-size*.9,size*spread*.52);ctx.closePath();ctx.fillStyle=core;ctx.fill();
 }else if(thrust){const f=.7+.3*Math.sin(t*40)*Math.sin(t*23);const flame=ctx.createLinearGradient(-size*1.9,0,-size*.9,0);flame.addColorStop(0,'rgba(255,170,60,0)');flame.addColorStop(1,'rgba(255,140,40,.9)');
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
// Two light clocks. Seen from Earth: Earth's clock (top) has light going straight up and down; the rocket's clock
// (bottom) flies right at v, so its light, keeping light speed, must slant to hit the moving mirrors and ticks
// sqrt(1 - v^2) as often. A scene may name one chapter (crew_view) seen from the rocket instead: the rocket's clock
// stands still and Earth's flies left, so Earth's clock is the slow one. Light keeps one speed on screen in every
// chapter, set so the planned speed crosses the stage once in the longest chapter. During playback the picture holds
// once the moving clock reaches the far edge; when the viewer drives the controls it starts again instead. The ratio
// pill can wait for a chapter (ratio_from) or a sentence (ratio_lines); the tick counters are hidden while the speed
// changes.
const LIGHTCLOCK={crew:false};
function drawLightClocks(ctx,w,h,spec,st,{vplan}={}){
 const accent=st.dark?'#8fb0ff':ACCENT[spec.accent]||ACCENT.blue, dark=inkOf(st), light=st.dark?'#f59e0b':'#d97706', small=w<520, v=Physics.speed(st.mass), since=Math.max(0,(st.since??st.t)-1);
 const L=small?h*.13:Math.min(h*.24,130), lanes=small?[h*.33,h*.7]:[h*.3,h*.7], xa=w*(small?.16:.12), xb=w*(small?.9:.88);
 const last=(st.chapters?.length??0)-1, crew=Number.isInteger(spec.crew_view)&&st.stage===spec.crew_view&&!st.live;
 if(st.since!==undefined)LIGHTCLOCK.crew=crew;
 const spans=(st.chapters||[]).map(c=>c.end-c.start+1), span=spans.length?Math.max(6,...spans):18;
 const c=Math.min(L/1.1,(xb-xa)/(Math.max(vplan??Physics.speed(spec.mass),.2)*span)), slow=1/Physics.lightTick(v), moving=v>.01;
 const bounce=y=>{const f=((y%2)+2)%2;return f<1?f:2-f;}, step=L/c/5;
 // The story clock: during playback it stops when the moving clock reaches the far edge, so the picture holds there.
 // After playback it keeps holding until the viewer moves a control.
 const driving=st.live&&!!st.touched, now=moving&&!driving?Math.min(since,.999*(xb-xa)/(v*c)):since;
 const mirrors=(x,y0)=>{ctx.lineCap='round';for(const y of [y0-L/2,y0+L/2]){trace(ctx,[[x-18,y],[x+18,y]]);ctx.strokeStyle=inkOf(st,.75);ctx.lineWidth=3;ctx.stroke();}};
 const photon=(x,y)=>{const g=st.dark?18:12, glow=ctx.createRadialGradient(x,y,0,x,y,g);glow.addColorStop(0,rgba(light,st.dark?.75:.5));glow.addColorStop(1,rgba(light,0));ctx.fillStyle=glow;ctx.fillRect(x-g,y-g,2*g,2*g);
  ctx.beginPath();ctx.arc(x,y,4,0,TAU);ctx.fillStyle=light;ctx.fill();};
 const dots=pts=>{ctx.fillStyle=rgba(light,.65);for(const [x,y] of pts){ctx.beginPath();ctx.arc(x,y,1.9,0,TAU);ctx.fill();}};
 const path=pts=>{trace(ctx,pts);ctx.setLineDash([3,4]);ctx.strokeStyle=rgba(light,.5);ctx.lineWidth=1.4;ctx.stroke();ctx.setLineDash([]);};
 const iconY=y=>y+L/2+(small?16:22);
 const icon=(who,x,y)=>who==='earth'?drawEarth(ctx,x,iconY(y),small?9:12):drawRocket(ctx,x,iconY(y),small?12:16,1,
  !crew&&moving&&st.stage===last&&!st.live&&st.mass<.99,st.t);
 // The clock at rest in this view: light straight up and down. Dots mark equal steps of time along its path.
 const still=crew?{who:'rocket',y:lanes[1],x:xb}:{who:'earth',y:lanes[0],x:xa}, stillTicks=now*c/L;
 path([[still.x,still.y+L/2],[still.x,still.y-L/2]]);dots(Array.from({length:6},(_,k)=>[still.x,still.y-L/2+k*L/5]));
 icon(still.who,still.x,still.y);mirrors(still.x,still.y);photon(still.x,still.y+L/2-bounce(stillTicks)*L);
 // The moving clock: it travels at v, and its light, keeping light speed, climbs at only sqrt(1 - v^2) of it, so each
 // crossing takes more equal time steps.
 const mover=crew?{who:'earth',y:lanes[0],x0:xb,dir:-1}:{who:'rocket',y:lanes[1],x0:xa,dir:1};
 // A lap is a whole number of round trips, so each new lap starts with the light on the bottom mirror.
 const trip=2*L/(c*slow), lap=Math.max(trip,Math.floor((xb-xa)/(Math.max(v,.01)*c)/trip)*trip), s0=moving&&driving?Math.floor(since/lap)*lap:0, x=mover.x0+mover.dir*v*c*(now-s0), moverTicks=now*c*slow/L;
 const at=t=>[mover.x0+mover.dir*v*c*(t-s0),mover.y+L/2-bounce(t*c*slow/L)*L];
 if(moving){path(Array.from({length:161},(_,i)=>at(s0+(now-s0)*i/160)));dots(Array.from({length:Math.floor((now-s0)/step)+1},(_,k)=>at(s0+k*step)));}
 else{path([[mover.x0,mover.y+L/2],[mover.x0,mover.y-L/2]]);dots(Array.from({length:6},(_,k)=>[mover.x0,mover.y-L/2+k*L/5]));}
 icon(mover.who,x,mover.y);mirrors(x,mover.y);photon(...at(now));
 if(!st.labels)return;
 const size=small?11:13, ticks=n=>`${n} tick${n===1?'':'s'}`, tint=who=>who==='earth'?dark:accent;
 pill(ctx,crew?'SEEN FROM THE ROCKET':'SEEN FROM EARTH',small?14:20,small?16:24,{size:small?10:11,weight:700,spacing:'1.2px',color:'rgba(20,23,28,.8)'});
 // The tick counters are exact only while the speed holds, so they are left out while it changes.
 if(st.stage!==last&&!st.live){
  // Each clock's own icon says whose it is, so its counter is only the count.
  const label=(who,n,cx,y,side,moves)=>{const room=small?64:84, left=side<0||cx+28+room>w;
   if(small&&moves)return text(ctx,ticks(Math.floor(n)),clamp(cx,36,w-36),y-L/2-14,{align:'center',size,weight:600,color:tint(who)});
   text(ctx,ticks(Math.floor(n)),left?cx-28:cx+28,y-L/2+4,{align:left?'right':'left',size,weight:600,color:tint(who)});};
  label(still.who,stillTicks,still.x,still.y,1,false);label(mover.who,moverTicks,x,mover.y,mover.dir,true);
 }
 const ratio=Math.round(slow*100)/10, shown=Number.isInteger(ratio)?String(ratio):ratio.toFixed(1);
 const line=spec.ratio_lines?.[st.stage], said=line===undefined?since>6&&st.stage>=(spec.ratio_from??0):(st.chapters?.[st.stage]?.lines?.[line]?.start??0)-(st.chapters?.[st.stage]?.start??0)<=(st.since??0);
 if(!crew&&moving&&said)pill(ctx,`${shown} ticks to ${crew?'rocket’s':'Earth’s'} 10`,w/2,small?h*.94:h*.9,{align:'center',size:small?11:13,weight:600});
}

// Einstein's train: lightning strikes both ends of a train as it passes a platform. Seen from the platform the strikes
// are simultaneous: the light from each spreads at light speed from where it struck, meets the person halfway between
// the strikes together, and reaches the rider, who moves toward the front, front first. Seen from the train, the train
// stands still and the platform (with its clouds) slides back, shortened by gamma; both ends are equally far from the
// rider and light keeps one speed, so the front must have been struck first, earlier by Physics.simulGap. The train's
// own length always spans the same width, so light keeps one speed on screen in both views. Seven chapters: at rest;
// the platform's view; the rider's arrivals; the change to the train's view; the front-first strikes; the size of the
// gap; and no single "now". The last two hold the result, and the controls drive the replay afterwards. Story time runs
// six times slower than playback; each platform replay holds once its flashes have arrived.
const SIMUL={show:false,gap:0};
function simulTrain(ctx,x0,x1,top,bottom,accent,alpha,n){
 // The front (right) end has a rounder nose and a headlight, the back end a red lamp. The window count stays the same
 // when the moving train is shorter, so the rider stays in the middle window.
 const H=bottom-top, len=x1-x0, cell=len/n, rf=Math.min(H*.45,26), rb=Math.min(H*.18,8), ly=top+H*.88;
 const box=(x,y,w,h,r)=>{ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h);};
 ctx.save();ctx.globalAlpha=alpha;
 box(x0,top,len,H,[rb,rf,3,3]);ctx.fillStyle='#f8fafc';ctx.fill();ctx.strokeStyle=rgba(accent,.8);ctx.lineWidth=2;ctx.stroke();
 ctx.fillStyle=rgba(accent,.78);ctx.fillRect(x0+1,top+H*.7,len-2,H*.09);
 for(let i=0;i<n;i++){box(x0+cell*i+cell*.2,top+H*.14,cell*.6,H*.42,3);ctx.fillStyle='rgba(186,206,234,.85)';ctx.fill();}
 const lamp=ctx.createRadialGradient(x1-7,ly,0,x1-7,ly,16);lamp.addColorStop(0,'rgba(255,236,170,.95)');lamp.addColorStop(1,'rgba(255,236,170,0)');
 ctx.fillStyle=lamp;ctx.fillRect(x1-23,ly-16,32,32);ctx.beginPath();ctx.arc(x1-7,ly,3.2,0,TAU);ctx.fillStyle='#fcd34d';ctx.fill();
 ctx.beginPath();ctx.arc(x0+6,ly,2.6,0,TAU);ctx.fillStyle='#dc2626';ctx.fill();
 ctx.restore();
}
function simulBolt(ctx,x,y0,y1,seed,alpha){
 if(alpha<=.01)return;
 const pts=[[x+(hash(seed)-.5)*14,y0]];
 for(let i=1;i<7;i++){const f=i/7;pts.push([x+(hash(seed+i*1.7)-.5)*(30*(1-f)+6),y0+(y1-y0)*f]);}
 pts.push([x,y1]);
 ctx.save();ctx.globalAlpha=alpha;ctx.lineJoin='round';ctx.lineCap='round';
 trace(ctx,pts);ctx.strokeStyle='rgba(109,40,217,.22)';ctx.lineWidth=10;ctx.stroke();
 trace(ctx,pts);ctx.strokeStyle='#facc15';ctx.lineWidth=3.6;ctx.stroke();
 trace(ctx,pts);ctx.strokeStyle='#fffdf2';ctx.lineWidth=1.3;ctx.stroke();
 ctx.restore();
}
function drawSimultaneity(ctx,w,h,spec,st){
 const small=w<520, accent=ACCENT[spec.accent]||ACCENT.blue, amber='#d97706', ink='#14171c', mint='#0e9f7a';
 const preview=st.since===undefined, live=!!st.live, last=(st.chapters?.length||5)-1, stage=preview?1:live?last:st.stage;
 const own=live||stage===last, v=stage===0?0:Physics.simulSpeed(own?st.mass:spec.mass), L=Physics.simulLength(own?st.distance:(spec.distance||1));
 const g=Physics.simulGamma(v), gap=Physics.simulGap(v,L), trainView=stage>=3, S=6, still=stage>=5&&!live;
 if(!preview){SIMUL.show=live||stage>=5;SIMUL.gap=gap;}
 const ch=st.chapters?.[stage], c0=ch?.start||0, at=i=>ch?.lines?.[i]?ch.lines[i].start-c0:1+4*i, since=preview?0:Math.max(0,st.since);
 const trainPx=small?w*.64:Math.min(w*.56,760), k=trainPx/L;
 const cx=w/2, yPlat=h*(small?.74:.77), platH=h*(small?.075:.085), platTop=platH*.42, yFace=yPlat+platTop, yGround=yPlat+platH+(small?12:16);
 const trainH=small?Math.min(h*.16,86):Math.min(h*.17,120), top=yPlat-trainH, nWin=2*Math.round((trainPx/(trainH*.62)-1)/2)+1;
 const rHead=trainH*(small?.1:.085), yEye=top+trainH*.3, yFeet=yPlat+platTop*.8, yHead=yFeet-trainH*.56+rHead;
 // Where things are. Platform view: platform time t is zero at the strikes, which hit the train's ends together.
 // Train view: train time tau is zero at the front strike; the back end is struck gap later.
 let drift=0, tiles=1;
 const P={};
 if(!trainView){
  P.arr=Physics.simulArrivals(v,L);P.cx=w/2-(stage>0?v*(P.arr.back+.25)*k/2:0);
  P.half=L/g/2;P.xF=P.cx+P.half*k;P.xB=P.cx-P.half*k;P.dP=Math.hypot(P.half*k,yHead-yEye)/k;
  P.ts=preview?0:stage===0?Math.max(at(0)+1.6,at(1)+.8-P.dP*S):stage===1?Math.max(at(0)+3,at(1)+.8-P.dP*S):Math.max(at(0)+1,at(1)+.25-P.arr.front*S);
  P.hold=stage===1?P.dP+.45:stage===2?P.arr.back+.25:1e9;
  P.raw=preview?.22:(since-P.ts)/S;P.t=Math.min(P.raw,P.hold);P.frozen=P.raw>P.hold?smooth((P.raw-P.hold)*S):0;P.xr=P.cx+v*P.t*k;
 }else{
  // One train clock runs through chapters 4 and 5: the platform slides past first, and the strikes come with
  // chapter 5's third sentence. The last two chapters hold the result where chapter 5 left it.
  const loop=(gap+L/2+1.2)*S+1.5, c4=st.chapters?.[4], strikeAt=c4?.lines?.[2]?c4.lines[2].start+.3:null, now=c0+since;
  P.tau=live?(since%loop)/S-.3:strikeAt===null?gap+L/2+2:stage<=4?(now-strikeAt)/S:Math.max((c4.end-strikeAt)/S,gap);
  P.xF=cx+L/2*k;P.xB=cx-L/2*k;P.xP=cx-v*(P.tau-v*L/2)*k;
  drift=P.xP-cx;tiles=1/g;
 }
 // Sky with storm cloud (fixed to the ground, so it slides with the platform in the train view), and the ground.
 const sky=ctx.createLinearGradient(0,0,0,yPlat);sky.addColorStop(0,'#c9d2df');sky.addColorStop(1,'#eef1f5');ctx.fillStyle=sky;ctx.fillRect(0,0,w,yPlat);
 const sinceStrike=trainView?Math.min(...[P.tau*S,(P.tau-gap)*S].filter(e=>e>=0),1):P.raw*S;
 if(!still&&sinceStrike>=0&&sinceStrike<.35){ctx.fillStyle=`rgba(255,255,255,${.3*(1-sinceStrike/.35)})`;ctx.fillRect(0,0,w,yPlat);}
 ctx.fillStyle='#e9e4da';ctx.fillRect(0,yPlat,w,h-yPlat);ctx.fillStyle='#ddd6c9';ctx.fillRect(0,yPlat+platH,w,h*.02);
 const cloudY=h*(small?.08:.09), span=w*1.3;
 for(let i=0;i<13;i++){const x=((w*(i/12)*1.3+(hash(i*4.1)-.5)*w*.08+drift)%span+span)%span-w*.15, y=cloudY+hash(i*2.3)*h*.03, r=w*(.06+.05*hash(i*1.9));
  ctx.fillStyle=`rgba(120,132,152,${.12+.08*hash(i*3.7)})`;ctx.beginPath();ctx.ellipse(x,y,r,r*.32,0,0,TAU);ctx.fill();}
 const burn=(x,y,r,e=9,a=1)=>{ctx.save();ctx.globalAlpha=a*(.55+.45*Math.exp(-Math.max(0,e)/.6));ctx.fillStyle='rgba(38,30,24,.82)';ctx.beginPath();ctx.arc(x,y,r*.42,0,TAU);ctx.fill();ctx.strokeStyle=rgba(amber,.9);ctx.lineWidth=1.6;
  ctx.beginPath();ctx.arc(x,y,r*.72,0,TAU);ctx.stroke();for(let i=0;i<8;i++){const a=i*TAU/8+.2;trace(ctx,[[x+Math.cos(a)*r*.9,y+Math.sin(a)*r*.9],[x+Math.cos(a)*r*1.3,y+Math.sin(a)*r*1.3]]);ctx.stroke();}ctx.restore();};
 const glow=(x,y,a)=>{if(a<=.01)return;const r=small?20:28, gr=ctx.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,rgba(amber,.62*a));gr.addColorStop(1,rgba(amber,0));ctx.fillStyle=gr;ctx.fillRect(x-r,y-r,2*r,2*r);};
 const fade=r=>1-smooth((r-(trainView?.62:.92)*L*k)/(.3*L*k));
 const ring=(x,r,a)=>{if(r<=0||a<=.01)return;ctx.save();ctx.beginPath();ctx.rect(0,0,w,yFace);ctx.clip();
  ctx.beginPath();ctx.arc(x,yEye,r,0,TAU);ctx.strokeStyle=rgba(amber,.2*a);ctx.lineWidth=7;ctx.stroke();
  ctx.beginPath();ctx.arc(x,yEye,r,0,TAU);ctx.strokeStyle=rgba(amber,.9*a);ctx.lineWidth=2;ctx.stroke();ctx.restore();};
 const flashAt=e=>e>=0?Math.exp(-e/1.2):0;
 const person=(x,a)=>{ctx.save();ctx.globalAlpha=a;ctx.fillStyle=ink;ctx.beginPath();ctx.arc(x,yHead,rHead,0,TAU);ctx.fill();const b=yHead+rHead*1.25;
  ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x-rHead*.95,b,rHead*1.9,yFeet-b,rHead*.6);else ctx.rect(x-rHead*.95,b,rHead*1.9,yFeet-b);ctx.fill();ctx.restore();};
 const riderAt=(x,a)=>{ctx.save();ctx.globalAlpha=a;ctx.fillStyle=mint;ctx.beginPath();ctx.arc(x,yEye,rHead,0,TAU);ctx.fill();
  ctx.beginPath();ctx.ellipse(x,yEye+rHead*2.2,rHead*1.25,rHead*1.05,0,Math.PI,TAU);ctx.fill();ctx.restore();};
 const platform=()=>{ctx.fillStyle='#e4ded3';ctx.fillRect(0,yPlat,w,platTop);ctx.fillStyle='#d3ccbe';ctx.fillRect(0,yFace,w,platH-platTop);
  ctx.fillStyle='#b9b1a2';ctx.fillRect(0,yFace,w,1.5);const step=Math.max(28,k*.12)*tiles, o=((drift%step)+step)%step;ctx.strokeStyle='rgba(20,23,28,.12)';ctx.lineWidth=1;
  for(let x=o-step;x<w+step;x+=step){trace(ctx,[[x,yFace+3],[x,yPlat+platH]]);ctx.stroke();}};
 const strike=(x,e)=>{if(e<0)return;simulBolt(ctx,x,cloudY+h*.02,yEye,Math.round(x),1-e/.45);};
 const equal=(x0,x1,xm,y,a)=>{if(a<=.01)return;ctx.save();ctx.globalAlpha=a;ctx.strokeStyle='rgba(20,23,28,.55)';ctx.lineWidth=1.4;
  for(const [p,q] of [[x0,xm],[xm,x1]]){trace(ctx,[[p+3,y],[q-3,y]]);ctx.stroke();for(const x of [p+3,q-3]){trace(ctx,[[x,y-5],[x,y+5]]);ctx.stroke();}}ctx.restore();};
 const size=small?11:13, secs=x=>x.toFixed(2)+' s', labels=st.labels!==false, r0=small?8:11, onStage=x=>clamp(x,small?30:40,w-(small?30:40));
 const tag=s=>{ctx.save();ctx.globalAlpha=preview||live?1:smooth(since/.8);pill(ctx,s,small?14:20,small?16:24,{size:small?10:11,weight:700,spacing:'1.2px',color:'rgba(20,23,28,.8)'});ctx.restore();};
 if(!trainView){
  const {xF,xB,xr,t,raw,dP,arr,frozen}=P, e=raw*S, half=P.half;
  const dimTrain=stage===1?1-.5*smooth(e/1.5):1, dimPerson=stage===2?.4:1, rings=1-frozen;
  simulTrain(ctx,xr-half*k,xr+half*k,top,yPlat+2,accent,dimTrain,nWin);
  if(raw>=0){burn(xr+half*k-6,yEye,r0,e,dimTrain);burn(xr-half*k+6,yEye,r0,e,dimTrain);}
  riderAt(xr,dimTrain);if(stage!==1)glow(xr,yEye,Math.max(flashAt((raw-arr.front)*S),flashAt((raw-arr.back)*S)));
  platform();
  if(raw>=0&&stage>0){burn(xF,yPlat+platTop*.5,r0*.8,e);burn(xB,yPlat+platTop*.5,r0*.8,e);}
  person(P.cx,dimPerson);glow(P.cx,yHead,stage===2?0:flashAt((raw-dP)*S));
  if(raw>=0){ring(xF,t*k,fade(t*k)*rings);ring(xB,t*k,fade(t*k)*rings);}
  strike(xF,e);strike(xB,e);
  if(!labels)return;
  if(stage===0){pill(ctx,'rider',onStage(xr),top-(small?12:16),{align:'center',size,weight:600,color:mint});
   text(ctx,'platform',P.cx,yFace+(platH-platTop)*.55,{align:'center',size:small?10:12,weight:600,color:'rgba(20,23,28,.62)'});
   const a=smooth((since-at(2))/.6);equal(xB,xF,P.cx,top-(small?30:40),a);if(a>.01)text(ctx,'same distance',P.cx,top-(small?42:56),{align:'center',size:small?10:12,weight:600,color:'rgba(20,23,28,.7)'});
   return;}
  tag('SEEN FROM THE PLATFORM');
  if(stage===1){equal(xB,xF,P.cx,yGround,smooth((since-at(1))/.6));
   if(since>=at(2))for(const x of [xF,xB])pill(ctx,secs(0),onStage(x),yFace+(platH-platTop)*.55,{align:'center',size,weight:600,color:ink});}
  if(stage===2){if(t>=arr.front)pill(ctx,'front flash first',clamp(xr,small?62:84,w-(small?62:84)),top-(small?12:16),{align:'center',size,weight:600,color:mint});
   // The two light paths along the track: short from the front strike to where it met her, long from the back.
   const a=smooth((since-at(2))/.6);if(a>.01){const mF=P.cx+v*arr.front*k, mB=P.cx+v*arr.back*k, y2=yGround+(small?14:18);ctx.save();ctx.globalAlpha=a;ctx.strokeStyle=amber;ctx.fillStyle=amber;ctx.lineWidth=2.4;ctx.lineCap='round';
    for(const [x0,x1,y] of [[xF,mF,yGround],[xB,mB,y2]]){const d=Math.sign(x1-x0), tip=x1-d*6;trace(ctx,[[x0,y],[tip,y]]);ctx.stroke();
     ctx.beginPath();ctx.moveTo(tip,y);ctx.lineTo(tip-d*8,y-5);ctx.lineTo(tip-d*8,y+5);ctx.closePath();ctx.fill();}
    for(const [x,y] of [[mF,yGround],[mB,y2]]){ctx.beginPath();ctx.arc(x,y,4,0,TAU);ctx.fillStyle=mint;ctx.fill();}ctx.restore();}}
  return;
 }
 const {xF,xB,xP,tau}=P, eF=tau*S, eB=(tau-gap)*S;
 simulTrain(ctx,xB,xF,top,yPlat+2,accent,1,nWin);
 if(tau>=0)burn(xF-6,yEye,r0,still?9:eF);if(tau>=gap)burn(xB+6,yEye,r0,still?9:eB);
 riderAt(cx,1);glow(cx,yEye,still?0:Math.max(flashAt((tau-L/2)*S),flashAt((tau-gap-L/2)*S)));
 platform();
 person(xP,still?.4*(1-smooth(since/.5)):.4);
 const ringA=still?(stage===5?1-smooth(since/.5):0):1;
 if(ringA>.01){if(tau>=0)ring(xF,tau*k,fade(tau*k)*ringA);if(tau>=gap)ring(xB,(tau-gap)*k,fade((tau-gap)*k)*ringA);}
 if(!still){strike(xF,eF);strike(xB,eB);}
 if(!labels)return;
 tag('SEEN FROM THE TRAIN');
 if(stage===4){const a=smooth((since-at(0))/.6), words=a*(1-smooth((since-at(2))/.6));equal(xB,xF,cx,top-(small?30:40),a);
  if(words>.01){ctx.save();ctx.globalAlpha=words;text(ctx,'same distance',cx,top-(small?42:56),{align:'center',size:small?10:12,weight:600,color:'rgba(20,23,28,.7)'});ctx.restore();}}
 // Chapters 6 and 7: the train's own length, so 0.40 s reads as 40% of the time light takes to cross it.
 if(stage>=5){const a=live?1:stage===5?smooth((since-at(0))/.6):1, y=top-(small?30:40);if(a>.01){ctx.save();ctx.globalAlpha=a;ctx.strokeStyle='rgba(20,23,28,.55)';ctx.lineWidth=1.4;
  trace(ctx,[[xB+3,y],[xF-3,y]]);ctx.stroke();for(const x of [xB+3,xF-3]){trace(ctx,[[x,y-5],[x,y+5]]);ctx.stroke();}
  text(ctx,Math.abs(L-1)<1e-9?'1 light-second':L.toFixed(1)+' light-seconds',cx,top-(small?42:56),{align:'center',size:small?10:12,weight:600,color:'rgba(20,23,28,.7)'});ctx.restore();}}
 if(tau>=0||still)pill(ctx,secs(0),onStage(xF),top-(small?12:16),{align:'center',size,weight:600,color:ink});
 if(tau>=gap||still)pill(ctx,secs(gap),onStage(xB),top-(small?12:16),{align:'center',size,weight:600,color:ink});
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
 const size=small?10:11, T2=n=>n.toFixed(1);
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
 // At the reunion: how much younger the traveller is.
 if(tc>=H-1e-6&&v>.001)pill(ctx,`traveller: ${T2(H-H/g)} years younger`,small?w/2:w*.745,small?h*.95:h*.3+132,{align:'center',size:small?11:13,weight:600});
}
const PATHS_TOUCH={hint:'drag the turnaround sideways for a faster trip, or up for a longer one.',
 grab:(w,h,spec,st,x,y)=>dragPaths(w,h,spec,st,x,y,true)?{cursor:'grab'}:null,
 move:(w,h,spec,st,x,y)=>dragPaths(w,h,spec,st,x,y,false)};
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
const RIVER={live:false};
const RIVER_K=.25;
function riverPlan(st){
 const c=st.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since);
 const ch0=st.chapters?.[0], first=ch0?ch0.end-ch0.start:12;
 if(st.since===undefined){const T=st.t||0;return {mode:'hole',rs:1,t:T,horizon:1,pulses:[{r0:1.8,from:T-3,ang:-.95},{r0:1,from:T-30,ang:0},{r0:.62,from:T-.8,ang:.75}]};}
 if(st.live){const rs=clamp(st.mass), re=.6+(st.distance-1);return {mode:'hole',rs,t,pulses:[{r0:re,every:2.6,label:true}],live:true};}
 // 1: one fish far from the falls gets away.
 if(st.stage===0)return {mode:'river',t,fish:[{r0:2.4,tau:t*RIVER_K,arrows:true}],line:0};
 // 2: it keeps going; a second fish holds still at the point of no return; a third, just past it, is swept over.
 if(st.stage===1)return {mode:'river',t,line:smooth((t-at(0)-.2)/.8),fish:[{r0:2.4,tau:(first+t)*RIVER_K,dim:true},
  {r0:1.2,tau:(t-at(0)-.2)*RIVER_K,show:smooth((t-at(0)-.2)/.6),arrows:true},{r0:.75,tau:(t-at(1)-.2)*RIVER_K,show:smooth((t-at(1)-.2)/.6),arrows:true,below:true}]};
 // 3: space around a black hole flows inward; light, far out, swims outward through it and gets away.
 const c2=st.chapters?.[2], l2=c2?.lines||[], third=c2?c2.end-c2.start:15, from3=l2[1]?l2[1].start-c2.start-.4:6;
 if(st.stage===2)return {mode:'hole',rs:1,t,pulses:[{r0:2.3,from:from3,ang:-.95}]};
 // 4: at the horizon light holds still; just outside it escapes, slowly; inside it is carried in.
 if(st.stage===3)return {mode:'hole',rs:1,t,horizon:smooth((t-.4)/.8),pulses:[{r0:2.3,from:from3-third,ang:-.95,quiet:true},{r0:1,from:at(0)+.4,ang:0},{r0:1.35,from:at(1)+.2,ang:-.5},{r0:.62,from:at(1)+.2,ang:.75}]};
 // 5: inside, space flows in faster than light, yet light still moves through it at light speed.
 return {mode:'hole',rs:1,t,horizon:1,pulses:[{r0:.75,from:at(0)+.2,ang:.75,slow:.5},{r0:1,from:-30,ang:0,quiet:true}]};
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
 const small=w<520, P=Physics, plan=riverPlan(st), lsize=small?10:12, warm='#c2410c';
 RIVER.live=!!plan.live;
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
  for(let i=30;i>=0;i--){const [x,y]=fall(i/30);ctx.lineTo(x,y+(yb-yw)*(1-i/30));}ctx.closePath();
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
  if(st.labels)text(ctx,'WATERFALL',Math.min(w-8,xe+w*.05),h*.9,{align:small?'right':'center',size:lsize,weight:600,spacing:'1.5px',color:'rgba(255,255,255,.9)'});
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
    // Beside the fish, or before it where the stage ends.
    ctx.font=`600 ${lsize}px ${FONT}`;const right=x+size*.8+ctx.measureText(note).width+10<w;
    pill(ctx,note,right?x+size*.8:x-size*.8,yy,{align:right?'left':'right',size:lsize,weight:600,color:note==='gets away'?'#1f6f43':warm});}
  });
  if(st.labels)arrowLegend(ctx,w/2,h*(small?.08:.1),['swims','current'],small,[-1,1]);
  return;
 }
 // Top view of a black hole: space pictured flowing inward along spokes, faster closer in; light pulses swim outward.
 const rs=plan.rs, cx=w/2, cy=h*(small?.5:.53), rmax=3, k=Math.min(w*(small?.45:.4),h*(small?.41:.43))/rmax, tau=plan.t*RIVER_K;
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
 for(const s0 of states){const {x,y,r,q,ang}=s0, own=small?24:34, v=Math.sqrt(rs/Math.max(r,.05)), ux=Math.cos(ang), uy=Math.sin(ang), px=-uy*7, py=ux*7;
  // Along the light's own line: its own speed outward (gold) and the inflow carrying it in (blue).
  const ray=(x0,y0,len,dir,col)=>{const x1=x0+dir*ux*len, y1=y0+dir*uy*len;trace(ctx,[[x0,y0],[x1,y1]]);ctx.strokeStyle=col;ctx.lineWidth=2.4;ctx.stroke();
   ctx.beginPath();ctx.moveTo(x1+dir*ux*3,y1+dir*uy*3);ctx.lineTo(x1-dir*ux*5+px*.7,y1-dir*uy*5+py*.7);ctx.lineTo(x1-dir*ux*5-px*.7,y1-dir*uy*5-py*.7);ctx.closePath();ctx.fillStyle=col;ctx.fill();};
  if(q.quiet)continue;
  ray(x+px,y+py,own,1,'#d97706');if(v>.01)ray(x-px,y-py,Math.min(own*2.6,own*v),-1,'#2563eb');
  if(!st.labels)continue;
  const note=r<rs*.985?'carried in':Math.abs(r-rs)<.015*rs?'stands still':'escapes', align=ux>=-.2?'left':'right', left=align==='left';
  // Past the arrow's tip, kept inside the stage.
  ctx.font=`700 ${lsize}px ${FONT}`;const room=ctx.measureText(note).width+9;
  const lx=clamp(x+ux*(own+16)+(ux>=0?4:-4),left?9:room,left?w-room:w-9), ly=y+uy*(own+16);
  pill(ctx,note,lx,ly,{align,size:lsize,weight:700,color:note==='escapes'?'#1f6f43':warm});
 }
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
 const c=st.chapters?.[st.stage], span=c?Math.max(3,(c.end-c.start)*.75-lead):10;
 return clamp(((st.since??st.t)-lead)/span);
}
function drawTides(ctx,w,h,spec,st){
 const accent=ACCENT[spec.accent]||ACCENT.blue, dark='#14171c', warm='#c2410c', small=w<520, stage=st.stage, P=Physics.tides(Math.max(st.mass,1e-6));
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
  const gap=Physics.walkersGap(lat,lons[1]-lons[0])/Physics.walkersGap(0,lons[1]-lons[0]);
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
function liftFallTime(st,since){
 // Seconds of free fall, slowed down for viewing; the last chapter carries on from the end of the previous one.
 const ch=st.chapters?.[2], before=ch?Math.max(0,ch.end-ch.start-LIFT_SNAP):0;
 return st.stage===2?Math.max(0,since-LIFT_SNAP)*LIFT_SLOW:(before+since)*LIFT_SLOW;
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
 else if(stage>=2){tf=liftFallTime(st,since);yc=topY;if(tf>0){snapped=true;fall=.5*L.g*tf*tf;a=-L.g;yc=topY-fall;}}
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
function limitLight(chapters){
 const timing=i=>{const c=chapters?.[i], lines=c?.lines||[], c0=c?.start||0, at=k=>lines[k]?lines[k].start-c0:3+4*k;return {lines,at,end:c?.end!=null?c.end-c0:null};};
 const two=timing(1), three=timing(2), flash=two.lines[1]?Math.max(1.2,two.at(1)-1):two.at(0)+1.2, crew=three.at(0)+.6;
 const speed=Math.min(.8/Math.max(3,(two.end??flash+6)-flash-.2),.84/Math.max(3,(three.end??crew+8)-crew-.2));
 return {flash,crew,speed};
}
function limitPlan(st){
 const c=st.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since??0);
 if(st.since===undefined)return {mode:'thumb',t:2};
 if(st.live){const n=Math.round(clamp(st.mass)*10);return {mode:'live',n,t:st.t||0};}
 // 1: the rocket fires one push and coasts half way to the wall; with the second sentence, ghost rockets take equal
 // leaps that reach the wall on the second and sail past it on the third.
 if(st.stage===0)return {mode:'add',n:smooth((t-.5)/.7),everyday:smooth((t-at(1)-.2)/1.9),burn:t>.5&&t<1.2,t};
 // 2: seen from the ground, the rocket coasts past a lamp post; both lamps flash and the flashes travel side by side.
 if(st.stage===1)return {mode:'lamp',n:1,flash:limitLight(st.chapters).flash,dim:smooth(t/.6),t};
 // 3: seen from the rocket: the ground streams back and the crew's flash leaves at light speed; with the second
 // sentence another push makes the ground stream faster, and the same flash still pulls away at light speed.
 if(st.stage===2)return {mode:'crew',n:1,push:at(1)+.5,first:limitLight(st.chapters).crew,dim:1,t};
 // 4: the same push again and again. The near-wall speeds are spread out (a fixed square-root scale) so the shrinking
 // leaps stay visible and the rocket only ever advances towards the wall.
 const pushes=[at(0)+1,at(0)+2.6,at(1)+.5,at(1)+1.7,at(1)+2.9];
 let n=1,burn=false;for(const p of pushes){n+=smooth((t-p)/.7);if(t>=p&&t<p+.7)burn=true;}
 return {mode:'climb',n,burn,t};
}
// A deep space background with calm, static, deterministic stars, shared by every speed-limit chapter. It reuses the
// night-sky star array and palette so the lab's two space scenes match.
function spaceBg(ctx,w,h){
 const g=ctx.createLinearGradient(0,0,0,h);
 g.addColorStop(0,'rgb(6,9,24)');g.addColorStop(.6,'rgb(9,13,34)');g.addColorStop(1,'rgb(13,18,44)');
 ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
 for(const [u,v,s,warm] of NIGHT_STARS){const x=u*w, y=v*h, rr=.4+1.3*s**5, col=nightMix([200,214,255],[255,224,190],warm), a=+(.22+.55*s).toFixed(3);
  if(s>.972){const halo=ctx.createRadialGradient(x,y,0,x,y,rr*6);halo.addColorStop(0,nightRgb(col,.3));halo.addColorStop(1,nightRgb(col,0));ctx.fillStyle=halo;ctx.fillRect(x-rr*6,y-rr*6,rr*12,rr*12);}
  ctx.beginPath();ctx.arc(x,y,rr,0,TAU);ctx.fillStyle=nightRgb(col,a);ctx.fill();}
}
function drawLimit(ctx,w,h,spec,st){
 const plan=limitPlan(st), small=w<520, light='#f59e0b', accent='#8ec2ff', ink='rgba(232,237,255,.95)', muted='rgba(200,210,245,.7)';
 LIMIT.mode=plan.mode;
 const T=plan.t, size=small?10:12;
 // The rocket flies in space: a deep night sky with calm, static stars behind every chapter.
 spaceBg(ctx,w,h);
 // The track runs from rest on the left to a glowing light-speed wall on the right; a position along it is the speed
 // seen from the ground, as a fraction of light speed. Chapters 2 and 3 reuse it as the ground strip.
 const x0=w*(small?.08:.12), x1=w*(small?.92:.88), lane=x1-x0, lampX=x0+lane*.2, win={top:h*.12,base:h*.88};
 const r=small?17:26, ry=h*.38, gy=h*.78, head=h*.6, lampY=ry-r*.45;
 const c=limitLight(st.chapters).speed*lane;
 // A label on a dark chip so light text stays legible over the stars; counted toward the label budget via text().
 const tag=(value,x,y,{align='left',color=ink,weight=600,sz=size}={})=>{ctx.font=`${weight} ${sz}px ${FONT}`;const wd=ctx.measureText(value).width, left=align==='right'?x-wd:align==='center'?x-wd/2:x;
  ctx.fillStyle='rgba(6,10,26,.62)';ctx.beginPath();ctx.roundRect?ctx.roundRect(left-6,y-sz*.82,wd+12,sz*1.64,sz*.82):ctx.rect(left-6,y-sz*.82,wd+12,sz*1.64);ctx.fill();
  text(ctx,value,x,y,{align,size:sz,weight,color});};
 const glow=(x,y,rr,a=1)=>{const g=ctx.createRadialGradient(x,y,0,x,y,rr*3);g.addColorStop(0,rgba(light,.6*a));g.addColorStop(1,rgba(light,0));ctx.fillStyle=g;ctx.fillRect(x-rr*3,y-rr*3,rr*6,rr*6);
  ctx.beginPath();ctx.arc(x,y,rr,0,TAU);ctx.fillStyle=rgba(light,a);ctx.fill();};
 const frame=(a,name)=>{ctx.save();ctx.globalAlpha=a;
  trace(ctx,[[x0,gy],[x1,gy]]);ctx.strokeStyle='rgba(200,210,245,.32)';ctx.lineWidth=1.4;ctx.stroke();
  if(st.labels){tag('ground',x1,gy+(small?13:15),{align:'right',color:muted,sz:size-1});
   if(name)tag(name,x0,win.top+(small?12:15),{color:muted,weight:700,sz:size-1});}
  ctx.restore();};
 const rocket=(x,a,burn,flash)=>{ctx.save();ctx.globalAlpha=a;drawRocket(ctx,x,ry,r,1,burn,T,true);
  ctx.beginPath();ctx.arc(x,lampY,5,0,TAU);ctx.fillStyle='#fde68a';ctx.fill();ctx.strokeStyle='rgba(120,80,0,.6)';ctx.lineWidth=1;ctx.stroke();
  if(flash>0)glow(x,lampY,6+5*flash,flash);ctx.restore();};
 // The glowing light-speed wall: a tall bright-amber bar at a point on the track, with its glow.
 const wall=wx=>{ctx.save();const top=win.top+(small?8:12), bot=gy, g=ctx.createLinearGradient(wx-11,0,wx+11,0);
  g.addColorStop(0,rgba(light,0));g.addColorStop(.5,rgba(light,.6));g.addColorStop(1,rgba(light,0));
  ctx.fillStyle=g;ctx.fillRect(wx-11,top,22,bot-top);ctx.fillStyle='#fcd34d';ctx.fillRect(wx-2,top,4,bot-top);
  if(st.labels)tag('light speed',wx-(small?8:10),top+(small?9:12),{align:'right',color:light,weight:700});ctx.restore();};
 if(plan.mode==='lamp'){
  // As the rocket passes the lamp post, its own lamp and the post's lamp flash together; both flashes travel at light
  // speed, side by side, and the rocket falls behind.
  frame(plan.dim,'');
  const since=T-plan.flash, burst=since>=0?clamp(1-since/.35):0;
  ctx.save();ctx.globalAlpha=plan.dim;ctx.fillStyle='rgba(205,214,248,.5)';ctx.fillRect(lampX-2,head,4,gy-head);
  ctx.beginPath();ctx.arc(lampX,head,5.5,0,TAU);ctx.fillStyle='#fde68a';ctx.fill();ctx.strokeStyle='rgba(120,80,0,.6)';ctx.lineWidth=1;ctx.stroke();ctx.restore();
  if(burst>0)glow(lampX,head,6+5*burst,burst);
  const rx=lampX+.5*c*since;
  if(rx>x0-r&&rx<x1+r)rocket(rx,clamp((rx-x0+r)/30)*clamp((x1-rx)/30),false,burst);
  const travel=(x1-lampX)/c;
  if(since>.05&&since<travel+.4){const px=Math.min(x1,lampX+c*since), fade=clamp((travel+.4-since)/.4);
   ctx.save();ctx.globalAlpha=fade;
   // Faint trails back to the post show that both flashes left it together.
   for(const y of [lampY,head]){const g=ctx.createLinearGradient(lampX,0,px,0);g.addColorStop(0,rgba(light,0));g.addColorStop(1,rgba(light,.45));
    trace(ctx,[[lampX,y],[px,y]]);ctx.strokeStyle=g;ctx.lineWidth=3;ctx.stroke();}
   glow(px,lampY,6);glow(px,head,6);
   ctx.setLineDash([3,4]);trace(ctx,[[px,lampY+7],[px,head-7]]);ctx.strokeStyle=rgba(light,.6);ctx.lineWidth=1.2;ctx.stroke();ctx.setLineDash([]);
   // The label rides beside the flashes, and switches to their left side where the stage ends.
   ctx.font=`600 ${size}px ${FONT}`;const right=px+16+ctx.measureText('same speed').width<x1;
   if(st.labels)tag('same speed',right?px+10:px-10,(ry+r*.9+head)/2,{align:right?'left':'right',color:light});ctx.restore();}
 }
 if(plan.mode==='crew'){
  // Seen from the rocket: the crew stay put while the ground streams backward at the rocket's speed. Their lamp flashes
  // once and the flash pulls away at light speed; after another push the ground streams faster, and the same flash
  // still pulls away at exactly the same speed.
  frame(1,'seen from the rocket');
  const rx=x0+lane*.16, ramp=.6, g0=.5*c, g1=Physics.limitSpeed(2)*c, go=T-plan.push;
  const back=g0*T+(go<=0?0:go<ramp?(g1-g0)*go*go/(2*ramp):(g1-g0)*(ramp/2+go-ramp)), gap=lane/7;
  for(let k=0;k<7;k++){const px=x0+((k*gap-back)%lane+lane)%lane;ctx.fillStyle='rgba(200,210,245,.4)';ctx.fillRect(px-1.5,gy-16,3,16);}
  const since=T-plan.first, burst=since>=0?clamp(1-since/.35):0;
  if(since>.05){const px=Math.min(x1,rx+c*since), fade=clamp((x1+4-px)/40);
   ctx.save();ctx.globalAlpha=fade;const g=ctx.createLinearGradient(rx,0,px,0);g.addColorStop(0,rgba(light,0));g.addColorStop(1,rgba(light,.45));
   trace(ctx,[[rx,lampY],[px,lampY]]);ctx.strokeStyle=g;ctx.lineWidth=3;ctx.stroke();glow(px,lampY,6);
   if(st.labels&&px>rx+50){ctx.font=`600 ${size}px ${FONT}`;const half=ctx.measureText('full light speed').width/2+6;
    tag('full light speed',clamp(px,x0+half,x1-half),lampY-(small?14:17),{align:'center',color:light});}
   ctx.restore();}
  rocket(rx,1,go>0&&go<ramp,burst);
 }
 if(plan.mode==='add'||plan.mode==='climb'||plan.mode==='live'||plan.mode==='thumb'){
  const wallFrac=plan.mode==='add'?.62:1, wallX=x0+lane*wallFrac, span=wallX-x0;
  // Speed to a point on the track. Chapters 4/live use a fixed square-root scale that spreads the near-wall speeds, so
  // the shrinking leaps stay visible and the rocket only ever advances towards the wall, never back. Chapter 1 stays
  // linear so the everyday-adding ghost can sail past the wall.
  const noseX=plan.mode==='add'?s=>wallX-span*(1-s):s=>wallX-span*Math.sqrt(Math.max(0,1-s));
  const v=plan.mode==='add'?.5*clamp(plan.n):plan.mode==='thumb'?.62:Physics.limitSpeed(Math.max(0,plan.n||0));
  frame(1,'');
  // The rail the rocket rides, from rest to the wall.
  const railY=ry+r*.7;trace(ctx,[[x0,railY],[wallX,railY]]);ctx.strokeStyle='rgba(200,210,245,.24)';ctx.lineWidth=2;ctx.stroke();
  wall(wallX);
  if(plan.mode==='add'&&plan.everyday>0){
   // Just adding up: equal leaps of half light speed each, reaching the wall on the second and sailing past it on the third.
   const e=clamp(plan.everyday), vLead=.5+e;
   ctx.save();ctx.globalAlpha=.7;ctx.setLineDash([6,6]);trace(ctx,[[x0,ry],[noseX(vLead),ry]]);ctx.strokeStyle='rgba(185,196,235,.55)';ctx.lineWidth=1.6;ctx.stroke();ctx.setLineDash([]);
   for(const vk of [.5,1,1.5])if(vLead+1e-6>=vk){const gx=noseX(vk);ctx.beginPath();ctx.arc(gx,ry,5.5,0,TAU);ctx.fillStyle='rgba(10,14,32,.9)';ctx.fill();ctx.strokeStyle='rgba(205,214,248,.7)';ctx.lineWidth=1.6;ctx.stroke();}
   drawRocket(ctx,noseX(vLead)-r*.85,ry,r*.85,1,e>0&&e<1,plan.t,true);
   if(st.labels)tag('just adding up',x0,ry-r-(small?10:14),{color:muted});ctx.restore();}
  const rx=clamp(noseX(v)-r,x0,wallX-r-3);
  drawRocket(ctx,rx,ry,r,1,plan.burn,plan.t,true);
  if(plan.mode==='climb'){
   // The near-wall speeds are shown spread out, so name it a closer look at the wall.
   if(st.labels)tag('closer look',wallX-(small?8:10),win.top+(small?28:34),{align:'right',color:muted,sz:size-1});
   // One flame glyph per push, all the same size: equal effort, while the leaps toward the wall shrink.
   const pushes=clamp(Math.ceil(plan.n-1e-6),1,6), fy=h*.63, step=small?22:30, gw=small?8:11, gx0=x0+gw+(small?4:8);
   for(let k=0;k<pushes;k++){const fx=gx0+k*step, fl=ctx.createLinearGradient(fx-gw,0,fx+gw,0);fl.addColorStop(0,'rgba(255,186,84,.98)');fl.addColorStop(1,'rgba(255,130,40,.25)');
    ctx.beginPath();ctx.moveTo(fx+gw,fy);ctx.quadraticCurveTo(fx-gw*.3,fy-gw*.8,fx-gw,fy);ctx.quadraticCurveTo(fx-gw*.3,fy+gw*.8,fx+gw,fy);ctx.closePath();ctx.fillStyle=fl;ctx.fill();}
   if(st.labels)tag('equal pushes',gx0-gw,fy-(small?16:20),{color:muted});}
  if(st.labels&&v>.02)tag(limitPct(v),clamp(rx,x0+26,x1-26),ry+r+(small?15:18),{align:'center',color:accent,weight:700,sz:size+1});
 }
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
 const c=st.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since??0);
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
// You, standing on the hilltop seen from behind, looking out at the stars: one solid silhouette with the arms hanging
// close to the body. The head sits where the sight lines meet; a faint rim of skylight traces the outline.
function nightPerson(ctx,x,feet,s,col,rim){
 const cx=x-s*.09, P=(dx,dy)=>[cx+dx*s,feet+dy*s];
 const shape=grow=>{const g=grow/2;
  // Torso and shorts: sloping shoulders, a slimmer waist.
  ctx.beginPath();ctx.moveTo(...P(-.17,-.7));
  ctx.bezierCurveTo(...P(-.18,-.77),...P(-.12,-.8),...P(-.05,-.81));ctx.lineTo(...P(.05,-.81));
  ctx.bezierCurveTo(...P(.12,-.8),...P(.18,-.77),...P(.17,-.7));
  ctx.quadraticCurveTo(...P(.13,-.58),...P(.13,-.47));ctx.lineTo(...P(.15,-.31));ctx.lineTo(...P(-.15,-.31));ctx.lineTo(...P(-.13,-.47));
  ctx.quadraticCurveTo(...P(-.13,-.58),...P(-.17,-.7));ctx.closePath();
  if(g){ctx.lineWidth=grow;ctx.lineJoin='round';ctx.stroke();}ctx.fill();
  // Legs, arms close to the body, and the neck.
  ctx.lineCap='round';
  const limb=(pts,width)=>{ctx.lineWidth=width+grow;trace(ctx,pts.map(q=>P(...q)));ctx.stroke();};
  limb([[-.07,-.33],[-.075,-.17],[-.07,-.03]],.11);limb([[.07,-.33],[.075,-.17],[.07,-.03]],.11);
  limb([[-.16,-.7],[-.18,-.56],[-.17,-.43]],.075);limb([[.16,-.7],[.18,-.56],[.17,-.43]],.075);
  limb([[0,-.8],[0,-.86]],.1);
  // Head, tipped slightly up.
  ctx.beginPath();ctx.ellipse(...P(0,-.935),s*.105+g,s*.12+g,0,0,TAU);ctx.fill();};
 ctx.save();
 if(rim){ctx.strokeStyle=rim;ctx.fillStyle=rim;shape(1.8);}
 ctx.strokeStyle=col;ctx.fillStyle=col;shape(0);ctx.restore();
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

// How Eratosthenes measured the Earth, in soft shaded spheres. At noon on the longest day the Sun stood overhead at
// Syene, so upright sticks cast no shadow there, while in Alexandria, 800 km north, a stick's shadow came in at about
// 7 degrees. Sunlight arrives parallel, so that is also the angle between the two sticks at the Earth's centre: one
// fiftieth of a circle, so the Earth is 50 times 800 km around (Physics.earthAngle, earthAround). The world has Syene
// at the origin and the ground curving away with curvature k (0 flat, 1 the real Earth, whose radius is the unit); u
// is the distance along the ground towards Alexandria. Sticks keep a fixed size on screen so their shadows show, and
// every angle is true. Chapter plan: Syene and its well; both cities; flat ground, then round again; the whole globe
// with the sticks meeting at its centre and Alexandria's shadow close up; fifty arcs around the globe; then a smaller
// Earth (the first control sets the curvature, 0.5 for the real Earth).
const ERA={angle:0,show:false};
// Land outlines (Natural Earth, public domain, simplified to half-degree steps; values are degrees times two).
const ERA_LAND=[[-90,-156,-87,-158,-90,-161,-93,-161,-97,-162,-101,-162,-106,-162,-108,-160,-104,-160,-101,-158,-97,-156,-93,-156,-90,-156],[-137,-142,-140,-145,-145,-145,-148,-145,-150,-143,-146,-142,-143,-141,-142,-138,-139,-139,-137,-141],[-117,-128,-120,-128,-123,-129,-125,-131,-127,-133,-130,-134,-131,-137,-128,-138,-125,-140,-123,-142,-122,-145,-123,-148,-127,-149,-129,-151,-132,-151,-137,-152,-140,-152,-144,-153,-148,-153,-151,-153,-154,-153,-151,-155,-147,-156,-150,-156,-153,-156,-156,-157,-154,-159,-151,-161,-146,-161,-143,-161,-140,-162,-136,-163,-131,-163,-127,-163,-123,-164,-119,-165,-116,-166,-111,-165,-107,-165,-103,-164,-100,-163,-95,-163,-90,-164,-86,-164,-82,-163,-76,-163,-73,-162,-69,-162,-65,-162,-60,-161,-57,-161,-59,-159,-63,-159,-67,-159,-71,-159,-71,-156,-68,-156,-64,-155,-60,-154,-55,-153,-52,-153,-48,-152,-45,-152,-42,-152,-38,-151,-35,-150,-31,-149,-31,-146,-27,-145,-23,-144,-18,-143,-15,-143,-12,-142,-9,-143,-6,-143,-1,-142,2,-143,6,-142,10,-141,13,-141,17,-140,20,-141,24,-141,27,-140,30,-141,34,-140,39,-140,43,-140,47,-141,50,-141,54,-141,58,-140,62,-140,66,-139,68,-137,71,-138,74,-138,77,-140,80,-138,84,-137,88,-137,91,-136,95,-135,98,-134,102,-134,104,-132,107,-132,111,-132,114,-132,116,-134,120,-135,123,-136,126,-136,130,-135,134,-136,138,-136,139,-139,136,-141,136,-144,140,-145,143,-143,146,-141,149,-140,153,-139,156,-138,160,-136,163,-135,166,-134,169,-134,174,-134,176,-132,178,-134,181,-134,185,-134,188,-134,192,-135,196,-134,199,-134,202,-133,206,-131,210,-133,214,-134,218,-134,222,-133,226,-132,229,-132,233,-133,237,-134,240,-135,243,-134,246,-133,250,-133,254,-133,258,-134,262,-133,266,-133,270,-132,273,-134,277,-134,280,-134,284,-134,289,-134,292,-134,295,-136,298,-137,303,-137,307,-138,310,-138,314,-139,318,-139,322,-140,325,-141,328,-141,332,-142,335,-142,339,-142,342,-143,340,-146,336,-148,332,-149,328,-151,327,-154,329,-156,333,-157,330,-158,327,-158,324,-158,321,-160,322,-163,325,-164,330,-165,333,-166,338,-167,345,-168,352,-168,357,-169,360,-169,360,-180,-360,-180,-360,-169,-355,-169,-352,-168,-349,-169,-346,-168,-340,-168,-337,-168,-334,-169,-328,-170,-324,-170,-316,-171,-310,-170,-302,-171,-297,-171,-292,-171,-286,-170,-294,-169,-300,-169,-307,-167,-305,-165,-309,-164,-314,-162,-309,-162,-304,-162,-301,-163,-298,-162,-294,-161,-296,-159,-299,-159,-303,-159,-307,-158,-311,-158,-315,-157,-317,-154,-314,-155,-311,-154,-307,-154,-303,-155,-300,-154,-297,-154,-292,-153,-290,-150,-286,-151,-283,-150,-280,-150,-275,-149,-270,-149,-267,-149,-262,-149,-259,-149,-256,-149,-251,-149,-248,-149,-245,-149,-242,-149,-239,-149,-235,-148,-232,-148,-228,-147,-226,-149,-223,-149,-220,-150,-217,-150,-212,-150,-207,-150,-204,-150,-201,-151,-203,-148,-206,-147,-203,-146,-198,-146,-195,-147,-190,-147,-187,-147,-183,-147,-180,-147,-178,-145,-175,-146,-172,-146,-168,-147,-165,-147,-161,-147,-156,-147,-152,-148,-148,-147,-143,-147,-140,-146,-136,-146,-134,-144,-136,-142,-137,-139,-135,-137,-135,-134,-132,-132,-129,-131,-126,-129,-123,-129,-120,-128,-117,-127,-114,-127,-117,-128],[-136,-108,-133,-109,-130,-109,-133,-110,-136,-111,-140,-110,-145,-109,-149,-106,-145,-107,-142,-108,-139,-105,-136,-106],[291,-82,294,-82,297,-82,296,-85,294,-87,291,-85,289,-82],[346,-82,348,-84,346,-86,343,-88,341,-92,337,-93,333,-92,337,-88,341,-86,343,-84,346,-81],[349,-72,351,-74,354,-76,357,-75,356,-78,354,-80,352,-83,349,-83,350,-80,348,-78,349,-75,348,-72,346,-70,349,-71],[100,-27,100,-30,100,-33,99,-36,97,-41,96,-45,95,-48,93,-50,90,-51,88,-49,87,-46,87,-43,89,-40,88,-37,89,-34,91,-32,94,-30,96,-28,98,-26],[287,-28,290,-29,291,-33,292,-36,295,-39,298,-41,299,-45,302,-47,304,-49,306,-51,306,-55,307,-58,306,-61,305,-65,303,-68,301,-70,300,-73,299,-76,295,-76,293,-78,290,-77,287,-78,284,-77,281,-76,280,-73,278,-71,276,-69,274,-71,275,-68,272,-70,270,-68,268,-66,266,-64,263,-63,259,-63,256,-64,252,-64,248,-66,246,-68,243,-68,240,-68,237,-69,233,-70,230,-68,232,-64,230,-61,229,-58,228,-55,227,-52,227,-49,228,-46,231,-43,233,-41,236,-41,239,-40,242,-39,244,-36,246,-33,249,-33,250,-30,252,-28,256,-29,259,-30,260,-27,262,-24,265,-24,269,-24,272,-24,273,-27,271,-29,273,-31,277,-34,280,-35,283,-33,283,-30,283,-27,284,-24,285,-21,286,-24,287,-27],[217,-14,221,-14,225,-14,229,-16,225,-17,221,-16,217,-15,213,-15,212,-12,215,-12,217,-14],[268,-2,269,-6,273,-5,275,-3,278,-4,282,-5,285,-7,289,-8,292,-10,295,-12,294,-15,297,-18,300,-19,302,-21,298,-21,294,-19,292,-16,289,-15,287,-18,284,-18,280,-17,275,-17,277,-15,277,-12,272,-9,267,-7,264,-6,268,-5,264,-4,261,-2,264,-1,268,-2],[250,3,247,0,242,1,240,-1,242,-3,247,-1,245,-3,245,-6,246,-9,244,-11,243,-8,242,-5,241,-8,241,-11,239,-9,238,-6,239,-3,240,0,242,3,246,2,250,3],[212,-12,209,-12,205,-8,203,-6,200,-1,198,2,195,5,193,8,191,10,195,10,198,7,201,4,205,3,208,0,209,-4,212,-6,212,-9,212,-12],[236,4,238,2,235,0,233,-3,232,-8,229,-7,224,-7,220,-6,220,-3,218,-1,218,3,221,3,223,5,226,6,228,9,231,11,233,14,235,12,238,11,236,8,236,5],[253,17,253,14,251,12,248,12,248,15,244,14,246,17,249,17,251,20,253,18],[243,37,245,34,243,32,243,29,248,28,248,25,246,27,242,27,241,30,240,33,241,37],[-145,40,-142,40,-138,39,-137,36,-140,37,-143,35,-146,36,-149,37,-145,37,-147,39],[-159,46,-156,45,-154,43,-151,42,-148,41,-151,40,-156,40,-157,43,-160,44,-164,44,-167,44,-170,44,-168,46,-165,46,-161,46],[282,74,281,70,278,69,274,69,272,67,270,69,267,69,264,68,263,63,260,63,259,67,262,68,265,71,269,71,273,75,278,76,280,79,281,82,284,80,282,76],[288,88,291,89,288,86,286,84,283,85,280,83,281,87,283,90,286,89],[-112,101,-110,99,-107,98,-105,95,-107,93,-108,96,-111,94,-115,95,-119,95,-117,98,-115,101,-113,103],[287,101,289,98,286,99,285,96,287,94,284,92,284,96,284,99,284,102,283,107,285,109,287,105,287,101],[-14,105,-17,103,-20,104,-18,106,-17,109,-13,110,-12,106],[-6,117,-8,115,-4,115,-6,112,-2,109,0,107,3,105,1,102,-2,102,-5,101,-9,101,-12,100,-9,102,-11,104,-8,105,-6,107,-10,110,-11,113,-12,116,-8,117],[-170,131,-166,130,-163,129,-160,127,-165,127,-168,127,-171,126,-174,127,-172,130],[-29,133,-27,130,-30,129,-36,127,-40,127,-46,128,-48,130,-44,130,-49,131,-47,133,-44,133,-41,131,-38,133,-32,133,-29,133],[-350,133,-344,134,-340,132,-345,131,-348,129,-352,130,-357,131,-360,132,-360,138,-355,136,-350,134],[-181,139,-178,139,-176,137,-175,134,-173,136,-171,138,-168,140,-165,139,-162,137,-163,134,-167,133,-172,133,-174,130,-177,128,-180,128,-182,126,-186,124,-188,122,-189,118,-186,118,-185,114,-182,115,-178,114,-175,112,-172,111,-167,110,-164,107,-163,104,-160,102,-157,105,-158,108,-156,110,-154,112,-155,116,-157,118,-155,120,-156,125,-151,125,-148,125,-143,123,-139,122,-139,118,-135,116,-132,118,-130,120,-125,116,-123,114,-121,112,-119,110,-116,110,-114,108,-111,104,-114,103,-118,102,-120,100,-123,100,-128,101,-131,101,-134,99,-137,98,-140,95,-137,97,-133,98,-130,98,-130,94,-126,91,-123,92,-121,94,-122,91,-127,89,-131,87,-129,91,-132,91,-136,89,-140,87,-142,85,-140,83,-144,83,-147,82,-144,82,-147,81,-150,78,-152,74,-152,77,-153,74,-151,71,-155,69,-158,67,-161,65,-163,63,-163,60,-161,57,-160,54,-161,50,-163,52,-165,55,-166,58,-168,60,-171,59,-173,61,-177,61,-179,59,-182,58,-185,59,-188,59,-191,57,-194,56,-195,53,-195,50,-196,46,-195,43,-193,40,-190,37,-187,37,-184,37,-182,39,-181,42,-177,43,-174,43,-175,39,-177,37,-177,34,-177,31,-174,32,-171,32,-168,31,-166,29,-167,26,-167,23,-166,20,-164,18,-161,18,-158,19,-155,18,-152,19,-150,22,-147,22,-144,24,-143,21,-143,18,-143,22,-140,23,-136,22,-132,21,-129,21,-126,21,-123,20,-121,17,-118,16,-116,14,-114,12,-110,12,-107,11,-104,9,-102,7,-101,4,-101,0,-97,0,-93,-2,-90,-3,-87,-5,-83,-6,-80,-6,-77,-7,-74,-10,-71,-10,-70,-13,-70,-18,-74,-22,-77,-26,-78,-31,-78,-34,-79,-37,-82,-42,-84,-45,-89,-47,-93,-48,-95,-50,-97,-52,-97,-56,-99,-58,-101,-62,-103,-64,-105,-66,-107,-68,-110,-70,-114,-69,-117,-68,-114,-71,-114,-74,-118,-77,-122,-78,-125,-78,-124,-81,-128,-82,-130,-84,-127,-85,-130,-87,-131,-90,-135,-91,-133,-94,-134,-97,-136,-100,-138,-104,-142,-106,-145,-107,-150,-105,-150,-102,-151,-97,-148,-94,-151,-93,-149,-88,-146,-89,-145,-85,-147,-87,-148,-84,-147,-80,-147,-77,-147,-74,-145,-71,-144,-68,-143,-65,-143,-62,-143,-58,-142,-55,-141,-51,-141,-47,-140,-43,-140,-40,-141,-37,-143,-35,-147,-33,-150,-31,-152,-29,-154,-24,-156,-21,-158,-17,-160,-14,-162,-12,-163,-9,-161,-7,-160,-4,-162,-2,-160,1,-158,3,-156,5,-154,8,-155,11,-156,14,-156,17,-159,18,-161,16,-164,16,-167,17,-169,19,-172,20,-172,23,-174,25,-176,27,-179,27,-182,28,-187,31,-191,32,-195,32,-198,33,-202,34,-204,36,-207,37,-210,39,-211,42,-211,45,-214,48,-217,50,-219,52,-221,54,-224,57,-226,60,-228,63,-229,60,-227,58,-225,55,-223,53,-221,50,-219,47,-222,48,-224,51,-226,53,-229,54,-228,57,-230,59,-233,62,-234,65,-236,67,-239,69,-243,72,-245,75,-247,78,-249,81,-248,84,-248,87,-248,91,-248,94,-249,97,-246,96,-250,100,-255,102,-256,105,-259,107,-261,109,-264,111,-267,114,-270,116,-273,116,-276,117,-280,119,-285,120,-288,120,-292,121,-296,121,-299,119,-303,118,-303,121,-301,123,-304,121,-308,119,-308,116,-311,115,-316,113,-319,111,-322,111,-326,109,-330,109,-326,111,-321,112,-317,114,-315,117,-318,117,-321,118,-324,117,-325,120,-328,120,-331,121,-331,124,-329,126,-326,126,-323,127,-322,130,-325,129,-330,129,-333,129,-336,131,-333,132,-329,133,-323,132,-327,134,-331,136,-334,137,-329,138,-326,139,-324,141,-318,142,-313,143,-310,142,-304,142,-301,141,-295,140,-291,140,-287,140,-284,140,-278,139,-275,138,-271,139,-266,139,-263,140,-260,140,-257,140,-252,139,-249,140,-246,139,-243,140,-240,139,-235,138,-232,138,-228,137,-231,136,-227,135,-222,136,-218,135,-216,137,-212,138,-209,136,-206,136,-203,135,-200,136,-197,136,-192,136,-189,136,-191,139,-193,142,-190,144,-186,143,-183,140],[-228,146,-225,146,-222,145,-218,145,-216,143,-217,146,-213,146,-210,143,-206,141,-202,140,-205,139,-208,138,-212,138,-218,138,-224,137,-227,137,-230,139,-235,140,-230,140,-227,140,-233,141,-236,141,-232,143,-235,143,-239,143,-237,145,-230,147],[-173,146,-170,147,-165,148,-161,145,-158,145,-151,144,-148,144,-144,143,-138,141,-134,138,-138,137,-133,136,-130,136,-127,134,-124,134,-128,130,-133,133,-136,133,-134,130,-131,129,-129,127,-133,126,-138,127,-135,126,-132,124,-138,125,-142,126,-147,128,-150,129,-155,128,-156,131,-152,131,-148,131,-145,135,-150,137,-154,138,-156,140,-159,140,-163,139,-170,140,-174,141,-177,141,-180,142,-179,146,-172,148],[-201,148,-198,147,-195,148,-193,145,-197,143,-200,143,-205,145,-201,145,-203,147],[-186,146,-189,144,-192,146,-189,148,-185,148,-181,148,-184,146],[-241,143,-246,142,-252,144,-250,146,-250,149,-243,149,-240,148,-235,148,-231,147,-234,146,-238,145,-241,144],[290,151,281,150,278,149,274,151,278,152,283,152,290,151],[-197,153,-195,151,-200,150,-205,151,-203,153,-200,153,-197,153],[-216,152,-212,152,-219,150,-224,149,-227,149,-224,150,-233,150,-231,153,-225,152,-222,151,-218,151,-221,153,-217,153],[115,141,107,142,103,143,105,146,109,147,112,149,116,151,122,153,129,153,132,154,136,154,129,151,123,151,117,149,114,147,111,145,115,141],[-189,154,-183,154,-180,152,-176,151,-173,151,-170,151,-166,152,-162,151,-164,149,-172,149,-176,149,-180,149,-185,150,-188,153,-192,153,-189,154],[-232,155,-234,153,-240,152,-243,152,-246,152,-242,154,-238,155,-235,155,-232,155],[214,154,222,153,227,152,220,149,224,148,227,147,231,148,238,147,246,146,251,147,254,147,257,146,259,142,263,142,265,144,268,143,271,143,275,143,280,143,278,145,281,146,299,144,306,142,314,142,318,142,319,139,322,139,325,139,328,139,332,139,336,139,339,137,342,138,347,140,351,140,357,139,360,138,360,130,357,129,359,126,355,125,349,124,344,122,341,121,338,121,333,120,330,119,327,120,324,116,326,112,323,111,321,109,320,106,317,106,314,102,312,106,311,111,312,114,314,116,317,116,320,119,324,121,327,122,329,125,325,123,320,121,319,124,313,123,308,120,310,118,306,118,303,118,300,119,297,118,291,119,284,118,278,114,270,109,273,109,276,108,280,108,283,106,281,102,280,97,277,94,274,90,271,88,267,86,262,85,259,83,257,80,255,78,258,75,259,71,256,70,253,69,252,73,251,76,251,79,246,79,242,78,244,81,239,80,236,78,238,76,242,76,245,75,242,73,239,71,241,67,244,63,243,60,243,56,241,54,239,51,237,49,235,47,232,46,228,44,224,43,221,41,217,43,213,41,211,38,213,36,215,33,218,31,219,27,218,23,214,21,210,17,210,20,207,21,205,24,202,25,200,27,199,22,198,18,201,17,202,14,204,12,207,10,207,7,208,3,205,4,203,6,201,8,200,11,199,14,197,17,197,20,198,23,197,26,196,30,194,34,191,31,188,32,189,35,187,39,185,41,184,44,181,46,179,44,176,43,174,41,170,39,168,37,166,35,164,33,161,32,160,28,160,24,160,21,158,19,156,17,153,18,152,21,151,24,149,28,147,32,146,36,146,41,142,42,138,44,136,47,134,49,129,50,126,50,123,50,119,51,115,51,114,54,111,54,107,54,103,56,100,60,97,60,97,57,99,55,100,52,102,50,104,48,107,48,109,50,112,52,114,48,117,47,119,45,118,42,116,40,114,38,111,36,108,34,105,33,102,30,99,29,96,28,93,27,90,26,87,25,87,28,85,30,86,33,84,36,82,39,80,41,78,43,77,47,75,49,73,52,71,55,70,58,68,56,65,60,65,57,67,55,68,52,70,50,71,46,73,44,74,40,75,37,78,34,80,31,82,29,85,27,87,25,85,23,88,21,91,21,95,22,98,23,101,23,101,18,99,14,97,11,95,8,93,6,91,4,88,2,84,-2,82,-4,80,-7,78,-9,77,-12,79,-14,78,-17,80,-20,81,-24,81,-28,81,-31,79,-33,75,-35,73,-37,70,-39,70,-43,71,-46,70,-49,66,-51,65,-55,64,-58,62,-60,60,-62,58,-64,56,-66,53,-67,50,-68,47,-68,43,-69,40,-70,37,-68,36,-65,35,-61,33,-57,30,-54,29,-51,29,-48,29,-45,27,-42,26,-39,24,-36,23,-33,24,-30,25,-27,27,-25,27,-21,26,-18,26,-15,24,-13,24,-10,22,-8,20,-6,18,-2,19,1,19,5,18,8,15,9,12,9,10,11,7,13,4,12,-1,11,-4,9,-7,10,-12,10,-15,9,-18,10,-22,12,-25,15,-26,18,-28,20,-30,22,-33,24,-33,27,-35,29,-33,31,-33,34,-33,38,-33,41,-34,44,-32,47,-30,49,-29,53,-26,55,-23,56,-21,58,-19,60,-19,64,-17,66,-14,68,-12,70,-10,72,-7,71,-4,70,0,72,3,73,6,74,10,74,13,74,17,74,20,74,22,71,20,69,22,67,25,66,28,65,31,63,36,62,39,61,40,64,43,66,46,65,50,64,53,63,57,62,60,63,63,63,66,62,69,62,70,66,72,69,72,72,69,74,65,72,61,73,57,73,54,75,54,78,55,81,58,81,62,82,65,83,70,84,74,83,77,82,81,82,83,84,81,86,77,89,73,90,76,92,78,94,75,94,72,93,70,91,73,91,70,90,67,89,65,91,63,93,59,91,57,87,55,85,58,83,55,82,53,80,51,82,47,81,47,78,48,75,46,73,43,74,42,77,40,79,39,83,37,85,34,86,30,88,28,90,25,91,25,88,28,86,30,84,34,82,37,81,34,81,34,78,32,76,31,79,29,81,26,83,22,85,20,88,17,88,13,86,9,87,6,86,4,82,1,81,-1,79,-1,75,-4,73,-7,73,-10,73,-13,74,-16,74,-18,77,-18,80,-18,83,-19,86,-16,87,-11,87,-7,87,-4,87,-2,92,-4,94,-9,96,-7,98,-3,97,-4,100,3,100,5,102,8,103,9,106,12,107,16,107,17,110,16,113,19,114,22,113,19,111,22,109,25,109,28,108,33,109,37,109,40,110,43,110,42,114,45,116,47,114,49,116,47,118,52,119,56,119,53,121,49,120,46,120,43,121,42,125,45,128,49,130,44,131,40,127,36,125,34,123,36,121,36,118,33,114,29,112,26,111,24,115,22,118,17,117,14,116,11,117,10,124,17,127,21,129,25,132,30,136,33,137,38,140,43,141,46,140,49,142,53,142,56,142,63,141,60,140,64,140,68,139,73,138,81,136,80,133,77,132,68,134,70,132,70,129,74,128,79,129,84,133,88,132,87,135,93,137,91,135,93,133,96,134,100,136,107,138,109,136,115,137,118,138,122,138,127,139,130,138,137,136,136,139,133,141,137,144,140,146,145,146,144,143,146,141,145,138,146,135,143,133,146,133,148,135,150,138,147,139,149,141,146,143,150,144,153,142,155,145,159,145,163,144,161,147,165,148,169,148,174,148,177,150,181,151,186,152,192,152,198,153,202,153,204,155,209,155,212,155,209,154,214,154],[37,159,43,158,38,157,35,155,32,154,28,155,22,158,26,160,30,159,34,160,37,159],[51,161,55,160,52,159,46,159,40,159,37,160,41,161,44,161,51,161],[200,158,196,158,190,158,187,159,182,161,188,162,192,163,196,161,200,160],[-174,159,-178,157,-182,156,-186,157,-190,159,-193,160,-191,162,-185,163,-182,161,-179,161,-176,161,-174,159],[-137,166,-132,166,-127,166,-124,165,-129,164,-134,163,-131,163,-136,162,-139,161,-142,160,-146,159,-154,159,-151,158,-153,156,-156,156,-160,154,-156,154,-161,152,-166,153,-172,153,-175,153,-179,153,-176,154,-170,155,-173,156,-176,157,-171,158,-174,161,-168,160,-164,161,-168,161,-175,161,-179,162,-183,163,-180,164,-174,165,-171,165,-166,165,-162,166,-159,166,-152,166,-146,166,-141,166,-137,166],[-54,167,-42,165,-45,165,-53,165,-64,164,-56,164,-50,164,-46,164,-41,163,-32,164,-26,163,-33,161,-40,160,-35,160,-38,159,-39,155,-43,153,-40,152,-39,149,-43,148,-47,147,-45,145,-49,145,-44,143,-47,141,-51,143,-53,140,-47,140,-50,139,-55,137,-61,136,-64,136,-68,133,-73,132,-77,131,-80,131,-81,128,-86,125,-86,122,-90,120,-93,122,-97,122,-100,125,-103,127,-105,130,-107,132,-106,137,-103,137,-102,140,-105,139,-109,139,-109,142,-103,141,-106,142,-110,143,-111,146,-115,149,-117,151,-123,152,-127,152,-132,152,-137,152,-143,154,-138,155,-134,155,-142,155,-147,156,-139,158,-131,159,-136,160,-127,162,-124,163,-121,164,-114,164,-108,164,-101,165,-96,164,-93,164,-89,163,-94,164,-87,166,-80,166,-77,167,-70,167,-54,167]];
// The globe as seen with Syene at the top and the meridian through Syene and Alexandria as its rim, north to the left:
// the visible face is centred on the equator at 57° W, over the Atlantic, with the Americas, Africa and Europe.
const ERA_VIEW=(()=>{const r=Math.PI/180, la=24.1*r, lo=32.9*r, up=[Math.cos(la)*Math.cos(lo),Math.cos(la)*Math.sin(lo),Math.sin(la)],
 north=[-Math.sin(la)*Math.cos(lo),-Math.sin(la)*Math.sin(lo),Math.cos(la)];return {up,right:north.map(v=>-v),out:[Math.sin(lo),-Math.cos(lo),0]};})();
function eraLand(ctx,gx,gy,R){
 const V=ERA_VIEW, r=Math.PI/180, dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
 ctx.save();ctx.beginPath();ctx.arc(gx,gy,R,0,TAU);ctx.clip();ctx.fillStyle='#9cbf7c';
 for(const ring of ERA_LAND){const pts=[];let seen=false;
  for(let i=0;i<ring.length;i+=2){const lo=ring[i]/2*r, la=ring[i+1]/2*r, q=[Math.cos(la)*Math.cos(lo),Math.cos(la)*Math.sin(lo),Math.sin(la)];
   let x=dot(q,V.right), y=dot(q,V.up);if(dot(q,V.out)<0){const m=Math.hypot(x,y)||1;x/=m;y/=m;}else seen=true;pts.push([gx+x*R,gy-y*R]);}
  // Land behind the globe is pressed onto its rim; outlines entirely behind are skipped.
  if(seen){trace(ctx,pts);ctx.closePath();ctx.fill();}}
 ctx.restore();}
const ERA_U=800/(40000/TAU);
function eraPlan(st){
 const c=st.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since??0);
 if(st.since===undefined)return {z:1,k:1,t:2,centre:1,inset:1,thumb:true,pulse:0};
 if(st.live||st.stage>=5)return {z:1,k:Physics.earthCurvature(st.mass),t:st.live?st.t||0:t,centre:1,inset:1,last:true,pulse:0};
 // 1: Syene alone; with the second sentence, no shadow; with the third, light reaches the water in the well.
 if(st.stage===0)return {z:0,focus:0,k:1,t,map:smooth(t/.8),town:1,syene:true,none:smooth((t-at(1)-.3)/.6),well:smooth((t-at(2)-.1)/1.2),pulse:1};
 // 2: the view slides over to show Alexandria too; with the first sentence's end the distance, with the second the angle.
 if(st.stage===1)return {z:0,focus:smooth((t-.3)/1.8),k:1,t,map:1,route:smooth((t-at(0)-.4)/1),town:1,dist:smooth((t-at(0)-1.8)/.6),angle:smooth((t-at(1)-.5)/.6),shadow:smooth((t-at(0)-2)/.6),none:1,pulse:0};
 // 3: the rays glow with the first sentence; the ground flattens with the second and curves again with the third.
 if(st.stage===2){const flat=smooth((t-at(1)+.4)/1.2)-smooth((t-at(2)-.2)/1.8);
  const glow=smooth(t/.8)*(1-smooth((t-at(1))/.8));
  const ghost=smooth((t-at(2)-1.8)/.8);
  return {z:0,focus:1,k:1-flat,flat,t,glow,pulse:glow,tag:t<at(1)?'':flat>.95?'flat ground':t>at(2)+1.6?'round Earth':'',angle:(1-flat)*(1-.7*ghost),ghost};}
 // 4: zoom out to the whole globe; with the second sentence the sticks reach the centre; with the third, Alexandria up close.
 if(st.stage===3)return {z:smooth((t-.4)/2.6),k:1,t,centre:smooth((t-at(1)-.4)/1.4),inset:smooth((t-at(2)-.3)/1),pulse:0};
 // 5: the arc between the cities, then fifty of them around the globe with the second sentence.
 // The wedge from chapter 4 stays while the first sentence counts slices of the circle.
 return {z:1,k:1,t,centre:1-smooth((t-at(1))/.6),slices:smooth((t-at(0)-.6)/1.2)*(1-.6*smooth((t-at(1))/.8)),arc:smooth((t-at(0)-.3)/.6),ring:clamp((t-at(1)-.2)/5.5),total:smooth((t-at(2)-.2)/.6),pulse:0};
}
// A small map of Egypt (a simplified outline and the Nile, from well-known coordinates), marking Syene and, with route,
// Alexandria and the way between them, so the close-up reads as a real place.
const ERA_EGYPT=[[25,31.6],[27.3,31.4],[29.9,31.2],[31.3,31.55],[32.3,31.3],[34.2,31.3],[34.9,29.5],[34.25,27.75],[33.5,28.6],[32.55,29.95],[32.65,29.2],[33.9,27.2],[35.6,23.9],[36.9,22],[25,22]];
const ERA_NILE=[[32.9,22],[32.9,24.09],[32.64,25.69],[32.72,26.16],[31.18,27.18],[30.75,28.1],[31.24,30.04],[30.6,30.7],[30.4,31.45]];
function eraMap(ctx,x,y,w,h,{route=0,alpha=1,labels,small}){
 ctx.save();ctx.globalAlpha=alpha;
 ctx.fillStyle='#bcd8ee';ctx.beginPath();ctx.roundRect(x,y,w,h,10);ctx.fill();ctx.strokeStyle='rgba(20,23,28,.2)';ctx.lineWidth=1;ctx.stroke();
 ctx.save();ctx.beginPath();ctx.roundRect(x,y,w,h,10);ctx.clip();
 const P=([lo,la])=>[x+w*(lo-24.2)/(37.6-24.2),y+h*(1-(la-21.3)/(32.3-21.3))];
 trace(ctx,ERA_EGYPT.map(P));ctx.closePath();ctx.fillStyle='#e9cf94';ctx.fill();ctx.strokeStyle='rgba(120,84,40,.55)';ctx.stroke();
 trace(ctx,ERA_NILE.map(P));ctx.strokeStyle='#3d7fc4';ctx.lineWidth=small?1.6:2.2;ctx.lineJoin='round';ctx.stroke();
 const sy=P([32.9,24.09]), al=P([29.92,31.2]), fs=small?9:11;
 if(route>0){ctx.save();ctx.globalAlpha=alpha*route;trace(ctx,[al,sy]);ctx.setLineDash([3,3]);ctx.strokeStyle='#c2410c';ctx.lineWidth=1.6;ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();ctx.arc(al[0],al[1],small?3:4,0,TAU);ctx.fillStyle='#c2410c';ctx.fill();if(labels)text(ctx,'Alexandria',al[0]+6,Math.max(al[1]-8,y+fs+3),{size:fs,weight:700,color:'rgba(20,23,28,.85)'});ctx.restore();}
 ctx.beginPath();ctx.arc(sy[0],sy[1],small?3:4,0,TAU);ctx.fillStyle='#c2410c';ctx.fill();
 if(labels){text(ctx,'Syene',sy[0]+7,sy[1]+3,{size:fs,weight:700,color:'rgba(20,23,28,.85)'});if(route<.5)text(ctx,'EGYPT',x+w*.32,y+h*.42,{align:'center',size:fs,weight:800,spacing:'1.5px',color:'rgba(120,84,40,.6)'});}
 ctx.restore();ctx.restore();}
function eraHouse(ctx,x,y,s){ctx.fillStyle='#d9b77e';ctx.strokeStyle='rgba(110,75,35,.7)';ctx.lineWidth=1.2;ctx.fillRect(x-s*.5,y-s*.62,s,s*.62);ctx.strokeRect(x-s*.5,y-s*.62,s,s*.62);
 ctx.fillStyle='#c9a46a';ctx.fillRect(x-s*.56,y-s*.68,s*1.12,s*.08);ctx.fillStyle='rgba(60,40,20,.75)';ctx.fillRect(x-s*.1,y-s*.3,s*.2,s*.3);ctx.fillRect(x-s*.36,y-s*.48,s*.14,s*.12);ctx.fillRect(x+s*.22,y-s*.48,s*.14,s*.12);}
function eraPalm(ctx,x,y,s){ctx.strokeStyle='#8a6a45';ctx.lineWidth=Math.max(2,s*.06);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+s*.12,y-s*.5,x+s*.05,y-s);ctx.stroke();
 ctx.strokeStyle='#5f8f4e';ctx.lineWidth=Math.max(2,s*.07);for(const a of [-2.6,-2,-1.3,-.7,-.2]){ctx.beginPath();ctx.moveTo(x+s*.05,y-s);ctx.quadraticCurveTo(x+s*.05+Math.cos(a)*s*.3,y-s+Math.sin(a)*s*.3-s*.06,x+s*.05+Math.cos(a)*s*.45,y-s+Math.sin(a)*s*.2+s*.1);ctx.stroke();}}
function drawEratosthenes(ctx,w,h,spec,st){
 const plan=eraPlan(st), small=w<520, accent=ACCENT[spec.accent]||ACCENT.blue, gold='#e8a33a', ink='rgba(20,23,28,.8)', size=small?10:12;
 const k=Math.max(0,plan.k), D=ERA_U, theta=k*D, deg=(theta*180/Math.PI).toFixed(1), labels=st.labels;
 ERA.angle=theta;ERA.show=!plan.thumb&&!plan.syene;
 // The camera: a close look at the ground (800 km across most of the stage) or the whole globe, zooming between them
 // about a point that moves with the widening view.
 const s0=(small?.62:.56)*w/D, s1=small?Math.min(w*.29,h*.23):h*.36;
 const s=Math.exp(Math.log(s0)+(Math.log(s1)-Math.log(s0))*plan.z), ws=clamp((1/s-1/s0)/(1/s1-1/s0));
 const R=k>1e-6?1/k:Infinity;
 const ground=u=>R<Infinity?[-Math.sin(k*u)/k,-(1-Math.cos(k*u))/k]:[-u,0], up=u=>[-Math.sin(k*u),Math.cos(k*u)];
 const V0=ground(D/2*(plan.focus??1)), C=[0,R<Infinity?-R:0], o0=[w/2,h*(small?.6:.64)], o1=small?[w/2,h*.46]:[w*.34,h*.54];
 const V=[V0[0]+(C[0]-V0[0])*ws,V0[1]+(C[1]-V0[1])*ws], o=[o0[0]+(o1[0]-o0[0])*ws,o0[1]+(o1[1]-o0[1])*ws];
 const X=([x,y])=>[o[0]+s*(x-V[0]),o[1]-s*(y-V[1])], rpx=s*R, [gx,gy]=X(C);
 // Where a ray falling straight down at screen x meets the ground, or passes beside the globe.
 const hitY=x=>{const xw=V[0]+(x-o[0])/s;if(!(R<Infinity))return o[1]+s*V[1];if(Math.abs(xw)>R)return h+20;return o[1]-s*(-R+Math.sqrt(R*R-xw*xw)-V[1]);};
 // Sunlight from straight above: a warm glow at the top and parallel rays, each with one bright pulse falling.
 const sun=ctx.createLinearGradient(0,0,0,h*.3);sun.addColorStop(0,'rgba(255,200,90,.26)');sun.addColorStop(1,'rgba(255,200,90,0)');ctx.fillStyle=sun;ctx.fillRect(0,0,w,h*.3);
 // Over the globe, straight above Syene, whose stick points at it.
 {ctx.save();const sx=plan.z<.5?w*.5:gx, sy=plan.z<.5?h*.075:h*.04, sr=h*(small?.04:.05)*(plan.z<.5?1:.7), halo=ctx.createRadialGradient(sx,sy,sr*.4,sx,sy,sr*3.2);
  halo.addColorStop(0,'rgba(255,214,120,.65)');halo.addColorStop(1,'rgba(255,214,120,0)');ctx.fillStyle=halo;ctx.fillRect(sx-sr*3.4,sy-sr*3.4,sr*6.8,sr*6.8);
  ctx.beginPath();ctx.arc(sx,sy,sr,0,TAU);ctx.fillStyle='#ffd166';ctx.fill();ctx.strokeStyle='rgba(222,128,20,.6)';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();}
 const gap=small?24:34, glow=plan.glow||0;
 for(let i=0,x=gap/2;x<w;i++,x+=gap){const y1=Math.min(h,hitY(x));if(y1<=0)continue;
  trace(ctx,[[x,0],[x,y1]]);ctx.strokeStyle=`rgba(232,163,58,${.22+.3*glow})`;ctx.lineWidth=1.3;ctx.stroke();
  const run=y1+30, y=((plan.t*(small?60:90)+i*53)%run)-15;
  if(plan.pulse>0&&y>0&&y<y1){trace(ctx,[[x,Math.max(0,y-12)],[x,Math.min(y1,y+6)]]);ctx.strokeStyle=`rgba(255,214,140,${.85*plan.pulse})`;ctx.lineWidth=2;ctx.stroke();}}
 if(!(rpx<4*w)){
  // Close up: the ground's surface, with the desert in cross-section below it.
  const span=w/s, mid=D/2*(plan.focus??1), pts=[];
  for(let i=0;i<=96;i++)pts.push(X(ground(mid-span+2*span*i/96)));
  trace(ctx,pts);ctx.lineTo(pts.at(-1)[0],h+2);ctx.lineTo(pts[0][0],h+2);ctx.closePath();
  const sand=ctx.createLinearGradient(0,o[1]-30,0,h);sand.addColorStop(0,'#ecd29c');sand.addColorStop(1,'#cfa968');ctx.fillStyle=sand;ctx.fill();
  trace(ctx,pts);ctx.strokeStyle='rgba(120,84,40,.6)';ctx.lineWidth=1.6;ctx.stroke();
 }else{
  // The globe: sea lit from straight above (the Sun is overhead at Syene), night underneath, and the desert around the
  // two cities as a band at the top.
  const sea=ctx.createRadialGradient(gx,gy-rpx*.55,rpx*.08,gx,gy,rpx*1.02);sea.addColorStop(0,'#a8d0f2');sea.addColorStop(.5,'#4a88c8');sea.addColorStop(1,'#1f4a80');
  ctx.beginPath();ctx.arc(gx,gy,rpx,0,TAU);ctx.fillStyle=sea;ctx.fill();
  eraLand(ctx,gx,gy,rpx);
  const a1=Math.PI/2-.2, a2=Math.PI/2+theta+.03;
  ctx.beginPath();ctx.arc(gx,gy,rpx,-a1,-a2,true);ctx.arc(gx,gy,rpx*.96,-a2,-a1,false);ctx.closePath();
  const desert=ctx.createLinearGradient(0,gy-rpx,0,gy-rpx*.88);desert.addColorStop(0,'#ecd29c');desert.addColorStop(1,'#d9b77a');ctx.fillStyle=desert;ctx.fill();
  const night=ctx.createLinearGradient(0,gy,0,gy+rpx);night.addColorStop(0,'rgba(8,16,36,0)');night.addColorStop(1,'rgba(8,16,36,.5)');
  ctx.beginPath();ctx.arc(gx,gy,rpx,0,TAU);ctx.fillStyle=night;ctx.fill();
  ctx.beginPath();ctx.arc(gx,gy,rpx+1.5,0,TAU);ctx.strokeStyle='rgba(150,200,255,.55)';ctx.lineWidth=3;ctx.stroke();
 }
 // Syene as a town on the Nile: houses, palms and the river, with a person by the stick. At noon on this day nothing
 // there casts a shadow.
 if(plan.town&&plan.z<.5){const at=u=>X(ground(u)), Lt=h*(small?.28:.4);
  const [n0,ny]=at(-(small?.46:.56)*D), [n1]=at(-(small?.62:.74)*D), nx=Math.min(n0,n1), nw=Math.min(Math.abs(n1-n0),w-8-nx);
  if(nx<w){ctx.fillStyle='#3d7fc4';ctx.beginPath();ctx.roundRect(nx,ny-2,nw,small?9:13,4);ctx.fill();ctx.fillStyle='rgba(255,255,255,.55)';ctx.fillRect(nx+4,ny,nw-8,2);
   ctx.strokeStyle='#5f8f4e';ctx.lineWidth=1.6;ctx.lineCap='round';for(const ex of [nx-2,nx+nw+2])for(let k=-2;k<=2;k++){ctx.beginPath();ctx.moveTo(ex+k*3,ny);ctx.lineTo(ex+k*3+(k%2)*2,ny-(small?9:14)+Math.abs(k)*2);ctx.stroke();}
   if(labels&&plan.syene)text(ctx,'Nile',nx+nw/2,ny+(small?24:30),{align:'center',size,weight:700,color:'#2f6aa8'});}
  const pieces=small?[[.44,'house',.48],[.62,'palm',.7],[-.44,'house',.48]]:[[.3,'house',.5],[.42,'palm',.8],[-.33,'house',.42],[-.42,'house',.55],[-.5,'palm',.9]];
  for(const [u,kind,f] of pieces){const [hx,hy]=at(u*D);if(hx<-60||hx>w+60)continue;kind==='house'?eraHouse(ctx,hx,hy,Lt*f):eraPalm(ctx,hx,hy,Lt*f);}
  const [px,py]=at(-.055*D);drawPerson(ctx,px,py,Lt*(small?.075:.07),'#2b2f36');}
 // The well at Syene: a round stone rim with a rope and bucket above the ground, cut open below it, where sunlight
 // goes straight down onto the water.
 if(plan.town&&plan.z<.5){const [bx,by]=X(ground(-(small?.18:.16)*D)), ww=small?20:28, wd=small?h*.2:h*.24, lit=plan.well??1;
  const rim=small?14:20, rw=ww+(small?18:26), post=small?34:50;
  ctx.fillStyle='#b39c82';ctx.beginPath();ctx.roundRect(bx-rw/2,by-rim,rw,rim,[5,5,0,0]);ctx.fill();ctx.strokeStyle='rgba(70,50,30,.75)';ctx.lineWidth=1.2;ctx.stroke();
  for(let k=1;k<4;k++){trace(ctx,[[bx-rw/2+rw*k/4,by-rim],[bx-rw/2+rw*k/4,by]]);ctx.stroke();}trace(ctx,[[bx-rw/2,by-rim/2],[bx+rw/2,by-rim/2]]);ctx.stroke();
  ctx.strokeStyle='#6b4f32';ctx.lineWidth=small?2.5:3.5;ctx.lineCap='round';trace(ctx,[[bx-rw/2+4,by-rim],[bx-rw/2+4,by-rim-post]]);ctx.stroke();trace(ctx,[[bx+rw/2-4,by-rim],[bx+rw/2-4,by-rim-post]]);ctx.stroke();
  trace(ctx,[[bx-rw/2,by-rim-post],[bx+rw/2,by-rim-post]]);ctx.stroke();ctx.lineWidth=1.3;trace(ctx,[[bx+ww*.2,by-rim-post],[bx+ww*.2,by-rim-post*.42]]);ctx.stroke();
  ctx.fillStyle='#7a5a3a';ctx.beginPath();ctx.moveTo(bx+ww*.2-(small?6:8),by-rim-post*.42);ctx.lineTo(bx+ww*.2+(small?6:8),by-rim-post*.42);ctx.lineTo(bx+ww*.2+(small?4:6),by-rim-post*.42+(small?9:12));ctx.lineTo(bx+ww*.2-(small?4:6),by-rim-post*.42+(small?9:12));ctx.closePath();ctx.fill();
  ctx.fillStyle='#8a6a45';ctx.fillRect(bx-ww/2-4,by,ww+8,wd+5);
  const shaft=ctx.createLinearGradient(0,by,0,by+wd);shaft.addColorStop(0,'#3a2a1b');shaft.addColorStop(1,'#140d07');ctx.fillStyle=shaft;ctx.fillRect(bx-ww/2,by,ww,wd);
  trace(ctx,[[bx,0],[bx,by+wd-4]]);ctx.strokeStyle=`rgba(255,214,140,${.25+.65*lit})`;ctx.lineWidth=2;ctx.stroke();
  ctx.beginPath();ctx.ellipse(bx,by+wd-3,ww/2-2,3.5,0,0,TAU);ctx.fillStyle=lit>.05?`rgba(255,240,190,${.35+.6*lit})`:'#2f5d7c';ctx.fill();
  if(labels&&plan.syene&&lit>.5)text(ctx,'well',bx+ww/2+10,by+wd*.55,{size,weight:600,color:ink});}
 // A stick at ground distance u: standing straight up from the ground there; its shadow lies along the ground, as long
 // as the stick times the tangent of its lean.
 const Lc=h*(small?.28:.4), Ls=Lc+((small?18:26)-Lc)*ws;
 const stick=u=>{const [bx,by]=X(ground(u)), n=up(u), lean=k*u, tip=[bx+Ls*n[0],by-Ls*n[1]], sl=Ls*Math.tan(lean), end=[bx-sl*Math.cos(lean),by+sl*Math.sin(lean)];
  if(sl>.5){const c=Math.min(3,sl*.3);trace(ctx,[[bx-c*Math.cos(lean),by+c*Math.sin(lean)],end]);ctx.strokeStyle='rgba(20,23,28,.78)';ctx.lineWidth=ws>.5?(small?3:4):(small?5:6);ctx.lineCap='round';ctx.stroke();}
  trace(ctx,[[bx,by],tip]);ctx.strokeStyle='#3b2f2a';ctx.lineWidth=small?2.6:3.4;ctx.lineCap='round';ctx.stroke();
  return {base:[bx,by],tip,end,lean};};
 const syene=stick(0), alex=stick(D), onStage=p=>p[0]>-20&&p[0]<w+20;
 // The light that just passes Alexandria's stick, and the angle it makes with the stick.
 const angle=plan.z<.5?(plan.angle??0):0;
 if(angle>0&&alex.lean>1e-4&&onStage(alex.tip)){ctx.save();ctx.globalAlpha=angle;
  trace(ctx,[[alex.tip[0],0],alex.tip,alex.end]);ctx.strokeStyle='rgba(222,128,20,.95)';ctx.lineWidth=2;ctx.stroke();
  const r=Ls*.6;ctx.beginPath();ctx.moveTo(alex.tip[0],alex.tip[1]);ctx.arc(alex.tip[0],alex.tip[1],r,Math.PI/2-alex.lean,Math.PI/2);ctx.closePath();
  ctx.fillStyle=rgba(accent,.3);ctx.fill();ctx.strokeStyle=rgba(accent,.95);ctx.lineWidth=1.4;ctx.stroke();
  trace(ctx,[alex.base,alex.tip]);ctx.strokeStyle='#3b2f2a';ctx.lineWidth=small?2.6:3.4;ctx.lineCap='round';ctx.stroke();
  if(labels)pill(ctx,`${deg}°`,alex.tip[0]-10,alex.tip[1]+r*.7,{align:'right',size,weight:700,color:ink});ctx.restore();}
 if(labels&&plan.z<.5){
  if(onStage(syene.base))text(ctx,'SYENE',syene.base[0],syene.base[1]+(small?20:26),{align:'center',size,weight:700,spacing:'1.2px',color:ink});
  if(onStage(alex.base))text(ctx,'ALEXANDRIA',alex.base[0],alex.base[1]+(small?20:26),{align:'center',size,weight:700,spacing:'1.2px',color:ink});
  if(plan.none>.5&&onStage(syene.base))pill(ctx,'no shadow',syene.base[0]-12,syene.base[1]-(small?Lc*.45:14),{align:'right',size,weight:600,color:ink});
  if(plan.shadow>.5&&onStage(alex.end))pill(ctx,'shadow',alex.end[0]-12,alex.end[1]-12,{align:'right',size,weight:600,color:ink});
  if(plan.tag)pill(ctx,plan.tag,w*.5,plan.tag==='round Earth'?Math.min(h-14,hitY(w*.5)+(small?20:24)):hitY(w*.5)-(small?16:20),{align:'center',size:size+1,weight:700,color:ink});}
 // After the ground curves again, the flat ground stays as a faint dashed line, with Alexandria's stick as it would stand.
 if(plan.ghost>0){const [fx,fy]=X([-D,0]);ctx.save();ctx.globalAlpha=.55*plan.ghost;ctx.setLineDash([6,6]);
  trace(ctx,[[0,syene.base[1]],[w,syene.base[1]]]);ctx.strokeStyle=ink;ctx.lineWidth=1.3;ctx.stroke();
  trace(ctx,[[fx,fy],[fx,fy-Ls]]);ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);
  ctx.restore();if(labels&&plan.ghost>.5)pill(ctx,'flat',small?10:16,syene.base[1]-(small?12:14),{size,weight:700,color:ink});}
 // The distance between the cities, below the ground.
 if(plan.map>0&&plan.z<.5){const [mx,my,mw,mh]=small?[w*.66,h*.03,w*.31,h*.2]:[w*.02,h*.05,w*.17,h*.34];eraMap(ctx,mx,my,mw,mh,{route:plan.route||0,alpha:plan.map,labels,small});}
 if(plan.dist>0&&plan.z<.5){const y=Math.max(syene.base[1],alex.base[1])+(small?40:50);ctx.save();ctx.globalAlpha=plan.dist;
  trace(ctx,[[alex.base[0],y],[syene.base[0],y]]);ctx.strokeStyle=ink;ctx.lineWidth=1.4;ctx.stroke();
  for(const x of [alex.base[0],syene.base[0]]){trace(ctx,[[x,y-6],[x,y+6]]);ctx.stroke();}
  if(labels)pill(ctx,'800 km',(alex.base[0]+syene.base[0])/2,y,{align:'center',size,weight:700,color:ink});ctx.restore();}
 if(R<Infinity&&plan.z>.5){
  // The globe: the sticks extended to the Earth's centre, where they meet at the shadow's angle.
  if(plan.centre>0){ctx.save();ctx.globalAlpha=plan.centre;
   for(const b of [syene.base,alex.base]){trace(ctx,[b,[gx,gy]]);ctx.setLineDash([4,5]);ctx.strokeStyle='rgba(20,23,28,.55)';ctx.lineWidth=1.4;ctx.stroke();ctx.setLineDash([]);}
   const rw=Math.max(26,rpx*.3);ctx.beginPath();ctx.moveTo(gx,gy);ctx.arc(gx,gy,rw,-Math.PI/2-theta,-Math.PI/2);ctx.closePath();
   ctx.fillStyle=rgba(accent,.3);ctx.fill();ctx.strokeStyle=rgba(accent,.95);ctx.lineWidth=1.4;ctx.stroke();
   ctx.beginPath();ctx.arc(gx,gy,3.2,0,TAU);ctx.fillStyle=ink;ctx.fill();
   if(labels){pill(ctx,`${deg}°`,gx-rw*Math.sin(theta/2)-10,gy-rw*Math.cos(theta/2)-4,{align:'right',size,weight:700,color:ink});
    if(!plan.thumb)pill(ctx,'Earth’s centre',gx,gy+(small?16:20),{align:'center',size,weight:600,color:ink});}
   ctx.restore();}
  if(labels&&!small&&!plan.ring&&!plan.arc){text(ctx,'SYENE',syene.tip[0]+8,syene.tip[1]-2,{size,weight:700,spacing:'1.2px',color:ink});
   text(ctx,'ALEXANDRIA',alex.tip[0]-8,alex.tip[1]-2,{align:'right',size,weight:700,spacing:'1.2px',color:ink});}
  if(plan.last&&k>1.04){ctx.beginPath();ctx.arc(gx,gy,s1,0,TAU);ctx.setLineDash([5,6]);ctx.strokeStyle='rgba(20,23,28,.4)';ctx.lineWidth=1.4;ctx.stroke();ctx.setLineDash([]);}
  if(labels&&plan.last&&k>1.12){const m=(rpx+s1)/2;pill(ctx,'smaller Earth',gx+m*.7,gy+m*.7,{align:'center',size,weight:700,color:ink});
   pill(ctx,'our Earth',gx-s1-10,gy,{align:'right',size,weight:600,color:ink});}
  if(plan.slices>0){ctx.save();ctx.globalAlpha=plan.slices;ctx.strokeStyle=rgba(accent,.55);ctx.lineWidth=1;
   for(let i=0;i<50;i++){const b=Math.PI/2+i*theta;trace(ctx,[[gx,gy],[gx+rpx*Math.cos(-b),gy+rpx*Math.sin(-b)]]);ctx.stroke();}ctx.restore();}
  // Fifty arcs, each from Syene's distance to Alexandria's, go once around.
  if(plan.arc>0){const n=50*plan.ring, band=small?6:8, rr=rpx-band/2-1;ctx.save();ctx.lineCap='butt';
   for(let i=0;i<Math.min(50,Math.ceil(n-1e-9));i++){const b1=Math.PI/2+i*theta, b2=b1+theta*Math.min(1,n-i);
    ctx.beginPath();ctx.arc(gx,gy,rr,-b1,-b2,true);ctx.strokeStyle=i%2?rgba(accent,.45):rgba(accent,.9);ctx.lineWidth=band;ctx.stroke();}
   ctx.globalAlpha=plan.arc;ctx.beginPath();ctx.arc(gx,gy,rr,-Math.PI/2,-Math.PI/2-theta,true);ctx.strokeStyle=gold;ctx.lineWidth=band+2;ctx.stroke();ctx.globalAlpha=1;
   if(labels){if(plan.arc>.5){const top=Math.min(syene.tip[1],alex.tip[1]);if(small)pill(ctx,'800 km',gx+rpx*.14,gy-rpx-14,{size,weight:700,color:ink});else pill(ctx,'800 km',(syene.tip[0]+alex.tip[0])/2,top-16,{align:'center',size,weight:700,color:ink});}
    const say=plan.ring>0?`${Math.max(1,Math.min(50,Math.ceil(n-1e-9)))} × 800 km`:'';
    if(say)pill(ctx,say,gx,gy-(plan.total>0?(small?10:12):0),{align:'center',size:size+2,weight:700,color:ink});
    if(plan.total>.5)pill(ctx,'= 40,000 km',gx,gy+(small?14:18),{align:'center',size:size+2,weight:700,color:ink});}
   ctx.restore();}
 }
 // Alexandria up close: the stick stands straight, the sunlight slants in at the angle, and the shadow lies on the ground.
 if(plan.inset>0){ctx.save();ctx.globalAlpha=plan.inset;
  const [px,py,pw,ph]=small?[w*.06,h*.7,w*.88,h*.28]:[w*.64,h*.14,w*.31,h*.72];
  // A ring around Alexandria's stick on the globe; the close-up beside it carries the city's name.
  if(plan.z>.5){const [ax,ay]=alex.base;ctx.beginPath();ctx.arc(ax,ay,small?8:10,0,TAU);ctx.strokeStyle=rgba(accent,.9);ctx.lineWidth=1.6;ctx.stroke();}
  ctx.beginPath();ctx.roundRect(px,py,pw,ph,14);ctx.fillStyle='rgba(255,255,255,.86)';ctx.fill();ctx.strokeStyle='rgba(20,23,28,.12)';ctx.lineWidth=1;ctx.stroke();
  ctx.save();ctx.beginPath();ctx.roundRect(px,py,pw,ph,14);ctx.clip();
  const base=py+ph*.8, sx=px+pw*(small?.66:.62), L=ph*(small?.52:.5), sl=L*Math.tan(theta), tg=Math.tan(theta);
  ctx.fillStyle='#ecd29c';ctx.fillRect(px,base,pw,py+ph-base);trace(ctx,[[px,base],[px+pw,base]]);ctx.strokeStyle='rgba(120,84,40,.6)';ctx.lineWidth=1.4;ctx.stroke();
  const step=small?24:30;
  for(let j=-14;j<=14;j++){const xg=sx-sl+j*step, top=xg+(base-py)*tg;
   trace(ctx,[[top,py],[xg,base]]);ctx.strokeStyle=j?'rgba(232,163,58,.4)':'rgba(222,128,20,.95)';ctx.lineWidth=j?1.3:2;ctx.stroke();}
  trace(ctx,[[sx-2,base],[sx-sl,base]]);ctx.strokeStyle='rgba(20,23,28,.8)';ctx.lineWidth=small?6:8;ctx.lineCap='round';ctx.stroke();
  const r=L*.42;ctx.beginPath();ctx.moveTo(sx,base-L);ctx.arc(sx,base-L,r,Math.PI/2,Math.PI/2+theta);ctx.closePath();ctx.fillStyle=rgba(accent,.3);ctx.fill();ctx.strokeStyle=rgba(accent,.95);ctx.lineWidth=1.4;ctx.stroke();
  trace(ctx,[[sx,base],[sx,base-L]]);ctx.strokeStyle='#3b2f2a';ctx.lineWidth=small?3:4;ctx.stroke();
  if(labels){text(ctx,'ALEXANDRIA',px+14,py+(small?18:22),{size,weight:700,spacing:'1.2px',color:ink});
   pill(ctx,`${deg}°`,sx+10,base-L+r*.75,{size,weight:700,color:ink});}
  ctx.restore();ctx.restore();}
}

// The Monty Hall problem, in flat line art: three doors, a car behind one and goats behind the others. You pick a
// door; the host, who knows where the car is, opens another with a goat and offers a switch, which wins two games in
// three (Physics.montyGames). Chapter plan: the game; fifty-fifty against the true odds; the three equally likely
// cases; 300 games kept score; 100 doors; the 1990 column and its letters. After playback the viewer plays: pick a
// door, then stay or switch, with a running score (MONTY_TOUCH).
const MONTY={mode:'',doors:null,game:{seq:0,phase:'pick',pick:-1,open:-1,final:-1,at:0},score:{stay:[0,0],swap:[0,0]}};
const montyCarAt=seq=>Math.min(2,Math.floor(hash(seq*9.7+1.3)*3)), MONTY_SAMPLE=1068;
function montyPlan(st){
 const c=st.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since??0);
 if(st.since===undefined)return {mode:'game',pick:1,open:1,arrow:1,thumb:true};
 if(st.live)return {mode:'live',t:st.t||0};
 // 1: the doors; with the second sentence you pick door 1 and the host opens door 3; with the third, the offer.
 if(st.stage===0)return {mode:'game',pick:smooth((t-at(1)-.2)/.5),open:smooth((t-at(1)-1.8)/.8),arrow:smooth((t-at(2)-.2)/.6)};
 // 2: fifty-fifty is tempting; with the second sentence the true odds.
 if(st.stage===1)return {mode:'game',pick:1,open:1,arrow:0,fifty:smooth((t-at(0)-.4)/.5)*(1-smooth((t-at(1)-.1)/.4)),odds:smooth((t-at(1)-.3)/.6)};
 // 3: the three cases, one at a time with the sentences.
 if(st.stage===2)return {mode:'cases',first:smooth((t-at(0)-.3)/.5),others:smooth((t-at(1)-.3)/.5),reveal:smooth((t-at(2)-.3)/.8)};
 // 4: 300 games fill in through the chapter; each sentence points at its column.
 if(st.stage===3)return {mode:'many',n:Math.floor(300*clamp((t-at(0)-.6)/Math.max(3,at(2)-at(0)))),stay:smooth((t-at(1)-.2)/.5),swap:smooth((t-at(2)-.2)/.5)};
 // 5: a hundred doors: your pick, 98 opened, then the one left shut.
 if(st.stage===4)return {mode:'hundred',pick:smooth((t-at(0)-.5)/.5),opened:98*clamp((t-at(1)-.4)/3.2),final:smooth((t-at(2)-.2)/.6)};
 // 6: the column, the letters, and the answer.
 return {mode:'letters',page:smooth((t-at(0)-.2)/.6),letters:clamp((t-at(1)-.2)/3),right:smooth((t-at(2)-.3)/.6)};
}
function montyCar(ctx,x,y,s){
 const body='#e4572e', glass='#cfe3f2', dark='#2b2f36';
 ctx.save();ctx.translate(x,y);ctx.lineWidth=Math.max(1.2,s*.03);ctx.strokeStyle=dark;ctx.lineJoin='round';
 ctx.beginPath();ctx.moveTo(-s*.42,s*.02);ctx.lineTo(-s*.4,-s*.12);ctx.lineTo(-s*.2,-s*.15);ctx.lineTo(-s*.1,-s*.3);ctx.lineTo(s*.16,-s*.3);ctx.lineTo(s*.27,-s*.15);ctx.lineTo(s*.42,-s*.12);ctx.lineTo(s*.44,s*.02);ctx.closePath();ctx.fillStyle=body;ctx.fill();ctx.stroke();
 ctx.beginPath();ctx.moveTo(-s*.15,-s*.16);ctx.lineTo(-s*.07,-s*.26);ctx.lineTo(s*.13,-s*.26);ctx.lineTo(s*.21,-s*.16);ctx.closePath();ctx.fillStyle=glass;ctx.fill();ctx.stroke();
 for(const wx of [-s*.24,s*.26]){ctx.beginPath();ctx.arc(wx,s*.03,s*.09,0,TAU);ctx.fillStyle=dark;ctx.fill();ctx.beginPath();ctx.arc(wx,s*.03,s*.035,0,TAU);ctx.fillStyle='#d9dde3';ctx.fill();}
 ctx.restore();}
function montyGoat(ctx,x,y,s){
 const coat='#f3efe6', horn='#8a7a63', dark='#2b2f36';
 ctx.save();ctx.translate(x,y);ctx.lineWidth=Math.max(1.2,s*.03);ctx.strokeStyle=dark;ctx.lineCap='round';ctx.lineJoin='round';
 for(const lx of [-s*.2,-s*.1,s*.1,s*.2]){trace(ctx,[[lx,-s*.02],[lx,s*.13]]);ctx.stroke();}
 trace(ctx,[[-s*.27,-s*.15],[-s*.33,-s*.24]]);ctx.stroke();
 ctx.beginPath();ctx.ellipse(0,-s*.1,s*.28,s*.13,0,0,TAU);ctx.fillStyle=coat;ctx.fill();ctx.stroke();
 // Neck, a long head with a beard, an ear, and two horns curving back.
 ctx.beginPath();ctx.moveTo(s*.18,-s*.18);ctx.lineTo(s*.26,-s*.32);ctx.lineTo(s*.34,-s*.3);ctx.lineTo(s*.26,-s*.12);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.beginPath();ctx.moveTo(s*.24,-s*.34);ctx.quadraticCurveTo(s*.34,-s*.38,s*.43,-s*.27);ctx.quadraticCurveTo(s*.4,-s*.22,s*.32,-s*.24);ctx.closePath();ctx.fill();ctx.stroke();
 trace(ctx,[[s*.41,-s*.25],[s*.4,-s*.16]]);ctx.stroke();
 ctx.strokeStyle=horn;ctx.lineWidth=Math.max(1.6,s*.04);
 for(const o of [0,s*.05]){ctx.beginPath();ctx.moveTo(s*.27+o,-s*.36);ctx.quadraticCurveTo(s*.22+o,-s*.5,s*.12+o,-s*.46);ctx.stroke();}
 ctx.strokeStyle=dark;ctx.lineWidth=Math.max(1.2,s*.03);trace(ctx,[[s*.22,-s*.34],[s*.15,-s*.36]]);ctx.stroke();
 ctx.beginPath();ctx.arc(s*.33,-s*.31,s*.014,0,TAU);ctx.fillStyle=dark;ctx.fill();
 ctx.restore();}
// One door: the doorway shows what is behind it, and the door swings open on its left hinge as open goes from 0 to 1.
function montyDoor(ctx,x,y,w,h,{open=0,item='goat',pick=0,ghost=0,accent,colour='#3d6fb6'}){
 ctx.fillStyle='#fbf7f0';ctx.fillRect(x,y,w,h);
 const icon=(a)=>{ctx.save();ctx.globalAlpha=a;(item==='car'?montyCar:montyGoat)(ctx,x+w/2,y+h*.66,w*.86);ctx.restore();};
 if(open>0)icon(Math.min(1,open*1.5));
 const dw=w*(1-.84*open);
 if(dw>.5){ctx.fillStyle=colour;ctx.fillRect(x,y,dw,h);
  ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=1.4;if(dw>w*.3){ctx.strokeRect(x+dw*.16,y+h*.08,dw*.68,h*.36);ctx.strokeRect(x+dw*.16,y+h*.52,dw*.68,h*.4);}
  ctx.beginPath();ctx.arc(x+dw*.84,y+h*.52,Math.max(1.5,w*.035),0,TAU);ctx.fillStyle='#f2c14e';ctx.fill();}
 if(ghost>0&&open<.5){const a=ghost*(1-open*2);ctx.save();ctx.globalAlpha=a*.9;ctx.fillStyle='#fbf7f0';ctx.beginPath();ctx.roundRect(x+w*.08,y+h*.42,w*.84,h*.42,w*.08);ctx.fill();ctx.restore();icon(Math.min(1,a*1.6));}
 ctx.strokeStyle='#2b2f36';ctx.lineWidth=1.6;ctx.strokeRect(x,y,w,h);
 if(pick>0){ctx.save();ctx.globalAlpha=pick;ctx.strokeStyle=accent;ctx.lineWidth=Math.max(3,w*.05);ctx.strokeRect(x-5,y-5,w+10,h+10);ctx.restore();}
}
function drawMonty(ctx,w,h,spec,st){
 const plan=montyPlan(st), small=w<520, accent=ACCENT[spec.accent]||ACCENT.blue, ink='rgba(20,23,28,.82)', size=small?11:13, labels=st.labels;
 const win='#2f9e6f', lose='rgba(20,23,28,.18)';
 MONTY.mode=plan.mode;MONTY.doors=null;
 const L=(s,x,y,o={})=>labels&&text(ctx,s,x,y,{align:'center',size,weight:700,color:ink,...o});
 const P=(s,x,y,o={})=>labels&&pill(ctx,s,x,y,{align:'center',size,weight:700,color:ink,...o});
 // Three big doors in a row.
 const row=(open,{pick=-1,pickA=0,car=1,openDoor=2,ghost=0,top=h*.16,dh=h*(small?.42:.52)}={})=>{
  const dw=Math.min(dh/1.7,w*(small?.24:.15)), gap=dw*.45, x0=w/2-(3*dw+2*gap)/2, doors=[0,1,2].map(i=>({x:x0+i*(dw+gap),y:top,w:dw,h:dh}));
  doors.forEach((d,i)=>{montyDoor(ctx,d.x,d.y,d.w,d.h,{open:typeof open==='function'?open(i):i===openDoor?open:0,item:i===car?'car':'goat',pick:i===pick?pickA:0,ghost,accent});L(String(i+1),d.x+d.w/2,d.y-(small?12:16));});
  return doors;};
 if(plan.mode==='game'){
  const doors=row(plan.open,{pick:0,pickA:plan.pick});
  if(plan.pick>.5)P('your pick',doors[0].x+doors[0].w/2,doors[0].y+doors[0].h+(small?18:24));
  if(plan.arrow>0){const a=doors[0], b=doors[1], y=a.y+a.h+(small?40:52);ctx.save();ctx.globalAlpha=plan.arrow;ctx.strokeStyle=accent;ctx.lineWidth=2.4;
   ctx.beginPath();ctx.moveTo(a.x+a.w*.6,y);ctx.quadraticCurveTo((a.x+b.x+b.w)/2,y+(small?18:24),b.x+b.w*.4,y);ctx.stroke();
   ctx.beginPath();ctx.moveTo(b.x+b.w*.4,y);ctx.lineTo(b.x+b.w*.4-9,y-5);ctx.lineTo(b.x+b.w*.4-7,y+7);ctx.closePath();ctx.fillStyle=accent;ctx.fill();
   P('switch?',(a.x+b.x+b.w)/2,y+(small?30:38),{color:accent});ctx.restore();}
  if(plan.fifty>0){ctx.save();ctx.globalAlpha=plan.fifty;P('50/50?',(doors[0].x+doors[0].w+doors[1].x)/2,doors[0].y-(small?30:40),{size:size+4});ctx.restore();}
  if(plan.odds>0){ctx.save();ctx.globalAlpha=plan.odds;const y=doors[0].y+doors[0].h+(small?44:58), bh=small?10:12;
   for(const [d,f,name] of [[doors[0],1/3,'stay 1/3'],[doors[1],2/3,'switch 2/3']]){ctx.fillStyle='rgba(20,23,28,.08)';ctx.fillRect(d.x,y,d.w,bh);ctx.fillStyle=f>.5?win:accent;ctx.fillRect(d.x,y,d.w*f,bh);
    ctx.strokeStyle='rgba(20,23,28,.35)';ctx.lineWidth=1;for(const k of [1,2]){trace(ctx,[[d.x+d.w*k/3,y-2],[d.x+d.w*k/3,y+bh+2]]);ctx.stroke();}
    P(name,d.x+d.w/2,y+bh+(small?16:20));}ctx.restore();}
  return;}
 if(plan.mode==='cases'){
  // Three equally likely cases, one per row: the car behind door 1, 2 or 3. You always pick door 1.
  const dh=h*(small?.16:.2), dw=dh/1.6, gap=dw*.35, rowsY=[h*.09,h*.38,h*.67], x0=w/2-(3*(dw+gap)+(small?104:140))/2;
  if(labels)text(ctx,'your pick',x0+dw/2,h*.05,{align:'center',size:size-1,weight:700,color:accent});
  rowsY.forEach((y,car)=>{const show=car===0?plan.first:plan.others;if(show<=0)return;ctx.save();ctx.globalAlpha=.25+.75*show;
   const host=car===0?1:[1,2].find(d=>d!==car);
   for(let i=0;i<3;i++)montyDoor(ctx,x0+i*(dw+gap),y,dw,dh,{open:i===host?plan.reveal:0,item:i===car?'car':'goat',pick:i===0?1:0,ghost:.45,accent});
   if(plan.reveal>.5){const winSwap=car!==0;P(winSwap?'switch wins':'switch loses',x0+3*(dw+gap)+(small?52:70),y+dh/2,{color:winSwap?win:'rgba(20,23,28,.6)'});}
   ctx.restore();});
  return;}
 if(plan.mode==='many'){
  // The same 300 games scored both ways: staying wins when your first pick hid the car; switching wins otherwise.
  const cols=20, rows=15, cell=Math.min(w*(small?.4:.3)/cols,h*.62/rows), gw=cols*cell, panels=[[w*.5-gw-(small?12:40),'stay',plan.stay,true],[w*.5+(small?12:40),'switch',plan.swap,false]];
  for(const [x,name,em,stayCol] of panels){let wins=0;
   for(let i=0;i<300;i++){const cx=x+(i%cols)*cell, cy=h*.16+Math.floor(i/cols)*cell;
    if(i<plan.n){const car=montyCarAt(i+MONTY_SAMPLE), won=stayCol?car===0:car!==0;if(won)wins++;ctx.fillStyle=won?(stayCol?accent:win):lose;}else ctx.fillStyle='rgba(20,23,28,.05)';
    ctx.fillRect(cx+1,cy+1,cell-2,cell-2);}
   L(name,x+gw/2,h*.1,{size:size+1});
   if(plan.n>0)P(`${wins} wins`,x+gw/2,h*.16+rows*cell+(small?18:24),{color:stayCol?accent:win,size:size+(em>.5?2:0)});}
  return;}
 if(plan.mode==='hundred'){
  // A hundred doors: your pick is the first; the car is behind door 64; the host opens all the others but that one.
  const cols=10, cell=Math.min(w*(small?.8:.36)/cols,h*.78/10), dw=cell*.72, dh=cell*.86, x0=w/2-cols*cell/2, y0=h*.08, carAt=63;
  const order=[...Array(100).keys()].filter(i=>i!==0&&i!==carAt).sort((a,b)=>hash(a*3.3)-hash(b*3.3));
  const opened=new Set(order.slice(0,Math.floor(plan.opened)));
  for(let i=0;i<100;i++){const x=x0+(i%cols)*cell+(cell-dw)/2, y=y0+Math.floor(i/cols)*cell;
   montyDoor(ctx,x,y,dw,dh,{open:opened.has(i)?1:0,item:i===carAt?'car':'goat',pick:i===0?plan.pick:(i===carAt?plan.final:0),accent:i===carAt?win:accent});}
  if(plan.pick>.5)P('your pick',x0+cell/2,y0-(small?10:14),{color:accent});
  if(plan.final>.5){const x=x0+(carAt%cols)*cell+(cell+dw)/2, y=y0+Math.floor(carAt/cols)*cell+dh/2, ex=x0+cols*cell+(small?4:12);
   if(!small){ctx.save();ctx.globalAlpha=plan.final;ctx.setLineDash([3,4]);ctx.strokeStyle=win;ctx.lineWidth=1.4;trace(ctx,[[x+3,y],[ex,y]]);ctx.stroke();ctx.restore();P('left shut',ex+8,y,{align:'left',color:win});}
   else P('left shut',w/2,y0+10*cell+14,{color:win});}
  return;}
 if(plan.mode==='letters'){
  // The 1990 column, then letters piling up, then the answer.
  const px=w*(small?.5:.3), py=h*(small?.27:.42), pw=w*(small?.3:.17), ph=pw*1.3;
  if(plan.page>0){ctx.save();ctx.globalAlpha=plan.page;ctx.fillStyle='#fffdf8';ctx.strokeStyle='#2b2f36';ctx.lineWidth=1.6;ctx.fillRect(px-pw/2,py-ph/2,pw,ph);ctx.strokeRect(px-pw/2,py-ph/2,pw,ph);
   ctx.fillStyle='#2b2f36';ctx.fillRect(px-pw/2,py-ph/2,pw,ph*.16);ctx.fillStyle='rgba(20,23,28,.18)';for(let i=0;i<5;i++)ctx.fillRect(px-pw*.38,py-ph*.24+i*ph*.08,pw*(i===4?.42:.76),ph*.03);
   montyDoor(ctx,px-pw*.36,py+ph*.2,pw*.2,ph*.24,{open:0,accent});montyDoor(ctx,px-pw*.1,py+ph*.2,pw*.2,ph*.24,{open:0,accent});montyDoor(ctx,px+pw*.16,py+ph*.2,pw*.2,ph*.24,{open:1,accent});
   ctx.restore();P('Parade, 1990',px,py-ph/2-(small?12:18));}
  const n=Math.floor(60*plan.letters), cx=small?w*.5:w*.66, base=small?h*.92:h*.8;
  for(let i=0;i<n;i++){const a=hash(i*1.7), b=hash(i*2.9), x=cx+(a-.5)*w*(small?.6:.34), y=base-Math.floor(i/12)*(small?10:14)-b*(small?18:24), ew=small?26:38, eh=ew*.62;
   ctx.save();ctx.translate(x,y);ctx.rotate((b-.5)*.6);ctx.fillStyle='#fffaf0';ctx.strokeStyle='#5b5f66';ctx.lineWidth=1.2;ctx.fillRect(-ew/2,-eh/2,ew,eh);ctx.strokeRect(-ew/2,-eh/2,ew,eh);
   trace(ctx,[[-ew/2,-eh/2],[0,eh*.08],[ew/2,-eh/2]]);ctx.stroke();ctx.restore();}
  if(n>0)P(`about ${Math.round(10000*plan.letters).toLocaleString('en-US')} letters`,cx,base-(small?58:84),{size:size+1});
  if(plan.right>0){ctx.save();ctx.globalAlpha=plan.right;P('she was right',small?w*.5:px,small?h*.62:py+ph/2+(small?18:26),{size:size+4,color:win});ctx.restore();}
  return;}
 // Live: play the game yourself.
 const g=MONTY.game, car=montyCarAt(g.seq), now=plan.t, since=now-g.at;
 const doors=row(i=>g.phase==='done'?(i===g.open?1:smooth(since/.6)):i===g.open?smooth(since/.6):0,{pick:g.phase==='pick'?-1:g.pick,pickA:1,car,ghost:0});
 MONTY.doors=doors;
 // Until the viewer's first tap, a bobbing hand shows that the doors are there to be tapped.
 if(g.seq===0&&g.phase==='pick'&&MONTY.score.stay[1]+MONTY.score.swap[1]===0){const d=doors[1];montyHand(ctx,d.x+d.w*.5,d.y+d.h*.62,Math.min(d.w*.55,small?48:72),now);}
 const say=g.phase==='pick'?'pick a door':g.phase==='decide'?'stay or switch?':g.final===car?'a car!':'a goat';
 P(say,w/2,doors[0].y+doors[0].h+(small?22:30),{size:size+2,color:g.phase==='done'?(g.final===car?win:ink):accent});
 const sc=MONTY.score, y=doors[0].y+doors[0].h+(small?52:66);
 P(`stay wins ${sc.stay[0]}/${sc.stay[1]}`,w/2-(small?72:110),y);P(`switch wins ${sc.swap[0]}/${sc.swap[1]}`,w/2+(small?72:110),y,{color:win});
}
// Playing the game directly: tap a door to pick it; the host opens a goat door; tap your door to stay or the other
// closed door to switch; tap again for a new game. The car's place changes from game to game.
const MONTY_TOUCH={hint:'pick a door, then stay or switch, and keep score over many games.',
 grab(w,h,spec,st,x,y){if(MONTY.mode!=='live'||!MONTY.doors)return null;const i=MONTY.doors.findIndex(d=>x>=d.x-6&&x<=d.x+d.w+6&&y>=d.y-6&&y<=d.y+d.h+6);
  return i>=0||MONTY.game.phase==='done'?{i,cursor:'pointer'}:null;},
 release(w,h,spec,st,x,y,hd,moved){if(moved)return null;const g=MONTY.game, car=montyCarAt(g.seq);
  if(g.phase==='done'){Object.assign(g,{seq:g.seq+1,phase:'pick',pick:-1,open:-1,final:-1,at:st.t});return {};}
  const i=hd.i;if(i<0)return null;
  if(g.phase==='pick'){const goats=[0,1,2].filter(d=>d!==i&&d!==car);Object.assign(g,{pick:i,open:goats[goats.length>1?Math.floor(hash(g.seq*5.3+2)*2):0],phase:'decide',at:st.t});return {};}
  if(g.phase==='decide'&&i!==g.open){const k=i===g.pick?'stay':'swap';MONTY.score[k][1]++;if(i===car)MONTY.score[k][0]++;Object.assign(g,{final:i,phase:'done',at:st.t});return {};}
  return null;}};

// Simpson's paradox, in bold colour fields: every patient of a real kidney-stone study is one tile, coloured when the
// treatment worked. Sorted by treatment, A worked for 78% and B for 83%; sorted by stone size as well, A wins for small
// stones and for large ones, because A was given mostly the hard large-stone cases (Physics.simpsonData). Chapter
// plan: the totals; the tiles slide into small and large stones; large stones; who got which treatment; the paradox.
function simpsonPlan(st){
 const c=st.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since??0);
 if(st.since===undefined||st.live)return {group:1,small:1,large:1,overall:1};
 if(st.stage===0)return {group:0,overall:smooth((t-at(1)-.2)/.6)};
 if(st.stage===1)return {group:smooth((t-at(0)-.3)/1.4),small:smooth((t-at(1)-.2)/.6)};
 if(st.stage===2)return {group:1,small:1,large:smooth((t-at(0)-.2)/.6),overall:smooth((t-at(2)-.2)/.6)};
 if(st.stage===3)return {group:1,small:1,large:1,hard:smooth((t-at(0)-.5)/.6),counts:smooth((t-at(0)-1.4)/.6)};
 return {group:1,small:1,large:1,hard:1,overall:smooth((t-at(0)-.2)/.6),whole:smooth((t-at(0)-.2)/.6)};
}
function drawSimpson(ctx,w,h,spec,st){
 const plan=simpsonPlan(st), small=w<520, D=Physics.simpsonData, labels=st.labels, ink='rgba(20,23,28,.82)', size=small?10:12;
 const colour={A:'#e4572e',B:'#2f6fb6'}, failC='rgba(20,23,28,.1)';
 const cols=25, ts=Math.min(w*(small?.4:.3)/cols,h*(small?.5:.66)/19), bw=cols*ts, gapX=small?w*.08:w*.1, top=h*(small?.2:.14), sectionGap=ts*1.6;
 const P=(s,x,y,o={})=>labels&&pill(ctx,s,x,y,{align:'center',size,weight:700,color:ink,...o});
 // Both blocks' large-stone parts start at the same height, so one pair of names serves both.
 const maxSm=Math.max(...['A','B'].map(k=>Math.ceil(D[k].small[1]/cols))), maxLg=Math.max(...['A','B'].map(k=>Math.ceil(D[k].large[1]/cols)));
 // Totals sit on one line under both columns, below a thin rule, so they read as whole-column totals.
 const totalY=(g=>g>.5?top+(maxSm+maxLg)*ts+sectionGap:top+14*ts)(plan.group||0)+(small?22:30);
 for(const [k,t] of [['A',0],['B',1]]){
  const x0=w/2+(t?gapX/2:-gapX/2-bw), d=D[k], sm=d.small, lg=d.large, smRows=Math.ceil(sm[1]/cols);
  // Every tile's place when sorted by treatment only (successes first) and by stone size as well.
  const tiles=[];
  for(const [g,[ok,n]] of [['small',sm],['large',lg]])for(let i=0;i<n;i++)tiles.push({g,ok:i<ok,gi:i});
  const okAll=sm[0]+lg[0];let oi=0,fi=0;
  for(const tl of tiles){const i=tl.ok?oi++:okAll+fi++, gy=tl.g==='small'?0:maxSm*ts+sectionGap;
   tl.a=[x0+(i%cols)*ts,top+Math.floor(i/cols)*ts];tl.b=[x0+(tl.gi%cols)*ts,top+gy+Math.floor(tl.gi/cols)*ts];}
  const lgTop=top+maxSm*ts+sectionGap, lgRows=Math.ceil(lg[1]/cols);
  // The hard cases, shaded, once the guide points at them.
  if(plan.hard>0){ctx.fillStyle=`rgba(20,23,28,${.07*plan.hard})`;ctx.fillRect(x0-6,lgTop-6,bw+12,lgRows*ts+12);}
  const g=plan.group||0;
  for(const tl of tiles){const x=tl.a[0]+(tl.b[0]-tl.a[0])*g, y=tl.a[1]+(tl.b[1]-tl.a[1])*g;ctx.fillStyle=tl.ok?colour[k]:failC;ctx.fillRect(x+.6,y+.6,ts-1.2,ts-1.2);}
  if(labels)text(ctx,k,x0+bw/2,top-(small?20:20),{align:'center',size:size+6,weight:800,color:colour[k]});
  const pct=v=>Math.round(v*100)+'%';
  if(plan.small>0){ctx.save();ctx.globalAlpha=plan.small;P(pct(sm[0]/sm[1]),x0+bw/2,top+Math.min(smRows,maxSm)*ts/2,{color:colour[k]});ctx.restore();}
  if(plan.large>0){ctx.save();ctx.globalAlpha=plan.large;P(pct(lg[0]/lg[1]),x0+bw/2,lgTop+lgRows*ts/2,{color:colour[k]});ctx.restore();}
  if(plan.counts>0){ctx.save();ctx.globalAlpha=plan.counts;P(`${lg[1]} patients`,x0+bw/2,lgTop+lgRows*ts+(small?12:16));ctx.restore();}
  const ov=plan.overall||0;
  if(plan.whole>0){ctx.save();ctx.globalAlpha=plan.whole;ctx.strokeStyle=colour[k];ctx.lineWidth=2;ctx.strokeRect(x0-9,top-9,bw+18,totalY-top-(small?8:12));ctx.restore();}
  if(ov>0&&!(plan.counts>0)){ctx.save();ctx.globalAlpha=ov;trace(ctx,[[x0,totalY-(small?12:16)],[x0+bw,totalY-(small?12:16)]]);ctx.strokeStyle='rgba(20,23,28,.3)';ctx.lineWidth=1;ctx.stroke();
   P(`overall ${pct(Physics.simpsonOverall(k))}`,x0+bw/2,totalY,{size:size+1});ctx.restore();}
  // Stone sizes named beside the first block.
  // Stone sizes named for each block: beside it on a wide stage, just above each part on a phone.
  if(labels&&g>.5&&!t){const ga=Math.min(1,(g-.5)*2);ctx.save();ctx.globalAlpha=ga;
   if(small){pill(ctx,'small stones',x0+4,top-9,{size,weight:700,color:ink});pill(ctx,'large stones',x0+4,lgTop-9,{size,weight:700,color:ink});}
   else{text(ctx,'small',x0-14,top+smRows*ts/2,{align:'right',size,weight:700,color:ink});text(ctx,'large',x0-14,lgTop+lgRows*ts/2,{align:'right',size,weight:700,color:ink});}
   ctx.restore();}
 }
}
// A simple pointing hand below the spot it taps, its index finger pointing up at the door, to show that the doors
// can be tapped: the finger, a rounded fist with three folded fingers along its top, and the thumb at its side.
function montyHand(ctx,x,y,s,t){
 const ph=t%1, press=Math.max(0,Math.sin(ph*Math.PI*2))*s*.1, skin='#f2c9a5', edge='rgba(110,62,35,.8)';
 // A ring spreads from the fingertip at each tap.
 if(ph<.5){ctx.beginPath();ctx.arc(x,y,s*(.12+ph*.7),0,TAU);ctx.strokeStyle=`rgba(255,255,255,${(1-ph*2)})`;ctx.lineWidth=Math.max(2.5,s*.045);ctx.stroke();}
 ctx.save();ctx.translate(x,y+s*.1-press);ctx.lineWidth=Math.max(1.4,s*.026);ctx.lineJoin='round';ctx.strokeStyle=edge;ctx.fillStyle=skin;
 const box=(x0,y0,w,h,r)=>{ctx.beginPath();ctx.roundRect(s*x0,s*y0,s*w,s*h,s*r);ctx.fill();ctx.stroke();};
 box(-.13,.42,.62,.56,.2);
 for(const [x0,h] of [[.36,.17],[.22,.2],[.08,.22]])box(x0,.36,.14,h,.07);
 ctx.save();ctx.translate(-s*.12,s*.62);ctx.rotate(-.5);box(-.08,-.06,.16,.34,.08);ctx.restore();
 box(-.09,0,.18,.58,.09);
 ctx.restore();}

// Why summer is warmer than winter, in bold colour fields. Chapters: Earth's yearly trip around the Sun, nearest in
// early January; the axis that leans 23 degrees and keeps pointing the same way, so the north leans toward the Sun in
// June and away in December; noon in Paris, the Sun high in June and low in December; one beam of sunlight of fixed
// width spread over about three times the ground by the low Sun; June's long day and December's short one, and the
// daily sunlight they add up to; the south leaning toward the Sun in December, so its seasons are opposite, and the
// small effect of distance. Numbers are Physics.noonSun, beamSpread, dayHours and dailySun for Paris at the solstices.
const SEASONS={show:false,angle:0};
// Earth's place on its orbit as an angle: 0 at the December solstice, a quarter turn per season.
const SEASON_AT={december:0,january:.22,march:Math.PI/2,june:Math.PI,july:Math.PI+.22};
function seasonEarth(ctx,x,y,r,sun,{tilt=0,axis=false,north=false}={}){
 const a=Math.atan2(sun[1]-y,sun[0]-x);
 ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle='#1d4f9e';ctx.fill();ctx.clip();
 ctx.beginPath();ctx.moveTo(x,y);ctx.arc(x,y,r+1,a-Math.PI/2,a+Math.PI/2);ctx.closePath();ctx.fillStyle='#5aaaff';ctx.fill();
 if(axis){const t=tilt*Math.PI/180, ex=Math.cos(t), ey=Math.sin(t);
  trace(ctx,[[x-ex*r,y-ey*r],[x+ex*r,y+ey*r]]);ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=1.5;ctx.stroke();}
 ctx.restore();
 if(axis){const t=tilt*Math.PI/180, dx=Math.sin(t), dy=-Math.cos(t), L=r*1.5;
  trace(ctx,[[x-dx*L,y-dy*L],[x+dx*L,y+dy*L]]);ctx.strokeStyle='#ffffff';ctx.lineWidth=2.5;ctx.lineCap='round';ctx.stroke();
  ctx.beginPath();ctx.arc(x+dx*L,y+dy*L,4,0,TAU);ctx.fillStyle='#ffffff';ctx.fill();
  if(north)text(ctx,'N',x+dx*(L+13),y+dy*(L+13)+4,{align:'center',size:12,weight:700,color:'#ffffff'});}
}
function seasonSun(ctx,x,y,r){
 const g=ctx.createRadialGradient(x,y,r*.9,x,y,r*1.9);g.addColorStop(0,'rgba(255,200,70,.45)');g.addColorStop(1,'rgba(255,200,70,0)');
 ctx.fillStyle=g;ctx.fillRect(x-r*2,y-r*2,r*4,r*4);ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle='#ffc23d';ctx.fill();
}
function drawSeasons(ctx,w,h,spec,st){
 const P=Physics, small=w<520, preview=st.since===undefined, last=(st.chapters?.length||6)-1;
 const stage=preview?3:Math.min(st.live?last:st.stage,last), since=preview?99:Math.max(0,st.since), ch=st.chapters?.[stage];
 const at=i=>ch?.lines?.[i]?ch.lines[i].start-ch.start:1+4*i, labels=st.labels, size=small?11:13;
 const T=P.seasonTilt, lat=P.seasonLat, eJ=P.noonSun(lat,T), eD=P.noonSun(lat,-T);
 const ink='rgba(20,23,28,.82)', white='#ffffff';
 SEASONS.show=false;
 if(stage===0||stage===1||stage===5){
  // Space as one deep field, the Sun in the middle and Earth's nearly round orbit seen from a little above.
  const fx=w*.03, fy=h*.04, fw=w*.94, fh=h*.92, cx=w*.5, cy=h*.5, rx=w*(small?.36:.25), ry=h*(small?.26:.38), ecc=.0167;
  ctx.fillStyle='#1f2b5c';ctx.beginPath();ctx.roundRect(fx,fy,fw,fh,18);ctx.fill();
  ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,TAU);ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=1.5;ctx.stroke();
  const pos=f=>[cx+rx*Math.cos(f),cy-ry*Math.sin(f)], sr=Math.min(w,h)*(small?.075:.085), sun=[cx+ecc*rx*Math.cos(SEASON_AT.january),cy-ecc*ry*Math.sin(SEASON_AT.january)];
  let f, er, axis=stage>0, tilt=T;
  if(stage===0){f=SEASON_AT.june+smooth((since-.6)/Math.max(1,at(2)+.6))*(Math.PI+.22);er=small?13:17;}
  else if(stage===1){f=SEASON_AT.december+smooth((since-at(1)-.2)/2.6)*Math.PI;er=small?20:27;}
  else{f=SEASON_AT.june+smooth((since-.4)/2)*Math.PI;er=small?22:30;}
  const [ex,ey]=pos(f), far=Math.sin(f)>.05;
  // In chapter 2 Earth's December place stays faintly drawn once it leaves, so the parallel lean can be compared.
  if(stage===1&&since>at(1)){const [gx,gy]=pos(SEASON_AT.december);ctx.globalAlpha=.7;seasonEarth(ctx,gx,gy,er,sun,{tilt,axis:true,north:true});ctx.globalAlpha=1;}
  if(far)seasonEarth(ctx,ex,ey,er,sun,{tilt,axis,north:axis});
  seasonSun(ctx,sun[0],sun[1],sr);
  if(!far)seasonEarth(ctx,ex,ey,er,sun,{tilt,axis,north:axis});
  if(labels){
   const onField=(s,x,y,o={})=>text(ctx,s,x,y,{size,weight:700,color:white,spacing:'1px',...o});
   if(stage===0){onField('Sun',cx,cy+sr+20,{align:'center'});if(since<at(2))onField('Earth',ex,ey-er-10,{align:'center'});
    if(since>=at(2)-.2){const [jx,jy]=pos(SEASON_AT.january), [lx,ly]=pos(SEASON_AT.july);
     ctx.beginPath();ctx.arc(lx,ly,er*.7,0,TAU);ctx.setLineDash([3,3]);ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);
     pill(ctx,'January: 147 million km',Math.min(jx+er+10,w-12),jy+(small?er+30:4),{align:small?'right':'left',size,weight:700,color:ink});
     pill(ctx,'July: 152 million km',Math.max(lx-er-10,12),ly-(small?er+18:0),{align:small?'left':'right',size,weight:600,color:ink});}}
   if(stage===1){if(since>=at(0)+.4&&since<at(2))pill(ctx,'leans 23 degrees',ex,ey-er*1.5-26,{align:'center',size,weight:700,color:ink});
    if(since>=at(2)-.1){const [dx,dy]=pos(SEASON_AT.december), [jx,jy]=pos(SEASON_AT.june);
     pill(ctx,'June: north leans in',jx,jy+er*1.6+24,{align:'center',size,weight:700,color:ink});
     pill(ctx,'December: north leans away',dx,dy+er*1.6+24,{align:'center',size,weight:700,color:ink});}}
   if(stage===5){const r=er, t=T*Math.PI/180, nx=Math.sin(t), ny=-Math.cos(t);
    const qx=Math.cos(t), qy=Math.sin(t), paris=[ex+nx*r*.62-qx*r*.34,ey+ny*r*.62-qy*r*.34], oz=[ex-nx*r*.45-qx*r*.36,ey-ny*r*.45-qy*r*.36], ready=since>=at(1)-.2;
    if(ready){for(const [px,py] of [paris,oz]){ctx.beginPath();ctx.arc(px,py,3.5,0,TAU);ctx.fillStyle='#ffde59';ctx.fill();}
     pill(ctx,'Paris: winter',small?w-16:ex+r+14,small?ey-r*1.6-22:paris[1]+2,{align:small?'right':'left',size,weight:700,color:ink});
     pill(ctx,'Australia: summer',small?w-16:ex+r+14,small?ey+r*1.6+28:oz[1]+6,{align:small?'right':'left',size,weight:700,color:ink});}
    if(since>=at(2)-.1){const [jx,jy]=pos(SEASON_AT.january);
     pill(ctx,'nearest: only 7% more',small?w-16:ex+r+14,small?ey+r*1.6+56:ey+r*1.6+40,{align:small?'right':'left',size,weight:700,color:ink});}}
  }
  return;
 }
 if(stage===2||stage===3){
  // Noon in Paris: one field of sky above one field of ground, the Sun on its height above the horizon.
  const gy=h*(small?.72:.76), turn=stage===2?smooth((since-at(2)+.3)/1.6):smooth((since-at(2)+.2)/1.8);
  const e=eJ+(eD-eJ)*turn, rad=e*Math.PI/180, sky=['#7cc4ff','#aebfd6'], ground=['#4f9d57','#8a9a74'];
  const mix=(a,b)=>{const p=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)), A=p(a), B=p(b);return `rgb(${A.map((v,i)=>Math.round(v+(B[i]-v)*turn)).join(',')})`;};
  ctx.fillStyle=mix(...sky);ctx.fillRect(0,0,w,gy);ctx.fillStyle=mix(...ground);ctx.fillRect(0,gy,w,h-gy);
  const ox=w*(small?.2:.24), sr=Math.min(w,h)*(small?.06:.055);
  // A flat Eiffel Tower marks Paris.
  {const th=h*(small?.2:.22), tw=th*.36;ctx.fillStyle='#3b3f4a';ctx.beginPath();ctx.moveTo(ox-tw/2,gy);ctx.lineTo(ox-tw*.06,gy-th);ctx.lineTo(ox+tw*.06,gy-th);ctx.lineTo(ox+tw/2,gy);
   ctx.lineTo(ox+tw*.2,gy);ctx.quadraticCurveTo(ox,gy-th*.3,ox-tw*.2,gy);ctx.closePath();ctx.fill();ctx.fillRect(ox-tw*.3,gy-th*.36,tw*.6,th*.03);}
  if(stage===2){
   const R=Math.min(w*(small?.62:.5),(gy-sr-20)/Math.sin(eJ*Math.PI/180)), sx=ox+R*Math.cos(rad), sy=gy-R*Math.sin(rad);
   trace(ctx,[[ox,gy],[sx,sy]]);ctx.setLineDash([6,6]);ctx.strokeStyle='rgba(255,236,170,.95)';ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);
   const ar=small?58:84;ctx.beginPath();ctx.moveTo(ox+ar,gy);ctx.arc(ox,gy,ar,0,-rad,true);ctx.strokeStyle='#ffffff';ctx.lineWidth=2.5;ctx.stroke();
   seasonSun(ctx,sx,sy,sr);SEASONS.show=true;SEASONS.angle=e;
   if(labels){text(ctx,`${Math.round(e)}°`,ox+ar*1.2*Math.cos(rad/2)+6,Math.min(gy-14,gy-ar*1.2*Math.sin(rad/2)+5),{size:size+2,weight:700,color:'#ffffff'});
    pill(ctx,'Paris',ox,gy+(small?22:26),{align:'center',size,weight:700,color:ink});
    pill(ctx,turn<.5?'June noon':'December noon',22,32,{align:'left',size,weight:700,color:ink});}
  }else{
   // One beam of sunlight, the same width each time, and the patch of ground it lands on.
   const G=[w*(small?.5:.46),gy], Wb=small?34:52, F=Wb/Math.sin(rad), d=[-Math.cos(rad),Math.sin(rad)], n=[d[1],-d[0]];
   const Ls=Math.min((w-G[0]-sr*2.4)/Math.cos(rad),(gy-sr*2.4)/Math.sin(rad)), sun=[G[0]-Ls*d[0],G[1]-Ls*d[1]];
   const bright=Math.sin(rad)/Math.sin(eJ*Math.PI/180), edge=k=>{const t0=[sun[0]+n[0]*k,sun[1]+n[1]*k], t=(gy-t0[1])/d[1];return [t0,[t0[0]+d[0]*t,gy]];};
   const [a1,a2]=edge(Wb/2), [b1,b2]=edge(-Wb/2), p1=[Math.min(a2[0],b2[0]),gy];
   trace(ctx,[a1,a2,b2,b1]);ctx.closePath();ctx.fillStyle=`rgba(255,226,90,${.22+.43*bright})`;ctx.fill();
   seasonSun(ctx,sun[0],sun[1],sr);
   const F0=Wb/Math.sin(eJ*Math.PI/180), x0=G[0]-F0/2;
   if(turn>.02){ctx.setLineDash([5,4]);ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=2;ctx.strokeRect(x0,gy-3,F0,9);ctx.setLineDash([]);}
   ctx.fillStyle=`rgba(255,122,26,${.25+.7*bright})`;ctx.fillRect(p1[0],gy-3,F,9);
   if(labels){if(turn<.5)pill(ctx,'June patch',G[0],gy+(small?28:32),{align:'center',size,weight:700,color:ink});
    else{pill(ctx,'June patch',G[0],gy-(small?22:26),{align:'center',size,weight:600,color:ink});pill(ctx,'December patch',G[0],gy+(small?28:32),{align:'center',size,weight:700,color:ink});}
    if(turn>.9)pill(ctx,'covers 3 times the ground',G[0],gy+(small?54:62),{align:'center',size,weight:700,color:ink});
    pill(ctx,'Paris',ox,gy+(small?22:26),{align:'center',size,weight:700,color:ink});}
  }
  return;
 }
 // June's long day and December's short one, as 24-hour bars with daylight in yellow, then the sunlight each day adds up to.
 const x0=w*(small?.08:.2), bw=w*(small?.84:.6), bh=small?26:34, rows=[[h*(small?.2:.22),T,'June'],[h*(small?.5:.5),-T,'December']];
 const grow=smooth((since-at(0)-.5)/1.6), sumIn=smooth((since-at(2)+.2)/1.4), top=P.dailySun(lat,T,1.0167), times=top/P.dailySun(lat,-T,.9837);
 for(const [y,dec,name] of rows){
  const hrs=P.dayHours(lat,dec)*grow, dw=bw*hrs/24;
  ctx.fillStyle='#24325f';ctx.beginPath();ctx.roundRect(x0,y,bw,bh,8);ctx.fill();
  if(dw>1){ctx.fillStyle='#ffcf3f';ctx.beginPath();ctx.roundRect(x0+bw/2-dw/2,y,dw,bh,8);ctx.fill();}
  if(sumIn>0){const ew=bw*.9*(P.dailySun(lat,dec,dec>0?1.0167:.9837)/top)*sumIn;ctx.fillStyle='#ff7a1a';ctx.beginPath();ctx.roundRect(x0,y+bh+12,Math.max(4,ew),bh*.6,6);ctx.fill();}
  if(labels){text(ctx,name,small?x0:x0-14,small?y-10:y+bh*.66,{align:small?'left':'right',size:size+1,weight:700,color:ink});
   if(grow>.5)text(ctx,`${Math.round(P.dayHours(lat,dec))} hours`,x0+bw/2,y+bh*.68,{align:'center',size,weight:700,color:'#3b2a00'});}
 }
 if(labels&&sumIn>.3){pill(ctx,'sunlight per day',small?x0+bw*.9:x0+bw*.9+12,small?rows[0][0]+bh+12+bh*.6+20:rows[0][0]+bh+12+bh*.3,{align:small?'right':'left',size,weight:700,color:ink});
  void times;}
}

// Why 23 people are enough for a shared birthday to be likely. Someone shares your own birthday only about 6% of the
// time, from 22 chances; but a match can be between any two people, and 23 people make 253 pairs. As people arrive
// one at a time, each newcomer must miss every birthday already in the room, so the chance of a shared birthday
// passes one half with the 23rd person and reaches 97% with 50. Exact for 365 equally likely birthdays
// (Physics.birthdayShared); after playback the viewer sets how many people are in the room.
const BDAY={mode:'',geo:null};
// Filling the room directly: tap it to bring in one more person, tap someone to send them home, or drag the gold bar
// to a chance and the room fills to the number of people that gives it.
const bdayMass=n=>(clamp(n,1,60)-1)/59;
const BDAY_TOUCH={hint:'tap the room to bring people in, tap someone to send them home, or drag the gold bar.',
 grab(w,h,spec,st,x,y){const g=BDAY.geo;if(BDAY.mode!=='live'||!g)return null;const b=g.bar;
  if(x>b.bx-12&&x<b.bx+b.bw+12&&Math.abs(y-b.y)<b.bh/2+12)return {kind:'bar',cursor:'grab'};
  for(let k=0;k<g.n;k++){const [px,py]=g.pos(k);if(Math.hypot(x-px,y-py)<12)return {kind:'person',cursor:'pointer'};}
  return Math.hypot(x-g.cx,y-g.cy)<g.R+14?{kind:'room',cursor:'pointer'}:null;},
 move(w,h,spec,st,x,y,hd){if(hd.kind!=='bar')return null;const b=BDAY.geo.bar, f=clamp((x-b.bx)/b.bw);let best=1;
  for(let n=2;n<=60;n++)if(Math.abs(Physics.birthdayShared(n)-f)<Math.abs(Physics.birthdayShared(best)-f))best=n;return {mass:bdayMass(best)};},
 release(w,h,spec,st,x,y,hd,moved){if(hd.kind==='bar')return moved?null:BDAY_TOUCH.move(w,h,spec,st,x,y,hd);if(moved)return null;
  const n=Math.round(1+59*clamp(st.target));return {mass:bdayMass(hd.kind==='person'?n-1:n+1)};}};
function bdayPlan(st){
 const c=st.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since??0);
 const last=lines.length?at(lines.length-1):3;
 if(st.since===undefined)return {mode:'thumb',n:23,arrived:23,you:0,t:0};
 if(st.live){const n=Math.max(1,Math.round(1+59*clamp(st.mass)));return {mode:'live',n,arrived:n,you:0,t:st.t||0};}
 // 1: 23 people; with the first sentence the 22 chances that someone shares your birthday, one line each.
 if(st.stage===0)return {mode:'you',n:23,arrived:23,you:clamp((t-at(0)-1.2)/2)*22,t};
 // 2: every pair is a chance: all 253 lines, then with the second sentence the count, and with the third the chance
 // that any two match.
 if(st.stage===1){const count=smooth((t-at(1)-.2)/.5);return {mode:'pairs',n:23,arrived:23,pairs:22+clamp((t-at(0)-1)/3.5)*(Physics.birthdayPairs(23)-22),you:22,count,odds:lines.length>2?smooth((t-at(2)-.2)/.5):count,t};}
 // 3: people arrive one at a time through both sentences, each with lines to everyone already there, while the
 // chance of a shared birthday grows.
 if(st.stage===2){const a=1+clamp((t-at(0)-1)/Math.max(3,last+1.5-at(0)-1))*22;return {mode:'arrive',n:23,arrived:a,you:0,bar:1,t};}
 // 4: 27 more arrive, to 50 people and 1,225 pairs.
 const n=23+clamp((t-at(0)-.8)/3.2)*27;return {mode:'more',n,arrived:n,you:0,bar:1,t};
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
 const people=Math.min(whole,Math.ceil(arrived-1e-9)), pairs=Physics.birthdayPairs(people);
 if(st.labels){
  if(plan.mode==='you'||plan.mode==='pairs'){const [x,y]=pos(0);text(ctx,'you',x,y-(small?12:15),{align:'center',size,weight:700,color:accent});}
  const centre=plan.mode==='you'?(plan.you>21.5?'22 pairs with you':''):plan.mode==='pairs'?(plan.count>.5?`${Physics.birthdayPairs(23)} pairs`:''):`${pairs.toLocaleString('en-US')} pair${pairs===1?'':'s'}`;
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
 BDAY.geo={cx,cy,R,n:whole,pos,bar:{bx,bw,bh,y:rows[1][2]}};
 const lowest=anyShow>.5?rows[1]:rows[0];
 if(st.labels&&(anyShow>.5||youShown))text(ctx,'half',bx+bw/2,lowest[2]+bh/2+(small?11:14),{align:'center',size:size-1,weight:600,color:muted});
}

// Why the sky is blue and sunsets are red. With no air, as on the Moon, the daytime sky is black. Light is a wave that
// shakes the electrons in each air molecule, and shaken electrons send light out in every direction; blue, a shorter
// wave than red, shakes them more often and is scattered about six times as much. So blue reaches you from all over the
// sky, while at sunset the light crosses so much air that most of its blue is scattered away before it arrives.
// Rayleigh scattering by clean air at sea level (Physics.skyThrough); after playback the viewer sets the Sun's height.
const SKY={mode:'',geo:null};
// Moving the Sun directly: drag it along the sky; its height is the angle between it and the horizon, seen from you.
const SKY_TOUCH={hint:'drag the Sun down to the horizon, then back up.',
 grab(w,h,spec,st,x,y){const g=SKY.geo;return SKY.mode==='live'&&g&&Math.hypot(x-g.sx,y-g.sy)<g.R*2.4+8?{cursor:'grab'}:null;},
 move(w,h,spec,st,x,y){const g=SKY.geo;return {mass:clamp(Math.atan2(g.oy-y,g.ox-x)*180/Math.PI/90)};}};
// Fixed scattered positions, so the air, the sparks and the lines to the eye are the same at every frame.
const SKY_DOTS=(()=>{let x=5;const r=()=>{x=(x*1103515245+12345)%2147483648;return x/2147483648;};return Array.from({length:150},()=>[r(),r(),r()]);})();
function skyPlan(st){
 const c=st.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since??0);
 if(st.since===undefined)return {mode:'thumb',air:1,t:2};
 if(st.live)return {mode:'live',sun:clamp(st.mass)*90,t:st.t||0};
 // 1: no air, as on the Moon: a black sky. With the second sentence the air arrives and the sky turns blue.
 if(st.stage===0)return {mode:'air',air:smooth((t-at(1)-.3)/1.5),t};
 // 2: one molecule in red light and in blue light; the blue one sends out far more, labelled with the
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
  // One molecule, twice: a red wave and a blue wave pass at the same speed; the blue one is shorter, so it shakes the
  // electrons more often, and the rings of light they send out are about six times as bright.
  const x0=w*.08, x1=w*.92, mx=w*(small?.5:.42), speed=small?60:90, lanes=[[red,'red light',small?h*.28:h*.3,small?70:120,1],[blue,'blue light',small?h*.66:h*.66,(small?70:120)*450/700,Physics.skyScatter(450)]];
  // A pale sky behind the molecule, so this chapter sits in the same world as the others.
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
  if(st.labels){text(ctx,'air molecules',w/2,h*.07,{align:'center',size,weight:700,color:muted});
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
  if(plan.mode==='live'){const e=Math.max(0,plan.sun), {d,L}=path(e);ray(e,1,1,'');SKY.geo={ox,oy,sx:ox+d[0]*(L+gapOut),sy:oy+d[1]*(L+gapOut),R:small?11:16};}
  else{ray(90,plan.noon,plan.tint,'noon');ray(0,plan.dusk*1.0001,plan.tint,'sunset');}
  drawPerson(ctx,ox,oy,small?5:7,'#14171c');
  ctx.restore();
  const vr=small?w*.17:h*.21, vx=small?w*.25:w*.82, vy=small?h*.17:h*.31;
  if(view.show>0){ctx.globalAlpha=view.show;skyView(ctx,vx,vy,vr,view.e,view.dusk,view.col);ctx.globalAlpha=1;}
  if(st.labels){text(ctx,'you',ox+(small?10:14),oy-(small?6:9),{size,weight:700,color:'#f8fafc'});
   if(view.show>.5)text(ctx,'what you see',vx,vy+vr+(small?14:20),{align:'center',size,weight:700,color:'#f8fafc'});}
  return;
 }
 // The sky: a landscape with the Sun at the upper left and you on the ground; on the Moon, with no air, the sky is
 // black and the ground grey.
 const air=plan.air??1, edge=plan.mode==='thumb', wx=edge?0:w*.03, wy=edge?0:h*.04, ww=edge?w:w*.94, wh=edge?h:h*.9, sunF=[small?.16:.1,.2], R=small?14:20;
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
 ctx.save();ctx.beginPath();ctx.roundRect(wx,wy,ww,wh,edge?0:16);ctx.clip();
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

// Attention, told as the story behind chatbots. A chatbot guesses the next word; the clue it needs ("France") is five
// words back; an old one-at-a-time memory lets it fade, while attention looks straight back at every earlier word and
// gives the biggest share to the one that answers what the guess needs ("which language?"). Practice sentences show
// where that match comes from. Built from attention alone, every word is worked on at once; stacked many times, that
// is the Transformer, the T in GPT. Each chapter has a fixed plan; after playback the viewer turns attention down and
// up. Shares are the exact softmax of hand-made scores (Physics.lookBack); the guesses come from a toy rule
// (Physics.lookGuess).
const ATTN={mode:'',strength:1};
function lookPlan(st){
 const c=st.chapters?.[st.stage], lines=c?.lines||[], c0=c?.start||0, at=i=>lines[i]?lines[i].start-c0:3+4*i, t=Math.max(0,st.since??0);
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

/* AGENT-ENGINES: scene. Draw functions and helpers for engines the daily run builds from a research brief are
   spliced in above this line (lab/build_engine.py); they are top-level declarations in this closure. */

const ENGINES={
 /* AGENT-ENGINES: map. Map entries for agent-built engines are spliced in above this line. */
 'light-bending':{draw:drawLight,a:['Mass','how much mass sits nearby'],b:['Passing distance','how close the light passes','×'],
  fa:a=>a.toFixed(2),fb:b=>b.toFixed(2)+'×',
  measure:['Real bend of the nearest ray',(a,b)=>(Physics.deflection(a,b)*180/Math.PI).toFixed(2)+'°'],scale:'',disclosure:'The mesh measures distance as the time light needs to cross it, timed far away; light’s straightest line across it is the drawn path. The readout is the model value for the nearest ray, in the model’s own units. The dip is not a slope.',demoEnd:s=>Math.min(2.5,s.distance+1),
  try:'Slide Mass to zero, then back up. Now move the beam farther away. When does it bend most?',aria:'Light passing a massive object, compared with a straight path without the mass.'},
 'gravity-clocks':{draw:drawClocks,a:['Mass','how much mass sits nearby'],b:['Lower radius','gap stays 2 units',' units'],
  fa:a=>a.toFixed(2),fb:b=>b.toFixed(2)+' units',
  measure:['Lower clock runs slower by',(a,b)=>((1-Physics.clockRatio(a,b))*100).toFixed(2)+'%'],scale:'',disclosure:'The slowdown readout is the model value in arbitrary units, not an Earth figure.',demoEnd:()=>2.5,
  try:'Slide Mass to zero. Do the clocks agree? Bring it back, then move the Lower radius outward.',aria:'Two stationary clocks at different heights above a mass. The lower clock counts less time.'},
 'spacetime':{draw:drawSpacetime,a:['Speed','how fast the traveller flies'],b:['Trip','time out before turning back',''],
  fa:a=>Math.round(Physics.speed(a)*100)+'% of light',fb:b=>Physics.turnaround(b).toFixed(1)+' years out',
  measure:['Traveller comes home younger by',a=>(Physics.agingGap(a)*100).toFixed(1)+'%'],scale:'Time runs up · light moves at 45°',disclosure:'Speeds and times are exact for the model; the turnaround is treated as instant.',demoEnd:()=>2.5,
  try:'Set Speed to zero: do the twins agree? Push it up. Then make the trip longer: does the percentage change?',aria:'A spacetime diagram: a home twin stays put while a traveller goes out and back. The traveller collects fewer ticks.'},
 'interference':{draw:drawInterference,a:['Second source','strength of the second wave'],b:['Source spacing','in wavelengths',''],
  fa:a=>a<.005?'off':Math.round(a*100)+'%',fb:b=>Physics.separation(b).toFixed(1)+' λ',
  measure:['Stripe contrast',a=>(Physics.visibility(a)*100).toFixed(0)+'%'],scale:'Seen from above',disclosure:'The stripe contrast is computed exactly for two point sources.',demoEnd:()=>2.5,
  try:'Turn the second source off: what happens to the stripes? Bring it back, then spread the sources apart.',aria:'Two circular wave sources overlapping, making bright and dark stripes on a screen.'},
 'two-slit-particles':{draw:drawParticles,touch:PARTICLES_TOUCH,a:['Second slit','how open the second slit is'],b:['Slit spacing','relative distance between the slits',''],
  fa:a=>a<.005?'closed':Math.round(a*100)+'% open',fb:b=>b.toFixed(2)+'×',
  // The narration never uses the contrast, so it shows only once the guide has played.
  measure:['Stripe contrast',a=>mode==='live'?(Physics.visibility(a)*100).toFixed(0)+'%':''],scale:'',disclosure:'Each dot is a sample from the predicted pattern; the waves show where a particle may land, not a path through one slit.',demoEnd:()=>2.5,
  demo:(p,s)=>({mass:s.mass*(1-smooth((p-.06)/.08)),distance:s.distance}),
  try:'Open the second slit again and watch the stripes return. Then move the slits apart.',aria:'Particles fired one at a time at a wall with two slits land as single dots on a screen, and thousands of them build up stripes.'},
 'standing-waves':{draw:drawRope,touch:GUITAR_TOUCH,demo:false,plucks:true,
  a:['How hard you pluck','how far you pull the string'],b:['Where you press','toward the middle, a shorter string rings',''],
  fa:a=>Math.round(a*100)+'%',fb:b=>{const L=guitarLen(b);return L>.996?'open string':Math.round(L*100)+'% rings';},
  measure:[()=>GUITAR.active?'Note':'Rope swings',a=>GUITAR.active?(a>.001?Math.round(220/GUITAR.len):0)+' swings a second':ROPE.key==='pulse'||ROPE.size<.05?'':ROPE.size.toFixed(1)+'× as far as your hand'],tryAny:true,scale:'',
  disclosure:'The rope is simulated: the wave equation with a little friction, which is why an in-step swing stops growing at about 6 times the hand. Everything is slowed down, the single shake 8 times more. The rope makes no sound: at a few swings a second it is far too slow to hear. The guitar string is slowed down 220 times; its sound is a synthesized plucked string at the real pitch, 220 Hz open and 440 Hz pressed at the middle.',
  try:'Move “Where you press” toward the middle: each move plucks the string, and the shorter it rings, the higher the note.',aria:'A hand shakes one end of a rope tied to a wall. At one, two or three shakes a second the rope swings big in one, two or three loops; at other speeds it only jiggles. Then a guitar string is plucked, open and pressed at the middle.'},
 'tunneling':{draw:drawTunnel,a:['Barrier height','compared with the particle’s energy'],b:['Barrier width','how thick the barrier is',''],
  fa:a=>a<.005?'none':(2*a).toFixed(1)+'× energy',fb:b=>(.6*b/(2*Math.PI)).toFixed(2)+' wavelengths',
  measure:['Bounces back',(a,b)=>(Physics.reflected(a,b)*100).toFixed(0)+'%'],scale:'A steady stream, shown at one instant',disclosure:'Exact steady-state solution in units where ħ = 1 and 2m = 1.',demoEnd:()=>2.5,
  try:'Remove the barrier: does anything bounce back? Raise it above the energy, then make it thicker.',aria:'A quantum wave meets a barrier: part bounces back, part leaks through.'},
 'wave-packet':{draw:drawPacket,demo:false,tryAny:true,a:['Blend of speeds','how many wave lengths are mixed in'],b:['Unused','',''],
  fa:a=>{const n=Physics.blendRange(blendSk(a)).length;return n===1?'one wave':n+' waves';},fb:b=>'',
  // The modelled effect for the render checks: the blend's width (zero for one wave).
  effect:a=>blendSk(a),
  measure:[()=>BLEND.sound?'Pitches mixed in':'Spread of speeds',()=>BLEND.sound?String(BLEND.count):BLEND.sk===null?String(BLEND.count)+' waves':BLEND.sk<=.01?'none: one exact speed':(BLEND.sk/.25).toFixed(1)+'×'],scale:'',
  disclosure:'Exact sums of waves. The particle is free and in one dimension, drawn at one instant in units where ħ = 1; speed is shown as wave length, since a particle’s momentum is set by its wave length. Real beeps and clicks are messier mixtures, but the trade-off is the same: a burst short in time is a wide blend of pitches. The blend is a bell curve, the shape that makes the trade-off as small as it can be.',
  try:'Slide “Blend of speeds” down to one wave: it spreads everywhere, with one exact speed. Widen the blend and the burst gets narrower.',aria:'Waves of slightly different lengths, each in its own row, are added together. Two make a pattern that swells and fades; many make one short burst. For a particle, a narrower burst needs a wider blend of speeds.'},
 'quantum-well':{draw:drawWell,touch:TRAP_TOUCH,demo:false,tryAny:true,a:['Energy','slide it to try other energies'],b:['Trap width','a wider trap holds more allowed energies',''],
  fa:a=>{const lv=Physics.trapLevels(TRAP.L||2), n=lv.findIndex(e=>Math.abs(e-trapE(a))<.35);return n<0?'in between':`allowed energy ${n+1}`;},fb:b=>Physics.trapLevels(trapL(b)).length+' allowed',
  // The modelled effect for the render checks: how far the chosen energy sits above the trap's floor.
  effect:a=>trapE(a)+Physics.trapDepth,
  measure:[()=>({live:'This energy',atom:'Colours given off',all:'Allowed energies',sweep:'Allowed energies found'})[TRAP.mode]||'',()=>TRAP.mode==='live'?(TRAP.fits?'allowed':'not allowed'):TRAP.mode==='atom'?String(TRAP.colours):TRAP.mode==='inside'||TRAP.mode==='walls'||TRAP.mode==='corner'?'':String(TRAP.found)],scale:'',
  disclosure:'Exact one-dimensional quantum model of a particle in a square pit, in units where ħ = 1 and 2m = 1. Each wave is drawn at one instant: an allowed wave keeps its shape over time, and a wave that grows without end is not a possible state at all. The energy control clicks onto an allowed energy when it comes close. A real atom traps its electrons with a pull of a different shape, and the colours are illustrative.',
  try:'Slide “Energy” until the wave fades into both walls; it does so only at the marked energies. Then widen the trap: more energies fit, and they sit lower.',aria:'A particle’s wave in a pit. At most energies the wave grows without end in one wall, which is impossible; only at a few energies does it fade into both walls. Those are the allowed energies, and drops between them give off light of certain colours.'},
 'falling-time':{draw:drawFall,a:['Gravity','how strong gravity is'],b:['Time in the air','between leaving and meeting again',''],
  fa:a=>a<.005?'none':Math.round(a*100)+'%',fb:b=>(2+2*(b-1)).toFixed(1)+' units',
  measure:['Thrown clock gains',(a,b)=>(Physics.fallGain(a,b)*100).toFixed(1)+'%'],scale:'',disclosure:'Time effects are enormously exaggerated so they can be seen; the shape of the result is exact for weak gravity.',demoEnd:()=>2.5,
  try:'Turn gravity off: which path keeps the most time? Turn it on and give the ball longer in the air.',aria:'Clocks held at the ground and thrown upward; the path a thrown ball takes is the one that keeps the most time.'},
 'diffraction':{draw:drawGap,a:['Gap','narrower to the right; 0 removes the barrier'],b:['Wavelength','length of one wave',''],
  fa:a=>a<.005?'no barrier':Physics.gap(a,1).width.toFixed(1)+' units',fb:b=>Physics.gap(1,b).lambda.toFixed(2)+' units',
  measure:['Spreads by',(a,b)=>Physics.spreadAngle(a,b).toFixed(0)+'°'],scale:'Seen from above',disclosure:'The spreading angle is the exact single-gap value.',demoEnd:()=>2.5,
  try:'Remove the barrier: does the wave spread? Narrow the gap, then lengthen the waves.',aria:'A wave passes through a gap and spreads out, with bright and dark bands on a screen.'},
 'twin-trip':{draw:drawTwinTrip,a:['Speed','how fast the rocket flies'],b:['Trip','time out before turning back',''],
  fa:a=>Math.round(Physics.speed(a)*100)+'% of light',fb:b=>Physics.turnaround(b).toFixed(1)+' years out',
  measure:['Traveller comes home younger by',a=>(Physics.agingGap(a)*100).toFixed(1)+'%'],scale:'',demoEnd:()=>2.5,
  disclosure:'Ages and speeds are exact special relativity; the rocket turns around instantly.',
  try:'Set Speed to zero: do the twins still agree? Speed up, then make the trip longer and compare the two bars.',aria:'Twins: one stays on Earth while the other flies to a star and back. Two bars show how much each twin has aged.'},
 'light-clock':{draw:(ctx,w,h,spec,st)=>drawLightClocks(ctx,w,h,spec,st,{vplan:Physics.speed(spec.mass)}),
  demo:(p,spec)=>({mass:spec.mass+(1-spec.mass)*smooth(p/.12),distance:spec.distance}),a:['Speed','how fast the rocket flies'],b:['Unused','',''],
  fa:a=>Math.round(Physics.speed(a)*100)+'% of light',fb:b=>'',
  measure:[()=>LIGHTCLOCK.crew?'Earth clock ticks slower by':'Rocket clock ticks slower by',a=>(Physics.agingGap(a)*100).toFixed(0)+'%'],scale:'',
  disclosure:'Exact special relativity: light moves at the same speed for every observer. The rocket clock ticks normally for its crew, who find Earth’s clocks slow instead.',
  try:'Slide the speed down to zero: the clocks agree. Push it toward light speed: the slanted path grows and the rocket clock ticks less than half as fast.',aria:'Two light clocks: one on Earth with light going straight up and down, one on a moving rocket whose light must slant to hit the moving mirrors, so it ticks less often.'},
 'simultaneity':{draw:drawSimultaneity,demo:false,a:['Train speed','how fast the train moves'],b:['Train length','the train’s own length',''],
  fa:a=>Math.round(Physics.simulSpeed(a)*100)+'% of light',fb:b=>Physics.simulLength(b).toFixed(1)+' light-seconds',
  effect:(a,b)=>Physics.simulGap(Physics.simulSpeed(a),Physics.simulLength(b)),
  measure:[()=>SIMUL.gap>1e-9?'Front end struck first by':'Both ends struck',()=>!SIMUL.show?'':SIMUL.gap>1e-9?SIMUL.gap.toFixed(2)+' s':'together'],scale:'',
  disclosure:'Exact special relativity for an ideal train and instant lightning. Times are read from each side’s own clocks, set to agree using light.',
  try:'Slide the speed to zero and both ends are struck together. A faster or longer train makes the front strike come earlier.',
  aria:'A train passes a platform as lightning strikes both of its ends. Seen from the platform, the two flashes meet at its midpoint together. Seen from the train, the front end is struck first, so its flash reaches the rider first.'},
 'spacetime-paths':{draw:drawPaths,touch:PATHS_TOUCH,demo:false,a:['Speed','how fast the traveller flies'],b:['Trip','time out before turning back',''],
  fa:a=>Math.round(Physics.speed(a)*100)+'% of light',fb:b=>Physics.turnaround(b).toFixed(1)+' years out',
  measure:['Traveller’s clock counts less by',a=>(Physics.agingGap(a)*100).toFixed(1)+'%'],scale:'',
  disclosure:'Exact special relativity in years and light-years; the turnaround is instant. The light clocks are slowed down for viewing. Distances on the page are not spacetime lengths: tilted paths look longer than they hold.',
  try:'Drag the turnaround sideways: a faster trip leaves less time on the traveller’s clock. Drag it back to the home path: the twins agree again.',aria:'A spacetime diagram: the home twin’s straight path and the traveller’s bent path between the same goodbye and reunion, with one dot per year of each twin’s own time.'},
 'river':{draw:drawRiver,demo:false,tryAny:true,a:['Black hole mass','sets the size of the horizon'],b:['Light starts at','how far from the centre the light is sent',''],
  fa:a=>a<.005?'none':Math.round(clamp(a)*100)+'%',fb:b=>{const re=.6+(b-1);return re.toFixed(2)+' units out';},
  // The modelled effect for the render checks: how fast space flows in where the light starts, in light speeds.
  effect:(a,b)=>Physics.riverInflow(clamp(a),.6+(b-1)),
  measure:['Where the light starts, space flows in at',(a,b)=>RIVER.live?Math.round(Physics.riverInflow(clamp(a),.6+(b-1))*100)+'% of light speed':''],scale:'',
  disclosure:'A picture with exact numbers: for a non-rotating black hole, Einstein’s equations can be written as if space flowed inward at the speed a dropped object reaches (the river, or Painlevé–Gullstrand, picture), and light always moves at light speed through the space around it. Space is not a substance and nothing is really carried; the flowing dots only show the inflow speed. Distances are measured in units of the horizon at full mass, and motion is slowed down. The fish and the waterfall are an analogy that follows the same rule; a real river’s current depends on its shape.',
  try:'Move “Light starts at” inside the horizon: can the light get out? Then make the black hole smaller and try again.',aria:'A fish swims upstream in a river that speeds up toward a waterfall: far away it gets away, at one point it holds still, and past it it is swept over. Then space flows into a black hole the same way, and light, always moving at light speed through it, escapes from outside the horizon, stands still on it and is carried in from inside.'},
 'fall-views':{draw:drawViews,demo:false,tryAny:true,measure:null,a:['Gravity','how strong gravity is'],b:['Time in the air','between the toss and the catch',''],
  fa:a=>a<.005?'none':Math.round(a*100)+'% of Earth’s',fb:b=>Physics.views(1,b).T.toFixed(1)+' units',scale:'',
  // The modelled effect for the render checks: how fast, seen from the ball, the ground speeds up (the push on you).
  effect:(a,b)=>Physics.views(clamp(a),b).g,
  disclosure:'Air resistance is ignored, and heights and times are in made-up units. The view from the ball is exact for a short toss. The first chapter, with no gravity, uses its own height scale so the whole path fits.',
  try:'Turn gravity down to none: from the ball, the ground drifts away in a straight line, and nothing pushes you. Turn it up: the ground curves back to the ball, pushed harder.',aria:'A ball tossed up and caught, drawn on a map of height and time, first as seen from the ground and then as seen from the ball, where the ball stays still and the ground moves.'},
 'tides':{draw:drawTides,demo:false,tryAny:true,measure:null,a:['Earth’s mass','how strongly it pulls'],b:['Unused','',''],
  fa:a=>a<.005?'none':Math.round(a*100)+'% of real',fb:b=>'',scale:'',
  // The modelled effect for the render checks: how much the small falling ring has stretched by the end of its fall.
  effect:a=>Physics.tideStretch(clamp(a)),
  disclosure:'The ball is an analogy: a curved surface in space. Curved spacetime also makes straight paths come together or spread apart, but it involves time and cannot be drawn exactly. The balls follow Newton’s law of gravity exactly, which is accurate for weak gravity like the Earth’s. In three dimensions, a small falling ring stretches one way and squeezes in the other two, so at first the space it encloses stays the same.',
  try:'Set Earth’s mass to none: the small ring stays round. Give the Earth back its mass and the ring stretches again.',aria:'Two walkers heading north on a globe come together; a ring of falling balls around the Earth shrinks; a small falling ring stretches into an egg shape.'},
 'lift':{draw:drawLift,demo:false,tryAny:true,measure:null,a:['Lift speeds up','falling freely at the left, steady in the middle'],b:['Unused','',''],
  fa:liftSpeedUp,fb:b=>'',scale:'',
  // The modelled effect for the render checks: the scale's reading, in units of your weight.
  effect:a=>Physics.lift().reading(liftAccel(a)),
  disclosure:'Newtonian physics, exact for a lift on Earth: a scale reads the floor’s push, which is your weight times (g + a)/g, where g is gravity’s pull and a is how fast the lift speeds up upward. The ride’s speeds and the 70 kg person are made up for the example; air resistance is ignored, and real lifts have safety brakes. The dial’s needle eases to each reading like a real scale’s, and the fall is shown in slow motion.',
  try:'Slide to the left end: the lift falls freely and the scale reads 0 kg. Slide right of the middle: the lift speeds up upward and you weigh more.',aria:'A person stands on a bathroom scale in a lift. The dial reads their weight when parked, more or less while the lift speeds up or slows down, and zero when the cable snaps.'},
 'moon-tides':{draw:drawMoonTides,demo:false,tryAny:true,measure:null,a:['Moon’s mass','how heavy the Moon is'],b:['Unused','',''],
  fa:a=>a<.005?'no Moon':Math.round(clamp(a)*100)+'% of real',fb:b=>'',scale:'',
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
  measure:['Sky covered by stars',a=>NIGHT.mode==='live'?nightShare(Physics.nightCover(Physics.nightYears(clamp(a)))):''],scale:'',
  disclosure:'Stars are treated as Sun-like and spread evenly: about 10²² of them in today’s observable universe, a rough count (estimates run from 10²² to 10²⁴). A sight line then travels about 2 × 10²⁴ light-years, on average, before it meets a star. Within the 13.8 billion light-years that light has crossed since the beginning, stars cover about 1 part in 180 trillion of the sky. The slider imagines an unchanging universe whose stars have shone for the chosen time. The picture is a slice through space: a ring twice as far holds twice as many stars, where a full shell holds four times as many. The expansion of the universe, which stretches and dims distant light further, is left out of the numbers.',
  try:'Set the age to 13.8 billion years: stars cover about 1 part in 180 trillion of the sky. How old would an unchanging universe have to be before the whole night sky lit up?',
  aria:'You stand on a hill under a dark, starry sky. If stars filled endless, unchanging space, every shell of stars around you would add the same light and every line of sight would end on a star, so the whole sky would blaze like the Sun. But the universe began about 13.8 billion years ago, so only light from a bubble around you has had time to arrive; light from farther stars is still on its way, and the night stays dark.'},
 'eratosthenes':{draw:drawEratosthenes,demo:(p,s)=>({mass:s.mass+(.85-s.mass)*smooth((p-.06)/.3),distance:s.distance}),
  a:['Earth size','how sharply the ground curves'],b:['Unused','',''],
  fa:a=>a<.005?'flat':Math.round(40000/Physics.earthCurvature(a)).toLocaleString('en-US')+' km around',fb:b=>'',
  // The modelled effect for the render checks: how far Alexandria's stick leans (zero on flat ground).
  effect:a=>ERA_U*Physics.earthCurvature(a),
  measure:['Shadow angle in Alexandria',()=>ERA.show?(ERA.angle*180/Math.PI).toFixed(1)+'°':''],scale:'',
  disclosure:'Exact for parallel sunlight on a perfect sphere. As in the classic account, the two cities are treated as due north and south of each other, the Sun as exactly overhead at Syene, and the distance as 800 km.',
  try:'',aria:'Sunlight falls straight down on a stick in Syene, which casts no shadow, while a stick in Alexandria, 800 km away on the curved Earth, casts a short shadow at 7.2 degrees. Extended down, the two sticks meet at the Earth’s centre at the same 7.2 degrees, one fiftieth of a circle, so the Earth is 50 times 800 km around.'},
 'seasons':{draw:drawSeasons,demo:false,a:['Tilt','how far the axis of the Earth leans'],b:['Unused','',''],
  fa:a=>(clamp(a)*Physics.seasonTilt).toFixed(1)+'°',fb:b=>'',
  // The modelled effect for the render checks: how much higher the noon Sun stands in Paris in June than in December.
  effect:a=>Physics.noonSun(Physics.seasonLat,clamp(a)*Physics.seasonTilt)-Physics.noonSun(Physics.seasonLat,-clamp(a)*Physics.seasonTilt),
  measure:['Noon Sun in Paris',()=>SEASONS.show?Math.round(SEASONS.angle)+'°':''],scale:'',
  disclosure:'Paris at 48.86° north, at the June and December solstices, with Earth’s tilt of 23.44°. Sunlight is counted as it arrives at the top of the air, before air and clouds dim it, and the daily totals include Earth’s distance from the Sun.',
  try:'',aria:'Earth travels around the Sun on a nearly round orbit and is nearest in early January. Its axis leans 23 degrees and keeps pointing the same way, so the north leans toward the Sun in June and away in December. At noon in Paris the Sun stands 65 degrees high in June and 18 degrees in December, so the same beam of sunlight covers about three times the ground in December. June days last about 16 hours and December days about 8, so Paris gets about five times the sunlight a day in June.'},
 'monty-hall':{draw:drawMonty,touch:MONTY_TOUCH,demo:false,a:['Switch how often','the share of games in which you switch'],b:['Unused','',''],
  fa:a=>Math.round(clamp(a)*100)+'% of games',fb:b=>'',
  // The modelled effect for the render checks: how much switching in this share of games adds to the chance of winning.
  effect:a=>Physics.montyWin(clamp(a))-1/3,
  measure:['',()=>''],scale:'',
  disclosure:'Exact for the standard rules: the car is placed at random, and the host always opens a door with a goat that you did not pick, choosing at random when he can, and always offers the switch. The 300 games are a fixed pseudo-random sample.',
  try:'',aria:'Three doors hide a car and two goats. You pick door 1; the host, who knows where the car is, opens door 3 to show a goat and offers a switch. Three rows show the three equal cases: switching wins in two of them. Scored over 300 games, switching wins about twice as often. With 100 doors the host opens 98 goats and leaves one shut. Then letters pile up for the 1990 column that gave this answer.'},
 'simpson':{draw:drawSimpson,demo:false,a:['Case mix','how lopsided the stone sizes are between treatments'],b:['Unused','',''],
  fa:a=>Math.round(clamp(a)*100)+'%',fb:b=>'',
  // The modelled effect for the render checks: how far B leads overall as A takes more of the large stones.
  effect:a=>Physics.simpsonGap(clamp(a)),
  measure:['',()=>''],scale:'',
  disclosure:'Every tile is one patient of a 1986 kidney-stone study, coloured when the treatment worked; A was open surgery and B a closed procedure. Counts as reported: small stones A 81 of 87, B 234 of 270; large stones A 192 of 263, B 55 of 80.',
  try:'',aria:'Two blocks of 350 tiles, one per patient, coloured where the treatment worked: treatment A 78%, treatment B 83%. The tiles slide into small and large stones: A wins both, 93% to 87% and 73% to 69%. A treated 263 large stones, B only 80, and large stones fail more often, which drags A’s total down.'},
 'birthdays':{draw:drawBirthdays,touch:BDAY_TOUCH,demo:false,tryAny:true,a:['People','how many people are in the room'],b:['Unused','',''],
  fa:a=>{const n=Math.max(1,Math.round(1+59*clamp(a)));return `${n} ${n===1?'person':'people'}`;},fb:b=>'',
  // The modelled effect for the render checks: the chance of a shared birthday for the chosen number of people.
  effect:a=>Physics.birthdayShared(Math.max(1,Math.round(1+59*clamp(a)))),
  measure:['Chance two share a birthday',a=>BDAY.mode==='live'?(v=>v<.995?Math.round(v*100)+'%':(v*100).toFixed(1)+'%')(Physics.birthdayShared(Math.max(1,Math.round(1+59*clamp(a))))):''],scale:'',
  disclosure:'Exact for 365 equally likely birthdays, ignoring 29 February and twins. Real birthdays are slightly uneven, which makes a match a little more likely.',
  try:'Set “People” to 40: there are 780 pairs, and a shared birthday is 89% likely.',
  aria:'People sit around a circle with a line between every pair. With 23 people there are 253 pairs, and the chance that two share a birthday passes one half; with 50 people it is 97%.'},
 'sky-colour':{draw:drawSky,touch:SKY_TOUCH,demo:false,tryAny:true,a:['Sun height','how high the Sun is above the horizon'],b:['Unused','',''],
  fa:a=>a<.006?'on the horizon':`${Math.round(clamp(a)*90)}° up`,fb:b=>'',
  // The modelled effect for the render checks: the share of the Sun's blue light that reaches you directly.
  effect:a=>a<=0?0:Physics.skyThrough(450,clamp(a)*90),
  measure:['Sunlight’s blue that gets through',a=>SKY.mode==='live'?(v=>v<.01?(v*100).toFixed(2)+'%':Math.round(v*100)+'%')(a<=0?0:Physics.skyThrough(450,clamp(a)*90)):''],scale:'',
  disclosure:'Scattering by the molecules of clean air at sea level; it grows as the inverse fourth power of the wavelength, with blue taken as 450 nm and red as 700 nm. Sunlight shakes the electrons across its path, so they send light out in all directions, most strongly forward and back. Dust and haze add to real sunsets.',
  try:'Lower the Sun to the horizon: almost none of its blue gets through, and the light that reaches you turns red.',
  aria:'On the Moon, with no air, the daytime sky is black. On Earth, sunlight shakes tiny charged specks in the air, which send light off in every direction, blue about six times as much as red. That bounced blue reaches you from all over the sky: it is the blue sky. At sunset the light crosses far more air and loses almost all its blue the same way, so what is left looks red and orange.'},
 'attention':{draw:drawAttention,demo:false,tryAny:true,a:['Attention','off: one word at a time · on: look straight back'],b:['Unused','',''],
  fa:a=>a<.02?'off':Math.round(a*100)+'%',fb:b=>'',
  measure:['Chance of “French”',a=>ATTN.mode==='live'?Math.round(Physics.lookGuess(ATTN.strength)[0][1]*100)+'%':''],
  // The modelled effect for the render checks: how much likelier "French" gets with attention on.
  effect:a=>Physics.lookGuess(a)[0][1]-Physics.lookGuess(0)[0][1],scale:'',
  disclosure:'The shares are exact attention, the softmax of scaled dot products from “Attention Is All You Need” (2017), but on one hand-made sentence with four numbers per word; real models learn theirs, split words into pieces and run many attention heads in each of dozens of layers. The guesses come from a toy rule, not a real model. The older one-at-a-time models (recurrent networks) kept more than this fading memory suggests, but long text was hard for them and they could not be trained on all words at once. Attention itself is older than 2017; the paper’s step was to build the whole model from it. The first GPT appeared in 2018.',
  try:'Turn “Attention” down: the lines thin out and the guess grows unsure. Turn it back up.',aria:'A chatbot guesses the next word of “I grew up in France, so I speak fluent”. A fading memory loses the clue “France”; attention draws lines straight back to every earlier word, thickest to “France”, and the guess “French” becomes clear. Every word looks back at once, and the step stacked in layers is the Transformer.'}
};
const engineOf=spec=>ENGINES[spec?.kind]||ENGINES['light-bending'];

// Page and stage themes. Each guide names one (scene.theme), so guides differ in colour the way magazine articles do.
// A night stage is dark, so it is offered only to pictures drawn for one (DARK_READY); any other picture falls back to
// paper. Pictures read state.dark to choose light ink on a dark stage.
const THEMES={
 paper:{page:'#ffffff',top:'#fbf8f1',bottom:'#f3eee3',accent:'#e2832b',end:'rgba(239,232,220,.92)'},
 sage:{page:'#eaf1ed',top:'#f6faf7',bottom:'#e1ebe5',accent:'#0f766e',end:'rgba(214,230,221,.92)'},
 sky:{page:'#eaf0f7',top:'#f6f9fc',bottom:'#e0e9f4',accent:'#2563eb',end:'rgba(212,225,241,.92)'},
 sand:{page:'#f5efe4',top:'#fcf8f1',bottom:'#efe5d3',accent:'#b45309',end:'rgba(236,223,201,.92)'},
 lilac:{page:'#efecf6',top:'#f9f7fc',bottom:'#e6dff2',accent:'#6d28d9',end:'rgba(224,216,240,.92)'},
 rose:{page:'#f7edec',top:'#fdf7f6',bottom:'#f1e1de',accent:'#be123c',end:'rgba(240,220,216,.92)'},
 mist:{page:'#ebf0f1',top:'#f7f9fa',bottom:'#e0e8ea',accent:'#0e7490',end:'rgba(213,228,231,.92)'},
 night:{page:'#e8edf1',top:'#162030',bottom:'#0b1119',accent:'#d97706',end:'rgba(220,228,236,.92)',dark:true},
};
const DARK_READY=new Set(['light-clock','night-sky','speed-limit']);
function themeOf(spec){const t=THEMES[spec?.theme];return t&&(!t.dark||DARK_READY.has(spec.kind))?t:THEMES.paper;}
function draw(ctx,w,h,spec,state){engineOf(spec).draw(ctx,w,h,spec,{...state,dark:!!themeOf(spec).dark});}
window.CouncilDraw={draw,accent:spec=>ACCENT[spec.accent]||ACCENT.mint,disclosure:spec=>engineOf(spec).disclosure||'',theme:themeOf,themes:()=>Object.keys(THEMES),darkReady:kind=>DARK_READY.has(kind)};
window.CouncilLab={draw:drawLab,hit:labHit,view:()=>labXf};
// Subtitle pacing: comfortable reading speed, a minimum time on screen, and a pause between sentences.
const READING={cps:14,minimum:2.8,pause:.9,lead:.8,tail:.8};
// A guide's timeline from its text alone: chapter and sentence start and end times, in seconds.
function timelineOf(spec){
 let t=0;
 const chapters=spec.beats.map(beat=>{
  const start=t;t+=READING.lead;
  const lines=sentences(beat.body).map(text=>{const shown=Math.max(READING.minimum,text.length/READING.cps),line={text,start:t,end:t+shown};t+=shown+READING.pause;return line;});
  t+=READING.tail;return {start,end:t,lines};
 });
 // A scene may ask for a longer duration than reading needs; stretch evenly, never compress.
 const stretch=Math.max(1,spec.duration/t);
 for(const c of chapters){c.start*=stretch;c.end*=stretch;for(const l of c.lines){l.start*=stretch;l.end*=stretch;}}
 return {chapters,total:t*stretch};
}
// Pictures that other renderers can draw from plain state: the state at a moment, the landed dots for that state,
// and the timeline. Used by the visionOS app, which runs this file in JavaScriptCore.
const BENCHES={'two-slit-particles':{
 state(spec,st){const b=particlesBench(spec,st);return {stage:b.stage,A:b.A,known:b.known,n:b.n,
  geometry:{XB:b.XB,XS:b.XS,L:b.L,yc:b.yc,sw:b.sw,zs:b.zs,lam:b.lam},dots:`${b.A.toFixed(3)}|${b.known}|${b.stage>=6}`,
  fresh:b.slow&&!b.fly&&b.n>0,flash:b.flash,fronts:b.fronts,frontAlpha:b.frontAlpha,arcs:b.arcs,photon:b.leg&&b.leg.a>=.02?b.leg:null,
  sensor:b.sensor,up:b.up,click:b.click,dim:b.dimD,rings:b.compare?{fade:b.fade,points:b.rings}:null,labels:particlesLabels(spec,st,b)};},
 dots(spec,st,count){const b=particlesBench(spec,st);return Array.from({length:Math.max(0,Math.min(count,2400))},(_,i)=>b.dot(i));}}};
window.CouncilBench={kinds:()=>Object.keys(BENCHES),timeline:spec=>timelineOf(spec),
 state:(kind,spec,st)=>BENCHES[kind]?BENCHES[kind].state(spec,st):null,dots:(kind,spec,st,count)=>BENCHES[kind]?BENCHES[kind].dots(spec,st,count):[]};

const $=id=>document.getElementById(id);
const canvas=$('universe');
let timeline=null;
if(!canvas)return;
const ctx=canvas.getContext('2d');
let spec=null, time=0, mass=.7, distance=1.25, stage=2, mode='live', last=0, shown=0, started=false, ended=false, captionKey='';
const listeners=new Set(), emit=type=>listeners.forEach(fn=>fn(type));
function buildTimeline(){timeline=timelineOf(spec);}
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
function soundPluck(freq,gain=1){SOUND.queue.push([freq,gain]);}
function voice(){
 if(!SOUND.ctx||!SOUND.on){SOUND.queue.length=0;return;}
 while(SOUND.queue.length){const [f,g]=SOUND.queue.shift(), src=SOUND.ctx.createBufferSource();src.buffer=stringBuffer(f);
  if(g<.999){const v=SOUND.ctx.createGain();v.gain.value=Math.max(.08,g);src.connect(v);v.connect(SOUND.out);}else src.connect(SOUND.out);src.start();}
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
 // Engines time each chapter from the chapters passed here; previews pass none and fall back to their own frame.
 draw(ctx,w,h,spec,{t:time,since,stage,mass:shown,distance,labels:spec.show_labels,live,touched,playing:mode==='playing',chapters:timeline.chapters});
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
// A subtitle too long for one line breaks after the comma, colon or semicolon nearest its middle, when both halves fit
// on a line, so each line holds a whole phrase; otherwise the browser balances the two lines.
function phrased(text){
 const fit=44;if(text.length<=fit)return text;
 let best=-1;for(let i=0;i<text.length-1;i++)if(',:;'.includes(text[i])&&text[i+1]===' '&&(best<0||Math.abs(i-text.length/2)<Math.abs(best-text.length/2)))best=i;
 return best>=0&&best+1<=fit&&text.length-best-2<=fit?text.slice(0,best+1)+'\n'+text.slice(best+2):text;
}
// The hint on the end card. A readout label may be a function (it can change with the view), so it is called here.
function endHint(){
 const c=spec.controls||'both', e=engineOf(spec), m=e.measure?.[0], label=typeof m==='function'?m():m;
 if(!spec.next&&c!=='none'&&e.touch)return 'Now try it: '+e.touch.hint;
 return spec.next||(c==='none'?'':c==='both'||e.tryAny||!label?'Now try it: '+e.try:`Now try it: move ${(c==='first'?e.a:e.b)[0]} and watch “${label}”.`);
}
function captions(){
 let chapter, line, hint='';
 if(!started&&spec.opening){chapter=`Before you watch · ${fmt(timeline.total)}`;line=spec.opening;hint='Press play to find out.';}
 else if(!started){chapter=`${spec.beats.length} chapters · ${fmt(timeline.total)}`;line='Press play to watch the explanation.';}
 else if(ended&&mode!=='playing'){const c=spec.controls||'both', e=engineOf(spec);chapter='The idea';line=spec.takeaway||'';
  hint=endHint();}
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
 if(key!==captionKey){captionKey=key;body.textContent=phrased(line);body.classList.remove('enter');if(mode==='playing'){void body.offsetWidth;body.classList.add('enter');}}
}
function transport(){
 const progress=started?clamp(time/timeline.total):0, scrub=$('scrub');
 scrub.style.setProperty('--p',progress);scrub.setAttribute('aria-valuenow',String(Math.round(progress*100)));
 document.querySelectorAll('#ticks [data-beat]').forEach((tick,i)=>tick.classList.toggle('passed',started&&time>=timeline.chapters[i+1].start));
 $('clock-time').textContent=`${fmt(started?Math.min(time,timeline.total):0)} / ${fmt(timeline.total)}`;
 const play=$('play'), playing=mode==='playing';
 play.classList.toggle('is-playing',playing);play.setAttribute('aria-label',playing?'Pause':ended?'Replay':'Play');
 $('poster').hidden=started;
 document.querySelector('.workspace')?.classList.toggle('is-playing',playing);
 document.querySelector('.workspace')?.classList.toggle('started',started);
 document.querySelector('.workspace')?.classList.toggle('ended',ended&&!playing);
 document.body.classList.toggle('idea-shown',ended&&!playing);
 // The sliders show once playback has ended, or when the viewer opens them; never while it plays.
 const exploring=!playing&&(exploreOpen??(ended&&!direct()));
 document.querySelector('.workspace')?.classList.toggle('exploring',exploring);
 $('explore').setAttribute('aria-pressed',String(exploring));
}
// null: sliders follow playback (shown at the end); true or false: the viewer opened or closed them.
let exploreOpen=null;
const direct=()=>!!(spec&&spec.controls!=='none'&&engineOf(spec)?.touch);
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
 // A picture the viewer plays directly needs no sliders panel; it stays reachable from the keyboard.
 ws?.toggleAttribute('data-direct',direct());
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
 audioStart();started=true;ended=false;mode='playing';exploreOpen=null;last=0;touched=false;emit('play');paint();
}
function pause(){if(mode==='playing'){mode='paused';paint();}}
function toggle(){mode==='playing'?pause():play();}
// Seeking shows exactly what playback shows at that moment, including the last chapter's control demo.
let demoed=false;
// Whether the viewer has moved a control since playback last started; engines may hold a finished picture until then.
let touched=false;
function seek(t,beat=chapterAt(t)){
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
 touched=true;audioStart();
 explore();paint();
}

window.CouncilScene={load,seek,play,pause,toggle,chapter,render:t=>{time=t;paint();},labels:()=>lastLabels.slice(),
 getState:()=>({time,mass,distance,stage,mode,ended}),
 sound:()=>({on:SOUND.on,state:SOUND.ctx?.state||null,plucked:GUITAR.plucked.slice(),rope:{rate:ROPE.rate,size:+ROPE.size.toFixed(2)}}),
 timeline:()=>timeline&&JSON.parse(JSON.stringify(timeline)),endHint:()=>spec?endHint():'',on:fn=>listeners.add(fn),
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
$('scrub').addEventListener('keydown',e=>{if(!spec)return;const step=e.key==='ArrowRight'?5:e.key==='ArrowLeft'?-5:0;if(!step)return;e.preventDefault();e.stopPropagation();const box=$('scrub').getBoundingClientRect();scrubTo(box.left+12+clamp((time+step)/timeline.total)*(box.width-24));});
for(const id of ['mass','distance'])$(id).addEventListener('input',e=>input(id,Number(e.target.value)));
// Page-wide keys belong to the player only while a scene is loaded and the middle of its stage is on screen, and
// never to a field or button.
document.addEventListener('keydown',e=>{
 if(!spec||e.target.closest?.('input,textarea,select,button,a,summary,[contenteditable]')||e.metaKey||e.ctrlKey||e.altKey)return;
 const box=canvas.getBoundingClientRect(), middle=(box.top+box.bottom)/2;if(!box.height||middle<0||middle>innerHeight)return;
 if(e.key===' '){e.preventDefault();toggle();}
 else if(e.key==='ArrowRight'&&started){chapter(stage+1);}
 else if(e.key==='ArrowLeft'&&started){chapter(stage-1);}
});
// Direct play: an engine with touch lets the viewer move parts of the picture itself (pull a string, drag the Sun)
// instead of using sliders, once the guide has played. touch.grab returns a handle when the pointer is on one; move
// (while dragging) and release return new control values, limited to the controls the guide offers.
let grip=null;
const at=e=>{const b=canvas.getBoundingClientRect();return [e.clientX-b.left,e.clientY-b.top,b.width,b.height];};
const dragState=()=>({stage,mass:shown,distance,since:0,t:time,target:mass});
// A guide without controls offers nothing to touch either.
const touchOf=()=>spec&&spec.controls!=='none'?engineOf(spec)?.touch:null;
const handleAt=(x,y,w,h)=>{const t=touchOf();return t&&started&&mode==='live'?t.grab(w,h,spec,dragState(),x,y):null;};
function applyTouch(v,instant){
 if(!v)return;const c=spec.controls||'both';
 if(v.mass!==undefined&&c!=='second'){mass=Math.round(clamp(v.mass)*100)/100;if(instant)shown=mass;}
 if(v.distance!==undefined&&c!=='first')distance=Math.round(v.distance*100)/100;
 touched=true;audioStart();ended=true;explore();paint();
}
canvas.addEventListener('pointerdown',e=>{const [x,y,w,h]=at(e), hd=handleAt(x,y,w,h);if(!hd)return;
 grip={hd,x,y,moved:false};try{canvas.setPointerCapture(e.pointerId);}catch(error){}canvas.style.cursor=hd.cursor==='pointer'?'pointer':'grabbing';e.preventDefault();});
canvas.addEventListener('pointermove',e=>{const t=touchOf(), [x,y,w,h]=at(e);
 if(grip&&t){if(Math.hypot(x-grip.x,y-grip.y)>6)grip.moved=true;if(grip.moved&&t.move)applyTouch(t.move(w,h,spec,dragState(),x,y,grip.hd),true);return;}
 const hd=handleAt(x,y,w,h);canvas.style.cursor=hd?hd.cursor||'grab':'';});
const letGo=(e,cancel)=>{const t=touchOf(), g=grip;grip=null;if(!g||!t)return;const [x,y,w,h]=at(e);
 if(t.release)applyTouch(t.release(w,h,spec,dragState(),x,y,g.hd,g.moved||cancel),false);canvas.style.cursor='';};
canvas.addEventListener('pointerup',e=>letGo(e,false));
canvas.addEventListener('pointercancel',e=>letGo(e,true));
// On a phone, a touch that lands on something to drag plays the picture instead of scrolling the page. Things to tap
// (cursor pointer) leave scrolling alone: a tap still works, and a scroll cancels it.
canvas.addEventListener('touchstart',e=>{const p=e.touches[0], b=canvas.getBoundingClientRect(), hd=p&&handleAt(p.clientX-b.left,p.clientY-b.top,b.width,b.height);if(hd&&hd.cursor!=='pointer')e.preventDefault();},{passive:false});
new ResizeObserver(paint).observe(canvas);requestAnimationFrame(tick);
})();
