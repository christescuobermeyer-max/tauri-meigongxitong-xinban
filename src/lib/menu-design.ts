import type { BrandStyle, ThemeColor } from "../types";

export const MENU_TEXT_LIMIT = 12000;
export const MENU_SCREENSHOT_LIMIT = 6;

export function validateMenuInput(text: string, screenshotCount: number, category: string): string | null {
  if (!category.trim()) return "请输入经营品类";
  if (category.trim().length > 60) return "经营品类最多 60 个字符";
  if (!text.trim() && screenshotCount === 0) return "请输入菜品信息或上传菜单截图";
  if (text.length > MENU_TEXT_LIMIT) return "菜单文字最多 12000 个字符";
  if (screenshotCount > MENU_SCREENSHOT_LIMIT) return "最多上传 6 张菜单截图";
  return null;
}

export function menuImageRequest(storeName: string, category: string, menu: string, appearance: { themeColor?: ThemeColor; brandStyle?: BrandStyle } = {}) {
  const error = validateMenuInput(menu, 0, category);
  if (error) throw new Error(error);
  if (menu.includes("待确认")) throw new Error("请先核对并修改菜单中标记为待确认的内容");
  return {
    prompt: "",
    prompt_config: { key: "menu.image", variables: { storeName: storeName.trim(), category: category.trim(), menu: menu.trim(), ...appearance } },
    size: "1024x1536",
    product_images: [],
    api_line: "auto" as const,
  };
}
