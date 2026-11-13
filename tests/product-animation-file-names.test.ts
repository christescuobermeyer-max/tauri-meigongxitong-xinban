import { deepEqual, equal } from "node:assert/strict";
import { animationFileName, uniqueFileNames } from "../src/lib/product-animation/file-names";

const base = { createdAt: "2026-11-13T02:30:05Z", media: { format: "gif" } };

// Image effects: the uploaded image name.
equal(animationFileName({ ...base, style: "burst", title: "招牌牛肉面" }), "招牌牛肉面.gif");
equal(animationFileName({ ...base, style: "burst", title: "麻辣/香锅: 大份?" , media: { format: "webp" } }), "麻辣_香锅_ 大份_.webp");
equal(animationFileName({ ...base, style: "burst", title: "红烧肉. " }), "红烧肉.gif");

// Video clips: zero-padded running number, regardless of the video's title.
equal(animationFileName({ ...base, style: "video", title: "抖音 · 招牌牛肉面", sequence: 7 }), "视频动图_007.gif");
equal(animationFileName({ ...base, style: "video", sequence: 1234 }), "视频动图_1234.gif");

// Records saved before names/numbers existed still get distinct names (style + local time).
const legacy = animationFileName({ ...base, style: "burst" });
equal(/^菜品_爆香来袭_\d{8}-\d{6}\.gif$/.test(legacy), true);
equal(/^视频动图_\d{8}-\d{6}\.gif$/.test(animationFileName({ ...base, style: "video" })), true);

// One batch never repeats a name, case-insensitively as on Windows.
deepEqual(uniqueFileNames(["招牌牛肉面.gif", "鸡腿.gif", "招牌牛肉面.gif", "招牌牛肉面.GIF"]),
  ["招牌牛肉面.gif", "鸡腿.gif", "招牌牛肉面 (2).gif", "招牌牛肉面 (3).GIF"]);
