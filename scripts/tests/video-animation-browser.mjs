// 视频转动图：页内切换、选视频（含转码回退）、片段时长与位置、取景框、生成参数、共用记录。
// 用法: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/video-animation-browser.mjs 测试视频.webm
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {strict as assert} from 'node:assert';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const videoPath=process.argv[2];
if(!videoPath)throw new Error('用法: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/video-animation-browser.mjs 测试视频.webm');
const clip=await readFile(path.resolve(videoPath));
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1300}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route(/src\/main\.tsx(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`
import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import Page from '/src/components/workspace/ProductAnimationWorkspacePage.tsx';import useWorkspace from '/src/hooks/useProductAnimation.ts';import {ToastProvider} from '/src/components/Toast.tsx';import '/src/styles/global.css';
function Harness(){const workspace=useWorkspace('55555555-5555-4555-8555-555555555555',()=>{});window.workspace=workspace;return React.createElement(Page,{workspace});}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(ToastProvider,null,React.createElement(Harness)));`}));
await page.route(/src\/lib\/supabase\.ts(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})}};`}));
await page.route(/src\/lib\/product-animation\/desktop\.ts(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`export const hasAnimationDesktop=()=>true;export const listAnimations=async()=>[];export const animationFileUrl=path=>path;export const saveAnimation=async()=>{};export const saveAllAnimations=async()=>0;export const clearAnimations=async()=>({removed:0,bytes:0});`}));
// The original file is "unplayable" so the H.264 transcode fallback is exercised.
await page.route(/src\/lib\/product-animation\/video-desktop\.ts(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`
export const VIDEO_FILE_EXTENSIONS=['mp4'];
export const pickAnimationVideo=async()=>'C:\\\\视频\\\\招牌牛肉面.mov';
export const animationVideoUrl=async()=>'/__original.mov';
export const transcodeAnimationVideo=async(path)=>{window.transcoded=path;return '/__preview.webm';};`}));
await page.route(/src\/lib\/desktop\/invoke\.ts(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`
const sessions=new Map();
export const ensureTauriInvoke=()=>async(cmd,args)=>{
 if(cmd==='begin_product_animation'){const id=crypto.randomUUID();sessions.set(id,args.spec);window.spec=args.spec;return id;}
 if(cmd==='extract_product_animation_video'){window.clip=args.clip;await new Promise(r=>{window.release=r;});return null;}
 if(cmd==='finish_product_animation'){const spec=sessions.get(args.id);sessions.delete(args.id);return {id:crypto.randomUUID(),style:spec.style,path:'/fixture.gif',posterPath:'/fixture.gif',createdAt:new Date().toISOString(),media:{width:spec.width,height:spec.height,durationMs:spec.durationMs,frames:spec.durationMs/50,bytes:2400000,format:spec.format}};}
 if(cmd==='cancel_product_animation'){sessions.delete(args.id);return null;}
 throw Error('Unexpected command '+cmd);};`}));
await page.route('**/__original.mov',route=>route.fulfill({status:200,contentType:'video/quicktime',body:Buffer.from('not a video')}));
// Byte-range responses like the desktop asset protocol, so the preview can seek into the clip.
await page.route('**/__preview.webm',route=>{
  const match=/bytes=(\d+)-(\d*)/.exec(route.request().headers().range||'');
  if(!match)return route.fulfill({contentType:'video/webm',headers:{'accept-ranges':'bytes'},body:clip});
  const start=Number(match[1]),end=match[2]?Number(match[2]):clip.length-1;
  return route.fulfill({status:206,contentType:'video/webm',headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${clip.length}`},body:clip.subarray(start,end+1)});
});
await page.route('**/fixture.gif',route=>route.fulfill({contentType:'image/gif',body:Buffer.from('R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=','base64')}));
await page.goto('http://127.0.0.1:1420/');

// Tabs: image mode first, switch to video.
const tabs=page.getByRole('tablist',{name:'制作方式'});
assert.equal(await tabs.getByRole('tab',{name:/图片做动效/}).getAttribute('aria-selected'),'true');
await tabs.getByRole('tab',{name:/视频转动图/}).click();
assert.equal(await tabs.getByRole('tab',{name:/视频转动图/}).getAttribute('aria-selected'),'true');
assert.equal(await page.getByRole('button',{name:'生成视频动图'}).isDisabled(),true,'Nothing to generate before a video');

// Pick: original fails to play, transcoded preview loads and metadata drives defaults.
await page.getByRole('button',{name:/点击选择菜品视频/}).click();
await page.getByText('1280×720 · 0:06.0 · 已转码预览').waitFor({timeout:30000});
assert.equal(await page.evaluate(()=>window.transcoded),'C:\\视频\\招牌牛肉面.mov');
assert.equal(await page.getByText('招牌牛肉面.mov').count(),1);
const v=()=>page.evaluate(()=>{const w=window.workspace.video;return {ratio:w.ratio,crop:w.crop,start:w.startMs,clip:w.clipMs};});
assert.deepEqual(await v(),{ratio:'16:9',crop:{x:0,y:0,width:1280,height:720},start:0,clip:3000},'Wide video defaults to 16:9 full frame');

// Ratio switch recentres a 4:3 crop; clip length and keyboard positioning.
await page.getByRole('radiogroup',{name:'平台比例'}).getByRole('radio',{name:'4:3'}).click();
assert.deepEqual((await v()).crop,{x:160,y:0,width:960,height:720});
await page.getByRole('radiogroup',{name:'片段时长'}).getByRole('radio',{name:'4秒'}).click();
const slider=page.getByRole('slider',{name:'片段位置'});
await slider.focus();await page.keyboard.press('End');
assert.equal((await v()).start,2000,'A 4 s clip in a 6 s video can start at most at 2 s');
for(let i=0;i<3;i++)await page.keyboard.press('ArrowLeft');
assert.equal((await v()).start,1700);
await page.getByText('开始 0:01.7').waitFor();await page.getByText('结束 0:05.7').waitFor();

// Preview autoplays and loops inside the clip.
await page.waitForTimeout(1200);
const time=await page.getByLabel('视频预览').evaluate(e=>({t:e.currentTime,paused:e.paused}));
assert.equal(time.paused,false,'Video preview must autoplay');
assert.ok(time.t>=1.6&&time.t<=5.75,`Playback stays inside the clip, got ${time.t}`);

// Crop: drag far left clamps at the edge, then shrink from the corner keeping 4:3.
const frame=page.getByRole('group',{name:'取景框'});const box=await frame.boundingBox();
await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x-600,box.y+box.height/2,{steps:6});await page.mouse.up();
assert.deepEqual((await v()).crop,{x:0,y:0,width:960,height:720});
const handle=page.getByLabel('调整取景框大小');const hb=await handle.boundingBox();
await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();await page.mouse.move(hb.x-200,hb.y-150,{steps:6});await page.mouse.up();
const shrunk=(await v()).crop;
assert.ok(shrunk.width<960&&shrunk.width>=240,`Crop shrinks, got ${shrunk.width}`);
assert.ok(Math.abs(shrunk.width/shrunk.height-4/3)<0.01,'Crop keeps 4:3');
await page.mouse.move(box.x+40,box.y+40);await page.mouse.down();await page.mouse.move(box.x+140,box.y+90,{steps:4});await page.mouse.up();
const moved=(await v()).crop;
assert.ok(moved.x>0&&moved.y>0&&moved.x+moved.width<=1280&&moved.y+moved.height<=720,'Moved crop stays inside the video');

// Generate: exact spec and clip go to the desktop side; tabs lock while busy.
await page.getByRole('button',{name:'生成视频动图'}).click();
await page.waitForFunction(()=>window.release,null,{polling:100,timeout:10000});
assert.equal(await tabs.getByRole('tab',{name:/图片做动效/}).isDisabled(),true,'Cannot switch while generating');
assert.deepEqual(await page.evaluate(()=>window.spec),{width:768,height:576,durationMs:4000,format:'gif',style:'video'});
assert.deepEqual(await page.evaluate(()=>window.clip),{inputPath:'C:\\视频\\招牌牛肉面.mov',startMs:1700,...moved},'Extraction uses the original file, not the preview');
await page.evaluate(()=>window.release());
await page.getByRole('button',{name:'返回编辑'}).waitFor();
await page.getByText('已通过平台规格校验').waitFor();
assert.equal(await page.locator('.pa-card').filter({hasText:'视频动图'}).count(),1,'Result joins the shared records');

// Editing returns to the cropper; switching to image mode keeps the shared records.
await page.getByRole('button',{name:'返回编辑'}).click();
await frame.waitFor();
await tabs.getByRole('tab',{name:/图片做动效/}).click();
await page.getByLabel('选择菜品图片').waitFor({state:'attached'});
assert.equal(await page.locator('.pa-card').filter({hasText:'视频动图'}).count(),1);
await tabs.getByRole('tab',{name:/视频转动图/}).click();
assert.equal((await v()).start,1700,'Video settings survive switching tabs');
if(process.env.VIDEO_SCREENSHOT){await page.getByRole('button',{name:/返回编辑/}).count();await page.screenshot({path:process.env.VIDEO_SCREENSHOT,fullPage:true});}
assert.deepEqual(errors,[]);
console.log('页内切换、转码回退、片段时长与位置、自动播放、取景框拖动缩放、生成参数、共用记录全部通过');
await browser.close();
