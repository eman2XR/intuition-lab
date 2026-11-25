// Talk: a live voice conversation with the lab's editors through the Gemini Live API. The browser talks to Gemini
// directly; the Gemini key (and an optional GitHub token for sending conversations) stays on this device. The model is
// told what is on screen, and every conversation is kept in this browser as it grows and then sent to the lab as a
// GitHub issue labelled council:talk, which the daily round reads as questions and feedback on the guide.
(()=>{
const HOST='generativelanguage.googleapis.com';
const SOCKET=`wss://${HOST}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`;
const REPO='eman2XR/intuition-lab';
const KEYS={gemini:'council-gemini-key',github:'council-github-token',model:'council-gemini-model',outbox:'council-talks'};
const MARK='<!-- council-talk -->';
const RULES=`You are one of the editors of Intuition Lab, a small website of short animated guides that explain physics and other science to curious adults, mostly beginners. You are talking with a reader live, by voice, about the guide they are watching.
- Answer in plain spoken English, briefly (two or three sentences), unless they ask for more.
- Start from things people can see, feel or measure. Say what any technical word means the first time you use it.
- Answer why, not only what. Build on the guide's own pictures and chapters when that helps.
- Avoid stock comparisons such as balloons or raisin bread.
- If you are not sure of a fact, say so. Never invent one.
- If they give feedback about the guide, its pictures, its words or the site (something confusing, wrong, missing, or something they liked or want changed), confirm it back in one short sentence that begins with the word "Noted:", and say the lab will look at it. Begin with "Noted:" only for feedback.`;

const get=k=>{try{return localStorage.getItem(k)||'';}catch{return '';}};
const put=(k,v)=>{try{v?localStorage.setItem(k,v):localStorage.removeItem(k);}catch{}};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

// A one-time setup link (#gemini=KEY, #github=TOKEN) saves them on this device and removes them from the address.
function readSetupLink(){
 const h=new URLSearchParams(location.hash.slice(1));let used=false;
 for(const [name,key] of [['gemini',KEYS.gemini],['github',KEYS.github]])if(h.get(name)){put(key,h.get(name).trim());h.delete(name);used=true;}
 if(used){put(KEYS.model,'');const rest=h.toString();history.replaceState(null,'',location.pathname+location.search+(rest?'#'+rest:''));}
}

// What the page says is on screen: {page, guide, title, section:{index,title}, text}. app.js registers it.
let contextFn=()=>({page:'home',text:'The reader is on the home page of Intuition Lab.'});

// The newest model that supports live conversation, preferring native audio, or a readable error.
async function findModel(key){
 let res;try{res=await fetch(`https://${HOST}/v1beta/models?pageSize=200`,{headers:{'x-goog-api-key':key}});}catch{throw new Error('Gemini could not be reached.');}
 if(!res.ok)throw new Error(res.status===400||res.status===403?'Gemini did not accept this key.':`Gemini answered ${res.status}.`);
 const models=((await res.json()).models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes('bidiGenerateContent'));
 if(!models.length)throw new Error('This key has no live-conversation model.');
 const rank=m=>(/native-audio/.test(m.name)?2:0)+(/preview/.test(m.name)?0:1);
 models.sort((a,b)=>rank(b)-rank(a)||b.name.localeCompare(a.name));
 return models[0].name.replace(/^models\//,'');
}
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);}
// Averages microphone samples down to 16 kHz, 16-bit, as Gemini expects.
function toPcm16(samples,rate){
 const step=rate/16000, out=new Int16Array(Math.floor(samples.length/step));
 for(let i=0;i<out.length;i++){let sum=0,n=0;for(let j=Math.floor(i*step);j<Math.floor((i+1)*step)&&j<samples.length;j++,n++)sum+=samples[j];
  const v=Math.max(-1,Math.min(1,n?sum/n:0));out[i]=v<0?v*0x8000:v*0x7fff;}
 return new Uint8Array(out.buffer);
}

/* The outbox: conversations kept in this browser until the lab has them. */
const outbox=()=>{try{return JSON.parse(localStorage.getItem(KEYS.outbox)||'[]');}catch{return [];}};
const saveOutbox=list=>{try{localStorage.setItem(KEYS.outbox,JSON.stringify(list.slice(-20)));}catch{}};
function keep(talk){const list=outbox().filter(t=>t.talkId!==talk.talkId);list.push(talk);saveOutbox(list);}
const drop=id=>saveOutbox(outbox().filter(t=>t.talkId!==id));
// Waiting conversations: finished, or left open more than 90 seconds ago (a reload or a closed tab).
const waiting=()=>outbox().filter(t=>!t.sent&&(!t.liveUntil||t.liveUntil<Date.now()));
function kindOf(turns){const fb=turns.some(t=>t.who==='editor'&&/^\s*noted\b/i.test(t.text)), q=turns.some(t=>t.who==='you'&&/\?\s*$/.test(t.text));return fb?(q?'mixed':'feedback'):'question';}
function issueOf(talk){
 const where=talk.section?` · chapter ${talk.section.index+1}`:'';
 const title=`Talk: ${talk.title||'Intuition Lab'}${where}`.slice(0,120);
 const head=`${MARK}\nA voice conversation with the editors (${talk.kind}), from ${talk.page==='guide'?`the guide page${where}`:'the home page'}.\n\n`;
 return {title,head,json:t=>'```json\n'+JSON.stringify(t,null,1)+'\n```'};
}
// Without a token, a prefilled GitHub issue the owner sends; long conversations keep their latest turns.
function issueLink(talk){
 const {title,head,json}=issueOf(talk);let t={...talk},body=head+json(t);
 while(body.length>5500&&t.turns.length>2){t={...t,turns:t.turns.slice(1),trimmed:(t.trimmed||0)+1};body=head+json(t);}
 if(body.length>5500)body=body.slice(0,5490)+'\n```';
 return `https://github.com/${REPO}/issues/new?${new URLSearchParams({title,body,labels:'council:talk'})}`;
}
async function post(talk){
 const token=get(KEYS.github);if(!token)return false;
 const {title,head,json}=issueOf(talk);
 try{const r=await fetch(`https://api.github.com/repos/${REPO}/issues`,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json'},body:JSON.stringify({title,body:head+json(talk),labels:['council:talk']})});
  if(!r.ok)return false;drop(talk.talkId);return true;}catch{return false;}
}
// Sends waiting conversations when this device has a token.
async function flush(){if(!get(KEYS.github))return;for(const t of waiting())await post(t);}

function modelLine(c){return [c.text,c.pinned?`\nThe reader opened this conversation from the button on chapter ${c.section.index+1}, "${c.section.title}", so take their words as being about that chapter unless they say otherwise.`:''].join('');}

// Opens the conversation sheet. Call it from a tap, so the microphone and sound can start.
function open(opts={}){
 if(document.querySelector('.voice-sheet'))return;
 readSetupLink();
 const context={...contextFn(),pinned:!!opts.pinned};
 if(context.pinned&&!context.section)context.pinned=false;
 const sheet=document.createElement('div');sheet.className='voice-sheet';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-label','Talk to the editors');
 const about=context.pinned?`Chapter ${context.section.index+1}: ${context.section.title}`:context.title||'Intuition Lab';
 sheet.innerHTML=`<div class="voice-head"><div><p class="voice-title">Talk to the editors</p><p class="voice-about">${esc(about)}</p></div><span class="voice-status">Connecting…</span></div>
  <p class="voice-hint">${context.pinned?'Ask about this chapter, or say what to change in it.':'Ask a question about the guide, or tell us what to improve.'} Voices nearby can be picked up too.</p>
  <div class="voice-log" aria-live="polite"></div>
  <form class="voice-form" autocomplete="off"><input name="t" type="text" enterkeyhint="send" placeholder="Speak, or type here" aria-label="Type a question or feedback"><button type="submit" class="pill">Send</button></form>
  <div class="voice-actions"><button type="button" class="pill voice-mute" aria-pressed="false">Mute mic</button><button type="button" class="pill send voice-end">End</button></div>`;
 document.body.appendChild(sheet);
 const status=sheet.querySelector('.voice-status'), log=sheet.querySelector('.voice-log'), mute=sheet.querySelector('.voice-mute');
 const turns=[], talkId=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`, startedAt=new Date().toISOString();
 let live=null, ended=false, lastSection=context.section?.index;
 const note=html=>log.insertAdjacentHTML('beforeend',`<p class="voice-note">${html}</p>`);
 const record=open=>{
  const said=turns.filter(t=>t.text.trim());if(!said.length)return null;
  const now=contextFn(), talk={talkId,startedAt,endedAt:open?null:new Date().toISOString(),device:/iPhone|iPad|Android/.test(navigator.userAgent)?'phone or tablet':'computer',
   page:context.page,guide:context.guide||null,title:context.title||null,url:location.origin+location.pathname+location.search,
   section:context.section?{index:context.section.index,title:context.section.title}:null,pinned:context.pinned,endSection:now.section?{index:now.section.index,title:now.section.title}:null,
   kind:kindOf(said),model:live?.model||null,turns:said.map(({who,text,chapter})=>({who,text:text.trim(),chapter}))};
  if(open)talk.liveUntil=Date.now()+90000;keep(talk);return talk;};
 const onHide=()=>record(false);window.addEventListener('pagehide',onHide);
 function say(who,text){
  if(!text)return;const last=turns[turns.length-1];
  if(last&&last.who===who&&!last.done)last.text+=text;else turns.push({who,text,done:false,chapter:(contextFn().section?.index??-1)+1||null});
  const t=turns[turns.length-1];let line=log.querySelector(`[data-i="${turns.length-1}"]`);
  if(!line){line=document.createElement('p');line.className=`voice-line ${who}`;line.dataset.i=String(turns.length-1);log.appendChild(line);}
  line.innerHTML=`<b>${who==='you'?'You':'Editor'}</b> ${esc(t.text.trim())}`;log.scrollTop=log.scrollHeight;
 }
 const closeTurns=()=>{turns.forEach(t=>t.done=true);if(!ended)record(true);};
 // When the reader moves to another chapter, the model hears where they are now, without being asked to answer.
 const watch=setInterval(()=>{const c=contextFn();if(!live?.ready||ended||context.pinned||c.section?.index===lastSection)return;lastSection=c.section?.index;
  live.context(`[Screen update, do not reply to this] The reader is now on ${c.section?`chapter ${c.section.index+1}, "${c.section.title}"`:'another part of the page'}.`);},1000);
 async function end(){
  if(ended)return;ended=true;clearInterval(watch);live?.close();window.removeEventListener('pagehide',onHide);
  const talk=record(false);
  if(!talk){sheet.remove();return;}
  if(await post(talk)){sheet.remove();return;}
  // No token on this device: the reader sends it with one tap on GitHub, or it waits here for later.
  status.textContent='Ended';sheet.querySelector('.voice-form').remove();sheet.querySelector('.voice-actions').innerHTML=
   `<a class="pill send voice-send" target="_blank" rel="noopener noreferrer" href="${esc(issueLink(talk))}">Send to the lab</a><button type="button" class="pill voice-close">Not now</button>`;
  note('Sending opens a GitHub issue with this conversation; the next daily round reads it.');
  sheet.querySelector('.voice-send').addEventListener('click',()=>{const list=outbox();const t=list.find(x=>x.talkId===talk.talkId);if(t){t.sent=true;saveOutbox(list);}setTimeout(()=>sheet.remove(),300);});
  sheet.querySelector('.voice-close').addEventListener('click',()=>sheet.remove());
  // Saving a GitHub token once here sends this conversation, any waiting ones, and every later one when End is tapped.
  const tf=document.createElement('form');tf.className='voice-keys voice-token';tf.autocomplete='off';
  tf.innerHTML=`<label>Or send it from here, now and from now on<input name="h" type="password" autocomplete="off" placeholder="GitHub token"><small>A token that can create issues in ${REPO}, saved on this device only. After that, End sends each conversation for you.</small></label><button type="submit" class="pill">Save token and send</button>`;
  sheet.querySelector('.voice-actions').before(tf);
  tf.addEventListener('submit',async e=>{e.preventDefault();const h=tf.h.value.trim();if(!h)return;put(KEYS.github,h);
   if(await post(talk)){tf.remove();note('Sent. From now on, End sends each conversation for you.');flush();setTimeout(()=>sheet.remove(),1500);}
   else{put(KEYS.github,'');note('GitHub did not accept that token. Check that it can create issues in this repository.');}});
 }
 sheet.querySelector('.voice-end').addEventListener('click',end);
 sheet.addEventListener('keydown',e=>{if(e.key==='Escape')end();});
 mute.addEventListener('click',()=>{const on=mute.getAttribute('aria-pressed')!=='true';mute.setAttribute('aria-pressed',String(on));mute.textContent=on?'Unmute mic':'Mute mic';live?.mute(on);});
 sheet.querySelector('.voice-form').addEventListener('submit',e=>{
  e.preventDefault();const text=e.target.t.value.trim();if(!text||!live?.ready)return;e.target.t.value='';closeTurns();say('you',text);closeTurns();live.text(text);});
 // Conversations an earlier visit did not send.
 const left=waiting();
 if(left.length&&!get(KEYS.github))note(`${left.length===1?'One earlier conversation was':`${left.length} earlier conversations were`} not sent. `+left.map(t=>`<a target="_blank" rel="noopener noreferrer" href="${esc(issueLink(t))}" data-talk="${esc(t.talkId)}">Send ${esc(t.title||'it')}</a>`).join(' · '));
 log.querySelectorAll('a[data-talk]').forEach(a=>a.addEventListener('click',()=>{const list=outbox();const t=list.find(x=>x.talkId===a.dataset.talk);if(t){t.sent=true;saveOutbox(list);}a.replaceWith('sent');}));
 const key=get(KEYS.gemini);
 if(!key){status.textContent='Needs a key';askKey(sheet,note,()=>{sheet.remove();open(opts);});return end;}
 flush();
 connect(key,`${RULES}\n\nWhat the reader is looking at:\n${modelLine(context)}`,{
  status:s=>status.textContent=s, heard:t=>say('you',t), spoke:t=>say('editor',t), turnDone:closeTurns,
  note:m=>note(esc(m)), failed:m=>{status.textContent='Not connected';note(esc(m));}
 }).then(l=>{live=l;if(ended)l?.close();});
 return end;
}

// Asks for the Gemini key (and an optional GitHub token) inside the sheet, and tests the key before saving it.
function askKey(sheet,note,done){
 sheet.querySelector('.voice-form').remove();sheet.querySelector('.voice-mute').remove();
 const form=document.createElement('form');form.className='voice-keys';form.autocomplete='off';
 form.innerHTML=`<label>Gemini API key<input name="g" type="password" required autocomplete="off"></label>
  <label>GitHub token, optional<input name="h" type="password" autocomplete="off"><small>With a token that can create issues in ${REPO}, conversations are sent for you. Without one, you send each with a tap on GitHub.</small></label>
  <button type="submit" class="pill send">Save and test</button>`;
 sheet.querySelector('.voice-log').after(form);
 note('Both stay on this device only. Restrict the key to this site’s address in the Google Cloud console.');
 form.addEventListener('submit',async e=>{e.preventDefault();const g=form.g.value.trim(), h=form.h.value.trim();
  try{const model=await findModel(g);put(KEYS.gemini,g);put(KEYS.model,model);if(h)put(KEYS.github,h);done();}catch(err){note(esc(err.message));}});
}

async function connect(key,instruction,on){
 let model;try{model=get(KEYS.model)||await findModel(key);put(KEYS.model,model);}catch(err){on.failed(err.message);return null;}
 const AC=window.AudioContext||window.webkitAudioContext, ctx=new AC();ctx.resume();
 let playAt=0, mic=null, muted=false;const playing=new Set();
 const ws=new WebSocket(`${SOCKET}?key=${encodeURIComponent(key)}`);
 const send=m=>{if(ws.readyState===1)ws.send(JSON.stringify(m));};
 const live={model,ready:false,
  text(t){send({clientContent:{turns:[{role:'user',parts:[{text:t}]}],turnComplete:true}});},
  context(t){send({clientContent:{turns:[{role:'user',parts:[{text:t}]}],turnComplete:false}});},
  mute(on){muted=on;},
  close(){mic?.getTracks().forEach(t=>t.stop());playing.forEach(s=>{try{s.stop();}catch{}});if(ws.readyState<=1)ws.close();ctx.close().catch(()=>{});}};
 function playPcm(b64){
  const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)), pcm=new Int16Array(bytes.buffer,0,Math.floor(bytes.length/2));
  const buf=ctx.createBuffer(1,pcm.length,24000), ch=buf.getChannelData(0);for(let i=0;i<pcm.length;i++)ch[i]=pcm[i]/0x8000;
  const src=ctx.createBufferSource();src.buffer=buf;src.connect(ctx.destination);playAt=Math.max(playAt,ctx.currentTime+.05);src.start(playAt);playAt+=buf.duration;
  playing.add(src);src.onended=()=>playing.delete(src);
 }
 async function startMic(){
  on.status('Allow the microphone, or type');
  try{
   mic=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
   await ctx.audioWorklet.addModule('pcm-capture.js');
   const node=new AudioWorkletNode(ctx,'council-capture');ctx.createMediaStreamSource(mic).connect(node);
   let chunks=[],count=0;
   node.port.onmessage=e=>{chunks.push(e.data);count+=e.data.length;if(count<ctx.sampleRate/10)return;
    const all=new Float32Array(count);let at=0;for(const c of chunks){all.set(c,at);at+=c.length;}chunks=[];count=0;
    if(!muted)send({realtimeInput:{audio:{data:base64(toPcm16(all,ctx.sampleRate)),mimeType:'audio/pcm;rate=16000'}}});};
   on.status('Listening');
  }catch{on.note('The microphone is off for this site, so type instead, or allow the microphone in the browser’s settings.');on.status('Type your question');}
 }
 ws.onopen=()=>send({setup:{model:`models/${model}`,generationConfig:{responseModalities:['AUDIO']},systemInstruction:{parts:[{text:instruction}]},inputAudioTranscription:{},outputAudioTranscription:{}}});
 ws.onmessage=async e=>{
  let msg;try{msg=JSON.parse(typeof e.data==='string'?e.data:await e.data.text());}catch{return;}
  if(msg.setupComplete){live.ready=true;startMic();return;}
  const sc=msg.serverContent;if(!sc)return;
  if(sc.inputTranscription?.text)on.heard(sc.inputTranscription.text);
  if(sc.outputTranscription?.text)on.spoke(sc.outputTranscription.text);
  for(const p of sc.modelTurn?.parts||[])if(p.inlineData?.data){playPcm(p.inlineData.data);on.status('Speaking');}
  if(sc.interrupted){playing.forEach(s=>{try{s.stop();}catch{}});playAt=0;}
  if(sc.turnComplete){on.turnDone();on.status(mic?'Listening':'Type your question');}
 };
 ws.onclose=e=>{if(!live.ready){put(KEYS.model,'');on.failed(e.reason||'Gemini closed the connection. Check the key.');}else on.status('Ended');};
 return live;
}

readSetupLink();
window.CouncilTalk={open,setContext(fn){contextFn=fn;},flush,waiting,issueLink,hasKey:()=>!!get(KEYS.gemini)};
})();
