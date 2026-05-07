import { deepEqual, equal } from "node:assert/strict";
import * as historyModule from "../src/lib/history.js";
import {
  appendHistoryEntry,
  getHistoryTitle,
  type HistoryEntry,
} from "../src/lib/history.js";

const seed = Array.from({ length: 10 }, (_, index) => ({
  id: `old-${index}`,
  kind: "avatar",
  title: `旧记录 ${index}`,
  shopName: `店铺 ${index}`,
  remoteUrl: `https://example.com/${index}.png`,
  generationLine: index % 2 === 0 ? "line1" : "line2",
  createdAt: `2026-05-02T16:0${index}:00.000Z`,
})) satisfies HistoryEntry[];

const next = appendHistoryEntry(seed, {
  id: "newest",
  kind: "poster",
  title: getHistoryTitle("poster"),
  shopName: "半山小厨",
  remoteUrl: "https://example.com/newest.png",
  generationLine: "line2",
  createdAt: "2026-05-02T17:00:00.000Z",
}, new Date("2026-05-03T12:00:00.000Z"));

equal(next.length, 11);
equal(next[0].id, "newest");
equal(next.at(-1)?.id, "old-9");
deepEqual(next.map((item) => item.remoteUrl).includes("https://example.com/9.png"), true);
equal(next[0].generationLine, "line2");

equal(getHistoryTitle("avatar"), "头像");
equal(getHistoryTitle("storefront"), "店招");
equal(getHistoryTitle("poster"), "海报");
equal(getHistoryTitle("product"), "产品图");
equal(getHistoryTitle("p_signboard"), "P门头");
equal(getHistoryTitle("picture_wall"), "图片墙");
equal(getHistoryTitle("detail_page"), "详情页");

const cloudLogs = Array.from({ length: 11 }, (_, index) => ({
  id: `log-${index}`,
  user_id: "user-1",
  shop_name: `云端店铺 ${index}`,
  asset_kind: index % 2 === 0 ? "avatar" : "product",
  platform: "meituan",
  oss_url: `https://example.com/cloud-${index}.png`,
  oss_key: null,
  created_at: new Date(Date.UTC(2026, 4, 10, 12, index, 0)).toISOString(),
  generation_line: index % 2 === 0 ? "line1" : "line2",
}));

cloudLogs.push({
  id: "expired-log",
  user_id: "user-1",
  shop_name: "过期店铺",
  asset_kind: "poster",
  platform: "meituan",
  oss_url: "https://example.com/cloud-expired.png",
  oss_key: null,
  created_at: "2026-05-01T00:00:00.000Z",
  generation_line: "line2",
});

equal("buildHistoryEntriesFromGenerationLogs" in historyModule, true);

const mapped = (
  historyModule as unknown as {
    buildHistoryEntriesFromGenerationLogs: (
      logs: typeof cloudLogs,
      now?: Date
    ) => HistoryEntry[];
  }
).buildHistoryEntriesFromGenerationLogs(cloudLogs, new Date("2026-05-10T12:00:00.000Z"));

equal(mapped.length, 11);
deepEqual(mapped[0], {
  id: "log-0",
  kind: "avatar",
  title: "头像",
  shopName: "云端店铺 0",
  remoteUrl: "https://example.com/cloud-0.png",
  generationLine: "line1",
  createdAt: "2026-05-10T12:00:00.000Z",
});
equal(mapped.at(-1)?.id, "log-10");
deepEqual(mapped.some((item) => item.id === "expired-log"), false);
