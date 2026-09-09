import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
var host = process.env.TAURI_DEV_HOST;
var packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
export default defineConfig({
    plugins: [react()],
    define: {
        __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    clearScreen: false,
    build: {
        emptyOutDir: true,
    },
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
            ? { protocol: "ws", host: host, port: 1421 }
            : undefined,
        watch: {
            ignored: ["**/src-tauri/**"],
        },
    },
});
