// A WebGL2 renderer for black holes, in the spirit of film rendering: every pixel's light path is traced through the
// curved space around a non-spinning (Schwarzschild) black hole, in high dynamic range, then finished with bloom,
// tonemapping, a gentle grade, a vignette and film grain. It draws the whole stage (a lensed starfield and up to two
// black holes) into its own canvas, which the 2D picture copies in; labels and diagrams stay in 2D on top.
// CouncilGL.blackHoles(ctx, w, h, opts) returns false where WebGL2 is not available, so the engine can fall back.
(function(){
'use strict';
const VS=`#version 300 es
in vec2 aPos;void main(){gl_Position=vec4(aPos,0.,1.);}`;
const COMMON=`#version 300 es
precision highp float;
out vec4 o;
// Integer hashes: GPU sine loses precision on large arguments and turns sine hashes into blocks.
uint hu(uint x){x^=x>>16;x*=0x7feb352du;x^=x>>15;x*=0x846ca68bu;x^=x>>16;return x;}
float h1(vec3 p){ivec3 i=ivec3(floor(p)),f=ivec3(fract(p)*4096.);uint h=hu(uint(i.x)^hu(uint(i.y)^hu(uint(i.z)^hu(uint(f.x+f.y*4096)^uint(f.z)*2654435761u))));return float(h)/4294967295.;}
float h1(vec2 p){return h1(vec3(p,0.));}
float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(h1(i),h1(i+vec3(1,0,0)),f.x),mix(h1(i+vec3(0,1,0)),h1(i+vec3(1,1,0)),f.x),f.y),
  mix(mix(h1(i+vec3(0,0,1)),h1(i+vec3(1,0,1)),f.x),mix(h1(i+vec3(0,1,1)),h1(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n3(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}
`;
// The scene, in linear light. Units are the hole's mass M (G = c = 1): the horizon is at r = 2, the photon sphere at
// r = 3, and the shadow's edge has impact parameter 3*sqrt(3). The camera's distance is set per hole from its size.
const SCENE=COMMON+`
uniform vec2 uRes,uCss;uniform float uT,uStars;uniform int uCount;
uniform vec4 uHole[2];uniform vec4 uOpt[2];
const float BC=5.196152,FOV=.75;float D=30.;
vec3 stars(vec3 d,float px){
 vec3 c=vec3(0);float th=atan(d.x,-d.z),ph=asin(clamp(d.y,-1.,1.));
 for(int L=0;L<3;L++){float sc=90.*pow(1.9,float(L));vec2 g=vec2(th,ph)*sc;vec2 id=floor(g),f=fract(g)-.5;
  float pick=h1(vec3(id,float(L)*31.));if(pick<.955)continue;
  vec2 off=(vec2(h1(vec3(id,3.1)),h1(vec3(id,7.7)))-.5)*.7;float dd=length(f-off)/sc;float s=max(px*.6,.0003);
  float flux=(.08+pow(h1(vec3(id,1.3)),8.)*(L==0?10.:3.))/(1.+float(L));
  vec3 tint=mix(vec3(.75,.85,1.),vec3(1.,.85,.65),h1(vec3(id,9.9)));c+=tint*flux*exp(-dd*dd/(s*s));}
 float n=fbm(d*2.6+vec3(0.,0.,3.));c+=vec3(.2,.15,.38)*pow(n,4.)*.2+vec3(.04,.06,.13)*pow(fbm(d*1.3),3.)*.3;
 return c*uStars;
}
// Bits on the horizon: equal-area cells in latitude bands (no seams), each a soft spot, lit or near black, flickering
// slowly. N is the number of cells over the whole horizon; on scales their light.
vec3 bits(vec3 n,float N,float on,float spin){
 float c=cos(spin),s=sin(spin);n=vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z);
 float NB=max(2.,floor(sqrt(3.14159*N/4.)+.5)),lat=asin(clamp(n.y,-1.,1.)),lon=atan(n.z,n.x)+3.14159;
 float band=min(NB-1.,floor((lat/3.14159+.5)*NB)),latc=((band+.5)/NB-.5)*3.14159;
 float nk=max(1.,floor(2.*NB*cos(latc)+.5)),cell=floor(lon/6.28318*nk),lonc=(cell+.5)/nk*6.28318;
 vec2 d=vec2((lat-latc)/(3.14159/NB),(lon-lonc)*cos(lat)/(3.14159/NB));
 float lit=step(.55,h1(vec3(band,cell,floor(uT*.9+h1(vec3(band,cell,7.))*6.))));
 float spot=exp(-dot(d,d)*26.);
 return (lit>0.?vec3(.5,.85,1.7)*spot:vec3(.02,.03,.05)*spot)*on;
}
vec3 diskLight(vec3 c,vec3 ph,float x,float amt,out float op){
 float Tm=pow(x/6.,-.75)*pow(max(1.-sqrt(6./x),0.),.25);
 vec3 vdir=normalize(cross(vec3(0,1,0),c));float v=1./sqrt(max(x-2.,1.01)),gam=1./sqrt(1.-v*v);
 float g=sqrt(max(1.-3./x,.02))/(1.-v*dot(vdir,-ph));
 float ang=atan(c.z,c.x),w=pow(x,-1.5);
 float tex=.55+.9*fbm(vec3(log(x)*6.,ang*3.-uT*w*6.,0.))*fbm(vec3(log(x)*22.,ang*1.5-uT*w*6.,4.));
 float T=Tm*g;vec3 col=mix(vec3(1.,.3,.06),vec3(1.,.78,.5),clamp(T*1.3-.25,0.,1.));col=mix(col,vec3(.9,.95,1.),clamp(T*1.4-1.2,0.,1.));
 op=smoothstep(6.,6.8,x)*smoothstep(16.,10.,x);
 return col*pow(g,4.)*Tm*Tm*tex*5.*amt;
}
void main(){
 vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)/uRes*uCss;
 float m=min(uCss.x,uCss.y);
 int k=-1;float best=1e9;
 for(int i=0;i<2;i++){if(i>=uCount)break;float q=length(p-uHole[i].xy)/uHole[i].z;if(q<best){best=q;k=i;}}
 // Without a hole: an undeflected starfield, a little over 40 degrees across the shorter side.
 if(k<0){vec2 s=(p-uCss*.5)*FOV/m;vec3 d=normalize(vec3(s.x,-s.y,-1.));o=vec4(stars(d,FOV/m),1.);return;}
 vec4 H=uHole[k],O=uOpt[k];
 float el=O.w;vec3 e1=vec3(0.,sin(el),cos(el)),right=vec3(1,0,0),up=vec3(0.,cos(el),-sin(el));
 // One field of view for the whole stage (FOV radians across its shorter side): the camera stands as far from each
 // hole as makes its shadow the size asked for, so the starfield is continuous between and around the holes.
 float px=FOV/m;D=BC/tan(H.z*px);
 vec2 off=p-H.xy;float rr=length(off);vec2 sd=rr>0.?off/rr:vec2(1,0);
 vec3 s3=normalize(right*sd.x-up*sd.y);
 float theta=rr*px,b=D*sin(theta);
 vec3 col=vec3(0);float alpha=0.,hitPhi=0.;vec3 dir=normalize(-e1*cos(theta)+s3*sin(theta)),pos=D*e1;int kind=0;vec3 flat_=dir;
 if(b<min(D*.85,BC*14.)){
  float u=1./D,w=sqrt(max(0.,1./(b*b)-u*u*(1.-2.*u))),phi=0.,dphi=.03;vec3 prev=D*e1;bool out_=false;
  for(int i=0;i<400;i++){
   float k1u=w,k1w=-u+3.*u*u,u2=u+.5*dphi*k1u,w2=w+.5*dphi*k1w,k2u=w2,k2w=-u2+3.*u2*u2;
   float u3=u+.5*dphi*k2u,w3=w+.5*dphi*k2w,k3u=w3,k3w=-u3+3.*u3*u3,u4=u+dphi*k3u,w4=w+dphi*k3w,k4u=w4,k4w=-u4+3.*u4*u4;
   u+=dphi*(k1u+2.*k2u+2.*k3u+k4u)/6.;w+=dphi*(k1w+2.*k2w+2.*k3w+k4w)/6.;phi+=dphi;
   if(u>=.5){kind=1;hitPhi=phi;pos=2.*(cos(phi)*e1+sin(phi)*s3);break;}
   // Heading outward beyond the camera's distance: the ray has escaped; its direction comes from the orbit itself.
   if(u<=.9/D&&w<0.){out_=true;break;}
   pos=(1./max(u,1e-4))*(cos(phi)*e1+sin(phi)*s3);
   if(O.x>0.&&prev.y*pos.y<0.){float a=prev.y/(prev.y-pos.y);vec3 c=mix(prev,pos,a);float x=length(c);
    if(x>6.&&x<16.){float op;vec3 e=diskLight(c,normalize(pos-prev),x,O.x,op);col+=e*(1.-alpha);alpha+=(1.-alpha)*op;}}
   if(alpha>.985){kind=2;break;}
   prev=pos;
  }
  if(kind==0){float uu=max(u,1e-4);vec3 rad=cos(phi)*e1+sin(phi)*s3,tan_=-sin(phi)*e1+cos(phi)*s3;dir=normalize(-w/(uu*uu)*rad+tan_/uu);}
 }
 if(kind==0)dir=normalize(mix(dir,flat_,smoothstep(2.6,4.2,rr/H.z)));
 vec3 bg=kind==0?stars(dir,px):vec3(0);
 // The direct image of the horizon at full strength; the far side's thin rings near the edge, seen only by rays that
 // wound far round the hole, kept faint so they shimmer less.
 if(kind==1)bg=bits(normalize(pos),H.w,O.z,O.y)*mix(1.,.15,smoothstep(3.3,4.2,hitPhi));
 o=vec4(col+bg*(1.-alpha),1.);
}`;
// Bloom: keep what is brighter than about white, then blur it at a quarter of the size.
const BRIGHT=COMMON+`uniform sampler2D uTex;uniform vec2 uTexel;
void main(){vec2 uv=gl_FragCoord.xy*uTexel;vec3 c=vec3(0);for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++)c+=texture(uTex,uv+vec2(i,j)*uTexel*.5).rgb;c/=9.;
 float l=max(c.r,max(c.g,c.b));o=vec4(c*smoothstep(.55,1.6,l),1.);}`;
const BLUR=COMMON+`uniform sampler2D uTex;uniform vec2 uTexel,uDir;
void main(){vec2 uv=gl_FragCoord.xy*uTexel;vec3 c=texture(uTex,uv).rgb*.2270;
 c+=(texture(uTex,uv+uDir*uTexel*1.385).rgb+texture(uTex,uv-uDir*uTexel*1.385).rgb)*.3162;
 c+=(texture(uTex,uv+uDir*uTexel*3.231).rgb+texture(uTex,uv-uDir*uTexel*3.231).rgb)*.0703;o=vec4(c,1.);}`;
// The finish: bloom added, ACES tonemap, a cool-shadow and warm-highlight grade, vignette and grain, then sRGB.
const FINISH=COMMON+`uniform sampler2D uTex,uBloom;uniform vec2 uRes;uniform float uT,uBloomAmt,uExposure,uGrain;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec3 c=texture(uTex,uv).rgb+texture(uBloom,uv).rgb*uBloomAmt;
 c=aces(c*uExposure);float l=dot(c,vec3(.2126,.7152,.0722));
 c*=mix(vec3(.96,1.,1.06),vec3(1.04,1.,.95),smoothstep(.1,.7,l));c+=vec3(0.,.002,.006);
 vec2 q=uv-.5;c*=1.-.32*smoothstep(.25,.9,dot(q,q)*2.2);
 c=pow(max(c,0.),vec3(1./2.2));
 float gr=h1(floor(gl_FragCoord.xy/1.6)+fract(uT*7.13)*91.7)-.5;c+=gr*uGrain;
 o=vec4(c,1.);}`;
let G=null;
function init(){
 if(G!==null)return G;
 try{
  const canvas=document.createElement('canvas'), gl=canvas.getContext('webgl2',{antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:false});
  if(!gl){G=false;return G;}
  const float=!!gl.getExtension('EXT_color_buffer_float')||!!gl.getExtension('EXT_color_buffer_half_float');
  const sh=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
  const prog=fs=>{const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,VS));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));gl.bindAttribLocation(p,0,'aPos');gl.linkProgram(p);
   if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));const u={};const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
   for(let i=0;i<n;i++){const a=gl.getActiveUniform(p,i);u[a.name.replace(/\[0\]$/,'')]=gl.getUniformLocation(p,a.name);}return {p,u};};
  const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  G={canvas,gl,float,scene:prog(SCENE),bright:prog(BRIGHT),blur:prog(BLUR),finish:prog(FINISH),targets:null,key:''};
 }catch(e){console.warn('CouncilGL:',e.message);G=false;}
 return G;
}
function target(gl,w,h,float){
 const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
 gl.texImage2D(gl.TEXTURE_2D,0,float?gl.RGBA16F:gl.RGBA8,w,h,0,gl.RGBA,float?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
 for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
 const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
 return {tex,fb,w,h};
}
// holes: [{x, y, R (the shadow's radius, CSS px), bits (count, 0 for none), disk (0..1), spin, elevation (radians)}]
function blackHoles(ctx,w,h,{t=0,holes=[],stars=1,bloom=1,exposure=1,grain=.035,scale=1}={}){
 const S=init();if(!S)return false;
 const {gl}=S, dpr=Math.min(window.devicePixelRatio||1,2), cap=Math.sqrt(1.1e6/Math.max(1,w*h*dpr*dpr)), k=Math.min(1,cap)*dpr*scale;
 const W=Math.max(2,Math.round(w*k)), H=Math.max(2,Math.round(h*k)), key=W+'x'+H;
 if(S.key!==key){S.canvas.width=W;S.canvas.height=H;S.targets={scene:target(gl,W,H,S.float),a:target(gl,Math.ceil(W/4),Math.ceil(H/4),S.float),b:target(gl,Math.ceil(W/4),Math.ceil(H/4),S.float)};S.key=key;}
 const T=S.targets, use=(P,fb,vw,vh)=>{gl.useProgram(P.p);gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.viewport(0,0,vw,vh);};
 const hole=new Float32Array(8),opt=new Float32Array(8);
 holes.slice(0,2).forEach((q,i)=>{hole.set([q.x,q.y,q.R,Math.max(1,q.bits||0)],i*4);opt.set([q.disk||0,q.spin||0,q.bits?(q.bitsOn??1):0,q.elevation??.16],i*4);});
 const sc=S.scene;use(sc,T.scene.fb,W,H);
 gl.uniform2f(sc.u.uRes,W,H);gl.uniform2f(sc.u.uCss,w,h);gl.uniform1f(sc.u.uT,t);gl.uniform1f(sc.u.uStars,stars);gl.uniform1i(sc.u.uCount,Math.min(2,holes.length));
 gl.uniform4fv(sc.u.uHole,hole);gl.uniform4fv(sc.u.uOpt,opt);gl.drawArrays(gl.TRIANGLES,0,3);
 const tex=(P,name,t2,unit)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t2);gl.uniform1i(P.u[name],unit);};
 const br=S.bright;use(br,T.a.fb,T.a.w,T.a.h);tex(br,'uTex',T.scene.tex,0);gl.uniform2f(br.u.uTexel,1/T.a.w,1/T.a.h);gl.drawArrays(gl.TRIANGLES,0,3);
 const bl=S.blur;for(let r=0;r<2;r++){
  use(bl,T.b.fb,T.b.w,T.b.h);tex(bl,'uTex',T.a.tex,0);gl.uniform2f(bl.u.uTexel,1/T.b.w,1/T.b.h);gl.uniform2f(bl.u.uDir,1+r,0);gl.drawArrays(gl.TRIANGLES,0,3);
  use(bl,T.a.fb,T.a.w,T.a.h);tex(bl,'uTex',T.b.tex,0);gl.uniform2f(bl.u.uTexel,1/T.a.w,1/T.a.h);gl.uniform2f(bl.u.uDir,0,1+r);gl.drawArrays(gl.TRIANGLES,0,3);}
 const fi=S.finish;use(fi,null,W,H);tex(fi,'uTex',T.scene.tex,0);tex(fi,'uBloom',T.a.tex,1);
 gl.uniform2f(fi.u.uRes,W,H);gl.uniform1f(fi.u.uT,t);gl.uniform1f(fi.u.uBloomAmt,.9*bloom);gl.uniform1f(fi.u.uExposure,exposure);gl.uniform1f(fi.u.uGrain,grain);
 gl.drawArrays(gl.TRIANGLES,0,3);
 ctx.drawImage(S.canvas,0,0,w,h);
 return true;
}
window.CouncilGL={blackHoles,available:()=>!!init()};
})();
