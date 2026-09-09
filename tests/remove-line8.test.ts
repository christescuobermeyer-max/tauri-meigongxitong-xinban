import { equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);

function read(path: string) {
  const url = new URL(path, root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const textFiles = [
  "src/lib/line-health.ts",
  "src/components/LineHealthBar.tsx",
  "src/lib/balance.ts",
  "src/lib/generation-size.ts",
  "src/lib/tauri.ts",
  "src-tauri/src/image_provider.rs",
  "src-tauri/src/api.rs",
  "src-tauri/src/apimart.rs",
  "src-tauri/src/api_validation.rs",
  "src-tauri/src/balance.rs",
  "src-tauri/src/line_health.rs",
  "src-tauri/src/gateway_limiter.rs",
  "src-tauri/src/bin/backend_gateway.rs",
  "docs/backend-gateway-deploy.md",
  "docs/cloud-gateway/gateway.env.example",
];

for (const path of textFiles) {
  const source = read(path);
  ok(!/line8|Line8|LINE8|线路8/.test(source), `${path} 不应再包含线路8入口`);
}

equal(existsSync(new URL("docs/apimart-official-line8-api.md", root)), false);
equal(existsSync(new URL("supabase/migrations/20260615_add_generation_line8.sql", root)), false);

console.log("remove line8 contract: OK");
