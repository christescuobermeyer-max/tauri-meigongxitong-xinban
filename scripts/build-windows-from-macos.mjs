import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const target = "x86_64-pc-windows-msvc";
const publicNames = ["VITE_BACKEND_GATEWAY_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];

function validatePublicConfig(env) {
  for (const name of publicNames) {
    if (!env[name]?.trim()) throw new Error(`请通过环境变量提供 ${name}；构建入口不读取本地凭据文件。`);
  }
  for (const name of publicNames.slice(0, 2)) {
    let url;
    try { url = new URL(env[name]); } catch { throw new Error(`${name} 必须是有效的 HTTPS 地址。`); }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error(`${name} 必须是无凭据和查询参数的 HTTPS 地址。`);
    }
  }
  const key = env.VITE_SUPABASE_ANON_KEY;
  let isAnon = false;
  try { isAnon = JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role === "anon"; } catch {}
  if (!key.startsWith("sb_publishable_") && !isAnon) {
    throw new Error("Supabase 客户端只能使用公开 publishable key 或 anon key。");
  }
}

export function createBuildPlan({ platform = process.platform, home = os.homedir(), root = projectRoot, env = process.env, doctor = false } = {}) {
  if (platform !== "darwin") throw new Error("此入口用于 macOS；Windows 请继续使用 npm run tauri:build:nsis。");
  if (!doctor) validatePublicConfig(env);
  const cache = path.join(home, "Library", "Caches", "csgh-image-studio", "windows-build");
  const buildEnv = { ...env };
  for (const name of Object.keys(buildEnv)) {
    if (name.startsWith("VITE_") && !publicNames.includes(name)) delete buildEnv[name];
  }
  const cargoBin = path.join(env.CARGO_HOME || path.join(home, ".cargo"), "bin");
  const toolPaths = [cargoBin, ...["/opt/homebrew", "/usr/local"].flatMap(prefix => [
    path.join(prefix, "opt", "llvm", "bin"), path.join(prefix, "opt", "lld", "bin"), path.join(prefix, "bin"),
  ])];
  Object.assign(buildEnv, {
    PATH: [...toolPaths, env.PATH || "/usr/bin:/bin"].join(path.delimiter),
    CARGO_TARGET_DIR: path.resolve(env.CARGO_TARGET_DIR || path.join(cache, "target")),
    XWIN_CACHE_DIR: path.resolve(env.XWIN_CACHE_DIR || path.join(cache, "xwin")),
    CSGH_PUBLIC_BUILD_ONLY: "1",
  });
  return {
    root,
    env: buildEnv,
    args: [path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js"), "build", "--ci",
      "--runner", "cargo-xwin", "--target", target,
      "--config", JSON.stringify({ bundle: { targets: "nsis" } }), "--", "--locked"],
  };
}

function checkTools(plan) {
  for (const [command, args] of [
    ["cargo", ["--version"]], ["cargo-xwin", ["--version"]], ["makensis", ["-VERSION"]],
    ["clang-cl", ["--version"]], ["lld-link", ["--version"]],
  ]) {
    const result = spawnSync(command, args, { env: plan.env, encoding: "utf8" });
    if (result.error || result.status !== 0) throw new Error(`缺少可用的 ${command}，请按 macOS 交叉编译文档安装工具链。`);
    console.log(`${command}: ${(result.stdout || result.stderr).trim().split("\n")[0]}`);
  }
  const targets = spawnSync("rustup", ["target", "list", "--installed"], { env: plan.env, encoding: "utf8" });
  if (targets.status !== 0 || !targets.stdout.split(/\s+/).includes(target)) {
    throw new Error(`请先执行 rustup target add ${target}`);
  }
  for (const binary of ["ffmpeg", "yt-dlp"]) {
    if (!existsSync(path.join(plan.root, "src-tauri", "binaries", `${binary}-${target}.exe`))) {
      throw new Error(`缺少 Windows 外置程序：${binary}-${target}.exe`);
    }
  }
}

export function main(args = process.argv.slice(2)) {
  if (args.some(arg => arg !== "--doctor")) throw new Error("用法：npm run tauri:build:windows 或 npm run tauri:doctor:windows");
  const doctor = args.includes("--doctor");
  const plan = createBuildPlan({ doctor });
  checkTools(plan);
  if (doctor) {
    console.log("Windows x64 交叉编译工具链和外置程序检查通过。");
    return;
  }
  mkdirSync(plan.env.CARGO_TARGET_DIR, { recursive: true });
  mkdirSync(plan.env.XWIN_CACHE_DIR, { recursive: true });
  console.log("开始构建 Windows x64 NSIS 安装包；前端仅使用显式提供的公开配置。");
  const result = spawnSync(process.execPath, plan.args, { cwd: plan.root, env: plan.env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Windows 构建失败，退出码：${result.status ?? result.signal}`);
  console.log(`安装包目录：${path.join(plan.env.CARGO_TARGET_DIR, target, "release", "bundle", "nsis")}`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
