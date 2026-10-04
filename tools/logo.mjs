import {chromium} from 'playwright';
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1600,height:520},deviceScaleFactor:1});
await page.goto('file://'+process.cwd()+'/tools/logo.html');
await page.waitForTimeout(300);
await page.screenshot({path:'docs/media/logo.png'});
await browser.close();console.log('docs/media/logo.png');
