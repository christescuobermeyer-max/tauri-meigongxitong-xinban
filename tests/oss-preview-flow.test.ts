import { equal } from "node:assert/strict";
import { readFileSync } from "node:fs";

const resultTileSource = readFileSync(
  new URL("../src/components/GenerationResultTile.tsx", import.meta.url),
  "utf8"
);
const pictureWallResultsSource = readFileSync(
  new URL("../src/components/PictureWallResults.tsx", import.meta.url),
  "utf8"
);
const pSignboardSource = readFileSync(
  new URL("../src/components/PSignboardPage.tsx", import.meta.url),
  "utf8"
);
const workspaceHookSource = readFileSync(
  new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url),
  "utf8"
);

equal(resultTileSource.includes("getGenerationPreviewUrl(item)"), true);
equal(resultTileSource.includes("item.rawDataUrl ?"), false);
equal(pictureWallResultsSource.includes("getGenerationPreviewUrl(entry.item)"), true);
equal(pictureWallResultsSource.includes("entry.item.rawDataUrl ?"), false);
equal(pSignboardSource.includes("getGenerationPreviewUrl(item)"), true);
equal(pSignboardSource.includes("item.rawDataUrl ?"), false);
equal(workspaceHookSource.includes("const previewUrl = remoteUrl;"), true);
