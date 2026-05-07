import { equal } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const startScriptUrl = new URL("../scripts/start-local-backend-gateway.ps1", import.meta.url);
const buildScriptUrl = new URL("../scripts/build-local-backend-gateway.ps1", import.meta.url);
const docUrl = new URL("../docs/local-backend-gateway-windows.md", import.meta.url);

equal(existsSync(fileURLToPath(startScriptUrl)), true);
equal(existsSync(fileURLToPath(buildScriptUrl)), true);
equal(existsSync(fileURLToPath(docUrl)), true);

const startScript = readFileSync(startScriptUrl, "utf8");
const buildScript = readFileSync(buildScriptUrl, "utf8");
const doc = readFileSync(docUrl, "utf8");

equal(startScript.includes("BACKEND_GATEWAY_HOST"), true);
equal(startScript.includes("BACKEND_GATEWAY_PORT"), true);
equal(startScript.includes("0.0.0.0"), true);
equal(startScript.includes("backend-gateway.exe"), true);
equal(startScript.includes("/health"), true);
equal(buildScript.includes("cargo build --release --bin backend-gateway"), true);
equal(doc.includes("VITE_BACKEND_GATEWAY_URL"), true);
equal(doc.includes("局域网 IP"), true);
equal(doc.includes("8787"), true);
