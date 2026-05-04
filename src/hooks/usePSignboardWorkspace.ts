import { useEffect, useState } from "react";
import { getPSignboardShopName } from "../lib/p-signboard-form";
import { generatePSignboardItem } from "../lib/p-signboard";
import { emptyItem, isBusyStatus } from "../lib/workspace-session";
import type { GenerationItem, GenerationLine, UploadedImage } from "../types";

interface Options {
  shopName: string;
  generationLine: GenerationLine;
  onToast: (message: string, tone: "error" | "info" | "success") => void;
  onRecordPSignboardHistory?: (item: GenerationItem) => void;
}

export default function usePSignboardWorkspace({
  shopName,
  generationLine,
  onToast,
  onRecordPSignboardHistory,
}: Options) {
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
    setItem({ ...emptyItem("p_signboard"), status: "running" });
    onToast("正在上传门头图并替换招牌文字，请耐心等待…", "info");
    try {
      const result = await generatePSignboardItem(images[0], {
        shopName: getPSignboardShopName(shopName),
        originalText,
        newText,
        generationLine,
      });
      setItem(result);
      onRecordPSignboardHistory?.(result);
      onToast("P门头已生成并同步到云端记录", "success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setItem((previous) => ({ ...previous, status: "failed", errorMessage: message }));
      onToast(`P门头生成失败：${message}`, "error");
    }
  }

  function reset() {
    setImages([]);
    setOriginalText("");
    setNewText("");
    setItem(emptyItem("p_signboard"));
  }

  return {
    images,
    setImages,
    originalText,
    setOriginalText,
    newText,
    setNewText,
    item,
    busy,
    handleGenerate,
    reset,
  };
}
