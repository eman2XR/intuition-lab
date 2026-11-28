// A small WebGL2 film engine for Intuition Lab's pre-rendered guides, after the way "The Arrow of Time" is made
// (github.com/abhishekpradhan/the-arrow-of-time; ideas, not code). It renders one frame for a given time,
// deterministically: each active shot draws linear HDR light with a full-screen shader, shots overlapping in time
// dissolve, several sub-frame samples spread over the shutter are averaged (motion blur, and anti-aliasing through a
// sub-pixel jitter per sample), and a post chain finishes the frame: bloom, halation, ACES tonemap, a grade, chromatic
// aberration, vignette and grain. Captions are not drawn here: the project returns them, and the page lays them out
// as HTML over the video, so they stay sharp on any screen.
(function(){
'use strict';
const LIB=`
precision highp float;precision highp int;
uniform vec2 uRes;uniform float uTime,uT;uniform vec2 uJitter;
uniform vec3 uCamPos,uCamFwd,uCamRight,uCamUp;uniform float uTanHalf;
out vec4 o;
const float PI=3.14159265,TAU=6.2831853;
uint hu(uint x){x^=x>>16;x*=0x7feb352du;x^=x>>15;x*=0x846ca68bu;x^=x>>16;return x;}
float hashi(ivec3 i){return float(hu(uint(i.x)^hu(uint(i.y)^hu(uint(i.z)+0x9e3779b9u))))/4294967295.;}
float hash3(vec3 p){return hashi(ivec3(floor(p)));}
float vnoise(vec3 p){ivec3 i=ivec3(floor(p));vec3 f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);
 return mix(mix(mix(hashi(i),hashi(i+ivec3(1,0,0)),f.x),mix(hashi(i+ivec3(0,1,0)),hashi(i+ivec3(1,1,0)),f.x),f.y),
  mix(mix(hashi(i+ivec3(0,0,1)),hashi(i+ivec3(1,0,1)),f.x),mix(hashi(i+ivec3(0,1,1)),hashi(i+ivec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float s=0.,a=.5;for(int i=0;i<6;i++){s+=a*vnoise(p);p=p*2.02+vec3(3.1,1.7,5.3);a*=.5;}return s;}
float ridged(vec3 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*(1.-abs(vnoise(p)*2.-1.));p=p*2.03+vec3(1.3,7.1,2.9);a*=.5;}return s;}
vec2 pix(){return gl_FragCoord.xy+uJitter;}
vec2 centered(){return (pix()-.5*uRes)/uRes.y;}
vec3 camRay(){vec2 p=centered()*2.;return normalize(uCamFwd+(p.x*uCamRight+p.y*uCamUp)*uTanHalf);}
float pixelAngle(){return 2.*uTanHalf/uRes.y;}
vec2 sphereHit(vec3 ro,vec3 rd,vec3 c,float r){vec3 oc=ro-c;float b=dot(oc,rd),cc=dot(oc,oc)-r*r,h=b*b-cc;if(h<0.)return vec2(-1);h=sqrt(h);return vec2(-b-h,-b+h);}
// Stars as Gaussian points: the colour is the flux, so a star smaller than a pixel keeps its brightness and never
// flickers. Sparse and mostly faint, as a long lens sees deep space.
vec3 stars(vec3 d,float px,float amount){
 vec3 c=vec3(0);vec3 a=abs(d);vec2 uv;float face;
 if(a.x>=a.y&&a.x>=a.z){uv=d.yz/a.x;face=d.x>0.?0.:1.;}else if(a.y>=a.z){uv=d.xz/a.y;face=d.y>0.?2.:3.;}else{uv=d.xy/a.z;face=d.z>0.?4.:5.;}
 for(int L=0;L<3;L++){float sc=60.*pow(2.2,float(L));vec2 g=uv*sc;ivec2 id=ivec2(floor(g));
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){ivec2 q=id+ivec2(i,j);float pick=hashi(ivec3(q,int(face)*7+L));if(pick<.86)continue;
   vec2 pos=vec2(q)+vec2(hashi(ivec3(q,91+L)),hashi(ivec3(q,37+L)));float dd=length(g-pos)/sc;float s=max(px*.55,.00025);
   float flux=pow(hashi(ivec3(q,13+L)),9.)*3.+.025;vec3 tint=mix(vec3(.7,.8,1.),vec3(1.,.82,.6),hashi(ivec3(q,57+L)));
   c+=tint*flux*exp(-dd*dd/(s*s))*(px*px)/(s*s)*.9/(1.+float(L));}}
 return c*amount;
}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
`;
const VS=`#version 300 es
in vec2 aPos;void main(){gl_Position=vec4(aPos,0.,1.);}`;
const halton=(i,b)=>{let f=1,r=0;while(i>0){f/=b;r+=f*(i%b);i=Math.floor(i/b);}return r;};
const POST={
 copy:`uniform sampler2D uTex;uniform float uGain;void main(){o=texture(uTex,gl_FragCoord.xy/uRes)*uGain;}`,
 down:`uniform sampler2D uTex;uniform vec2 uSrc;uniform float uFirst;
  vec3 s(vec2 uv){return texture(uTex,uv).rgb;}
  void main(){vec2 uv=gl_FragCoord.xy/uRes,t=1./uSrc;
   vec3 a=s(uv+t*vec2(-2,2)),b=s(uv+t*vec2(0,2)),c=s(uv+t*vec2(2,2)),d=s(uv+t*vec2(-2,0)),e=s(uv),f=s(uv+t*vec2(2,0)),g=s(uv+t*vec2(-2,-2)),h=s(uv+t*vec2(0,-2)),i=s(uv+t*vec2(2,-2)),
    j=s(uv+t*vec2(-1,1)),k=s(uv+t*vec2(1,1)),l=s(uv+t*vec2(-1,-1)),m=s(uv+t*vec2(1,-1));
   vec3 r=e*.125+(a+c+g+i)*.03125+(b+d+f+h)*.0625+(j+k+l+m)*.125;
   if(uFirst>0.){float L=dot(r,vec3(.2126,.7152,.0722));r*=1./(1.+L*.25);} // tame single fireflies before they bloom
   o=vec4(r,1.);}`,
 up:`uniform sampler2D uTex,uBase;uniform vec2 uSrc;uniform float uRadius;
  void main(){vec2 uv=gl_FragCoord.xy/uRes,t=uRadius/uSrc;vec3 c=vec3(0);
   c+=texture(uTex,uv+t*vec2(-1,1)).rgb+texture(uTex,uv+t*vec2(1,1)).rgb+texture(uTex,uv+t*vec2(-1,-1)).rgb+texture(uTex,uv+t*vec2(1,-1)).rgb;
   c+=2.*(texture(uTex,uv+t*vec2(0,1)).rgb+texture(uTex,uv+t*vec2(0,-1)).rgb+texture(uTex,uv+t*vec2(1,0)).rgb+texture(uTex,uv+t*vec2(-1,0)).rgb);
   c+=4.*texture(uTex,uv).rgb;o=vec4(c/16.+texture(uBase,uv).rgb,1.);}`,
 finish:`uniform sampler2D uTex,uBloom,uHalo;uniform float uExposure,uBloomAmt,uHalation,uGrain,uVignette,uAberration,uSat,uContrast,uFade,uFrame;
  uniform vec3 uLift,uGain;
  void main(){vec2 uv=gl_FragCoord.xy/uRes,q=uv-.5;float r2=dot(q,q);
   vec2 off=q*uAberration*.004;vec3 c=vec3(texture(uTex,uv-off).r,texture(uTex,uv).g,texture(uTex,uv+off).b);
   vec3 bl=texture(uBloom,uv).rgb;c=c+bl*uBloomAmt;
   vec3 ha=texture(uHalo,uv).rgb;float hl=dot(ha,vec3(.2126,.7152,.0722));c+=vec3(1.,.42,.18)*hl*uHalation;
   c=aces(c*exp2(uExposure));
   float L=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(L),c,uSat);c=(c-.5)*uContrast+.5;
   c=uGain*(c+uLift*(1.-c));c=clamp(c,0.,1.);
   c*=1.-uVignette*smoothstep(.12,.75,r2*1.9);
   c=pow(c,vec3(1./2.2));
   vec2 g=floor(gl_FragCoord.xy/1.6);float n=hashi(ivec3(ivec2(g),int(uFrame)))-.5;c+=n*uGrain*(1.-.6*L);
   o=vec4(c*uFade,1.);}`
};
class Engine{
 constructor(canvas,{width,height,fps=24,shutter=.5}){
  this.canvas=canvas;canvas.width=width;canvas.height=height;this.W=width;this.H=height;this.fps=fps;this.shutter=shutter;
  const gl=canvas.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true,premultipliedAlpha:false});
  if(!gl)throw new Error('WebGL2 is not available');
  if(!gl.getExtension('EXT_color_buffer_float'))throw new Error('Float render targets are not available');
  gl.getExtension('OES_texture_float_linear');
  this.gl=gl;this.programs=new Map();this.textures=new Map();
  const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  this.scene=this.target(width,height);this.shotRT=this.target(width,height);this.accum=this.target(width,height);
  this.levels=[];let w=width,h=height;for(let i=0;i<6;i++){w=Math.max(1,w>>1);h=Math.max(1,h>>1);this.levels.push({down:this.target(w,h),up:this.target(w,h)});}
  for(const [k,src] of Object.entries(POST))this.programs.set('post:'+k,this.compile(src));
 }
 target(w,h){const gl=this.gl,tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,w,h,0,gl.RGBA,gl.HALF_FLOAT,null);
  for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
  const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);return {tex,fb,w,h};}
 compile(body){const gl=this.gl,src='#version 300 es\n'+LIB+body;
  const sh=(t,s)=>{const x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(x);throw new Error(log+'\n'+s.split('\n').map((l,i)=>(i+1)+': '+l).join('\n').slice(0,4000));}return x;};
  const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,VS));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,src));gl.bindAttribLocation(p,0,'aPos');gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
  const u={},n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let i=0;i<n;i++){const a=gl.getActiveUniform(p,i);u[a.name.replace(/\[0\]$/,'')]={loc:gl.getUniformLocation(p,a.name),type:a.type,size:a.size};}
  return {p,u};}
 program(name,src){if(!this.programs.has(name))this.programs.set(name,this.compile(src));return this.programs.get(name);}
 // A texture from an image URL (loaded once, before rendering starts).
 async texture(name,url,{srgb=true,repeatX=false}={}){const gl=this.gl,img=new Image();img.src=url;await img.decode();
  const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,srgb?gl.SRGB8_ALPHA8:gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,img);gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,repeatX?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const an=gl.getExtension('EXT_texture_filter_anisotropic');if(an)gl.texParameterf(gl.TEXTURE_2D,an.TEXTURE_MAX_ANISOTROPY_EXT,8);
  this.textures.set(name,tex);return tex;}
 draw(prog,rt,uniforms={}){
  const gl=this.gl;gl.useProgram(prog.p);gl.bindFramebuffer(gl.FRAMEBUFFER,rt?rt.fb:null);const w=rt?rt.w:this.W,h=rt?rt.h:this.H;gl.viewport(0,0,w,h);
  let unit=0;const all={uRes:[w,h],...uniforms};
  for(const [name,info] of Object.entries(prog.u)){
   if(!(name in all))continue;let v=all[name];
   if(info.type===gl.SAMPLER_2D){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,typeof v==='string'?this.textures.get(v):v.tex||v);gl.uniform1i(info.loc,unit);unit++;continue;}
   if(typeof v==='boolean')v=v?1:0;
   const arr=typeof v==='number'?[v]:Array.from(v);
   switch(info.type){case gl.FLOAT:gl.uniform1fv(info.loc,arr);break;case gl.FLOAT_VEC2:gl.uniform2fv(info.loc,arr);break;case gl.FLOAT_VEC3:gl.uniform3fv(info.loc,arr);break;
    case gl.FLOAT_VEC4:gl.uniform4fv(info.loc,arr);break;case gl.INT:gl.uniform1iv(info.loc,arr.map(Math.round));break;case gl.FLOAT_MAT3:gl.uniformMatrix3fv(info.loc,false,arr);break;}
  }
  gl.drawArrays(gl.TRIANGLES,0,3);
 }
 // Renders the frame at film time t: samples sub-frames over the shutter, each with a sub-pixel jitter.
 render(project,t,{samples=project.samples??4,frame=Math.round(t*this.fps)}={}){
  const gl=this.gl,S=Math.max(1,samples);
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.accum.fb);gl.viewport(0,0,this.W,this.H);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
  for(let k=0;k<S;k++){
   const ts=t+((k+.5)/S-.5)*this.shutter/this.fps, jitter=S>1?[halton(k+1,2)-.5,halton(k+1,3)-.5]:[0,0];
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.scene.fb);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
   for(const shot of project.shots){
    const w=weight(shot,ts);if(w<=0)continue;
    const local=ts-shot.start, u=shot.render(local,ts,this);
    this.draw(this.program(shot.id,shot.shader),this.shotRT,{uTime:ts,uT:local,uJitter:jitter,...u});
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);this.draw(this.programs.get('post:copy'),this.scene,{uTex:this.shotRT,uGain:w});gl.disable(gl.BLEND);
   }
   gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);this.draw(this.programs.get('post:copy'),this.accum,{uTex:this.scene,uGain:1/S});gl.disable(gl.BLEND);
  }
  this.post(project.look?project.look(t):{},frame);
 }
 post(look,frame){
  const L={exposure:0,bloom:.09,bloomRadius:1,halation:.12,grain:.035,vignette:.32,aberration:.35,saturation:1,contrast:1.04,lift:[0,.0005,.0015],gain:[1,1,1],fade:1,...look};
  let src=this.accum;
  this.levels.forEach((lv,i)=>{this.draw(this.programs.get('post:down'),lv.down,{uTex:src.tex?src:src,uSrc:[src.w,src.h],uFirst:i===0?1:0});src=lv.down;});
  for(let i=this.levels.length-1;i>=0;i--){const lv=this.levels[i],from=i===this.levels.length-1?lv.down:this.levels[i+1].up;
   this.draw(this.programs.get('post:up'),lv.up,{uTex:from,uBase:lv.down,uSrc:[from.w,from.h],uRadius:L.bloomRadius});}
  this.draw(this.programs.get('post:finish'),null,{uTex:this.accum,uBloom:this.levels[0].up,uHalo:this.levels[2].up,uExposure:L.exposure,uBloomAmt:L.bloom,uHalation:L.halation,
   uGrain:L.grain,uVignette:L.vignette,uAberration:L.aberration,uSat:L.saturation,uContrast:L.contrast,uLift:L.lift,uGain:L.gain,uFade:L.fade,uFrame:frame});
 }
}
function weight(shot,t){
 if(t<shot.start||t>shot.end)return 0;
 const a=shot.fadeIn?Math.min(1,(t-shot.start)/shot.fadeIn):1, b=shot.fadeOut?Math.min(1,(shot.end-t)/shot.fadeOut):1;
 const s=x=>x*x*(3-2*x);return s(Math.max(0,Math.min(a,b)));
}
// A look-at camera shared by shaders (as uniforms) and captions (by projecting points to the screen).
class Camera{
 constructor(){this.set({pos:[0,0,5],target:[0,0,0],fov:40});}
 set({pos,target,fov=this.fov??40,roll=0}){this.pos=pos;this.target=target;this.fov=fov;
  const f=norm(sub(target,pos));let r=norm(cross(f,[0,1,0]));let u=cross(r,f);
  if(roll){const c=Math.cos(roll),s=Math.sin(roll);[r,u]=[add(scale(r,c),scale(u,s)),add(scale(u,c),scale(r,-s))];}
  this.f=f;this.r=r;this.u=u;this.tan=Math.tan(fov*Math.PI/360);return this;}
 uniforms(){return {uCamPos:this.pos,uCamFwd:this.f,uCamRight:this.r,uCamUp:this.u,uTanHalf:this.tan};}
 // A world point to [x, y] across the frame (0..1, y down) for a frame of the given aspect, or null behind the camera.
 project(p,aspect){const d=sub(p,this.pos),z=dot(d,this.f);if(z<=0)return null;
  const x=dot(d,this.r)/(z*this.tan*2), y=dot(d,this.u)/(z*this.tan*2);return [.5+x/aspect,.5-y];}
}
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],scale=(a,s)=>[a[0]*s,a[1]*s,a[2]*s],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>{const l=Math.hypot(...a)||1;return [a[0]/l,a[1]/l,a[2]/l];};
// Eased keyframes [[t, v, ease?], ...] and helpers, as in the film's anim.ts.
const EASE={linear:x=>x,inOutSine:x=>-(Math.cos(Math.PI*x)-1)/2,outCubic:x=>1-Math.pow(1-x,3),inCubic:x=>x*x*x,inOutCubic:x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2};
function keys(t,k){if(t<=k[0][0])return k[0][1];for(let i=1;i<k.length;i++){if(t<=k[i][0]){const [t0,v0]=k[i-1],[t1,v1,e='inOutSine']=k[i],x=EASE[e]((t-t0)/(t1-t0));
  return Array.isArray(v0)?v0.map((a,j)=>a+(v1[j]-a)*x):v0+(v1-v0)*x;}}return k[k.length-1][1];}
const prog=(t,a,b,e='inOutSine')=>EASE[e](Math.max(0,Math.min(1,(t-a)/(b-a))));
window.CouncilFilm={Engine,Camera,keys,prog,EASE,vec:{sub,add,scale,dot,cross,norm}};
})();
