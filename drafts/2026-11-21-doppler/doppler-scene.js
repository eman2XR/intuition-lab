// Why a passing siren drops in pitch, on a night street seen from above, its sound drawn as glowing rings of squeezed
// air. Chapters: an ambulance passing you, its note high, then sliding low, while its driver hears one steady note;
// time slowed right down, a parked siren's rings reaching you at its own 700 a second; the siren driving, each ring
// starting from where it is and spreading at the speed of sound, so the rings bunch up ahead and spread out behind;
// 767 a second arriving ahead and 644 behind at 108 km/h; and why the note slides as it passes: only the part of its
// motion toward you counts. Numbers are Physics.dopplerHeard, passingNote and sirenCrests for a 700-hertz siren at 30
// metres a second. One ring is drawn for every ten squeezes of the air; the ring chapters run 24 times slower than
// real time, and the passing chapters slow the ambulance so it crosses the visible road in its chapter.
const DOPPLER={geo:null,hold:null,offset:0,live:null};
const DOP={every:10,slow:24,pass:8,side:7,top:120};
const dopplerSpeed=a=>DOP.top*clamp(a);
// After playback the viewer drags the ambulance along the road; it follows the finger smoothly, never faster than the
// slider's top speed.
const DOPPLER_TOUCH={hint:'drag the ambulance along the road and watch your note.',
 grab(w,h,spec,st,x,y){const g=DOPPLER.geo;if(!(g&&g.live&&Math.hypot(x-g.ax,y-g.ay)<g.reach))return null;DOPPLER.offset=(x-g.ax)/g.k;return {kind:'drive',cursor:'grab'};},
 move(w,h,spec,st,x,y){const g=DOPPLER.geo;if(!g)return null;DOPPLER.hold=(x-g.ox)/g.k-(DOPPLER.offset||0);return {};},
 release(){DOPPLER.hold=null;return {};}};
// The moment as plain values. The passing chapters (1 and 5) drive the ambulance past you, slowed so that it crosses the
// road you can see (span metres) during the chapter and passes you mid-chapter; the note you hear depends only on where
// it is. The ring chapters (2 to 4) run 24 times slower than real time, the siren parked and then driving, its rings
// already spreading when the chapter opens; chapter 4's drive is centred between its two listeners.
function dopplerPlan(spec,st,span=80){
 const preview=st.since===undefined, last=(st.chapters?.length||5)-1, stage=preview?2:Math.min(st.live?last:st.stage,last);
 const since=preview?9.5:Math.max(0,st.since), ch=st.chapters?.[stage], at=i=>ch?.lines?.[i]?ch.lines[i].start-ch.start:1+4*i;
 const live=!!st.live&&!preview, v=Physics.sirenSpeed;
 if(live)return {mode:'live',stage,since,at,live,preview};
 const dur=ch?ch.end-ch.start:18;
 if(stage===0||stage===4){const edge=span/2-6, t0=.3, pace=2*edge/Math.max(1,dur-.6), xAt=s=>-edge+pace*(s-t0);
  return {mode:'pass',stage,since,at,live,preview,v,x:xAt(since),xAt,t0,dur};}
 const drive=stage>=2, start=stage===1?1:-3, vs=v/DOP.slow, x0=stage===1?-.18*span:stage===2?-.3*span:-vs*(dur/2-start);
 return {mode:'rings',stage,since,at,live,preview,v:drive?v:0,x0,start,x:x0+(drive?v/DOP.slow*(since-start):0)};
}
// An ambulance seen from above, 6 m long and 2.3 m wide, its siren on the light bar at (x, y), facing dir (1 is +x).
function dopAmbulance(ctx,x,y,k,dir=1){
 const L=6*k, W=2.3*k;ctx.save();ctx.translate(x,y);ctx.scale(dir,1);ctx.translate(-.6*k,0);
 ctx.fillStyle='#f2f4f7';ctx.strokeStyle='rgba(0,0,0,.45)';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(-L/2,-W/2,L,W,W*.24);ctx.fill();ctx.stroke();
 ctx.fillStyle='#d4383b';ctx.fillRect(-L/2+L*.05,-W/2+W*.1,L*.6,W*.12);ctx.fillRect(-L/2+L*.05,W/2-W*.22,L*.6,W*.12);
 ctx.fillStyle='#24324f';ctx.beginPath();ctx.roundRect(L/2-L*.21,-W*.38,L*.12,W*.76,W*.08);ctx.fill();
 const g=ctx.createRadialGradient(L*.1,0,0,L*.1,0,W*1.3);g.addColorStop(0,'rgba(80,150,255,.5)');g.addColorStop(1,'rgba(80,150,255,0)');
 ctx.fillStyle=g;ctx.fillRect(L*.1-W*1.3,-W*1.3,W*2.6,W*2.6);ctx.fillStyle='#4b86ff';ctx.fillRect(L*.07,-W*.36,L*.07,W*.72);
 ctx.restore();
}
// A person seen from above, shoulders and head, facing the road (up).
function dopPerson(ctx,x,y,s,coat){
 ctx.fillStyle=coat;ctx.beginPath();ctx.ellipse(x,y+s*.08,s*.5,s*.27,0,0,TAU);ctx.fill();
 ctx.fillStyle='#e7c19c';ctx.beginPath();ctx.arc(x,y,s*.2,0,TAU);ctx.fill();
 ctx.fillStyle='#3a2a22';ctx.beginPath();ctx.arc(x,y+s*.03,s*.2,0,Math.PI);ctx.fill();
}
// The note heard over time, in a box: time across, the note up (lo to hi crests a second), a dashed line at the
// siren's own note, and the heard note as a line ending in a dot.
function dopPlot(ctx,box,lo,hi,t0,t1,samples,{label,steady,size,small}){
 // The two lines' names sit in a key just above the box, where the curve never goes.
 const [x,y,bw,bh]=box, f0=Physics.sirenNote, px=t=>x+56+(t-t0)/(t1-t0)*(bw-70), py=f=>y+bh-14-clamp((f-lo)/(hi-lo))*(bh-28);
 ctx.fillStyle='rgba(9,13,27,.86)';ctx.beginPath();ctx.roundRect(x,y,bw,bh,10);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.14)';ctx.lineWidth=1;ctx.stroke();
 text(ctx,'higher',x+12,y+16,{size:size-2,weight:700,color:'rgba(255,255,255,.8)'});text(ctx,'lower',x+12,y+bh-14,{size:size-2,weight:700,color:'rgba(255,255,255,.8)'});
 ctx.setLineDash([5,4]);trace(ctx,[[x+56,py(f0)],[x+bw-14,py(f0)]]);ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);
 if(samples.length>1){trace(ctx,samples.map(([t,f])=>[px(t),py(f)]));ctx.strokeStyle='#ffd36b';ctx.lineWidth=small?2.5:3;ctx.lineJoin='round';ctx.stroke();}
 const end=samples.at(-1);if(end){ctx.beginPath();ctx.arc(px(end[0]),py(end[1]),small?4:5,0,TAU);ctx.fillStyle='#ffd36b';ctx.fill();}
 let kx=x+bw-4;const ky=y-12;ctx.font=`700 ${size}px ${FONT}`;
 if(label){const lw=ctx.measureText(label).width;kx-=lw;text(ctx,label,kx,ky,{size,weight:700,color:'#ffd36b'});trace(ctx,[[kx-24,ky],[kx-6,ky]]);ctx.strokeStyle='#ffd36b';ctx.lineWidth=3;ctx.stroke();kx-=40;}
 if(steady){const lw=ctx.measureText(steady).width;kx-=lw;text(ctx,steady,kx,ky,{size,weight:700,color:'rgba(255,255,255,.85)'});ctx.setLineDash([5,4]);trace(ctx,[[kx-26,ky],[kx-6,ky]]);ctx.strokeStyle='rgba(255,255,255,.6)';ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);}
}
// The live play: where the ambulance has been, as samples of time and place, so each ring keeps the place it started
// from when the ambulance speeds up, turns or is dragged.
function dopLive(st,span){
 const t=st.t||0, c=Physics.soundSpeed/DOP.slow, vmax=DOP.top/DOP.slow, edge=span/2-4;
 let L=DOPPLER.live;
 if(!L||t<L.t-.001){L=DOPPLER.live={t,x:-span/4,dir:1,path:[[t-12,-span/4],[t,-span/4]],notes:[],speed:0};}
 const dt=Math.min(.1,t-L.t), x0=L.x;
 if(DOPPLER.hold!==null){const want=clamp(DOPPLER.hold,-edge,edge), step=clamp((want-L.x)*(1-Math.exp(-dt*10)),-vmax*dt,vmax*dt);L.x+=step;if(dt>0&&Math.abs(step)/dt>.4)L.dir=Math.sign(step);}
 else{L.x+=L.dir*dopplerSpeed(st.mass)/DOP.slow*dt;if(L.x>edge){L.x=edge;L.dir=-1;}if(L.x<-edge){L.x=-edge;L.dir=1;}}
 if(dt>0)L.speed+=(Math.abs(L.x-x0)/dt*DOP.slow-L.speed)*(1-Math.exp(-dt*6));L.t=t;
 if(dt>0)L.path.push([t,L.x]);while(L.path.length>2&&L.path[1][0]<t-12)L.path.shift();
 const at=s=>{const p=L.path;if(s<=p[0][0])return p[0][1];for(let i=p.length-1;i>0;i--)if(p[i-1][0]<=s){const [ta,xa]=p[i-1], [tb,xb]=p[i];return tb>ta?xa+(xb-xa)*(s-ta)/(tb-ta):xb;}return p[0][1];};
 // The note you hear now: the squeeze that reaches you left when its distance to you equalled the speed of sound
 // times its age; its pitch comes from how fast the ambulance was closing on you then.
 let note=Physics.sirenNote;
 for(let i=L.path.length-1;i>0;i--){const [ta,xa]=L.path[i-1], g=c*(t-ta)-Math.hypot(xa,DOP.side);
  if(g>=0){const [tb,xb]=L.path[i], gb=c*(t-tb)-Math.hypot(xb,DOP.side), s=gb<g?ta+(tb-ta)*g/(g-gb):ta, xs=at(s), u=(at(Math.min(t,s+.08))-at(s-.08))/(Math.min(t,s+.08)-s+.08);
   note=Physics.sirenNote/(1-u*(-xs)/(Math.hypot(xs,DOP.side)*c));break;}}
 L.notes.push([t,note]);while(L.notes.length>2&&L.notes[0][0]<t-10)L.notes.shift();
 const period=DOP.every/Physics.sirenNote*DOP.slow, rings=[];
 for(let k=Math.floor(t/period);k>=0&&rings.length<60;k--){const tk=k*period, r=c*(t-tk);if(r>span*.75)break;if(tk<L.path[0][0])break;rings.push({x:at(tk),r});}
 return {L,rings,note,t};
}
function drawDoppler(ctx,w,h,spec,st){
 const small=w<520, P=Physics, passView=!st.live&&st.since!==undefined&&(st.stage===0||st.stage===4);
 // Phones show 44 m of road where rings are drawn and 70 m in the passing chapters, so the ambulance starts further off.
 const span=small?(passView?70:44):80, plan=dopplerPlan(spec,st,span), labels=st.labels, size=small?11:13, ink='rgba(20,23,28,.85)';
 const k=w/span, ox=w/2, oy=h*(small?.3:.4), X=m=>ox+m*k, Y=m=>oy+m*k, f0=P.sirenNote;
 // The street at night: a road 7 m wide along x, a pavement on each side, a few lamps on the far one.
 ctx.fillStyle='#0b1020';ctx.fillRect(0,0,w,h);
 ctx.fillStyle='#151b2c';ctx.fillRect(0,Y(-8.5),w,5*k);ctx.fillRect(0,Y(3.5),w,5*k);
 ctx.fillStyle='#1c2335';ctx.fillRect(0,Y(-3.5),w,7*k);
 for(const y of [-3.5,3.5]){trace(ctx,[[0,Y(y)],[w,Y(y)]]);ctx.strokeStyle='rgba(255,255,255,.14)';ctx.lineWidth=1.5;ctx.stroke();}
 ctx.setLineDash([2.5*k,2*k]);trace(ctx,[[0,Y(0)],[w,Y(0)]]);ctx.strokeStyle='rgba(255,255,255,.2)';ctx.lineWidth=Math.max(1.5,.15*k);ctx.stroke();ctx.setLineDash([]);
 for(const lx of [-30,-10,10,30]){if(Math.abs(lx)>span/2)continue;const g=ctx.createRadialGradient(X(lx),Y(-7),0,X(lx),Y(-7),5*k);
  g.addColorStop(0,'rgba(255,196,120,.22)');g.addColorStop(1,'rgba(255,196,120,0)');ctx.fillStyle=g;ctx.fillRect(X(lx)-5*k,Y(-7)-5*k,10*k,10*k);
  ctx.beginPath();ctx.arc(X(lx),Y(-7),Math.max(2,.3*k),0,TAU);ctx.fillStyle='rgba(255,214,150,.9)';ctx.fill();}
 DOPPLER.geo=null;
 const tagAt=(s,x,y)=>{ctx.font=`700 ${size}px ${FONT}`;const half=ctx.measureText(s).width/2+14;pill(ctx,s,clamp(x,half,w-half),y,{align:'center',size,weight:700,color:ink});};
 const people=Math.max(small?20:28,1.7*k), youAt=[X(0),Y(DOP.side)], you=s=>{dopPerson(ctx,youAt[0],youAt[1],people,'#e0833a');if(labels&&s)pill(ctx,'you',youAt[0],youAt[1]+(small?22:26),{align:'center',size,weight:700,color:ink});};
 // Rings of squeezed air, each centred where it started, fading as it spreads.
 const rings=(list,dots,ticks=false,reach=span*.62)=>{const far=reach;
  for(const {x,r} of list){if(r<=0)continue;const fade=Math.pow(clamp(1-r/far),.8);if(fade<=0)continue;
   ctx.beginPath();ctx.arc(X(x),Y(0),r*k,0,TAU);ctx.strokeStyle=`rgba(140,220,255,${.12*fade})`;ctx.lineWidth=Math.max(5,.45*k);ctx.stroke();
   ctx.strokeStyle=`rgba(175,236,255,${.85*fade})`;ctx.lineWidth=Math.max(1.6,.13*k);ctx.stroke();
   if(dots){ctx.beginPath();ctx.arc(X(x),Y(0),Math.max(2.5,.2*k),0,TAU);ctx.fillStyle=`rgba(200,242,255,${.9*fade})`;ctx.fill();}
   if(ticks)for(const e of [x-r,x+r]){trace(ctx,[[X(e),Y(-1)],[X(e),Y(1)]]);ctx.strokeStyle=`rgba(230,250,255,${.95*fade})`;ctx.lineWidth=Math.max(2,.16*k);ctx.stroke();}}};
 // The note plot sits top right on a wide screen and under the street on a phone.
 const by0=Math.max(h*.66,Y(DOP.side)+58), box=small?[w*.05,by0,w*.9,Math.max(40,Math.min(h*.28,h-by0-8))]:[w*.6,Math.min(h-Math.min(150,h*.28)-14,Y(8.5)+30),Math.min(380,w*.36),Math.min(150,h*.28)];
 if(plan.mode==='pass'){
  const {since,at,stage}=plan, x=plan.x, lo=620, hi=790;
  you(true);dopAmbulance(ctx,X(x),Y(0),k,1);
  const dist=Math.hypot(x,DOP.side), note=P.passingNote(f0,plan.v,DOP.side,x);
  if(st.playing&&Math.abs(x)<70)soundTone(note,clamp(14/dist));
  if(stage===4&&X(x)>-3*k&&X(x)<w+3*k){
   // The ambulance's motion along the road, and the part of it toward you: the line from it to you, with an arrow as
   // long as its speed toward you, pointing at you while it comes and away once it has passed.
   const sx=X(x), sy=Y(0), dx=youAt[0]-sx, dy=youAt[1]-sy, d=Math.hypot(dx,dy), cos=-x/Math.hypot(x,DOP.side), A=(small?46:70);
   trace(ctx,[[sx,sy],[youAt[0],youAt[1]]]);ctx.setLineDash([4,5]);ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);
   // Its whole motion, faintly, along the road ahead of it.
   {const fx0=sx+3.4*k, fx1=Math.min(fx0+A,w-18);if(fx1-fx0>14){trace(ctx,[[fx0,sy],[fx1,sy]]);ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.moveTo(fx1+7,sy);ctx.lineTo(fx1-2,sy-5);ctx.lineTo(fx1-2,sy+5);ctx.closePath();ctx.fillStyle='rgba(255,255,255,.45)';ctx.fill();}}
   const ux=dx/d, uy=dy/d, s0=Math.min(d*.4,1.6*k), bx=sx+ux*s0*Math.sign(cos||1), by=sy+uy*s0*Math.sign(cos||1);
   let len=A*cos;{const room=ux*len>0?(w-18-bx)/(ux||1e-9):(18-bx)/(ux||-1e-9);if(Math.abs(len)>Math.abs(room))len=Math.sign(len)*Math.abs(room);}
   const ex=bx+ux*len, ey=by+uy*len;
   if(Math.abs(cos)>.04){trace(ctx,[[bx,by],[ex,ey]]);ctx.strokeStyle='rgba(20,23,40,.8)';ctx.lineWidth=(small?3:4)+3;ctx.lineCap='round';ctx.stroke();ctx.strokeStyle='#ffd36b';ctx.lineWidth=small?3:4;ctx.stroke();
    const s=Math.sign(cos), hx=ex, hy=ey, a=Math.atan2(uy*s,ux*s);ctx.beginPath();ctx.moveTo(hx+Math.cos(a)*9,hy+Math.sin(a)*9);ctx.lineTo(hx+Math.cos(a+2.5)*9,hy+Math.sin(a+2.5)*9);ctx.lineTo(hx+Math.cos(a-2.5)*9,hy+Math.sin(a-2.5)*9);ctx.closePath();ctx.fillStyle='#ffd36b';ctx.fill();
    // Its tag sits above the road, never between the ambulance and you: over the ambulance while it comes, and to its
    // left once it goes, clear of the arrow pointing away.
    if(labels&&sx>-20&&sx<w+20){const s=cos>0?'speed toward you':'speed away from you';ctx.font=`700 ${size}px ${FONT}`;const half=ctx.measureText(s).width/2+8;
     tagAt(s,cos>0?sx:sx-half,Y(-3.3)-(small?2:0));}}
  }
  const samples=[];for(let s=0;s<=since+1e-9;s+=.05)samples.push([s,P.passingNote(f0,plan.v,DOP.side,plan.xAt(s))]);
  dopPlot(ctx,box,lo,hi,0,Math.max(plan.dur,since),samples,{label:labels?'your note':'',steady:labels?'siren’s own note':'',size,small});
  return;
 }
 if(plan.mode==='rings'){
  const {since,at,stage}=plan, tr=(since-plan.start)/DOP.slow, list=P.sirenCrests(plan.v,DOP.every/f0,tr,plan.x0);
  rings(list,false,stage>=2,stage===3?Math.max(span*.62,span/2+14):span*.62);dopAmbulance(ctx,X(plan.x),Y(0),k,1);
  // Where each ring started: gold dots on a faint gold line along the road, over the ambulance where it has since
  // driven on.
  if(stage===2){const seen=list.filter(c=>c.r<span*.62);if(seen.length>1){trace(ctx,[[X(seen.at(-1).x),Y(0)],[X(plan.x),Y(0)]]);ctx.strokeStyle='rgba(255,211,107,.55)';ctx.lineWidth=2;ctx.stroke();}
   for(const {x,r} of seen){const fade=Math.pow(clamp(1-r/(span*.62)),.6);ctx.beginPath();ctx.arc(X(x),Y(0),Math.max(3,.24*k),0,TAU);ctx.fillStyle=`rgba(255,211,107,${fade})`;ctx.fill();ctx.strokeStyle=`rgba(20,23,40,${.9*fade})`;ctx.lineWidth=1.2;ctx.stroke();}}
  const flash=(px,py,d)=>{const hit=list.find(c=>c.r>=d);if(!hit)return;const age=(hit.r-d)/(P.soundSpeed/DOP.slow), g=ctx.createRadialGradient(px,py,0,px,py,1.8*k+14);
   g.addColorStop(0,`rgba(175,236,255,${.55*Math.exp(-age/.12)})`);g.addColorStop(1,'rgba(175,236,255,0)');ctx.fillStyle=g;ctx.fillRect(px-60,py-60,120,120);};
  if(stage===1){you(since<at(2));
   // Your ear lights up as each ring reaches it.
   flash(youAt[0],youAt[1],Math.hypot(plan.x,DOP.side));
   if(labels&&since>=at(1))tagAt('parked: 700 squeezes a second',X(plan.x),Y(-3.3));
   if(labels&&since>=at(2))tagAt('you count 700 a second',youAt[0],youAt[1]+(small?22:26));}
  if(stage===2&&labels){
   if(since>=at(1)){tagAt('sound: 1,235 km/h',w/2,Math.max(size+10,Y(-11)));tagAt('108 km/h',X(plan.x),Y(-3.3));}
   // The two tags go either side of the ambulance; on a narrow stage where they would meet, 'spread out' moves above the road.
   if(since>=at(2)){ctx.font=`700 ${size}px ${FONT}`;const a=ctx.measureText('bunched up').width/2+14, b=ctx.measureText('spread out').width/2+14;
    const bx=clamp(X(plan.x)+(small?70:130),a,w-a), sx=clamp(X(plan.x)-(small?70:140),b,w-b), apart=bx-sx>=a+b-10;
    tagAt('bunched up',bx,Y(2.4));tagAt('spread out',sx,apart?Y(2.4):Y(-2.4));}}
  if(stage===3){const ahead=span/2-(small?2.5:5), behind=-ahead;
   for(const px of [ahead,behind]){const near=list.find(c=>c.r>=Math.abs(px-c.x));flash(X(px),Y(0),near?Math.abs(px-near.x):1e9);dopPerson(ctx,X(px),Y(0),people,px>0?'#e0833a':'#7aa6d6');}
   if(labels){tagAt('108 km/h',X(plan.x),Y(-3.3));
    // Each count sits under its listener, kept inside the picture.
    const under=(s,px)=>{ctx.font=`700 ${size}px ${FONT}`;const half=ctx.measureText(s).width/2+8;pill(ctx,s,clamp(X(px),half,w-half),Y(3.8),{align:'center',size,weight:700,color:ink});};
    if(since>=at(1))under(`you count ${Math.round(P.dopplerHeard(f0,plan.v,0))} a second`,ahead);
    if(since>=at(2))under(`behind: ${Math.round(P.dopplerHeard(f0,plan.v,Math.PI))} a second`,behind);}}
  return;
 }
 // Live play: the ambulance drives back and forth at the chosen speed, or follows the viewer's finger.
 const {L,rings:list,note,t}=dopLive(st,span);
 rings(list,false);you(true);dopAmbulance(ctx,X(L.x),Y(0),k,L.dir);
 if(DOPPLER.hold!==null){ctx.globalAlpha=.3;dopAmbulance(ctx,X(clamp(DOPPLER.hold,-span/2+4,span/2-4)),Y(0),k,L.dir);ctx.globalAlpha=1;}
 for(const sgn of [-1,1]){const ax=X(L.x)+sgn*(4.3*k+8), z=small?5:6;ctx.beginPath();ctx.moveTo(ax+sgn*z,Y(0));ctx.lineTo(ax-sgn*z*.6,Y(0)-z);ctx.lineTo(ax-sgn*z*.6,Y(0)+z);ctx.closePath();ctx.fillStyle='rgba(255,255,255,.8)';ctx.fill();}
 DOPPLER.geo={live:true,ax:X(L.x),ay:Y(0),reach:Math.max(34,3.6*k),ox,k};
 const dist=Math.hypot(L.x,DOP.side);soundTone(note,clamp(14/dist));
 // The plot's range covers the chosen speed's two notes and every note now on the plot, so nothing is drawn flat on
 // its edges.
 const vr=Math.max(30,dopplerSpeed(st.mass));let nlo=f0*P.soundSpeed/(P.soundSpeed+vr), nhi=f0*P.soundSpeed/(P.soundSpeed-vr);
 for(const [,f] of L.notes){nlo=Math.min(nlo,f);nhi=Math.max(nhi,f);}
 const lo=nlo*.985, hi=nhi*1.015;
 dopPlot(ctx,box,lo,hi,t-10,t,L.notes,{label:labels?'your note':'',steady:labels?'siren’s own note':'',size,small});
 if(labels)tagAt(`${DOPPLER.hold===null?Math.round(dopplerSpeed(st.mass)*3.6):Math.round(L.speed*3.6/5)*5} km/h`,X(L.x),Y(-3.3));
}
