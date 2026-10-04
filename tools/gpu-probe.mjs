// Measures the frame rate in a real Chrome with GPU acceleration (headless, Metal/ANGLE) over a
// 1080p flight, and reports the WebGL renderer string. node tools/gpu-probe.mjs [url]
import {chromium} from 'playwright';
const url=process.argv[2]||'http://127.0.0.1:8713/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--enable-gpu-rasterization','--headless=new']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
page.on('pageerror',e=>console.log('pageerror:',e.message.slice(0,200)));
await page.goto(url+'?check=1&ratio=1',{waitUntil:'load'});
await page.waitForFunction(()=>window.wetPaint&&window.wetPaint.ready,null,{timeout:60000});
const info=await page.evaluate(()=>{const c=document.createElement('canvas');const gl=c.getContext('webgl2');const d=gl.getExtension('WEBGL_debug_renderer_info');return d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
console.log('renderer:',info);
await page.evaluate(()=>{const a=window.wetPaint;a.game.start();a.bloom(-60,-12,90);a.bloom(0,66,95);a.teleport(-6,16,40,0.1);a.flight.locked=false;a.flight.speed=20;a.input({turn:0.2,climb:0,boost:false,brake:false});});
for(let i=0;i<5;i++){await page.waitForTimeout(2000);console.log('fps',await page.evaluate(()=>window.wetPaint.fps),'draws',await page.evaluate(()=>window.wetPaint.draws));}
await page.screenshot({path:process.env.OUT||'/tmp/gpu-probe.png'});
await browser.close();
