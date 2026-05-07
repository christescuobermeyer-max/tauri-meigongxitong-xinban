import { equal } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const guardUrl = new URL("../src/lib/devtools-guard.ts", import.meta.url);
const guardPath = fileURLToPath(guardUrl);
const mainSource = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const cargoSource = readFileSync(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");
const tauriConfigSource = readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8");

equal(existsSync(guardPath), true);

const guardSource = readFileSync(guardUrl, "utf8");

equal(mainSource.includes("installDevtoolsGuard"), true);
equal(guardSource.includes('addEventListener("contextmenu"'), true);
equal(guardSource.includes('event.key === "F12"'), true);
equal(guardSource.includes("preventDefault()"), true);
equal(guardSource.includes("stopPropagation()"), true);
equal(cargoSource.includes("devtools"), false);
equal(tauriConfigSource.includes('"devtools"'), false);
