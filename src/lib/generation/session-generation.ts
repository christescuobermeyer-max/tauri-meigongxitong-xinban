import { getAssetLabel } from "../generation-flow";
import { getAutoRetryAttempt, runWithAutoRetry } from "../generation-retry";
import { archiveAssetToOss, generateAssetBase64 } from "../workspace-generation";
import { getSetterByKind } from "./session-state";
import type { RunOneOptions, RunOneResult } from "./session-types";

export async function runOneGeneration(options: RunOneOptions): Promise<RunOneResult | null> {
  const {
    kind,
    sourceImages,
    referenceImages,
    promptOverride,
    promptConfig,
    setters,
    shopName,
    productName = "",
    historyProductName,
    platform,
    currentPlatform,
    avatar,
    storefront,
    avatarMode,
    avatarCategory,
    generationLine,
    appearance,
    onToast,
  } = options;
  const setter = getSetterByKind(kind, setters);

  let generated: Awaited<ReturnType<typeof generateAssetBase64>> & { attempt: number };
  try {
    generated = await runWithAutoRetry({
      onAttempt: (attempt) =>
        setter((prev) => ({ ...prev, status: "running", errorMessage: undefined, attempt })),
      run: () =>
        generateAssetBase64({
          kind,
          shopName,
          productName,
          historyProductName,
          platform,
          currentPlatform,
          sourceImages,
          avatar,
          storefront,
          referenceImages,
          promptOverride,
          promptConfig,
          avatarMode,
          avatarCategory,
          generationLine,
          appearance,
        }),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const attempt = getAutoRetryAttempt(error);
    setter((prev) => ({
      ...prev,
      status: "failed",
      errorMessage: message,
      attempt: attempt ?? prev.attempt,
    }));
    onToast(`${getAssetLabel(kind)}生成失败：${message}`, "error");
    return null;
  }

  setter({
    kind,
    rawBase64: generated.rawBase64,
    rawDataUrl: generated.rawDataUrl,
    remoteUrl: generated.remoteUrl ?? "",
    generationLine: generated.generationLine,
    status: "succeeded",
    elapsedMs: generated.elapsedMs,
    attempt: generated.attempt,
    historyRecorded: generated.historyRecorded,
    historyError: generated.historyError,
    productName: generated.productName,
  });

  if (generated.remoteUrl) {
    return {
      rawBase64: generated.rawBase64,
      rawDataUrl: generated.rawDataUrl,
      remoteUrl: generated.remoteUrl,
      generationLine: generated.generationLine,
      elapsedMs: generated.elapsedMs,
      attempt: generated.attempt,
      historyRecorded: generated.historyRecorded,
      historyError: generated.historyError,
      productName: generated.productName,
    };
  }

  if (generated.archiveError) {
    // 归档失败的对外提示由 useGenerationWorkspace.recordHistory 统一给（更准确：
    // 会说明"未计入云端历史/今日统计"）；这里只保留 console 排查信息。
    console.warn(`[${kind}] 网关归档失败：`, generated.archiveError);
    return {
      rawBase64: generated.rawBase64,
      rawDataUrl: generated.rawDataUrl,
      remoteUrl: "",
      generationLine: generated.generationLine,
      elapsedMs: generated.elapsedMs,
      attempt: generated.attempt,
      historyRecorded: generated.historyRecorded,
      historyError: generated.historyError,
      productName: generated.productName,
    };
  }

  try {
    const remoteUrl = await archiveAssetToOss(kind, shopName, generated.rawBase64);
    setter((prev) => ({ ...prev, remoteUrl }));
    return {
      rawBase64: generated.rawBase64,
      rawDataUrl: generated.rawDataUrl,
      remoteUrl,
      generationLine: generated.generationLine,
      elapsedMs: generated.elapsedMs,
      attempt: generated.attempt,
      historyRecorded: generated.historyRecorded,
      historyError: generated.historyError,
      productName: generated.productName,
    };
  } catch (ossError: unknown) {
    // 同上：让 recordHistory 给统一文案，console 留技术细节
    console.warn(`[${kind}] 本地归档失败：`, ossError);
    return {
      rawBase64: generated.rawBase64,
      rawDataUrl: generated.rawDataUrl,
      remoteUrl: "",
      generationLine: generated.generationLine,
      elapsedMs: generated.elapsedMs,
      attempt: generated.attempt,
      historyRecorded: generated.historyRecorded,
      historyError: generated.historyError,
      productName: generated.productName,
    };
  }
}
