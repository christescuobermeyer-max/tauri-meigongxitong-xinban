import { ok, equal } from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/lib/prompts.ts", import.meta.url), "utf8");

ok(source.includes("请参考已生成的头像宣传图"));
equal(source.includes("请参考已生成的店招宣传图"), false);
