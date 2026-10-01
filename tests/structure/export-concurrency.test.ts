import { deepEqual, equal, ok } from "node:assert/strict";
import { existsSync } from "node:fs";

const url = new URL("../../scripts/export/shared/concurrency.mjs", import.meta.url);
ok(existsSync(url), "重复导出并发逻辑应统一并独立验证");
const { runWithConcurrency } = await import(url.href);
let active = 0;
let peak = 0;
const visited: number[] = [];
const errors = await runWithConcurrency([0, 1, 2, 3], 2, async (item: number) => {
  active++;
  peak = Math.max(peak, active);
  await new Promise((resolve) => setTimeout(resolve, 1));
  active--;
  visited.push(item);
  if (item === 1) throw new Error("假数据失败");
});
equal(peak, 2);
deepEqual(visited.sort(), [0, 1, 2, 3]);
deepEqual(errors, [{ index: 1, error: "假数据失败" }]);
