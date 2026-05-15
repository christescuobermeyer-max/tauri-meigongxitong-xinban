import { useState } from "react";
import { getAutoRetryAttempt, runWithAutoRetry } from "../lib/generation-retry";
import { compressAndArchiveGenerated } from "../lib/oss-assets";
import {
  PATROL_SCRIPT_ASSET_KIND,
  PATROL_SCRIPT_EXPORT_SIZE,
  PATROL_SCRIPT_PLATFORM,
  buildPatrolScriptPrompt,
  resolvePatrolScriptSize,
} from "../lib/patrol-script";
import { PATROL_SCRIPTS, type PatrolScript } from "../lib/patrol-scripts";
import { generateImage, pickSavePath, resizeAndSaveImage } from "../lib/tauri";
import { safeFileName } from "../lib/utils";
import type { AssetKind, GenerationItem, GenerationLine, Platform } from "../types";

interface Options {
  generationLine: GenerationLine;
  onToast: (message: string, tone: "error" | "info" | "success") => void;
  onRecordHistory: (
    kind: AssetKind,
    item: GenerationItem,
    shopName: string,
    platform: Platform
  ) => void;
}

const INITIAL_ITEM: GenerationItem = {
  kind: PATROL_SCRIPT_ASSET_KIND,
  rawBase64: null,
  rawDataUrl: null,
  status: "idle",
};

export default function usePatrolScriptWorkspace({
  generationLine,
  onToast,
  onRecordHistory,
}: Options) {
  const [storeName, setStoreName] = useState("");
  const [scriptId, setScriptId] = useState<number>(PATROL_SCRIPTS[0]?.id ?? 1);
  const [item, setItem] = useState<GenerationItem>(INITIAL_ITEM);

  const selectedScript: PatrolScript =
    PATROL_SCRIPTS.find((s) => s.id === scriptId) ?? PATROL_SCRIPTS[0];

  const busy = item.status === "running" || item.status === "queued";

  function validateInputs() {
    if (!storeName.trim()) {
      onToast("请输入店铺名称", "error");
      return false;
    }
    if (!selectedScript) {
      onToast("请先选择一条巡店话术", "error");
      return false;
    }
    return true;
  }

  async function handleGenerate() {
    if (!validateInputs()) return;
    await runGeneration({
      storeName: storeName.trim(),
      script: selectedScript,
      generationLine,
    });
  }

  async function handleRetry() {
    if (!validateInputs()) return;
    await runGeneration({
      storeName: storeName.trim(),
      script: selectedScript,
      generationLine,
    });
  }

  async function handleCopyScript() {
    if (!selectedScript?.content) return;
    try {
      await navigator.clipboard.writeText(selectedScript.content);
      onToast("巡店话术已复制到剪贴板", "success");
    } catch {
      onToast("复制失败，请手动选中话术复制", "error");
    }
  }

  async function runGeneration(snapshot: {
    storeName: string;
    script: PatrolScript;
    generationLine: GenerationLine;
  }) {
    const started = Date.now();
    setItem({
      ...INITIAL_ITEM,
      status: "running",
      generationLine: snapshot.generationLine,
    });
    onToast("正在生成巡店话术卡片…", "info");

    try {
      const result = await runWithAutoRetry({
        onAttempt: (attempt) =>
          setItem((current) => ({
            ...current,
            status: "running",
            errorMessage: undefined,
            attempt,
          })),
        run: async () => {
          const rawBase64 = await generateImage({
            prompt: buildPatrolScriptPrompt(snapshot.storeName, snapshot.script.content),
            size: resolvePatrolScriptSize(snapshot.generationLine),
            product_images: [],
            api_line: snapshot.generationLine,
          });
          return { rawBase64 };
        },
      });
      const remoteUrl = await compressAndArchiveGenerated(
        PATROL_SCRIPT_ASSET_KIND,
        result.rawBase64,
        `${safeFileName(snapshot.storeName)}-patrol-script-${snapshot.script.id}`
      );
      const itemWithRemoteUrl: GenerationItem = {
        kind: PATROL_SCRIPT_ASSET_KIND,
        rawBase64: result.rawBase64,
        rawDataUrl: `data:image/png;base64,${result.rawBase64}`,
        remoteUrl,
        status: "succeeded",
        generationLine: snapshot.generationLine,
        elapsedMs: Date.now() - started,
        attempt: result.attempt,
      };
      setItem(itemWithRemoteUrl);
      onRecordHistory(
        PATROL_SCRIPT_ASSET_KIND,
        itemWithRemoteUrl,
        snapshot.storeName,
        PATROL_SCRIPT_PLATFORM
      );
      onToast("巡店话术卡片生成完成", "success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const attempt = getAutoRetryAttempt(error);
      setItem((current) => ({
        ...current,
        status: "failed",
        errorMessage: message,
        attempt: attempt ?? current.attempt,
      }));
      onToast(`巡店话术卡片生成失败：${message}`, "error");
    }
  }

  async function handleDownload() {
    if (item.status !== "succeeded" || !item.rawBase64) return;
    const fileName = `${safeFileName(storeName)}_巡店话术${selectedScript.id}_${PATROL_SCRIPT_EXPORT_SIZE.w}x${PATROL_SCRIPT_EXPORT_SIZE.h}.png`;
    try {
      const selectedPath = await pickSavePath(fileName);
      if (!selectedPath) return;
      const saved = await resizeAndSaveImage({
        base64_data: item.rawBase64,
        target_width: PATROL_SCRIPT_EXPORT_SIZE.w,
        target_height: PATROL_SCRIPT_EXPORT_SIZE.h,
        output_path: selectedPath,
      });
      onToast(`已保存至：${saved}`, "success");
    } catch (error: unknown) {
      onToast(
        `巡店话术卡片下载失败：${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
    }
  }

  return {
    storeName,
    setStoreName,
    scriptId,
    setScriptId,
    selectedScript,
    item,
    busy,
    handleGenerate,
    handleRetry,
    handleCopyScript,
    handleDownload,
  };
}
