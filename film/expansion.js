// The expansion guide as a film: how we know the universe is expanding, in ten sections whose times come from the
// guide's own timeline (so the video lines up with the subtitles and the live narration). Rendered with film/engine.js.
(function(){
'use strict';
const {Camera,keys,prog}=window.CouncilFilm;
// ---------------------------------------------------------------- Shared: spectra, galaxies, warm light
const EXP=`
float g3(float l,float m,float a,float b){float d=(l-m)/(l<m?a:b);return exp(-.5*d*d);}
// The colour of light of one wavelength (nm), from a fit to the eye's colour matching curves, in linear RGB.
vec3 spectral(float l){
 float X=1.056*g3(l,599.8,37.9,31.)+.362*g3(l,442.,16.,26.7)-.065*g3(l,501.1,20.4,26.2);
 float Y=.821*g3(l,568.8,46.9,40.5)+.286*g3(l,530.9,16.3,31.1);
 float Z=1.217*g3(l,437.,11.8,36.)+.681*g3(l,459.,26.,13.8);
 vec3 c=vec3(3.2406*X-1.5372*Y-.4986*Z,-.9689*X+1.8758*Y+.0415*Z,.0557*X-.204*Y+1.057*Z);
 float m=min(c.r,min(c.g,c.b));if(m<0.)c-=m*.5;c.g+=.06*c.b;return max(c,0.);
}
// The rainbow as a screen can show it: deep violet and deep red dim but still coloured, out to the ends.
vec3 bandSpec(float l){return spectral(clamp(l,415.,648.))*smoothstep(380.,450.,l)*(1.-.75*smoothstep(640.,760.,l));}
const float HL[4]=float[4](656.3,486.1,434.0,410.2);
const float NA[2]=float[2](589.0,589.6);
const float OL[6]=float[6](518.4,517.3,527.0,430.8,438.4,495.8);
// The light let through at wavelength l by a star's outer layers: hydrogen's four visible lines, sodium's pair and other
// atoms' lines (amount other), all moved by a redshift z.
float absorb(float l,float z,float other){
 float r=l/(1.+z),tr=1.;
 for(int i=0;i<4;i++){float d=(r-HL[i])/1.25;tr*=1.-.92*exp(-d*d);}
 for(int i=0;i<2;i++){float d=(r-NA[i])/.42;tr*=1.-.85*other*exp(-d*d);}
 for(int i=0;i<6;i++){float d=(r-OL[i])/.5;tr*=1.-.7*other*exp(-d*d);}
 float k=floor(r*.9);
 for(int j=-1;j<=1;j++){float id=k+float(j);float c=(id+hashi(ivec3(int(id),3,7)))/.9;float d=(r-c)/.26;tr*=1.-other*.55*pow(hashi(ivec3(int(id),9,1)),3.)*exp(-d*d);}
 return tr;
}
// Glowing matter by temperature, in thousands of kelvin.
vec3 heatCol(float T){
 vec3 c=mix(vec3(.4,.02,0.),vec3(1.,.22,.03),smoothstep(.6,1.4,T));
 c=mix(c,vec3(1.,.5,.16),smoothstep(1.4,2.6,T));
 c=mix(c,vec3(1.,.82,.6),smoothstep(2.6,4.5,T));
 c=mix(c,vec3(1.,.96,.92),smoothstep(4.5,6.5,T));
 return mix(c,vec3(.8,.88,1.),smoothstep(6.5,11.,T));
}
float h1f(float s,float k){return fract(sin(s*k)*43758.5453);}
// A galaxy seen face on, at q in units of its radius: a bulge of old yellow stars, spiral arms of young blue ones with
// pink nebulae, and dust lanes on the arms' inner edges (or, for one in six, a smooth elliptical). lod fades the detail.
vec3 galaxyFace(vec2 q,float seed,float lod){
 float r=length(q);if(r>1.5)return vec3(0);
 float a=h1f(seed,12.9898),b=h1f(seed,78.233),c=h1f(seed,37.719);
 float bulge=exp(-r*r/(.012+.02*b));
 if(a>.84){float e=exp(-pow(r/.3,.6)*2.4);return vec3(1.,.8,.6)*(e*1.4+bulge*2.)*smoothstep(1.5,.9,r);}
 float th=atan(q.y,q.x),m=b<.55?2.:3.,pitch=.25+.2*c;
 float sp=m*(th-log(max(r,.04))/pitch)+seed*6.283;
 float n=mix(fbm(vec3(q*6.,seed*7.)),.5,lod);
 float armD=pow(.5+.5*cos(sp),mix(3.5,1.2,lod))*(.55+.9*n);
 float disk=exp(-r*3.4);
 float knots=(1.-lod)*pow(max(fbm(vec3(q*18.,seed*3.))-.5,0.)*2.2,2.5);
 float dust=(1.-lod)*pow(.5+.5*cos(sp+.7),12.)*smoothstep(.05,.22,r)*smoothstep(1.1,.4,r)*(.6+.6*n);
 vec3 col=(vec3(.5,.68,1.)*armD*disk*2.6+vec3(1.,.84,.66)*disk*.8+vec3(1.,.32,.5)*knots*armD*disk*10.)*(1.-.8*dust)+vec3(1.,.85,.64)*bulge*2.6;
 return col*smoothstep(1.5,.95,r);
}
// A galaxy in space (centre c, radius R, disk normal nrm): its face where the ray crosses the disk, or, when it covers
// only a few pixels, a soft point holding the same light, so it never flickers.
vec3 galaxyAt(vec3 ro,vec3 rd,vec3 c,float R,vec3 nrm,float seed,float px){
 vec3 oc=c-ro;float tc=dot(oc,rd);if(tc<=0.)return vec3(0);
 float dd=length(oc-rd*tc),ang=R/tc,sz=ang/px;vec3 col=vec3(0);
 float far=1.-smoothstep(1.5,4.,sz);
 if(far>0.){float s=max(ang*.45,px*.75),a=dd/tc;vec3 tint=h1f(seed,12.9898)>.84?vec3(1.,.8,.6):vec3(.8,.85,1.);
  col+=tint*far*ang*ang*.1/(s*s)*exp(-a*a/(s*s));}
 if(far<1.&&dd<R*1.6){float dn=dot(rd,nrm);if(abs(dn)>1e-4){float t=dot(oc,nrm)/dn;if(t>0.){
  vec3 p=ro+rd*t-c,e1=normalize(cross(nrm,abs(nrm.y)<.95?vec3(0,1,0):vec3(1,0,0))),e2=cross(nrm,e1);
  vec2 q=vec2(dot(p,e1),dot(p,e2))/R;
  col+=galaxyFace(q,seed,clamp(1.-sz/40.,0.,1.))*min(1./abs(dn),4.)*.3*(1.-far);}}}
 return col;
}
// Faint far galaxies across the sky, as small smudges.
vec3 farGalaxies(vec3 d,float px){
 vec3 c=vec3(0),a=abs(d);vec2 uv;float face;
 if(a.x>=a.y&&a.x>=a.z){uv=d.yz/a.x;face=d.x>0.?0.:1.;}else if(a.y>=a.z){uv=d.xz/a.y;face=d.y>0.?2.:3.;}else{uv=d.xy/a.z;face=d.z>0.?4.:5.;}
 vec2 g=uv*26.;ivec2 id=ivec2(floor(g));
 for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){ivec2 q=id+ivec2(i,j);if(hashi(ivec3(q,int(face)*5+101))<.5)continue;
  vec2 pos=vec2(q)+vec2(hashi(ivec3(q,7)),hashi(ivec3(q,19)));vec2 dv=(g-pos)/26.;
  float rot=hashi(ivec3(q,23))*6.283,ecc=.3+.7*hashi(ivec3(q,29));vec2 e=mat2(cos(rot),-sin(rot),sin(rot),cos(rot))*dv;e.y/=ecc;
  float size=px*(1.1+2.6*pow(hashi(ivec3(q,31)),3.));
  c+=mix(vec3(1.,.78,.55),vec3(.7,.8,1.),hashi(ivec3(q,37)))*exp(-dot(e,e)/(size*size))*.035*(.3+hashi(ivec3(q,41)));}
 return c;
}
float segDist2(vec3 ro,vec3 rd,vec3 a,vec3 b,out float tr,out float sg){vec3 u=b-a,w0=ro-a;float bb=dot(rd,u),c=dot(u,u),d=dot(rd,w0),e=dot(u,w0),den=c-bb*bb;
 sg=den>1e-6?clamp((e-bb*d)/den,0.,1.):0.;vec3 q=a+u*sg;tr=max(dot(q-ro,rd),0.);return length(ro+rd*tr-q);}
float seg2(vec2 p,vec2 a,vec2 b){vec2 u=b-a;float h=clamp(dot(p-a,u)/max(dot(u,u),1e-9),0.,1.);return length(p-a-u*h);}
`;
// ---------------------------------------------------------------- A night sky over hills; a horn antenna (sections 1, 10)
const SKY=EXP+`
uniform float uHiss,uAnt,uMW;
vec3 milkyway(vec3 d){vec3 pole=normalize(vec3(-.474,-.825,.307));float b=dot(d,pole),band=exp(-b*b*26.);
 vec3 core=normalize(vec3(-.142,.167,.976));float toCore=max(dot(d,core),0.);
 float n1=fbm(d*6.),n2=fbm(d*13.+3.),dust=smoothstep(.45,.72,fbm(d*9.+vec3(5.,1.,2.)))*exp(-b*b*70.);
 vec3 c=vec3(.8,.68,.55)*band*(.08+pow(n1*n2,1.6)*3.)*(1.+3.*pow(toCore,5.));
 c+=vec3(.25,.3,.5)*exp(-b*b*5.)*.07;c*=1.-.88*dust;
 c+=vec3(.9,.85,.8)*band*pow(vnoise(d*170.),9.)*.5;return c*.07;}
float hills(float az){return .02+.07*fbm(vec3(az*1.6,1.3,0.))-.035+.03*fbm(vec3(az*7.,4.,0.));}
// A big horn antenna on a turntable: a hollow square funnel lying on its side, opening up toward the sky.
float sdBox(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
const vec3 HC=vec3(1.25,-.15,6.4);
float horn(vec3 p){
 p-=HC;
 // A turntable and a frame, and the horn: a square funnel whose mouth faces the camera, tilted up.
 float base=sdBox(p-vec3(0.,.05,0.),vec3(1.5,.05,1.1));
 float rail=length(vec2(length(p.xz-vec2(.2,0.))-1.75,p.y-.02))-.035;base=min(base,rail);
 float cab=sdBox(p-vec3(.95,.62,.55),vec3(.28,.26,.28));
 float legs=min(sdBox(p-vec3(.9,.3,.55),vec3(.06,.3,.3)),sdBox(p-vec3(-.3,.25,-.2),vec3(.05,.25,.5)));
 vec3 ax=normalize(vec3(-.8,.48,-.36)),up=normalize(vec3(0,1,0)-ax*ax.y),sd=cross(ax,up);
 vec3 q=p-vec3(.95,.72,.55);vec3 l=vec3(dot(q,ax),dot(q,up),dot(q,sd));
 float x=l.x,h=.14+max(x,0.)*.36;float side=max(abs(l.y),abs(l.z))-h;
 float shell=max(abs(side)-.022,max(-x,x-2.2));
 return min(min(shell,base),min(cab,legs));}
vec3 hornN(vec3 p){vec2 e=vec2(.003,0);return normalize(vec3(horn(p+e.xyy)-horn(p-e.xyy),horn(p+e.yxy)-horn(p-e.yxy),horn(p+e.yyx)-horn(p-e.yyx)));}
// The leftover glow as a microwave telescope would map it: faint mottling, shown in false colour.
vec3 cmbCol(float v){vec3 c=mix(vec3(0.,.04,.28),vec3(.25,.6,1.),smoothstep(.1,.4,v));c=mix(c,vec3(1.,.93,.78),smoothstep(.4,.55,v));
 c=mix(c,vec3(1.,.5,.12),smoothstep(.55,.72,v));return mix(c,vec3(.55,.1,.04),smoothstep(.72,.95,v));}
float cmbField(vec3 n){return .55*fbm(n*3.2)+.3*fbm(n*9.+2.)+.15*fbm(n*24.+5.);}
void main(){
 vec3 ro=uCamPos,rd=camRay();float px=pixelAngle();
 float az=atan(rd.x,rd.z),hz=hills(az);
 vec3 col;
 if(rd.y>hz){col=stars(rd,px,.4)+milkyway(rd)*uMW;float above=rd.y-hz;
  col+=vec3(.008,.011,.018)*exp(-above*9.)+vec3(.03,.016,.008)*exp(-above*14.)*smoothstep(.2,-.6,sin(az+.8));
  col+=vec3(.05,.045,.04)*uHiss*.6;}
 else col=vec3(.002,.0025,.004)+vec3(.006,.008,.012)*smoothstep(-.2,hz,rd.y);
 if(uAnt>0.){vec2 hb=sphereHit(ro,rd,HC+vec3(0.,.8,0.),3.4);
  if(hb.y>0.){float t=max(hb.x,0.);bool hit=false;for(int i=0;i<110;i++){float d=horn(ro+rd*t);if(d<.002){hit=true;break;}t+=d*.9;if(t>hb.y)break;}
   if(hit){vec3 p=ro+rd*t,n=hornN(p);vec3 moon=normalize(vec3(.5,.55,-.65));float l=max(dot(n,moon),0.),rim=pow(1.-max(dot(n,-rd),0.),4.);
    float panel=smoothstep(.0,.02,abs(fract((p.x+p.z)*6.)-.5)-.46);vec3 c=(vec3(.13,.14,.16)*l+vec3(.016,.018,.024)+vec3(.03,.034,.045)*max(n.y,0.))*(.8+.2*panel)+vec3(.09,.11,.16)*rim*.9;
    // Inside the mouth: walls lit faintly by the sky, darker toward the narrow end.
    vec3 q=p-HC-vec3(.95,.72,.55);vec3 ax=normalize(vec3(-.8,.48,-.36));float x=dot(q,ax);bool inside=dot(n,ax)>-.2&&x>.05&&x<2.1;
    if(inside)c=vec3(.004,.005,.008)+vec3(.035,.04,.055)*pow(smoothstep(.1,2.1,x),2.)*(.4+.6*l);
    vec3 up2=normalize(vec3(0,1,0)-ax*ax.y),sd2=cross(ax,up2);float hh=.14+max(x,0.)*.36;vec2 uv=vec2(dot(q,up2),dot(q,sd2))/hh;
    if(inside){vec2 g=abs(fract(uv*2.+.5)-.5);c+=vec3(.02,.024,.032)*exp(-min(g.x,g.y)*min(g.x,g.y)/.0015)*smoothstep(.4,2.,x);}
    if(x>2.1)c+=vec3(.2,.23,.28)*.8;col=mix(col,c,uAnt);}}}
 o=vec4(col,1.);
}`;
// ---------------------------------------------------------------- A field of galaxies (sections 1, 7-10)
const FIELD=EXP+`
uniform vec4 uG[40],uGn[40];uniform int uCount;uniform vec3 uRef;uniform vec4 uMark,uMark2;
uniform float uA,uA0,uTrail,uBack,uGal,uHeat,uTemp,uFog,uGrid,uGridS,uWarm;
uniform vec4 uWave;uniform vec3 uWaveA,uWaveB;
void main(){
 vec3 ro=uCamPos,rd=camRay();float px=pixelAngle();
 vec3 col=(stars(rd,px,.3)+farGalaxies(rd,px))*uBack;
 for(int i=0;i<40;i++){if(i>=uCount)break;vec4 g=uG[i],n=uGn[i];vec3 c=uRef+(g.xyz-uRef)*uA;
  col+=galaxyAt(ro,rd,c,g.w,n.xyz,n.w,px)*uGal;
  // A trail behind each galaxy, from where it was a while ago: longer for the farther, faster ones.
  if(uTrail>0.){vec3 b0=uRef+(g.xyz-uRef)*uA0;if(length(c-b0)>.05){float tr,sg;float d=segDist2(ro,rd,b0,c,tr,sg);float w=px*tr*1.5+g.w*.12;
   vec3 tint=h1f(n.w,12.9898)>.84?vec3(1.,.8,.6):vec3(.75,.82,1.);
   col+=tint*exp(-d*d/(w*w))*pow(sg,1.6)*(1.-smoothstep(.85,1.,sg)*.6)*uTrail*1.1*min(1.,px*tr*4./w);}}}
 // Rings round the galaxies the picture is about.
 for(int m=0;m<2;m++){vec4 M=m==0?uMark:uMark2;if(M.w<=0.)continue;vec3 dv=M.xyz-ro;float dist=length(dv);float ang=acos(clamp(dot(rd,dv/dist),-1.,1.));
  float rr=max(3.4/dist,px*16.);col+=vec3(1.,.82,.55)*exp(-pow((ang-rr)/(px*1.3),2.))*M.w*.9;}
 if(uGrid>0.&&abs(rd.y)>1e-4){float t=-ro.y/rd.y;if(t>0.){vec2 p=(ro+rd*t).xz/uGridS;vec2 f=abs(fract(p+.5)-.5)*uGridS;float w=px*t*.9;
  col+=vec3(.12,.2,.45)*(exp(-f.x*f.x/(w*w))+exp(-f.y*f.y/(w*w)))*uGrid*exp(-t*.015)*.55;}}
 // A light wave crossing from a far galaxy to ours, its waves stretched as space grows.
 if(uWave.x>0.){vec3 A=uWaveA,B=uWaveB,dir=normalize(A-B),side=normalize(cross(dir,vec3(0,1,0)));
  float dn=dot(rd,side);if(abs(dn)>1e-4){float t=dot(B-ro,side)/dn;if(t>0.){vec3 p=ro+rd*t-B;float s=dot(p,dir),h=p.y-.6;
   float lam=uWave.y,front=uWave.w,len=lam*4.;
   float env=smoothstep(front,front+lam*.6,s)*smoothstep(front+len,front+len-lam*.6,s)*step(s,length(A-B));
   float ph=TAU*(s-front)/lam,y=.3*lam*sin(ph),slope=.3*TAU*cos(ph);
   float d=abs(h-y)/sqrt(1.+slope*slope),w=px*t*1.4+.02;
   col+=spectral(uWave.z)*3.*exp(-d*d/(w*w))*env*uWave.x;}}}
 // Running time back: the gas between galaxies grows dense and hot until it glows.
 if(uHeat>0.){float tot=0.,j=hashi(ivec3(ivec2(gl_FragCoord.xy),int(uTime*48.)));
  for(int k=0;k<14;k++){vec3 p=ro+rd*(float(k)+j)*3.;tot+=pow(fbm(p*.09+vec3(0.,uTime*.03,0.)),2.)*3.;}
  col+=heatCol(uTemp)*tot*.03*uHeat;float f1=fbm(rd*2.2+vec3(uTime*.03)),f2=fbm(rd*7.+f1*2.);
  float cen=exp(-dot(centered(),centered())*2.2);
  col=mix(col,heatCol(uTemp*(.62+.5*cen))*(.03+1.7*pow(f1*f2*2.,2.4))*(.25+.95*cen),uFog);}
 col+=vec3(.05,.008,.002)*uWarm*(.4+.6*fbm(rd*3.));
 o=vec4(col,1.);
}`;
// ---------------------------------------------------------------- Sunlight through a prism, onto a card (section 2)
const PRISM=EXP+`
uniform float uOther,uHyd,uNa,uFan;
const vec3 E=vec3(-.081,.25,.0676),X=vec3(.081,.25,.0676);
const vec3 DIN=vec3(.943,0.,.333),DC=vec3(.943,0.,-.333),T=vec3(.333,0.,.943);
const float NC=1.5185,K=28.,PHC=-.3395,L=1.;
float lamOf(float th){float n=NC-th/K;return sqrt(4200./max(n-1.5046,1e-4));}
float thOf(float l){return -(1.5046+4200./(l*l)-NC)*K;}
vec3 cardC(){return X+DC*L+T*(-.105);}
// The light reaching the card at tangent coordinate u (from the central ray): the rainbow and its dark lines.
vec3 bandAt(float u,float v){float th=atan(u/L);float l=lamOf(th);if(l<380.||l>760.)return vec3(0);
 float edge=smoothstep(.052,.04,abs(v-.25));return bandSpec(l)*absorb(l,0.,uOther)*edge;}
float prismHit(vec3 ro,vec3 rd,out vec3 nrm,out float tfar){
 vec3 N[5];float D[5];N[0]=vec3(0,-1,0);D[0]=0.;N[1]=vec3(0,1,0);D[1]=.42;
 N[2]=normalize(vec3(-.312,0.,.18));D[2]=dot(N[2],vec3(-.18,0.,-.104));
 N[3]=normalize(vec3(.312,0.,.18));D[3]=dot(N[3],vec3(.18,0.,-.104));
 N[4]=vec3(0,0,-1);D[4]=.104;
 float tn=-1e9;tfar=1e9;nrm=vec3(0);
 for(int i=0;i<5;i++){float dn=dot(N[i],rd),dist=D[i]-dot(N[i],ro);
  if(abs(dn)<1e-6){if(dist<0.)return -1.;continue;}float t=dist/dn;
  if(dn<0.){if(t>tn){tn=t;nrm=N[i];}}else tfar=min(tfar,t);}
 return tn<tfar&&tfar>0.?tn:-1.;}
vec3 room(vec3 rd){return vec3(.006,.007,.01)*(.6+.4*rd.y);}
void main(){
 vec3 ro=uCamPos,rd=camRay();float px=pixelAngle();
 vec3 col=room(rd);float tHit=1e9;
 // Table.
 if(rd.y<0.){float t=-ro.y/rd.y;vec3 p=ro+rd*t;tHit=t;float w=fbm(vec3(p.x*3.,0.,p.z*40.));
  col=vec3(.012,.008,.006)*(.6+.8*w);}
 // Card.
 {vec3 cc=cardC();float dn=dot(rd,DC);if(abs(dn)>1e-5){float t=dot(cc-ro,DC)/dn;if(t>0.&&t<tHit){vec3 p=ro+rd*t;float u=dot(p-cc,T);
  if(abs(u)<.3&&p.y>.06&&p.y<.44){tHit=t;float uc=dot(p-(X+DC*L),T);
   col=vec3(.012)+bandAt(uc,p.y)*1.;
   // Marks over hydrogen's lines and sodium's pair.
   if(p.y>.301&&p.y<.312){for(int i=0;i<4;i++){float du=uc-L*tan(thOf(HL[i]));col+=vec3(.75,.85,1.)*exp(-du*du/3e-7)*uHyd*.35;}
    float dna=uc-L*tan(thOf(589.3));col+=vec3(1.,.8,.55)*exp(-dna*dna/5e-7)*uNa*.35;}}}}}
 // Light in the haze: the incoming beam, the beam inside the glass, and the fan of colours.
 // A dark card with a narrow slit, which lets through a thin sheet of sunlight.
 vec3 SL=E-DIN*.78,TP=vec3(-.333,0.,.943);
 {float dn=dot(rd,DIN);if(abs(dn)>1e-5){float t=dot(SL-ro,DIN)/dn;vec3 p=ro+rd*t;float u=dot(p-SL,TP);
  if(t>0.&&t<tHit&&abs(u)<.2&&p.y>.02&&p.y<.46){tHit=t;float slit=step(abs(u),.005)*step(abs(p.y-.25),.05);
   col=vec3(.014,.014,.016)*(.7+.3*fbm(p*30.))+vec3(1.,.96,.9)*4.*slit;}}}
 {float tr,sg;float d=segDist2(ro,rd,SL,E,tr,sg);if(tr<tHit)col+=vec3(1.,.96,.9)*(exp(-d*d/2.5e-4)*1.6+exp(-d*d/3e-3)*.12);
  d=segDist2(ro,rd,E,X,tr,sg);if(tr<tHit)col+=vec3(1.,.97,.93)*exp(-d*d/2e-4)*1.2;}
 if(abs(rd.y)>1e-4){float ta=(.2-ro.y)/rd.y,tb=(.3-ro.y)/rd.y;float t0=max(min(ta,tb),0.),t1=min(max(ta,tb),tHit);
  if(t1>t0){float j=hashi(ivec3(ivec2(gl_FragCoord.xy),int(uTime*48.)));vec3 acc=vec3(0);
   for(int k=0;k<10;k++){float t=t0+(t1-t0)*(float(k)+j)/10.;vec3 q=ro+rd*t;vec3 rel=q-X;float r=length(rel.xz);
    float th=atan(rel.z,rel.x)-PHC;float front=dot(q-(X+DC*L),-DC);
    if(r>.01&&front>0.){float l=lamOf(th);if(l>385.&&l<740.)acc+=spectral(l)*absorb(l,0.,uOther)/(r*6.+.4)*smoothstep(.05,.035,abs(q.y-.25));}}
   col+=acc*(t1-t0)/10.*2.6*uFan;}}
 // The prism: clear glass, with bright edges and a faint reflection of the room.
 vec3 n;float tf;float tp=prismHit(ro,rd,n,tf);
 if(tp>0.&&tp<tHit){vec3 p=ro+rd*tp;float c=max(dot(n,-rd),0.),fr=.04+.96*pow(1.-c,5.);
  vec3 refl=room(reflect(rd,n));
  float e1=length(p.xz-vec2(0.,.208)),e2=length(p.xz-vec2(-.18,-.104)),e3=length(p.xz-vec2(.18,-.104));
  float edge=min(min(e1,e2),e3),topE=min(abs(p.y-.42),abs(p.y));
  float ew=px*tp*1.3;
  col=col*vec3(.8,.86,.9)+refl*fr*3.+vec3(.55,.65,.8)*(exp(-edge*edge/(ew*ew))*.3+exp(-topE*topE/(ew*ew))*.15)+vec3(.03,.036,.045)*(.3+fr);}
 o=vec4(col,1.);
}`;
// ---------------------------------------------------------------- A galaxy and its barcode, moved toward red (section 3)
const SHIFT=EXP+`
uniform float uSeedA,uSeedB,uMix,uZ,uBand,uLab,uLink,uGhost,uWaveOn,uWaveNm;
vec3 bandCol(float x,float z){float l=390.+(x+.62)/1.24*350.;return bandSpec(l)*absorb(l,z,.25);}
void main(){
 vec2 p=centered();float px=1./uRes.y;
 vec3 col=stars(normalize(vec3(p*.6,1.)),px*.6,.3)+farGalaxies(normalize(vec3(p*.6,1.)),px*.6);
 // The galaxy, tilted, its look changing between galaxies.
 vec2 g=p-vec2(0.,.2);float ca=cos(.5),sa=sin(.5);vec2 q=mat2(ca,-sa,sa,ca)*g/.27;q.y/=.48;
 col+=mix(galaxyFace(q,uSeedA,0.),galaxyFace(q,uSeedB,0.),uMix)*.9;
 // Bands: hydrogen as measured in a lab (top), and the galaxy's light (bottom).
 for(int b=0;b<2;b++){float y0=b==0?-.19:-.33;float on=b==0?uLab:uBand;if(on<=0.)continue;
  if(abs(p.x)<.64&&abs(p.y-y0)<.05){float ins=smoothstep(.62,.615,abs(p.x))*smoothstep(.038,.034,abs(p.y-y0));
   col=mix(col,bandCol(p.x,b==0?0.:uZ)*.75,ins*on);
   col+=vec3(.08)*exp(-pow((abs(p.y-y0)-.037)/.0015,2.))*step(abs(p.x),.62)*on;}}
 // Thin guides from each of the lab's hydrogen lines to the same line in the galaxy's light.
 for(int i=0;i<4;i++){float xl=(HL[i]-390.)/350.*1.24-.62,xg=(HL[i]*(1.+uZ)-390.)/350.*1.24-.62;
  float d=seg2(p,vec2(xl,-.229),vec2(xg,-.291));col+=vec3(.7,.8,1.)*exp(-d*d/(px*px*1.4))*uLink*.5*step(xg,.62);
  float gx=abs(p.x-xl);col+=vec3(.6,.7,.9)*exp(-gx*gx/(px*px*1.5))*smoothstep(.006,0.,abs(p.y+.3)-.03)*uGhost*.35;}
 // A light wave: its crests drawn to the spacing its colour has.
 if(uWaveOn>0.){float lam=uWaveNm/5200.,y=-.045+.022*sin(TAU*p.x/lam),slope=.022*TAU/lam*cos(TAU*p.x/lam);
  float d=abs(p.y-y)/sqrt(1.+slope*slope);col+=spectral(uWaveNm)*2.2*exp(-d*d/(px*px*2.2))*smoothstep(.62,.5,abs(p.x))*uWaveOn;}
 o=vec4(col,1.);
}`;
// ---------------------------------------------------------------- Waves from a moving source (section 4)
const DOPPLER=EXP+`
uniform vec4 uE[40];uniform int uNE;uniform float uC,uLight,uMarks,uYouOn,uTS;uniform vec2 uSrc,uYou;
void main(){
 vec2 p=centered();float px=1./uRes.y;
 vec3 col=vec3(.003,.004,.007)*(1.+.5*fbm(vec3(p*3.,1.)));
 for(int k=0;k<40;k++){if(k>=uNE)break;vec4 e=uE[k];float r=uC*(uTS-e.z);if(r<0.)continue;
  vec2 dv=p-e.xy;float d=length(dv);float w=.0024+px*.7;float ring=exp(-pow((d-r)/w,2.))*exp(-r*mix(1.,.45,uLight))*mix(.65,1.,uLight);
  float cph=d>1e-4?dot(dv/d,vec2(1.,0.)):0.;float f=1.-e.w*clamp(cph*2.2,-1.,1.);
  // Colours past what the eye sees are held at its deepest red and violet, so the stretched waves stay visible.
  vec3 tone=mix(vec3(.55,.7,1.),spectral(clamp(540.*f,425.,650.))*1.6+vec3(.02),uLight);
  col+=tone*ring*1.3;
  col+=vec3(.75,.85,1.)*exp(-dot(dv,dv)/(16.*px*px))*uMarks*1.6*exp(-(uTS-e.z)*.12);}
 vec2 s=p-uSrc;float flash=step(.5,fract(uTS*1.6));vec3 lamp=mix(mix(vec3(1.,.25,.2),vec3(.3,.45,1.),flash),vec3(1.,.95,.85),uLight);
 col+=lamp*(exp(-dot(s,s)/1.2e-4)*6.+.0006/(dot(s,s)+.0004));
 vec2 y=p-uYou;col+=vec3(.9,.95,1.)*exp(-dot(y,y)/1.5e-4)*2.*uYouOn+vec3(.3,.4,.6)*exp(-pow((length(y)-.03)/.002,2.))*uYouOn;
 o=vec4(col,1.);
}`;
// ---------------------------------------------------------------- A lamp's light spreading (section 5)
const LAMP=EXP+`
uniform float uWall,uHole,uHaze;
float boxT(vec3 ro,vec3 rd,vec3 lo,vec3 hi){vec3 inv=1./rd,a=(lo-ro)*inv,b=(hi-ro)*inv,t1=min(a,b),t2=max(a,b);float tn=max(max(t1.x,t1.y),t1.z),tf=min(min(t2.x,t2.y),t2.z);return tn<tf&&tf>0.?tn:-1.;}
void main(){
 vec3 ro=uCamPos,rd=camRay();float px=pixelAngle();
 vec3 col=vec3(.003,.0035,.005);float tHit=1e9;
 // The wall at twice the distance, in squares as wide as the hole.
 if(rd.x>1e-4){float t=(2.-ro.x)/rd.x;vec3 p=ro+rd*t;if(t>0.&&abs(p.y)<1.2&&abs(p.z)<1.6){tHit=t;
  vec2 g=abs(fract(p.yz/.4+.5)-.5)*.4;float lw=px*t*.8;float grid=max(exp(-g.x*g.x/(lw*lw)),exp(-g.y*g.y/(lw*lw)));
  float lit=step(abs(p.y),.4)*step(abs(p.z),.4);vec3 alb=vec3(.5);
  col=alb*(vec3(.045)+vec3(1.,.86,.66)*lit*.8/4.*uWall)*(1.-.6*grid)+vec3(.03,.035,.045)*grid*.35;}}
 // A dark plate at the distance 1, with a square hole the light shines through.
 float tP=-1.;if(abs(rd.x)>1e-4){float t=(1.-ro.x)/rd.x;vec3 p=ro+rd*t;if(t>0.&&t<tHit&&abs(p.y)<.5&&abs(p.z)<.5){
  if(abs(p.y)>.2||abs(p.z)>.2){tHit=t;float r2=1.+p.y*p.y+p.z*p.z;col=vec3(.1,.1,.11)*.8/(r2*sqrt(r2))+vec3(.006);}
  else col+=vec3(1.,.86,.66)*.5*.8*uHole;
  float e=min(abs(abs(p.y)-.2),abs(abs(p.z)-.2));float rim=step(abs(p.y),.21)*step(abs(p.z),.21);float lw=px*t;
  col+=vec3(.8,.75,.65)*exp(-e*e/(lw*lw))*rim*.4;}}
 // The lamp.
 vec2 hb=sphereHit(ro,rd,vec3(0),.05);if(hb.x>0.&&hb.x<tHit){tHit=hb.x;col=vec3(1.,.9,.75)*4.;}
 {float tc=max(dot(-ro,rd),0.);vec3 c=ro+rd*tc;float d2=dot(c,c);if(tc<tHit)col+=vec3(1.,.85,.65)*.00025/(d2+.00025);}
 // The light in the haze: a pyramid from the lamp through the hole, fainter with distance squared.
 {float j=hashi(ivec3(ivec2(gl_FragCoord.xy),int(uTime*48.)));vec3 acc=vec3(0);float t0=0.,t1=min(tHit,12.);
  for(int k=0;k<44;k++){float t=t0+(t1-t0)*(float(k)+j)/44.;vec3 q=ro+rd*t;if(q.x>.05&&q.x<2.&&abs(q.y)<.2*q.x&&abs(q.z)<.2*q.x)acc+=vec3(1.,.86,.66)/(q.x*q.x+.05);}
  col+=acc*(t1-t0)/44.*.11*uHaze;}
 o=vec4(col,1.);
}`;
// ---------------------------------------------------------------- Stars that pulse; one in another galaxy (section 5)
const PULSE=EXP+`
uniform float uA,uB,uOnA,uOnB,uGal,uZoom,uCep,uFar,uTr;uniform vec2 uCepP;
float cepG(float t,float P,float ph){float x=fract(t/P+ph);return x<.18?.35+.65*x/.18:.35+.65*(1.-(x-.18)/.82);}
float trace(vec2 p,vec2 c,float P,float ph,float amp,float px){if(abs(p.x-c.x)>.2)return 0.;float tt=uTime-(c.x+.2-p.x)*7.;float y=c.y-.2+cepG(tt,P,ph)*.07*amp;
 return exp(-pow((p.y-y)/(px*1.3),2.))*smoothstep(.2,.15,abs(p.x-c.x));}
vec3 star(vec2 p,vec2 c,float L,float px){vec2 d=p-c;float r2=dot(d,d);
 float spike=(exp(-abs(d.x)/(px*1.2))*exp(-abs(d.y)*9.)+exp(-abs(d.y)/(px*1.2))*exp(-abs(d.x)*9.))*.25;
 return vec3(1.,.86,.62)*L*(exp(-r2/(px*px*6.))*3.+.00018/(r2+.00012)+spike);}
void main(){
 vec2 p=centered();float px=1./uRes.y;
 vec3 col=stars(normalize(vec3(p*.7,1.)),px*.7,.35)*(1.-uGal);
 vec2 ca=mix(vec2(-.34,.02),vec2(-.24,.1),uFar);
 col+=star(p,ca,uA/(1.+3.*uFar)/(1.+3.*uFar),px)*uOnA*(1.-uGal)+star(p,vec2(.34,.02),uB,px)*uOnB*(1.-uGal);
 col+=vec3(1.,.8,.5)*(trace(p,vec2(-.34,.02),3.2,0.,1.,px)*uOnA+trace(p,vec2(.34,.02),1.3,.4,.6,px)*uOnB)*uTr*(1.-uGal)*.5;
 if(uGal>0.){vec2 g=(p-uCepP)/uZoom+uCepP*0.;vec2 gp=g+vec2(.33,.17);float ca=cos(.6),sa=sin(.6);vec2 q=mat2(ca,-sa,sa,ca)*gp/.55;q.y/=.4;
  vec3 gal=galaxyFace(q,5.3,0.)*.8+stars(normalize(vec3(g*.7,1.)),px*.7/uZoom,.8)*.5;
  col=mix(col,gal+star(p,uCepP,uCep*1.6,px),uGal);}
 o=vec4(col,1.);
}`;
// ---------------------------------------------------------------- Speed against distance (section 6)
const PLOT=EXP+`
uniform vec4 uP[24];uniform float uAxes,uLine,uGuide,uSlope,uDim;
const vec2 O=vec2(-.55,-.33),SZ=vec2(1.12,.66);
vec2 at(vec2 u){return O+u*SZ;}
void main(){
 vec2 p=centered();float px=1./uRes.y;
 vec3 col=vec3(.003,.004,.007);
 float ax=min(seg2(p,O,at(vec2(1.02,0.))),seg2(p,O,at(vec2(0.,1.04))));col+=vec3(.4,.45,.55)*exp(-ax*ax/(px*px*1.2))*uAxes*.5;
 float ln=seg2(p,at(vec2(0.)),at(vec2(uLine*.98)));col+=vec3(1.,.72,.45)*exp(-ln*ln/(px*px*2.))*step(.001,uLine)*.9;
 // Guides: one galaxy and another twice as far, and their speeds.
 for(int i=1;i<=2;i++){float u=.4*float(i);vec2 a=at(vec2(u,0.)),b=at(vec2(u,u)),c=at(vec2(0.,u));
  float d=min(seg2(p,a,b),seg2(p,b,c));float dash=step(.5,fract((p.x+p.y)*90.));col+=vec3(.7,.8,1.)*exp(-d*d/(px*px*1.2))*dash*uGuide*.45;}
 // The slope: so much faster for each step farther.
 {vec2 a=at(vec2(.2,.2)),b=at(vec2(.325,.2)),c=at(vec2(.325,.325));float d=min(seg2(p,a,b),seg2(p,b,c));col+=vec3(.9,.9,1.)*exp(-d*d/(px*px*1.2))*uSlope*.6;}
 for(int i=0;i<24;i++){vec4 q=uP[i];if(q.z<=0.)continue;vec2 d=p-at(q.xy);float r2=dot(d,d);
  col+=vec3(.65,.8,1.)*q.z*(exp(-r2/(px*px*5.))*2.2+.000004/(r2+.00001));}
 o=vec4(col*(1.-uDim*.75),1.);
}`;
// ---------------------------------------------------------------- Raisin bread rising, cut open (section 7)
const LOAF=EXP+`
uniform float uS,uSel,uArrows,uS0,uGhostLoaf;uniform vec4 uR[24];uniform int uNR;uniform vec3 uPick;
float sdRB(vec3 p,vec3 b,float r){vec3 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.)-r;}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
const float BASE=-.32;
float loafSDs(vec3 p,float sc);
float loafSD(vec3 p){return loafSDs(p,uS);}
float loafSDs(vec3 p,float sc){vec3 q=(p-vec3(0.,BASE,0.))/sc;
 float body=sdRB(q-vec3(0.,.22,0.),vec3(.85,.22,.42),.16);
 vec3 e=(q-vec3(0.,.38,0.))/vec3(.84,.3,.42);float dome=(length(e)-1.)*.3;
 float d=smin(body,dome,.08);d=max(d,-q.y);return d*sc;}
float sceneSD(vec3 p){return max(loafSD(p),p.z);}
vec3 nrmAt(vec3 p){vec2 e=vec2(.0015,0);return normalize(vec3(sceneSD(p+e.xyy)-sceneSD(p-e.xyy),sceneSD(p+e.yxy)-sceneSD(p-e.yxy),sceneSD(p+e.yyx)-sceneSD(p-e.yyx)));}
vec2 rpos(int i,float s){return vec2(0.,BASE)+uR[i].xy*s;}
void main(){
 vec3 ro=uCamPos,rd=camRay();float px=pixelAngle();
 // An oven's dark inside, with the glow of its elements.
 vec3 col=vec3(.01,.005,.0025)*(1.+rd.y)+vec3(1.,.3,.05)*.12*exp(-pow((rd.y-.3)*60.,2.))*smoothstep(.7,.2,abs(rd.x));
 float t=0.;bool hit=false;vec2 hb=sphereHit(ro,rd,vec3(0.,0.,-.3),2.2);
 if(hb.y>0.){t=max(hb.x,0.);for(int i=0;i<110;i++){float d=sceneSD(ro+rd*t);if(d<.0008){hit=true;break;}t+=d*.9;if(t>hb.y)break;}}
 // Tray.
 if(!hit&&rd.y<0.){float tt=(BASE-ro.y)/rd.y;vec3 p=ro+rd*tt;col=vec3(.015,.013,.012)+vec3(.25,.1,.03)*.06*exp(-abs(p.x)*1.5)*exp(-abs(p.z+.3));}
 if(hit){vec3 p=ro+rd*t;vec3 key=normalize(vec3(-.5,.75,.6)),back=normalize(vec3(.3,.4,-.9));
  if(p.z>-.002){
   // The cut face: soft crumb with air holes, and the raisins.
   vec2 f=p.xy;vec2 fs=f/uS;float pores=smoothstep(.58,.68,fbm(vec3(fs*85.,1.)))*.8+smoothstep(.62,.7,fbm(vec3(fs*160.,4.)))*.5;float grain=fbm(vec3(fs*220.,3.));
   vec3 crumb=mix(vec3(.95,.83,.6),vec3(.62,.44,.26),min(pores,1.)*.7)*(.86+.2*grain);
   float edgeD=-loafSD(vec3(f,-.004));crumb=mix(vec3(.5,.26,.08),crumb,smoothstep(.0,.035*uS,edgeD));
   vec3 c=crumb*(vec3(1.,.88,.72)*.62*max(dot(vec3(0,0,1),key),0.)+.04);
   float near=1e9;
   for(int i=0;i<24;i++){if(i>=uNR)break;vec2 rp=rpos(i,uS),dv=f-rp;float an=atan(dv.y,dv.x);
    float r=uR[i].z*(1.+.55*(vnoise(vec3(cos(an)*1.5+float(i)*3.,sin(an)*1.5,0.))-.5));r*=mix(1.,1.35,abs(cos(an+float(i))));float d=length(dv)-r;
    float sh=smoothstep(.003,-.003,d);float wr=ridged(vec3(dv*120.,float(i)));vec3 rc=vec3(.09,.035,.04)*(.35+1.1*wr*wr);
    rc+=vec3(.6,.45,.4)*pow(max(1.-length(dv-vec2(-.006,.007))/(r*.6),0.),5.)*.35;
    c=mix(c*(1.-.4*smoothstep(.012,0.,d)),rc,sh);
    if(float(i)==uSel)near=d;}
   // The raisin we sit on, and arrows to two others: one gap and two gaps away.
   c+=vec3(1.,.62,.25)*exp(-pow(near-.012,2.)/(1.2e-5))*uArrows*2.2;
   vec2 s0=rpos(int(uSel),uS);
   for(int k=0;k<2;k++){int j=int(k==0?uPick.x:uPick.y);vec2 rp=rpos(j,uS),gh=s0+(uR[j].xy-uR[int(uSel)].xy)*uS0;
    float dl=seg2(f,s0+normalize(rp-s0)*.045,rp-normalize(rp-s0)*.04);float lw=px*t*1.8;
    c=mix(c,vec3(1.,.97,.9)*1.4,exp(-dl*dl/(lw*lw))*uArrows*.85);
    vec2 tip=rp-normalize(rp-s0)*.04,bk=-normalize(rp-s0)*.022,sd=vec2(-bk.y,bk.x)*.6;float dh=min(seg2(f,tip,tip+bk+sd),seg2(f,tip,tip+bk-sd));c=mix(c,vec3(1.,.97,.9)*1.4,exp(-dh*dh/(lw*lw))*uArrows*.85);
    float dg=seg2(f,gh,rp-normalize(rp-s0)*.045);c+=vec3(1.,.55,.2)*exp(-dg*dg/(lw*lw*4.))*uArrows*2.2*step(.005,length(rp-gh));
    float ring=abs(length(f-gh)-.012);c+=vec3(1.,.7,.4)*exp(-ring*ring/(lw*lw))*uArrows*.8;}
   col=c;
  }else{
   // The crust: golden brown, glazed, darker underneath.
   vec3 n=nrmAt(p);float b1=fbm(p*14./uS),b2=fbm(p*40./uS);n=normalize(n+vec3(b1-.5,b2-.5,b1-b2)*.35);
   float up=smoothstep(-.1,.6,(p.y-BASE)/uS);vec3 alb=mix(vec3(.28,.12,.04),vec3(.72,.42,.16),up)*(.7+.5*b2);
   float dif=max(dot(n,key),0.),rim=pow(1.-max(dot(n,-rd),0.),3.);vec3 h=normalize(key-rd);float sp=pow(max(dot(n,h),0.),40.)*.5;
   col=alb*(vec3(1.,.88,.72)*1.2*dif+.05)+vec3(1.,.5,.15)*rim*.1*max(dot(n,back)+.3,0.)+vec3(1.,.9,.8)*sp;}}
 // A dashed outline of the loaf's first size, so its rise shows.
 if(uGhostLoaf>0.&&rd.z<-1e-4){float t0=-ro.z/rd.z;vec3 q=ro+rd*t0;float d1=loafSDs(vec3(q.xy,-.001),1.);float lw=px*t0*1.2;
  float dash=step(.5,fract(atan(q.y-BASE-.2,q.x)*26.));col+=vec3(.9,.85,.75)*exp(-d1*d1/(lw*lw))*dash*uGhostLoaf*.55;}
 o=vec4(col,1.);
}`;
// ---------------------------------------------------------------- The glow stretched into microwaves (section 10)
const GLOWS=EXP+`
uniform float uStretch,uWaveOn,uSphere,uSpin,uGlowBg,uShell,uShellT;
float cmbField(vec3 n){return .55*fbm(n*3.2)+.3*fbm(n*9.+2.)+.15*fbm(n*24.+5.);}
vec3 cmbCol(float v){vec3 c=mix(vec3(0.,.04,.28),vec3(.25,.6,1.),smoothstep(.1,.4,v));c=mix(c,vec3(1.,.93,.78),smoothstep(.4,.55,v));
 c=mix(c,vec3(1.,.5,.12),smoothstep(.55,.72,v));return mix(c,vec3(.55,.1,.04),smoothstep(.72,.95,v));}
void main(){
 vec3 ro=uCamPos,rd=camRay();float px=pixelAngle();vec2 p=centered();
 vec3 col=stars(rd,px,.6)*(1.-uGlowBg);
 // The glow: hot gas filling space, cooling as its light is stretched.
 float T=mix(3.,.6,uStretch);float f1=fbm(vec3(p*2.2/(1.+uStretch*3.),uTime*.04)),f2=fbm(vec3(p*6./(1.+uStretch*3.)+f1*2.,1.));
 col+=heatCol(T)*(.03+.45*pow(f1*f2*2.,2.4))*uGlowBg*(1.-smoothstep(.4,1.,uStretch));
 // One wave of it, stretched: orange, then red, then too long to see.
 if(uWaveOn>0.){float lam=mix(.05,1.4,uStretch*uStretch),nm=mix(590.,690.,smoothstep(0.,.45,uStretch));
  float y=.045*(1.+uStretch*2.)*sin(TAU*(p.x+.2)/lam),slope=.045*(1.+uStretch*2.)*TAU/lam*cos(TAU*(p.x+.2)/lam);
  float d=abs(p.y-y)/sqrt(1.+slope*slope),w=px*1.6;float seen=1.-smoothstep(.45,.8,uStretch);
  vec3 c=spectral(nm)*2.5*(1.+4.*smoothstep(620.,690.,nm))*seen;
  col+=c*exp(-d*d/(w*w))*smoothstep(.85,.6,abs(p.x))*uWaveOn;
  // Once too long to see, a ghost of the wave, dashed.
  float dash=step(.45,fract(p.x*14.));col+=vec3(.3,.36,.48)*exp(-d*d/(w*w*4.))*dash*(1.-seen)*smoothstep(.85,.6,abs(p.x))*uWaveOn*.9;}
 // The glow from every direction, seen from inside it: hot gas all round a tiny Earth, its light arriving from every side.
 if(uShell>0.){vec2 h=sphereHit(ro,rd,vec3(0),1.);vec3 nb=normalize(ro+rd*max(h.y,0.));float vb=fbm(nb*4.+uTime*.02);
  vec3 sh=heatCol(uShellT)*(.16+.9*pow(vb,2.2))*.55;
  float r=length(p),a=atan(p.y,p.x);
  for(int k=0;k<16;k++){float hk=hashi(ivec3(k,3,9)),ak=(float(k)+.3*hk)*TAU/16.;float da=a-ak;da=da-TAU*floor(da/TAU+.5);
   float dist=r*abs(sin(da))+step(1.5,abs(da))*9.;float s=fract(r*2.2+uTime*.5+hk);
   sh+=heatCol(uShellT+.8)*1.4*exp(-pow(dist/(px*1.6),2.))*exp(-s*7.)*smoothstep(.03,.08,r)*smoothstep(.95,.55,r);}
  sh+=vec3(.25,.5,1.)*(exp(-r*r/(px*px*7.))*1.3+.0000015/(r*r+.000012));
  col=mix(col,sh,uShell);}
 // The whole sky's glow, as a microwave telescope maps it, on a sphere around us.
 // The whole sky's glow as microwave telescopes map it: the sky drawn flat as an oval, in false colour.
 if(uSphere>0.){vec2 e=p/vec2(.72,.36);float rr=dot(e,e);
  if(rr<1.){float th=asin(clamp(p.y/.36,-1.,1.)),lam=PI*p.x/(.72*max(cos(th),1e-3)),phi=asin(clamp((2.*th+sin(2.*th))/PI,-1.,1.));
   vec3 n=vec3(cos(phi)*cos(lam+uSpin),sin(phi),cos(phi)*sin(lam+uSpin));col=mix(col,cmbCol(cmbField(n))*.3,uSphere*smoothstep(1.,.985,rr));}
  col+=vec3(.5,.55,.65)*exp(-pow((sqrt(rr)-1.)*.36/(px*1.4),2.))*.25*uSphere;}
 o=vec4(col,1.);
}`;
// ---------------------------------------------------------------- The project
function build(chapters,{aspect=16/9}={}){
 const C=chapters, at=(c,i)=>C[c].lines[i]?C[c].lines[i].start:C[c].start, X=.9;
 const shot=(id,c,shader,render,last=c)=>({id,shader,start:Math.max(0,C[c].start-(c?X:0)),end:C[last].end+(last<C.length-1?X:0),fadeIn:c?X*2:0,fadeOut:last<C.length-1?X*2:0,render,c});
 // A shot cut inside a section: from time a to b, dissolving over f seconds at each end.
 const part=(id,c,shader,a,b,render)=>({id,shader,start:a,end:b,fadeIn:a>0?1:0,fadeOut:1,render,c});
 const cams=C.map(()=>new Camera()), shots=[];
 const rnd=(()=>{let s=7;return ()=>{s=(s*16807)%2147483647;return (s-1)/2147483646;};})();
 const orbit=(cam,dist,el,az,target=[0,0,0],fov=40)=>cam.set({pos:[target[0]+Math.sin(az)*dist*Math.cos(el),target[1]+dist*Math.sin(el),target[2]+Math.cos(az)*dist*Math.cos(el)],target,fov});
 // Galaxies: ours at the centre, and others scattered round it (comoving places; the shader scales them by uA).
 const field=(()=>{const g=new Float32Array(160),n=new Float32Array(160),pos=[];
  const put=(i,p,r,nr,seed)=>{g.set([...p,r],i*4);const l=Math.hypot(...nr);n.set([nr[0]/l,nr[1]/l,nr[2]/l,seed],i*4);pos.push(p);};
  put(0,[0,0,0],2.6,[.25,1,.35],2.31);
  for(let i=1;i<40;i++){let p;do{const u=rnd()*2-1,a=rnd()*Math.PI*2,r=7+Math.pow(rnd(),.7)*28;p=[Math.sqrt(1-u*u)*Math.cos(a)*r,u*r*.55,Math.sqrt(1-u*u)*Math.sin(a)*r];}while(pos.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2])<4.5));
   put(i,p,i===7?2.3:.7+rnd()*.9,i===7?[.15,1,.25]:[rnd()-.5,rnd()-.5,rnd()-.5],i===7?9.13:1+rnd()*40);}
  return {g,n,pos};})();
 // A flatter layout for growing space: galaxies near a plane, on a loose grid.
 const plane=(()=>{const g=new Float32Array(160),n=new Float32Array(160),pos=[];let i=0;
  for(let a=-2;a<=5&&i<40;a++)for(let b=-3;b<=1&&i<40;b++){const p=a===0&&b===0?[0,0,0]:[a*6+(rnd()-.5)*2.4,(rnd()-.5)*1.2,b*6+(rnd()-.5)*2.4];
   const big=(a===0&&b===0)||(a===3&&b===0);g.set([...p,big?1.6:.6+rnd()*.7],i*4);const nr=big?[0,1,.35]:[rnd()-.5,1.4,rnd()-.5],l=Math.hypot(...nr);n.set([nr[0]/l,nr[1]/l,nr[2]/l,a===0&&b===0?2.31:big?9.13:1+rnd()*40],i*4);pos.push(p);i++;}
  return {g,n,pos,count:i};})();
 const F=(o)=>({uG:field.g,uGn:field.n,uCount:40,uRef:[0,0,0],uMark:[0,0,0,0],uMark2:[0,0,0,0],uA:1,uA0:1,uTrail:0,uBack:1,uGal:1,uHeat:0,uTemp:3,uFog:0,uWarm:0,uGrid:0,uGridS:6,uWave:[0,1,500,0],uWaveA:[0,0,0],uWaveB:[0,0,0],...o});
 // The universe's scale over a shot: growing at a steady share per second, as seen across a few seconds of trail.
 const grow=(T,t0,rate=.035)=>1+rate*Math.max(0,T-t0);

 // 1. A still night sky; then, from far outside, the galaxies streaming apart.
 shots.push(part('sky',0,SKY,0,at(0,1)+.6,(t,T)=>{const cam=cams[0],tilt=keys(T,[[0,.3],[at(0,1)+.6,.38]]);cam.set({pos:[0,.02,0],target:[Math.sin(.15),tilt,Math.cos(.15)],fov:56});
  return {...cam.uniforms(),uHiss:0,uAnt:0,uMW:1};}));
 const s0=at(0,1),still=at(0,3);
 const aField=T=>grow(Math.min(T,still+1.5),s0-.4,.045);
 shots.push(part('field',0,FIELD,at(0,1)-.6,C[0].end+X,(t,T)=>{const cam=cams[0];orbit(cam,36,.32,.4+(T-s0)*.012,[0,0,0],44);
  const a=aField(T),a0=aField(T-2.5);return {...cam.uniforms(),...F({uA:a,uA0:a0,uTrail:prog(T,s0+.6,s0+2)*(1-prog(T,still-.5,still+1.2)),uMark:[0,0,0,prog(T,s0+.8,s0+1.8)*(1-prog(T,still,still+1))]})};}));
 shots[1].fadeOut=X*2;

 // 2. Sunlight through a prism; close in on the card, where dark lines cross the rainbow.
 const cardC=[.081+.943-.105*.333,.25,.0676-.333-.105*.943],toPrism=[-.943,0,.333];
 shots.push(shot('prism',1,PRISM,(t,T)=>{const cam=cams[1],k=prog(T,at(1,1)-.3,at(1,1)+3.6,'inOutCubic');
  const p0=[.32,.86,1.72],t0=[.42,.16,-.08],p1=[cardC[0]+toPrism[0]*.5+.333*.04,.38,cardC[2]+toPrism[2]*.5+.943*.04],t1=[cardC[0]+.333*.04,.25,cardC[2]+.943*.04];
  const drift=(T-C[1].start)*.004;cam.set({pos:p0.map((v,i)=>v+(p1[i]-v)*k+(i===0?drift:0)),target:t0.map((v,i)=>v+(t1[i]-v)*k),fov:keys(k,[[0,42],[1,38]])});
  return {...cam.uniforms(),uFan:1-k,uOther:1,uNa:prog(T,at(1,2)+.3,at(1,2)+1.2)*(1-prog(T,at(1,3)+.6,at(1,3)+1.4)),uHyd:prog(T,at(1,3)+.6,at(1,3)+1.6)};}));

 // 3. A galaxy's light: hydrogen's lines slid toward red, for one galaxy after another; then a wave stretching.
 const zOf=T=>T<at(2,2)?.065*prog(T,at(2,1)-.2,at(2,1)+2.2,'inOutCubic'):T<at(2,2)+3?.065+(.04-.065)*prog(T,at(2,2)+.3,at(2,2)+1.4):.04+(.09-.04)*prog(T,at(2,2)+3,at(2,2)+4.1);
 shots.push(shot('shift',2,SHIFT,(t,T)=>{const m1=prog(T,at(2,2)+.2,at(2,2)+1.4),m2=prog(T,at(2,2)+2.9,at(2,2)+4.1);
  return {uSeedA:m1<1?7.7:12.4,uSeedB:m1<1?12.4:21.9,uMix:m1<1?m1:m2,uZ:zOf(T),uLab:prog(T,C[2].start+.6,C[2].start+2),uBand:prog(T,C[2].start+1.4,C[2].start+2.8),
   uLink:prog(T,at(2,1)+1.4,at(2,1)+2.6),uGhost:prog(T,at(2,1),at(2,1)+1),uWaveOn:prog(T,at(2,4)-.2,at(2,4)+.8),uWaveNm:keys(T,[[at(2,4)+.6,460],[at(2,4)+2.8,650,'inOutCubic'],[at(2,5)-.5,650],[at(2,5)+.4,470],[at(2,5)+3.4,650,'inOutCubic']])};}));

 // 4. Waves from a moving source: a siren passing you; then light, redder behind.
 const dop=(t0,x0,speed,emitEvery=.42)=>{const C0=.3;const pos=[],v=T=>speed(T)*C0;
  return T=>{const out=new Float32Array(160);let x=x0,tt=t0,k=0;const ems=[];
   for(let s=t0;s<=T;s+=1/48){const vv=v(s);if(s>=tt){ems.push([x,0,s,vv/C0]);tt+=emitEvery;}x+=vv/48;}
   const last=ems.slice(-40);last.forEach((e,i)=>out.set(e,i*4));return {uE:out,uNE:last.length,uSrc:[x,0],uC:C0,uTS:T};};};
 const siren=dop(C[3].start-X,-1.05,()=>.24,.62);
 shots.push(part('siren',3,DOPPLER,C[3].start-X,at(3,4)+.6,(t,T)=>({...siren(T),uLight:0,uMarks:prog(T,at(3,2)-.4,at(3,2)+.4),uYouOn:prog(T,C[3].start,C[3].start+1),uYou:[-.25,-.12]})));
 shots[shots.length-1].fadeIn=X*2;
 const light=dop(at(3,4)-.6-4,-.8,T=>.25+.15*prog(T,at(3,5)+.2,at(3,5)+2.2));
 shots.push(part('light',3,DOPPLER,at(3,4)-.6,C[3].end+X,(t,T)=>({...light(T),uLight:1,uMarks:0,uYouOn:1,uYou:[-.78,-.12]})));
 shots[shots.length-1].fadeOut=X*2;

 // 5. Light spreading: through a hole one step away, onto four squares two steps away. Then stars that pulse.
 shots.push(part('lamp',4,LAMP,C[4].start-X,at(4,3)+.6,(t,T)=>{const cam=cams[4],az=keys(T,[[C[4].start,.0],[at(4,3)+.6,.18]]);
  cam.set({pos:[.2+az,.95,2.75],target:[1.08,-.05,-.1],fov:44});
  return {...cam.uniforms(),uHole:prog(T,at(4,1)-.4,at(4,1)+.6),uWall:prog(T,at(4,1)+.2,at(4,1)+1.4),uHaze:prog(T,at(4,1)-.2,at(4,1)+1.4)};}));
 shots[shots.length-1].fadeIn=X*2;
 const cep=(T,P,ph=0)=>{const x=((T/P+ph)%1+1)%1;return x<.18?.35+.65*prog(x,0,.18):.35+.65*(1-prog(x,.18,1));};
 shots.push(part('pulse',4,PULSE,at(4,3)-.6,at(5,1)+.6,(t,T)=>{const g=prog(T,at(5,0)-.3,at(5,0)+1.8,'inOutCubic');
  return {uFar:prog(T,at(4,5)+.4,at(4,5)+2.6,'inOutCubic'),uTr:prog(T,at(4,3)+1,at(4,3)+2)*(1-prog(T,at(4,5),at(4,5)+.8)),uA:2.2*cep(T,3.2),uB:.8*cep(T,1.3,.4),uOnA:prog(T,at(4,3)-.4,at(4,3)+.6),uOnB:prog(T,at(4,3)+.4,at(4,3)+1.4),uGal:g,uZoom:keys(T,[[at(5,0)-.3,1.6],[at(5,1)+.6,1.15]]),uCep:cep(T,3.2),uCepP:[.16,-.04]};}));
 shots[shots.length-1].fadeOut=X*2;

 // 6. Hubble's plot: speed against distance, close to a straight line.
 const pts=(()=>{const a=new Float32Array(96),r=[];for(let i=0;i<24;i++){const u=.06+.9*Math.pow(rnd(),.85),v=Math.max(.02,u*(1+(rnd()-.5)*.42));r.push([u,Math.min(v,.98)]);}r.sort((a,b)=>a[0]-b[0]);return r;})();
 shots.push(part('plot',5,PLOT,at(5,1)-.6,C[5].end+X,(t,T)=>{const a=new Float32Array(96);pts.forEach(([u,v],i)=>a.set([u,v,prog(T,at(5,1)+.4+i*.16,at(5,1)+.9+i*.16),0],i*4));
  return {uP:a,uAxes:prog(T,at(5,1)-.4,at(5,1)+.6),uLine:prog(T,at(5,2)-.2,at(5,2)+2.2,'inOutCubic'),uGuide:prog(T,at(5,3)-.2,at(5,3)+.9)*(1-prog(T,at(5,4)-.8,at(5,4))),uSlope:prog(T,at(5,4)+.2,at(5,4)+1.2),uDim:Math.max(.35*prog(T,at(5,4),at(5,4)+.8),.6*prog(T,at(5,5)+.6,at(5,5)+2.4))};}));
 shots[shots.length-1].fadeOut=X*2;

 // 7. Raisin bread rising: every gap grows by the same share, seen from any raisin.
 const R=new Float32Array(96),rp=[[-.45,.27],[-.1,.28],[.25,.29]];
 (()=>{const list=[...rp];for(let i=0;list.length<20&&i<400;i++){const p=[(rnd()*2-1)*.74,.07+rnd()*.5];if(list.every(q=>Math.hypot(q[0]-p[0],q[1]-p[1])>.15))list.push(p);}
  list.forEach((p,i)=>R.set([p[0],p[1],.022+rnd()*.008,0],i*4));R.count=list.length;})();
 const S=T=>1+.9*prog(T,at(6,0)+.8,at(6,5),'inOutSine');
 shots.push(part('loaf',6,LOAF,C[6].start-X,at(6,5)+.6,(t,T)=>{const cam=cams[6],az=(T-C[6].start)*.006,zoom=Math.pow(S(T),.55);
  cam.set({pos:[(1.05+az*2)*zoom,.66*zoom,(1.95-az)*zoom],target:[-.04,-.05*zoom,-.22],fov:36});
  const second=T>=at(6,4);const sw=second?at(6,4):at(6,2);
  return {...cam.uniforms(),uGhostLoaf:prog(T,at(6,1)-.2,at(6,1)+.8)*(1-prog(T,at(6,5)-1,at(6,5))),uS:S(T),uS0:S(sw),uR:R,uNR:R.count,uSel:second?2:0,uPick:second?[1,0,0]:[1,2,0],uArrows:prog(T,at(6,2)-.3,at(6,2)+.5)*(second?prog(T,at(6,4),at(6,4)+.6)*(1-prog(T,at(6,5)-1.2,at(6,5)-.3)):1-prog(T,at(6,4)-.5,at(6,4)))};}));
 shots[shots.length-1].fadeIn=X*2;
 // ...and back to the galaxies: the same pattern from ours, then from another.
 const other=field.pos[7];
 shots.push(part('nocentre',6,FIELD,at(6,5)-.6,C[6].end+X,(t,T)=>{const k=prog(T,at(6,5)+1.2,at(6,5)+3,'inOutCubic'),ref=other.map(v=>v*k);
  const cam2=new Camera();orbit(cam2,27,.3,.9+(T-at(6,5))*.02,ref,50);
  const a=grow(T,at(6,5)-1,.045),a0=grow(T-2.5,at(6,5)-1,.045);return {...cam2.uniforms(),...F({uRef:ref,uA:a,uA0:a0,uTrail:prog(T,at(6,5),at(6,5)+1),uMark:[...ref,prog(T,at(6,5)-.2,at(6,5)+.6)]})};}));
 shots[shots.length-1].fadeOut=X*2;

 // 8. Space itself growing: a grid that stretches, and a light wave stretched with it.
 const far=plane.pos.reduce((b,p)=>Math.hypot(p[0]-18,p[2])<Math.hypot(b[0]-18,b[2])?p:b,[0,0,0]);
 const aSpace=T=>1+.75*prog(T,at(7,1)-.4,C[7].end,'linear');
 shots.push(shot('space',7,FIELD,(t,T)=>{const cam=cams[7],dz=(T-C[7].start)*.06;cam.set({pos:[13,11,29+dz],target:[13,-1,-3],fov:46});
  const a=aSpace(T),aE=aSpace(at(7,2)-.3),k=prog(T,at(7,2)-.3,at(7,4),'linear'),L=far[0]*a;
  return {...cam.uniforms(),...F({uG:plane.g,uGn:plane.n,uCount:plane.count,uA:a,uGrid:prog(T,at(7,1)-.6,at(7,1)+.6),uGridS:6*a,
   uWave:[prog(T,at(7,2)-.3,at(7,2)+.5),2.2*a/aE,Math.min(445*a/aE,760),L*(1-k)],uWaveA:[far[0]*a,0,far[2]*a],uWaveB:[0,0,0],
   uMark:[0,0,0,prog(T,at(7,2)-1,at(7,2))],uMark2:[far[0]*a,far[1]*a,far[2]*a,prog(T,at(7,2)-1,at(7,2))*(1-prog(T,at(7,4)+.4,at(7,4)+1.2))]})};}));

 // 9. Running it backwards: the galaxies crowd together, and space fills with hot, glowing gas.
 const aBack=T=>keys(T,[[C[8].start+.4,1],[at(8,2),.3,'inOutSine'],[at(8,3)+.8,.035,'inOutCubic']]);
 shots.push(part('back',8,FIELD,C[8].start-X,at(8,5)+.6,(t,T)=>{const cam=cams[8];orbit(cam,46,.3,.6-(T-C[8].start)*.03,[0,0,0],46);const a=aBack(T),hot=prog(a,.22,.04);
  const a0=aBack(T-2.2);return {...cam.uniforms(),...F({uA:a,uA0:a0,uTrail:prog(T,C[8].start+1,C[8].start+2.5)*prog(a,.06,.3),uWarm:prog(a,.9,.25)*(1-prog(T,at(8,3)-.4,at(8,4))),uGal:prog(a,.06,.25),uBack:1-hot*.6,uHeat:hot,uTemp:keys(T,[[at(8,2),1.2],[at(8,4),3.1],[at(8,5),3.1]]),uFog:prog(T,at(8,3)-.6,at(8,3)+.4)})};}));
 // ...then the glow from every direction: a shell of it round a tiny Earth, cooling.
 shots.push(part('shell',8,GLOWS,at(8,5)-.6,C[8].end+X,(t,T)=>{const cam=new Camera(),z=keys(T,[[at(8,5)-.6,.45],[C[8].end+X,.62]]);cam.set({pos:[0,.04,z],target:[0,0,0],fov:50});
  return {...cam.uniforms(),uShell:1,uShellT:keys(T,[[at(8,5),3.1],[C[8].end+X,1.6]]),uStretch:0,uWaveOn:0,uSphere:0,uSpin:0,uGlowBg:0};}));
 shots[shots.length-1].fadeOut=X*2;

 // 10. The glow found: a horn antenna under the stars; the glow's waves stretched into microwaves; the whole sky's map.
 shots.push(part('antenna',9,SKY,C[9].start-X,at(9,2)+.6,(t,T)=>{const cam=cams[9],dx=(T-C[9].start)*.01;cam.set({pos:[-.7+dx,.3,.4],target:[.8,1.05,6.4],fov:46});
  return {...cam.uniforms(),uHiss:prog(T,at(9,1)-.3,at(9,1)+1.6),uAnt:1,uMW:.25};}));
 shots[shots.length-1].fadeIn=X*2;
 shots.push(part('glows',9,GLOWS,at(9,2)-.6,at(9,4)+.6,(t,T)=>{const cam=new Camera();cam.set({pos:[0,.6,keys(T,[[at(9,3),9],[at(9,4)+.6,3.4]])],target:[0,0,0],fov:38});
  return {...cam.uniforms(),uShell:0,uShellT:1,uStretch:prog(T,at(9,2)+.3,at(9,3)+.4,'inOutSine'),uWaveOn:1-prog(T,at(9,3)+.2,at(9,3)+1),uGlowBg:1-prog(T,at(9,2)+2,at(9,3)+.4),uSphere:prog(T,at(9,3)+.4,at(9,3)+1.6),uSpin:T*.05};}));
 shots.push(part('final',9,FIELD,at(9,4)-.6,C[9].end,(t,T)=>{const cam=cams[9];orbit(cam,36+(T-at(9,4))*.6,.3,.2+(T-at(9,4))*.02,[0,0,0],44);
  const a=grow(T,at(9,4)-2,.045),a0=grow(T-2.5,at(9,4)-2,.045);return {...cam.uniforms(),...F({uA:a,uA0:a0,uTrail:prog(T,at(9,4)+.4,at(9,4)+1.6)})};}));
 shots[shots.length-1].fadeOut=0;

 // Captions: only names and counts the picture cannot give.
 const P=(cam,p)=>cam.project(p,aspect);
 // A point on the rim of the ring the shader draws round a galaxy, toward screen direction dir.
 const rim=(cam,w,dir)=>{const q=P(cam,w);if(!q)return null;const d=Math.hypot(...w.map((v,i)=>v-cam.pos[i])),r=Math.max(3.4/d,16*2*cam.tan/720)/(2*cam.tan),l=Math.hypot(...dir);return [q[0]+dir[0]/l*r/aspect,q[1]+dir[1]/l*r];};
 const captions=t=>{const out=[];const fade=(a,b)=>Math.min(prog(t,a,a+.5),1-prog(t,b-.5,b));
  const add=(text,p,{dy=0,dx=0,a=1,ax,ay}={})=>{if(p&&a>.01)out.push({text,x:p[0]+dx,y:p[1]+dy,alpha:a,align:'center',...(ax!==undefined?{ax,ay}:{})});};
  const point=(text,target,dir,a)=>{if(!target||a<=.01)return;out.push({text,x:target[0]+dir[0],y:target[1]+dir[1],ax:target[0],ay:target[1],alpha:a,align:'center'});};
  for(const s of shots){if(t<s.start||t>s.end)continue;const u=s.render(t-s.start,t),cam=new Camera();
   if(u&&u.uCamPos){cam.pos=u.uCamPos;cam.f=u.uCamFwd;cam.r=u.uCamRight;cam.u=u.uCamUp;cam.tan=u.uTanHalf;}
   if(s.id==='field')point('our galaxy',rim(cam,[0,0,0],[1,-1.2]),[.06,-.07],fade(at(0,1)+1,at(0,3)));
   if(s.id==='space')point('our galaxy',rim(cam,[0,0,0],[1,-1.2]),[.05,-.06],fade(at(7,2)-.6,C[7].end));
   if(s.id==='prism'){const tan=th=>Math.tan(-(1.5046+4200/(th*th)-1.5185)*28),X0=[.081+.943,.25,.0676-.333],T0=[.333,0,.943];
    const onCard=l=>{const u=tan(l);return P(cam,[X0[0]+T0[0]*u,.203,X0[2]+T0[2]*u]);};
    point('sodium',onCard(589.3),[0,.1],fade(at(1,2)+.6,at(1,3)+1.2));
    point('hydrogen',onCard(486.1),[0,.1],fade(at(1,3)+.9,C[1].end));}
   if(s.id==='shift'){add('hydrogen in a lab',[.5,.5+.19-.072],{a:fade(C[2].start+1,at(2,4)-.2)});add('a distant galaxy',[.5,.5+.33+.075],{a:fade(C[2].start+1.8,at(2,4)-.2)});}
   if(s.id==='siren')point('you',[.5+(-.25)/aspect,.5+.12],[0,.07],fade(C[3].start+.6,at(3,4)+.6));
   if(s.id==='light')point('you',[.5+(-.78)/aspect,.5+.12],[0,.07],fade(at(3,4),C[3].end));
   if(s.id==='lamp'){add('1 square',P(cam,[1,.62,0]),{a:fade(at(4,1)+.6,at(4,3))});add('4 squares',P(cam,[2,.62,0]),{a:fade(at(4,1)+1,at(4,3))});}
   if(s.id==='pulse')point('pulsing star',[.5+.16/aspect,.5+.04],[.15,-.3],fade(at(5,0)+1.6,at(5,1)+.4));
   if(s.id==='plot'){const at2=(x,y)=>[.5+(-.55+x*1.12)/aspect,.5-(-.33+y*.66)];const a=fade(at(5,1),C[5].end);
    add('distance',at2(.5,-.12),{a});add('speed',at2(-.08,.5),{a,dx:-.02});
    const g=fade(at(5,3),at(5,4));add('1',at2(.4,-.035),{a:g});add('2',at2(.8,-.035),{a:g});
    const sl=fade(at(5,4)+.6,C[5].end);add('210 km/s faster',at2(.47,.27),{a:sl});add('10 million light years',at2(.3,.13),{a:sl});}
   if(s.id==='loaf'){const sp=u.uS,sel=u.uSel,base=[0,-.32];const rpos=i=>[base[0]+R[i*4]*sp,base[1]+R[i*4+1]*sp,0];
    const a=u.uArrows;if(a>.02){const picks=[u.uPick[0],u.uPick[1]];picks.forEach((j,k)=>{const n=Math.abs(j-sel),m=rpos(j),q=P(cam,[m[0],m[1]+(n===1?.08:-.08),0]);add(n===1?'1 gap':'2 gaps',q,{a});});}}
   if(s.id==='back')add('13.8 billion years ago',[.5,.86],{a:fade(at(8,3)+.4,at(8,4)+.4)});
   if(s.id==='shell')point('us',[.5,.5],[.035,-.075],fade(at(8,5)+1.4,C[8].end));
   if(s.id==='antenna')point('radio antenna',P(cam,[1.25+.95-.8*1.7,-.15+.72+.48*1.7+.45,6.4+.55-.36*1.7]),[-.1,-.12],fade(C[9].start+.4,at(9,1)));
   if(s.id==='glows')add('mapped in microwaves',[.5,.935],{a:fade(at(9,3)+1.4,at(9,4)+.4)});
  }
  return out;};
 const poster={id:'poster',shader:FIELD,start:0,end:1e9,render:()=>{const cam=new Camera();orbit(cam,34,.3,.55,[0,0,0],44);return {...cam.uniforms(),...F({uA:1.3,uA0:1.12,uTrail:1})};}};
 const flat=t=>shots.some(s=>['shift','plot','siren','light','prism','loaf','lamp'].includes(s.id)&&t>s.start&&t<s.end);
 const look=t=>({exposure:-.25,bloom:flat(t)?.03:.05,halation:flat(t)?.015:.06,grain:.016,vignette:.34,aberration:.12,saturation:1,contrast:1.05});
 return {shots,captions,look,samples:4,duration:C[C.length-1].end,posterProject:{shots:[poster],look:()=>({exposure:-.2,bloom:.05,halation:.08,grain:.016,vignette:.34,aberration:.12,contrast:1.05}),samples:8}};
}
(window.CouncilFilms||(window.CouncilFilms={})).expansion={build,textures:[]};
})();
