#!/usr/bin/env node
// Drives the game in headless Chromium and writes screenshots, or flies the whole route.
//   node tools/shoot.mjs look   <outdir>          fixed views at several stages of the painting
//   node tools/shoot.mjs close  <outdir>          close views of Kiki, windows, the tower, the start
//   node tools/shoot.mjs route  <outdir>          autopilot through all seven deliveries, shots along the way
//   node tools/shoot.mjs frames <outdir>          a 24 fps frame sequence for the teaser
//   node tools/shoot.mjs debug  <outdir>          the pipeline buffers for one view
// Needs the server: node tools/serve.mjs
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const [mode='look',outDir='shots']=process.argv.slice(2);
const base=process.env.WETPAINT_URL||'http://127.0.0.1:8713/';
const W=parseInt(process.env.W||'1280'),H=parseInt(process.env.H||'720');
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
page.on('console',m=>{if((m.type()==='error'||m.type()==='warning')&&!/GPU stall|deprecated/.test(m.text()))console.log('console:',m.text().slice(0,300));});
page.on('pageerror',e=>console.log('pageerror:',e.message));
await page.goto(base+'?check=1&ratio=1',{waitUntil:'load'});
await page.waitForFunction(()=>window.wetPaint&&window.wetPaint.ready,null,{timeout:60000});
const api=(fn,...args)=>page.evaluate(({fn,args})=>{const a=window.wetPaint;return (new Function('a','args',fn))(a,args);},{fn,args});
const step=async(frames)=>{await page.evaluate(n=>new Promise(res=>{const a=window.wetPaint;const target=a.frames+n;const tick=()=>{a.frames>=target?res():requestAnimationFrame(tick);};tick();}),frames);};
const shot=async name=>{const f=path.join(outDir,name+'.png');await page.screenshot({path:f});console.log('shot',name);};
const state=async()=>api('return a.state');
const hud=async on=>api(`for(const id of ['parcel','progress','tag','jiji','hint'])document.getElementById(id).style.visibility='${on?'visible':'hidden'}';`);
await api(`a.fixedStep=1/${process.env.STEP||30};a.game.start();a.input({turn:0,climb:0,boost:false,brake:false});a.flight.locked=true;`);
await api('document.getElementById("hint").classList.add("hidden");');

if(mode==='look'){
  await api('a.teleport(0,19,118,Math.PI);');await step(40);await shot('01-opening-sketch');
  await api('a.bloom(-60,-12,90);a.bloom(0,66,95);a.setDay(2/7);a.setSky(.4);');await step(30);await shot('02-harbour-painted');
  await api('a.teleport(-70,10,-40,0.9);');await step(40);await shot('03-pier-view');
  await api('a.teleport(20,30,110,Math.PI);a.bloom(135,-8,85);a.bloom(112,188,110);a.setDay(4/7);a.setSky(.7);');await step(40);await shot('04-afternoon-square');
  await api('a.paintAll();a.setDay(1);a.teleport(60,34,-70,2.4);');await step(40);await shot('05-sunset-all-painted');
  await api('a.teleport(-110,26,10,-2.2);');await step(40);await shot('06-lighthouse-sunset');
  await api('a.setDay(1.3);a.teleport(-10,22,30,Math.PI);');await step(40);await shot('07-dusk-lamps');
  await api('a.teleport(10,60,-100,0.2);');await step(40);await shot('08-airship-night');
  console.log(JSON.stringify(await state()));
}
if(mode==='close'){
  await hud(false);
  await api('a.bloom(0,60,400);a.setDay(.3);a.setSky(.6);a.teleport(-16,12,72,0);a.look(-13.5,12.7,76,-16,12.3,72);');await step(30);await shot('c1-kiki-front');
  await api('a.look(-12,12.3,72.5,-16,12.4,72);');await step(10);await shot('c2-kiki-side');
  await api('a.look(-19,13,68,-16,12.4,72);');await step(10);await shot('c3-kiki-threequarter');
  await api('a.teleport(-6,30,120,0);a.look(-14,12,52,-14,13,40);');await step(10);await shot('c4-bakery-windows');
  await api('a.look(-20,20,80,0,30,52);');await step(10);await shot('c5-tower');
  await api('a.look(-62,6,10,-60,4,-20);');await step(10);await shot('c6-pier');
  await api('a.bloom(-60,-12,90);a.bloom(0,66,95);a.teleport(0,19,118,Math.PI);');await step(40);await shot('c7-start-view');
  await api('a.look(150,12,-30,135,4,10);');await step(10);await shot('c8-hangar');
  await api('a.look(112,30,160,112,18,195);');await step(10);await shot('c9-villa');
  await api('a.look(-80,24,230,-80,14,258);');await step(10);await shot('c10-cabin');
  await api('a.look(-120,30,10,-150,22,-38);');await step(10);await shot('c11-lighthouse');
  await api('a.look(0,78,-100,20,62,-150);');await step(10);await shot('c12-airship');
}
if(mode==='one'){
  // one named view from the look set, for re-rendering a single README image
  const views={sketch:'a.teleport(0,19,118,Math.PI);',pier:'a.bloom(-60,-12,90);a.bloom(0,66,95);a.setDay(2/7);a.setSky(.4);a.teleport(-70,10,-40,0.9);',
    square:'a.bloom(-60,-12,90);a.bloom(0,66,95);a.bloom(135,-8,85);a.bloom(112,188,110);a.setDay(4/7);a.setSky(.7);a.teleport(20,30,110,Math.PI);',
    sunset:'a.paintAll();a.setDay(1);a.teleport(60,34,-70,2.4);',lighthouse:'a.paintAll();a.setDay(1);a.teleport(-110,26,10,-2.2);',dusk:'a.paintAll();a.setDay(1.3);a.teleport(-10,22,30,Math.PI);'};
  const name=process.env.VIEW||'sunset';
  await api(views[name]);await step(40);await shot(name);
}
if(mode==='debug'){
  await api('a.bloom(-60,-12,90);a.bloom(0,66,95);a.teleport(-70,10,-40,0.9);');await step(30);
  for(const [n,v] of [['d0-final',0],['d1-color',1],['d2-normal',2],['d3-coverage',3],['d4-edge',4],['d5-depth',5]]){await api(`a.debug(${v})`);await step(2);await shot(n);}
  await api('a.debug(0)');
}
if(mode==='auto'){
  // verbose autopilot: the state every two seconds of simulated time
  await api('a.flight.locked=false;a.autopilot=true;');
  const stepHz=parseInt(process.env.STEP||'30'),secs=parseInt(process.env.SECS||'90');
  for(let t=0;t<secs;t+=2){await step(stepHz*2);const s=await state();console.log(t+'s',JSON.stringify(s));if(s.phase==='finale')break;}
  await shot('auto-end');
}
if(mode==='route'){
  await api('a.flight.locked=false;a.autopilot=true;');
  const t0=Date.now();let last=-1,frames=0;
  while(true){
    await step(10);frames+=10;
    const s=await state();
    if(s.progress!==last){last=s.progress;await shot(`route-${s.progress}-${(s.target||'done').replace(/\s/g,'_')}`);console.log(JSON.stringify(s));}
    if(frames%600===0)console.log('t',(frames/30).toFixed(0),'s',JSON.stringify(s));
    if(s.phase==='finale'||frames>parseInt(process.env.STEP||'30')*60*9)break;
  }
  for(let i=0;i<4;i++){await step(100);await shot(`finale-${i}`);}
  await step(100);await shot('reveal-0');await step(120);await shot('reveal-1');await step(150);await shot('reveal-2');
  const s=await state();console.log('final',JSON.stringify(s),'sim frames',frames,'wall s',((Date.now()-t0)/1000).toFixed(0));
}
if(mode==='bloom'){
  // the moment a parcel lands: the wash spreading from the pier
  await hud(false);
  await api('a.fixedStep=1/12;a.setDay(.1);a.teleport(-60,3.6,-12,0);a.look(-52,9,-30,-60,4,-5);a.game.target=a.game.padByWho["the harbourmaster"];a.deliver();');
  for(let i=0;i<10;i++){await step(8);await shot(`bloom-${i}`);}
}
if(mode==='fly'){
  // Kiki passing a fixed camera at speed
  await hud(false);
  await api('a.fixedStep=1/24;a.bloom(0,60,400);a.setDay(.3);a.setSky(.6);a.teleport(-30,16,90,Math.PI/2);a.flight.locked=false;a.flight.speed=26;a.input({turn:0.6,climb:0.2,boost:false,brake:false});a.look(-10,17,96,-10,16,90);');
  for(let i=0;i<8;i++){await step(3);await shot(`fly-${i}`);}
}
if(mode==='title'){
  await page.reload({waitUntil:'load'});await page.waitForFunction(()=>window.wetPaint&&window.wetPaint.ready);
  await step(30);await shot('title');
}
if(mode==='ending'){
  // the last parcel: finale wash, then the studio
  await api('a.skipTo(6);a.teleport(20,62,-120,Math.PI);a.flight.locked=false;a.autopilot=true;');
  let frames=0;
  while(frames<30*120){await step(10);frames+=10;const s=await state();if(s.phase==='finale')break;}
  for(let i=0;i<6;i++){await step(60);await shot(`finale-${i}`);}
  await step(90);await shot('reveal-0');await step(90);await shot('reveal-1');await step(120);await shot('reveal-2');
  await api('a.game.flyOn()');await step(90);await shot('flyon');
  console.log(JSON.stringify(await state()));
}
if(mode==='teaser'){
  const n=parseInt(process.env.FRAMES||'84');
  await hud(false);
  // she glides in over the pier, lands in the ribbon, and the wash spreads
  await api('a.fixedStep=1/12;a.setDay(.1);a.teleport(-60,9,22,Math.PI);a.flight.locked=false;a.flight.speed=9;a.input({turn:0,climb:-0.3,boost:false,brake:true});a.look(-50,10,-34,-60,4,-2);');
  await step(2);
  for(let i=0;i<n;i++){await step(1);await page.screenshot({path:path.join(outDir,`frame_${String(i).padStart(4,'0')}.png`)});}
  console.log(JSON.stringify(await state()));
  console.log('frames',n);
}
if(mode==='frames'){
  const n=parseInt(process.env.FRAMES||'120');
  await hud(false);
  await api('a.fixedStep=1/24;a.bloom(-60,-12,90);a.bloom(0,66,95);a.setDay(.3);a.setSky(.45);a.teleport(-6,14,40,0.1);a.flight.locked=false;a.flight.speed=20;a.input({turn:0.15,climb:0,boost:false,brake:false});');
  await step(10);
  for(let i=0;i<n;i++){await step(1);await page.screenshot({path:path.join(outDir,`frame_${String(i).padStart(4,'0')}.png`)});}
  console.log('frames',n);
}
const errors=await api('return a.errors');
console.log('errors',errors.length,errors.slice(0,5));
await browser.close();
