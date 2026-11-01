// Service worker: offline reading for the installed app and Web Push notifications for new guides.
const CACHE='intuition-lab-v1';
const INDEX=new URL('./',self.location).href;

self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.add(new Request(INDEX,{cache:'no-cache'}))).catch(()=>{}).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

// Keeps one copy per file: a new ?v= version replaces the previous one.
async function store(key,response){
 if(!response||!response.ok||response.type==='opaque')return;
 const cache=await caches.open(CACHE),url=new URL(key);
 if(url.search){for(const old of await cache.keys())if(new URL(old.url).pathname===url.pathname&&old.url!==url.href)cache.delete(old);}
 await cache.put(key,response);
}

// Pages and data come from the network whenever it answers; the cache is only the offline copy.
async function networkFirst(request,key){
 try{
  const response=await fetch(request.mode==='navigate'?new Request(request.url,{cache:'no-cache',credentials:'same-origin'}):new Request(request,{cache:'no-cache'}));
  if(response.ok)store(key,response.clone());
  return response;
 }catch(error){
  const cached=await caches.match(key);
  if(cached)return cached;
  throw error;
 }
}

// Versioned scripts, styles and images are served from the cache and refreshed in the background.
async function cacheFirst(event){
 const cached=await caches.match(event.request);
 const fresh=fetch(event.request).then(response=>{store(event.request.url,response.clone());return response;});
 if(cached){event.waitUntil(fresh.catch(()=>{}));return cached;}
 return fresh;
}

self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(INDEX))return;
 if(url.pathname.endsWith('/sw.js'))return;
 if(request.mode==='navigate')event.respondWith(networkFirst(request,INDEX));
 else if(url.pathname.endsWith('.json')||url.pathname.endsWith('.webmanifest'))event.respondWith(networkFirst(request,request.url));
 else event.respondWith(cacheFirst(event));
});

self.addEventListener('push',event=>{
 let data={};
 try{data=event.data?event.data.json():{};}catch{data={body:event.data.text()};}
 event.waitUntil(self.registration.showNotification(data.title||'Intuition Lab',{
  body:data.body||'',icon:new URL('icons/icon-192.png',self.registration.scope).href,data:{url:data.url||self.registration.scope}}));
});

self.addEventListener('notificationclick',event=>{
 event.notification.close();
 let target=self.registration.scope;
 try{const url=new URL(event.notification.data?.url||'',self.registration.scope);if(url.origin===self.location.origin)target=url.href;}catch{}
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const same=windows.find(w=>w.url===target);
  if(same)return same.focus();
  for(const w of windows){
   try{const moved=await w.navigate(target);if(moved)return moved.focus();}catch{}
  }
  return self.clients.openWindow(target);
 })());
});
