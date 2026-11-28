// The holography guide as a film: ten shots matched to the guide's ten chapters (their times come from the guide's
// own timeline, so the video lines up with the live subtitles), plus a poster frame. Rendered with film/engine.js.
(function(){
'use strict';
const {Camera,keys,prog}=window.CouncilFilm;
// ---------------------------------------------------------------- Balls: bits as ray-traced spheres (chapters 1, 10)
const BALLS=`
uniform vec4 uBall[64];uniform vec4 uLit[16];uniform int uCount;
uniform vec4 uBox;uniform float uBoxShow,uFloorY;uniform vec3 uKey;
float litOf(int i){vec4 v=uLit[i/4];int k=i-(i/4)*4;return k==0?v.x:(k==1?v.y:(k==2?v.z:v.w));}
float traceB(vec3 ro,vec3 rd,out int idx){float best=1e9;idx=-1;
 for(int i=0;i<64;i++){if(i>=uCount)break;vec4 b=uBall[i];if(b.w<.002)continue;vec2 h=sphereHit(ro,rd,b.xyz,b.w);if(h.x>.001&&h.x<best){best=h.x;idx=i;}}return best;}
vec3 env(vec3 d){float s=smoothstep(.2,1.,d.y);vec3 c=mix(vec3(.004,.005,.008),vec3(.03,.035,.05),s);
 c+=vec3(1.,.95,.9)*1.1*pow(max(dot(d,normalize(vec3(-.5,.8,.4))),0.),80.);return c;}
vec3 glowAt(vec3 p){vec3 g=vec3(0);for(int i=0;i<64;i++){if(i>=uCount)break;vec4 b=uBall[i];float s=litOf(i);if(s<.01||b.w<.002)continue;vec3 d=b.xyz-p;g+=s*vec3(.25,.55,1.6)*b.w*b.w/(dot(d,d)+.02);}return g*.28;}
vec3 shadeB(vec3 ro,vec3 rd,float t,int idx,bool shadows){
 vec4 b=uBall[idx];vec3 p=ro+rd*t,n=normalize(p-b.xyz);float lit=litOf(idx);vec3 l=normalize(uKey);
 float sh=1.;if(shadows){int j;float ts=traceB(p+l*.003,l,j);sh=ts<1e8?0.:1.;}
 float dif=max(dot(n,l),0.)*sh,fr=.04+.96*pow(1.-max(dot(n,-rd),0.),5.);vec3 refl=env(reflect(rd,n));
 vec3 base=vec3(.42,.45,.52);vec3 col=base*(dif*.55+.015)+refl*fr*.7+glowAt(p)*base*.5;
 float core=pow(max(dot(n,-rd),0.),1.5);vec3 em=vec3(.16,.45,1.6)*(2.2*core+.5);
 return mix(col,em+refl*fr*.6,lit);
}
// Closest approach between a ray and a segment; tr is the distance along the ray.
float segDist(vec3 ro,vec3 rd,vec3 a,vec3 b,out float tr){vec3 u=b-a,w0=ro-a;float bb=dot(rd,u),c=dot(u,u),d=dot(rd,w0),e=dot(u,w0),den=c-bb*bb;
 float sg=den>1e-6?clamp((e-bb*d)/den,0.,1.):0.;vec3 q=a+u*sg;tr=max(dot(q-ro,rd),0.);return length(ro+rd*tr-q);}
vec3 boxEdges(vec3 ro,vec3 rd,vec3 lo,vec3 hi,float show,float tHit){vec3 g=vec3(0);
 for(int e=0;e<12;e++){int ax=e/4,k=e-(e/4)*4;vec3 a,b;float s0=(k%2==0)?0.:1.,s1=(k/2==0)?0.:1.;
  if(ax==0){a=vec3(lo.x,mix(lo.y,hi.y,s0),mix(lo.z,hi.z,s1));b=vec3(hi.x,a.y,a.z);}
  else if(ax==1){a=vec3(mix(lo.x,hi.x,s0),lo.y,mix(lo.z,hi.z,s1));b=vec3(a.x,hi.y,a.z);}
  else{a=vec3(mix(lo.x,hi.x,s0),mix(lo.y,hi.y,s1),lo.z);b=vec3(a.x,a.y,hi.z);}
  float tr;float d=segDist(ro,rd,a,b,tr);float w=max(pixelAngle()*tr*1.05,.002);if(tr<tHit)g+=vec3(.6,.7,.95)*1.1*exp(-d*d/(w*w))*show;}
 return g;}
void main(){
 vec3 ro=uCamPos,rd=camRay();int idx;float t=traceB(ro,rd,idx);vec3 col;
 float tf=rd.y<0.?(uFloorY-ro.y)/rd.y:1e9;
 if(t<1e8&&t<tf)col=shadeB(ro,rd,t,idx,true);
 else if(tf<1e8){vec3 p=ro+rd*tf,rr=reflect(rd,vec3(0,1,0));int i2;float t2=traceB(p+rr*.002,rr,i2);
  vec3 rc=t2<1e8?shadeB(p,rr,t2,i2,false)*exp(-t2*.9):env(rr);float fr=.03+.5*pow(1.-max(-rd.y,0.),5.);
  float fade=exp(-max(length(p.xz)-2.5,0.)*.25);col=(vec3(.006,.007,.01)+glowAt(p)*.25+rc*fr*.8)*fade+env(rd)*(1.-fade)*.3;}
 else col=env(rd);
 if(uBoxShow>0.)col+=boxEdges(ro,rd,uBox.xyz-uBox.w,uBox.xyz+uBox.w,uBoxShow,t);
 o=vec4(col,1.);
}`;

// ---------------------------------------------------------------- A growing box of cells, cut open (chapter 2)
// The cells are found by stepping the ray voxel by voxel through the grid; one corner block (the one facing the
// camera) is cut away to show the inside. The surface is drawn as amber patches, one per cell face.
const CUBE=`
uniform float uN,uPrevN,uPop,uCell,uBitsT,uCut;uniform vec3 uG0,uKey;
vec3 env(vec3 d){float s=smoothstep(.2,1.,d.y);vec3 c=mix(vec3(.004,.005,.008),vec3(.03,.035,.05),s);
 c+=vec3(1.,.95,.9)*1.1*pow(max(dot(d,normalize(vec3(-.5,.8,.4))),0.),80.);return c;}
bool inCut(ivec3 v,int N){int h=N/2;return uCut>.5&&v.x>=h&&v.y>=h&&v.z>=h;}
float popOf(ivec3 v){float m=float(max(v.x,max(v.y,v.z)));if(m<uPrevN)return 1.;float f=(m-uPrevN)/max(uN-uPrevN,1.);return smoothstep(0.,1.,clamp(uPop*1.6-f*.6,0.,1.));}
float bitOf(ivec3 v){float x=uBitsT*.55+hashi(v*3+ivec3(7,1,3))*7.;float k=floor(x);
 return mix(step(.5,hashi(v+ivec3(int(k)*13,5,9))),step(.5,hashi(v+ivec3(int(k+1.)*13,5,9))),smoothstep(.8,1.,fract(x)));}
float segDist(vec3 ro,vec3 rd,vec3 a,vec3 b,out float tr){vec3 u=b-a,w0=ro-a;float bb=dot(rd,u),c=dot(u,u),d=dot(rd,w0),e=dot(u,w0),den=c-bb*bb;
 float sg=den>1e-6?clamp((e-bb*d)/den,0.,1.):0.;vec3 q=a+u*sg;tr=max(dot(q-ro,rd),0.);return length(ro+rd*tr-q);}
vec3 boxLines(vec3 ro,vec3 rd,vec3 lo,vec3 hi);
void main(){
 vec3 ro=uCamPos,rd=camRay();vec3 col=env(rd);int N=int(uN+.5);
 vec3 lo=uG0,hi=uG0+vec3(uN*uCell);
 vec3 inv=1./rd,ta=(lo-ro)*inv,tb=(hi-ro)*inv,t1v=min(ta,tb),t2v=max(ta,tb);
 float t0=max(max(t1v.x,t1v.y),t1v.z),t1=min(min(t2v.x,t2v.y),t2v.z);
 if(t1>max(t0,0.)){
  vec3 pe=ro+rd*max(t0,0.);vec3 cc=(pe-lo)/uCell;ivec3 v=clamp(ivec3(floor(cc)),ivec3(0),ivec3(N-1));
  // The surface patch the ray enters through, unless that part of the box is cut away.
  int ax=t1v.x>=t1v.y&&t1v.x>=t1v.z?0:(t1v.y>=t1v.z?1:2);vec2 f=ax==0?cc.yz:(ax==1?cc.xz:cc.xy);f=fract(f);
  float edge=min(min(f.x,1.-f.x),min(f.y,1.-f.y));vec3 tiles=vec3(0);
  bool solid=!inCut(v,N);float pp0=popOf(v);if(solid&&pp0>.02){float l=max(dot(ax==0?vec3(sign(-rd.x),0,0):(ax==1?vec3(0,sign(-rd.y),0):vec3(0,0,sign(-rd.z))),normalize(uKey)),0.);
   tiles=mix(vec3(.004),vec3(.55,.26,.08)*(.35+.65*l)+vec3(.9,.45,.15)*.08,smoothstep(.015,.045,edge))*pp0;}
  // Step through the cells.
  if(solid&&pp0>.02){o=vec4(tiles+boxLines(ro,rd,lo,hi),1.);return;}
  ivec3 st=ivec3(sign(rd));vec3 tD=abs(uCell*inv);vec3 tM=(lo+(vec3(v)+max(vec3(st),0.))*uCell-ro)*inv;
  vec3 ball=vec3(0);float hitT=1e9;
  for(int i=0;i<64;i++){
   if(any(lessThan(v,ivec3(0)))||any(greaterThanEqual(v,ivec3(N))))break;
   if(!inCut(v,N)){float pp=popOf(v);if(pp>.01){vec3 c=lo+(vec3(v)+.5)*uCell;float r=uCell*.3*pp;vec2 h=sphereHit(ro,rd,c,r);
    if(h.x>0.){vec3 p=ro+rd*h.x,n=normalize(p-c),l=normalize(uKey);float lit=bitOf(v);
     float depth=float(min(min(v.x,v.y),v.z))/max(uN,1.);float dif=max(dot(n,l),0.),fr=.04+.96*pow(1.-max(dot(n,-rd),0.),5.);
     vec3 off=vec3(.42,.45,.52)*(dif*.55+.02)+env(reflect(rd,n))*fr*.7;vec3 em=vec3(.16,.45,1.6)*(2.*pow(max(dot(n,-rd),0.),1.5)+.45);
     ball=mix(off,em,lit);hitT=h.x;break;}}}
   if(tM.x<tM.y&&tM.x<tM.z){v.x+=st.x;tM.x+=tD.x;}else if(tM.y<tM.z){v.y+=st.y;tM.y+=tD.y;}else{v.z+=st.z;tM.z+=tD.z;}
  }
  col=hitT<1e9?ball:col;
 }
 o=vec4(col+boxLines(ro,rd,lo,hi),1.);
}
// The box's outline.
vec3 boxLines(vec3 ro,vec3 rd,vec3 lo,vec3 hi){
 vec3 g=vec3(0);
 for(int e=0;e<12;e++){int ax=e/4,k=e-(e/4)*4;vec3 a,b;float s0=(k%2==0)?0.:1.,s1=(k/2==0)?0.:1.;
  if(ax==0){a=vec3(lo.x,mix(lo.y,hi.y,s0),mix(lo.z,hi.z,s1));b=vec3(hi.x,a.y,a.z);}
  else if(ax==1){a=vec3(mix(lo.x,hi.x,s0),lo.y,mix(lo.z,hi.z,s1));b=vec3(a.x,hi.y,a.z);}
  else{a=vec3(mix(lo.x,hi.x,s0),mix(lo.y,hi.y,s1),lo.z);b=vec3(a.x,a.y,hi.z);}
  float tr;float d=segDist(ro,rd,a,b,tr);float w=max(pixelAngle()*tr*1.05,.002);g+=vec3(.6,.7,.95)*.8*exp(-d*d/(w*w));}
 return g;
}`;

// ---------------------------------------------------------------- A boundary of bits around a box of bits (chapter 10)
const SHELL=`
uniform vec3 uC;uniform float uR,uCell,uBitsT,uShow,uSpin;
float bitAt(int i){float x=uBitsT*.55+hashi(ivec3(i,7,3))*7.;float k=floor(x);return mix(step(.5,hashi(ivec3(i,int(k),2))),step(.5,hashi(ivec3(i,int(k)+1,2))),smoothstep(.8,1.,fract(x)));}
vec3 shellBits(vec3 n,float N,float spin){
 float c=cos(spin),s=sin(spin);n=vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z);
 float NB=max(2.,floor(sqrt(PI*N/4.)+.5)),lat=asin(clamp(n.y,-1.,1.)),lon=atan(n.z,n.x)+PI;
 float band=min(NB-1.,floor((lat/PI+.5)*NB)),latc=((band+.5)/NB-.5)*PI;
 float nk=max(1.,floor(2.*NB*cos(latc)+.5)),cell=floor(lon/TAU*nk),lonc=(cell+.5)/nk*TAU;
 vec2 d=vec2((lat-latc)/(PI/NB),(lon-lonc)*cos(lat)/(PI/NB));
 float x=uBitsT*.5+hashi(ivec3(int(band),int(cell),5))*9.;float k=floor(x);
 float lit=mix(step(.55,hashi(ivec3(int(band),int(cell),int(k)))),step(.55,hashi(ivec3(int(band),int(cell),int(k)+1))),smoothstep(.85,1.,fract(x)));
 return vec3(.35,.75,1.6)*exp(-dot(d,d)*22.)*lit*1.6;
}
void main(){
 vec3 ro=uCamPos,rd=camRay();vec3 col=stars(rd,pixelAngle(),.6);
 vec2 h=sphereHit(ro,rd,uC,uR);
 // Inside: the box of eight bits from the start, seen through the boundary.
 vec3 inner=vec3(0);float best=1e9;
 for(int i=0;i<8;i++){vec3 c=uC+(vec3(i%2,(i/2)%2,i/4)-.5)*uCell;vec2 q=sphereHit(ro,rd,c,uCell*.31);
  if(q.x>0.&&q.x<best){best=q.x;vec3 p=ro+rd*q.x,n=normalize(p-c);float lit=bitAt(i);float dif=max(dot(n,normalize(vec3(-.5,.8,.5))),0.);
   inner=mix(vec3(.42,.45,.52)*(dif*.5+.02),vec3(.16,.45,1.6)*(.95*pow(max(dot(n,-rd),0.),1.5)+.22),lit);}}
 {vec3 lo=uC-uCell,hi=uC+uCell;for(int e=0;e<12;e++){int ax=e/4,k=e-(e/4)*4;vec3 a,b;float s0=(k%2==0)?0.:1.,s1=(k/2==0)?0.:1.;
  if(ax==0){a=vec3(lo.x,mix(lo.y,hi.y,s0),mix(lo.z,hi.z,s1));b=vec3(hi.x,a.y,a.z);}else if(ax==1){a=vec3(mix(lo.x,hi.x,s0),lo.y,mix(lo.z,hi.z,s1));b=vec3(a.x,hi.y,a.z);}
  else{a=vec3(mix(lo.x,hi.x,s0),mix(lo.y,hi.y,s1),lo.z);b=vec3(a.x,a.y,hi.z);}
  vec3 u=b-a,w0=ro-a;float bb=dot(rd,u),cu=dot(u,u),dd0=dot(rd,w0),ee=dot(u,w0),den=cu-bb*bb;float sg=den>1e-6?clamp((ee-bb*dd0)/den,0.,1.):0.;vec3 q2=a+u*sg;float tb2=max(dot(q2-ro,rd),0.);
  float dl=length(ro+rd*tb2-q2),wl=max(pixelAngle()*tb2,.002);if(tb2<best)inner+=vec3(.5,.65,.95)*.5*exp(-dl*dl/(wl*wl));}}
 if(h.x>0.){vec3 pf=ro+rd*h.x,pb=ro+rd*h.y,nf=normalize(pf-uC),nb=normalize(pb-uC);
  float fr=.04+.96*pow(1.-max(dot(nf,-rd),0.),4.);
  vec3 front=shellBits(nf,700.,uSpin)*uShow*.55,back=shellBits(nb,700.,uSpin)*uShow*.18;
  col=col*(1.-.3*uShow)+back+inner+front+vec3(.3,.45,.8)*fr*.35*uShow;}
 else col+=inner;
 o=vec4(col,1.);
}`;

// ---------------------------------------------------------------- Shot 3: Earth, squeezed (textured planet, air)
const EARTH=`
uniform sampler2D uAlbedo,uMasks,uRelief;uniform float uR,uR0,uSpin,uRing;uniform vec3 uSun;
vec3 sampleEarth(vec3 n,vec3 l,vec3 v,float shade){
 float lon=atan(n.x,n.z)+uSpin,lat=asin(clamp(n.y,-1.,1.));vec2 uv=vec2(fract(lon/TAU+.5),.5-lat/PI);
 vec3 alb=texture(uAlbedo,uv).rgb;vec3 m=texture(uMasks,uv).rgb;vec3 rel=texture(uRelief,uv).rgb;
 float land=m.r,depth=m.g,ice=m.b;
 vec3 sea=mix(vec3(.012,.05,.11),vec3(.002,.012,.04),depth);vec3 ground=mix(sea,alb,land);ground=mix(ground,vec3(.85,.9,.95),ice);
 float ndl=dot(n,l),day=smoothstep(-.08,.25,ndl);
 // Weather: clouds from warped noise in storm bands, lit from the sun's side, casting faint shadows.
 vec3 q=n*4.6+vec3(uSpin*.7,0.,0.);vec3 warp=vec3(fbm(q+3.1),fbm(q+7.7),fbm(q+1.3));float cl=fbm(q*1.9+warp*1.8);
 cl=smoothstep(.6,.84,cl)*(.55+.45*smoothstep(.1,.6,abs(n.y)));
 vec3 h=normalize(l+v);float spec=pow(max(dot(n,h),0.),90.)*(1.-land)*(1.-cl)*(.06+.94*pow(1.-max(dot(n,v),0.),5.));
 vec3 sun=vec3(1.,.96,.9)*3.;vec3 lit=ground*sun*max(ndl,0.)*.55+sun*spec*1.8;
 vec3 cloud=vec3(.92)*sun*max(ndl*.8+.2,0.)*.5*day;
 vec3 c=mix(lit,cloud,cl);
 float lights=rel.g*(1.-day)*(1.-cl*.7);c+=vec3(1.,.62,.28)*lights*1.4;
 // The terminator reddens where sunlight crosses the most air.
 c*=mix(vec3(1.),vec3(1.,.55,.35),smoothstep(.35,0.,abs(ndl))*day*.6);
 return c*shade;
}
void main(){
 vec3 ro=uCamPos,rd=camRay();vec3 col=stars(rd,pixelAngle(),1.);
 vec3 l=normalize(uSun);float r=uR;
 vec2 hh=sphereHit(ro,rd,vec3(0),r);
 // Air: a thin shell; light scattered along the ray grows towards the limb and with the sun behind it.
 float tc=-dot(ro,rd);vec3 pc=ro+rd*tc;float dmin=length(pc),hgt=(dmin-r)/(r*.035);
 float through=hh.x>0.?1.:0.;
 if(hh.x>0.){vec3 p=ro+rd*hh.x,n=normalize(p);col=sampleEarth(n,l,-rd,1.);
  float rim=pow(1.-max(dot(n,-rd),0.),3.);col+=vec3(.25,.5,1.)*rim*.9*smoothstep(-.3,.4,dot(n,l))+vec3(.5,.25,.12)*rim*smoothstep(.3,0.,abs(dot(n,l)))*.6;}
 else if(hgt<6.){float a=exp(-max(hgt,0.)*1.2);float sd=dot(normalize(pc),l);
  col+=(vec3(.2,.45,1.)*smoothstep(-.4,.5,sd)+vec3(1.,.45,.2)*.5*smoothstep(.45,0.,abs(sd)))*a*1.2;}
 // The dashed outline of Earth's old size.
 if(uRing>0.){float ang=acos(clamp(dot(rd,normalize(-ro)),-1.,1.)),ar=asin(min(uR0/length(ro),1.));float d=abs(ang-ar)/pixelAngle();
  vec3 side=normalize(cross(normalize(-ro),vec3(0,1,0)));float th=atan(dot(rd,cross(side,normalize(-ro))),dot(rd,side));
  float dash=step(.5,fract(th*28./TAU));col+=vec3(.6,.7,.9)*exp(-d*d/1.4)*dash*uRing*.8;}
 o=vec4(col,1.);
}`;

// ---------------------------------------------------------------- Black holes: light traced through curved space
const HOLES=`
uniform vec4 uH0,uH1;      // centre xyz, mass M (world units)
uniform vec4 uD0,uD1;      // disk amount, disk outer radius (M), bits count, bits light
uniform vec2 uS0,uS1;      // bits spin, unused
uniform int uN;
uniform vec4 uBook;        // position xyz, fall progress (0..1); uBookOn
uniform float uBookOn,uBookRot,uRingM,uRingOn,uGlow,uHawk,uPhoton;
vec3 milky(vec3 d){float band=exp(-pow(dot(d,normalize(vec3(.25,1.,.15)))*6.,2.));float n=fbm(d*5.)*fbm(d*11.+2.);float dust=smoothstep(.35,.7,fbm(d*7.+5.));
 return (vec3(.55,.45,.38)*band*n*.55+vec3(.1,.12,.2)*band*.1)*(1.-.8*dust*band);}
vec3 diskEmit(vec3 c,vec3 ph,float x,float outer,float amt,out float op){
 float Tm=pow(x/6.,-.75)*pow(max(1.-sqrt(6./x),0.),.25);
 vec3 vdir=normalize(cross(vec3(0,1,0),c));float v=1./sqrt(max(x-2.,1.01));
 float g=sqrt(max(1.-3./x,.02))/(1.-v*dot(vdir,-ph));
 float ang=atan(c.z,c.x),w=pow(x,-1.5);
 // Ringlets: many thin bands of gas with gaps between, and fine streaks drawn out along the orbit.
 float bands=pow(fbm(vec3(x*2.6,1.7,0.)),2.2)*2.3,fine=fbm(vec3(x*14.,ang*.8-uTime*w*3.,2.)),streak=fbm(vec3(x*44.,ang*2.-uTime*w*3.,5.));
 float dens=bands*(.35+1.3*fine*fine)*(.6+.8*streak)*smoothstep(6.,6.6,x)*smoothstep(outer,outer*.45,x);
 op=1.-exp(-dens*1.6*amt);
 float T=Tm*g;vec3 col=mix(vec3(1.,.34,.08),vec3(1.,.8,.55),clamp(T*1.2-.15,0.,1.));col=mix(col,vec3(1.,.96,.9),clamp(T*1.6-1.3,0.,1.));
 return col*pow(g,4.)*Tm*Tm*dens*9.*amt;
}
vec3 horizonBits(vec3 n,float N,float on,float spin){
 float c=cos(spin),s=sin(spin);n=vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z);
 float NB=max(2.,floor(sqrt(PI*N/4.)+.5)),lat=asin(clamp(n.y,-1.,1.)),lon=atan(n.z,n.x)+PI;
 float band=min(NB-1.,floor((lat/PI+.5)*NB)),latc=((band+.5)/NB-.5)*PI;
 float nk=max(1.,floor(2.*NB*cos(latc)+.5)),cell=floor(lon/TAU*nk),lonc=(cell+.5)/nk*TAU;
 vec2 d=vec2((lat-latc)/(PI/NB),(lon-lonc)*cos(lat)/(PI/NB));
 float x=uTime*.5+hashi(ivec3(int(band),int(cell),5))*9.;float k=floor(x);
 float lit=mix(step(.6,hashi(ivec3(int(band),int(cell),int(k)))),step(.6,hashi(ivec3(int(band),int(cell),int(k)+1))),smoothstep(.85,1.,fract(x)));
 float spot=exp(-dot(d,d)*22.);
 return vec3(.35,.75,1.6)*spot*lit*on*2.2+vec3(.01,.015,.03)*spot*on;
}
// One ray around one hole (centre C, mass M): returns the light it brings, its sky direction if it escapes.
vec3 traceHole(vec3 ro,vec3 rd,vec4 H,vec4 Dk,vec2 S,out vec3 skyDir,out float sky){
 vec3 P=(ro-H.xyz)/H.w;float Dm=length(P);vec3 e1=P/Dm;float cr=dot(rd,e1);vec3 tv=rd-cr*e1;float ct=length(tv);
 sky=1.;skyDir=rd;if(ct<1e-5)return vec3(0);vec3 s3=tv/ct;
 float u=1./Dm,w=-u*cr/ct,phi=0.,umax=u;vec3 prev=Dm*e1,pos=prev,col=vec3(0);float alpha=0.,hitPhi=0.;int kind=0;
 for(int i=0;i<520;i++){
  float dphi=u>.12?.018:.045;
  float k1u=w,k1w=-u+3.*u*u,u2=u+.5*dphi*k1u,w2=w+.5*dphi*k1w,k2u=w2,k2w=-u2+3.*u2*u2;
  float u3=u+.5*dphi*k2u,w3=w+.5*dphi*k2w,k3u=w3,k3w=-u3+3.*u3*u3,u4=u+dphi*k3u,w4=w+dphi*k3w,k4u=w4,k4w=-u4+3.*u4*u4;
  u+=dphi*(k1u+2.*k2u+2.*k3u+k4u)/6.;w+=dphi*(k1w+2.*k2w+2.*k3w+k4w)/6.;phi+=dphi;umax=max(umax,u);
  if(u>=.5){kind=1;hitPhi=phi;pos=2.*(cos(phi)*e1+sin(phi)*s3);break;}
  if(u<=.8/Dm&&w<0.){break;}
  pos=(1./max(u,1e-5))*(cos(phi)*e1+sin(phi)*s3);
  if(Dk.x>0.&&prev.y*pos.y<0.){float a=prev.y/(prev.y-pos.y);vec3 c=mix(prev,pos,a);float x=length(c);
   if(x>6.&&x<Dk.y){float op;vec3 e=diskEmit(c,normalize(pos-prev),x,Dk.y,Dk.x,op);col+=e*(1.-alpha);alpha+=(1.-alpha)*op;}}
  if(alpha>.995){kind=2;break;}
  prev=pos;
 }
 // Hawking's glow: light from just outside the horizon reaches us along sightlines that end there, so it faintly
 // fills the dark disc.
 float rmin=1./max(umax,1e-5);if(kind==1)col+=vec3(1.,.42,.2)*uHawk*.02*(1.-alpha);
 // The photon ring: light from all around piles up on paths that skim the photon sphere (r = 3), a thin bright line
 // at the shadow's edge; Hawking's glow, lensed the same way, warms it.
 if(kind==0)col+=(vec3(.75,.8,.95)*uPhoton*exp(-max(rmin-3.,0.)*9.)+vec3(1.,.42,.18)*uHawk*2.2*exp(-max(rmin-3.,0.)*4.5))*.22*(1.-alpha);
 if(kind==0){float uu=max(u,1e-5);vec3 rad=cos(phi)*e1+sin(phi)*s3,tn=-sin(phi)*e1+cos(phi)*s3;skyDir=normalize(-w/(uu*uu)*rad+tn/uu);sky=1.-alpha;}
 else{sky=0.;if(kind==1&&Dk.z>0.)col+=horizonBits(normalize(pos),Dk.z,Dk.w,S.x)*(1.-smoothstep(1.9,2.6,hitPhi))*(1.-alpha);}
 return col;
}
// A book: a box with a dark red cover, a gold band and cream page edges, lit warm from the disk below.
float boxHit(vec3 ro,vec3 rd,vec3 c,vec3 hs,mat3 R,out vec3 nrm,out vec3 lp){vec3 o2=(ro-c)*R,d2=rd*R;vec3 m=1./d2,n=m*o2,k=abs(m)*hs,t1=-n-k,t2=-n+k;
 float tn=max(max(t1.x,t1.y),t1.z),tf=min(min(t2.x,t2.y),t2.z);if(tn>tf||tf<0.)return -1.;
 vec3 nn=-sign(d2)*step(t1.yzx,t1.xyz)*step(t1.zxy,t1.xyz);nrm=R*nn;lp=o2+d2*tn;return tn;}
void main(){
 vec3 ro=uCamPos,rd=camRay();
 // Each ray is traced around the hole it passes nearest, relative to the hole's size; far from both, the two
 // bendings blend into the open sky.
 vec4 H=uH0,Dk=uD0;vec2 S=uS0;float a0=acos(clamp(dot(rd,normalize(uH0.xyz-ro)),-1.,1.))/(uH0.w/length(uH0.xyz-ro));
 if(uN>1){float a1=acos(clamp(dot(rd,normalize(uH1.xyz-ro)),-1.,1.))/(uH1.w/length(uH1.xyz-ro));if(a1<a0){H=uH1;Dk=uD1;S=uS1;a0=a1;}}
 vec3 skyDir;float sky;vec3 col=traceHole(ro,rd,H,Dk,S,skyDir,sky);
 if(uN>1)skyDir=normalize(mix(skyDir,rd,smoothstep(14.,24.,a0)));
 col+=(stars(skyDir,pixelAngle(),1.)+milky(skyDir)*uGlow)*sky;
 if(uBookOn>0.){vec3 bc=uBook.xyz;float fall=uBook.w;float rr=length(bc-uH0.xyz)/uH0.w;
  // Tides stretch it along the fall and squeeze it across as it nears the horizon; its light reddens and dims.
  float st=1.+6./max(rr*rr*rr*.02,.01)*.0;float stretch=1.+2.2*smoothstep(10.,3.,rr);
  float cr=cos(uBookRot),sr=sin(uBookRot);mat3 R=mat3(cr,sr,0.,-sr,cr,0.,0.,0.,1.);
  vec3 radial=normalize(bc-uH0.xyz);vec3 hs=vec3(.36,.5*stretch,.13)*uH0.w*2.1/sqrt(stretch);
  vec3 nrm,lp;float tb=boxHit(ro,rd,bc,hs,R,nrm,lp);
  if(tb>0.){vec3 lp2=lp/hs;float cover=step(.86,abs(lp2.z))*step(abs(lp2.x),.97)+step(.97,abs(lp2.x))*step(0.,-lp2.x);cover=min(cover,1.);float band=smoothstep(.05,.0,abs(lp2.y-.35))*cover;
   vec3 base=mix(vec3(.95,.9,.78),vec3(.62,.12,.08),cover);base=mix(base,vec3(.95,.72,.3),band);
   vec3 light=vec3(1.,.7,.45)*1.6*max(dot(nrm,normalize(vec3(-.3,-.6,.5))),0.)+vec3(.35,.4,.55)*.25*max(dot(nrm,normalize(vec3(.4,.7,.6))),0.)+.03;
   float red=smoothstep(9.,3.2,rr),gone=smoothstep(3.6,2.7,rr);vec3 bcol=base*light*mix(vec3(1),vec3(1.,.25,.08),red)*(1.-gone);
   col=mix(col,bcol,(1.-gone));}}
 // The dashed outline of the black hole's old size.
 if(uRingOn>0.){vec3 dh=normalize(uH0.xyz-ro);float ang=acos(clamp(dot(rd,dh),-1.,1.)),ar=asin(min(5.196*uRingM/length(uH0.xyz-ro),1.));float d=abs(ang-ar)/pixelAngle();
  vec3 side=normalize(cross(dh,vec3(0,1,0)));float th=atan(dot(rd,cross(side,dh)),dot(rd,side));col+=vec3(.75,.8,.95)*exp(-d*d/1.2)*step(.5,fract(th*30./TAU))*uRingOn*1.2;}
 o=vec4(col,1.);
}`;

// ---------------------------------------------------------------- Shot 9: a hologram plate and the image it makes
const HOLO=`
uniform vec3 uPlate,uLaser;uniform float uShow,uImg;
float hitPlate(vec3 ro,vec3 rd,vec3 c,vec3 n,vec2 hs,vec3 ax,out vec2 q){float d=dot(rd,n);if(abs(d)<1e-4)return -1.;float t=dot(c-ro,n)/d;if(t<0.)return -1.;
 vec3 p=ro+rd*t-c;vec3 ay=cross(n,ax);q=vec2(dot(p,ax),dot(p,ay))/hs;if(abs(q.x)>1.||abs(q.y)>1.)return -1.;return t;}
vec3 beam(vec3 ro,vec3 rd,vec3 a,vec3 b,float width,out float tb){vec3 u=b-a,w0=ro-a;float bb=dot(rd,u),c=dot(u,u),d=dot(rd,w0),e=dot(u,w0),den=c-bb*bb;
 float sg=den>1e-6?clamp((e-bb*d)/den,0.,1.):0.;vec3 q=a+u*sg;tb=max(dot(q-ro,rd),0.);float dd=length(ro+rd*tb-q);
 // An expanded beam: a thin line that widens into a cone filling the plate, its light spread ever thinner.
 float spread=max(mix(width,.9,pow(sg,3.)),pixelAngle()*tb*1.3);return vec3(.3,1.,.55)*(exp(-dd*dd/(spread*spread))*min(.0016/(spread*spread),6.));}
void main(){
 vec3 ro=uCamPos,rd=camRay();vec3 col=stars(rd,pixelAngle(),.35)+vec3(.002,.003,.005);
 vec3 n=normalize(vec3(.35,0.,1.)),ax=normalize(cross(vec3(0,1,0),n));vec2 q;float tp=hitPlate(ro,rd,uPlate,n,vec2(1.1,1.4),ax,q);
 // The image: the box of bits from the start, blue and pale, floating well in front of the plate, made of its light.
 vec3 img=vec3(0);vec3 ic=uPlate+n*3.1+vec3(.25,.1,0.);float cell=.62;
 for(int i=0;i<8;i++){vec3 c=ic+(vec3(i%2,(i/2)%2,i/4)-.5)*cell;vec2 h=sphereHit(ro,rd,c,cell*.31);if(h.x>0.){vec3 p=ro+rd*h.x,nn=normalize(p-c);
   float rim=pow(1.-max(dot(nn,-rd),0.),2.5),scan=.8+.2*sin((p.y-uTime*.3)*160.);float lit=step(.5,hashi(ivec3(i,int(uTime*.5),9)));
   img+=mix(vec3(.3,.34,.42)*(rim*.9+.08),vec3(.16,.45,1.6)*(rim*1.1+.35),lit)*scan;}}
 {vec3 lo=ic-cell,hi=ic+cell;for(int e=0;e<12;e++){int ax=e/4,k=e-(e/4)*4;vec3 a,b;float s0=(k%2==0)?0.:1.,s1=(k/2==0)?0.:1.;
  if(ax==0){a=vec3(lo.x,mix(lo.y,hi.y,s0),mix(lo.z,hi.z,s1));b=vec3(hi.x,a.y,a.z);}else if(ax==1){a=vec3(mix(lo.x,hi.x,s0),lo.y,mix(lo.z,hi.z,s1));b=vec3(a.x,hi.y,a.z);}
  else{a=vec3(mix(lo.x,hi.x,s0),mix(lo.y,hi.y,s1),lo.z);b=vec3(a.x,a.y,hi.z);}
  float tb2;vec3 u=b-a,w0=ro-a;float bb=dot(rd,u),cu=dot(u,u),dd0=dot(rd,w0),ee=dot(u,w0),den=cu-bb*bb;float sg=den>1e-6?clamp((ee-bb*dd0)/den,0.,1.):0.;vec3 q2=a+u*sg;tb2=max(dot(q2-ro,rd),0.);
  float dl=length(ro+rd*tb2-q2),wl=max(pixelAngle()*tb2,.002);img+=vec3(.5,.65,.95)*.6*exp(-dl*dl/(wl*wl));}}
 img*=uImg;
 if(tp>0.){float r1=length(q*vec2(1.1,1.4)-vec2(.3,.2)),r2=length(q*vec2(1.1,1.4)+vec2(.4,.1));float ph=(r1-r2)*260.+(r1+r2)*40.;
  vec3 iri=.5+.5*cos(ph+vec3(0,2.1,4.2));float fringe=pow(.5+.5*cos(ph),3.);
  float fine=.5+.5*cos(ph*3.1);vec3 glass=vec3(.012,.018,.026)+iri*(.08+.1*fringe*fine)*uShow*(.3+.7*exp(-dot(q,q)*.8))+vec3(.15,.5,.3)*exp(-dot(q-vec2(-.2,.1),q-vec2(-.2,.1))*3.)*.25*uShow;
  float edge=smoothstep(.97,1.,max(abs(q.x),abs(q.y)));glass+=vec3(.5,.6,.7)*edge*.6;
  col=mix(col,glass,.85);}
 // The laser: a thin green beam widening into the plate, glowing in the haze, with dust sparkling in it.
 float tb;vec3 bm=beam(ro,rd,uLaser,uPlate-n*.05,.03,tb);if(tp<0.||tb<tp)col+=bm*uShow*3.;else col+=bm*uShow*.6;
 for(int k=0;k<40;k++){vec3 m=mix(uLaser,uPlate,hashi(ivec3(k,1,2)))+(vec3(hashi(ivec3(k,3,4)),hashi(ivec3(k,5,6)),hashi(ivec3(k,7,8)))-.5)*.25;
  m.y+=sin(uTime*.4+float(k))*.03;vec3 dm=m-ro;float tm=dot(dm,rd);float dd=length(dm-rd*tm);float s=pixelAngle()*tm*.8;
  col+=vec3(.4,1.,.6)*exp(-dd*dd/(s*s))*.5*uShow*(.5+.5*sin(uTime*2.+float(k)*3.));}
 col+=img;
 o=vec4(col,1.);
}`;

// ---------------------------------------------------------------- The project
function build(chapters,{aspect=16/9}={}){
 const C=chapters, at=(c,i)=>C[c].lines[i]?C[c].lines[i].start:C[c].start, X=.9;
 const shot=(id,c,shader,render,last=c)=>({id,shader,start:Math.max(0,C[c].start-(c?X:0)),end:C[last].end+(last<C.length-1?X:0),fadeIn:c?X*2:0,fadeOut:last<C.length-1?X*2:0,render,c});
 const cams=C.map(()=>new Camera()), shots=[];
 const hsh=(a,b=0)=>{let x=Math.sin(a*127.1+b*311.7)*43758.5453;return x-Math.floor(x);};
 const flick=(k,t,rate=.9)=>{const x=t*rate+hsh(k,3)*5,i=Math.floor(x),f=x-i,a=hsh(k,i)<.5?1:0,b=hsh(k,i+1)<.5?1:0;return a+(b-a)*prog(f,.82,1);};
 // The box at the end of chapter 1 is the box of eight cells chapter 2 starts from; one camera carries across.
 const CELL=.62, G0=[-.62,-.22,-.62];
 const cubeCam=(cam,size,spin=0)=>{const c=G0.map(v=>v+size/2),d=size*3.9+1.6,az=.72+spin,el=.5;
  cam.set({pos:[c[0]+Math.sin(az)*Math.cos(el)*d,c[1]+Math.sin(el)*d,c[2]+Math.cos(az)*Math.cos(el)*d],target:c,fov:34});};
 const orbit=(cam,dist,el,az,target=[0,0,0],fov=40)=>cam.set({pos:[Math.sin(az)*dist*Math.cos(el),dist*Math.sin(el)+target[1],Math.cos(az)*dist*Math.cos(el)],target,fov});

 // 1. One bit; a long list of bits; an empty box.
 shots.push(shot('switch',0,BALLS,(t,T)=>{const cam=cams[0],a=at(0,0),b=at(0,2),c=at(0,4);
  const ball=new Float32Array(256),lit=new Float32Array(64);
  const ph=T<a?-1:(T-a)/1.6, on=ph<0?0:(Math.floor(ph)%2===0?prog(ph%1,0,.12):1-prog(ph%1,0,.12));
  const grow=prog(T,b-.3,b+3.6), gone=prog(T,c-.2,c+2.2), move=prog(T,b-.4,b+.8);
  const path=s=>[s*4.4,.55+.32*Math.sin(s*5+T*.4),.45*Math.cos(s*4+T*.3)-.25];
  for(let k=0;k<41;k++){const s=k===0?0:(k%2?1:-1)*Math.ceil(k/2)/20;const p=path(s);
   const p0=k===0?[0,.4,0].map((v,i)=>v+(p[i]-v)*move):p;
   const vis=k===0?1:prog(grow,Math.abs(s)*.85,Math.abs(s)*.85+.12,'outCubic'), out=1-prog(gone,Math.abs(s)*.6,Math.abs(s)*.6+.4);
   const r=(k===0?.32+(.1-.32)*move:.1)*vis*out;ball.set([...p0,r],k*4);
   lit[k]=k===0&&T<b-.4?on:flick(k,T);}
  const view=keys(T,[[C[0].start,[0,.95,3.6]],[b-.4,[0,1,3.7]],[b+3,[0,1.7,8.6],'inOutCubic'],[c,[0,1.6,8.2]]]);
  const tmp=new Camera();cubeCam(tmp,2*CELL);const blend=prog(T,c+.4,C[0].end+X,'inOutCubic');
  const pos=view.map((v,i)=>v+(tmp.pos[i]-v)*blend),tg=[0,.45,0].map((v,i)=>v+(tmp.target[i]-v)*blend);
  cam.set({pos,target:tg,fov:34});
  return {...cam.uniforms(),uBall:ball,uLit:lit,uCount:41,uBox:[0,.4,0,.62],uBoxShow:prog(T,c+.3,c+2),uFloorY:-.55,uKey:[-.55,.85,.5]};}));

 // 2. A box of cells grows from 2 to 16 cells wide, cut open at the corner facing us; its surface is amber patches.
 const sizes=[[C[1].start-X,2],[at(1,1)-.3,4],[at(1,2)+.3,8],[at(1,3)-.2,16]];
 const cubeState=T=>{let i=0;while(i<sizes.length-1&&T>=sizes[i+1][0])i++;const [t0,N]=sizes[i],prev=i?sizes[i-1][1]:N,pop=i?prog(T,t0,t0+1.8):1;return {N,prev,pop};};
 const cubeSize=T=>{const {N,prev,pop}=cubeState(T);return (prev+(N-prev)*prog(pop,0,1,'inOutCubic'))*CELL;};
 shots.push(shot('cube',1,CUBE,(t,T)=>{const cam=cams[1],{N,prev,pop}=cubeState(T);cubeCam(cam,cubeSize(T),(T-C[1].start)*.012);
  return {...cam.uniforms(),uN:N,uPrevN:prev,uPop:pop,uCell:CELL,uG0:G0,uBitsT:T,uCut:1,uKey:[-.55,.85,.5]};}));

 // 3. Earth squeezed into a black hole.
 const sq=c=>prog(c,at(2,1)+.5,at(2,2)+3.4,'inOutCubic');
 shots.push(shot('earth',2,EARTH,(t,T)=>{const cam=cams[2],u=sq(T),R=Math.pow(.24,u);
  cam.set({pos:[0,.15,4.2],target:[0,0,0],fov:38});return {...cam.uniforms(),uR:R,uR0:1,uSpin:T*.035+2.2,uSun:[-.8,.35,.6],uRing:prog(T,at(2,1)+.4,at(2,1)+1.4),uAlbedo:'albedo',uMasks:'masks',uRelief:'relief'};}));
 const H=(o)=>({uGlow:.12,uHawk:0,uPhoton:.6,uH0:[0,0,0,1],uH1:[0,0,0,1],uD0:[0,16,0,0],uD1:[0,16,0,0],uS0:[0,0],uS1:[0,0],uN:1,uBook:[0,0,0,0],uBookOn:0,uBookRot:0,uRingM:1,uRingOn:0,...o});
 const collapseZ=T=>keys(T,[[at(2,3)-1.4,4.2],[at(2,3)+.5,1.5,'inOutCubic']]);
 const collapse=shot('collapse',2,HOLES,(t,T)=>{const cam=cams[2],z=collapseZ(T);cam.set({pos:[0,.15*z/4.2,z],target:[0,0,0],fov:38});
  return {...cam.uniforms(),...H({uH0:[0,0,0,.24/5.196],uGlow:.5,uPhoton:4,uRingM:1/5.196,uRingOn:.6*(1-prog(T,at(2,3)-1.6,at(2,3)-.6))})};});
 collapse.start=at(2,2)+3.5;collapse.fadeIn=.8;shots[2].end=collapse.start+.8;shots[2].fadeOut=.8;shots.push(collapse);

 // 4. Gas gathers and falls in, and the black hole grows past its old size: twice the mass, twice as wide. The camera
 // stays put, so the growth is the hole's own.
 shots.push(shot('grow',3,HOLES,(t,T)=>{const cam=cams[3];orbit(cam,51,.07,-.08,[0,-.4,0]);
  const grow=prog(T,at(3,3)-.3,at(3,4)+2,'inOutCubic'),M=.55*(1+grow);
  return {...cam.uniforms(),...H({uH0:[0,0,0,M],uD0:[prog(T,C[3].start,at(3,1)+2.5),24*.55/M,0,0],uRingM:.55,uRingOn:prog(T,at(3,2)-.6,at(3,2)+.6)})};}));

 // 5-6. A book falls in; then the horizon grows a little past a ring of its old size.
 shots.push(shot('book',4,HOLES,(t,T)=>{const cam=cams[4];orbit(cam,36,.08,-.12,[0,-.6,0]);
  const fall=prog(T,C[4].start+.3,at(4,1)+2.4,'inCubic'),grow=prog(T,at(5,4)+.3,at(5,4)+2.6),M=1+.16*grow;
  const start=[8.5,6.5,9],end=[.6,.6,1.6],bp=start.map((s,i)=>s+(end[i]-s)*fall);
  return {...cam.uniforms(),...H({uH0:[0,0,0,M],uD0:[1,24,0,0],uBook:[...bp,fall],uBookOn:fall<1?1:0,uBookRot:T*.9,uRingM:1,uRingOn:prog(T,at(5,4)-1.2,at(5,4)-.2)})};},5));

 // 7. Hawking's glow, and the count it gives: one bit per patch.
 shots.push(shot('glow',6,HOLES,(t,T)=>{const cam=cams[6],az=(T-C[6].start)*.012;orbit(cam,24,.14,az,[0,0,0],36);
  return {...cam.uniforms(),...H({uD0:[1-prog(T,C[6].start+.4,at(6,0)+3.2),24,300,prog(T,at(6,4)-.4,at(6,4)+2.2)],uS0:[T*.08,0],uHawk:prog(T,at(6,0)+.8,at(6,0)+3.4)})};}));

 // 8. Finer and finer patches: unimaginably many. The camera holds its distance, so the hole keeps its size.
 shots.push(shot('patches',7,HOLES,(t,T)=>{const cam=cams[7],az=(T-C[7].start)*.012+.25;orbit(cam,24,.14,az,[0,0,0],36);
  const n=T<at(7,1)-.2?300:T<at(7,2)-.2?1200:4800;
  return {...cam.uniforms(),...H({uD0:[0,24,n,1],uS0:[T*.08,0],uHawk:.5})};}));

 // 9. Twice as wide: four times the bits.
 shots.push(shot('two',8,HOLES,(t,T)=>{const cam=cams[8],dx=keys(T,[[C[8].start,.6],[C[8].end,-.6]]);
  cam.set({pos:[dx,3.5,54],target:[dx*.6,0,0],fov:40});
  return {...cam.uniforms(),...H({uN:2,uH0:[-11,0,0,1],uH1:[7,0,0,2],uD0:[0,16,150,1],uD1:[0,16,600,1],uS0:[T*.08,0],uS1:[T*.08,0]})};}));

 // 10. The hologram.
 shots.push(shot('hologram',9,HOLO,(t,T)=>{const cam=cams[9],az=keys(T,[[C[9].start,-.55],[C[9].end,-.3]]),dist=keys(T,[[C[9].start,8.4],[C[9].end,7.6]]);
  cam.set({pos:[Math.sin(az)*dist+.8,1,Math.cos(az)*dist],target:[.9,0,.6],fov:40});
  return {...cam.uniforms(),uPlate:[-.6,0,0],uLaser:[-3.6,1.3,2.2],uShow:prog(T,at(9,2)-.4,at(9,2)+1.2),uImg:prog(T,at(9,2)+.4,at(9,2)+2.4)};}));

 // 11. A boundary of bits around the box of bits: the inside described on the edge.
 shots.push(shot('shell',10,SHELL,(t,T)=>{const cam=cams[10],az=(T-C[10].start)*.04-.4,dist=keys(T,[[C[10].start,4.4],[C[10].end,5.6]]);
  cam.set({pos:[Math.sin(az)*dist,1.1+dist*.08,Math.cos(az)*dist],target:[0,0,0],fov:38});
  return {...cam.uniforms(),uC:[0,0,0],uR:1.35,uCell:CELL,uBitsT:T,uShow:prog(T,at(10,1)-.4,at(10,1)+1.4),uSpin:T*.06};}));

 // Captions: only what the picture cannot say, a count, set clear of the thing it counts.
 const P=(cam,p)=>cam.project(p,aspect),fmt=n=>n.toLocaleString('en-US');
 const captions=t=>{const out=[],add=(text,p,{dy=0,dx=0,a=1}={})=>{if(p&&a>.01)out.push({text,x:p[0]+dx,y:p[1]+dy,alpha:a,align:'center'});};
  // "horizon", with a thin line to the edge of the dark disc (where every sightline inside ends on the horizon).
  const horizon=(cam,c,M,dir,a)=>{const q=P(cam,c);if(!q||a<=.01)return;const d=Math.hypot(...c.map((v,i)=>v-cam.pos[i])),ang=Math.asin(Math.min(1,5.196*M/d)),r=Math.tan(ang)/(2*cam.tan);
   const l=Math.hypot(...dir),u=[dir[0]/l,dir[1]/l];out.push({text:'horizon',x:q[0]+u[0]*(r+.15)/aspect,y:q[1]+u[1]*(r+.15),ax:q[0]+u[0]*r/aspect,ay:q[1]+u[1]*r,alpha:a,align:'center'});};
  const fade=(t,a,b)=>Math.min(prog(t,a,a+.5),1-prog(t,b-.5,b));
  for(const s of shots){if(t<s.start||t>s.end)continue;s.render(t-s.start,t);const cam=cams[s.c];
   if(s.id==='switch')add('1 bit',P(cam,[0,-.08,0]),{dy:.03,a:fade(t,at(0,0)+.4,at(0,2)-.3)});
   if(s.id==='cube'){const {N,prev,pop}=cubeState(t),n=pop>.5?N:prev,a=fade(t,C[1].start+1.2,C[1].end),size=cubeSize(t);
    const corners=[];for(let k=0;k<8;k++){const q=P(cam,[G0[0]+(k&1?size:0),G0[1]+(k&2?size:0),G0[2]+(k&4?size:0)]);if(q)corners.push(q);}
    // One count above the box and one below, so they never collide with it, on any screen.
    const ys=corners.map(q=>q[1]),top=Math.min(...ys),bottom=Math.max(...ys);
    add(`${fmt(n**3)} cells inside`,[.5,Math.max(.06,top-.06)],{a});add(`${fmt(6*n*n)} surface patches`,[.5,Math.min(.94,bottom+.06)],{a});}
   if(s.id==='collapse')horizon(cam,[0,0,0],.24/5.196,[1,-.75],fade(t,at(2,3)+.2,C[2].end));
   if(s.id==='book')horizon(cam,[0,0,0],1,[1,-.2],fade(t,at(5,1)-.2,at(5,4)-1.3));
   if(s.id==='glow')horizon(cam,[0,0,0],1,[1,-.8],fade(t,at(6,4)+.2,C[6].end));
   if(s.id==='two'){add('150 bits',P(cam,[-11,-6.6,0]),{a:fade(t,C[8].start+.6,C[8].end)});add('600 bits',P(cam,[7,-11.8,0]),{a:fade(t,C[8].start+.9,C[8].end)});}
  }
  return out;};
 const poster={id:'poster',shader:HOLES,start:0,end:1e9,render:(t)=>{const cam=new Camera(),el=.1,dist=28;cam.set({pos:[0,dist*Math.sin(el),dist*Math.cos(el)],target:[0,-.4,0],fov:38});
  return {...cam.uniforms(),...H({uD0:[1,24,900,1],uS0:[.4,0]})};}};
 const dim=(t)=>t>C[3].start-X&&t<C[5].end+X;
 const look=t=>({exposure:dim(t)?-.55:-.2,bloom:.045,halation:t>C[9].start-X&&t<C[9].end+X?.03:.1,grain:.018,vignette:.36,aberration:.12,saturation:1,contrast:1.06});
 return {shots,captions,look,samples:4,duration:C[C.length-1].end,posterProject:{shots:[poster],look:()=>({exposure:-.35,bloom:.045,halation:.1,grain:.018,vignette:.36,aberration:.12,contrast:1.06}),samples:8}};
}
window.HolographyFilm={build};
})();
