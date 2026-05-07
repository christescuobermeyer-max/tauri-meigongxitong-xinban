import { ok, equal } from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/lib/prompts.ts", import.meta.url), "utf8");

equal(source.includes("请参考已生成的头像宣传图"), false);
equal(source.includes("请参考已生成的头像图"), false);
ok(source.includes("上传的产品图"));
ok(source.includes("宽高比必须严格为21:9"));
ok(source.includes("不要生成16:9"));
ok(source.includes("不要生成1:1"));
ok(source.includes("不要生成3:4"));
equal(source.includes("请参考已生成的店招宣传图"), false);
