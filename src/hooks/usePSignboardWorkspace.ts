import { useEffect, useState } from "react";
import { getPSignboardShopName } from "../lib/p-signboard-form";
import { generatePSignboardItem } from "../lib/p-signboard";
import { getAutoRetryAttempt } from "../lib/generation-retry";
import { getPlatform } from "../lib/platforms";
import { saveGeneratedAsset } from "../lib/save-generated-asset";
import { emptyItem, isBusyStatus } from "../lib/workspace-session";
import type {
  AssetKind,
  GenerationItem,
  GenerationLine,
  Platform,
  UploadedImage,
} from "../types";

const P_SIGNBOARD_PLATFORM: Platform = "meituan";

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

export default function usePSignboardWorkspace({
  generationLine,
  onToast,
  onRecordHistory,
}: Options) {
  const [shopName, setShopName] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [originalText, setOriginalText] = useState("");
  const [newText, setNewText] = useState("");
  const [item, setItem] = useState<GenerationItem>(emptyItem("p_signboard"));

  useEffect(() => {
    if (images.length === 0) setItem(emptyItem("p_signboard"));
  }, [images]);

  const busy = isBusyStatus(item.status);

  function validateInputs() {
    if (images.length !== 1) {
      onToast("请上传 1 张门头图片", "error");
      return false;
    }
    if (!originalText.trim() || !newText.trim()) {
      onToast("请填写原有文字和新文字", "error");
      return false;
    }
    return true;
  }

  async function handleGenerate() {
    if (!validateInputs()) return;

    const snapshot = {
      shopName: getPSignboardShopName(shopName),
      originalText,
      newText,
      generationLine,
    };

    setItem({ ...emptyItem("p_signboard"), status: "running" });
    onToast("正在上传门头图并替换招牌文字，请耐心等待…", "info");
    try {
      const result = await generatePSignboardItem(images[0], {
        shopName: snapshot.shopName,
        originalText: snapshot.originalText,
        newText: snapshot.newText,
        generationLine: snapshot.generationLine,
        onAttempt: (attempt) =>
          setItem((previous) => ({
            ...previous,
            status: "running",
            errorMessage: undefined,
            attempt,
          })),
      });
      setItem(result);
      onRecordHistory("p_signboard", result, snapshot.shopName, P_SIGNBOARD_PLATFORM);
      onToast("P门头已生成并同步到云端记录", "success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const attempt = getAutoRetryAttempt(error);
      setItem((previous) => ({
        ...previous,
        status: "failed",
        errorMessage: message,
        attempt: attempt ?? previous.attempt,
      }));
      onToast(`P门头生成失败：${message}`, "error");
    }
  }

  async function handleDownload() {
    try {
      const saved = await saveGeneratedAsset(
        "p_signboard",
        item,
        shopName,
        getPlatform(P_SIGNBOARD_PLATFORM)
      );
      if (!saved) return;
      onToast(`已保存至：${saved}`, "success");
    } catch (error: unknown) {
      onToast(
        `保存失败：${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
    }
  }

  function reset() {
    setImages([]);
    setOriginalText("");
    setNewText("");
    setItem(emptyItem("p_signboard"));
  }

  return {
    shopName,
    setShopName,
    images,
    setImages,
    originalText,
    setOriginalText,
    newText,
    setNewText,
    item,
    busy,
    handleGenerate,
    handleDownload,
    reset,
  };
}
