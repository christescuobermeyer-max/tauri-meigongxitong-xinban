import { listen } from "@tauri-apps/api/event";
import { ensureTauriInvoke } from "./invoke";

export interface InstallAppUpdateRequest {
  installerUrl: string;
  latestVersion: string;
  installerSha256: string;
}

export interface AppUpdateProgress {
  phase: "downloading" | "installing";
  downloadedBytes: number;
  totalBytes?: number | null;
  percent: number;
}

export async function installAppUpdate(req: InstallAppUpdateRequest): Promise<void> {
  await ensureTauriInvoke()<void>("install_app_update", {
    req: {
      installer_url: req.installerUrl,
      latest_version: req.latestVersion,
      installer_sha256: req.installerSha256,
    },
  });
}

export async function listenAppUpdateProgress(
  handler: (progress: AppUpdateProgress) => void
): Promise<() => void> {
  return await listen<AppUpdateProgress>("app-update://progress", (event) => {
    handler(event.payload);
  });
}

/** 调用 Rust 端：把图片上传到 OSS，并返回可访问 URL */
