// Koriko, generated: a bay with a quay, a clock tower on the square, streets of painted houses
// climbing the hill, a villa with a garden, a cabin in the forest, a lighthouse on the headland
// and an airship over the water. Everything is built from boxes, prisms and spheres with
// vertex colours and merged into a handful of draw calls.
import * as THREE from 'three';
import {rng,fbmTile} from './noise.js';
import {GeoBuilder,M,prismGeometry,hipGeometry,clamp,lerp,smoothstep,dist2} from './util.js';
import {paintedMaterial,windowMaterial,seaMaterial,skyMaterial} from './shaders.js';

const WALLS=['#f1e3c6','#e9d2a6','#f4d9c0','#e7c8b0','#f2e6d0','#dfe3d6','#e3cfc0','#d8dcc8','#f0d4a8','#ead7bf','#e2b89a','#d9c6a8','#f6e7cf','#e6d5b5'];
const ROOFS=['#c9623f','#b8563a','#d1744f','#9b6b4f','#6e6f7a','#5c6673','#c0583a','#8a5d48','#b5604a'];
const FRAMES=['#fbf6e8','#e8e2cf','#cdd8c3','#8f6a4a','#f2e6c4','#b8c9c1'];
const CANOPY=['#5f9a4e','#6fa85a','#4f8a46','#7cae5c','#8ab35a','#64a062'];

// Terrain -----------------------------------------------------------------------------------
const terrainNoise=fbmTile(256,4,4,909);
function tn(x,z){
  const u=(((x*0.0019)%1+1)%1)*256,v=(((z*0.0019)%1+1)%1)*256;
  const i=Math.floor(u),j=Math.floor(v),fx=u-i,fz=v-j;
  const i0=i%256,j0=j%256,i1=(i+1)%256,j1=(j+1)%256;
  const a=terrainNoise[j0*256+i0],b=terrainNoise[j0*256+i1],c=terrainNoise[j1*256+i0],d=terrainNoise[j1*256+i1];
  return (a+(b-a)*fx)+((c+(d-c)*fx)-(a+(b-a)*fx))*fz;
}
export function terrainHeight(x,z){
  const headland=13*smoothstep(-60,-125,x)*smoothstep(60,0,z)*smoothstep(-110,-60,z);
  const slope=Math.max(0,z)*0.095;
  const hill=70*smoothstep(195,340,z);
  const mountains=120*smoothstep(380,560,Math.max(z,Math.abs(x)*0.8-120));
  const bumps=(tn(x,z)-.5)*7+(tn(x*3.1+40,z*3.1)-.5)*2.4;
  let h=2.3+slope+hill+mountains+bumps*(1-smoothstep(-20,20,-z)*0.0);
  if(z<0){
    const sea=-3.5+z*0.06;
    h=lerp(h,sea,smoothstep(0,-6,z)*(1-smoothstep(-60,-100,x)*smoothstep(-110,-60,z)*smoothstep(40,-10,z)));
    h+=headland;
  }
  // the far shore across the bay
  const farShore=smoothstep(-260,-420,z)*(22+(tn(x*2,z*2)-.5)*18);
  h=Math.max(h,farShore-8+smoothstep(-260,-420,z)*8);
  // the square, the courtyard and the garden terraces are level
  const sq=smoothstep(34,26,Math.abs(x))*smoothstep(42,52,z)*smoothstep(98,90,z);
  h=lerp(h,8.4,sq);
  // the quay is paved flat behind its wall
  const quay=smoothstep(16,6,z)*smoothstep(-2,1,z)*smoothstep(106,96,Math.abs(x));
  h=lerp(h,2.3,quay);
  const beach=smoothstep(95,125,x)*smoothstep(30,8,z);
  h=lerp(h,1.6,beach*smoothstep(0,-6,-z)+beach*smoothstep(-6,0,z)*0.0);
  return h;
}

// Streets -----------------------------------------------------------------------------------
export const STREETS=[
  {pts:[[-96,8],[96,8]],w:11},
  {pts:[[0,12],[0,210]],w:9},
  {pts:[[-45,12],[-45,205]],w:7},{pts:[[45,12],[45,205]],w:7},
  {pts:[[-90,12],[-90,175]],w:7},{pts:[[90,12],[90,175]],w:7},
  {pts:[[-112,32],[112,32]],w:7},{pts:[[-112,112],[112,112]],w:7},{pts:[[-112,152],[112,152]],w:7},
  {pts:[[45,152],[80,176],[112,190],[128,214]],w:6},
  {pts:[[-45,152],[-70,185],[-80,225],[-82,255]],w:5},
];
function distToSegment(px,pz,ax,az,bx,bz){
  const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz;
  let t=l2?((px-ax)*dx+(pz-az)*dz)/l2:0;t=clamp(t,0,1);
  return Math.hypot(px-(ax+dx*t),pz-(az+dz*t));
}
export function streetDistance(x,z){
  let best=1e9;
  for(const s of STREETS)for(let i=0;i<s.pts.length-1;i++){
    const d=distToSegment(x,z,s.pts[i][0],s.pts[i][1],s.pts[i+1][0],s.pts[i+1][1])-s.w/2;
    if(d<best)best=d;
  }
  // the square is paved
  const sq=Math.max(Math.abs(x)-28,Math.max(48-z,z-94));
  return Math.min(best,sq);
}

// Buildings ---------------------------------------------------------------------------------
class Footprints{
  constructor(){this.list=[];}
  free(x0,z0,x1,z1,margin=1){for(const f of this.list)if(x0-margin<f[2]&&x1+margin>f[0]&&z0-margin<f[3]&&z1+margin>f[1])return false;return true;}
  add(x0,z0,x1,z1){this.list.push([x0,z0,x1,z1]);}
}

export function buildWorld(scene,noiseTexture,opts={}){
  const r=rng(opts.seed||7);
  const buildings=new GeoBuilder(),stone=new GeoBuilder(),foliageTrunks=new GeoBuilder();
  const footprints=new Footprints();
  const windows=[],awnings=[],lamps=[],chimneys=[],treeSpots=[];
  const clearance=[];// [x0,z0,x1,z1,top]
  const reserved=[];// no houses here
  const reserve=(x,z,w,d)=>{reserved.push([x-w/2,z-d/2,x+w/2,z+d/2]);footprints.add(x-w/2,z-d/2,x+w/2,z+d/2);};

  // Reserved ground: the square, the courtyard, the landmarks.
  reserve(0,70,62,52);           // square
  reserve(-22,44,16,14);         // bakery courtyard
  reserve(-60,-10,20,60);        // pier
  reserve(112,195,60,46);        // villa garden
  reserve(-80,258,40,34);        // cabin clearing
  reserve(135,10,36,40);         // hangar
  reserve(-150,-38,30,30);       // lighthouse

  function house(x,z,w,d,ry,opts={}){
    const floors=opts.floors||r.int(2,4),fh=3.25;
    const corners=[[-w/2,-d/2],[w/2,-d/2],[-w/2,d/2],[w/2,d/2]].map(([cx,cz])=>{
      const c=Math.cos(ry),s=Math.sin(ry);return terrainHeight(x+cx*c-cz*s,z+cx*s+cz*c);
    });
    const base=Math.min(...corners)-.6,top=Math.max(...corners)+floors*fh;
    const h=top-base;
    const wall=opts.wall||r.pick(WALLS),roofC=opts.roof||r.pick(ROOFS),frame=opts.frame||r.pick(FRAMES);
    buildings.add(new THREE.BoxGeometry(w,h,d),wall,M(x,base+h/2,z,ry));
    const roofH=opts.roofH||r.range(2.4,3.6),over=.55;
    const hip=opts.hip||(r()<.25);
    const roofGeo=hip?hipGeometry(w+over*2,roofH,d+over*2,.45):prismGeometry(w+over*2,roofH,d+over*2);
    buildings.add(roofGeo,roofC,M(x,top-.05,z,ry));
    // a pale band at the eave
    buildings.add(new THREE.BoxGeometry(w+.3,.35,d+.3),new THREE.Color(wall).multiplyScalar(.92),M(x,top-.35,z,ry));
    // chimneys
    const nChim=r.int(1,2);
    for(let i=0;i<nChim;i++){
      const cx=r.range(-w/2+1.2,w/2-1.2),cz=r.range(-1,1);
      const cy=top+roofH*(1-Math.abs(cz)/(d/2+over))-.3;
      buildings.add(new THREE.BoxGeometry(.9,1.9,.9),r.pick(['#a56a4e','#b9b0a0','#8e5a44']),M(x+cx*Math.cos(ry)-cz*Math.sin(ry),cy+.6,z+cx*Math.sin(ry)+cz*Math.cos(ry),ry));
      chimneys.push([x+cx*Math.cos(ry)-cz*Math.sin(ry),cy+1.6,z+cx*Math.sin(ry)+cz*Math.cos(ry)]);
    }
    // dormer
    if(!hip&&r()<.35){
      const dx=r.range(-w/4,w/4);
      const m=M(x+dx*Math.cos(ry)+(d/2-.9)*Math.sin(ry)*(r.sign()),top+1.0,z+dx*Math.sin(ry)-(d/2-.9)*Math.cos(ry)*0,ry);
      buildings.add(new THREE.BoxGeometry(1.8,1.8,2.0),wall,m);
      buildings.add(prismGeometry(2.2,.9,2.4),roofC,M(m.elements[12],top+1.9,m.elements[14],ry));
    }
    // windows: both long sides and the short sides, one row per floor
    const faces=[[0,0,1,d/2],[0,Math.PI,-1,d/2],[Math.PI/2,Math.PI/2,1,w/2],[-Math.PI/2,-Math.PI/2,-1,w/2]];
    for(const [fa,,sign,off] of faces){
      const len=(off===d/2)?w:d;
      const n=Math.max(1,Math.floor(len/3.2));
      for(let f=0;f<floors;f++){
        const y=base+.6+(Math.max(...corners)-base)+f*fh+fh*.55;
        for(let i=0;i<n;i++){
          const u=(i+.5)/n*len-len/2;
          const ground=f===0;
          if(ground&&opts.shop&&i===Math.floor(n/2)){
            // the door
            const lx=u,lz=off*sign+.04*sign;
            const [wx,wz]=rot(lx,lz,ry);
            windows.push({x:x+wx,y:y-fh*.25,z:z+wz,ry:ry+fa,w:1.3,h:2.4,color:'#5a3a2a'});
            const [ax,az]=rot(lx,lz+.9*sign,ry);
            awnings.push({x:x+ax,y:y+.75,z:z+az,ry:ry+fa,w:3.4,color:opts.awning||r.pick(['#c94c3c','#4f7a9b','#5b8c5a','#d9a441'])});
            continue;
          }
          let lx=u,lz=off*sign+.04*sign;
          if(off===w/2){lx=off*sign+.04*sign;lz=u;}
          const [wx,wz]=rot(lx,lz,ry);
          windows.push({x:x+wx,y:y,z:z+wz,ry:ry+fa,w:1.15,h:1.55,color:frame,shutters:opts.shutters});
        }
      }
    }
    const hw=Math.max(w,d)/2*1.05;
    clearance.push([x-hw,z-hw,x+hw,z+hw,top+roofH]);
    footprints.add(x-hw,z-hw,x+hw,z+hw);
    return {x,z,top,base,w,d,ry};
  }
  function rot(x,z,a){const c=Math.cos(a),s=Math.sin(a);return [x*c-z*s,x*s+z*c];}

  // Houses line each street on both sides.
  for(const s of STREETS){
    for(let i=0;i<s.pts.length-1;i++){
      const [ax,az]=s.pts[i],[bx,bz]=s.pts[i+1];
      const len=Math.hypot(bx-ax,bz-az),dirx=(bx-ax)/len,dirz=(bz-az)/len;
      const ry=Math.atan2(dirx,dirz);// street direction yaw
      for(const side of [-1,1]){
        let t=4;
        while(t<len-4){
          const w=r.range(8,14),d=r.range(8,12);
          if(t+w>len-3)break;
          const cx=ax+dirx*(t+w/2),cz=az+dirz*(t+w/2);
          const nx=-dirz*side,nz=dirx*side;// outward normal
          const px=cx+nx*(s.w/2+d/2+.4),pz=cz+nz*(s.w/2+d/2+.4);
          const big=Math.max(w,d)/2*1.05;
          const okStreet=streetDistance(px,pz)>d/2-1.5;
          const insideTown=pz>5&&pz<215&&Math.abs(px)<122;
          if(okStreet&&insideTown&&footprints.free(px-big,pz-big,px+big,pz+big,1.2)&&terrainHeight(px,pz)>1){
            const nearHarbour=pz<20,nearSquare=Math.abs(px)<40&&pz<110;
            const main=s.w>=9||pz<20;
            house(px,pz,w,d,ry+Math.PI/2*(side>0?1:-1)+Math.PI/2,{floors:nearHarbour?r.int(2,3):nearSquare?r.int(3,4):r.int(2,3),shop:main&&r()<.7,shutters:r()<.4});
            t+=w+r.range(.6,3.5);
          }else t+=3;
        }
      }
    }
  }

  // Landmarks ------------------------------------------------------------------------------
  const pads=[];
  function pad(name,who,x,z,y,radius,bloom,lines){pads.push({name,who,x,y,z,radius,bloom,lines});}

  // Osono's bakery on the corner below the square, with its courtyard.
  const bakery=house(-14,38,13,10,0,{floors:2,wall:'#f6e2c2',roof:'#b8563a',frame:'#f8f1e0',shop:true,awning:'#5b8c5a',roofH:3.2});
  buildings.add(new THREE.BoxGeometry(5,.5,2),'#5b8c5a',M(-14,bakery.top-5.2,33.4));
  pad('Osono’s bakery','Osono',-23,44,terrainHeight(-23,44),7,0,[]);

  // The clock tower at the head of the square.
  {
    const x=0,z=50,y0=terrainHeight(x,z)-1,hgt=40;
    stone.add(new THREE.BoxGeometry(9,hgt,9),'#c7b9a3',M(x,y0+hgt/2,z));
    stone.add(new THREE.BoxGeometry(10.4,2,10.4),'#b8aa94',M(x,y0+hgt-6,z));
    stone.add(new THREE.BoxGeometry(7.6,5,7.6),'#d8ccb6',M(x,y0+hgt+2.5,z));
    for(const [ox,oz,ry] of [[0,-3.85,0],[0,3.85,Math.PI],[3.85,0,Math.PI/2],[-3.85,0,-Math.PI/2]]){
      stone.add(new THREE.CylinderGeometry(2.6,2.6,.3,24),'#f6efdc',M(x+ox,y0+hgt+2.5,z+oz,ry,1,1,1,Math.PI/2));
      stone.add(new THREE.BoxGeometry(.25,2.0,.2),'#3a2a24',M(x+ox+(ox?0:0),y0+hgt+3.3,z+oz+(oz?0:0)+ (oz?Math.sign(oz)*.2:0),ry));
      stone.add(new THREE.BoxGeometry(.25,1.4,.2),'#3a2a24',M(x+ox+(ox?Math.sign(ox)*.2:0),y0+hgt+2.5+.1,z+oz+(oz?Math.sign(oz)*.2:0),ry,1,1,1,0,Math.PI/2.6));
    }
    stone.add(new THREE.ConeGeometry(6.2,9,4),'#4f7f72',M(x,y0+hgt+5+4.5,z,Math.PI/4));
    stone.add(new THREE.CylinderGeometry(.08,.08,4,6),'#5a4a3a',M(x,y0+hgt+16,z));
    stone.add(new THREE.BoxGeometry(2.2,1.2,.05),'#c94c3c',M(x+1.1,y0+hgt+17.5,z));
    for(let i=0;i<4;i++)stone.add(new THREE.BoxGeometry(1.6,3.2,.4),'#5a4a3a',M(x+(i%2?4.3:-4.3)*(i<2?1:0)+(i>=2?0:0),y0+hgt-10,z+(i>=2?(i%2?4.3:-4.3):0),i>=2?0:Math.PI/2));
    clearance.push([x-6,z-6,x+6,z+6,y0+hgt+16]);
    pad('The clockmaker, under the tower','the clockmaker',0,66,8.4,8,95,['The clock is slow. So is he.']);
  }
  // A fountain in the square
  stone.add(new THREE.CylinderGeometry(4.5,4.8,1.1,20),'#b9b0a0',M(0,8.95,74));
  stone.add(new THREE.CylinderGeometry(3.9,3.9,.4,20),'#5d86a8',M(0,9.3,74));
  stone.add(new THREE.CylinderGeometry(.5,.8,3,10),'#b9b0a0',M(0,10.5,74));
  stone.add(new THREE.CylinderGeometry(1.4,1.6,.4,16),'#b9b0a0',M(0,12,74));

  // The quay wall, the pier and the harbourmaster.
  stone.add(new THREE.BoxGeometry(200,6.5,3.2),'#b9ad9a',M(0,-1.0,1.4));
  stone.add(new THREE.BoxGeometry(200,.5,4),'#cfc5b2',M(0,2.35,1.6));
  for(let x=-90;x<=90;x+=12)stone.add(new THREE.CylinderGeometry(.45,.5,1.3,8),'#5a4a3a',M(x,3.1,.6));
  stone.add(new THREE.BoxGeometry(8,1.2,36),'#c9bca6',M(-60,2.2,-14));
  for(let z=-28;z<=0;z+=6)for(const sx of [-1,1])stone.add(new THREE.CylinderGeometry(.5,.55,6,8),'#7a6350',M(-60+sx*3.6,-.5,z));
  const hm=house(-60,-26,7,6,0,{floors:1,wall:'#f3e0c0',roof:'#5c6673',frame:'#fbf6e8',hip:true,roofH:2.2});
  stone.add(new THREE.CylinderGeometry(.08,.08,7,6),'#5a4a3a',M(-55.5,hm.top+3,-28.5));
  stone.add(new THREE.BoxGeometry(2,1.2,.05),'#4f7a9b',M(-54.5,hm.top+6,-28.5));
  pad('The harbourmaster, end of the pier','the harbourmaster',-60,-12,2.8,6,90,['Everything here smells of herring. I approve.']);
  // Warehouses on the quay east end, and a crane.
  for(const [x,w] of [[60,16],[78,14]])house(x,22,w,12,0,{floors:2,wall:r.pick(['#d9cdb5','#cfc3ad']),roof:'#6e6f7a',frame:'#8f6a4a',hip:true});
  stone.add(new THREE.BoxGeometry(1.2,14,1.2),'#7a6350',M(40,9,4));
  stone.add(new THREE.BoxGeometry(12,.8,.8),'#7a6350',M(45,16,4,0,1,1,1,0,-.2));

  // Tombo's hangar on the east beach.
  {
    const x=135,z=12,y0=1.6;
    buildings.add(new THREE.BoxGeometry(22,8,26),'#9fb3bf',M(x,y0+4,z));
    buildings.add(new THREE.CylinderGeometry(11.4,11.4,27,16,1,false,0,Math.PI),'#c0583a',M(x,y0+8,z,0,1,1,1,Math.PI/2,0));
    buildings.add(new THREE.BoxGeometry(8,6,.4),'#5a4a3a',M(x,y0+3,z-13));
    stone.add(new THREE.CylinderGeometry(.08,.08,9,6),'#5a4a3a',M(x+13,y0+4.5,z-12));
    stone.add(new THREE.BoxGeometry(2.2,1.2,.05),'#d9a441',M(x+14.1,y0+8.4,z-12));
    clearance.push([x-12,z-14,x+12,z+14,y0+20]);
    pad('Tombo’s hangar, on the beach','Tombo',135,-8,1.6,7,85,['He built a bicycle with wings. I am not getting on it.']);
  }

  // Madame's villa and garden on the hill to the east.
  {
    const x=112,z=200,y0=terrainHeight(x,z);
    const v=house(x,z,18,12,0,{floors:2,wall:'#f6ecd8',roof:'#6e6f7a',frame:'#cdd8c3',hip:true,roofH:4.2});
    buildings.add(new THREE.BoxGeometry(20,.6,3),'#f6ecd8',M(x,v.base+(v.top-v.base)*.45,z-7.2));
    for(let i=-2;i<=2;i++)buildings.add(new THREE.CylinderGeometry(.3,.3,v.top-v.base-.5,8),'#fbf6e8',M(x+i*4,v.base+(v.top-v.base)/2,z-7.2));
    for(let i=-3;i<=3;i++){
      stone.add(new THREE.TorusGeometry(2,.14,6,12,Math.PI),'#fbf6e8',M(x+i*5,y0+.2,z-16,0,1,1,1,0,0));
      for(let k=0;k<4;k++)stone.add(new THREE.SphereGeometry(.55,6,5),r.pick(['#e36f8a','#f29bb0','#d94f6e']),M(x+i*5+Math.cos(k*.8)*2,y0+.4+Math.sin(k*.8)*2,z-16+(k%2?.3:-.3)));
    }
    stone.add(new THREE.CylinderGeometry(5,5.3,.6,16),'#5d86a8',M(x+16,y0+.3,z-14));
    for(const [ox,oz] of [[-14,-4],[14,-4],[-14,6],[14,6],[-6,-22],[6,-22]])treeSpots.push([x+ox,z+oz,1.3]);
    clearance.push([x-12,z-10,x+12,z+10,v.top+5]);
    pad('Madame’s villa, up the hill','Madame',x,z-12,y0,8,110,['Porcelain. Carry it like it is a cat. Gently. Like a cat.']);
  }

  // Ursula's cabin in the forest.
  {
    const x=-80,z=258,y0=terrainHeight(x,z);
    buildings.add(new THREE.BoxGeometry(9,4.2,7),'#7a5a3e',M(x,y0+2.1,z));
    buildings.add(prismGeometry(10.5,2.6,8.5),'#5c4a3a',M(x,y0+4.1,z));
    buildings.add(new THREE.BoxGeometry(9,.4,4),'#8a6a4a',M(x,y0+.2,z-5.5));
    for(const ox of [-4,4])buildings.add(new THREE.CylinderGeometry(.14,.14,2.2,6),'#5c4a3a',M(x+ox,y0+1.3,z-7.3));
    buildings.add(new THREE.BoxGeometry(1.2,2.2,.3),'#f2e6c4',M(x+2.5,y0+1.6,z-3.4));
    buildings.add(new THREE.BoxGeometry(1.6,1.4,.3),'#f2e6c4',M(x-3,y0+2.4,z-3.4));
    chimneys.push([x+3,y0+6.4,z+1]);
    buildings.add(new THREE.BoxGeometry(.9,2.2,.9),'#8e5a44',M(x+3,y0+5.4,z+1));
    clearance.push([x-6,z-5,x+6,z+5,y0+8]);
    pad('Ursula’s cabin, in the forest','Ursula',x,z-12,terrainHeight(x,z-12),7,120,['She paints. You paint. I nap. Everyone has a gift.']);
  }

  // The lighthouse on the headland.
  {
    const x=-150,z=-38,y0=terrainHeight(x,z)-1;
    stone.add(new THREE.CylinderGeometry(3.2,4.2,26,16),'#f4efe2',M(x,y0+13,z));
    stone.add(new THREE.CylinderGeometry(3.45,3.45,4,16),'#c94c3c',M(x,y0+9,z));
    stone.add(new THREE.CylinderGeometry(3.45,3.45,4,16),'#c94c3c',M(x,y0+19,z));
    stone.add(new THREE.CylinderGeometry(4.2,4.2,.8,16),'#3a3a44',M(x,y0+26.4,z));
    stone.add(new THREE.CylinderGeometry(2.6,2.6,3.6,12),'#9ec5d8',M(x,y0+28.5,z));
    stone.add(new THREE.ConeGeometry(3.4,3,12),'#c94c3c',M(x,y0+31.8,z));
    const keeper=house(x+12,z+4,8,7,0,{floors:1,wall:'#f4efe2',roof:'#6e6f7a',frame:'#4f7a9b',roofH:2.4});
    chimneys.push([x+14,keeper.top+2.4,z+4]);
    clearance.push([x-5,z-5,x+5,z+5,y0+34]);
    pad('The lighthouse keeper, on the headland','the lighthouse keeper',x-2,z+12,terrainHeight(x-2,z+12),7,130,['Round and round the light goes. I could watch it all night. I will not.']);
  }

  // The airship moored over the bay, with its landing deck.
  const airship=new THREE.Group();
  {
    const g=new GeoBuilder();
    g.add(new THREE.SphereGeometry(1,28,18),'#dcd6cc',M(0,0,0,0,36,8.5,8.5));
    g.add(new THREE.BoxGeometry(14,2,.4),'#c94c3c',M(-30,2,0,0,1,1,1,0,.2));
    g.add(new THREE.BoxGeometry(14,.4,2),'#c94c3c',M(-30,0,0,0,1,1,1,0,0));
    g.add(new THREE.BoxGeometry(14,2,.4),'#c94c3c',M(-30,-2,0,0,1,1,1,0,-.2));
    g.add(new THREE.BoxGeometry(70,.5,.5),'#b7ad9d',M(0,-8.2,0));
    g.add(new THREE.BoxGeometry(16,3.4,5),'#5c4a3a',M(2,-10.6,0));
    g.add(new THREE.BoxGeometry(12,1.6,4.2),'#f2e6c4',M(2,-10.2,0));
    g.add(new THREE.BoxGeometry(22,.5,9),'#8a6a4a',M(-2,-12.7,0));
    for(const ox of [-10,10])g.add(new THREE.CylinderGeometry(1.3,1.3,1.2,10),'#3a3a44',M(ox,-9.5,0,0,1,1,1,0,Math.PI/2));
    const mesh=new THREE.Mesh(g.build(),paintedMaterial({inSky:true}));
    airship.add(mesh);
    airship.position.set(20,70,-150);
    scene.add(airship);
    pad('The airship, over the bay','the captain',20,-150,70-12.4,6,1000,['Do not look down. I looked down.']);
  }

  // The far shore across the bay: a hill town in the haze.
  for(let i=0;i<70;i++){
    const x=r.range(-320,320),z=r.range(-300,-420);
    const y=terrainHeight(x,z);
    if(y<4)continue;
    const w=r.range(6,14),d=r.range(6,12),h=r.range(6,14);
    buildings.add(new THREE.BoxGeometry(w,h,d),r.pick(WALLS),M(x,y+h/2-1,z,r()*0.6));
    buildings.add(prismGeometry(w+1,r.range(2,3.5),d+1),r.pick(ROOFS),M(x,y+h-1,z,0));
  }
  stone.add(new THREE.CylinderGeometry(2,2.6,24,10),'#f4efe2',M(60,terrainHeight(60,-360)+10,-360));

  // Trees: the square, gardens behind the houses, the forest on the hill, the headland.
  for(let i=-2;i<=2;i++){treeSpots.push([-22,58+i*8,1.1]);treeSpots.push([22,58+i*8,1.1]);}
  for(let i=0;i<900;i++){
    const x=r.range(-130,130),z=r.range(14,330);
    const d=streetDistance(x,z);
    const forest=z>215;
    if(!forest&&d<2.5)continue;
    if(forest&&r()<.25)continue;
    const big=1.2;
    if(!footprints.free(x-big,z-big,x+big,z+big,.5))continue;
    if(!forest&&r()<.62)continue;
    treeSpots.push([x,z,forest?r.range(1.1,1.9):r.range(.7,1.3)]);
  }
  for(let i=0;i<40;i++){const x=r.range(-175,-110),z=r.range(-70,10);if(terrainHeight(x,z)>6&&dist2(x,z,-150,-38)>9)treeSpots.push([x,z,r.range(.6,1)]);}
  for(let i=0;i<120;i++){const x=r.range(-300,300),z=r.range(-300,-400);if(terrainHeight(x,z)>5)treeSpots.push([x,z,r.range(1,1.8)]);}

  // Lamps along the main street, the quay and the square.
  for(let z=16;z<=200;z+=16)for(const sx of [-1,1])lamps.push([sx*5.6,z]);
  for(let x=-84;x<=84;x+=14)lamps.push([x,2.4]);
  for(const [x,z] of [[-26,52],[26,52],[-26,92],[26,92],[-12,74],[12,74]])lamps.push([x,z]);

  // Boats
  const boats=[];
  for(let i=0;i<14;i++){
    const x=r.range(-45,95),z=r.range(-18,-95);
    boats.push({x,z,ry:r()*Math.PI*2,phase:r()*6.28,scale:r.range(.8,1.5),color:r.pick(['#f1e3c6','#4f7a9b','#c94c3c','#d9a441','#dfe3d6','#5b8c5a'])});
  }

  // Materials and meshes ---------------------------------------------------------------------
  const painted=paintedMaterial();
  const group=new THREE.Group();
  const bMesh=new THREE.Mesh(buildings.build(),painted);bMesh.name='buildings';group.add(bMesh);
  const sMesh=new THREE.Mesh(stone.build(),painted);sMesh.name='stone';group.add(sMesh);

  // Terrain: a fine grid over the town and a coarse grid out to the mountains.
  group.add(terrainMesh(-260,260,-140,340,2.6,painted,r,[-260,260,-140,340]));
  group.add(terrainMesh(-900,900,-700,900,22,painted,r,[-260,260,-140,340],true));

  // Windows (instanced quads)
  const winGeo=new THREE.PlaneGeometry(1,1);
  const winMat=windowMaterial();
  const winMesh=new THREE.InstancedMesh(winGeo,winMat,windows.length);
  const tmp=new THREE.Object3D(),col=new THREE.Color();
  windows.forEach((w,i)=>{tmp.position.set(w.x,w.y,w.z);tmp.rotation.set(0,w.ry,0);tmp.scale.set(w.w,w.h,1);tmp.updateMatrix();winMesh.setMatrixAt(i,tmp.matrix);winMesh.setColorAt(i,col.set(w.color));});
  winMesh.name='windows';group.add(winMesh);
  // shutters as thin painted boxes beside shuttered windows
  {
    const sh=new GeoBuilder();
    for(const w of windows)if(w.shutters){
      for(const s of [-1,1]){const [ox,oz]=rot(s*(w.w/2+.3),.02,w.ry);sh.add(new THREE.BoxGeometry(.5,w.h,.08),r.pick(['#5b8c5a','#4f7a9b','#8f6a4a','#c94c3c']),M(w.x+ox,w.y,w.z+oz,w.ry));}
    }
    if(!sh.empty)group.add(new THREE.Mesh(sh.build(),painted));
  }
  // awnings
  {
    const aw=new GeoBuilder();
    for(const a of awnings){
      const g=new THREE.BoxGeometry(a.w,.12,1.6);
      aw.add(g,a.color,M(a.x,a.y,a.z,a.ry,1,1,1,-.35,0));
      aw.add(new THREE.BoxGeometry(a.w,.3,.1),new THREE.Color(a.color).multiplyScalar(.85),M(a.x,a.y-.33,a.z,a.ry));
    }
    if(!aw.empty)group.add(new THREE.Mesh(aw.build(),painted));
  }
  // Trees
  const treeGeo=(()=>{
    const g=new GeoBuilder();
    g.add(new THREE.CylinderGeometry(.22,.3,2.2,6),'#6b4a33',M(0,1.1,0));
    g.add(new THREE.SphereGeometry(1.8,8,6),'#ffffff',M(0,3.2,0,0,1,.85,1));
    g.add(new THREE.SphereGeometry(1.4,8,6),'#ffffff',M(.9,4.2,.3,0,1,.8,1));
    g.add(new THREE.SphereGeometry(1.3,8,6),'#ffffff',M(-.8,4.0,-.4,0,1,.85,1));
    g.add(new THREE.SphereGeometry(1.1,8,6),'#ffffff',M(.1,5.0,-.2,0,1,.8,1));
    return g.build();
  })();
  const treeMat=paintedMaterial({anim:3,freq:.9,amp:.5});
  const trees=new THREE.InstancedMesh(treeGeo,treeMat,treeSpots.length);
  treeSpots.forEach(([x,z,s],i)=>{tmp.position.set(x,terrainHeight(x,z)-.2,z);tmp.rotation.set(0,r()*6.28,0);tmp.scale.setScalar(s);tmp.updateMatrix();trees.setMatrixAt(i,tmp.matrix);trees.setColorAt(i,col.set(r.pick(CANOPY)));});
  trees.name='trees';group.add(trees);
  for(const [x,z,s] of treeSpots)clearance.push([x-2*s,z-2*s,x+2*s,z+2*s,terrainHeight(x,z)+6*s]);
  // Lamps
  {
    const post=new GeoBuilder();
    post.add(new THREE.CylinderGeometry(.07,.1,4.2,6),'#3a3a44',M(0,2.1,0));
    post.add(new THREE.BoxGeometry(.4,.1,.4),'#3a3a44',M(0,4.25,0));
    const head=new GeoBuilder();head.add(new THREE.BoxGeometry(.55,.7,.55),'#f6e7b0',M(0,4.6,0));
    head.add(new THREE.ConeGeometry(.5,.35,4),'#3a3a44',M(0,5.1,0,Math.PI/4));
    const posts=new THREE.InstancedMesh(post.build(),painted,lamps.length);
    const heads=new THREE.InstancedMesh(head.build(),paintedMaterial({glow:1,glowColor:0xffd27a}),lamps.length);
    lamps.forEach(([x,z],i)=>{tmp.position.set(x,terrainHeight(x,z),z);tmp.rotation.set(0,0,0);tmp.scale.setScalar(1);tmp.updateMatrix();posts.setMatrixAt(i,tmp.matrix);heads.setMatrixAt(i,tmp.matrix);});
    group.add(posts,heads);
  }
  // Boats
  const boatGeo=(()=>{
    const g=new GeoBuilder();
    g.add(new THREE.BoxGeometry(2.2,1.1,5.4),'#ffffff',M(0,.4,0));
    g.add(new THREE.ConeGeometry(1.1,1.8,4),'#ffffff',M(0,.4,3.6,Math.PI/4,1,1,1,Math.PI/2,0));
    g.add(new THREE.BoxGeometry(1.6,.9,1.8),'#f2e6c4',M(0,1.3,-.8));
    g.add(new THREE.CylinderGeometry(.06,.08,5,6),'#5a4a3a',M(0,3.2,.6));
    g.add(new THREE.BoxGeometry(.06,2.2,1.6),'#f6f1e0',M(.1,4.0,1.2));
    return g.build();
  })();
  const boatMesh=new THREE.InstancedMesh(boatGeo,painted,boats.length);
  boats.forEach((b,i)=>boatMesh.setColorAt(i,col.set(b.color)));
  boatMesh.name='boats';group.add(boatMesh);
  // Gulls
  const gullGeo=(()=>{
    const g=new GeoBuilder();
    g.add(new THREE.BoxGeometry(.5,.08,.9),'#f6f1e0',M(0,0,0),0);
    g.add(new THREE.BoxGeometry(1.4,.05,.42),'#f6f1e0',M(.75,0,.05,0,1,1,1,0,0),(x)=>Math.abs(x));
    g.add(new THREE.BoxGeometry(1.4,.05,.42),'#f6f1e0',M(-.75,0,.05,0,1,1,1,0,0),(x)=>Math.abs(x));
    g.add(new THREE.ConeGeometry(.08,.3,4),'#d9a441',M(0,0,.6,0,1,1,1,Math.PI/2,0),0);
    return g.build();
  })();
  const gulls=[];for(let i=0;i<22;i++)gulls.push({cx:r.range(-70,60),cz:r.range(-60,10),rad:r.range(12,40),h:r.range(8,26),a:r()*6.28,speed:r.range(.25,.5)*r.sign()});
  const gullMesh=new THREE.InstancedMesh(gullGeo,paintedMaterial({anim:2,freq:9,amp:.45,sway:true}),gulls.length);
  gullMesh.name='gulls';group.add(gullMesh);
  // Clouds
  const cloudGeo=(()=>{
    const g=new GeoBuilder();
    for(let i=0;i<6;i++){const s=r.range(5,10);g.add(new THREE.SphereGeometry(s,10,7),'#fbf8f0',M(r.range(-14,14),r.range(-1,3),r.range(-4,4),0,1,.55,1));}
    return g.build();
  })();
  const clouds=[];for(let i=0;i<26;i++)clouds.push({x:r.range(-500,500),y:r.range(75,150),z:r.range(-500,420),s:r.range(1,2.4),v:r.range(.6,1.4)});
  const cloudMesh=new THREE.InstancedMesh(cloudGeo,paintedMaterial({inSky:true}),clouds.length);cloudMesh.name='clouds';group.add(cloudMesh);
  // Smoke puffs from chimneys
  const puffs=[];const puffMesh=new THREE.InstancedMesh(new THREE.SphereGeometry(1,7,5),paintedMaterial({flat:true}),90);
  puffMesh.setColorAt(0,new THREE.Color('#e8e4dc'));
  for(let i=0;i<90;i++){puffMesh.setColorAt(i,col.set('#d8d6d2'));puffs.push({life:r()*7,chim:chimneys[r.int(0,chimneys.length-1)],dx:r.range(-.3,.3),dz:r.range(-.3,.3)});}
  puffMesh.name='smoke';group.add(puffMesh);

  // Sea and sky
  const sea=new THREE.Mesh(new THREE.PlaneGeometry(2400,1800,160,120),seaMaterial());
  sea.rotation.x=-Math.PI/2;sea.position.set(0,0,-500);sea.name='sea';sea.layers.set(1);group.add(sea);
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1500,32,16),skyMaterial());sky.name='sky';sky.layers.set(1);group.add(sky);
  scene.add(group);

  // Delivery rings: a ribbon circle on the ground at each address.
  const rings=new THREE.Group();
  for(const p of pads){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(p.radius,.25,6,40),paintedMaterial({flat:true}));
    ring.geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Array(ring.geometry.attributes.position.count*3).fill(0).map((_,i)=>[.86,.26,.2][i%3]),3));
    ring.rotation.x=Math.PI/2;ring.position.set(p.x,p.y+.35,p.z);ring.visible=false;p.ring=ring;rings.add(ring);
  }
  scene.add(rings);

  // The quay, the pier and the fountain are solid too.
  clearance.push([-100,-.2,100,3.4,2.7],[-64,-32,-56,4,2.9],[-5,69,5,79,12.4]);
  // Collision clearance: a coarse grid of the highest thing at each cell.
  const grid={x0:-320,z0:-220,cell:4,nx:160,nz:150};
  grid.h=new Float32Array(grid.nx*grid.nz);
  for(let j=0;j<grid.nz;j++)for(let i=0;i<grid.nx;i++){
    const x=grid.x0+(i+.5)*grid.cell,z=grid.z0+(j+.5)*grid.cell;
    grid.h[j*grid.nx+i]=Math.max(terrainHeight(x,z),0);
  }
  for(const [x0,z0,x1,z1,top] of clearance){
    const i0=clamp(Math.floor((x0-grid.x0)/grid.cell),0,grid.nx-1),i1=clamp(Math.floor((x1-grid.x0)/grid.cell),0,grid.nx-1);
    const j0=clamp(Math.floor((z0-grid.z0)/grid.cell),0,grid.nz-1),j1=clamp(Math.floor((z1-grid.z0)/grid.cell),0,grid.nz-1);
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)grid.h[j*grid.nx+i]=Math.max(grid.h[j*grid.nx+i],top);
  }
  function clearanceAt(x,z){
    const i=Math.floor((x-grid.x0)/grid.cell),j=Math.floor((z-grid.z0)/grid.cell);
    if(i<0||j<0||i>=grid.nx||j>=grid.nz)return Math.max(terrainHeight(x,z),0);
    return grid.h[j*grid.nx+i];
  }

  // Animation of the living parts.
  const airshipBase=airship.position.clone();
  function update(t,dt){
    boats.forEach((b,i)=>{
      tmp.position.set(b.x,Math.sin(t*.7+b.phase)*.3+.1,b.z);
      tmp.rotation.set(Math.sin(t*.9+b.phase)*.05,b.ry,Math.sin(t*.6+b.phase)*.08);
      tmp.scale.setScalar(b.scale);tmp.updateMatrix();boatMesh.setMatrixAt(i,tmp.matrix);
    });
    boatMesh.instanceMatrix.needsUpdate=true;
    gulls.forEach((g,i)=>{
      g.a+=g.speed*dt;
      const x=g.cx+Math.cos(g.a)*g.rad,z=g.cz+Math.sin(g.a)*g.rad;
      tmp.position.set(x,g.h+Math.sin(t*.8+i)*1.5,z);
      tmp.rotation.set(0,-g.a-(g.speed>0?0:Math.PI),(g.speed>0?-1:1)*.3);
      tmp.scale.setScalar(1);tmp.updateMatrix();gullMesh.setMatrixAt(i,tmp.matrix);
    });
    gullMesh.instanceMatrix.needsUpdate=true;
    clouds.forEach((c,i)=>{
      c.x+=c.v*dt;if(c.x>560)c.x=-560;
      tmp.position.set(c.x,c.y,c.z);tmp.rotation.set(0,0,0);tmp.scale.setScalar(c.s);tmp.updateMatrix();cloudMesh.setMatrixAt(i,tmp.matrix);
    });
    cloudMesh.instanceMatrix.needsUpdate=true;
    puffs.forEach((p,i)=>{
      p.life+=dt;if(p.life>7){p.life=0;p.chim=chimneys[r.int(0,chimneys.length-1)];p.dx=r.range(-.4,.4);p.dz=r.range(-.4,.4);}
      const k=p.life/7,[x,y,z]=p.chim;
      tmp.position.set(x+p.dx*p.life+Math.sin(t+i)*.3,y+p.life*1.1,z+p.dz*p.life+1.2*p.life);
      tmp.rotation.set(0,0,0);tmp.scale.setScalar(.08+k*.3);tmp.updateMatrix();puffMesh.setMatrixAt(i,tmp.matrix);
    });
    puffMesh.instanceMatrix.needsUpdate=true;
    airship.position.set(airshipBase.x+Math.sin(t*.13)*2,airshipBase.y+Math.sin(t*.21)*1.2,airshipBase.z);
    airship.rotation.z=Math.sin(t*.17)*.01;
    pads[pads.length-1].y=airship.position.y-12.4;
    pads[pads.length-1].x=airship.position.x;
    const ring=pads[pads.length-1].ring;ring.position.set(airship.position.x,airship.position.y-12.1,airship.position.z);
  }

  return {group,pads,update,heightAt:terrainHeight,clearanceAt,streetDistance,airship,windowCount:windows.length,treeCount:treeSpots.length,chimneys};
}

// A terrain patch coloured by what covers it: grass, cobbles, sand, rock, forest floor, sea bed.
function terrainMesh(x0,x1,z0,z1,step,material,r,hole,coarse){
  const nx=Math.ceil((x1-x0)/step),nz=Math.ceil((z1-z0)/step);
  const pos=[],colr=[],idx=[];
  const c=new THREE.Color();
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
    const x=x0+i*step,z=z0+j*step,y=terrainHeight(x,z);
    pos.push(x,y,z);
    const d=streetDistance(x,z);
    const n=tn(x*5,z*5);
    if(y<0.5){c.set('#4d7390');}
    else if(z>215&&Math.abs(x)<200){c.set(n>.5?'#4f7a44':'#5b8a4b');}
    else if(y>95){c.set(n>.5?'#9aa5a8':'#8d9aa0');}
    else if(x>95&&z<30&&x<180){c.set(n>.5?'#e8d8a8':'#e2d09c');}
    else if(x<-100&&z<30){c.set(n>.5?'#a9b48a':'#b7b19a');}
    else if(d<0.5&&z<215){c.set(n>.5?'#cbc1b0':'#c0b6a5');}
    else if(d<2.2&&z<215){c.set('#b6ad98');}
    else {c.set(n>.5?'#8fb067':n>.25?'#9bb86f':'#7fa65e');}
    colr.push(c.r,c.g,c.b);
  }
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const x=x0+(i+.5)*step,z=z0+(j+.5)*step;
    if(coarse&&x>hole[0]&&x<hole[1]&&z>hole[2]&&z<hole[3])continue;
    const a=j*(nx+1)+i,b=a+1,cI=a+nx+1,d=cI+1;
    idx.push(a,cI,b,b,cI,d);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colr,3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,material);mesh.name=coarse?'terrain-far':'terrain';
  return mesh;
}
