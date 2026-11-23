import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
var host = process.env.TAURI_DEV_HOST;
var packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
export default defineConfig({
    envDir: process.env.CSGH_PUBLIC_BUILD_ONLY === "1" ? false : undefined,
    plugins: [react()],
    define: {
        __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    clearScreen: false,
    build: {
        emptyOutDir: true,
        rollupOptions: {
            output: {
                // OCR 按语言代码定位本地语言包，文件名必须与语言代码匹配。
                assetFileNames: function (_a) {
                    var names = _a.names;
                    return names.includes("chi_sim.traineddata.gz")
                        ? "assets/chi_sim.traineddata.gz"
                        : "assets/[name]-[hash][extname]";
                },
            },
        },
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
