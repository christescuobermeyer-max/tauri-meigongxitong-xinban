import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");
const uploadSource = readFileSync(new URL("../src/components/ImageUpload.tsx", import.meta.url), "utf8");

ok(uploadSource.includes('className="thumb"'), "上传图片预览应继续使用统一 thumb 容器");
ok(uploadSource.includes("<img src={img.dataUrl} alt={img.name} />"), "上传预览应展示压缩后的完整图片");
ok(
  styles.includes(".thumb img { width: 100%; height: 100%; object-fit: contain;"),
  "上传预览图必须完整显示，不能 object-fit: cover 裁剪"
);
ok(styles.includes("object-position: center;"), "上传预览图应居中完整显示");
equal(styles.includes(".thumb img { width: 100%; height: 100%; object-fit: cover;"), false);
