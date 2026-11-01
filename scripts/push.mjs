#!/usr/bin/env node
// Web Push sender for the owner's devices: VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291).
// Node 18+ built-ins only. Usage: keys <state-dir> | send <state-dir> <json-payload> | selftest
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SUBJECT='https://eman2xr.github.io/intuition-lab/';
const b64=buf=>Buffer.from(buf).toString('base64url');
const unb64=text=>Buffer.from(String(text),'base64url');
const hkdf=(ikm,salt,info,length)=>Buffer.from(crypto.hkdfSync('sha256',ikm,salt,info,length));

// Encrypts one record for a subscriber; sender keys and salt are fixed only by the self-test.
function encrypt(plaintext,p256dh,auth,{senderPrivate,salt}={}){
 const ua=unb64(p256dh),secret=unb64(auth);
 if(ua.length!==65||ua[0]!==4||secret.length!==16)throw new Error('Invalid subscription keys');
 const ecdh=crypto.createECDH('prime256v1');
 if(senderPrivate)ecdh.setPrivateKey(senderPrivate);else ecdh.generateKeys();
 const as=ecdh.getPublicKey();
 salt=salt||crypto.randomBytes(16);
 const ikm=hkdf(ecdh.computeSecret(ua),secret,Buffer.concat([Buffer.from('WebPush: info\0'),ua,as]),32);
 const cek=hkdf(ikm,salt,Buffer.from('Content-Encoding: aes128gcm\0'),16);
 const nonce=hkdf(ikm,salt,Buffer.from('Content-Encoding: nonce\0'),12);
 const cipher=crypto.createCipheriv('aes-128-gcm',cek,nonce);
 const body=Buffer.concat([cipher.update(Buffer.concat([Buffer.from(plaintext),Buffer.from([2])])),cipher.final(),cipher.getAuthTag()]);
 const header=Buffer.alloc(21);
 salt.copy(header,0);header.writeUInt32BE(4096,16);header[20]=as.length;
 return Buffer.concat([header,as,body]);
}

function vapidKey(vapid){
 const pub=unb64(vapid.publicKey);
 return crypto.createPrivateKey({key:{kty:'EC',crv:'P-256',d:vapid.privateKey,x:b64(pub.subarray(1,33)),y:b64(pub.subarray(33,65))},format:'jwk'});
}

function vapidHeader(endpoint,vapid,key){
 const claims={aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+12*3600,sub:SUBJECT};
 const unsigned=b64(JSON.stringify({typ:'JWT',alg:'ES256'}))+'.'+b64(JSON.stringify(claims));
 const signature=crypto.sign('sha256',Buffer.from(unsigned),{key,dsaEncoding:'ieee-p1363'});
 return `vapid t=${unsigned}.${b64(signature)}, k=${vapid.publicKey}`;
}

function keys(dir){
 const file=path.join(dir,'vapid.json');
 if(fs.existsSync(file)){
  console.error(`Keeping the existing key pair in ${file} (replacing it would cancel every subscription).`);
  console.log(JSON.parse(fs.readFileSync(file,'utf8')).publicKey);return;
 }
 fs.mkdirSync(dir,{recursive:true});
 const jwk=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'}).privateKey.export({format:'jwk'});
 const publicKey=b64(Buffer.concat([Buffer.from([4]),unb64(jwk.x),unb64(jwk.y)]));
 fs.writeFileSync(file,JSON.stringify({publicKey,privateKey:jwk.d},null,1)+'\n',{mode:0o600});
 fs.chmodSync(file,0o600);
 console.log(publicKey);
}

async function send(dir,payload){
 const message=JSON.stringify(JSON.parse(payload));
 const vapid=JSON.parse(fs.readFileSync(path.join(dir,'vapid.json'),'utf8'));
 const key=vapidKey(vapid);
 const file=path.join(dir,'push-subscriptions.json');
 const subs=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
 if(!subs.length){console.log('No push subscriptions.');return 0;}
 const keep=[];let failed=0;
 for(const sub of subs){
  const host=(()=>{try{return new URL(sub.endpoint).host;}catch{return 'invalid endpoint';}})();
  try{
   const response=await fetch(sub.endpoint,{method:'POST',body:encrypt(message,sub.keys.p256dh,sub.keys.auth),signal:AbortSignal.timeout(30000),
    headers:{Authorization:vapidHeader(sub.endpoint,vapid,key),'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:'86400',Urgency:'normal'}});
   if(response.status===404||response.status===410){console.log(`Removed expired subscription (${response.status}) at ${host}`);continue;}
   keep.push(sub);
   if(response.ok)console.log(`Sent (${response.status}) to ${host}`);
   else{failed++;console.log(`Failed (${response.status}) at ${host}: ${(await response.text()).slice(0,200).replace(/\s+/g,' ')}`);}
  }catch(error){keep.push(sub);failed++;console.log(`Failed at ${host}: ${error.message}`);}
 }
 if(keep.length!==subs.length){fs.writeFileSync(file,JSON.stringify(keep,null,1)+'\n',{mode:0o600});fs.chmodSync(file,0o600);}
 return failed?1:0;
}

// RFC 8291 section 5 example: fixed sender key and salt must reproduce the published message exactly.
function selftest(){
 const expected='DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';
 const got=b64(encrypt('When I grow up, I want to be a watermelon','BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4','BTBZMqHH6r4Tts7J_aSIgg',
  {senderPrivate:unb64('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'),salt:unb64('DGv6ra1nlYgDCS1FRnbzlw')}));
 const pair=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'}).privateKey.export({format:'jwk'});
 const vapid={publicKey:b64(Buffer.concat([Buffer.from([4]),unb64(pair.x),unb64(pair.y)])),privateKey:pair.d};
 const token=/t=([^,]+)/.exec(vapidHeader('https://push.example/x',vapid,vapidKey(vapid)))[1].split('.');
 const unsigned=token.slice(0,2).join('.'),sig=token[2];
 const signed=crypto.verify('sha256',Buffer.from(unsigned),{key:crypto.createPublicKey({key:{kty:'EC',crv:'P-256',x:pair.x,y:pair.y},format:'jwk'}),dsaEncoding:'ieee-p1363'},unb64(sig));
 const ok=got===expected&&signed;
 console.log(ok?'Self-test passed (RFC 8291 example and VAPID signature).':`Self-test failed: ${got===expected?'VAPID signature':'encryption mismatch'}`);
 return ok?0:1;
}

const [command,dir,payload]=process.argv.slice(2);
try{
 if(command==='keys'&&dir)keys(dir);
 else if(command==='send'&&dir&&payload)process.exitCode=await send(dir,payload);
 else if(command==='selftest')process.exitCode=selftest();
 else{console.error('Usage: push.mjs keys <state-dir> | send <state-dir> <json-payload> | selftest');process.exitCode=2;}
}catch(error){console.log(`Push failed: ${error.message}`);process.exitCode=1;}
