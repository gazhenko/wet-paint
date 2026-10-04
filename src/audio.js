// Every sound is synthesized: wind in the bristles, the sea, gulls, a music-box waltz, a chime
// when a parcel lands and the hush of water running into paper.
import {clamp,lerp} from './util.js';

const A=[57,61,64],D=[62,66,69],E=[64,68,71],Fm=[66,69,73];
const BARS=[
  [[[76,3]],A],[[[73,1],[74,1],[76,1]],A],[[[81,3]],D],[[[80,1],[78,1],[76,1]],D],
  [[[78,3]],D],[[[74,1],[76,1],[78,1]],D],[[[76,2],[73,1]],E],[[[74,3]],E],
  [[[76,3]],A],[[[73,1],[74,1],[76,1]],A],[[[83,3]],Fm],[[[81,1],[80,1],[78,1]],Fm],
  [[[80,2],[76,1]],D],[[[78,2],[74,1]],E],[[[76,3]],A],[[[69,2],[0,1]],A],
];
const hz=m=>440*Math.pow(2,(m-69)/12);

export class Sound{
  constructor(){this.ctx=null;this.muted=false;this.speed=0;this.musicGain=null;}
  start(){
    if(this.ctx)return;
    const ctx=this.ctx=new (window.AudioContext||window.webkitAudioContext)();
    this.master=ctx.createGain();this.master.gain.value=.8;this.master.connect(ctx.destination);
    // a soft hall from decaying noise
    const len=ctx.sampleRate*2.2,ir=ctx.createBuffer(2,len,ctx.sampleRate);
    for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6)*.5;}
    this.reverb=ctx.createConvolver();this.reverb.buffer=ir;
    this.reverbGain=ctx.createGain();this.reverbGain.gain.value=.35;
    this.reverb.connect(this.reverbGain).connect(this.master);
    // noise source shared by the wind and the sea
    const nlen=ctx.sampleRate*2,nb=ctx.createBuffer(1,nlen,ctx.sampleRate),nd=nb.getChannelData(0);
    let b0=0,b1=0,b2=0;
    for(let i=0;i<nlen;i++){const w=Math.random()*2-1;b0=.997*b0+.029*w;b1=.985*b1+.032*w;b2=.95*b2+.048*w;nd[i]=(b0+b1+b2+w*.05)*.6;}
    this.noiseBuffer=nb;
    const noise=()=>{const s=ctx.createBufferSource();s.buffer=nb;s.loop=true;s.start();return s;};
    this.windFilter=ctx.createBiquadFilter();this.windFilter.type='bandpass';this.windFilter.Q.value=.7;this.windFilter.frequency.value=400;
    this.windGain=ctx.createGain();this.windGain.gain.value=0;
    noise().connect(this.windFilter).connect(this.windGain).connect(this.master);
    const seaFilter=ctx.createBiquadFilter();seaFilter.type='lowpass';seaFilter.frequency.value=420;
    this.seaGain=ctx.createGain();this.seaGain.gain.value=.12;
    const lfo=ctx.createOscillator();lfo.frequency.value=.11;const lfoGain=ctx.createGain();lfoGain.gain.value=.07;
    lfo.connect(lfoGain).connect(this.seaGain.gain);lfo.start();
    noise().connect(seaFilter).connect(this.seaGain).connect(this.master);
    this.musicGain=ctx.createGain();this.musicGain.gain.value=.5;this.musicGain.connect(this.master);this.musicGain.connect(this.reverb);
    this.fx=ctx.createGain();this.fx.gain.value=.9;this.fx.connect(this.master);this.fx.connect(this.reverb);
    this.bar=0;this.nextBar=ctx.currentTime+.4;this.tempo=150;
    this.timer=setInterval(()=>this.schedule(),80);
    this.nextGull=ctx.currentTime+4;
  }
  schedule(){
    const ctx=this.ctx,beat=60/this.tempo;
    while(this.nextBar<ctx.currentTime+.5){
      const [melody,chord]=BARS[this.bar%BARS.length];
      let t=this.nextBar;
      for(const [note,beats] of melody){if(note)this.bell(hz(note),t,beats*beat*1.6,.22);t+=beats*beat;}
      this.pluck(hz(chord[0]-12),this.nextBar,.08);
      for(const k of [1,2])for(const n of chord)this.pluck(hz(n),this.nextBar+k*beat,.035);
      this.nextBar+=3*beat;this.bar++;
    }
    if(ctx.currentTime>this.nextGull){this.gull();this.nextGull=ctx.currentTime+6+Math.random()*14;}
  }
  bell(f,t,dur,vol){
    const ctx=this.ctx;
    const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.006);g.gain.exponentialRampToValueAtTime(.0005,t+dur);
    g.connect(this.musicGain);
    for(const [mult,amp,type] of [[1,1,'sine'],[3.01,.16,'sine'],[2,.06,'triangle']]){
      const o=ctx.createOscillator();o.type=type;o.frequency.value=f*mult;const og=ctx.createGain();og.gain.value=amp;o.connect(og).connect(g);o.start(t);o.stop(t+dur+.05);
    }
  }
  pluck(f,t,vol){
    const ctx=this.ctx,o=ctx.createOscillator();o.type='triangle';o.frequency.value=f;
    const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.01);g.gain.exponentialRampToValueAtTime(.0005,t+.5);
    o.connect(g).connect(this.musicGain);o.start(t);o.stop(t+.55);
  }
  setFlight(speed,boost){
    if(!this.ctx)return;
    const s=clamp(speed/40,0,1);
    const t=this.ctx.currentTime;
    this.windFilter.frequency.setTargetAtTime(lerp(260,1400,s),t,.15);
    this.windGain.gain.setTargetAtTime(lerp(.02,.4,s)*(boost?1.2:1),t,.2);
  }
  burst(freqFrom,freqTo,dur,vol,q=1){
    if(!this.ctx)return;
    const ctx=this.ctx,t=ctx.currentTime,s=ctx.createBufferSource();s.buffer=this.noiseBuffer;s.loop=true;
    const f=ctx.createBiquadFilter();f.type='bandpass';f.Q.value=q;f.frequency.setValueAtTime(freqFrom,t);f.frequency.exponentialRampToValueAtTime(freqTo,t+dur);
    const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+dur*.3);g.gain.linearRampToValueAtTime(0,t+dur);
    s.connect(f).connect(g).connect(this.fx);s.start(t);s.stop(t+dur+.1);
  }
  whoosh(){this.burst(300,1800,.7,.5,.8);}
  wash(){this.burst(180,2600,3.2,.35,.5);}
  bump(){
    if(!this.ctx)return;
    const ctx=this.ctx,t=ctx.currentTime,o=ctx.createOscillator();o.frequency.setValueAtTime(90,t);o.frequency.exponentialRampToValueAtTime(40,t+.25);
    const g=ctx.createGain();g.gain.setValueAtTime(.5,t);g.gain.exponentialRampToValueAtTime(.001,t+.3);o.connect(g).connect(this.fx);o.start(t);o.stop(t+.32);
    this.burst(800,200,.2,.3,.5);
  }
  chime(){
    if(!this.ctx)return;
    const t=this.ctx.currentTime;
    [88,92,95,100].forEach((n,i)=>this.bell(hz(n),t+i*.13,1.6,.3));
  }
  gull(){
    if(!this.ctx||this.muted)return;
    const ctx=this.ctx,t=ctx.currentTime,o=ctx.createOscillator();o.type='triangle';
    o.frequency.setValueAtTime(1700,t);o.frequency.linearRampToValueAtTime(2100,t+.08);o.frequency.exponentialRampToValueAtTime(1100,t+.35);
    const v=ctx.createOscillator();v.frequency.value=28;const vg=ctx.createGain();vg.gain.value=60;v.connect(vg).connect(o.frequency);v.start(t);v.stop(t+.4);
    const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.06,t+.05);g.gain.linearRampToValueAtTime(0,t+.38);
    const p=ctx.createStereoPanner();p.pan.value=Math.random()*1.6-.8;
    o.connect(g).connect(p).connect(this.fx);o.start(t);o.stop(t+.4);
  }
  toggleMute(){
    this.muted=!this.muted;
    if(this.ctx)this.master.gain.setTargetAtTime(this.muted?0:.8,this.ctx.currentTime,.05);
    return this.muted;
  }
  setMusic(v){if(this.musicGain)this.musicGain.gain.setTargetAtTime(v,this.ctx.currentTime,.5);}
}
