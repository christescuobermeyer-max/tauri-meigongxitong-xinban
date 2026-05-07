import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const sessionSource = readFileSync(
  new URL("../src/lib/workspace-session.ts", import.meta.url),
  "utf8"
);
const generationFlowSource = readFileSync(
  new URL("../src/lib/generation-flow.ts", import.meta.url),
  "utf8"
);
const ossSource = readFileSync(new URL("../src/lib/oss-assets.ts", import.meta.url), "utf8");

ok(sessionSource.includes("generationLine"));
ok(
  generationFlowSource.includes("buildStorefrontPrompt(shopName, avatarCategory)"),
  "店招 prompt 应接收经营品类输入框的值"
);
ok(
  generationFlowSource.includes("buildPosterPrompt(shopName, avatarCategory)"),
  "海报 prompt 应接收经营品类输入框的值"
);
ok(
  generationFlowSource.includes('if (kind === "storefront") return selectProductUploadReferenceImages(sourceImages);'),
  "店招应默认参考上传产品图，不再参考头像图"
);
ok(
  generationFlowSource.includes('if (kind === "poster") return selectProductUploadReferenceImages(sourceImages);'),
  "海报应默认参考上传产品图，不再参考头像图"
);
equal(
  sessionSource.includes("referenceImages: [avatarResult.remoteUrl]"),
  false,
  "连续生成流程不应再把头像 OSS URL 作为店招或海报参考图"
);
equal(
  sessionSource.includes("referenceImages: storefrontResult.remoteUrl ? [storefrontResult.remoteUrl] : undefined"),
  false,
  "海报不应把店招 OSS URL 作为参考图"
);
equal(ossSource.includes('if (kind === "avatar")'), true);
equal(ossSource.includes("compressGeneratedImage"), true);
