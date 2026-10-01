import { invoke } from "@tauri-apps/api/core";

export function ensureTauriInvoke() {
  if (typeof invoke !== "function") {
    throw new Error("Tauri IPC 不可用：当前环境未注入 invoke，请在桌面应用窗口中使用此功能");
  }
  return invoke;
}
