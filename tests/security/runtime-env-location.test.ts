import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../../src-tauri/src/env_config.rs", import.meta.url), "utf8");
ok(source.includes("std::env::current_exe()"), "取消内嵌密钥后，受控直连程序必须能查找安装目录的运行时配置");
ok(!source.includes("option_env!"), "不能为兼容直连恢复编译期服务秘密");
