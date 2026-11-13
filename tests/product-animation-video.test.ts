import { deepEqual, equal } from "node:assert/strict";
import { animationStyleTitle, chooseVideoAnimationSize, validateAnimation } from "../src/lib/product-animation/policy";
import { availableClipLengths, clampClipStart, formatClipTime, initialCrop, moveCrop, resizeCrop, shareTitle } from "../src/lib/product-animation/video";

// Output sizes are the smallest platform-valid canvases.
for (const ratio of ["4:3", "16:9"] as const) {
  const size = chooseVideoAnimationSize(ratio);
  deepEqual(validateAnimation({ ...size, durationMs: 3000, bytes: 1, frames: 2, format: "gif" }), []);
}
equal(animationStyleTitle("video"), "视频动图");
equal(animationStyleTitle("burst"), "爆香来袭");
equal(animationStyleTitle("retired"), "动图");

// Clip position never runs past either end.
equal(clampClipStart(-500, 3000, 10_000), 0);
equal(clampClipStart(8_400, 3000, 10_000), 7000);
equal(clampClipStart(1234.4, 3000, 10_000), 1234);
deepEqual(availableClipLengths(3500), [2000, 3000]);
deepEqual(availableClipLengths(60_000), [2000, 3000, 4000, 5000]);
equal(formatClipTime(65_400), "1:05.4");

// Initial crop: largest centred rectangle with the exact ratio, for landscape and portrait sources.
deepEqual(initialCrop(1920, 1080, "4:3"), { x: 240, y: 0, width: 1440, height: 1080 });
deepEqual(initialCrop(1920, 1080, "16:9"), { x: 0, y: 0, width: 1920, height: 1080 });
deepEqual(initialCrop(1080, 1920, "4:3"), { x: 0, y: 555, width: 1080, height: 810 });

// Moving clamps to the frame; resizing keeps ratio, minimum and bounds.
const crop = initialCrop(1920, 1080, "4:3");
deepEqual(moveCrop(crop, 9999, 50, 1920, 1080), { ...crop, x: 480, y: 0 });
deepEqual(moveCrop(crop, -9999, 0, 1920, 1080), { ...crop, x: 0 });
const small = resizeCrop({ x: 100, y: 100, width: 1440, height: 1080 }, 10, 1920, 1080, "4:3");
deepEqual(small, { x: 100, y: 100, width: 360, height: 270 });
const capped = resizeCrop({ x: 600, y: 300, width: 400, height: 300 }, 5000, 1920, 1080, "4:3");
equal(capped.y + capped.height <= 1080 && capped.x + capped.width <= 1920, true);
equal(capped.width, 1040);

// Share-text names: title before the link, without platform boilerplate.
equal(shareTitle("红烧肉做法 http://xhslink.com/a/Zx9 复制本条信息，打开【小红书】App查看精彩内容！"), "红烧肉做法");
equal(shareTitle("7.99 复制打开抖音，看看【张记的作品】招牌牛肉面  汤底熬足8小时 https://v.douyin.com/iABC/ "), "招牌牛肉面 汤底熬足8小时");
equal(shareTitle("https://v.douyin.com/iABC/"), "分享视频");
