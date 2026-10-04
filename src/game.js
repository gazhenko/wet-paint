// The delivery round: a chain of parcels across Koriko, a wash of paint for each one, the day
// turning as the page fills, Jiji's remarks, and the finished painting at the end.
import * as THREE from 'three';
import {shared} from './shaders.js';
import {clamp,lerp,damp,dist2,smoothstep} from './util.js';

const ROUTE=['the harbourmaster','the clockmaker','Tombo','Madame','Ursula','the lighthouse keeper','the captain'];
const PARCELS={
  'the harbourmaster':'A warm loaf, still steaming',
  'the clockmaker':'A brass pendulum in straw',
  'Tombo':'A spoke wrench and two bolts',
  'Madame':'A porcelain cat, wrapped twice',
  'Ursula':'A tube of ultramarine',
  'the lighthouse keeper':'A tin of lamp oil',
  'the captain':'A letter from Osono',
};
const BUMPS=['Ow.','That was a roof.','Chimneys do not move, you know.','I felt that in my tail.','Paint goes on the paper, not on you.'];
const AMBIENT=['Gulls. Why is it always gulls.','The sea is painting itself. Show-off.','I can smell the bakery from here.','Slow down, you will smudge it.','My ears are cold.','Hold Space over the ribbon. Gently.','Is that the airship? Tell me that is not our last stop.','Look at the roofs. Someone mixed that orange on purpose.'];

const DAY=[
  {p:0,el:30,az:58,sun:[1,.97,.9],top:[.49,.64,.86],hor:[.88,.9,.9],glow:[1,.95,.82],haze:[.84,.87,.9],shadow:[.62,.68,.9],lamp:0,stars:0,sea:[.27,.47,.66],seaLit:[.56,.74,.84]},
  {p:.45,el:54,az:12,sun:[1,.98,.93],top:[.42,.6,.86],hor:[.85,.9,.92],glow:[1,.96,.85],haze:[.82,.87,.92],shadow:[.6,.66,.9],lamp:0,stars:0,sea:[.25,.48,.68],seaLit:[.6,.78,.86]},
  {p:.8,el:22,az:-40,sun:[1,.9,.72],top:[.47,.56,.8],hor:[.98,.84,.62],glow:[1,.8,.5],haze:[.92,.84,.78],shadow:[.55,.5,.8],lamp:.25,stars:0,sea:[.3,.44,.62],seaLit:[.72,.68,.64]},
  {p:1,el:7,az:-62,sun:[1,.72,.5],top:[.36,.38,.64],hor:[.99,.66,.46],glow:[1,.62,.4],haze:[.9,.7,.66],shadow:[.5,.44,.76],lamp:1,stars:.35,sea:[.26,.33,.55],seaLit:[.72,.56,.56]},
  {p:1.3,el:3,az:-70,sun:[.55,.52,.72],top:[.13,.15,.34],hor:[.5,.36,.46],glow:[.7,.45,.42],haze:[.45,.42,.58],shadow:[.45,.42,.7],lamp:1,stars:1,sea:[.12,.16,.3],seaLit:[.4,.42,.55]},
];
const mixArr=(a,b,t)=>a.map((v,i)=>lerp(v,b[i],t));

export class Game{
  constructor(ctx){
    Object.assign(this,ctx);
    this.phase='title';this.progress=0;this.target=null;this.blooms=[];this.t=0;this.timer=0;this.elapsed=0;
    this.skyWash=0;this.skyWashTarget=0;this.dayP=0;this.dayTarget=0;
    this.ui={parcel:document.getElementById('parcel'),progress:document.getElementById('progress'),pct:document.getElementById('pct'),brush:document.querySelector('#brush i'),
      tag:document.getElementById('tag'),tagWho:document.querySelector('#tag .who'),tagDist:document.querySelector('#tag .dist'),jiji:document.getElementById('jiji'),hint:document.getElementById('hint'),
      title:document.getElementById('title'),fin:document.getElementById('fin'),flash:document.getElementById('flash')};
    this.lines=[];this.lineTimer=0;this.ambientTimer=18;this.hintTimer=0;
    this.padByWho={};for(const p of this.world.pads)this.padByWho[p.who]=p;
    this.padByWho['Osono'].ring.visible=false;
    // Osono's corner is the one patch of colour on the page when the day begins
    this.addBloom(-20,42,36,true);
    this.sky=this.world.group.getObjectByName('sky').material;
    this.sea=this.world.group.getObjectByName('sea').material;
    this.applyDay(0);
    this.ui.title.querySelector('.start').addEventListener('click',()=>this.start());
    this.ui.fin.querySelector('.again').addEventListener('click',()=>this.flyOn());
    addEventListener('keydown',e=>{if(e.code==='KeyM'){const m=this.sound.toggleMute();this.say(m?'Quiet, then.':'Ah, the radio.');}});
  }
  addBloom(x,z,target,instant){
    const b={x,z,r:instant?target:0,target,age:instant?99:0,w:1,speed:target>500?16:7};
    this.blooms.push(b);
    if(this.blooms.length>shared.uBlooms.value.length)this.blooms.shift();
    return b;
  }
  start(){
    if(this.phase!=='title')return;
    this.sound.start();
    this.ui.title.classList.add('gone');
    this.phase='flying';this.elapsed=0;
    this.flight.locked=false;this.flight.speed=12;
    this.setTarget(ROUTE[0]);
    this.show(this.ui.parcel);this.show(this.ui.progress);this.show(this.ui.hint);this.hintTimer=16;
    this.say('Everything is grey. Did we take off inside a sketchbook?',5);
    this.queue('Follow the paper tag. Hold Space over the ribbon to land.',6);
    this.sound.whoosh();
  }
  setTarget(who){
    this.target=this.padByWho[who];
    for(const p of this.world.pads)p.ring.visible=p===this.target;
    this.ui.parcel.querySelector('span').textContent=`${PARCELS[who]} — for ${who}`;
    this.ui.tagWho.textContent=this.target.name;
    this.show(this.ui.tag);
  }
  say(text,secs=4.5){this.lines=[{text,secs}];this.lineTimer=0;this.ui.jiji.textContent=text;this.show(this.ui.jiji);}
  queue(text,secs=4.5){this.lines.push({text,secs});}
  show(el){el.classList.remove('hidden');}
  hide(el){el.classList.add('hidden');}

  deliver(){
    const pad=this.target;
    this.phase='landed';this.timer=0;
    this.flight.locked=true;
    if(this.camera.mode!=='fixed'){this.camera.mode='orbit';this.camera.orbit=0;}
    this.sound.chime();
    const last=pad.who==='the captain';
    this.addBloom(pad.x,pad.z,pad.bloom);
    setTimeout(()=>this.sound.wash(),500);
    this.progress++;
    this.ui.pct.textContent=Math.round(this.progress/ROUTE.length*100)+'%';
    this.ui.brush.style.width=(this.progress/ROUTE.length*100)+'%';
    this.hide(this.ui.tag);
    this.say(pad.lines[0]||'Delivered.',last?6:4);
    this.dayTarget=this.progress/ROUTE.length;
    if(last){this.skyWashTarget=1.7;this.ui.parcel.querySelector('span').textContent='Nothing left in the satchel.';}
    else this.skyWashTarget=.12+this.dayTarget*.95;
    this.lastPad=pad;
  }
  finale(){
    this.phase='finale';this.timer=0;
    this.camera.mode='finale';this.camera.orbit=0;
    this.queue('…it is finished. You painted the whole town.',7);
    this.sound.setMusic(.75);
  }
  // for the checks: jump to the last parcel
  skipTo(n){
    for(let i=0;i<n;i++){const p=this.padByWho[ROUTE[i]];this.addBloom(p.x,p.z,p.bloom,true);}
    this.progress=n;this.dayTarget=n/ROUTE.length;this.dayP=this.dayTarget;this.applyDay(this.dayP);
    this.skyWashTarget=.12+this.dayTarget*.95;this.skyWash=this.skyWashTarget;
    this.ui.pct.textContent=Math.round(n/ROUTE.length*100)+'%';this.ui.brush.style.width=(n/ROUTE.length*100)+'%';
    this.setTarget(ROUTE[n]);
  }
  hideNotes(){this.hide(this.ui.parcel);this.hide(this.ui.progress);this.hide(this.ui.jiji);this.hide(this.ui.tag);}
  flyOn(){
    this.ui.fin.classList.remove('show');this.show(this.ui.progress);
    this.phase='free';
    const f=this.flight;f.locked=false;f.speed=14;f.pitch=0;f.roll=0;this.camera.mode='chase';this.camera.init=false;
    f.yaw=Math.atan2(-f.pos.x,60-f.pos.z);f.updateForward();
    this.dayTarget=1.3;
    this.say('The lamps are on. Fly wherever you like; the paint is dry.',6);
    if(this.onFlyOn)this.onFlyOn();
  }
  applyDay(p){
    let a=DAY[0],b=DAY[DAY.length-1];
    for(let i=0;i<DAY.length-1;i++)if(p>=DAY[i].p&&p<=DAY[i+1].p){a=DAY[i];b=DAY[i+1];break;}
    const t=clamp((p-a.p)/(b.p-a.p),0,1);
    const el=THREE.MathUtils.degToRad(lerp(a.el,b.el,t)),az=THREE.MathUtils.degToRad(lerp(a.az,b.az,t));
    shared.uSunDir.value.set(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).normalize();
    shared.uSunColor.value.setRGB(...mixArr(a.sun,b.sun,t));
    shared.uShadowTint.value.setRGB(...mixArr(a.shadow,b.shadow,t));
    shared.uHaze.value.setRGB(...mixArr(a.haze,b.haze,t));
    shared.uLamp.value=lerp(a.lamp,b.lamp,t);
    this.sky.uniforms.uSkyTop.value.setRGB(...mixArr(a.top,b.top,t));
    this.sky.uniforms.uSkyHorizon.value.setRGB(...mixArr(a.hor,b.hor,t));
    this.sky.uniforms.uSkyGlow.value.setRGB(...mixArr(a.glow,b.glow,t));
    this.sky.uniforms.uStars.value=lerp(a.stars,b.stars,t);
    this.sea.uniforms.uSeaDeep.value.setRGB(...mixArr(a.sea,b.sea,t));
    this.sea.uniforms.uSeaLit.value.setRGB(...mixArr(a.seaLit,b.seaLit,t));
  }
  update(t,dt){
    this.t=t;
    const f=this.flight,pos=f.pos;
    // paint spreading
    for(const b of this.blooms){
      b.age+=dt;
      const k=clamp(b.age/b.speed,0,1);
      b.r=b.target*(1-Math.pow(1-k,3));
    }
    this.blooms.forEach((b,i)=>shared.uBlooms.value[i].set(b.x,b.z,b.r,b.w));
    shared.uBloomCount.value=this.blooms.length;
    this.skyWash=damp(this.skyWash,this.skyWashTarget,this.skyWashTarget>1.5?.25:.6,dt);
    shared.uSkyWash.value=this.skyWash;
    this.dayP=damp(this.dayP,this.dayTarget,.35,dt);
    this.applyDay(this.dayP);

    if(this.phase==='flying'||this.phase==='free'){
      this.elapsed+=dt;
      if(f.bump>1.49){this.say(BUMPS[Math.floor(Math.random()*BUMPS.length)],2.5);this.sound.bump();}
      if(f.edge&&!this.edgeSaid){this.edgeSaid=true;this.say('The page ends here. Turn back before we fall off it.',4);setTimeout(()=>this.edgeSaid=false,20000);}
      this.ambientTimer-=dt;
      if(this.ambientTimer<0&&this.lines.length===0){this.say(AMBIENT[Math.floor(Math.random()*AMBIENT.length)],4);this.ambientTimer=22+Math.random()*20;}
      if(this.hintTimer>0){this.hintTimer-=dt;if(this.hintTimer<=0)this.hide(this.ui.hint);}
    }
    if(this.phase==='flying'&&this.target){
      const p=this.target,d=dist2(pos.x,pos.z,p.x,p.z),dy=pos.y-p.y;
      p.ring.visible=true;
      p.ring.scale.setScalar(1+Math.sin(t*3)*.03);
      if(d<p.radius&&dy>-2&&dy<3.4&&f.speed<7.5)this.deliver();
      this.ui.tagDist.textContent=d>1000?(d/1000).toFixed(1)+' km':Math.round(d)+' m';
    }
    if(this.phase==='landed'){
      this.timer+=dt;
      const p=this.lastPad;
      pos.x=damp(pos.x,p.x,3,dt);pos.z=damp(pos.z,p.z,3,dt);pos.y=damp(pos.y,p.y+.85,3,dt);
      if(this.timer>3.4){
        if(p.who==='the captain')this.finale();
        else{
          const next=ROUTE[ROUTE.indexOf(p.who)+1];
          this.setTarget(next);
          this.phase='flying';f.locked=false;f.speed=11;f.pitch=.25;if(this.camera.mode!=='fixed')this.camera.mode='chase';this.sound.whoosh();
          this.queue(`${PARCELS[next]}, for ${next}.`,4);
        }
      }
    }
    if(this.phase==='finale'){
      this.timer+=dt;
      const p=this.lastPad;
      pos.x=damp(pos.x,p.x,2,dt);pos.z=damp(pos.z,p.z,2,dt);pos.y=damp(pos.y,p.y+.85,2,dt);
      if(this.timer>15&&!this.revealed){this.revealed=true;if(this.onFinale)this.onFinale();}
    }
    // Jiji's lines
    if(this.lines.length){
      this.lineTimer+=dt;
      if(this.lineTimer>this.lines[0].secs){
        this.lines.shift();this.lineTimer=0;
        if(this.lines.length){this.ui.jiji.textContent=this.lines[0].text;}else this.hide(this.ui.jiji);
      }
    }
    // the paper tag over the destination
    if(this.phase==='flying'&&this.target)this.placeTag();
  }
  placeTag(){
    const p=this.target,cam=this.camera.camera,v=new THREE.Vector3(p.x,p.y+4,p.z).project(cam);
    const w=innerWidth,h=innerHeight;
    let x=(v.x*.5+.5)*w,y=(-v.y*.5+.5)*h;
    const behind=v.z>1;
    let edge=false;
    if(behind){x=w-x;y=h;}
    const m=70;
    if(x<m||x>w-m||y<m||y>h-m||behind){edge=true;x=clamp(x,m,w-m);y=clamp(y,m+30,h-m);}
    this.ui.tag.style.transform=`translate(${x}px,${y}px) translate(-50%,-110%) rotate(${Math.sin(this.t*.7)*1.5}deg)`;
    this.ui.tag.classList.toggle('edge',edge);
    if(edge){const ang=Math.atan2(y-h/2,x-w/2);this.ui.tag.querySelector('.arrow').style.transform=`rotate(${ang}rad)`;this.ui.tag.querySelector('.arrow').style.display='inline-block';}
  }
}
