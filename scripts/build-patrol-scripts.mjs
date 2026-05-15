#!/usr/bin/env node
// 解析「每日群发话术50条.txt」 → 生成 src/lib/patrol-scripts.ts。
// 用法：node scripts/build-patrol-scripts.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const source = join(root, "每日群发话术50条.txt");
const target = join(root, "src", "lib", "patrol-scripts.ts");

const raw = readFileSync(source, "utf8");

const blockPattern = /【话术(\d+)·([^】]+)】\n([\s\S]*?)(?=\n*-{10,}|\n*={10,})/g;
const scripts = [];
let match;
while ((match = blockPattern.exec(raw)) !== null) {
  const id = Number(match[1]);
  const title = match[2].trim();
  // 移除 .txt 中为排版而加的硬换行：相邻非空行合并成一段
  const content = match[3]
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("");
  scripts.push({ id, title, content });
}

if (scripts.length !== 50) {
  console.error(`解析到 ${scripts.length} 条，期望 50 条，请检查 .txt 格式`);
  process.exit(1);
}

const ts =
  `// 由 scripts/build-patrol-scripts.mjs 自动生成，请勿手动编辑。\n` +
  `// 数据源：每日群发话术50条.txt（已剥离硬换行，正文合并为单段）。\n\n` +
  `export interface PatrolScript {\n` +
  `  id: number;\n` +
  `  title: string;\n` +
  `  content: string;\n` +
  `}\n\n` +
  `export const PATROL_SCRIPTS: PatrolScript[] = ${JSON.stringify(scripts, null, 2)};\n`;

writeFileSync(target, ts, "utf8");
console.log(`已写入 ${target}，共 ${scripts.length} 条话术。`);
