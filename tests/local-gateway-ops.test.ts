import { equal } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageSource = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const packageJson = JSON.parse(packageSource) as { scripts: Record<string, string> };

const firewallUrl = new URL("../scripts/install-local-backend-gateway-firewall.ps1", import.meta.url);
const startupUrl = new URL("../scripts/install-local-backend-gateway-startup.ps1", import.meta.url);
const installerUrl = new URL("../scripts/build-employee-installer.ps1", import.meta.url);
const docUrl = new URL("../docs/local-backend-gateway-windows.md", import.meta.url);

equal(existsSync(fileURLToPath(firewallUrl)), true);
equal(existsSync(fileURLToPath(startupUrl)), true);
equal(existsSync(fileURLToPath(installerUrl)), true);

const firewallScript = readFileSync(firewallUrl, "utf8");
const startupScript = readFileSync(startupUrl, "utf8");
const installerScript = readFileSync(installerUrl, "utf8");
const doc = readFileSync(docUrl, "utf8");

equal(packageJson.scripts["gateway:build"]?.includes("build-local-backend-gateway.ps1"), true);
equal(packageJson.scripts["gateway:start"]?.includes("start-local-backend-gateway.ps1"), true);
equal(packageJson.scripts["gateway:firewall"]?.includes("install-local-backend-gateway-firewall.ps1"), true);
equal(packageJson.scripts["gateway:startup"]?.includes("install-local-backend-gateway-startup.ps1"), true);
equal(firewallScript.includes("New-NetFirewallRule"), true);
equal(startupScript.includes("Register-ScheduledTask"), true);
equal(startupScript.includes("start-local-backend-gateway.ps1"), true);
equal(installerScript.includes("VITE_BACKEND_GATEWAY_URL"), true);
equal(installerScript.includes("npm run tauri:build"), true);
equal(doc.includes("npm run gateway:build"), true);
equal(doc.includes("npm run gateway:start"), true);
equal(doc.includes("开机自启动"), true);
