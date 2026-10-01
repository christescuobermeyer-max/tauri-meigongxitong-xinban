import { useEffect, useState } from "react";

export function useVideoExportPath() {
  const [exportPath, setExportPath] = useState("");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const savedExportPath = await invoke<string | null>("get_video_export_path");
        if (!cancelled) setExportPath(savedExportPath ?? "");
      } catch {
        if (!cancelled) setExportPath("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { exportPath, setExportPath };
}
