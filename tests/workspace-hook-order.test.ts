import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url), "utf8");

const productBatchIndex = source.indexOf("const productBatchWorkspace = useProductBatchWorkspace");
const pictureWallIndex = source.indexOf("const pictureWallWorkspace = usePictureWallWorkspace");
const pSignboardIndex = source.indexOf("const pSignboardWorkspace = usePSignboardWorkspace");
const historyRefreshIndex = source.indexOf('if (tab !== "history" || !isSupabaseConfigured) return;');

ok(productBatchIndex > 0);
ok(pictureWallIndex > productBatchIndex);
ok(pSignboardIndex > pictureWallIndex);
ok(historyRefreshIndex > pSignboardIndex);
equal(source.includes("fetchGenerationLogsPage(userId"), true);
