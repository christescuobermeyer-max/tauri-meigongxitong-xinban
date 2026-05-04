import { equal } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/p-signboard-form.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const module = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
);

const { canGeneratePSignboard, getPSignboardShopName } = module as {
  canGeneratePSignboard: (input: {
    imageCount: number;
    originalText: string;
    newText: string;
    busy: boolean;
  }) => boolean;
  getPSignboardShopName: (shopName: string) => string;
};

equal(
  canGeneratePSignboard({
    imageCount: 1,
    originalText: "老招牌",
    newText: "新招牌",
    busy: false,
  }),
  true
);
equal(canGeneratePSignboard({ imageCount: 0, originalText: "老招牌", newText: "新招牌", busy: false }), false);
equal(canGeneratePSignboard({ imageCount: 1, originalText: "", newText: "新招牌", busy: false }), false);
equal(canGeneratePSignboard({ imageCount: 1, originalText: "老招牌", newText: "新招牌", busy: true }), false);
equal(getPSignboardShopName(""), "P门头");
equal(getPSignboardShopName("  测试店铺  "), "测试店铺");
