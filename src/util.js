import * as THREE from 'three';

export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const lerp=(a,b,t)=>a+(b-a)*t;
export const smoothstep=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
export const damp=(a,b,lambda,dt)=>lerp(a,b,1-Math.exp(-lambda*dt));
export const wrapAngle=a=>{a=(a+Math.PI)%(Math.PI*2);if(a<0)a+=Math.PI*2;return a-Math.PI;};
export const dist2=(ax,az,bx,bz)=>Math.hypot(ax-bx,az-bz);

// Accumulates coloured geometry into one non-indexed buffer for a single draw call.
export class GeoBuilder{
  constructor(){this.pos=[];this.nor=[];this.col=[];this.sway=null;}
  add(geometry,color,matrix,sway){
    const g=geometry.index?geometry.toNonIndexed():geometry;
    if(!g.attributes.normal)g.computeVertexNormals();
    if(matrix){g.applyMatrix4(matrix);}
    const p=g.attributes.position.array,n=g.attributes.normal.array;
    const c=color instanceof THREE.Color?color:new THREE.Color(color);
    for(let i=0;i<p.length;i+=3){
      this.pos.push(p[i],p[i+1],p[i+2]);this.nor.push(n[i],n[i+1],n[i+2]);this.col.push(c.r,c.g,c.b);
      if(sway!==undefined){if(!this.sway)this.sway=new Array(this.pos.length/3-1).fill(0);this.sway.push(typeof sway==='function'?sway(p[i],p[i+1],p[i+2]):sway);}
      else if(this.sway)this.sway.push(0);
    }
    if(g!==geometry)g.dispose();
    return this;
  }
  build(){
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(this.pos,3));
    geo.setAttribute('normal',new THREE.Float32BufferAttribute(this.nor,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(this.col,3));
    if(this.sway)geo.setAttribute('sway',new THREE.Float32BufferAttribute(this.sway,1));
    geo.computeBoundingSphere();
    return geo;
  }
  get empty(){return this.pos.length===0;}
}

export const M=(x=0,y=0,z=0,ry=0,sx=1,sy=sx,sz=sx,rx=0,rz=0)=>new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz,'YXZ')),new THREE.Vector3(sx,sy,sz));

// A triangular prism, ridge along x: width w, ridge height h above its base, depth d.
export function prismGeometry(w,h,d){
  const x=w/2,z=d/2;
  const v=[];
  const tri=(a,b,c)=>{v.push(...a,...b,...c);};
  // ends
  tri([-x,0,-z],[-x,0,z],[-x,h,0]);
  tri([x,0,z],[x,0,-z],[x,h,0]);
  // slopes
  tri([-x,0,z],[x,0,z],[x,h,0]);tri([-x,0,z],[x,h,0],[-x,h,0]);
  tri([x,0,-z],[-x,0,-z],[-x,h,0]);tri([x,0,-z],[-x,h,0],[x,h,0]);
  // bottom
  tri([-x,0,-z],[x,0,-z],[x,0,z]);tri([-x,0,-z],[x,0,z],[-x,0,z]);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
  g.computeVertexNormals();
  return g;
}

// A hipped roof: a truncated pyramid with a short ridge.
export function hipGeometry(w,h,d,ridge=.4){
  const x=w/2,z=d/2,r=x*ridge;
  const v=[];const tri=(a,b,c)=>{v.push(...a,...b,...c);};
  tri([-x,0,z],[x,0,z],[r,h,0]);tri([-x,0,z],[r,h,0],[-r,h,0]);
  tri([x,0,-z],[-x,0,-z],[-r,h,0]);tri([x,0,-z],[-r,h,0],[r,h,0]);
  tri([x,0,z],[x,0,-z],[r,h,0]);
  tri([-x,0,-z],[-x,0,z],[-r,h,0]);
  tri([-x,0,-z],[x,0,-z],[x,0,z]);tri([-x,0,-z],[x,0,z],[-x,0,z]);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
  g.computeVertexNormals();
  return g;
}

export function capsuleGeometry(r,len,seg=8){return new THREE.CapsuleGeometry(r,len,4,seg);}
