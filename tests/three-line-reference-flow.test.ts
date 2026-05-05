import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const sessionSource = readFileSync(
  new URL("../src/lib/workspace-session.ts", import.meta.url),
  "utf8"
);
const ossSource = readFileSync(new URL("../src/lib/oss-assets.ts", import.meta.url), "utf8");

ok(sessionSource.includes("generationLine"));
ok(
  sessionSource.includes("referenceImages: avatarResult.remoteUrl ? [avatarResult.remoteUrl] : [avatarResult.rawBase64]"),
  "三条线路都应优先把压缩后的头像 OSS URL 作为店招参考图"
);
ok(
  sessionSource.includes("referenceImages: avatarResult.remoteUrl ? [avatarResult.remoteUrl] : [avatarResult.rawBase64]"),
  "三条线路都应优先把压缩后的头像 OSS URL 作为海报参考图"
);
equal(
  sessionSource.includes("referenceImages: storefrontResult.remoteUrl ? [storefrontResult.remoteUrl] : undefined"),
  false,
  "海报不应再把店招 OSS URL 作为参考图"
);
equal(ossSource.includes('if (kind === "avatar")'), true);
equal(ossSource.includes("compressGeneratedImage"), true);
