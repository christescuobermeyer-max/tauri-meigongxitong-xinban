// 视频转动图：页内切换、抖音/小红书链接提取、上传视频（含转码回退）、片段时长与位置、取景框、生成参数、共用记录。
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
// Real video-desktop.ts runs against a fake Tauri runtime: the picked .mov is "unplayable" so the
// H.264 transcode fallback is exercised, while downloaded share videos play directly.
await page.addInitScript(()=>{window.__TAURI_INTERNALS__={
  convertFileSrc:(path)=>path.endsWith('.mov')?'/__original.mov':'/__preview.webm?'+encodeURIComponent(path),
  invoke:async(cmd)=>{if(cmd==='plugin:dialog|open')return 'C:\\视频\\招牌牛肉面.mov';throw Error('Unexpected runtime command '+cmd);}};});
await page.route('**/api/video/parse-douyin',async route=>{window_douyin=route.request().postDataJSON();await route.fulfill({contentType:'application/json',body:JSON.stringify({videoUrl:'https://cdn.example/douyin.mp4',title:'招牌牛肉面 汤底熬足8小时',author:'张记',platform:'douyin'})});});
let window_douyin=null;
// Cloud upload: the first attempt fails so the retry path is exercised.
const uploads=[];
await page.route('**/api/animation-uploads',async route=>{uploads.push(route.request().postDataJSON());
  if(uploads.length===1)return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'动图云端存储暂不可用'})});
  return route.fulfill({contentType:'application/json',body:JSON.stringify({id:uploads.at(-1).id,uploaded:true})});});
await page.route(/src\/lib\/desktop\/invoke\.ts(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`
const sessions=new Map();
export const ensureTauriInvoke=()=>async(cmd,args)=>{
 if(cmd==='begin_product_animation'){const id=crypto.randomUUID();sessions.set(id,args.spec);window.spec=args.spec;return id;}
 if(cmd==='extract_product_animation_video'){window.clip=args.clip;await new Promise(r=>{window.release=r;});return null;}
 if(cmd==='finish_product_animation'){const spec=sessions.get(args.id);sessions.delete(args.id);window.finishTitle=args.title;const result={id:crypto.randomUUID(),style:spec.style,title:args.title,sequence:spec.style==='video'?1:null,path:'/fixture.gif',posterPath:'/fixture.gif',createdAt:new Date().toISOString(),media:{width:spec.width,height:spec.height,durationMs:spec.durationMs,frames:spec.durationMs/50,bytes:2400000,format:spec.format}};(window.saved||=new Map()).set(result.id,result);return result;}
 if(cmd==='read_animation_upload')return {data:'R0lGODlh',poster:'/9j/4AAQ'};
 if(cmd==='mark_animation_uploaded'){const result={...window.saved.get(args.id),uploadedAt:new Date().toISOString()};window.saved.set(args.id,result);return result;}
 if(cmd==='cancel_product_animation'){sessions.delete(args.id);return null;}
 if(cmd==='allow_animation_video')return args.path;
 if(cmd==='prepare_local_video_preview'){window.transcoded=args.inputPath;return 'C:\\\\cache\\\\local_preview.mp4';}
 if(cmd==='parse_xiaohongshu'){window.xhsShare=args.shareText;return {videoUrl:'https://cdn.example/xhs.mp4',title:'',author:'李姐',platform:'xiaohongshu',headers:{Referer:'https://www.xiaohongshu.com/'}};}
 if(cmd==='download_video'){(window.downloads||=[]).push(args);return 'C:\\\\cache\\\\preview_'+args.platform+'.mp4';}
 throw Error('Unexpected command '+cmd);};`}));
await page.route('**/__original.mov',route=>route.fulfill({status:200,contentType:'video/quicktime',body:Buffer.from('not a video')}));
// Byte-range responses like the desktop asset protocol, so the preview can seek into the clip.
await page.route('**/__preview.webm*',route=>{
  const match=/bytes=(\d+)-(\d*)/.exec(route.request().headers().range||'');
  if(!match)return route.fulfill({contentType:'video/webm',headers:{'accept-ranges':'bytes'},body:clip});
  const start=Number(match[1]),end=match[2]?Number(match[2]):clip.length-1;
  return route.fulfill({status:206,contentType:'video/webm',headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${clip.length}`},body:clip.subarray(start,end+1)});
});
await page.route('**/fixture.gif',route=>route.fulfill({contentType:'image/gif',body:Buffer.from('R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=','base64')}));
await page.goto('http://127.0.0.1:1420/');

// Tabs: video clips come first and are open by default; the tip says which stores each suits.
const tabs=page.getByRole('tablist',{name:'制作方式'});
assert.match(await tabs.getByRole('tab').first().textContent(),/^视频转动图/);
assert.equal(await tabs.getByRole('tab',{name:/视频转动图/}).getAttribute('aria-selected'),'true');
const tip=page.getByRole('note');
assert.equal(await tip.textContent(),'适用：优质店铺、交钱的店铺。抽不到钱的店铺请用「图片做动效」');
await tip.getByRole('button',{name:'「图片做动效」'}).click();
assert.equal(await tabs.getByRole('tab',{name:/图片做动效/}).getAttribute('aria-selected'),'true','The tip link switches mode');
await page.getByRole('note').getByRole('button',{name:'「视频转动图」'}).click();
assert.equal(await tabs.getByRole('tab',{name:/视频转动图/}).getAttribute('aria-selected'),'true');
assert.equal(await page.getByRole('button',{name:'生成视频动图'}).isDisabled(),true,'Nothing to generate before a video');

// Source defaults to pasting a link; only Douyin / Xiaohongshu share text is accepted.
const sources=page.getByRole('radiogroup',{name:'视频来源'});
assert.equal(await sources.getByRole('radio',{name:'粘贴链接'}).getAttribute('aria-checked'),'true','Link is the default source');
const linkBox=page.getByLabel('视频分享链接');const parse=page.getByRole('button',{name:'解析链接'});
assert.equal(await parse.isDisabled(),true,'Parse needs text');
await linkBox.fill('看看这个 https://example.com/v/1');await parse.click();
await page.getByRole('alert').filter({hasText:'仅支持小红书或抖音分享链接'}).waitFor();
if(process.env.LINK_SCREENSHOT)await page.screenshot({path:process.env.LINK_SCREENSHOT,clip:{x:0,y:0,width:1440,height:820}});

// Douyin share text goes through the gateway, then download_video; the MP4 plays without transcoding.
const douyin='7.99 复制打开抖音，看看【张记的作品】招牌牛肉面 汤底熬足8小时 https://v.douyin.com/iABCdef/ ';
await linkBox.fill(douyin);await parse.click();
await page.getByText('1280×720 · 0:06.0',{exact:true}).waitFor({timeout:30000});
assert.equal(await page.getByText('抖音 · 招牌牛肉面 汤底熬足8小时').count(),1);
assert.deepEqual(window_douyin,{share_text:douyin.trim()},"Share text is sent trimmed");
assert.deepEqual(await page.evaluate(()=>window.downloads),[{url:'https://cdn.example/douyin.mp4',platform:'douyin'}]);
assert.equal(await page.evaluate(()=>window.workspace.video.video.path),'C:\\cache\\preview_douyin.mp4');
assert.equal(await page.evaluate(()=>window.transcoded),undefined,'Playable downloads are not transcoded');

// Xiaohongshu: parsed on the desktop side, download keeps the Referer header; title falls back to the share text.
await page.getByRole('button',{name:'更换视频'}).click();
assert.equal(await sources.getByRole('radio',{name:'粘贴链接'}).getAttribute('aria-checked'),'true');
const xhs='红烧肉做法 http://xhslink.com/a/Zx9 复制本条信息，打开【小红书】App查看精彩内容！';
await linkBox.fill(xhs);await parse.click();
await page.getByText('1280×720 · 0:06.0',{exact:true}).waitFor({timeout:30000});
assert.equal(await page.evaluate(()=>window.xhsShare),xhs);
assert.deepEqual((await page.evaluate(()=>window.downloads))[1],{url:'https://cdn.example/xhs.mp4',platform:'xiaohongshu',headers:{Referer:'https://www.xiaohongshu.com/'}});
assert.equal(await page.getByText('小红书 · 红烧肉做法').count(),1);

// Upload: the original fails to play, the transcoded preview loads and metadata drives defaults.
await page.getByRole('button',{name:'更换视频'}).click();
await sources.getByRole('radio',{name:'上传视频'}).click();
await page.getByRole('button',{name:/点击选择菜品视频/}).click();
await page.getByText('1280×720 · 0:06.0 · 已转码预览').waitFor({timeout:30000});
assert.equal(await page.evaluate(()=>window.transcoded),'C:\\视频\\招牌牛肉面.mov');
assert.equal(await page.evaluate(()=>window.workspace.video.video.path),'C:\\视频\\招牌牛肉面.mov','Extraction keeps the original path');
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
assert.equal(await page.evaluate(()=>window.finishTitle),'招牌牛肉面','The video name is saved as the title');
assert.equal(await page.locator('.pa-card strong').first().textContent(),'视频动图 001','Video records show their file number');

// Upload runs automatically; a failure offers a retry, and the retry marks it uploaded.
await page.getByRole('button',{name:'上传失败，点击重试'}).first().waitFor({timeout:10000});
await page.getByRole('button',{name:'上传失败，点击重试'}).first().click();
await page.getByText('已上传云端').first().waitFor({timeout:10000});
assert.equal(await page.getByText('已上传云端').count(),2,'Preview and record card both show the upload');
assert.equal(uploads.length,2);
const resultId=await page.evaluate(()=>window.workspace.current.id);
assert.deepEqual(uploads[1],{id:resultId,style:'video',title:'招牌牛肉面',data:'R0lGODlh',poster:'/9j/4AAQ'});
assert.equal(await page.locator('.pa-card').filter({hasText:'招牌牛肉面'}).count(),1,'Record card shows the title');

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
console.log('自动上传与失败重试、页内切换、链接校验、抖音与小红书提取、上传与转码回退、片段时长与位置、自动播放、取景框拖动缩放、生成参数、共用记录全部通过');
await browser.close();
