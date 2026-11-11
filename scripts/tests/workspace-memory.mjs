import { mkdtemp, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const playwrightPath = process.env.PLAYWRIGHT_MODULE;
if (!playwrightPath || !process.env.CHROME_PATH) throw new Error("请通过 PLAYWRIGHT_MODULE 和 CHROME_PATH 指定测试工具及 Chrome 路径");
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const temporary = await realpath(await mkdtemp(path.join(tmpdir(), "csgh-memory-")));
let server;
let browser;
try {
  await symlink(path.join(root, "node_modules"), path.join(temporary, "node_modules"));
  await writeFile(path.join(temporary, "index.html"), '<div id="root"></div><script type="module" src="/main.tsx"></script>');
  await writeFile(path.join(temporary, "main.tsx"), `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {flushSync} from 'react-dom';
    import {ToastProvider} from ${JSON.stringify(`/@fs/${root}src/components/Toast.tsx`)};
    import useGenerationWorkspace from ${JSON.stringify(`/@fs/${root}src/hooks/useGenerationWorkspace.ts`)};
    let workspace;
    let reset;
    function Workspace() { workspace = useGenerationWorkspace({userId:'memory-test'}); return null; }
    function App() { const [version,setVersion]=useState(0); reset=()=>setVersion(value=>value+1); return <ToastProvider><Workspace key={version}/></ToastProvider>; }
    createRoot(document.getElementById('root')).render(<App/>);
    function image(index) {
      const bytes = new Uint8Array(512 * 1024);
      for(let offset=0;offset<bytes.length;offset+=65536) crypto.getRandomValues(bytes.subarray(offset,offset+65536));
      let binary='';
      for(let offset=0;offset<bytes.length;offset+=8192) binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
      const base64=btoa(binary);
      return {id:String(index),base64,productBase64:base64,dataUrl:'data:image/jpeg;base64,'+base64,
        name:'test-'+index+'.jpg',mime:'image/jpeg',size:bytes.length,productSize:bytes.length,originalSize:bytes.length,productName:'测试产品'};
    }
    window.memoryProfile={
      ready:()=>Boolean(workspace),
      fill:count=>flushSync(()=>{for(let slot=0;slot<10;slot++) workspace.productBatchSlots[slot].setImages(Array.from({length:count},(_,index)=>image(slot*count+index)));}),
      clear:()=>flushSync(()=>reset()),
      count:()=>workspace.productBatchSlots.reduce((total,slot)=>total+slot.images.length,0),
    };
  `);
  server = await createServer({ root: temporary, configFile: false, envDir: false,
    esbuild: { jsx: "automatic" }, logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom", "react-dom/client", "@supabase/supabase-js"] },
    define: { "import.meta.env.VITE_SUPABASE_URL": "undefined", "import.meta.env.VITE_SUPABASE_ANON_KEY": "undefined", "import.meta.env.VITE_BACKEND_GATEWAY_URL": '""' },
    server: { host: "127.0.0.1", port: 0, hmr: false, fs: { allow: [temporary, root, path.join(root, "node_modules")] } },
  });
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  const page = await browser.newPage();
  const errors = [];
  const blockedRequests = [];
  page.on("pageerror", (error) => { errors.push(error.message); console.error(error.message); });
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).hostname !== "127.0.0.1") {
      blockedRequests.push(route.request().url().split("?")[0]);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.memoryProfile?.ready(), null, { timeout: 10000 });
  const session = await page.context().newCDPSession(page);
  const samples = [];
  async function measure(stage) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await session.send("HeapProfiler.collectGarbage");
    const usage = await session.send("Runtime.getHeapUsage");
    samples.push({ stage, imageCount: await page.evaluate(() => window.memoryProfile.count()), ...usage });
  }
  await measure("empty-101-workspaces");
  for (const count of [1, 10, 20]) {
    await page.evaluate(count => window.memoryProfile.fill(count), count);
    await measure(`${count * 10}-images-512KiB-each`);
    await page.evaluate(() => window.memoryProfile.clear());
    await measure(`reset-after-${count * 10}`);
  }
  const report = { browser: browser.version(), syntheticInputBytes: 512 * 1024, samples, errors, blockedRequests };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length || blockedRequests.length) process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
  await rm(temporary, { recursive: true, force: true });
}
