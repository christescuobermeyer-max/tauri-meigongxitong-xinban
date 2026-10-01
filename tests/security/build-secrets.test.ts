import { equal, ok } from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const build = readFileSync(new URL("../../src-tauri/build.rs", import.meta.url), "utf8");
ok(!build.includes("cargo:rustc-env"), "构建不能把服务秘密嵌入二进制");
ok(!build.includes("read_to_string"), "构建不能读取本地秘密文件");
const runtime = readFileSync(new URL("../../src-tauri/src/env_config.rs", import.meta.url), "utf8");
ok(!runtime.includes("option_env!"), "运行时配置不能包含编译期服务秘密");
ok(runtime.includes("std::env::var"), "保留受控运行环境配置");

const root = new URL("../../", import.meta.url);
for (const file of [".env.local.bak-test", ".env.ssh.local.bak-test", "id_ed25519", "id_rsa"]) {
  const result = execFileSync("git", ["check-ignore", "--", file], { cwd: root, encoding: "utf8" }).trim();
  equal(result, file, `${file} 必须被忽略`);
}
const config = JSON.parse(readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
ok(!config.bundle.resources?.some((resource: string) => /cookie/i.test(resource)), "认证 cookie 不能随安装包分发");
console.log("构建秘密与私密文件边界验证通过");
