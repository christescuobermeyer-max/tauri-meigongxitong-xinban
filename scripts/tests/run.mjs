import { readdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const filters = process.argv.slice(2);

async function discover(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const groups = await Promise.all(entries.map(async (entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return discover(file);
    return /\.test\.(ts|mjs)$/.test(entry.name) ? [file] : [];
  }));
  return groups.flat();
}

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", file], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    let finished = false;
    const timer = setTimeout(() => {
      child.kill();
      finish(false, "测试超时");
    }, 120_000);
    function finish(passed, message = "") {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ passed, output: message || output });
    }
    child.stdout.on("data", (bytes) => { output += bytes; });
    child.stderr.on("data", (bytes) => { output += bytes; });
    child.once("error", (error) => finish(false, error.message));
    child.once("close", (code) => finish(code === 0));
  });
}

const files = (await discover(path.join(root, "tests"))).sort()
  .filter((file) => filters.length === 0 || filters.some((filter) => path.relative(root, file).replaceAll("\\", "/").includes(filter)));
if (files.length === 0) throw new Error("没有匹配的测试文件");
const failures = [];
const results = [];
for (const file of files) {
  const result = await run(file);
  const label = path.relative(root, file).replaceAll("\\", "/");
  console.log(`${result.passed ? "通过" : "失败"} ${label}`);
  const output = result.output.replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g, "[测试模块]");
  results.push({ file: label, passed: result.passed, output: output.slice(0, 5000) });
  if (!result.passed) {
    failures.push(label);
    console.error(output.trim().slice(0, 1800));
  }
}
console.log(`测试结果：${files.length - failures.length}/${files.length} 通过`);
const reportName = filters.length
  ? `.codex-test-results-${filters.join("_").replace(/[^a-zA-Z0-9_-]/g, "_")}.json`
  : ".codex-test-results.json";
await writeFile(path.join(root, reportName), JSON.stringify(results, null, 2));
process.exitCode = failures.length ? 1 : 0;
