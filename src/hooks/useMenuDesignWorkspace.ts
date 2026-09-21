import { useRef, useState } from "react";
import { callBackendGateway, generateArchivedImageWithLine, getBackendGatewayUrl, pickSavePath, saveBase64Image } from "../lib/tauri";
import { menuImageRequest, validateMenuInput } from "../lib/menu-design";
import { imageBase64ToDataUrl } from "../lib/oss-image-download";
import { safeFileName } from "../lib/utils";
import type { AssetKind, BrandStyle, GenerationItem, Platform, ThemeColor, UploadedImage } from "../types";

interface Options {
  onToast: (message: string, tone: "error" | "info" | "success") => void;
  onRecordHistory: (kind: AssetKind, item: GenerationItem, shopName: string, platform: Platform) => void;
}

export default function useMenuDesignWorkspace({ onToast, onRecordHistory }: Options) {
  const [storeName, setStoreName] = useState("");
  const [category, setCategory] = useState("");
  const [themeColor, setThemeColor] = useState<ThemeColor | "">("");
  const [brandStyle, setBrandStyle] = useState<BrandStyle | "">("");
  const [text, setText] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [menu, setMenu] = useState("");
  const [phase, setPhase] = useState<"idle" | "text" | "image">("idle");
  const [item, setItem] = useState<GenerationItem>({ kind: "menu_design", rawBase64: null, rawDataUrl: null, status: "idle" });
  const [resultStore, setResultStore] = useState("");
  const lock = useRef(false);
  const busy = phase !== "idle";

  async function organize() {
    if (lock.current) return;
    const error = validateMenuInput(text, images.length, category);
    if (error) return onToast(error, "error");
    lock.current = true;
    setPhase("text");
    try {
      const result = await callBackendGateway<{ menu: string }>("/api/menu-organize", {
        text: text.trim(), category: category.trim(),
        screenshots: images.map((image) => `data:${image.mime};base64,${image.productBase64}`),
      });
      if (!result.menu?.trim() || result.menu.length > 12000) throw new Error("菜单整理结果为空或过长，请缩小菜单范围后重试");
      setMenu(result.menu);
      onToast("菜单整理完成，请核对菜名、规格和价格", "success");
    } catch (error) { onToast(error instanceof Error ? error.message : String(error), "error"); }
    finally { lock.current = false; setPhase("idle"); }
  }

  async function generate() {
    if (lock.current) return;
    if (!storeName.trim()) return onToast("请输入店铺名称", "error");
    if (!getBackendGatewayUrl()) return onToast("菜单设计需要连接云端网关", "error");
    let request;
    try { request = menuImageRequest(storeName, category, menu, { themeColor: themeColor || undefined, brandStyle: brandStyle || undefined }); }
    catch (error) { return onToast((error as Error).message, "error"); }
    const shop = storeName.trim();
    lock.current = true;
    setPhase("image");
    setItem({ kind: "menu_design", status: "running", rawBase64: null, rawDataUrl: null });
    const started = Date.now();
    try {
      const result = await generateArchivedImageWithLine(request, {
        asset_kind: "menu_design", shop_name: shop, platform: "meituan",
        file_name_stem: `${safeFileName(shop)}-menu-design`,
      });
      const next: GenerationItem = {
        kind: "menu_design", status: "succeeded", rawBase64: result.image,
        rawDataUrl: result.imageDataUrl, remoteUrl: result.archiveUrl,
        generationLine: result.generationLine, historyRecorded: result.historyRecorded,
        historyError: result.historyError, elapsedMs: Date.now() - started,
      };
      setItem(next);
      setResultStore(shop);
      onRecordHistory("menu_design", next, shop, "meituan");
      onToast("菜单图生成完成", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setItem({ kind: "menu_design", status: "failed", rawBase64: null, rawDataUrl: null, errorMessage: message });
      onToast(message, "error");
    } finally { lock.current = false; setPhase("idle"); }
  }

  async function download() {
    if (item.status !== "succeeded" || !item.rawBase64) return;
    try {
      const dataUrl = imageBase64ToDataUrl(item.rawBase64);
      const extension = dataUrl.startsWith("data:image/jpeg;") ? "jpg" : dataUrl.startsWith("data:image/webp;") ? "webp" : "png";
      const path = await pickSavePath(`${safeFileName(resultStore)}_菜单设计.${extension}`, [{ name: "菜单图", extensions: [extension] }]);
      if (path) {
        await saveBase64Image({ base64_data: item.rawBase64, output_path: path });
        onToast("菜单图已保存", "success");
      }
    }
    catch (error) { onToast(error instanceof Error ? error.message : String(error), "error"); }
  }

  function changeText(value: string) {
    if (lock.current) return;
    setText(value);
    setMenu("");
  }

  function changeImages(value: UploadedImage[]) {
    if (lock.current) return;
    setImages(value);
    setMenu("");
  }

  return { storeName, setStoreName, category, setCategory, themeColor, setThemeColor, brandStyle, setBrandStyle, text, setText: changeText, images, setImages: changeImages, menu, setMenu, phase, busy, item, organize, generate, download };
}
