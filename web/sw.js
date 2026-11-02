// Service worker: offline reading for the installed app and Web Push notifications for new guides.
// Other projects share the eman2xr.github.io origin, so this app only touches caches with its own prefix.
const PREFIX='intuition-lab-', CACHE=PREFIX+'v2';
const INDEX=new URL('./',self.location).href;
const isHTML=response=>(response.headers.get('content-type')||'').includes('text/html');

// The page and the versioned files it links (the deploy stamps ?v= with the commit), so the first offline launch has
// its styles and scripts.
async function precache(){
 const page=await fetch(new Request(INDEX,{cache:'no-cache'}));
 if(!page.ok||!isHTML(page))return;
 const html=await page.clone().text();
 await store(INDEX,page);
 const assets=new Set([...html.matchAll(/(?:src|href)="([^"]+\?v=[^"]+)"/g)].map(m=>new URL(m[1],INDEX).href));
 await Promise.all([...assets].map(url=>fetch(url,{cache:'no-cache'}).then(response=>store(url,response)).catch(()=>{})));
}

self.addEventListener('install',event=>{
 event.waitUntil(precache().catch(()=>{}).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

// Keeps one copy per file: a new ?v= version replaces the previous one.
async function store(key,response){
 if(!response||!response.ok||response.type==='opaque')return;
 const cache=await caches.open(CACHE),url=new URL(key);
 if(url.search){for(const old of await cache.keys())if(new URL(old.url).pathname===url.pathname&&old.url!==url.href)cache.delete(old);}
 await cache.put(key,response);
}
async function cached(key){return (await caches.open(CACHE)).match(key);}

// Pages and data come from the network whenever it answers; the cache is only the offline copy, and only an HTML
// answer is kept as the page.
async function networkFirst(event,key){
 const request=event.request, page=request.mode==='navigate';
 try{
  const response=await fetch(page?new Request(request.url,{cache:'no-cache',credentials:'same-origin'}):new Request(request,{cache:'no-cache'}));
  if(response.ok&&(!page||isHTML(response)))event.waitUntil(store(key,response.clone()));
  return response;
 }catch(error){
  const copy=await cached(key);
  if(copy)return copy;
  throw error;
 }
}

// A versioned file never changes under its version, so it is fetched only when missing. It is not refreshed in the
// background: GitHub Pages ignores the query, so a refresh could store a newer deploy's file under an older version.
async function versioned(event){
 const copy=await cached(event.request.url);
 if(copy)return copy;
 const response=await fetch(event.request);
 event.waitUntil(store(event.request.url,response.clone()));
 return response;
}

// Pictures and icons come from the cache at once and are refreshed in the background.
async function refreshed(event){
 const copy=await cached(event.request.url);
 const fresh=fetch(event.request).then(response=>{event.waitUntil(store(event.request.url,response.clone()));return response;});
 if(copy){event.waitUntil(fresh.catch(()=>{}));return copy;}
 return fresh;
}

self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(INDEX))return;
 if(url.pathname.endsWith('/sw.js'))return;
 if(request.mode==='navigate')event.respondWith(networkFirst(event,INDEX));
 else if(url.searchParams.has('v'))event.respondWith(versioned(event));
 else if(/\.(json|webmanifest)$/.test(url.pathname))event.respondWith(networkFirst(event,request.url));
 else event.respondWith(refreshed(event));
});

self.addEventListener('push',event=>{
 let data={};
 try{data=event.data?event.data.json():{};}catch{data={body:event.data.text()};}
 event.waitUntil(self.registration.showNotification(data.title||'Intuition Lab',{
  body:data.body||'',icon:new URL('icons/icon-192.png',self.registration.scope).href,data:{url:data.url||self.registration.scope}}));
});

// A window of the app already open shows the guide; with the app closed, a new window opens on it.
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const scope=self.registration.scope;
 let target=scope;
 try{const url=new URL(event.notification.data?.url||'',scope);if(url.href.startsWith(scope))target=url.href;}catch{}
 event.waitUntil((async()=>{
  const windows=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(w=>w.url.startsWith(scope));
  const same=windows.find(w=>w.url===target);
  if(same)return same.focus();
  for(const w of windows){
   try{const moved=await w.navigate(target);if(moved)return moved.focus();}catch{}
  }
  return self.clients.openWindow(target);
 })());
});
