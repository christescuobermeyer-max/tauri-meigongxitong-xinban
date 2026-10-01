import { open, save } from "@tauri-apps/plugin-dialog";
import { ensureTauriInvoke } from "./invoke";

export interface ResizeAndSaveRequest {
  base64_data: string;
  target_width: number;
  target_height: number;
  output_path: string;
  max_bytes?: number;
}

export interface SaveBase64ImageRequest {
  base64_data: string;
  output_path: string;
}

/** 调用 Rust 端：base64 → 拉伸到目标尺寸 → 写入磁盘（保留完整内容、不裁剪） */
export async function resizeAndSaveImage(req: ResizeAndSaveRequest): Promise<string> {
  return await ensureTauriInvoke()<string>("resize_and_save_image", { req });
}

/** 调用 Rust 端：base64 图片原样写入磁盘，不改变尺寸和编码 */
export async function saveBase64Image(req: SaveBase64ImageRequest): Promise<string> {
  return await ensureTauriInvoke()<string>("save_base64_image", { req });
}

interface SaveFilter {
  name: string;
  extensions: string[];
}

/** 弹出原生保存对话框 */
export async function pickSavePath(
  defaultName: string,
  filters = [
    { name: "PNG 图像", extensions: ["png"] },
    { name: "JPEG 图像", extensions: ["jpg", "jpeg"] },
  ] satisfies SaveFilter[]
): Promise<string | null> {
  const result = await save({
    defaultPath: defaultName,
    filters,
  });
  return result ?? null;
}

/** 弹出原生文件夹选择对话框 */
export async function pickDirectoryPath(title = "选择文件夹"): Promise<string | null> {
  const result = await open({
    title,
    directory: true,
    multiple: false,
  });
  if (Array.isArray(result)) return result[0] ?? null;
  return result ?? null;
}
