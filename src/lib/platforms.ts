import type { PlatformSpec } from "../types";

export const PLATFORMS: PlatformSpec[] = [
  {
    id: "meituan",
    label: "美团",
    avatar: { w: 800, h: 800 },
    storefront: { w: 692, h: 390 },
    poster: {
      sourceLabel: "21:9",
      export: { w: 720, h: 240 },
    },
    product: {
      source: { w: 1536, h: 1024 },
      export: { w: 600, h: 450 },
      maxBytes: 500 * 1024,
    },
    swatch: "#FFC300",
  },
  {
    id: "taobao",
    label: "淘宝闪购",
    avatar: { w: 800, h: 800 },
    storefront: { w: 750, h: 423 },
    poster: {
      sourceLabel: "21:9",
      export: { w: 2048, h: 600 },
    },
    product: {
      source: { w: 1024, h: 1024 },
      export: { w: 600, h: 600 },
    },
    swatch: "#FF5A28",
  },
];

export function getPlatform(id: string): PlatformSpec {
  const p = PLATFORMS.find((p) => p.id === id);
  if (!p) throw new Error(`未知平台：${id}`);
  return p;
}
