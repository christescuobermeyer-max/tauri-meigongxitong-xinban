import { equal } from "node:assert/strict";
import { readFileSync } from "node:fs";

const tauriConfig = JSON.parse(
  readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
);

const mainWindow = tauriConfig.app.windows.find((windowConfig: { label?: string }) => {
  return windowConfig.label === "main";
});

equal(mainWindow.height, 970);
