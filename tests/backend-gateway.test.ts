import { equal } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const tauriSource = readFileSync(new URL("../src/lib/tauri.ts", import.meta.url), "utf8");
const adminSource = readFileSync(new URL("../src/lib/admin.ts", import.meta.url), "utf8");
const envTypesSource = readFileSync(new URL("../src/env.d.ts", import.meta.url), "utf8");
const cargoSource = readFileSync(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");
const gatewayUrl = new URL("../src-tauri/src/bin/backend_gateway.rs", import.meta.url);

equal(existsSync(fileURLToPath(gatewayUrl)), true);

const gatewaySource = readFileSync(gatewayUrl, "utf8");

equal(envTypesSource.includes("VITE_BACKEND_GATEWAY_URL"), true);
equal(tauriSource.includes("getBackendGatewayUrl"), true);
equal(tauriSource.includes("callBackendGateway"), true);
equal(tauriSource.includes('"/api/generate-image"'), true);
equal(tauriSource.includes('"/api/upload-image-to-oss"'), true);
equal(tauriSource.includes("Authorization"), true);
equal(adminSource.includes('"/api/admin-create-user"'), true);
equal(cargoSource.includes("axum"), true);
equal(cargoSource.includes('default-run = "csgh-image-studio"'), true);
equal(cargoSource.includes("[[bin]]"), true);
equal(cargoSource.includes("backend-gateway"), true);
equal(gatewaySource.includes("/api/generate-image"), true);
equal(gatewaySource.includes("/api/upload-image-to-oss"), true);
equal(gatewaySource.includes("/api/admin-create-user"), true);
equal(gatewaySource.includes("verify_access_token"), true);
