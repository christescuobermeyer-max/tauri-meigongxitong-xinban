import { equal } from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/components/GenerationResultTile.tsx", import.meta.url),
  "utf8"
);

equal(source.includes("result__oss-url"), false);
equal(source.includes("navigator.clipboard.writeText(item.remoteUrl)"), false);
equal(source.includes("OSS 链接"), false);
