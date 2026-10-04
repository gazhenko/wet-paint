// Kiki on her broom, with Jiji behind her. Built from capsules, spheres and lathes with
// vertex colours; the hem, hair and bristles flutter in the vertex shader, the rest is posed here.
import * as THREE from 'three';
import {GeoBuilder,M,capsuleGeometry,damp,clamp} from './util.js';
import {paintedMaterial} from './shaders.js';

const SKIN='#f8dcc4',DRESS='#2c2a4c',HAIR='#262226',RED='#c43d2f',SHOE='#b8322a',BROOM='#a9814f',STRAW='#d9b36a',CAT='#1c1a1e';

function lathe(points,color,segments=16){
  const g=new THREE.LatheGeometry(points.map(([r,y])=>new THREE.Vector2(r,y)),segments);
  g.computeVertexNormals();
  return g;
}
function limb(a,b,r,color,builder){
  const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),len=from.distanceTo(to);
  const mid=from.clone().add(to).multiplyScalar(.5);
  const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize());
  const m=new THREE.Matrix4().compose(mid,q,new THREE.Vector3(1,1,1));
  builder.add(capsuleGeometry(r,len,6),color,m);
}

export function buildKiki(){
  const root=new THREE.Group();root.name='kiki';
  const body=new THREE.Group();root.add(body);
  const flutter=paintedMaterial({anim:1,freq:11,amp:.05,sway:true});
  const plain=paintedMaterial();
  const face=paintedMaterial({flat:true});

  // Broom
  {
    const g=new GeoBuilder();
    g.add(new THREE.CylinderGeometry(.035,.04,2.35,8),BROOM,M(0,0,-.1,0,1,1,1,Math.PI/2,0));
    g.add(new THREE.SphereGeometry(.045,8,6),'#8a6a3f',M(0,0,1.08));
    g.add(new THREE.CylinderGeometry(.16,.07,.95,10),STRAW,M(0,-.02,-1.72,0,1,1,1,Math.PI/2,0),(x,y,z)=>clamp((-z-1.4)/.6,0,1));
    for(let i=0;i<9;i++){
      const a=i/9*Math.PI*2,rr=.12;
      g.add(new THREE.ConeGeometry(.025,.5,4),STRAW,M(Math.cos(a)*rr,-.02+Math.sin(a)*rr,-2.05,0,1,1,1,-Math.PI/2+Math.sin(a)*.25,Math.cos(a)*.25),(x,y,z)=>clamp((-z-1.6)/.6,0,1));
    }
    g.add(new THREE.CylinderGeometry(.1,.1,.14,8),'#8a5a3a',M(0,-.02,-1.28,0,1,1,1,Math.PI/2,0),0);
    g.add(new THREE.CylinderGeometry(.085,.085,.1,8),'#8a5a3a',M(0,-.02,-1.42,0,1,1,1,Math.PI/2,0),0);
    const broom=new THREE.Mesh(g.build(),flutter);broom.name='broom';body.add(broom);
    // the radio, slung under the handle
    const rg=new GeoBuilder();
    rg.add(new THREE.BoxGeometry(.24,.16,.13),'#7a4a2a',M(0,-.2,.55));
    rg.add(new THREE.BoxGeometry(.2,.06,.14),'#e8dcc0',M(0,-.17,.55));
    rg.add(new THREE.CylinderGeometry(.012,.012,.2,5),'#3a2a24',M(0,-.1,.55));
    rg.add(new THREE.CylinderGeometry(.01,.01,.26,4),'#3a2a24',M(0,-.03,.55,0,1,1,1,0,.5));
    body.add(new THREE.Mesh(rg.build(),plain));
  }
  // Legs, astride, knees forward, feet tucked back
  {
    const g=new GeoBuilder();
    for(const s of [-1,1]){
      limb([s*.1,.1,-.02],[s*.13,-.08,.3],.06,SKIN,g);
      limb([s*.13,-.08,.3],[s*.14,-.42,.14],.052,SKIN,g);
      g.add(new THREE.SphereGeometry(.07,8,6),SHOE,M(s*.14,-.47,.17,0,1,.8,1.4));
    }
    const legs=new THREE.Mesh(g.build(),plain);legs.name='legs';body.add(legs);
  }
  // Dress and torso
  {
    const g=new GeoBuilder();
    g.add(lathe([[0,-.3],[.33,-.28],[.3,-.1],[.24,.1],[.19,.3],[.165,.45],[.18,.6],[.2,.72],[.16,.78],[0,.8]],DRESS,18),DRESS,M(0,0,0),(x,y)=>clamp((.1-y)/.4,0,1));
    g.add(new THREE.SphereGeometry(.07,8,6),SKIN,M(0,.8,0,0,1,.8,1),0);// neck
    g.add(new THREE.TorusGeometry(.17,.03,6,16),'#e8dcc0',M(0,.76,0,0,1,1,1,Math.PI/2,0),0);// collar
    const dress=new THREE.Mesh(g.build(),flutter);dress.name='dress';body.add(dress);
    // the satchel of parcels, slung across her and resting at the left hip
    const sg=new GeoBuilder();
    sg.add(new THREE.BoxGeometry(.22,.17,.1),'#8a5a3a',M(-.24,.12,-.04,0,1,1,1,0,.15));
    sg.add(new THREE.BoxGeometry(.23,.08,.11),'#7a4a2e',M(-.24,.18,-.04,0,1,1,1,0,.15));
    sg.add(new THREE.BoxGeometry(.05,.05,.03),'#d9a441',M(-.24,.1,.02,0,1,1,1,0,.15));
    sg.add(new THREE.TorusGeometry(.26,.014,5,20,Math.PI),'#7a4a2e',M(0,.5,-.02,0,1,1,1,0,Math.PI*.5+.35));
    sg.add(new THREE.BoxGeometry(.16,.12,.1),'#e9dcc0',M(-.25,.2,-.04,0,1,1,1,0,.15));
    sg.add(new THREE.BoxGeometry(.17,.015,.11),'#c43d2f',M(-.25,.2,-.04,0,1,1,1,0,.15));
    body.add(new THREE.Mesh(sg.build(),plain));
  }
  // Arms reaching to the broom
  {
    const g=new GeoBuilder();
    for(const s of [-1,1]){
      limb([s*.2,.68,.03],[s*.22,.42,.3],.045,DRESS,g);
      limb([s*.22,.42,.3],[s*.08,.08,.5],.04,DRESS,g);
      g.add(new THREE.SphereGeometry(.055,8,6),SKIN,M(s*.08,.05,.52));
    }
    const arms=new THREE.Mesh(g.build(),plain);arms.name='arms';body.add(arms);
  }
  // Head, hair and bow
  const head=new THREE.Group();head.position.set(0,.96,.02);head.scale.setScalar(.9);body.add(head);
  {
    const g=new GeoBuilder();
    g.add(new THREE.SphereGeometry(.2,16,12),SKIN,M(0,.05,0,0,1,1.05,.98));
    const skin=new THREE.Mesh(g.build(),face);head.add(skin);
    const f=new GeoBuilder();
    for(const s of [-1,1]){
      f.add(new THREE.SphereGeometry(1,8,6),'#2a2622',M(s*.075,.07,.17,0,.03,.052,.02));
      f.add(new THREE.SphereGeometry(1,6,4),'#ffffff',M(s*.085,.085,.19,0,.009,.012,.006));
      f.add(new THREE.SphereGeometry(1,8,6),'#f0a09a',M(s*.13,-.01,.145,0,.035,.02,.015));
    }
    f.add(new THREE.BoxGeometry(.05,.012,.01),'#b05a50',M(0,-.04,.2));
    head.add(new THREE.Mesh(f.build(),face));
    const h=new GeoBuilder();
    h.add(new THREE.SphereGeometry(.215,16,12,0,Math.PI*2,0,Math.PI*.5),HAIR,M(0,.07,-.03,0,1.02,1.0,1.04),0);   // the cap
    h.add(new THREE.SphereGeometry(.215,16,12,Math.PI*.85,Math.PI*1.3,0,Math.PI*.78),HAIR,M(0,.04,-.03,0,1.02,1.0,1.04),0); // the sides and back
    h.add(new THREE.SphereGeometry(.21,16,12,Math.PI*.9,Math.PI*1.2,0,Math.PI*.7),HAIR,M(0,-.03,-.05,0,1.05,.8,1.05),(x,y)=>clamp((.0-y)/.2,0,.5)); // the bob
    h.add(new THREE.SphereGeometry(.12,10,8),HAIR,M(-.06,.19,.14,0,1,.5,.7),0);
    h.add(new THREE.SphereGeometry(.12,10,8),HAIR,M(.07,.185,.135,0,1,.5,.7),0);
    const hair=new THREE.Mesh(h.build(),flutter);hair.name='hair';head.add(hair);
    const b=new GeoBuilder();
    b.add(new THREE.SphereGeometry(1,10,8),RED,M(-.1,.27,-.03,0,.11,.065,.045,0,.35));
    b.add(new THREE.SphereGeometry(1,10,8),RED,M(.1,.27,-.03,0,.11,.065,.045,0,-.35));
    b.add(new THREE.SphereGeometry(.045,8,6),'#a8352a',M(0,.26,-.03));
    b.add(new THREE.BoxGeometry(.06,.14,.02),RED,M(-.04,.2,-.07,0,1,1,1,.2,.3));
    b.add(new THREE.BoxGeometry(.06,.14,.02),RED,M(.04,.2,-.07,0,1,1,1,.2,-.3));
    const bow=new THREE.Mesh(b.build(),plain);bow.name='bow';head.add(bow);
  }
  // Jiji, sitting on the handle behind her
  const jiji=new THREE.Group();jiji.position.set(0,.05,-.72);body.add(jiji);
  const tail=new THREE.Group();
  {
    const g=new GeoBuilder();
    g.add(new THREE.SphereGeometry(1,12,8),CAT,M(0,.14,0,0,.1,.13,.15));
    g.add(new THREE.SphereGeometry(.09,12,8),CAT,M(0,.31,.07));
    for(const s of [-1,1]){
      g.add(new THREE.ConeGeometry(.035,.09,4),CAT,M(s*.055,.4,.06,0,1,1,1,0,s*-.25));
      g.add(new THREE.SphereGeometry(1,8,6),'#e3ebb0',M(s*.038,.32,.15,0,.024,.03,.012));
      g.add(new THREE.SphereGeometry(1,6,4),'#1c1a1e',M(s*.038,.32,.161,0,.008,.016,.005));
      g.add(new THREE.SphereGeometry(.035,6,4),CAT,M(s*.07,.06,.1,0,1,.8,1.4));
    }
    g.add(new THREE.TorusGeometry(.06,.012,5,12),RED,M(0,.245,.05,0,1,1,1,Math.PI/2,0));
    const cat=new THREE.Mesh(g.build(),plain);cat.name='jiji';jiji.add(cat);
    const t=new GeoBuilder();
    const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,.12,-.1),new THREE.Vector3(0,.12,-.28),new THREE.Vector3(.02,.26,-.36),new THREE.Vector3(.0,.4,-.3)]);
    t.add(new THREE.TubeGeometry(curve,10,.022,6,false),CAT,M(0,0,0));
    tail.add(new THREE.Mesh(t.build(),plain));
    tail.position.set(0,0,0);jiji.add(tail);
  }

  const parts={body,head,jiji,tail,bow:head.getObjectByName('bow')};
  const state={speed:0,bank:0,pitch:0,boost:0,grounded:0,bob:0,deliver:0,earFlick:0,look:0};
  function update(t,dt,s){
    Object.assign(state,s);
    const sp=clamp(state.speed/40,0,1);
    const bob=Math.sin(t*2.2)*.035*(1-sp*.6)*(1-state.grounded*.7);
    body.position.y=bob;
    body.rotation.set(-sp*.22+state.pitch*.5+state.deliver*.45,0,state.bank*.9);
    head.rotation.set(-state.deliver*.3+Math.sin(t*1.3)*.03,state.look+Math.sin(t*.7)*.08,-state.bank*.25);
    parts.bow.rotation.z=Math.sin(t*6.5)*.06*(1+sp*2);
    flutter.uniforms.uAnim.value.set(1,10+sp*8,.03+sp*.12,0);
    jiji.rotation.set(0,Math.sin(t*.5)*.3*(1-sp),0);
    tail.rotation.y=Math.sin(t*2.4)*.5;tail.rotation.x=Math.sin(t*1.7)*.2;
  }
  return {group:root,update,materials:{flutter,plain,face}};
}
