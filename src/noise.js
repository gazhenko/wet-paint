// Seeded randomness and the tileable noise textures the shaders paint with.
import * as THREE from 'three';

export function rng(seed){
  let s=seed>>>0||1;
  const r=()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};
  r.range=(a,b)=>a+(b-a)*r();
  r.int=(a,b)=>Math.floor(r.range(a,b+1));
  r.pick=arr=>arr[Math.floor(r()*arr.length)];
  r.sign=()=>r()<.5?-1:1;
  return r;
}

// Tileable value noise on a size×size lattice (period = size in texels).
function valueNoiseTile(size,period,seed){
  const r=rng(seed), lattice=new Float32Array(period*period);
  for(let i=0;i<lattice.length;i++)lattice[i]=r();
  const out=new Float32Array(size*size), cell=size/period;
  const fade=t=>t*t*(3-2*t);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const gx=x/cell,gy=y/cell,x0=Math.floor(gx),y0=Math.floor(gy),fx=fade(gx-x0),fy=fade(gy-y0);
    const x1=(x0+1)%period,y1=(y0+1)%period;
    const a=lattice[y0*period+x0],b=lattice[y0*period+x1],c=lattice[y1*period+x0],d=lattice[y1*period+x1];
    out[y*size+x]=(a+(b-a)*fx)+((c+(d-c)*fx)-(a+(b-a)*fx))*fy;
  }
  return out;
}

export function fbmTile(size,basePeriod,octaves,seed){
  const out=new Float32Array(size*size);let amp=.5,period=basePeriod,sum=0;
  for(let o=0;o<octaves;o++){
    const n=valueNoiseTile(size,Math.min(size,period),seed+o*101);
    for(let i=0;i<out.length;i++)out[i]+=n[i]*amp;
    sum+=amp;amp*=.5;period*=2;
  }
  for(let i=0;i<out.length;i++)out[i]/=sum;
  return out;
}

// RGBA noise texture: R soft fbm (brush wobble), G a second fbm (bloom edges, shadow wobble),
// B fine grain (granulation), A medium speckle (paper).
export function makeNoiseTexture(){
  const size=256,data=new Uint8Array(size*size*4);
  const r=fbmTile(size,4,5,11),g=fbmTile(size,6,4,29),b=fbmTile(size,64,2,43),a=fbmTile(size,16,3,77);
  for(let i=0;i<size*size;i++){data[i*4]=r[i]*255;data[i*4+1]=g[i]*255;data[i*4+2]=b[i]*255;data[i*4+3]=a[i]*255;}
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;
  tex.generateMipmaps=true;tex.needsUpdate=true;
  return tex;
}

// Cold-pressed paper: fibres, a soft mottle and specks, tileable.
export function makePaperTexture(){
  const size=512,c=document.createElement('canvas');c.width=c.height=size;
  const ctx=c.getContext('2d'),r=rng(5);
  ctx.fillStyle='#f3eedc';ctx.fillRect(0,0,size,size);
  const mottle=fbmTile(size,8,4,3),img=ctx.getImageData(0,0,size,size),d=img.data;
  for(let i=0;i<size*size;i++){
    const m=(mottle[i]-.5)*18,s=(r()-.5)*10;
    d[i*4]=Math.min(255,243+m+s);d[i*4+1]=Math.min(255,238+m+s);d[i*4+2]=Math.min(255,220+m*.9+s);
  }
  ctx.putImageData(img,0,0);
  ctx.strokeStyle='rgba(120,100,80,0.07)';ctx.lineWidth=1;
  for(let i=0;i<900;i++){
    const x=r()*size,y=r()*size,l=r.range(4,22),a=r()*Math.PI;
    for(const [ox,oy] of [[0,0],[size,0],[-size,0],[0,size],[0,-size]]){
      ctx.beginPath();ctx.moveTo(x+ox,y+oy);ctx.lineTo(x+ox+Math.cos(a)*l,y+oy+Math.sin(a)*l);ctx.stroke();
    }
  }
  ctx.fillStyle='rgba(90,70,50,0.10)';
  for(let i=0;i<500;i++){const x=r()*size,y=r()*size;ctx.fillRect(x,y,1,1);}
  const tex=new THREE.CanvasTexture(c);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.colorSpace=THREE.NoColorSpace;
  return tex;
}
