const $=id=>document.getElementById(id);
const put=(id,text)=>{const el=$(id);if(el)el.textContent=text??'';};
const el=(tag,props={},...children)=>{const node=Object.assign(document.createElement(tag),props);node.append(...children);return node;};
const TOPICS={'gravity-clocks':'Gravity and time','light-bending':'Gravity and light','spacetime':'Space and time','twin-trip':'Space and time','interference':'Waves','standing-waves':'Waves','two-slit-particles':'Quanta','tunneling':'Quanta','wave-packet':'Quanta','quantum-well':'Quanta','falling-time':'Gravity and time','diffraction':'Waves','spacetime-paths':'Space and time','light-clock':'Space and time','river':'Black holes','fall-views':'Gravity and time','tides':'Curved spacetime','lift':'Gravity and time','moon-tides':'Gravity and time','attention':'How AI reads','speed-limit':'Space and time','base-rate':'Chance and evidence','birthdays':'Chance and evidence','sky-colour':'Light and colour','seasons':'Earth and sky','night-sky':'The universe'};
// The accuracy reviewer checks physics for physics guides and the mathematics for the others.
const REVIEWED={'attention':'accuracy','birthdays':'maths'};
const STATUS={planning:'Choosing a question',running:'Investigating now',reviewed:'Passed review',needs_review:'Draft, not published',failed:'Attempt stopped',interrupted:'Run interrupted',idle:'Resting'};
const STEPS=['Question','Research','Design','Write','Render','Review','Publish'];
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let current=null, entries=[], example=null;
const requestedGuide=new URLSearchParams(location.search).get('guide');
const requestedDraft=new URLSearchParams(location.search).get('draft');
const VIEW=requestedGuide||requestedDraft?'article':'home';
let drafts=[];
document.body.dataset.view=VIEW;
// With the header hidden on an investigation, the reading bar's mark leads home.
if(VIEW==='article')document.querySelector('#readbar a').href='./';
const records=new Map();

function safeURL(url){try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function topicOf(data){return TOPICS[data?.scene?.kind]||TOPICS[data?.topic]||TOPICS['light-bending'];}
function day(iso,opts={month:'short',day:'numeric'}){const d=new Date(iso);return isNaN(d)?'':d.toLocaleDateString(undefined,opts);}

const watched=(()=>{try{return new Set(JSON.parse(localStorage.getItem('council-watched')||'[]'));}catch{return new Set();}})();
function markWatched(id){if(!id||watched.has(id))return;watched.add(id);try{localStorage.setItem('council-watched',JSON.stringify([...watched]));}catch{}renderCards();}
CouncilScene.on(type=>{
 if(type==='ended')markWatched(current?.id);
});

// Heading, why it matters and the idea for one scene.
// Text with the scene's links, if any, turned into safe links on their first mention.
function linked(text,links=[]){
 const parts=[text];
 for(const {text:words,url} of links||[]){const href=safeURL(url);if(!href||!words)continue;
  const i=parts.findIndex(p=>typeof p==='string'&&p.includes(words));if(i<0)continue;const at=parts[i].indexOf(words);
  parts.splice(i,1,parts[i].slice(0,at),el('a',{href,target:'_blank',rel:'noopener noreferrer',textContent:words}),parts[i].slice(at+words.length));}
 return parts.filter(p=>p!=='');
}
function heading(scene){
 put('title',scene.title);$('why').replaceChildren(...linked(scene.why||scene.subtitle||'',scene.links));put('takeaway',scene.takeaway);
}

function show(data,{autoplay=false}={}){
 current=data;const scene=data.scene, fixture=data.provider==='fixture', draft=data.provider==='draft';
 document.body.dataset.draft=draft?'yes':'';
 if(scene){heading(scene);CouncilScene.load(scene);}
 put('hero-topic',topicOf(data));put('readbar-title',(scene?.title||'').replace(/\n/g,' '));
 // Published date, with the date of the last change when a guide was revised on a later day.
 const long={year:'numeric',month:'long',day:'numeric'}, made=new Date(data.created), edited=new Date(data.updated);
 put('hero-date',isNaN(made)?'':day(data.created,long)+(!isNaN(edited)&&edited.toDateString()!==made.toDateString()?` · Updated ${day(data.updated,long)}`:''));
 put('run-banner',fixture?'Hand-written example · scripted reviews':data.error?'Stopped · partial work kept as a draft':STATUS[data.status]||String(data.status||'').replaceAll('_',' '));
 $('run-banner').dataset.status=fixture?'example':data.status||'';
 if(data.provenance?.sources_retrieved===false){put('run-banner','Reviewed · sources not retrieved');$('run-banner').dataset.status='unverified';}
 if(draft){put('run-banner','Not reviewed by the lab');$('run-banner').dataset.status='draft';}
 put('draft-note',draft&&scene?CouncilDraw.disclosure(scene):'');
 renderBehind(data);renderCards();updateTalk();renderPath();
 if(autoplay)CouncilScene.play();
}

function renderBehind(data){
 const r=data.research, fixture=data.provider==='fixture', revisions=data.revisions||[], final=revisions.at(-1);
 const chips=[], field=REVIEWED[data.scene?.kind]||'physics';
 if(final?.physics_review&&final?.visual_review)chips.push(final.accepted?(final.learner_review?`Passed ${field}, visual and beginner review`:`Passed ${field} and visual review`):'Reviews requested changes');
 if(revisions.length>1)chips.push(`${revisions.length} drafts`);
 const checks=data.checks||[];if(checks.length)chips.push(`${checks.filter(c=>c.pass).length} of ${checks.length} checks`);
 if(fixture)chips.unshift('Scripted example');
 if(data.provenance?.sources_retrieved===false)chips.unshift('Sources not retrieved');
 put('review-summary',chips.join(' · '));
 if(!r)return;
 put('claim',r.claim);put('falsifier',r.falsifier);put('prediction',r.prediction);
 $('limits').replaceChildren(...[...(r.assumptions||[]),...(r.limitations||[])].map(x=>el('li',{textContent:x})));
 $('checks').replaceChildren(...checks.map(x=>el('li',{textContent:x.name,className:x.pass?'pass':'fail'})));
 put('history-label',fixture?'· scripted demonstration':`· ${revisions.length} saved`);
 $('history').replaceChildren(...revisions.map((rev,i)=>{
  const card=el('article',{className:'revision'});
  if(rev.frames?.length)card.append(el('img',{src:rev.frames[0],alt:`Rendered frame from draft ${i+1}`}));
  const verdict=rev.accepted?(fixture?'Fixture passed':'Passed review'):'Changes requested';
  const notes=[rev.visual_review?.summary,rev.physics_review?.summary,rev.learner_review?.summary].filter(Boolean).join(' ');
  const view=el('button',{type:'button',className:'pill',textContent:'View this draft'});
  view.onclick=()=>{CouncilScene.load(rev.scene);heading(rev.scene);
   put('run-banner',`Draft ${i+1} · ${verdict.toLowerCase()}`);scrollTo({top:0,behavior:reduceMotion?'auto':'smooth'});};
  card.append(el('div',{},el('h4',{textContent:`Draft ${i+1} · ${verdict}`}),el('p',{textContent:notes||'Waiting for review'}),view));
  return card;
 }));
 put('sources-note',data.provenance?.sources_retrieved===false?data.provenance.note:'');
 put('illustration-note',[data.scene?CouncilDraw.disclosure(data.scene):'',data.provenance?.intro_note||''].filter(Boolean).join(' '));
 $('sources').replaceChildren(...(r.sources||[]).map(s=>{const url=safeURL(s.url), item=el('div');
  item.append(url?el('a',{href:url,target:'_blank',rel:'noopener noreferrer',textContent:s.title}):el('span',{textContent:s.title}),el('small',{textContent:s.supports}));return item;}));
 put('record',JSON.stringify(data,null,2));
}

/* Cards with small live previews drawn by the same renderer as the main stage. */
const thumbs=new Set();
const visible=new IntersectionObserver(items=>items.forEach(i=>i.target.classList.toggle('in-view',i.isIntersecting)));
function card(entry,record){
 const isExample=entry.id==='example', id=entry.id;
 const link=el('a',{href:entry.draft?'?draft='+encodeURIComponent(id):isExample?'?guide=example':'?guide='+encodeURIComponent(id),className:'card'});
 if(!isExample)link.dataset.guide=id;else link.dataset.example='';
 const canvas=el('canvas',{className:'thumb',ariaHidden:'true'});
 const media=el('div',{className:'card-media'},canvas,el('span',{className:'mini-play',ariaHidden:'true'}));
 const badge=el('span',{className:'badge'});
 if(current&&(current.id===id||(isExample&&current.provider==='fixture'))){badge.textContent='Now showing';badge.dataset.kind='now';}
 else if(!isExample&&!watched.has(id)&&Date.now()-new Date(entry.created).getTime()<36*3600*1000){badge.textContent='New';badge.dataset.kind='new';}
 else if(watched.has(id)){badge.textContent='Watched';badge.dataset.kind='seen';}
 const meta=el('p',{className:'card-meta'},el('span',{className:'card-go',textContent:'Watch the guide'}),el('span',{className:'card-by'},isExample?'Hand-written example':day(entry.created,{month:'long',day:'numeric'}),badge));
 const excerpt=el('p',{className:'card-excerpt',textContent:record?.scene?.subtitle||entry.question||''});
 link.append(media,el('div',{className:'card-body'},el('span',{className:'card-cat',textContent:isExample?'Example':topicOf(record||entry)}),el('h3',{textContent:(entry.title||entry.question||'').replace(/\n/g,' ')}),excerpt,meta));
 if(record?.scene){canvas.scene=record.scene;thumbs.add(canvas);visible.observe(canvas);}
 return link;
}
function thumbCard(entry,record){
 const link=el('a',{href:(entry.draft?'?draft=':'?guide=')+encodeURIComponent(entry.id),className:'thumb-card'});
 if(!entry.draft)link.dataset.guide=entry.id;
 const canvas=el('canvas',{className:'thumb',ariaHidden:'true'});
 link.append(el('div',{className:'card-media'},canvas,el('span',{className:'mini-play',ariaHidden:'true'})),
  el('span',{className:'card-cat',textContent:topicOf(record||entry)}),el('h3',{textContent:(entry.title||entry.question||'').replace(/\n/g,' ')}));
 if(record?.scene){canvas.scene=record.scene;thumbs.add(canvas);visible.observe(canvas);}
 return link;
}
function renderCards(){
 thumbs.forEach(c=>visible.unobserve(c));thumbs.clear();
 if(VIEW==='home'){
  // The newest published investigation leads; every other one follows in a single grid.
  const lead=[...entries].sort((a,b)=>new Date(b.created||0)-new Date(a.created||0))[0];
  const leadCard=lead?card(lead,records.get(lead.id)):example?card({id:'example',title:example.scene.title.replace(/\n/g,' ')},example):null;
  leadCard?.classList.add('featured-card');
  $('featured').replaceChildren(...(leadCard?[el('p',{className:'lab-latest',textContent:'Latest from the lab'}),leadCard]:[]));
  put('past-title','Investigations');put('past-count',entries.length?`${entries.length} investigation${entries.length>1?'s':''}`:'');
  $('gallery').replaceChildren(...gallery(lead));
 }else{
  // Related first: investigations from the same chapter, then the rest.
  const chapterOf=e=>String(e?.curriculum||'').split('.')[0], here=chapterOf(current);
  const pool=[...entries,...drafts].sort((a,b)=>(chapterOf(b)===here&&!!here)-(chapterOf(a)===here&&!!here));
  const others=pool.filter(e=>e.id!==current?.id).slice(0,4);
  $('more-list').replaceChildren(...others.map(e=>thumbCard(e,records.get((e.draft?'draft:':'')+e.id))));
  $('more').hidden=!others.length;
 }
 paintThumbs(true);
}
let lastThumb=0;
function paintThumbs(force){
  for(const canvas of thumbs){
   if(!force&&!canvas.classList.contains('in-view'))continue;
   if(!force&&!canvas.closest('.card,.thumb-card').matches(':hover'))continue;
   const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(2,devicePixelRatio||1);if(!w||!h)continue;
   if(canvas.width!==Math.round(w*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
   const ctx=canvas.getContext('2d'),s=canvas.scene;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
   // Previews hold a still frame and only animate while hovered.
   canvas.clock=force?s.duration*.3:(canvas.clock??s.duration*.3)+.033;
   CouncilDraw.draw(ctx,w,h,s,{t:canvas.clock,stage:2,mass:s.mass,distance:s.distance,labels:false});
  }
}
function thumbLoop(now){
 if(!reduceMotion&&now-lastThumb>33){lastThumb=now;paintThumbs(false);}
 requestAnimationFrame(thumbLoop);
}
requestAnimationFrame(thumbLoop);
addEventListener('resize',()=>paintThumbs(true));

async function getDraft(id){
 const key='draft:'+id;if(records.has(key))return records.get(key);
 if(!/^[A-Za-z0-9-]+$/.test(id))throw Error('Invalid draft');
 const response=await fetch('drafts/'+id+'.json',{cache:'no-store'});if(!response.ok)throw Error('Missing draft');
 const record=await response.json();records.set(key,record);return record;
}
async function getRecord(id){
 if(id==='example')return example||(example=await (await fetch('example.json')).json());
 if(records.has(id))return records.get(id);
 if(!/^[A-Za-z0-9-]+$/.test(id))throw Error('Invalid guide');
 const response=await fetch('published/'+id+'/record.json',{cache:'no-cache'});if(!response.ok)throw Error('Missing guide');
 const record=await response.json();records.set(id,record);return record;
}
async function openGuide(id,{autoplay=false}={}){
 try{show(await getRecord(id),{autoplay});}
 catch{if(!current)show(await getRecord('example'));}
}

async function loadPublished(){
 try{const response=await fetch('published/index.json',{cache:'no-store'});entries=response.ok?await response.json():[];}catch{entries=[];}
 try{example=await (await fetch('example.json')).json();}catch{example=null;}
 try{const r=await fetch('drafts/index.json',{cache:'no-store'});drafts=r.ok?(await r.json()).map(d=>({...d,draft:true})):[];}catch{drafts=[];}
 if(requestedDraft){try{show(await getDraft(requestedDraft));}catch{await openGuide('example');}}
 else if(VIEW==='article')await openGuide(entries.find(e=>e.id===requestedGuide)?.id||(requestedGuide==='example'||!entries.length?'example':requestedGuide));
 // Fetch the remaining records for previews without blocking the main guide.
 await Promise.all([...entries.slice(0,24).map(e=>getRecord(e.id).catch(()=>null)),...drafts.map(d=>getDraft(d.id).catch(()=>null))]);
 renderCards();renderPath();
}

loadPublished();

/* Lab status from the published snapshot. It is not a live heartbeat. */
let schedule=null, labActive=false, labQuestion='', attempts=[], labStep=1, labStatus=null, labNext='';
function stepOf(state){
 if(state.status==='planning')return 0;
 if(state.status==='reviewed')return 7;
 const message=(state.events?.at(-1)?.message||'').toLowerCase();
 if(message.includes('gates passed'))return 6;
 if(message.includes('changes requested')||message.includes('writer is writing')||message.includes('director'))return 3;
 if(message.includes('designer is planning'))return 2;
 if(message.includes('review')||message.includes('inspecting'))return 5;
 if(message.includes('rendering'))return 4;
 return 1;
}
function plain(message){return (message||'').replace('physics_review','physics review').replace('visual_review','visual review').replace('learner_review','beginner review').replace(/^Revision (\d+)/,'Draft $1');}
function nextRun(s){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:s.timezone,hour:'numeric',minute:'numeric',second:'numeric',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
 const now=+parts.hour*3600+ +parts.minute*60+ +parts.second, at=s.hour*3600;
 const wait=at>now?at-now:at-now+86400;
 const zone=new Intl.DateTimeFormat('en-US',{timeZone:s.timezone,timeZoneName:'short'}).formatToParts(new Date()).find(p=>p.type==='timeZoneName')?.value||'';
 const hour=`${s.hour%12||12}:00 ${s.hour<12?'AM':'PM'}`;
 return {label:`${at>now?'Today':'Tomorrow'} · ${hour} ${zone}`,wait};
}
function renderNext(){
 if(schedule?.enabled){
  const {label,wait}=nextRun(schedule), hours=Math.floor(wait/3600), minutes=Math.floor(wait%3600/60);
  // One short phrase; the exact time is in the tooltip.
  put('next-title',labActive?'':`Next run in ${hours?hours+' h ':''}${minutes} min`);$('next-title').title=label;
  if(labPreview)labPreview.shown='';
  put('dashboard-schedule','One new investigation each morning. Only investigations that pass physics and visual review are published.');
 }else{
  put('next-title',schedule?.state==='paused'?'Improving how investigations are made':schedule?.state==='blocked'?'Schedule paused':'No schedule confirmed');
  put('dashboard-schedule',schedule?.state==='paused'?'The lab is improving how investigations are made. Published ones stay available.':schedule?.state==='blocked'?'The background worker needs setup before daily runs resume.':'Investigations are started by hand for now.');
 }
}
async function refreshDashboard(){
 try{
  const response=await fetch('dashboard.json',{cache:'no-store'});if(!response.ok)throw Error('No status');
  const state=await response.json();schedule=state.schedule;attempts=state.attempts||[];
  const active=['running','planning'].includes(state.status), age=Date.now()-new Date(state.updated).getTime();
  const just=!active&&age<LAB_DONE_MINUTES*60000&&{reviewed:'Just published',needs_review:'Finished as a draft',failed:'Stopped early',interrupted:'Stopped early'}[state.status];
  put('dashboard-status',active?'Investigating now':just&&schedule?.enabled?just:schedule?.enabled?'Lab resting':schedule?.state==='paused'?'New investigations paused':'Lab paused');
  $('lab').dataset.state=active?'active':schedule?.enabled?'idle':'paused';
  labActive=active;labQuestion=state.question&&state.question!=='Choosing the next question'?state.question:'';
  const outcome={reviewed:'Last investigation passed review',needs_review:'Last attempt stayed a draft',failed:'Last attempt stopped early',interrupted:'Last attempt was interrupted'};
  put('now-title',active?(state.status==='planning'?'Choosing today’s question':'Investigating now'):entries[0]?`Latest published: ${entries[0].title}`:outcome[state.status]||'Resting');
  put('dashboard-question',active&&state.question&&state.question!=='Choosing the next question'?state.question:'');
  const step=stepOf(state);labStep=step;labStatus=state;drawLabStill();
  $('steps').hidden=!active;
  $('steps').replaceChildren(...STEPS.map((name,i)=>el('li',{className:i<step?'done':i===step?'active':'',textContent:name})));
  put('dashboard-phase',active?plain(state.events?.at(-1)?.message):state.updated?`Updated ${new Date(state.updated).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`:'');
  put('dashboard-freshness',active&&age>15*60*1000?'No update for a while. The Mac may be offline or unable to publish.':age>36*60*60*1000?'No update in more than a day. The Mac may be asleep or a run was missed.':'');
  const drafts=[...new Map((state.attempts||[]).filter(a=>a.status==='needs_review'&&a.question).map(a=>[a.question,a])).values()].slice(-3).reverse();
  $('bench').hidden=!drafts.length;
  $('bench-list').replaceChildren(...drafts.map(a=>el('li',{textContent:a.question})));
  document.body.dataset.paused=schedule?.enabled?'no':'yes';
  renderNext();renderPath();renderCards();if(labPreview)labPreview.shown='';
 }catch{
  document.body.dataset.paused='yes';labStatus=null;
  put('dashboard-status','No status yet');put('now-title','No status published yet');put('next-title','—');
 }
}
// The lab at work: scientists in a small lab making the investigations, drawn above the status line on the home page.
// It shows the published status: closed when the schedule is off, the current phase during a run, the outcome for a
// few hours after a run, and resting otherwise. It moves only while on screen and in a visible tab; with reduced
// motion it shows one still frame.
const labCanvas=VIEW==='home'?el('canvas',{id:'lab-anim',className:'lab-anim'}):null;
let labVisible=true, labPreview=null;
const LAB_DONE_MINUTES=45, LAB_TEXT={closed:'The schedule is off, so the lab is closed',resting:'Resting between runs',
 published:'Just published',draft:'Finished as a draft: it did not pass review',stopped:'The run stopped early',choose:'Choosing the question',research:'Gathering sources',record:'Writing up the research',design:'Planning how the picture shows the idea',
 render:'The coordinator is rendering the frames',review:'Four reviewers are checking it',revise:'Changes requested: rewriting',write:'Writing the chapters and narration',publish:'Passed review: publishing',done:'Published'};
function labPhase(state){
 if(state.status==='planning')return 'choose';
 const message=(state.events?.at(-1)?.message||'').toLowerCase();
 if(message.includes('gates passed'))return 'publish';
 if(message.includes('changes requested'))return 'revise';
 if(message.includes('inspecting')||message.includes('review saved'))return 'review';
 if(message.includes('rendering'))return 'render';
 if(message.includes('writer is writing')||message.includes('director'))return 'write';
 if(message.includes('designer is planning'))return 'design';
 if(message.includes('scientist is preparing'))return 'record';
 return 'research';
}
function labModel(now){
 if(labPreview)return simModel(now);
 const s=labStatus, notes=noteList(), wall=entries.length;
 if(!s||document.body.dataset.paused==='yes')return {mode:'closed',wall,notes};
 const last=s.events?.at(-1), since=Math.max(0,(Date.now()-Date.parse(last?.at||s.updated))/1000);
 if(['running','planning'].includes(s.status)){
  const phase=labPhase(s), n=/Revision (\d+)/.exec(last?.message||'')?.[1];
  const reviews=['learner_review','visual_review','physics_review','blind_review'].map(r=>(s.events||[]).some(e=>e.message===`Revision ${n}: ${r} saved.`)?1:0);
  let used=s.guidance||0;
  return {mode:'working',phase,since,question:labQuestion,reviews,wall,rejected:Math.max(0,(s.revision||0)-(['review','publish'].includes(phase)?1:0)),
   notes:notes.map(x=>x.url&&x.status==='waiting'&&used-->0?{...x,status:'taken'}:x)};
 }
 const outcome={reviewed:'published',needs_review:'draft',failed:'stopped',interrupted:'stopped'}[s.status];
 if(outcome&&Date.now()-Date.parse(s.updated)<LAB_DONE_MINUTES*60000)
  return {mode:'done',outcome,question:entries.find(e=>e.id===s.id)?.question||s.question,wall,rejected:Math.max(0,(s.revision||0)-(outcome==='published'?1:0)),notes};
 return {mode:'resting',question:labNext,wall,notes};
}
// Trying the lab, simulated in the browser only: a sample run plays every phase in about a minute using the first
// pinned note, or one chosen state holds until Live. Nothing is sent or published.
const PREVIEW=[['choose',6],['research',8],['record',5],['design',7],['write',8],['render',5],['review',7],['revise',5],['render',4],['review',6],['publish',5],['done',7]];
const PHASE_LEN={choose:8,research:10,record:7,design:9,write:10,render:6,review:8,revise:6,publish:5};
const LAB_STATES=[['Live',null],['Sample run','run'],['Closed',{mode:'closed'}],['Resting',{mode:'resting'}],['Question',{mode:'working',phase:'choose'}],
 ['Research',{mode:'working',phase:'research'}],['Write-up',{mode:'working',phase:'record'}],['Design',{mode:'working',phase:'design'}],['Write',{mode:'working',phase:'write'}],
 ['Render',{mode:'working',phase:'render'}],['Review',{mode:'working',phase:'review'}],['Revise',{mode:'working',phase:'revise'}],
 ['Publish',{mode:'working',phase:'publish'}],['Published',{mode:'done',outcome:'published'}],['Draft',{mode:'done',outcome:'draft'}],['Stopped',{mode:'done',outcome:'stopped'}]];
function simModel(now){
 const sim=labPreview, t=(now-sim.start)/1000;let model, i=-1;
 if(sim.state==='run'){let from=0;i=0;
  while(i<PREVIEW.length&&t>=from+PREVIEW[i][1]){from+=PREVIEW[i][1];i++;}
  if(i>=PREVIEW.length){stopPreview();return labModel(now);}
  const [phase,length]=PREVIEW[i], again=PREVIEW.slice(0,i).some(p=>p[0]==='revise');
  model=phase==='done'?{mode:'done',outcome:'published',rejected:1}:{mode:'working',phase,since:t-from,length,rejected:again?1:0};}
 else{const length=PHASE_LEN[sim.state.phase]||10;
  model={...sim.state,since:t%length,length,rejected:sim.state.phase==='revise'||sim.state.outcome==='published'?1:sim.state.outcome==='draft'?3:0};}
 const key=model.mode==='working'?model.phase:model.outcome||model.mode;
 if(sim.shown!==key){sim.shown=key;simStrip(model,key);}
 const notes=noteList().map((n,j)=>j>0?n:model.mode==='working'?{...n,status:'taken'}:model.outcome==='published'?{...n,status:'applied'}:n);
 return {...model,question:model.mode==='closed'?'':sim.question,notes,wall:entries.length+(model.outcome==='published'?1:0),
  reviews:model.phase==='review'?[.3,.5,.7,.85].map(f=>model.since>model.length*f?1:0):[0,0,0,0]};
}
function simStrip(model,key){
 const run=labPreview.state==='run', at=model.mode==='working'?{choose:0,research:1,record:1,design:2,write:3,revise:3,render:4,review:5,publish:6}[model.phase]:model.mode==='done'?7:-1;
 put('dashboard-status',run?'Sample run':'Trying a state');$('lab').dataset.state=model.mode==='working'?'active':model.mode==='closed'?'paused':'idle';
 put('next-pick',LAB_TEXT[key]);put('next-title','');
 put('now-title',run?'A sample run, simulated in your browser':`${labPreview.label}, simulated in your browser`);
 put('dashboard-question',model.mode==='closed'?'':labPreview.question);
 if(run&&key==='published'){$('featured').classList.add('fresh');setTimeout(()=>$('featured').classList.remove('fresh'),4000);}
 $('steps').hidden=at<0;$('steps').replaceChildren(...STEPS.map((name,j)=>el('li',{className:j<at?'done':j===at?'active':'',textContent:name})));
 const note=noteList()[0];
 put('dashboard-phase',!note?'':model.mode==='working'?'Your note is taped to the board for the designer, writer and reviewers.':model.outcome==='published'?'In a real run, the lab replies on your note with what it did.':'');
 put('dashboard-freshness','');put('dashboard-schedule','Nothing here is sent or published. The real lab runs at 9 AM.');
 markStates();
}
function stopPreview(){labPreview=null;markStates();refreshDashboard();}
function markStates(){const current=labPreview?.label||'Live';$('lab-states')?.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.textContent===current)));}
function tryState(label){
 const state=LAB_STATES.find(([l])=>l===label)?.[1];
 if(!state){stopPreview();return;}
 labPreview={state,label,start:performance.now(),shown:'',question:labNext||'Why does a moving clock tick slowly?'};markStates();
}
// Guidance notes: the owner's GitHub issues labelled council:guidance wait for the next run, which follows them where
// they fit the quality bar, replies on each and closes it. Notes pinned on this page stay in this browser until sent.
const NOTE_TAIL='\n\nA guidance note from the lab on the home page.';
let guideIssues=[];
const localNotes=()=>{try{return JSON.parse(localStorage.getItem('council-notes')||'[]');}catch{return [];}};
const saveNotes=list=>{try{localStorage.setItem('council-notes',JSON.stringify(list.slice(-6)));}catch{}};
function noteList(){
 const sent=new Set(guideIssues.map(i=>norm(i.text)));
 return [...guideIssues.map(i=>({text:i.text,url:i.url,status:i.state==='open'?'waiting':'applied'})),
  ...localNotes().filter(n=>!sent.has(norm(n.text))).map(n=>({text:n.text,id:n.id,status:Date.now()-n.at<3600?'new':'waiting'}))];
}
function renderNotes(){
 const list=$('guide-notes');if(!list)return;
 list.replaceChildren(...noteList().map(n=>{
  const item=el('li',{},el('span',{className:'note-text',textContent:n.text}));
  if(n.url)item.append(el('a',{className:'state',href:n.url,target:'_blank',rel:'noopener noreferrer',textContent:n.status==='applied'?'Used · read the reply':'Waiting for the 9 AM run'}));
  else{item.append(el('a',{className:'state pill pick',target:'_blank',rel:'noopener noreferrer',textContent:'Send to the 9 AM run',
    href:issueURL('council:guidance',`Guidance: ${n.text}`.slice(0,120),n.text+NOTE_TAIL)}));
   const drop=el('button',{type:'button',className:'note-drop',textContent:'×',title:'Remove this note'});drop.setAttribute('aria-label','Remove this note');
   drop.onclick=()=>{saveNotes(localNotes().filter(x=>x.id!==n.id));renderNotes();};item.append(drop);}
  return item;}));
}
async function loadNotes(){
 try{const response=await fetch(`https://api.github.com/repos/${OWNER}/the-council/issues?state=all&creator=${OWNER}&labels=council:guidance&per_page=10`);
  if(response.ok)guideIssues=(await response.json()).filter(i=>!i.pull_request&&(i.state==='open'||Date.now()-Date.parse(i.closed_at)<3*86400000))
   .map(i=>({text:(i.body||i.title||'').split(NOTE_TAIL)[0].trim().slice(0,400),url:i.html_url,state:i.state}));}catch{}
 renderNotes();
}
// The agents, as the lab picture names them when pointed at: their role and what they are doing now.
const AGENTS=[{name:'Researcher',work:{research:'Gathering sources'},rest:'Napping on the couch'},
 {name:'Writer',work:{choose:'Reading the question',write:'Writing the chapters and narration',revise:'Rewriting after the review'},rest:'Having tea'},
 {name:'Scientist',work:{record:'Writing up the research'},rest:'Playing chess'},
 {name:'Visual reviewer',work:{review:'Checking the frames against the design'},rest:'Playing chess'},
 {name:'Accuracy reviewer',work:{review:'Checking the physics or mathematics'},rest:'Reading the paper'},
 null,
 {name:'Designer',work:{design:'Planning how the picture shows the idea'},rest:'Doodling'},
 {name:'Beginner reviewer',work:{review:'Reading it as a beginner would'},rest:'Reading a comic'},
 {name:'Blind viewer',work:{review:'Watching the pictures with no words'},rest:'Watering the plants'}];
function agentCard(who,model){
 const working=model.mode==='working';
 if(who==='machine')return ['The coordinator','not an AI agent',working?{choose:'Picking the next question; a planner agent chooses when you send notes',
  render:'Rendering the frames in a browser',publish:'Publishing the guide'}[model.phase]||'Passing the work to the next agent':'Runs the lab: moves the work, renders, publishes'];
 if(who===5)return ['The lab cat','not an AI agent',working?'Watching':'Asleep'];
 const a=AGENTS[who];
 return [a.name,'AI agent',working?a.work[model.phase]||'Waiting for their turn':model.mode==='done'?'Done for this run':a.rest];
}
// What the picture reacts to: a visitor arriving or coming back after a while, a click on an agent, a note sent in.
const labEvents={arrive:null,note:null,poke:null};
let labAway=0, labLast={mode:'resting'};
const labTip=el('div',{className:'lab-tip',hidden:true});
function noticeVisitor(){labEvents.arrive=performance.now()/1000+.35;}
function comeBack(){if(labAway&&performance.now()-labAway>20000)noticeVisitor();labAway=0;}
function showTip(hit,hold){
 const view=CouncilLab.view?.();if(!view)return;const [name,kind,doing]=agentCard(hit.who,labLast);
 labTip.replaceChildren(el('strong',{textContent:name}),el('span',{className:'tip-kind',textContent:` · ${kind}`}),el('br'),el('span',{textContent:doing}));
 labTip.style.left=`${((hit.x0+hit.x1)/2-view.pan)*view.k+view.ox}px`;labTip.style.top=`${hit.y0*view.k+view.oy-6}px`;labTip.hidden=false;
 clearTimeout(showTip.timer);if(hold)showTip.timer=setTimeout(()=>{labTip.hidden=true;},2600);
}
function paintLab(now){
 if(!labCanvas||!window.CouncilLab)return;
 const w=labCanvas.clientWidth, h=labCanvas.clientHeight, dpr=Math.min(2,devicePixelRatio||1);if(!w||!h)return;
 if(labCanvas.width!==Math.round(w*dpr)||labCanvas.height!==Math.round(h*dpr)){labCanvas.width=Math.round(w*dpr);labCanvas.height=Math.round(h*dpr);}
 const ctx=labCanvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 labLast=labModel(now);CouncilLab.draw(ctx,w,h,{...labLast,t:now/1000,still:reduceMotion,events:labEvents});
}
function drawLabStill(){if(reduceMotion)paintLab(0);}
if(labCanvas){
 labCanvas.setAttribute('aria-hidden','true');document.querySelector('.lab-caption').before(el('div',{className:'lab-wrap'},labCanvas,labTip));
 new IntersectionObserver(([entry])=>{labVisible=entry.isIntersecting;if(labVisible)comeBack();else labAway=performance.now();}).observe(labCanvas);
 addEventListener('visibilitychange',()=>{if(document.hidden)labAway=performance.now();else comeBack();});
 const tick=now=>{if(labVisible&&!document.hidden){if(labEvents.arrive===null)noticeVisitor();paintLab(now);}requestAnimationFrame(tick);};
 // Pointing at an agent names them; clicking makes them react; the wall's frames open their guides; the notes board
 // and the door open the note box; the blackboard opens the run's details.
 const at=e=>{const r=labCanvas.getBoundingClientRect();return CouncilLab.hit?.(e.clientX-r.left,e.clientY-r.top);};
 labCanvas.addEventListener('pointermove',e=>{const hit=at(e);labCanvas.style.cursor=hit&&hit.kind!=='machine'?'pointer':'';if((hit?.kind==='person'||hit?.kind==='machine')&&e.pointerType==='mouse')showTip(hit.kind==='machine'?{...hit,who:'machine'}:hit,false);else if(e.pointerType==='mouse')labTip.hidden=true;});
 labCanvas.addEventListener('pointerleave',()=>{labTip.hidden=true;});
 labCanvas.addEventListener('click',e=>{const hit=at(e);if(!hit)return;
  if(hit.kind==='person'){labEvents.poke={who:hit.who,at:performance.now()/1000};showTip(hit,true);}
  else if(hit.kind==='machine')showTip({...hit,who:'machine'},true);
  else if(hit.kind==='frame'){const guide=[...entries].sort((x,y)=>new Date(x.created)-new Date(y.created))[hit.index];if(guide)location.href='?guide='+encodeURIComponent(guide.id);}
  else if(hit.kind==='notes'){$('lab').open=true;$('guide-text').focus();}
  else if(hit.kind==='board')$('lab').open=true;});
 if(reduceMotion)paintLab(0);else requestAnimationFrame(tick);
 addEventListener('resize',()=>paintLab(performance.now()));
 $('guide-form').onsubmit=e=>{e.preventDefault();const text=$('guide-text').value.trim();if(!text)return;
  saveNotes([...localNotes(),{id:Date.now(),text:text.slice(0,400),at:Date.now()}]);$('guide-text').value='';renderNotes();
  labEvents.note=performance.now()/1000;drawLabStill();labCanvas.scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'nearest'});};
 $('guide-open').onclick=e=>{e.preventDefault();$('lab').open=true;$('guide-text').focus();};
 $('lab-states').replaceChildren(...LAB_STATES.map(([label])=>{const b=el('button',{type:'button',className:'chip',textContent:label});b.onclick=()=>tryState(label);return b;}));
 markStates();
 // ?lab=review (or any state's name) opens the page in that state.
 setTimeout(()=>{const asked=norm(new URLSearchParams(location.search).get('lab')), wanted=asked&&LAB_STATES.find(([l])=>norm(l)===asked);
  if(wanted){$('lab').open=true;tryState(wanted[0]);}});
 setTimeout(loadNotes);
}
refreshDashboard();setInterval(refreshDashboard,60000);setInterval(()=>{renderNext();renderPath();},30000);

/* The path: the curriculum, with requests sent as GitHub issues the morning worker reads. */
const REPO='https://github.com/eman2XR/the-council';
const OWNER='eman2XR';
let curriculum=null, picks=new Map();
const norm=s=>(s||'').toLowerCase().replace(/\W+/g,'');
function issueURL(label,title,body){return `${REPO}/issues/new?${new URLSearchParams({title,body,labels:label})}`;}
function updateTalk(){
 const guide=current?.id&&current.provider!=='fixture'?current.id:'example', title=current?.scene?.title?.replace(/\n/g,' ')||'';
 $('ask').href=issueURL('council:question','Question: ',`guide: ${guide}\n\nWhat I'm wondering (one question works best):\n\n`);
 $('feedback').href=issueURL('council:feedback',`Feedback: ${title}`.slice(0,120),`guide: ${guide}\n\nWhat worked:\n\nWhat was confusing:\n\n`);
}
function doneItem(item){return entries.find(e=>e.curriculum===item.id||norm(e.question)===norm(item.question));}
// Requests only make sense while the daily run is on; while paused, unexplored items just say so.
function requestFor(item){
 if(document.body.dataset.paused!=='no')return el('span',{className:'state wait',textContent:'Not yet'});
 if(picks.has(item.id))return el('a',{className:'state picked',href:picks.get(item.id),target:'_blank',rel:'noopener noreferrer',textContent:'Picked'});
 // Only items whose picture meets the quality bar can be picked; the rest wait for a redesign.
 if(item.ready)return el('a',{className:'state pill pick',target:'_blank',rel:'noopener noreferrer',textContent:'Pick for tomorrow',
  href:issueURL('council:choose',`Pick next: ${item.id} ${item.question}`.slice(0,120),`curriculum: ${item.id}\n\n${item.question}\n\nPicked on the website. The next morning's run investigates this.`)});
 return el('span',{className:'state wait',textContent:'Later'});
}
// Drafts sit with the investigations: in the slot whose model they use, else in the chapter of their topic.
const DRAFTS_NOTE='Made by hand, outside the daily run. The lab’s reviewers have not checked them, so they are not published.';
function draftFor(item,used){const d=drafts.find(d=>!used.has(d.id)&&d.kind===item.model);if(d)used.add(d.id);return d;}
const cardFor=e=>thumbCard(e,records.get((e.draft?'draft:':'')+e.id));
// Every other reviewed investigation in one grid, newest first; then the drafts on a shelf of their own, newest
// first; then the questions that can be picked for tomorrow's run.
function gallery(lead){
 const newest=(a,b)=>new Date(b.created||0)-new Date(a.created||0);
 const grid=el('div',{className:'thumbs'},...entries.filter(e=>e!==lead).sort(newest).map(cardFor));
 const shelf=drafts.length?[el('section',{className:'drafts-shelf'},el('h3',{className:'chapter-title'},'Drafts',el('span',{textContent:`${drafts.length} to review`})),
  el('p',{className:'drafts-note',textContent:DRAFTS_NOTE}),el('div',{className:'thumbs'},...[...drafts].sort(newest).map(cardFor)))]:[];
 if(!curriculum)return [grid,...shelf];
 // As in the daily run: one picture per guide, so a question whose picture a guide or draft already uses is not open.
 const used=new Set(), pictured=i=>entries.some(e=>e.topic===i.model), open=curriculum.chapters.flatMap(c=>c.items).filter(i=>!doneItem(i)&&!pictured(i)&&!draftFor(i,used));
 const ready=retryOrder(open.filter(i=>i.ready&&!triedItem(i))), later=open.filter(i=>!i.ready).length;
 if(!ready.length&&!later)return [grid,...shelf];
 return [grid,...shelf,el('section',{className:'up-next'},el('h3',{className:'chapter-title',textContent:'Up next'}),
  ...(ready.length?[el('ul',{className:'items pending'},...ready.map(i=>el('li',{},el('span',{className:'q',textContent:i.question}),requestFor(i))))]:[]),
  ...(later?[el('p',{className:'up-later',textContent:`${later} more question${later>1?'s are':' is'} planned, waiting for a picture that explains ${later>1?'them':'it'} well.`})]:[]))];
}
// Like the daily run, a question tried before with the same model, or answered by a draft, is not offered again.
// Never-tried items first in teaching order, then retries, the most recent early stop first (retry_order in lab/daily.py).
function retryOrder(items){const last=i=>attempts.reduce((k,a,j)=>norm(a.question)===norm(i.question)&&a.status==='failed'?j:k,-1), key=i=>last(i)<0?-1e9:-last(i);
 return [...items].sort((x,y)=>key(x)-key(y));}
// As in the daily run: an attempt that reached review counts; one that stopped early is retried until it has stopped twice.
function triedItem(i){const tries=attempts.filter(a=>norm(a.question)===norm(i.question)&&a.topic===i.model), early=tries.filter(a=>a.status==='failed').length;
 return tries.length>early||early>=2||drafts.some(d=>norm(d.question||d.title)===norm(i.question));}
function renderPath(){
 if(!curriculum)return;
 // Like the daily run: ready items whose model has no guide or draft yet, skipping questions a guide or draft answers
 // or that were tried with the same model.
 const used=new Set([...entries.map(e=>e.topic),...drafts.map(d=>d.kind)]);
 const tried=triedItem;
 const all=curriculum.chapters.flatMap(c=>c.items), open=all.filter(i=>i.model&&i.ready&&!used.has(i.model)&&!doneItem(i)&&!tried(i)&&!picks.has(i.id));
 const next=retryOrder(open)[0];
 if(schedule?.enabled){
  const pick=[...picks.keys()].map(id=>all.find(i=>i.id===id)).find(i=>i&&i.model&&!doneItem(i));
  const upcoming=pick||next;labNext=upcoming?.question||'';
  put('next-pick',labActive?labQuestion:upcoming?`${pick?'Your pick':'Next'}: ${upcoming.question}`:'');
 }else put('next-pick',labActive?labQuestion:'');
 if(labPreview)labPreview.shown='';
}
async function loadPath(){
 try{curriculum=await (await fetch('curriculum.json')).json();}catch{return;}
 try{
  const response=await fetch(`https://api.github.com/repos/${OWNER}/the-council/issues?state=open&creator=${OWNER}&labels=council:choose&per_page=50`);
  if(response.ok)for(const issue of await response.json()){const id=/curriculum:\s*([0-9]+\.[0-9]+)/.exec(issue.body||'')?.[1];if(id&&!picks.has(id))picks.set(id,issue.html_url);}
 }catch{}
 renderPath();renderCards();
}
loadPath();

/* Proposals: the daily project review's suggestions, approved or declined through GitHub issues. */
let proposals=null, verdicts=new Map();
function proposalCard(p){
 const status=verdicts.get(p.id)||(p.status!=='open'?p.status:null);
 const actions=el('div',{className:'actions'});
 if(status){const badge=el('span',{className:'status',textContent:status==='approved'?'Approved':status==='declined'?'Declined':'Decision sent'});badge.dataset.status=status;actions.append(badge);}
 else actions.append(
  el('a',{className:'pill approve',target:'_blank',rel:'noopener noreferrer',textContent:'Approve',href:issueURL('council:approve',`Approve: ${p.title}`.slice(0,120),`proposal: ${p.id}\n\n${p.proposal}\n\nNotes for the implementation (optional):\n`)}),
  el('a',{className:'pill',target:'_blank',rel:'noopener noreferrer',textContent:'Decline',href:issueURL('council:decline',`Decline: ${p.title}`.slice(0,120),`proposal: ${p.id}\n\nWhy not (optional, helps future reviews):\n`)}));
 const evidence=(p.evidence||[]).map(safeURL).filter(Boolean).map(url=>el('a',{href:url,target:'_blank',rel:'noopener noreferrer',textContent:new URL(url).hostname.replace(/^www\./,'')}));
 return el('article',{className:'proposal'},
  el('header',{},el('h3',{textContent:p.title}),el('span',{className:'meta',textContent:`${p.area} · ${p.effort} effort · ${day(p.created)}`})),
  el('p',{className:'why'},el('b',{textContent:'Problem. '}),p.problem),
  el('p',{},el('b',{textContent:'Proposal. '}),p.proposal),
  el('p',{className:'why'},el('b',{textContent:'Why it helps. '}),p.benefit,' ',el('b',{textContent:'Risk. '}),p.risk),
  evidence.length?el('div',{className:'evidence'},'Sources: ',...evidence):'',actions);
}
function renderProposals(){
 const list=proposals?.proposals||[], open=list.filter(p=>p.status==='open'&&!verdicts.has(p.id));
 put('proposals-count',open.length?String(open.length):'');
 $('proposals-open').hidden=!list.length;
 $('proposals-list').replaceChildren(...(list.length?list.map(proposalCard):[el('p',{className:'empty',textContent:'The first project review runs with the next morning investigation. Its suggestions will appear here.'})]));
}
async function loadProposals(){
 try{const r=await fetch('proposals.json',{cache:'no-store'});proposals=r.ok?await r.json():null;}catch{proposals=null;}
 try{
  for(const [label,status] of [['council:approve','approved'],['council:decline','declined']]){
   const r=await fetch(`https://api.github.com/repos/${OWNER}/the-council/issues?state=all&creator=${OWNER}&labels=${label}&per_page=50`);
   if(r.ok)for(const issue of await r.json()){const id=/proposal:\s*(P-\d{8}-\d+)/.exec(issue.body||'')?.[1];if(id)verdicts.set(id,status);}
  }
 }catch{}
 renderProposals();
}
$('proposals-open').onclick=()=>{$('proposals').showModal();};
$('proposals-close').onclick=()=>$('proposals').close();
$('proposals').addEventListener('click',e=>{if(e.target===$('proposals'))$('proposals').close();});
loadProposals();


/* Sticky reading bar: appears once the headline scrolls away, with reading progress. */
const readbar=$('readbar');
new IntersectionObserver(([e])=>readbar.classList.toggle('on',!e.isIntersecting&&e.boundingClientRect.top<0)).observe($('title'));
addEventListener('scroll',()=>{const max=document.documentElement.scrollHeight-innerHeight;readbar.style.setProperty('--read',max>0?Math.min(1,scrollY/max):0);},{passive:true});
