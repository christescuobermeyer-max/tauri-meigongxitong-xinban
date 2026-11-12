import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";

const [referencePath, outputPath] = process.argv.slice(2);
if (!referencePath || !outputPath) throw new Error("用法: node scripts/preview-product-animation.mjs 参考.gif 输出.html");
const reference = await readFile(resolve(referencePath));
if (!["GIF87a", "GIF89a"].includes(reference.subarray(0, 6).toString()) || reference.length < 13) {
  throw new Error("参考文件必须是GIF");
}
const width = reference.readUInt16LE(6), height = reference.readUInt16LE(8);
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>第一种风格 · 原参考效果</title><style>
*{box-sizing:border-box}body{margin:0;background:#171310;color:#f8f0e5;font:16px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}main{max-width:900px;margin:auto;padding:36px 24px}h1{margin:0;font-size:30px}p{color:#c3b4a3}.badge{color:#f8bd72;font-size:13px;letter-spacing:2px}.stage{background:#100d0b;border:1px solid #45362b;border-radius:16px;padding:20px;display:flex;justify-content:center}img{display:block;width:${width}px;max-width:100%;height:auto;object-fit:contain}img.large{width:100%}button{background:#f3bc78;color:#241a12;border:0;border-radius:8px;padding:10px 18px;font:inherit;cursor:pointer;margin-top:20px}small{display:block;color:#bfb2a3;margin-top:18px}
</style><main><div class="badge">风格 01 / 热气腾腾</div><h1>第一种风格 · 原参考效果</h1>
<p>使用你指定的原始 GIF，保留原来的动画、帧率和比例。</p>
<div class="stage"><img id="reference" width="${width}" height="${height}" alt="用户确认的牛肉板面原参考动效" src="data:image/gif;base64,${reference.toString("base64")}"></div>
<button id="size">放大查看</button><small>原始尺寸 ${width} × ${height}。本页展示风格参考，软件的模型生成接入仍待完成；此原文件不作为平台合规成品。</small></main>
<script>document.getElementById('size').onclick=()=>{const large=document.getElementById('reference').classList.toggle('large');document.getElementById('size').textContent=large?'原始大小':'放大查看';};</script></html>`;
await mkdir(dirname(resolve(outputPath)), { recursive: true });
await writeFile(resolve(outputPath), html);
console.log(resolve(outputPath));
