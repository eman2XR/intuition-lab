// The holography guide as a film: six shots matched to the guide's six chapters (their times come from the guide's
// own timeline, so the video lines up with the live subtitles), plus a poster frame. Rendered with film/engine.js.
(function(){
'use strict';
const {Camera,keys,prog,vec}=window.CouncilFilm;

// ---------------------------------------------------------------- Shot 1: bits in a box (ray-traced spheres)
const BITS=`
uniform vec4 uA,uB;uniform float uBShow,uBitsT;
uniform vec3 uKey;
const int NA=2,NB=4;
float bitState(int box,int i,float t){float x=t*.55+hashi(ivec3(i,box,3))*7.;float k=floor(x),f=fract(x);
 float a=step(.5,hashi(ivec3(i,box,int(k)))),b=step(.5,hashi(ivec3(i,box,int(k)+1)));return mix(a,b,smoothstep(.8,1.,f));}
vec3 ballC(int box,int i,out float r){vec4 B=box==0?uA:uB;int n=box==0?NA:NB;int x=i%n,y=(i/n)%n,z=i/(n*n);
 vec3 c=B.xyz+(vec3(x,y,z)+.5-float(n)*.5)*B.w;float pop=box==0?1.:smoothstep(0.,1.,clamp(uBShow*1.6-float(i)/64.*.6,0.,1.));r=B.w*.31*pop;return c;}
// Nearest ball along a ray: returns t, writes which.
float trace(vec3 ro,vec3 rd,out int box,out int idx){float best=1e9;box=-1;idx=-1;
 for(int i=0;i<NA*NA*NA;i++){float r;vec3 c=ballC(0,i,r);vec2 h=sphereHit(ro,rd,c,r);if(h.x>.001&&h.x<best){best=h.x;box=0;idx=i;}}
 if(uBShow>0.)for(int i=0;i<NB*NB*NB;i++){float r;vec3 c=ballC(1,i,r);if(r<.001)continue;vec2 h=sphereHit(ro,rd,c,r);if(h.x>.001&&h.x<best){best=h.x;box=1;idx=i;}}
 return best;}
float shadowT(vec3 p,vec3 l){int b,i;float t=trace(p+l*.002,l,b,i);return t<1e8?0.:1.;}
vec3 env(vec3 d){float s=smoothstep(.2,1.,d.y);vec3 c=mix(vec3(.004,.005,.008),vec3(.03,.035,.05),s);
 c+=vec3(1.,.95,.9)*1.1*pow(max(dot(d,normalize(vec3(-.5,.8,.4))),0.),80.);return c;}
// Light that lit balls throw onto a point: their glow falls off with distance.
vec3 glowAt(vec3 p){vec3 g=vec3(0);
 for(int i=0;i<NA*NA*NA;i++){float r;vec3 c=ballC(0,i,r);float s=bitState(0,i,uBitsT);vec3 d=c-p;g+=s*vec3(.25,.55,1.6)*r*r/(dot(d,d)+.02);}
 if(uBShow>0.)for(int i=0;i<NB*NB*NB;i++){float r;vec3 c=ballC(1,i,r);if(r<.001)continue;float s=bitState(1,i,uBitsT);vec3 d=c-p;g+=s*vec3(.25,.55,1.6)*r*r/(dot(d,d)+.02);}
 return g*.28;}
vec3 shadeBall(vec3 ro,vec3 rd,float t,int box,int idx,bool shadows){
 float r;vec3 c=ballC(box,idx,r);vec3 p=ro+rd*t,n=normalize(p-c);float lit=bitState(box,idx,uBitsT);
 vec3 l=normalize(uKey);float dif=max(dot(n,l),0.)*(shadows?shadowT(p,l):1.);
 float fr=.04+.96*pow(1.-max(dot(n,-rd),0.),5.);vec3 refl=env(reflect(rd,n));
 vec3 base=vec3(.42,.45,.52);vec3 col=base*(dif*.55+.015)+refl*fr*.7+glowAt(p)*base*.5;
 // A lit bit glows from inside: brightest straight on, a halo of its own colour at the rim.
 float core=pow(max(dot(n,-rd),0.),1.5);vec3 em=vec3(.16,.45,1.6)*(2.2*core+.5);
 return mix(col,em+refl*fr*.6,lit);
}
// Closest approach between a ray and a segment; tr is the distance along the ray.
float segDist(vec3 ro,vec3 rd,vec3 a,vec3 b,out float tr){vec3 u=b-a,w0=ro-a;float bb=dot(rd,u),c=dot(u,u),d=dot(rd,w0),e=dot(u,w0),den=c-bb*bb;
 float sg=den>1e-6?clamp((e-bb*d)/den,0.,1.):0.;vec3 q=a+u*sg;tr=max(dot(q-ro,rd),0.);return length(ro+rd*tr-q);}
vec3 edges(vec3 ro,vec3 rd,vec4 B,int n,float show,float tHit){vec3 g=vec3(0);float h=B.w*float(n)*.5;
 for(int e=0;e<12;e++){int ax=e/4,k=e%4;vec3 a=vec3(-h),b=vec3(-h);
  vec2 s=vec2(k%2,k/2)*2.*h-h;
  if(ax==0){a=vec3(-h,s.x,s.y);b=vec3(h,s.x,s.y);}else if(ax==1){a=vec3(s.x,-h,s.y);b=vec3(s.x,h,s.y);}else{a=vec3(s.x,s.y,-h);b=vec3(s.x,s.y,h);}
  float tr;float d=segDist(ro,rd,B.xyz+a,B.xyz+b,tr);float w=max(pixelAngle()*tr*1.05,.002);
  if(tr<tHit)g+=vec3(.6,.7,.95)*1.1*exp(-d*d/(w*w))*show;}
 return g;}
void main(){
 vec3 ro=uCamPos,rd=camRay();int box,idx;float t=trace(ro,rd,box,idx);
 vec3 col;
 float floorY=uA.y-uA.w*1.6;float tf=rd.y<0.?(floorY-ro.y)/rd.y:1e9;
 if(t<1e8&&t<tf)col=shadeBall(ro,rd,t,box,idx,true);
 else if(tf<1e8){vec3 p=ro+rd*tf;vec3 rr=reflect(rd,vec3(0,1,0));int b2,i2;float t2=trace(p+rr*.002,rr,b2,i2);
  vec3 rc=t2<1e8?shadeBall(p,rr,t2,b2,i2,false)*exp(-t2*.9):env(rr);float fr=.03+.5*pow(1.-max(-rd.y,0.),5.);
  float fade=exp(-max(length(p.xz-uA.xz)-2.,0.)*.25);
  col=(vec3(.006,.007,.01)+glowAt(p)*.25+rc*fr*.8)*fade+env(rd)*(1.-fade)*.3;}
 else col=env(rd);
 col+=edges(ro,rd,uA,NA,1.,t);if(uBShow>0.)col+=edges(ro,rd,uB,NB,uBShow,t);
 o=vec4(col,1.);
}`;

// ---------------------------------------------------------------- Shot 2: Earth, squeezed (textured planet, air)
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
 cl=smoothstep(.56,.8,cl)*(.55+.45*smoothstep(.1,.6,abs(n.y)));
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
uniform float uBookOn,uBookRot,uRingM,uRingOn,uGlow;
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
 float u=1./Dm,w=-u*cr/ct,phi=0.;vec3 prev=Dm*e1,pos=prev,col=vec3(0);float alpha=0.,hitPhi=0.;int kind=0;
 for(int i=0;i<520;i++){
  float dphi=u>.12?.018:.045;
  float k1u=w,k1w=-u+3.*u*u,u2=u+.5*dphi*k1u,w2=w+.5*dphi*k1w,k2u=w2,k2w=-u2+3.*u2*u2;
  float u3=u+.5*dphi*k2u,w3=w+.5*dphi*k2w,k3u=w3,k3w=-u3+3.*u3*u3,u4=u+dphi*k3u,w4=w+dphi*k3w,k4u=w4,k4w=-u4+3.*u4*u4;
  u+=dphi*(k1u+2.*k2u+2.*k3u+k4u)/6.;w+=dphi*(k1w+2.*k2w+2.*k3w+k4w)/6.;phi+=dphi;
  if(u>=.5){kind=1;hitPhi=phi;pos=2.*(cos(phi)*e1+sin(phi)*s3);break;}
  if(u<=.8/Dm&&w<0.){break;}
  pos=(1./max(u,1e-5))*(cos(phi)*e1+sin(phi)*s3);
  if(Dk.x>0.&&prev.y*pos.y<0.){float a=prev.y/(prev.y-pos.y);vec3 c=mix(prev,pos,a);float x=length(c);
   if(x>6.&&x<Dk.y){float op;vec3 e=diskEmit(c,normalize(pos-prev),x,Dk.y,Dk.x,op);col+=e*(1.-alpha);alpha+=(1.-alpha)*op;}}
  if(alpha>.995){kind=2;break;}
  prev=pos;
 }
 if(kind==0){float uu=max(u,1e-5);vec3 rad=cos(phi)*e1+sin(phi)*s3,tn=-sin(phi)*e1+cos(phi)*s3;skyDir=normalize(-w/(uu*uu)*rad+tn/uu);sky=1.-alpha;}
 else{sky=0.;if(kind==1&&Dk.z>0.)col+=horizonBits(normalize(pos),Dk.z,Dk.w,S.x)*mix(1.,.12,smoothstep(3.3,4.3,hitPhi))*(1.-alpha);}
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
  vec3 radial=normalize(bc-uH0.xyz);vec3 hs=vec3(.36,.5*stretch,.07)*uH0.w*1.25/sqrt(stretch);
  vec3 nrm,lp;float tb=boxHit(ro,rd,bc,hs,R,nrm,lp);
  if(tb>0.){vec3 lp2=lp/hs;float cover=step(.92,abs(lp2.z));float band=smoothstep(.05,.0,abs(lp2.y-.35))*cover;
   vec3 base=mix(vec3(.93,.88,.76),vec3(.36,.05,.04),cover);base=mix(base,vec3(.95,.72,.3),band);
   vec3 light=vec3(1.,.7,.45)*1.6*max(dot(nrm,normalize(vec3(-.3,-.6,.5))),0.)+vec3(.35,.4,.55)*.25*max(dot(nrm,normalize(vec3(.4,.7,.6))),0.)+.03;
   float red=smoothstep(9.,3.2,rr),gone=smoothstep(3.6,2.7,rr);vec3 bcol=base*light*mix(vec3(1),vec3(1.,.25,.08),red)*(1.-gone);
   col=mix(col,bcol,(1.-gone));}}
 // The dashed outline of the black hole's old size.
 if(uRingOn>0.){vec3 dh=normalize(uH0.xyz-ro);float ang=acos(clamp(dot(rd,dh),-1.,1.)),ar=asin(min(5.196*uRingM/length(uH0.xyz-ro),1.));float d=abs(ang-ar)/pixelAngle();
  vec3 side=normalize(cross(dh,vec3(0,1,0)));float th=atan(dot(rd,cross(side,dh)),dot(rd,side));col+=vec3(.75,.8,.95)*exp(-d*d/1.2)*step(.5,fract(th*30./TAU))*uRingOn*1.2;}
 o=vec4(col,1.);
}`;

// ---------------------------------------------------------------- Shot 6: a hologram plate and the image it makes
const HOLO=`
uniform vec3 uPlate,uLaser;uniform float uShow,uImg;
float hitPlate(vec3 ro,vec3 rd,vec3 c,vec3 n,vec2 hs,vec3 ax,out vec2 q){float d=dot(rd,n);if(abs(d)<1e-4)return -1.;float t=dot(c-ro,n)/d;if(t<0.)return -1.;
 vec3 p=ro+rd*t-c;vec3 ay=cross(n,ax);q=vec2(dot(p,ax),dot(p,ay))/hs;if(abs(q.x)>1.||abs(q.y)>1.)return -1.;return t;}
vec3 beam(vec3 ro,vec3 rd,vec3 a,vec3 b,float width,out float tb){vec3 u=b-a,w0=ro-a;float bb=dot(rd,u),c=dot(u,u),d=dot(rd,w0),e=dot(u,w0),den=c-bb*bb;
 float sg=den>1e-6?clamp((e-bb*d)/den,0.,1.):0.;vec3 q=a+u*sg;tb=max(dot(q-ro,rd),0.);float dd=length(ro+rd*tb-q);
 // An expanded beam: a thin line that widens into a cone filling the plate, its light spread ever thinner.
 float spread=max(mix(width,.95,sg*sg),pixelAngle()*tb*1.2);return vec3(.3,1.,.55)*exp(-dd*dd/(spread*spread))*min(.0009/(spread*spread),3.);}
void main(){
 vec3 ro=uCamPos,rd=camRay();vec3 col=stars(rd,pixelAngle(),.35)+vec3(.002,.003,.005);
 vec3 n=normalize(vec3(.35,0.,1.)),ax=normalize(cross(vec3(0,1,0),n));vec2 q;float tp=hitPlate(ro,rd,uPlate,n,vec2(1.1,1.4),ax,q);
 // The image: a ghost of the box of bits, floating in front of the plate, built from the plate's light.
 vec3 img=vec3(0);vec3 ic=uPlate+n*1.9+vec3(.15,.05,0.);
 for(int i=0;i<8;i++){vec3 c=ic+(vec3(i%2,(i/2)%2,i/4)-.5)*.62;vec2 h=sphereHit(ro,rd,c,.2);if(h.x>0.){vec3 p=ro+rd*h.x,nn=normalize(p-c);
   float rim=pow(1.-max(dot(nn,-rd),0.),2.5),scan=.75+.25*sin((p.y-uTime*.3)*140.);float lit=step(.5,hashi(ivec3(i,int(uTime*.5),9)));
   img+=vec3(.25,.9,.6)*(rim*1.4+.12+lit*.5)*scan*(h.y-h.x)*2.;}}
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
 const shot=(id,c,shader,render)=>({id,shader,start:Math.max(0,C[c].start-(c?X:0)),end:C[c].end+(c<C.length-1?X:0),fadeIn:c?X*2:0,fadeOut:c<C.length-1?X*2:0,render,c});
 const cams=C.map(()=>new Camera());
 const shots=[];
 // 1. Bits in a box.
 shots.push(shot('bits',0,BITS,(t,T)=>{const cam=cams[0],two=prog(T,at(0,1)-.4,at(0,1)+2.2);
  const az=keys(T,[[C[0].start,-.55],[C[0].end,-.32]]),dist=keys(T,[[C[0].start,6.4],[at(0,1),5.9],[at(0,1)+2.6,10.4,'inOutCubic'],[C[0].end,9.6]]);
  const tx=keys(T,[[at(0,1),-2.6],[at(0,1)+2.6,-.2,'inOutCubic']]);
  cam.set({pos:[tx+Math.sin(az)*dist,1.5+dist*.16,Math.cos(az)*dist],target:[tx,.5,0],fov:34});
  return {...cam.uniforms(),uA:[-2.6,.4,0,.62],uB:[2.,1.02,0,.62],uBShow:two,uBitsT:T,uKey:[-.55,.85,.5]};}));
 // 2. Earth squeezed into a black hole.
 const sq=c=>prog(c,at(1,0)+.6,at(1,2)-.2,'inOutCubic');
 shots.push(shot('earth',1,EARTH,(t,T)=>{const cam=cams[1],u=sq(T),R0=1,R=R0*Math.pow(.09,u);
  cam.set({pos:[0,.15,4.2],target:[0,0,0],fov:38});return {...cam.uniforms(),uR:R,uR0:R0,uSpin:T*.035+2.2,uSun:[-.8,.35,.6],uRing:prog(T,at(1,0)+.8,at(1,0)+1.8),uAlbedo:'albedo',uMasks:'masks',uRelief:'relief'};}));
 // From the collapse on, the black hole (one shader for chapters 2 to 5 and the poster).
 const hole=(id,c,fn)=>{const s=shot(id,c,HOLES,fn);return s;};
 const H=(o)=>({uGlow:.12,uH0:[0,0,0,1],uH1:[0,0,0,1],uD0:[0,16,0,0],uD1:[0,16,0,0],uS0:[0,0],uS1:[0,0],uN:1,uBook:[0,0,0,0],uBookOn:0,uBookRot:0,uRingM:1,uRingOn:0,...o});
 const collapse=hole('collapse',1,(t,T)=>{const cam=cams[1],z=keys(t,[[collapse.start,4.2],[C[1].end+.9,1.15,'inOutCubic']]);cam.set({pos:[0,.15*z/4.2,z],target:[0,0,0],fov:38});
  return {...cam.uniforms(),...H({uH0:[0,0,0,.09/5.196*1.1],uGlow:.9})};});
 collapse.start=C[1].start+ (at(1,2)-C[1].start)*.98;collapse.fadeIn=.8;
 shots[1].end=collapse.start+.8;shots[1].fadeOut=.8;
 shots.push(collapse);
 // 3. A book falls in; the hole grows.
 shots.push(hole('book',2,(t,T)=>{const cam=cams[2],el=keys(T,[[C[2].start,.06],[C[2].end,.11]]),dist=keys(T,[[C[2].start,34],[C[2].end,31]]),az=keys(T,[[C[2].start,-.25],[C[2].end,.05]]);
  cam.set({pos:[Math.sin(az)*dist*Math.cos(el),dist*Math.sin(el),Math.cos(az)*dist*Math.cos(el)],target:[0,-.6,0],fov:40});
  const fall=prog(T,C[2].start+.3,at(2,1)+1.4,'inCubic'),grow=prog(T,at(2,1)+1.3,at(2,1)+3.2),M=1+.28*grow;
  const start=[8,6.5,9],end=[.6,.6,1.6],bp=start.map((s,i)=>s+(end[i]-s)*fall);
  return {...cam.uniforms(),...H({uH0:[0,0,0,M],uD0:[1,24,0,0],uBook:[...bp,fall],uBookOn:fall<1?1:0,uBookRot:T*1.3,uRingM:1,uRingOn:prog(T,at(2,1)+1.6,at(2,1)+2.6)})};}));
 // 4. The horizon covered in bits.
 shots.push(hole('bits-horizon',3,(t,T)=>{const cam=cams[3],dist=keys(T,[[C[3].start,24],[C[3].end,19]]),az=T*.02;
  cam.set({pos:[Math.sin(az)*dist,dist*.16,Math.cos(az)*dist],target:[0,0,0],fov:36});
  const n=T<at(3,1)-.2?220:T<at(3,2)-.2?520:1300,disk=1-prog(T,C[3].start+.4,C[3].start+2.6);
  return {...cam.uniforms(),...H({uD0:[disk,24,n,prog(T,C[3].start+.8,C[3].start+2.8)],uS0:[T*.08,0]})};}));
 // 5. Twice as wide: four times the bits.
 shots.push(hole('two-holes',4,(t,T)=>{const cam=cams[4],dx=keys(T,[[C[4].start,.6],[C[4].end,-.6]]);
  cam.set({pos:[dx,3.5,54],target:[dx*.6,0,0],fov:40});
  return {...cam.uniforms(),...H({uN:2,uH0:[-11,0,0,1],uH1:[7,0,0,2],uD0:[0,16,150,1],uD1:[0,16,600,1],uS0:[T*.08,0],uS1:[T*.08,0]})};}));
 // 6. The hologram.
 shots.push(shot('hologram',5,HOLO,(t,T)=>{const cam=cams[5],az=keys(T,[[C[5].start,-.5],[C[5].end,-.25]]),dist=keys(T,[[C[5].start,7.5],[C[5].end,6.6]]);
  cam.set({pos:[Math.sin(az)*dist+.6,.9,Math.cos(az)*dist],target:[.4,0,0],fov:38});
  return {...cam.uniforms(),uPlate:[-.6,0,0],uLaser:[-4.6,1.6,2.6],uShow:prog(T,C[5].start+.2,C[5].start+1.6),uImg:prog(T,C[5].start+1.2,C[5].start+3.2)};}));
 for(const s of shots){s.start=s.start;}
 // Captions: short words placed beside what they name, projected from the shots' own cameras.
 const P=(cam,p)=>cam.project(p,aspect);
 const captions=t=>{const out=[],add=(text,p,{dy=0,dx=0,a=1,align='center'}={})=>{if(p&&a>.01)out.push({text,x:p[0]+dx,y:p[1]+dy,alpha:a,align});};
  const fade=(t,a,b)=>Math.min(prog(t,a,a+.5),1-prog(t,b-.5,b));
  for(const s of shots){if(t<s.start||t>s.end)continue;const c=s.c;s.render(t-s.start,t);const cam=cams[c];
   if(s.id==='bits'){const two=t>at(0,1)-.2;add('8 bits',P(cam,[-2.6,-.75,0]),{dy:.03,a:fade(t,C[0].start+.6,C[0].end)});if(two)add('twice as wide: 64',P(cam,[2.,-.75,0]),{dy:.03,a:fade(t,at(0,1)+1.2,C[0].end)});}
   if(s.id==='earth'){const u=sq(t);add('Earth',P(cam,[0,Math.max(.12,Math.pow(.09,u))*1.0+.05,0]),{dy:-.04,a:fade(t,C[1].start+.4,at(1,1))});add('its old size',P(cam,[0,-1.06,0]),{dy:.04,a:fade(t,at(1,0)+1.4,C[1].end)});}
   if(s.id==='collapse'){add('black hole',P(cam,[0,.1,0]),{dy:-.06,a:fade(t,s.start+.6,C[1].end)});}
   if(s.id==='book'){const fall=prog(t,C[2].start+.3,at(2,1)+1.4,'inCubic');const bp=[8,6.5,9].map((v,i)=>v+([.6,.6,1.6][i]-v)*fall);
    if(fall<.7)add('a book',P(cam,bp),{dy:-.07,a:fade(t,C[2].start+.4,at(2,1)+.6)});add('black hole grows',P(cam,[0,9,0]),{a:fade(t,at(2,1)+2,C[2].end)});}
   if(s.id==='bits-horizon')add('one bit per patch',P(cam,[0,8.5,0]),{a:fade(t,C[3].start+1.6,C[3].end)});
   if(s.id==='two-holes'){add('1× wide: 150 bits',P(cam,[-11,-5.2,0]),{a:fade(t,C[4].start+.6,C[4].end)});add('2× wide: 600 bits',P(cam,[7,-10,0]),{a:fade(t,C[4].start+.9,C[4].end)});}
   if(s.id==='hologram'){add('flat film',P(cam,[-.6,-1.6,0]),{a:fade(t,C[5].start+1,C[5].end)});add('3D image',P(cam,[-.1,.85,1.9]),{a:fade(t,C[5].start+2.4,C[5].end)});}
  }
  return out;};
 // The poster: the black hole with its glowing disk, and its horizon covered in bits.
 const poster={id:'poster',shader:HOLES,start:0,end:1e9,render:(t)=>{const cam=new Camera(),el=.1,dist=28;cam.set({pos:[0,dist*Math.sin(el),dist*Math.cos(el)],target:[0,-.4,0],fov:38});
  return {...cam.uniforms(),...H({uD0:[1,24,900,1],uS0:[.4,0]})};}};
 const look=t=>({exposure:-.2,bloom:.045,halation:.1,grain:.02,vignette:.36,aberration:.3,saturation:1,contrast:1.06});
 return {shots,captions,look,samples:5,duration:C[C.length-1].end,posterProject:{shots:[poster],look,samples:8}};
}
window.HolographyFilm={build};
})();
