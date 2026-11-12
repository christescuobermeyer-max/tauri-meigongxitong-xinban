import { deepEqual, equal, throws } from "node:assert/strict";
import { ANIMATION_STYLES, MAX_ANIMATION_BYTES, chooseAnimationSize, containImage, validateAnimation } from "../src/lib/product-animation/policy";

equal(ANIMATION_STYLES.length, 6);
equal(ANIMATION_STYLES[0].id, "steam");
equal(ANIMATION_STYLES[0].title, "热气腾腾");
equal(ANIMATION_STYLES[0].word, "");
equal(ANIMATION_STYLES[0].subtitle, "");
equal(ANIMATION_STYLES[0].description, "自然热气与菜品细微动态，无贴纸");
equal(MAX_ANIMATION_BYTES, 5_000_000);
deepEqual(chooseAnimationSize(1024, 768, "4:3"), { width: 1024, height: 768, adjusted: false });
deepEqual(chooseAnimationSize(1024, 771, "4:3"), { width: 1024, height: 768, adjusted: true });
deepEqual(chooseAnimationSize(1920, 1080, "16:9"), { width: 1920, height: 1080, adjusted: false });
deepEqual(chooseAnimationSize(600, 450, "4:3"), { width: 1024, height: 768, adjusted: true });
deepEqual(chooseAnimationSize(800, 800, "16:9"), { width: 1024, height: 576, adjusted: true });
throws(() => chooseAnimationSize(0, 768, "4:3"));
const fit = containImage(1024, 771, 1024, 768);
equal(fit.height, 768);
equal(fit.width < 1024 && fit.x > 0 && fit.y === 0, true);
const valid = { width: 1024, height: 768, durationMs: 3000, bytes: 4_999_999, frames: 60, format: "gif" };
deepEqual(validateAnimation(valid), []);
for (const patch of [{ width: 1024, height: 771 }, { width: 748, height: 561 }, { durationMs: 5001 }, { durationMs: 1999 }, { bytes: 5_000_001 }, { frames: 1 }, { format: "png" }, { width: NaN }]) {
  equal(validateAnimation({ ...valid, ...patch }).length > 0, true, JSON.stringify(patch));
}
deepEqual(validateAnimation({ ...valid, width: 768, height: 432, bytes: 5_000_000, durationMs: 5000, format: "webp" }), []);
console.log("动图比例、尺寸、时长、格式、体积和六种风格规则通过");
