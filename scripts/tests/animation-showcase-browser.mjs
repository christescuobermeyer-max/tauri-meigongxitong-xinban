// 动图展示：读取网关列表、可见卡片自动播放、屏幕外显示封面、放大查看、翻页。
// 用法: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/animation-showcase-browser.mjs 动图.gif 封面.jpg
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {strict as assert} from 'node:assert';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const [gifPath,posterPath]=process.argv.slice(2);
if(!gifPath||!posterPath)throw new Error('用法: PLAYWRIGHT_MODULE=... node scripts/tests/animation-showcase-browser.mjs 动图.gif 封面.jpg');
const gif=await readFile(path.resolve(gifPath)),poster=await readFile(path.resolve(posterPath));
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1280,height:520}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route(/src\/main\.tsx(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`
import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import Page from '/src/components/AnimationShowcasePage.tsx';import '/src/styles/global.css';
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('div',{className:'page page--single'},React.createElement(Page)));`}));
await page.route(/src\/lib\/supabase\.ts(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})}};`}));
// 14 video animations: 12 on page 1, 2 on page 2.
const requests=[];
await page.route('**/api/animation-showcase*',route=>{
  const url=new URL(route.request().url());const n=Number(url.searchParams.get('page'));requests.push({page:n,auth:route.request().headers().authorization});
  const ids=n===1?[...Array(12).keys()]:[12,13];
  route.fulfill({contentType:'application/json',body:JSON.stringify({page:n,page_size:12,max_pages:10,total_count:14,visible_total_count:14,page_count:2,items:ids.map(i=>({
    id:`a${i}`,display_name:`员工${i}`,title:`招牌菜 ${i}`,format:'gif',width:768,height:i%2?432:576,duration_ms:3000,frames:30,bytes:2_400_000,
    url:`http://127.0.0.1:1420/show/a${i}.gif`,poster_url:`http://127.0.0.1:1420/show/a${i}.jpg`,created_at:'2026-11-13T02:30:00Z'}))})});});
await page.route('**/show/*.gif',route=>route.fulfill({contentType:'image/gif',body:gif}));
await page.route('**/show/*.jpg',route=>route.fulfill({contentType:'image/jpeg',body:poster}));
await page.goto('http://127.0.0.1:1420/');

const cards=page.locator('.animation-showcase__card');
await cards.first().waitFor();
assert.equal(await cards.count(),12);
assert.deepEqual(requests[0],{page:1,auth:'Bearer test-token'});
await page.getByText('可查看 14 个动图 · 第 1 / 2 页').waitFor();
const img=(i)=>cards.nth(i).locator('img');
await page.waitForFunction(()=>document.querySelector('.animation-showcase__card img')?.dataset.playing==='true');
assert.match(await img(0).getAttribute('src'),/a0\.gif$/,'Visible card plays the GIF');
assert.equal(await img(11).getAttribute('data-playing'),'false');
assert.match(await img(11).getAttribute('src'),/a11\.jpg$/,'Off-screen card shows the still poster');
const thumbs=await page.locator('.animation-showcase__thumb').evaluateAll(list=>list.slice(0,2).map(e=>{const s=getComputedStyle(e);return [e.getBoundingClientRect().height,s.paddingLeft,getComputedStyle(e.querySelector('img')).objectFit];}));
assert.equal(thumbs[0][0],thumbs[1][0],'4:3 and 16:9 cards line up');
assert.deepEqual(thumbs[0].slice(1),['0px','contain'],'Animation fills the box without cropping');
await page.getByText('招牌菜 0').waitFor();await page.getByText('员工0').waitFor();
await page.getByText('GIF · 3.0秒').first().waitFor();

// Scrolling swaps: the last card starts playing, the first one goes back to its poster.
await cards.nth(11).scrollIntoViewIfNeeded();
await page.waitForFunction(()=>[...document.querySelectorAll('.animation-showcase__card img')].at(-1).dataset.playing==='true');
await page.waitForFunction(()=>document.querySelector('.animation-showcase__card img').dataset.playing==='false');
assert.match(await img(11).getAttribute('src'),/a11\.gif$/);

// Lightbox shows the animation; Escape closes it.
await cards.nth(11).getByRole('button',{name:'放大查看：招牌菜 11'}).click();
const dialog=page.getByRole('dialog',{name:'动图大图'});
assert.match(await dialog.locator('img').getAttribute('src'),/a11\.gif$/);
await dialog.getByText('员工11 · 768×432 · 3.0 秒').waitFor();
await page.keyboard.press('Escape');
assert.equal(await dialog.count(),0);

// Next page.
await page.getByRole('button',{name:'下一页 ›'}).click();
await page.getByText('可查看 14 个动图 · 第 2 / 2 页').waitFor();
assert.equal(await cards.count(),2);
assert.equal(requests.at(-1).page,2);
await page.getByRole('button',{name:'‹ 上一页'}).click();
await page.getByText('第 1 / 2 页').first().waitFor();
if(process.env.SHOWCASE_SCREENSHOT){await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(600);await page.screenshot({path:process.env.SHOWCASE_SCREENSHOT});}
assert.deepEqual(errors,[]);
console.log('动图展示：接口鉴权、可见自动播放、屏幕外封面、滚动切换、统一卡片、放大查看、翻页全部通过');
await browser.close();
