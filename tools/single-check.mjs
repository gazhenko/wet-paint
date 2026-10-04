import {chromium} from 'playwright';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:960,height:540}});
page.on('pageerror',e=>console.log('pageerror:',e.message.slice(0,400)));
page.on('console',m=>{if(m.type()==='error')console.log('console:',m.text().slice(0,300));});
await page.goto('file://'+process.env.HOME+'/wet-paint/dist/WetPaint.html?check=1&ratio=1',{waitUntil:'load'});
try{await page.waitForFunction(()=>window.wetPaint&&window.wetPaint.ready,null,{timeout:60000});console.log('single-file ready, state:',JSON.stringify(await page.evaluate(()=>window.wetPaint.state)));}catch(e){console.log('not ready:',e.message.slice(0,100));}
await page.waitForTimeout(1500);
await page.screenshot({path:process.argv[2]});
await browser.close();
