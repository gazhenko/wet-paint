// Boot: the renderer, the two-target scene pass, the sun's shadow pass, the post pass that
// makes the page, and the loop. Also the studio at the end, and the check API used by the
// screenshot and route tools.
import * as THREE from 'three';
THREE.ColorManagement.enabled=false;
import {makeNoiseTexture,makePaperTexture} from './noise.js';
import {shared,postMaterial,paintedMaterial,canvasMaterial} from './shaders.js';
import {buildWorld} from './world.js';
import {buildKiki} from './kiki.js';
import {Input,Flight,ChaseCamera} from './flight.js';
import {Sound} from './audio.js';
import {Game} from './game.js';
import {GeoBuilder,M,damp,clamp,lerp,dist2} from './util.js';

const api=window.wetPaint={ready:false,errors:[],fixedStep:0,frames:0,fps:0,draws:0,version:'1.0.0'};
const origError=console.error.bind(console);
console.error=(...a)=>{api.errors.push(a.map(String).join(' ').slice(0,600));origError(...a);};
addEventListener('error',e=>api.errors.push(String(e.message)));
addEventListener('unhandledrejection',e=>api.errors.push(String(e.reason)));

const params=new URLSearchParams(location.search);
const canvas=document.getElementById('view');
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance',stencil:false});
renderer.autoClear=false;
renderer.setClearColor(0x808080,1);
const maxRatio=params.has('ratio')?parseFloat(params.get('ratio')):1.5;
renderer.setPixelRatio(Math.min(devicePixelRatio||1,maxRatio));

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(56,1,.5,2200);
camera.layers.enable(1);
const noise=makeNoiseTexture(),paper=makePaperTexture();
shared.tNoise.value=noise;

const world=buildWorld(scene,noise);
const kiki=buildKiki();scene.add(kiki.group);
const input=new Input();
const flight=new Flight(world);
const chase=new ChaseCamera(camera);
const sound=new Sound();

// Sun shadow pass
const SHADOW=4096;
const shadowRT=new THREE.WebGLRenderTarget(SHADOW,SHADOW,{depthTexture:new THREE.DepthTexture(SHADOW,SHADOW,THREE.UnsignedIntType),depthBuffer:true});
shadowRT.texture.minFilter=shadowRT.texture.magFilter=THREE.NearestFilter;
shadowRT.depthTexture.minFilter=shadowRT.depthTexture.magFilter=THREE.NearestFilter;
const sunCam=new THREE.OrthographicCamera(-320,320,320,-320,1,900);
sunCam.layers.set(0);
const NEAR=2048;
const nearRT=new THREE.WebGLRenderTarget(NEAR,NEAR,{depthTexture:new THREE.DepthTexture(NEAR,NEAR,THREE.UnsignedIntType),depthBuffer:true});
nearRT.depthTexture.minFilter=nearRT.depthTexture.magFilter=THREE.NearestFilter;
const nearCam=new THREE.OrthographicCamera(-70,70,70,-70,1,900);
nearCam.layers.set(0);
const depthMat=new THREE.MeshDepthMaterial();
shared.uShadowMap.value=shadowRT.depthTexture;
shared.uShadowNear.value=nearRT.depthTexture;

// Scene pass with colour + (normal, paint) targets, then the post pass
let rt=null;
const post=postMaterial();
post.uniforms.tPaper.value=paper;post.uniforms.tNoise.value=noise;
const postScene=new THREE.Scene();
const postCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),post));
let samples=params.has('msaa')?parseInt(params.get('msaa')):4;
function makeTargets(){
  const w=renderer.domElement.width,h=renderer.domElement.height;
  if(rt){rt.dispose();}
  rt=new THREE.WebGLRenderTarget(w,h,{count:2,samples,depthTexture:new THREE.DepthTexture(w,h,THREE.UnsignedIntType),depthBuffer:true,type:THREE.UnsignedByteType});
  for(const t of rt.textures){t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;}
  post.uniforms.tColor.value=rt.textures[0];
  post.uniforms.tData.value=rt.textures[1];
  post.uniforms.tDepth.value=rt.depthTexture;
  post.uniforms.uResolution.value.set(w,h);
  post.uniforms.uLineScale.value=Math.max(.8,h/1080*1.15);
}
function resize(){
  const w=innerWidth,h=innerHeight;
  renderer.setSize(w,h,false);
  camera.aspect=w/h;camera.updateProjectionMatrix();
  makeTargets();
}
addEventListener('resize',resize);
resize();

const game=new Game({scene,world,kiki,flight,camera:chase,input,sound});

// The studio: where the finished painting sits on the easel.
const studio=new THREE.Scene();
const studioCam=new THREE.PerspectiveCamera(42,1,.1,100);
studioCam.layers.enable(1);
const paintingRT=new THREE.WebGLRenderTarget(1600,1000,{type:THREE.UnsignedByteType});
paintingRT.texture.minFilter=THREE.LinearFilter;paintingRT.texture.magFilter=THREE.LinearFilter;
let studioBuilt=false,reveal=null;
const noShadow=new THREE.Matrix4().makeTranslation(5,5,5).multiply(new THREE.Matrix4().makeScale(0,0,0));
function buildStudio(){
  const g=new GeoBuilder(),painted=paintedMaterial();
  // floorboards
  for(let i=-8;i<8;i++)g.add(new THREE.BoxGeometry(.5,.05,12),i%2?'#a8865a':'#b8966a',M(i*.5+.25,-1.2,0));
  g.add(new THREE.BoxGeometry(12,6,.2),'#efe6d2',M(0,1.8,-3));          // back wall
  g.add(new THREE.BoxGeometry(.2,6,12),'#e8dfca',M(-4.5,1.8,0));         // left wall
  g.add(new THREE.BoxGeometry(.3,2.2,1.8),'#fbf6e8',M(-4.45,1.9,-.6));     // window frame
  g.add(new THREE.BoxGeometry(.1,1.9,1.5),'#dcebf2',M(-4.3,1.9,-.6));
  g.add(new THREE.BoxGeometry(.06,1.9,.08),'#fbf6e8',M(-4.25,1.9,-.6));
  g.add(new THREE.BoxGeometry(.06,.08,1.5),'#fbf6e8',M(-4.25,1.9,-.6));
  // easel
  for(const [x,z,rz] of [[-.55,.25,.08],[.55,.25,-.08],[0,-.5,0]])g.add(new THREE.CylinderGeometry(.03,.035,2.6,6),'#7a5a3e',M(x,.1,z,0,1,1,1,x?0:-.3,rz));
  g.add(new THREE.BoxGeometry(1.3,.06,.12),'#7a5a3e',M(0,-.25,.33));
  g.add(new THREE.BoxGeometry(1.3,.05,.05),'#7a5a3e',M(0,1.1,.33));
  // table with jars and brushes
  g.add(new THREE.BoxGeometry(1.4,.06,.7),'#8a6a4a',M(2,-.3,-1.2));
  for(const [x,z] of [[1.5,-1.4],[2.5,-1.4],[1.5,-1],[2.5,-1]])g.add(new THREE.CylinderGeometry(.03,.03,.86,6),'#7a5a3e',M(x,-.7,z));
  g.add(new THREE.CylinderGeometry(.12,.1,.3,10),'#dcebf2',M(1.75,-.12,-1.25));
  g.add(new THREE.CylinderGeometry(.1,.09,.22,10),'#5b7fb8',M(2.1,-.16,-1.05));
  g.add(new THREE.CylinderGeometry(.09,.08,.2,10),'#e07a5f',M(2.35,-.17,-1.3));
  g.add(new THREE.CylinderGeometry(.08,.07,.18,10),'#d9a441',M(1.95,-.18,-1.45));
  for(let i=0;i<5;i++)g.add(new THREE.CylinderGeometry(.008,.01,.5,4),i%2?'#3a2a24':'#c43d2f',M(1.75+i*.012,.15,-1.25+i*.01,0,1,1,1,.3,i*.08-.15));
  // a stool with a sleeping cat
  g.add(new THREE.CylinderGeometry(.3,.3,.05,12),'#8a6a4a',M(-2,-.6,-1.6));
  for(let i=0;i<3;i++){const a=i*2.1;g.add(new THREE.CylinderGeometry(.025,.03,.6,6),'#7a5a3e',M(-2+Math.cos(a)*.22,-.9,-1.6+Math.sin(a)*.22));}
  g.add(new THREE.SphereGeometry(.22,10,8),'#1c1a1e',M(-2,-.45,-1.6,0,1,.55,1.1));
  g.add(new THREE.SphereGeometry(.1,10,8),'#1c1a1e',M(-1.85,-.42,-1.45));
  g.add(new THREE.ConeGeometry(.035,.09,4),'#1c1a1e',M(-1.8,-.33,-1.42));g.add(new THREE.ConeGeometry(.035,.09,4),'#1c1a1e',M(-1.9,-.33,-1.42));
  studio.add(new THREE.Mesh(g.build(),painted));
  const canvasMesh=new THREE.Mesh(new THREE.PlaneGeometry(1.6,1.0),canvasMaterial(paintingRT.texture));
  canvasMesh.position.set(0,.4,.36);canvasMesh.rotation.x=-.08;studio.add(canvasMesh);
  const border=new GeoBuilder();border.add(new THREE.BoxGeometry(1.72,1.12,.04),'#f8f4ea',M(0,.4,.33,0,1,1,1,-.08,0));
  studio.add(new THREE.Mesh(border.build(),painted));
  studioBuilt=true;
}
function renderPainting(){
  // the postcard view of the town, drawn through the same pipeline into the painting
  const saved={pos:camera.position.clone(),quat:camera.quaternion.clone(),fov:camera.fov,aspect:camera.aspect};
  camera.position.set(72,40,-88);camera.lookAt(-12,16,70);camera.fov=50;camera.aspect=1.6;camera.updateProjectionMatrix();
  const w=renderer.domElement.width,h=renderer.domElement.height;
  renderShadow(camera.position);
  renderer.setRenderTarget(rt);renderer.clear();renderer.render(scene,camera);
  post.uniforms.uResolution.value.set(w,h);
  post.uniforms.uSunView.value.copy(shared.uSunDir.value).transformDirection(camera.matrixWorldInverse);
  post.uniforms.uFade.value=0;
  renderer.setRenderTarget(paintingRT);renderer.clear();renderer.render(postScene,postCam);
  camera.position.copy(saved.pos);camera.quaternion.copy(saved.quat);camera.fov=saved.fov;camera.aspect=saved.aspect;camera.updateProjectionMatrix();
}
game.onFinale=()=>{
  const flash=document.getElementById('flash');
  flash.style.opacity=1;
  setTimeout(()=>{
    if(!studioBuilt)buildStudio();
    renderPainting();
    game.hideNotes();
    game.applyDay(.45);
    reveal={t:0};
    const fin=document.getElementById('fin');
    const m=Math.floor(game.elapsed/60),s=Math.floor(game.elapsed%60);
    fin.querySelector('h2').textContent='Koriko, in watercolour';
    fin.querySelector('p').textContent=`Painted in ${m}:${s.toString().padStart(2,'0')}, seven parcels, one broom.`;
    setTimeout(()=>{flash.style.opacity=0;},300);
    setTimeout(()=>fin.classList.add('show'),6000);
  },900);
};
game.onFlyOn=()=>{reveal=null;post.uniforms.uFade.value=0;game.applyDay(game.dayP);};

function renderShadow(focus){
  const sun=shared.uSunDir.value;
  scene.overrideMaterial=depthMat;
  const f=new THREE.Vector3(Math.round(focus.x/8)*8,0,Math.round(focus.z/8)*8);
  sunCam.position.copy(f).addScaledVector(sun,420);
  sunCam.lookAt(f);sunCam.updateMatrixWorld();
  shared.uShadowMatrix.value.multiplyMatrices(sunCam.projectionMatrix,sunCam.matrixWorldInverse);
  renderer.setRenderTarget(shadowRT);renderer.clear();renderer.render(scene,sunCam);
  const n=new THREE.Vector3(Math.round(focus.x/2)*2,Math.round(focus.y/2)*2,Math.round(focus.z/2)*2);
  nearCam.position.copy(n).addScaledVector(sun,420);
  nearCam.lookAt(n);nearCam.updateMatrixWorld();
  shared.uShadowNearMatrix.value.multiplyMatrices(nearCam.projectionMatrix,nearCam.matrixWorldInverse);
  renderer.setRenderTarget(nearRT);renderer.clear();renderer.render(scene,nearCam);
  scene.overrideMaterial=null;
}

// Autopilot for the route check: steer toward the current address and settle onto it.
function autopilot(){
  const p=game.target;if(!p||game.phase!=='flying'){input.override={turn:0,climb:0,boost:false,brake:false};return;}
  const dx=p.x-flight.pos.x,dz=p.z-flight.pos.z,d=Math.hypot(dx,dz);
  const want=Math.atan2(dx,dz),err=Math.atan2(Math.sin(want-flight.yaw),Math.cos(want-flight.yaw));
  const cruise=d>60?Math.max(p.y+14,world.clearanceAt(flight.pos.x+flight.forward.x*25,flight.pos.z+flight.forward.z*25)+10):p.y+2+d*.08;
  const climb=clamp((cruise-flight.pos.y)*.25,-1,1);
  const high=flight.pos.y>cruise+6;
  const brake=!high&&(d<p.radius||(d<30&&flight.speed>6)||(d<60&&flight.speed>14));
  input.override={turn:clamp(err*2.5,-1,1),climb,boost:d>140&&Math.abs(err)<.3,brake};
}
api.autopilot=false;

const clock=new THREE.Clock();
let fpsAcc=0,fpsN=0,fpsT=0,simT=0;
renderer.info.autoReset=false;
function frame(){
  requestAnimationFrame(frame);
  renderer.info.reset();
  const raw=clock.getDelta();
  const dt=api.fixedStep||Math.min(raw,1/20);
  simT+=dt;
  fpsAcc+=raw;fpsN++;if(fpsAcc>1){api.fps=Math.round(fpsN/fpsAcc);fpsAcc=0;fpsN=0;}
  if(game.phase==='title'&&(input.any||params.has('autostart'))&&!params.has('check')){game.start();}
  if(api.autopilot)autopilot();
  input.poll();
  if(game.phase!=='title'){flight.update(dt,input);}
  flight.pose(kiki.group);
  kiki.update(simT,dt,{speed:flight.speed,bank:flight.roll,pitch:flight.pitch,grounded:game.phase==='landed'||game.phase==='finale'?1:0,deliver:game.phase==='landed'&&game.timer<1.6?Math.sin(game.timer/1.6*Math.PI):0});
  world.update(simT,dt);
  game.update(simT,dt);
  sound.setFlight(flight.speed,input.boost);
  chase.update(dt,flight,input.boost&&!input.brake);
  shared.uTime.value=simT;
  shared.uCamera.value.copy(camera.position);
  post.uniforms.uTime.value=simT;
  if(reveal){
    reveal.t+=dt;
    const k=1-Math.pow(1-clamp(reveal.t/9,0,1),2.2);
    studioCam.aspect=camera.aspect;studioCam.position.set(lerp(0,-1.1,k),lerp(.4,.55,k),lerp(1.35,3.4,k));studioCam.lookAt(lerp(0,-.15,k),lerp(.4,.3,k),0);studioCam.updateProjectionMatrix();
    game.applyDay(.45);
    // the town's shadow maps do not apply in the studio: a matrix that maps everything outside the cascades
    shared.uShadowMatrix.value.copy(noShadow);shared.uShadowNearMatrix.value.copy(noShadow);
    shared.uSunDir.value.set(-.35,.65,.75).normalize();shared.uCamera.value.copy(studioCam.position);
    shared.uBlooms.value[0].set(0,0,10000,1);shared.uBloomCount.value=1;shared.uLamp.value=0;shared.uHazeDensity.value=0;
    renderer.setRenderTarget(rt);renderer.clear();renderer.render(studio,studioCam);
    post.uniforms.uSunView.value.copy(shared.uSunDir.value).transformDirection(studioCam.matrixWorldInverse);
    post.uniforms.uFade.value=Math.max(0,1-reveal.t*.8);
    renderer.setRenderTarget(null);renderer.render(postScene,postCam);
    shared.uHazeDensity.value=.0022;
  }else{
    renderShadow(flight.pos);
    renderer.setRenderTarget(rt);renderer.clear();renderer.render(scene,camera);
    post.uniforms.uSunView.value.copy(shared.uSunDir.value).transformDirection(camera.matrixWorldInverse);
    post.uniforms.uFade.value=damp(post.uniforms.uFade.value,0,1.2,dt);
    renderer.setRenderTarget(null);renderer.render(postScene,postCam);
  }
  api.draws=renderer.info.render.calls;
  api.frames++;
}

// Check API
Object.assign(api,{
  world,game,flight,shared,
  start:()=>game.start(),
  teleport:(x,y,z,yaw)=>{flight.pos.set(x,y,z);flight.yaw=yaw;flight.pitch=0;flight.roll=0;flight.updateForward();chase.init=false;chase.mode='chase';},
  look:(x,y,z,tx,ty,tz)=>{chase.init=true;chase.mode='fixed';chase.pos.set(x,y,z);chase.look.set(tx,ty,tz);},
  input:o=>{input.override=o;},
  deliver:()=>game.deliver(),
  setDay:p=>{game.dayTarget=p;game.dayP=p;game.applyDay(p);},
  setSky:w=>{game.skyWashTarget=w;game.skyWash=w;},
  bloom:(x,z,r)=>game.addBloom(x,z,r,true),
  skipTo:n=>game.skipTo(n),
  paintAll:()=>{game.addBloom(0,0,5000,true);game.skyWashTarget=1.7;game.skyWash=1.7;},
  debug:v=>{post.uniforms.uDebug.value=v;},
  _state(){return {phase:game.phase,pos:flight.pos.toArray().map(v=>+v.toFixed(2)),yaw:+flight.yaw.toFixed(3),speed:+flight.speed.toFixed(2),progress:game.progress,target:game.target&&game.target.who,elapsed:+game.elapsed.toFixed(1),fps:api.fps,draws:api.draws,errors:api.errors.length,windows:world.windowCount,trees:world.treeCount,blooms:game.blooms.length};},
});
Object.defineProperty(api,'state',{get(){return api._state();}});
document.getElementById('loading').classList.add('gone');
api.ready=true;
frame();
