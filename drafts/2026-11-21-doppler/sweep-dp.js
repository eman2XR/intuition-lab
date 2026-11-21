// Draws the Doppler picture with a recording canvas at many stage sizes and moments and reports labels outside the
// picture or on each other, a listener, the plot or the ambulance, and listeners or the ambulance outside the picture.
// Usage: node sweep-dp.js <root> <scene.json>
const fs=require('fs');const root=process.argv[2], scene=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
global.window=globalThis;global.document={getElementById:()=>null};
let src=fs.readFileSync(root+'/web/scene.js','utf8');
const hook=(a,b)=>{if(!src.includes(a))throw new Error('hook not found: '+a.slice(0,60));src=src.replace(a,b);};
hook('function dopAmbulance(ctx,x,y,k,dir=1){','function dopAmbulance(ctx,x,y,k,dir=1){__rec.push({k:"van",x0:x-dir*.6*k-3*k,x1:x-dir*.6*k+3*k,y0:y-1.15*k,y1:y+1.15*k,alpha:ctx.globalAlpha});');
hook('function dopPerson(ctx,x,y,s,coat){','function dopPerson(ctx,x,y,s,coat){__rec.push({k:"person",x,y,r:s*.5});');
hook('function dopPlot(ctx,box,lo,hi,t0,t1,samples,{label,steady,size,small}){','function dopPlot(ctx,box,lo,hi,t0,t1,samples,{label,steady,size,small}){__rec.push({k:"plot",x0:box[0],y0:box[1]-22,x1:box[0]+box[2],y1:box[1]+box[3]});');
hook('function pill(ctx,value,x,y,opts={}){','function pill(ctx,value,x,y,opts={}){{const z=opts.size||11, wd=String(value).length*z*.6, l=opts.align==="right"?x-wd:opts.align==="center"?x-wd/2:x;__rec.push({k:"pill",v:String(value),x0:l-5,y0:y-z*.75,x1:l+wd+5,y1:y+z*.75});}');
hook('window.CouncilBench=','window.__dop={drawDoppler,timelineOf,dopplerPlan,DOPPLER};window.CouncilBench=');
global.__rec=[];
eval(fs.readFileSync(root+'/web/physics.js','utf8')+'\n'+src);
const D=window.__dop;
const ctx=new Proxy({font:'13px x',globalAlpha:1},{get(t,k){if(k in t)return t[k];if(k==='measureText')return s=>({width:String(s).length*(parseFloat(String(t.font).match(/(\d+(\.\d+)?)px/)?.[1]||13))*.6});
  if(k==='createRadialGradient'||k==='createLinearGradient')return()=>({addColorStop(){}});return()=>{};},set(t,k,v){t[k]=v;return true;}});
const C=D.timelineOf(scene).chapters, issues={}, add=(key,msg)=>{(issues[key]=issues[key]||new Map()).set(msg,((issues[key].get(msg))||0)+1);};
const overlap=(a,b)=>a.x0<b.x1&&a.x1>b.x0&&a.y0<b.y1&&a.y1>b.y0, hitsCircle=(r,c)=>{const x=Math.max(r.x0,Math.min(c.x,r.x1)), y=Math.max(r.y0,Math.min(c.y,r.y1));return Math.hypot(x-c.x,y-c.y)<c.r;};
function frame(w,h,st,key){__rec=[];
 try{D.drawDoppler(ctx,w,h,scene,st);}catch(e){add(key,'THROWS '+e.message);return;}
 const pills=__rec.filter(r=>r.k==='pill'), people=__rec.filter(r=>r.k==='person'), plots=__rec.filter(r=>r.k==='plot'), vans=__rec.filter(r=>r.k==='van'&&r.alpha>.9);
 for(const p of pills){if(p.x0<-1||p.x1>w+1||p.y0<-1||p.y1>h+1)add(key,`pill outside: ${p.v}`);
  for(const q of pills)if(q!==p&&q.v<p.v&&overlap(p,q))add(key,`pills overlap: ${p.v} / ${q.v}`);
  for(const c of people)if(hitsCircle(p,c))add(key,`pill on listener: ${p.v}`);
  for(const b of plots)if(overlap(p,b))add(key,`pill on plot: ${p.v}`);
  for(const v of vans)if(overlap(p,v))add(key,`pill on ambulance: ${p.v}`);}
 for(const c of people)if(c.x-c.r<-1||c.x+c.r>w+1||c.y-c.r<-1||c.y+c.r>h+1)add(key,'listener outside');
 const st0=st.live?null:st.stage;
 for(const v of vans)if((st0>=1&&st0<=3)&&(v.x0<-1||v.x1>w+1))add(key,'ambulance cut off');
 for(const v of vans)for(const c of people)if(hitsCircle(v,c))add(key,'ambulance on listener');
}
const widths=[320,360,375,390,414,480,520,560,603,640,704,756,820,868,960,1024,1176,1216,1240,1366], aspects=[.21,.27,.33,.45,.6,.8,1.25];
for(const w of widths)for(const a of aspects){const h=Math.round(w*a);if(h<260||h>1100)continue;
 for(let stage=0;stage<C.length;stage++){const c=C[stage];for(let s=0;s<=c.end-c.start;s+=.2)frame(w,h,{t:c.start+s,since:s,stage,mass:.25,distance:1,labels:true,live:false,playing:false,chapters:C},`${w}x${h} ch${stage+1}`);}
 D.DOPPLER.live=null;D.DOPPLER.hold=null;
 for(const m of [.25,1])for(let k=0;k<240;k++)frame(w,h,{t:200+k/30,since:99,stage:C.length-1,mass:m,distance:1,labels:true,live:true,playing:false,chapters:C},`${w}x${h} live`);
 frame(w,h,{labels:true},`${w}x${h} preview`);}
let n=0;for(const [k,m] of Object.entries(issues)){console.log(k,JSON.stringify(Object.fromEntries(m)));for(const v of m.values())n+=v;}
console.log(n?`${n} problems`:'no problems');
