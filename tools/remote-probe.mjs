// Drives a Chromium that was started with --remote-debugging-port (e.g. on Omarchy through an
// SSH tunnel): renderer string, frame rate over a 1080p flight, and screenshots.
//   node tools/remote-probe.mjs http://127.0.0.1:9333 outdir
import {chromium} from 'playwright';
import fs from 'node:fs';import path from 'node:path';
const [endpoint='http://127.0.0.1:9333',outDir='shots/remote']=process.argv.slice(2);
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.connectOverCDP(endpoint);
const ctx=browser.contexts()[0];const page=ctx.pages().find(p=>p.url().includes('WetPaint'))||ctx.pages()[0];
console.log('page',page.url().slice(0,80));
await page.waitForFunction(()=>window.wetPaint&&window.wetPaint.ready,null,{timeout:60000});
const info=await page.evaluate(()=>{const c=document.createElement('canvas');const gl=c.getContext('webgl2');const d=gl.getExtension('WEBGL_debug_renderer_info');return d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
const size=await page.evaluate(()=>[innerWidth,innerHeight,devicePixelRatio]);
console.log('renderer:',info,'window',size.join('x'));
await page.screenshot({path:path.join(outDir,'r0-title.png')});
await page.evaluate(()=>{const a=window.wetPaint;a.game.start();a.bloom(-60,-12,90);a.bloom(0,66,95);a.setDay(.3);a.setSky(.5);a.teleport(-6,16,40,0.1);a.flight.locked=false;a.flight.speed=20;a.input({turn:0.2,climb:0,boost:false,brake:false});});
const fps=[];for(let i=0;i<5;i++){await page.waitForTimeout(2000);fps.push(await page.evaluate(()=>window.wetPaint.fps));}
console.log('fps samples',fps.join(' '),'draws',await page.evaluate(()=>window.wetPaint.draws));
await page.screenshot({path:path.join(outDir,'r1-flight.png')});
await page.evaluate(()=>{const a=window.wetPaint;a.paintAll();a.setDay(1);a.teleport(60,34,-70,2.4);a.input({turn:0,climb:0,boost:true,brake:false});});
const fps2=[];for(let i=0;i<4;i++){await page.waitForTimeout(2000);fps2.push(await page.evaluate(()=>window.wetPaint.fps));}
console.log('fps sunset boost',fps2.join(' '));
await page.screenshot({path:path.join(outDir,'r2-sunset.png')});
console.log('errors',await page.evaluate(()=>window.wetPaint.errors));
await browser.close();
