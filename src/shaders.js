// Every surface in Wet Paint is drawn by these shaders. The scene pass writes colour into one
// target and view-space normal + paint coverage into a second; the post pass turns that into
// pencil on paper where the page is still blank and watercolour with a painter's line where it
// has been painted.
import * as THREE from 'three';

export const MAX_BLOOMS=14;

// Uniforms shared by every material in the scene.
export const shared={
  uTime:{value:0},
  tNoise:{value:null},
  uSunDir:{value:new THREE.Vector3(.4,.7,.5).normalize()},
  uSunColor:{value:new THREE.Color(1,.98,.92)},
  uShadowTint:{value:new THREE.Color(.62,.68,.9)},
  uHaze:{value:new THREE.Color(.84,.87,.9)},
  uHazeDensity:{value:.0022},
  uLamp:{value:0},
  uBlooms:{value:Array.from({length:MAX_BLOOMS},()=>new THREE.Vector4(0,0,0,0))},
  uBloomCount:{value:0},
  uShadowMap:{value:null},
  uShadowMatrix:{value:new THREE.Matrix4()},
  uShadowNear:{value:null},
  uShadowNearMatrix:{value:new THREE.Matrix4()},
  uCamera:{value:new THREE.Vector3()},
  uSkyWash:{value:0},
};

const common=/* glsl */`
float down(float hi,float lo,float x){return 1.0-smoothstep(lo,hi,x);}
uniform float uTime;
uniform sampler2D tNoise;
uniform vec3 uSunDir, uSunColor, uShadowTint, uHaze;
uniform float uHazeDensity, uLamp, uSkyWash;
uniform vec4 uBlooms[${MAX_BLOOMS}];
uniform int uBloomCount;
uniform sampler2D uShadowMap, uShadowNear;
uniform mat4 uShadowMatrix, uShadowNearMatrix;
uniform vec3 uCamera;

// How much of the page has been painted at this point of the world: the union of the wet
// blooms, each with a wobbling edge so the front spreads like water into paper.
float coverage(vec3 wp){
  float c=0.0;
  for(int i=0;i<${MAX_BLOOMS};i++){
    if(i>=uBloomCount)break;
    vec4 b=uBlooms[i];
    float d=distance(wp.xz,b.xy);
    float n=texture(tNoise,wp.xz*0.012+b.xy*0.0013).g-0.5;
    float e=b.z+n*(6.0+b.z*0.07);
    c=max(c,down(e+1.5,e-1.5,d)*b.w);
  }
  return c;
}

float shadowTaps(sampler2D map,vec3 s,vec2 wob,float texel,float bias){
  vec2 uv=s.xy*0.5+0.5;
  float z=s.z*0.5+0.5-bias;
  vec2 t=vec2(texel*0.5);
  float lit=0.0;
  lit+=step(z,texture(map,uv+wob+t).r);
  lit+=step(z,texture(map,uv+wob-t).r);
  lit+=step(z,texture(map,uv+wob+vec2(t.x,-t.y)).r);
  lit+=step(z,texture(map,uv+wob+vec2(-t.x,t.y)).r);
  return step(1.5,lit);
}
float castShadow(vec4 sc,vec3 wp){
  vec2 wob=(texture(tNoise,wp.xz*0.05+wp.y*0.03).gg-0.5)*0.0025;
  vec4 nc=uShadowNearMatrix*vec4(wp+vec3(0.0),1.0);
  vec3 n=nc.xyz/nc.w;
  if(all(lessThan(abs(n.xy),vec2(0.97))))return shadowTaps(uShadowNear,n,wob*0.25,1.0/2048.0,0.0025);
  vec3 s=sc.xyz/sc.w;
  if(any(greaterThan(abs(s.xy),vec2(0.995))))return 1.0;
  return shadowTaps(uShadowMap,s,wob*0.25,1.0/4096.0,0.0009);
}

vec3 hazed(vec3 col,vec3 wp){
  float dist=length(wp-uCamera);
  float h=1.0-exp(-dist*uHazeDensity);
  return mix(col,uHaze,pow(h,1.15)*0.9);
}
`;

const paintedVert=/* glsl */`
${common}
uniform vec4 uAnim; // mode, frequency, amplitude, phase
#ifdef USE_SWAY
in float sway;
#endif
out vec3 vColor;
out vec3 vNormalV;
out vec3 vNormalW;
out vec3 vWorld;
out vec4 vShadow;
out vec2 vUv;
void main(){
  vec3 p=position;
  vec3 n=normal;
  float phase=uAnim.w;
  #ifdef USE_INSTANCING
    phase+=instanceMatrix[3].x*0.37+instanceMatrix[3].z*0.23;
  #endif
  #ifdef USE_SWAY
    if(uAnim.x>0.5&&uAnim.x<1.5){ // hem and hair flutter
      float f=sin(uTime*uAnim.y+p.x*6.0+p.y*3.0+phase)*uAnim.z*sway;
      p+=vec3(f*0.35,f*0.3,-abs(f)*0.6);
    } else if(uAnim.x>1.5&&uAnim.x<2.5){ // wing beat
      float f=sin(uTime*uAnim.y+phase);
      p.y+=f*uAnim.z*sway;
    }
  #endif
  if(uAnim.x>2.5){ // trees lean in the wind
    float f=sin(uTime*uAnim.y+phase)*uAnim.z;
    p.x+=f*p.y*p.y*0.012;
    p.z+=f*p.y*0.03;
  }
  mat4 m=modelMatrix;
  #ifdef USE_INSTANCING
    m=modelMatrix*instanceMatrix;
  #endif
  vec4 wp=m*vec4(p,1.0);
  vec3 nw=normalize(mat3(m)*n);
  vWorld=wp.xyz;
  vNormalW=nw;
  vNormalV=normalize(mat3(viewMatrix)*nw);
  vColor=color;
  #ifdef USE_INSTANCING_COLOR
    vColor*=instanceColor;
  #endif
  vUv=uv;
  vShadow=uShadowMatrix*vec4(wp.xyz+nw*0.35,1.0);
  vWorld=wp.xyz+nw*0.12;
  gl_Position=projectionMatrix*viewMatrix*wp;
}
`;

const paintedFrag=/* glsl */`
${common}
uniform float uFlat;      // 1: no shading bands (faces, paper-flat things)
uniform float uInSky;     // 1: painted with the sky's wash rather than the ground's blooms
uniform float uGlow;      // emissive amount at lamp time
uniform vec3 uGlowColor;
in vec3 vColor;
in vec3 vNormalV;
in vec3 vNormalW;
in vec3 vWorld;
in vec4 vShadow;
in vec2 vUv;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outData;
void main(){
  vec3 N=normalize(vNormalW);
  if(!gl_FrontFacing)N=-N;
  float ndl=dot(N,uSunDir);
  float wob=(texture(tNoise,vWorld.xz*0.03+vWorld.y*0.021).r-0.5)*0.16;
  float l=ndl+wob;
  float w=max(fwidth(l)*1.3,0.035);
  float lit=smoothstep(0.18-w,0.18+w,l);
  float mid=smoothstep(-0.28-w,-0.28+w,l);
  float sh=castShadow(vShadow,vWorld);
  float level=mix(0.0,mid*0.5+lit*0.5,sh);
  level=mix(level,1.0,uFlat);
  vec3 base=vColor;
  vec3 shadowC=base*uShadowTint*0.88+vec3(0.01,0.015,0.05);
  vec3 midC=base*vec3(0.9,0.91,0.96);
  vec3 litC=mix(base,vec3(1.0),0.07)*uSunColor;
  vec3 col=level<0.5?mix(shadowC,midC,level*2.0):mix(midC,litC,(level-0.5)*2.0);
  col+=vec3(0.04,0.05,0.08)*max(N.y,0.0)*(1.0-level)*0.5;
  col=hazed(col,vWorld);
  col=mix(col,uGlowColor,uGlow*uLamp);
  float c=mix(coverage(vWorld),smoothstep(0.35,0.75,uSkyWash+(texture(tNoise,vWorld.xz*0.002).g-0.5)*0.3),uInSky);
  float wet=smoothstep(0.1,0.6,c)*down(1.0,0.9,c);
  col*=1.0-wet*0.35;
  outColor=vec4(col,1.0);
  outData=vec4(normalize(vNormalV)*0.5+0.5,c);
}
`;

export function paintedMaterial(opts={}){
  const m=new THREE.ShaderMaterial({
    glslVersion:THREE.GLSL3,
    vertexShader:paintedVert,
    fragmentShader:paintedFrag,
    uniforms:Object.assign({
      uAnim:{value:new THREE.Vector4(opts.anim||0,opts.freq||0,opts.amp||0,opts.phase||0)},
      uFlat:{value:opts.flat?1:0},
      uInSky:{value:opts.inSky?1:0},
      uGlow:{value:opts.glow||0},
      uGlowColor:{value:new THREE.Color(opts.glowColor||0xffd27a)},
    },shared),
    vertexColors:true,
    side:opts.side||THREE.FrontSide,
  });
  if(opts.sway)m.defines={USE_SWAY:''};
  return m;
}

// Windows: an instanced quad with a frame (instance colour), mullions and glass that warms at dusk.
const windowFrag=/* glsl */`
${common}
in vec3 vColor;
in vec3 vNormalV;
in vec3 vNormalW;
in vec3 vWorld;
in vec4 vShadow;
in vec2 vUv;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outData;
void main(){
  vec2 uv=vUv;
  float edge=min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y));
  float frame=1.0-step(0.1,edge);
  float mullion=step(abs(uv.x-0.5),0.035)+step(abs(uv.y-0.55),0.03);
  float seed=fract(sin(dot(floor(vWorld.xz*7.0)+floor(vWorld.y*3.0),vec2(12.9898,78.233)))*43758.5453);
  float on=step(0.35,seed);
  vec3 N=normalize(vNormalW);
  float sh=castShadow(vShadow,vWorld);
  float lit=smoothstep(0.1,0.3,dot(N,uSunDir))*sh;
  vec3 glass=mix(vec3(0.30,0.36,0.46),vec3(0.55,0.66,0.78),lit);
  float gleam=step(0.72,texture(tNoise,uv*0.5+vWorld.xz*0.01).r)*lit;
  glass=mix(glass,vec3(0.85,0.9,0.95),gleam*0.6);
  vec3 lamp=vec3(1.0,0.78,0.42);
  glass=mix(glass,lamp,uLamp*on);
  vec3 frameC=vColor*mix(0.85,1.0,lit);
  vec3 col=mix(glass,frameC,max(frame,mullion*(1.0-frame)));
  col=mix(hazed(col,vWorld),col,uLamp*on*0.6);
  float c=coverage(vWorld);
  outColor=vec4(col,1.0);
  outData=vec4(normalize(vNormalV)*0.5+0.5,c);
}
`;
export function windowMaterial(){
  return new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:paintedVert,fragmentShader:windowFrag,
    uniforms:Object.assign({uAnim:{value:new THREE.Vector4()}},shared),vertexColors:true});
}

// The sea: a lathe of slow swells, painted in three bands with the horizontal white strokes of a
// brush dragged across the paper, and a glitter path under a low sun.
const seaVert=/* glsl */`
${common}
out vec3 vWorld;
out vec3 vNormalV;
out vec3 vNormalW;
float swell(vec2 p){
  return sin(p.x*0.07+uTime*0.7)*0.32+sin(p.y*0.11-uTime*0.55+p.x*0.02)*0.26+(texture(tNoise,p*vec2(0.0008,0.005)+uTime*0.002).r-0.5)*0.22;
}
void main(){
  vec4 wp=modelMatrix*vec4(position,1.0);
  float h=swell(wp.xz);
  float hx=swell(wp.xz+vec2(1.5,0.0));
  float hz=swell(wp.xz+vec2(0.0,1.5));
  wp.y+=h;
  vec3 n=normalize(vec3(h-hx,1.5,h-hz));
  vWorld=wp.xyz;
  vNormalW=n;
  vNormalV=normalize(mat3(viewMatrix)*n);
  gl_Position=projectionMatrix*viewMatrix*wp;
}
`;
const seaFrag=/* glsl */`
${common}
uniform vec3 uSeaDeep, uSeaLit;
in vec3 vWorld;
in vec3 vNormalV;
in vec3 vNormalW;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outData;
void main(){
  vec3 N=normalize(vNormalW);
  // the bands follow the wave slope toward the sun, whatever the hour
  float ndl=dot(N,uSunDir)-uSunDir.y;
  float wob=(texture(tNoise,vWorld.xz*vec2(0.01,0.05)+vec2(uTime*0.01,0.0)).r-0.5)*0.06;
  float l=ndl+wob;
  float w=max(fwidth(l)*1.5,0.02);
  float lit=smoothstep(0.07-w,0.07+w,l);
  float mid=smoothstep(-0.09-w,-0.09+w,l);
  vec3 col=mix(uSeaDeep,mix(uSeaDeep,uSeaLit,0.55),mid);
  col=mix(col,uSeaLit,lit);
  // strokes: long thin horizontals
  float s=texture(tNoise,vec2(vWorld.x*0.0025+uTime*0.004,vWorld.z*0.06-uTime*0.01)).b;
  float stroke=smoothstep(0.66,0.72,s)*down(0.78,0.73,s);
  col=mix(col,vec3(0.93,0.96,0.97),stroke*0.45*(0.4+0.6*mid));
  // glitter path under the sun
  vec3 V=normalize(uCamera-vWorld);
  vec3 R=reflect(-V,N);
  float g=pow(max(dot(R,uSunDir),0.0),48.0);
  float sparkle=step(0.6,texture(tNoise,vWorld.xz*0.15+uTime*0.05).b);
  col=mix(col,vec3(1.0,0.97,0.9),g*sparkle*0.9*(1.0-uSunDir.y*0.6));
  // foam where the water meets the quay and the beach
  float shore=down(14.0,0.0,abs(vWorld.z))*down(130.0,80.0,abs(vWorld.x));
  float foam=step(0.5,texture(tNoise,vWorld.xz*0.05+uTime*0.03).a)*shore;
  col=mix(col,vec3(0.95,0.97,0.96),foam*0.8);
  col=hazed(col,vWorld);
  float c=coverage(vWorld);
  float wet=smoothstep(0.1,0.6,c)*down(1.0,0.9,c);
  col*=1.0-wet*0.3;
  outColor=vec4(col,1.0);
  outData=vec4(normalize(vNormalV)*0.5+0.5,c);
}
`;
export function seaMaterial(){
  return new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:seaVert,fragmentShader:seaFrag,
    uniforms:Object.assign({uSeaDeep:{value:new THREE.Color(.27,.47,.66)},uSeaLit:{value:new THREE.Color(.56,.74,.84)}},shared)});
}

// The sky: a wash poured from the top of the sheet, a sun with a stepped halo, stars when it is late.
const skyVert=/* glsl */`
out vec3 vDir;
void main(){
  vec4 wp=modelMatrix*vec4(position,1.0);
  vDir=normalize(wp.xyz-cameraPosition);
  vec4 cp=projectionMatrix*viewMatrix*wp;
  gl_Position=cp.xyww;
}
`;
const skyFrag=/* glsl */`
${common}
uniform vec3 uSkyTop, uSkyHorizon, uSkyGlow;
uniform float uStars;
in vec3 vDir;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outData;
void main(){
  vec3 d=normalize(vDir);
  float y=max(d.y,0.0);
  float band=pow(y,0.55);
  float n=texture(tNoise,d.xz*2.0/(d.y+0.4)).r-0.5;
  vec3 col=mix(uSkyHorizon,uSkyTop,smoothstep(0.0,1.0,band+n*0.12));
  float sunAmt=max(dot(d,uSunDir),0.0);
  float glow=smoothstep(0.5,1.0,sunAmt);
  col=mix(col,uSkyGlow,floor(glow*3.0+n*0.8)/3.0*0.55);
  float disc=smoothstep(0.9988,0.9994,sunAmt);
  col=mix(col,vec3(1.0,0.98,0.9),disc);
  float star=step(0.9965,texture(tNoise,d.xz*18.0/(d.y+0.3)).b)*uStars*smoothstep(0.05,0.3,d.y);
  col=mix(col,vec3(1.0,0.97,0.9),star);
  float wash=1.0-smoothstep(uSkyWash-0.3,uSkyWash,(1.0-y)+n*0.6);
  outColor=vec4(col,1.0);
  outData=vec4(0.5,0.5,0.5,wash);
}
`;
export function skyMaterial(){
  return new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:skyVert,fragmentShader:skyFrag,side:THREE.BackSide,depthWrite:false,
    uniforms:Object.assign({uSkyTop:{value:new THREE.Color(.49,.64,.86)},uSkyHorizon:{value:new THREE.Color(.87,.9,.9)},uSkyGlow:{value:new THREE.Color(1,.93,.78)},uStars:{value:0}},shared)});
}

// The post pass: pencil where the page is bare, watercolour where it is painted, a painter's
// line over both, and the paper under everything.
const postVert=/* glsl */`
out vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}
`;
const postFrag=/* glsl */`
uniform sampler2D tColor, tData, tDepth, tPaper, tNoise;
uniform vec2 uResolution;
uniform float uTime, uNear, uFar, uLineScale, uFade, uDebug;
uniform vec3 uSunView, uInk, uGraphite, uPaper;
in vec2 vUv;
out vec4 outColor;
float down(float hi,float lo,float x){return 1.0-smoothstep(lo,hi,x);}
float linearDepth(vec2 uv){
  float d=texture(tDepth,uv).r;
  return (uNear*uFar)/(uFar-d*(uFar-uNear));
}
void main(){
  vec2 px=uLineScale/uResolution;
  float boil=floor(uTime*6.0)*0.173;
  vec2 wob=(texture(tNoise,vUv*vec2(2.2,1.3)+boil).rg-0.5)*px*3.2;
  vec2 uv=vUv+wob;
  float dC=linearDepth(uv);
  // Second differences of reciprocal depth: zero across any flat surface however steeply it is
  // seen (1/z is linear in screen space on a plane), large at a step. Scaled to a fraction of
  // the distance so the line does not thicken with depth.
  float wC=1.0/dC;
  float w1=1.0/linearDepth(uv+vec2(-px.x,-px.y)),w2=1.0/linearDepth(uv+vec2(px.x,px.y));
  float w3=1.0/linearDepth(uv+vec2(-px.x,px.y)),w4=1.0/linearDepth(uv+vec2(px.x,-px.y));
  float depthEdge=(abs(w1+w2-2.0*wC)+abs(w3+w4-2.0*wC))*dC/0.03;
  vec3 n1=texture(tData,uv+vec2(-px.x,-px.y)).xyz*2.0-1.0,n2=texture(tData,uv+vec2(px.x,px.y)).xyz*2.0-1.0;
  vec3 n3=texture(tData,uv+vec2(-px.x,px.y)).xyz*2.0-1.0,n4=texture(tData,uv+vec2(px.x,-px.y)).xyz*2.0-1.0;
  float normalEdge=length(n1-n2)+length(n3-n4);
  float far=smoothstep(140.0,700.0,dC);
  float edge=clamp(depthEdge,0.0,1.0)+clamp((normalEdge-0.45-far*0.6)*1.6,0.0,1.0)*0.7;
  float pressure=0.5+0.5*texture(tNoise,vUv*vec2(7.0,4.0)+boil*0.5).r;
  edge=smoothstep(0.22,0.65,edge)*pressure;
  edge*=1.0-far*0.75;
  vec4 data=texture(tData,vUv);
  vec3 nV=data.xyz*2.0-1.0;
  float sky=step(uFar*0.9,dC);
  float c=data.a;
  // pencil
  float lit=dot(nV,uSunView);
  float shadowed=(1.0-sky)*down(0.15,-0.25,lit);
  float hatchN=texture(tNoise,vUv*vec2(5.0,3.0)).g;
  float h=fract((gl_FragCoord.x+gl_FragCoord.y)/(7.0*uLineScale)+hatchN*0.4);
  float hatch=smoothstep(0.62,0.7,h)*down(0.86,0.78,h)*shadowed*(0.35+0.5*hatchN)*(1.0-far*0.7);
  vec3 sketch=uPaper*(1.0-0.045*shadowed-hatch*0.42);
  sketch=mix(sketch,uGraphite,edge*0.78*(1.0-sky*0.5));
  // watercolour
  vec3 col=texture(tColor,vUv).rgb;
  float grain=texture(tNoise,vUv*vec2(9.0,5.0)).b;
  col*=0.92+0.12*grain;
  col*=1.0-edge*0.2;
  vec3 ink=mix(uInk,col*0.4,0.35);
  col=mix(col,ink,edge*0.78);
  vec3 out3=mix(sketch,col,c);
  // paper under everything
  vec2 pa=vUv*vec2(uResolution.x/uResolution.y,1.0)*1.6;
  vec3 paper=texture(tPaper,pa).rgb;
  out3*=mix(vec3(1.0),paper/0.95,0.7);
  float v=length((vUv-0.5)*vec2(1.0,1.15))*1.5;
  out3*=1.0-0.14*smoothstep(0.55,1.25,v);
  out3=mix(out3,uPaper,uFade);
  if(uDebug>0.5){
    if(uDebug<1.5)out3=texture(tColor,vUv).rgb;
    else if(uDebug<2.5)out3=data.xyz;
    else if(uDebug<3.5)out3=vec3(c);
    else if(uDebug<4.5)out3=vec3(edge);
    else out3=vec3(fract(dC*0.01));
  }
  outColor=vec4(out3,1.0);
}
`;
export function postMaterial(){
  return new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:postVert,fragmentShader:postFrag,depthTest:false,depthWrite:false,
    uniforms:{tColor:{value:null},tData:{value:null},tDepth:{value:null},tPaper:{value:null},tNoise:{value:null},
      uResolution:{value:new THREE.Vector2(1,1)},uTime:{value:0},uDebug:{value:0},uNear:{value:.5},uFar:{value:2000},uLineScale:{value:1},uFade:{value:1},
      uSunView:{value:new THREE.Vector3(0,1,0)},uInk:{value:new THREE.Color(.24,.15,.12)},uGraphite:{value:new THREE.Color(.33,.33,.38)},uPaper:{value:new THREE.Color(.953,.933,.863)}}});
}

// The easel scene at the end draws the finished painting as a plain textured plane.
export function canvasMaterial(texture){
  return new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,
    vertexShader:/* glsl */`out vec2 vUv;out vec3 vNormalV;void main(){vUv=uv;vNormalV=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:/* glsl */`uniform sampler2D tMap;in vec2 vUv;in vec3 vNormalV;layout(location=0) out vec4 outColor;layout(location=1) out vec4 outData;
      void main(){outColor=vec4(texture(tMap,vUv).rgb,1.0);outData=vec4(vNormalV*0.5+0.5,1.0);}`,
    uniforms:{tMap:{value:texture}}});
}
