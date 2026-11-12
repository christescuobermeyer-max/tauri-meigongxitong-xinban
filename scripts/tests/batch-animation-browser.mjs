// 批量动图：最多5张、统一/单张风格、移除、本地与模型混合逐张生成、全部下载。
// 用法: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/batch-animation-browser.mjs 原图.png [实测导出目录]
import {pathToFileURL, fileURLToPath} from 'node:url';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {strict as assert} from 'node:assert';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const sourcePath=process.argv[2];
if(!sourcePath)throw new Error('用法: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/batch-animation-browser.mjs 原图.png [实测导出目录]');
const out=path.resolve(process.argv[3] || root+'/output/imagegen/模型动图接入验证');
const gif=await readFile(out+'/model-platform.gif');
const png=await readFile(path.resolve(sourcePath));
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1400}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route(/src\/main\.tsx(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`
import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import Page from '/src/components/workspace/ProductAnimationWorkspacePage.tsx';import useWorkspace from '/src/hooks/useProductAnimation.ts';import '/src/styles/global.css';
function Harness(){const workspace=useWorkspace('55555555-5555-4555-8555-555555555555',()=>{});window.workspace=workspace;return React.createElement(Page,{workspace});}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Harness));`}));
await page.route(/src\/lib\/supabase\.ts(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})}};`}));
await page.route(/src\/lib\/product-animation\/desktop\.ts(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`export const hasAnimationDesktop=()=>true;export const listAnimations=async()=>[];export const animationFileUrl=path=>path;export const saveAnimation=async()=>{};export const saveAllAnimations=async(userId,results)=>{window.savedAll=results.map(r=>r.style);return results.length;};`}));
// Local pipeline mock: records every command and the maximum number of concurrent encodes.
await page.route(/src\/lib\/desktop\/invoke\.ts(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`
const sessions=new Map();window.order=[];window.maxActive=0;let active=0;
export const ensureTauriInvoke=()=>async(cmd,args)=>{
 if(cmd==='begin_product_animation'){active++;window.maxActive=Math.max(window.maxActive,active);const id=crypto.randomUUID();sessions.set(id,args.spec);window.order.push(args.spec.style);return id;}
 if(cmd==='append_product_animation_frame')return null;
 if(cmd==='finish_product_animation'){const spec=sessions.get(args.id);sessions.delete(args.id);active--;return {id:crypto.randomUUID(),style:spec.style,path:'/fixture.gif',posterPath:'/poster.jpg',createdAt:new Date().toISOString(),media:{width:spec.width,height:spec.height,durationMs:3000,frames:60,bytes:3000000,format:'gif'}};}
 if(cmd==='cancel_product_animation'){if(sessions.delete(args.id))active--;return null;}
 if(cmd==='import_model_animation'){window.order.push('steam');return {id:args.id,style:'steam',path:'/fixture.gif',posterPath:'/poster.jpg',createdAt:new Date().toISOString(),media:{width:768,height:576,durationMs:3240,frames:18,bytes:4000000,format:'gif'}};}
 throw Error('Unexpected command '+cmd);};`}));
let jobs=[];const posts=[];
await page.route('**/api/animations/capabilities',route=>route.fulfill({json:{enabled:true}}));
await page.route('**/api/animations/jobs*',async route=>{
 if(route.request().method()==='POST'){const req=route.request().postDataJSON();posts.push(req);
  const job={id:req.id,status:'queued',spec:req.spec,createdAt:new Date().toISOString()};jobs=[job];await route.fulfill({status:202,json:job});return;}
 // Any submitted job completes on the next poll.
 jobs=jobs.map(job=>({...job,status:'succeeded',result:{url:'http://127.0.0.1:1420/fixture.gif',posterUrl:'http://127.0.0.1:1420/poster.jpg',sha256:'x',media:{width:768,height:576,durationMs:3240,frames:18,bytes:gif.length,format:'gif'},sourceMedia:{width:439,height:389,durationMs:1620,frames:9,cycles:2,upscaled:true}}}));
 await route.fulfill({json:{jobs}});
});
await page.route('**/fixture.gif',route=>route.fulfill({contentType:'image/gif',body:gif}));
await page.route('**/poster.jpg',route=>route.fulfill({contentType:'image/jpeg',body:gif}));
await page.goto('http://127.0.0.1:1420/');

// Six files: only five are accepted.
await page.getByLabel('选择菜品图片').setInputFiles(Array.from({length:6},(_,i)=>({name:`菜品${i+1}.png`,mimeType:'image/png',buffer:png})));
await page.waitForFunction(()=>window.workspace?.items.length===5,null,{polling:300,timeout:60000});
await page.getByRole('alert').filter({hasText:'最多同时制作 5 张'}).waitFor();

// Shared style for all, then override items 2 and 3 only.
await page.getByRole('radio',{name:/烟火真香/}).click();
assert.deepEqual(await page.evaluate(()=>window.workspace.items.map(i=>i.style??window.workspace.sharedStyle)),Array(5).fill('smoke'));
await page.getByRole('radiogroup',{name:'应用到'}).getByRole('radio',{name:'仅当前图片'}).click();
await page.getByRole('button',{name:'查看第 2 张'}).click();await page.getByRole('radio',{name:/热气腾腾/}).click();
await page.getByRole('button',{name:'查看第 3 张'}).click();await page.getByRole('radio',{name:/鎏金美味/}).click();
await page.getByRole('button',{name:'移除第 5 张'}).click();
assert.deepEqual(await page.evaluate(()=>window.workspace.items.map(i=>i.style??window.workspace.sharedStyle)),['smoke','steam','gilded','smoke']);

// One click runs all four, one after another.
await page.getByRole('button',{name:'开始批量生成（4 张）'}).click();
await page.waitForFunction(()=>window.workspace.items.every(i=>i.status==='done'),null,{polling:500,timeout:180000});
assert.deepEqual(await page.evaluate(()=>window.order),['smoke','steam','gilded','smoke'],'Items must be generated in order');
assert.equal(await page.evaluate(()=>window.maxActive),1,'Only one local encode may run at a time');
assert.equal(posts.length,1,'Exactly one model submission');
assert.equal(Buffer.from(posts[0].sourcePng,'base64').readUInt32BE(16),768);

await page.getByRole('button',{name:'全部下载（4）'}).click();
await page.getByText('已保存 4 张到所选文件夹').waitFor();
assert.deepEqual(await page.evaluate(()=>window.savedAll),['smoke','steam','gilded','smoke']);
if(process.env.BATCH_SCREENSHOT)await page.screenshot({path:process.env.BATCH_SCREENSHOT,fullPage:true});
assert.deepEqual(errors,[]);
console.log('批量上传上限、统一/单张风格、移除、本地与模型逐张生成、全部下载全部通过');
await browser.close();
