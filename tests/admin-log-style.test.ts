import { equal, match } from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");

match(
  css,
  /\.admin__log-thumb\s+\.admin__log-thumb-image--contain\s*\{[\s\S]*?object-fit:\s*contain;[\s\S]*?\}/
);
equal(css.includes(".admin__log-thumb--contain"), true);
equal(css.includes(".admin__log-thumb-image--contain"), true);
