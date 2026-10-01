import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const roots = ["src", "src-tauri/src", "scripts"].map((dir) => path.resolve(root, dir));

function isSource(file) {
  return roots.some((dir) => file.startsWith(`${dir}${path.sep}`));
}

function resolveTypeScript(file, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(file), specifier);
  const stem = /\.(m?js)$/.test(base) ? base.replace(/\.(m?js)$/, "") : base;
  return [base, ...[".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"].map((suffix) => stem + suffix)]
    .find((candidate) => isSource(candidate) && existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

function dependencies(file, source) {
  if (file.endsWith(".rs")) {
    const children = [];
    const dir = path.dirname(file);
    const moduleDir = /(?:mod|lib|main)\.rs$/.test(file) || ["bin", "gateway_bin"].includes(path.basename(dir))
      ? dir : path.join(dir, path.basename(file, ".rs"));
    for (const match of source.matchAll(/(?:#\[path\s*=\s*"([^"]+)"\]\s*)?(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/g)) {
      const candidates = match[1]
        ? [path.resolve(dir, match[1])]
        : [path.join(moduleDir, `${match[2]}.rs`), path.join(moduleDir, match[2], "mod.rs")];
      const child = candidates.find((candidate) => isSource(candidate) && existsSync(candidate));
      if (child) children.push(child);
    }
    return children;
  }
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  return ast.statements.flatMap((node) => {
    if (!(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) return [];
    const child = resolveTypeScript(file, node.moduleSpecifier.text);
    return child ? [child] : [];
  });
}

/** 契约检查读取真实模块闭包，不依赖内部实现仍在旧门面文件中。 */
export function readSourceTree(input) {
  const file = input instanceof URL ? fileURLToPath(input) : path.resolve(input);
  if (!isSource(file)) throw new Error("只能读取项目源码目录");
  const seen = new Set();
  function visit(current) {
    if (seen.has(current)) return "";
    seen.add(current);
    const source = readFileSync(current, "utf8");
    return [source, ...dependencies(current, source).map(visit)].join("\n");
  }
  return visit(file);
}

const splitEntries = new Map([
  ["src/lib/tauri.ts", "src/lib/desktop"],
  ["src/lib/workspace-session.ts", "src/lib/generation"],
  ["src/lib/image-edit.ts", "src/lib/image-edit"],
  ["src/hooks/useGenerationWorkspace.ts", "src/hooks/generation"],
  ["src/hooks/useImageEditWorkspace.ts", "src/hooks/image-edit"],
  ["src/hooks/useProductBatchWorkspace.ts", "src/hooks/product-batch"],
  ["src/hooks/usePictureWallWorkspace.ts", "src/hooks/picture-wall"],
  ["src/components/admin/AdminBalancePanel.tsx", "src/components/admin/balance"],
  ["src/components/admin/AdminGatewayMonitor.tsx", "src/components/admin/gateway"],
  ["src/components/admin/LineChart.tsx", "src/components/admin/line-chart"],
  ["src/components/video-signboard/useVideoSignboard.ts", "src/components/video-signboard"],
  ...["video_commands", "image_proc", "prompt_templates", "gateway_queue", "gateway_limiter", "brand_story", "xiaohongshu_cookie_support", "app_update"].map((name) => [`src-tauri/src/${name}.rs`, `src-tauri/src/${name}`]),
  ["src-tauri/src/gateway_bin/backend_gateway.rs", "src-tauri/src/gateway_bin/gateway"],
  ["scripts/export-user-today-images-by-shop.mjs", "scripts/export/user-day"],
  ["scripts/export-oss-images-incremental.mjs", "scripts/export/incremental"],
  ["scripts/export-oss-images.mjs", "scripts/export/all"],
  ["scripts/organize-by-operator.mjs", "scripts/export/operator"],
]);

/** 保留旧文件读取方式，仅将已拆分门面的同职责子模块纳入契约检查。 */
export function readProjectFile(input, options) {
  const file = input instanceof URL ? fileURLToPath(input) : path.resolve(input);
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const group = splitEntries.get(relative);
  if (!group) return readFileSync(input, options);
  const directory = path.resolve(root, group);
  const seen = new Set();
  function visit(current) {
    if (seen.has(current)) return "";
    seen.add(current);
    const source = readFileSync(current, "utf8");
    const children = dependencies(current, source).filter((child) => child.startsWith(directory + path.sep));
    return [source, ...children.map(visit)].join("\n");
  }
  const source = visit(file);
  return options === "utf8" || options?.encoding === "utf8" ? source : Buffer.from(source);
}
