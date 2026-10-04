// The broom: an arcade flight model that banks into turns, and a chase camera that lags behind.
import * as THREE from 'three';
import {damp,clamp,lerp} from './util.js';

export class Input{
  constructor(){
    this.keys=new Set();this.turn=0;this.climb=0;this.boost=false;this.brake=false;this.any=false;this.pressed=new Set();
    addEventListener('keydown',e=>{if(e.repeat)return;this.keys.add(e.code);this.pressed.add(e.code);this.any=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();});
    addEventListener('keyup',e=>this.keys.delete(e.code));
    addEventListener('blur',()=>this.keys.clear());
    this.override=null;
  }
  poll(){
    if(this.override){Object.assign(this,this.override);return;}
    const k=this.keys;
    let turn=(k.has('KeyA')||k.has('ArrowLeft')?-1:0)+(k.has('KeyD')||k.has('ArrowRight')?1:0);
    let climb=(k.has('KeyW')||k.has('ArrowUp')?1:0)+(k.has('KeyS')||k.has('ArrowDown')?-1:0);
    let boost=k.has('ShiftLeft')||k.has('ShiftRight');
    let brake=k.has('Space');
    const pads=navigator.getGamepads?navigator.getGamepads():[];
    for(const p of pads){
      if(!p)continue;
      const dz=v=>Math.abs(v)<.15?0:v;
      const ax=dz(p.axes[0]||0),ay=dz(p.axes[1]||0);
      if(ax)turn=ax;if(ay)climb=-ay;
      if(p.buttons[7]?.value>.3||p.buttons[0]?.pressed)boost=true;
      if(p.buttons[6]?.value>.3||p.buttons[2]?.pressed)brake=true;
      if(p.buttons.some(b=>b.pressed))this.any=true;
    }
    this.turn=clamp(turn,-1,1);this.climb=clamp(climb,-1,1);this.boost=boost;this.brake=brake;
  }
  took(code){const had=this.pressed.has(code);this.pressed.delete(code);return had;}
}

export class Flight{
  constructor(world){
    this.world=world;
    this.pos=new THREE.Vector3(0,19,118);
    this.yaw=Math.PI;this.pitch=0;this.roll=0;this.speed=0;this.vy=0;
    this.forward=new THREE.Vector3(0,0,-1);
    this.locked=false;this.bump=0;this.hover=false;
    this.accel=0;
  }
  update(dt,input){
    const w=this.world;
    if(this.locked){this.speed=damp(this.speed,0,6,dt);this.roll=damp(this.roll,0,4,dt);this.pitch=damp(this.pitch,0,4,dt);this.updateForward();return;}
    const brake=input.brake,boost=input.boost&&!brake;
    const target=brake?1.5:boost?42:19;
    const prev=this.speed;
    this.speed=damp(this.speed,target,brake?2.2:boost?1.1:1.4,dt);
    this.accel=(this.speed-prev)/Math.max(dt,1e-3);
    const bankTarget=input.turn*(.8+clamp(this.speed/40,0,1)*.35);
    this.roll=damp(this.roll,bankTarget,4.5,dt);
    const yawRate=this.roll*1.45*(.5+clamp(this.speed/25,0,1)*.6);
    this.yaw+=yawRate*dt;
    const pitchTarget=input.climb*.55;
    this.pitch=damp(this.pitch,pitchTarget,3.5,dt);
    this.updateForward();
    const vel=this.forward.clone().multiplyScalar(this.speed);
    // hovering sinks gently so Space is also how you land
    this.hover=brake&&this.speed<6;
    if(brake)vel.y-=lerp(1.4,.5,clamp(this.speed/19,0,1));
    this.pos.addScaledVector(vel,dt);
    // the ground and the roofs push the broom up
    const floor=w.clearanceAt(this.pos.x,this.pos.z)+1.3;
    const terrain=Math.max(w.heightAt(this.pos.x,this.pos.z),0)+1.3;
    const minY=Math.max(floor,terrain);
    if(this.pos.y<minY){
      const hard=minY-this.pos.y;
      this.pos.y=damp(this.pos.y,minY,12,dt);
      if(hard>1.2&&this.bump<=0){this.bump=1.5;}
      if(this.pitch<.1)this.pitch=damp(this.pitch,.25,6,dt);
    }
    if(this.pos.y>160){this.pos.y=160;this.pitch=Math.min(this.pitch,0);}
    // the page ends somewhere: steer back toward the town
    const far=Math.hypot(this.pos.x-0,this.pos.z-60);
    if(far>330){const back=Math.atan2(0-this.pos.x,60-this.pos.z);const d=Math.atan2(Math.sin(back-this.yaw),Math.cos(back-this.yaw));this.yaw+=d*dt*Math.min(2,(far-330)*.02+.6);this.edge=true;}else this.edge=false;
    this.bump=Math.max(0,this.bump-dt);
  }
  updateForward(){
    const cp=Math.cos(this.pitch);
    this.forward.set(Math.sin(this.yaw)*cp,Math.sin(this.pitch),Math.cos(this.yaw)*cp);
  }
  // Set the pose of the character group from the flight state.
  pose(group){
    group.position.copy(this.pos);
    group.rotation.set(0,0,0);
    group.rotation.y=this.yaw;
    group.rotateX(-this.pitch);
    group.rotateZ(-this.roll*.55);
  }
}

export class ChaseCamera{
  constructor(camera){
    this.camera=camera;this.pos=new THREE.Vector3();this.look=new THREE.Vector3();this.init=false;this.mode='chase';this.orbit=0;this.fov=56;
  }
  update(dt,flight,boost){
    if(this.mode==='fixed'){this.camera.position.copy(this.pos);this.camera.up.set(0,1,0);this.camera.lookAt(this.look);return;}
    const f=flight.forward,flat=new THREE.Vector3(f.x,0,f.z).normalize();
    let desired,lookAt,fovT=56+(boost?9:0)+clamp(flight.speed/42,0,1)*6;
    if(this.mode==='finale'){
      // rise away from the airship and watch the wash cross the town
      this.orbit+=dt;
      const k=clamp(this.orbit/16,0,1);
      desired=new THREE.Vector3(lerp(flight.pos.x+6,flight.pos.x+40,k),lerp(flight.pos.y+3,flight.pos.y+30,k),lerp(flight.pos.z+10,flight.pos.z+60,k));
      lookAt=new THREE.Vector3(lerp(flight.pos.x,0,k),lerp(flight.pos.y,20,k),lerp(flight.pos.z,60,k));
      fovT=lerp(50,58,k);
    }else if(this.mode==='chase'){
      const dist=6.5+flight.speed*.05;
      desired=flight.pos.clone().addScaledVector(flat,-dist).add(new THREE.Vector3(0,2.4+flight.pitch*-1.5,0));
      lookAt=flight.pos.clone().addScaledVector(f,7).add(new THREE.Vector3(0,.6,0));
    }else{
      this.orbit+=dt*.25;
      const a=flight.yaw+Math.PI*.78+Math.sin(this.orbit)*.25;
      desired=flight.pos.clone().add(new THREE.Vector3(Math.sin(a)*5.5,1.7,Math.cos(a)*5.5));
      lookAt=flight.pos.clone().add(new THREE.Vector3(0,.6,0));
      fovT=46;
    }
    if(!this.init){this.pos.copy(desired);this.look.copy(lookAt);this.init=true;}
    const k=this.mode==='chase'?5.5:this.mode==='finale'?1.2:2.2;
    this.pos.x=damp(this.pos.x,desired.x,k,dt);this.pos.y=damp(this.pos.y,desired.y,k,dt);this.pos.z=damp(this.pos.z,desired.z,k,dt);
    this.look.x=damp(this.look.x,lookAt.x,8,dt);this.look.y=damp(this.look.y,lookAt.y,8,dt);this.look.z=damp(this.look.z,lookAt.z,8,dt);
    // never look from under the ground
    const floor=flight.world.heightAt(this.pos.x,this.pos.z)+1.2;
    if(this.pos.y<floor)this.pos.y=floor;
    this.camera.position.copy(this.pos);
    this.camera.up.set(Math.sin(-flight.roll*.18),Math.cos(flight.roll*.18),0).applyAxisAngle(new THREE.Vector3(0,1,0),flight.yaw);
    this.camera.lookAt(this.look);
    this.fov=damp(this.fov,fovT,3,dt);
    if(Math.abs(this.camera.fov-this.fov)>.01){this.camera.fov=this.fov;this.camera.updateProjectionMatrix();}
  }
}
