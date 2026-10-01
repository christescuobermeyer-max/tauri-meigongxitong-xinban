import { WORKSPACE_CATALOG, listWorkspaceNavigation } from "../src/lib/workspace-catalog.js";
import { equal, ok } from "node:assert/strict";
import { readProjectFile as readFileSync } from "./helpers/source-tree.mjs";

const sidebar = readFileSync(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");
const workspaceTabs = readFileSync(new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url), "utf8");
const workspacePages = readFileSync(new URL("../src/components/WorkspacePages.tsx", import.meta.url), "utf8");
const workspaceShell = readFileSync(new URL("../src/components/WorkspaceShell.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/components/ImageResizePage.tsx", import.meta.url), "utf8");
const rust = readFileSync(new URL("../src-tauri/src/image_proc.rs", import.meta.url), "utf8");
const rustLib = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const cargo = readFileSync(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");

ok(listWorkspaceNavigation(true).findIndex((item) => item.key === "dataAnalysis") < listWorkspaceNavigation(true).findIndex((item) => item.key === "imageResize"));
ok(listWorkspaceNavigation(true).some((item) => item.label === "尺寸调整"));
ok(Object.hasOwn(WORKSPACE_CATALOG, "imageResize"));
ok(workspacePages.includes('workspace.tab === "imageResize"'));
ok(workspacePages.includes("<ImageResizePage />"));
ok(workspaceShell.includes("<WorkspacePages workspace={workspace} />"));

ok(page.includes('invoke<ImageInfo[]>("select_images")'));
ok(page.includes('invoke<ImageInfo[]>("select_image_folder")'));
ok(page.includes('invoke<ProcessResult[]>("process_images"'));
ok(page.includes('invoke("open_image_output_folder"'));
ok(page.includes('dimensions: "600×450"'));
ok(page.includes('dimensions: "800×800"'));

ok(rust.includes("pub async fn select_images"));
ok(rust.includes("pub async fn select_image_folder"));
ok(rust.includes("pub async fn process_images"));
ok(rust.includes("pub async fn open_image_output_folder"));
ok(rust.includes("FilterType::Lanczos3"));
ok(rust.includes("512_000_u64"));
ok(rust.includes("target_width") && rust.includes("target_height"));
ok(rustLib.includes("image_proc::select_images"));
ok(rustLib.includes("image_proc::process_images"));
ok(cargo.includes('"bmp"'));
ok(cargo.includes('"gif"'));

equal(true, true);
console.log("image resize contract: OK");
