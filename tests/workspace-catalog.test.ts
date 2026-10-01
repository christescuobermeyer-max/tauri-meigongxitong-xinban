import { deepEqual, equal } from "node:assert/strict";
import {
  getWorkspaceTitle,
  listWorkspaceNavigation,
  WORKSPACE_CATALOG,
} from "../src/lib/workspace-catalog.js";

const keys = Object.keys(WORKSPACE_CATALOG);
equal(new Set(keys).size, keys.length);
equal(getWorkspaceTitle("imageResize"), "尺寸调整");

deepEqual(listWorkspaceNavigation(false).map((item) => item.key), [
  "avatarStorefront",
  "productImage",
  "productBatch",
  "packageImage",
  "pictureWall",
  "videoSignboard",
  "imageEdit",
  "detailPage",
  "brandStory",
  "menuDesign",
  "dataAnalysis",
  "imageResize",
  "history",
  "gatewayMonitor",
  "imagePlaza",
]);

const adminNavigation = listWorkspaceNavigation(true);
equal(adminNavigation.length, 16);
equal(adminNavigation.at(-1)?.key, "admin");
equal(adminNavigation.some((item) => item.key === "pSignboard"), false);
