import {pathToFileURL, fileURLToPath} from 'node:url';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {strict as assert} from 'node:assert';
const root=fileURLToPath(new URL('../../',import.meta.url));
const sourcePath=process.argv[2];
if(!sourcePath)throw new Error('用法: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/model-animation-browser.mjs 原图.png [实测导出目录]');
const out=path.resolve(process.argv[3] || root+'/output/imagegen/模型动图接入验证');
const gif=await readFile(out+'/model-platform.gif');
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1200}});
const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
await page.route(/src\/main\.tsx(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`
import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import Page from '/src/components/workspace/ProductAnimationWorkspacePage.tsx';import useWorkspace from '/src/hooks/useProductAnimation.ts';import '/src/styles/global.css';
function Harness(){const workspace=useWorkspace('55555555-5555-4555-8555-555555555555',()=>{});window.workspace=workspace;return React.createElement(Page,{workspace});}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Harness));`}));
await page.route(/src\/lib\/supabase\.ts(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})}};`}));
await page.route(/src\/lib\/product-animation\/desktop\.ts(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`export const hasAnimationDesktop=()=>true;export const listAnimations=async()=>[];export const animationFileUrl=path=>path;export const saveAnimation=async(userId,result)=>{window.saved=(window.saved||[]).concat(result.id);};export const saveAllAnimations=async(userId,results)=>{window.savedAll=results.map(r=>r.id);return results.length;};`}));
await page.route(/src\/lib\/desktop\/invoke\.ts(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`export const ensureTauriInvoke=()=>async(cmd,args)=>{window.invocations??=[];window.invocations.push({cmd,args});if(cmd==='import_model_animation')return {id:args.id,style:'steam',path:'/fixture.gif',posterPath:'/poster.jpg',createdAt:new Date().toISOString(),media:{width:1024,height:768,durationMs:3240,frames:18,bytes:4863815,format:'gif'}};throw Error('Unexpected command '+cmd);};`}));
let requests=[],jobs=[];
await page.route('**/api/animations/capabilities',route=>route.fulfill({json:{enabled:true}}));
await page.route('**/api/animations/jobs*',async route=>{
 if(route.request().method()==='POST'){
  const req=route.request().postDataJSON();requests.push(req);
  assert.equal(route.request().headers().authorization,'Bearer test-token');
  if(requests.length===1){await route.abort('failed');return;}
  const job={id:req.id,status:'queued',spec:req.spec,createdAt:new Date().toISOString()};jobs=[job];await route.fulfill({status:202,json:job});
 }else await route.fulfill({json:{jobs}});
});
await page.route('**/fixture.gif',route=>route.fulfill({contentType:'image/gif',body:gif}));
await page.route('**/poster.jpg',async route=>route.fulfill({contentType:'image/jpeg',body:await readFile(out+'/model-poster.jpg')}));
await page.goto('http://127.0.0.1:1420/');
await page.getByLabel('选择菜品图片').setInputFiles(path.resolve(sourcePath));
await page.waitForFunction(()=>window.workspace?.source&&window.workspace.modelEnabled);
const canvas=page.getByLabel('动图效果预览');const before=await canvas.screenshot();await page.waitForTimeout(150);assert.deepEqual(await canvas.screenshot(),before,'Model source preview must be static');
await page.getByRole('button',{name:'生成模型动图',exact:true}).click();
await page.getByRole('button',{name:'重试同一请求',exact:true}).waitFor();
await page.getByRole('radiogroup',{name:'循环时长'}).getByRole('radio',{name:'4秒'}).click();await page.getByRole('button',{name:'重试同一请求',exact:true}).click();
await page.getByRole('alert').filter({hasText:'同一张原图'}).waitFor();assert.equal(requests.length,1);
await page.getByRole('radiogroup',{name:'循环时长'}).getByRole('radio',{name:'3秒'}).click();await page.getByRole('button',{name:'重试同一请求',exact:true}).click();
await page.getByText('等待模型生成',{exact:true}).waitFor();assert.equal(requests.length,2);assert.equal(requests[0].id,requests[1].id);assert.equal(requests[0].sourcePng,requests[1].sourcePng);
const src=Buffer.from(requests[1].sourcePng,'base64');assert.equal(src.readUInt32BE(16),768);assert.equal(src.readUInt32BE(20),576);
await page.reload();await page.getByText('等待模型生成',{exact:true}).waitFor();assert.equal(requests.length,2,'Reload must not submit another generation');
jobs[0]={...jobs[0],status:'succeeded',result:{url:'http://127.0.0.1:1420/fixture.gif',posterUrl:'http://127.0.0.1:1420/poster.jpg',sha256:createHash('sha256').update(gif).digest('hex'),media:{width:1024,height:768,durationMs:3240,frames:18,bytes:gif.length,format:'gif'},sourceMedia:{width:439,height:389,durationMs:1620,frames:9,cycles:2,upscaled:true}}};
await page.getByRole('button',{name:'刷新模型任务'}).click();await page.getByAltText('模型动图').waitFor();await page.getByRole('button',{name:'下载 GIF'}).click();await page.waitForFunction(()=>window.saved?.length===1);
await page.getByAltText('生成的菜品动图').waitFor();
const imported=await page.evaluate(()=>window.invocations.find(x=>x.cmd==='import_model_animation'));
assert.equal(imported.args.id,jobs[0].id);assert.deepEqual(await page.evaluate(()=>window.saved),[jobs[0].id],'One click must import and save');assert.equal(imported.args.sha256,jobs[0].result.sha256);assert.deepEqual(Buffer.from(imported.args.data,'base64'),gif);
await page.screenshot({path:out+'/模型工作区联调.png',fullPage:true});
assert.deepEqual(errors,[]);await page.getByRole('button',{name:'下载 GIF'}).first().click();await page.waitForFunction(()=>window.saved?.length===2);assert.equal((await page.evaluate(()=>window.invocations.filter(x=>x.cmd==='import_model_animation'))).length,1,'Second download must reuse local copy');
console.log('模型源图静态预览、超时同ID重试、参数冲突、重载恢复、一键下载与IPC全部通过');
await writeFile(out+'/界面验证.json',JSON.stringify({submitAttempts:requests.length,sameRequestId:true,recoveredWithoutSubmit:true,importBytes:gif.length,errors},null,2));
await browser.close();
