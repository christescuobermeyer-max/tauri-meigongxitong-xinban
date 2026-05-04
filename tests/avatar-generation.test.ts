import { deepEqual, equal } from "node:assert/strict";
import {
  buildActiveAvatarPrompt,
  getAvatarGenerationErrorMessage,
  resolveAvatarReferenceImages,
} from "../src/lib/avatar-generation.js";

equal(
  getAvatarGenerationErrorMessage({
    shopName: "",
    mode: "category",
    category: "",
    images: [],
  }),
  "请填写店铺名称"
);

equal(
  getAvatarGenerationErrorMessage({
    shopName: "鲜椒鸡排",
    mode: "category",
    category: "",
    images: [],
  }),
  "请填写店铺经营品类"
);

equal(
  getAvatarGenerationErrorMessage({
    shopName: "鲜椒鸡排",
    mode: "category",
    category: "",
    images: [],
  }),
  "请填写店铺经营品类"
);

equal(
  getAvatarGenerationErrorMessage({
    shopName: "鲜椒鸡排",
    mode: "category",
    category: "炸货",
    images: [],
  }),
  "请上传至少 1 张产品图"
);

equal(
  getAvatarGenerationErrorMessage({
    shopName: "鲜椒鸡排",
    mode: "category",
    category: "炸货",
    images: [{ id: "1" } as never],
  }),
  null
);

deepEqual(resolveAvatarReferenceImages("category", []), []);
deepEqual(
  resolveAvatarReferenceImages("image", [
    { productOssUrl: "https://example.com/product.jpg", base64: "abc" },
  ]),
  ["https://example.com/product.jpg"]
);

const categoryPrompt = buildActiveAvatarPrompt({
  shopName: "鲜椒鸡排",
  mode: "category",
  category: "炸货",
});
equal(categoryPrompt.includes("店铺经营品类：炸货"), true);
equal(categoryPrompt.includes("上传的产品图中的食物"), true);

const imagePrompt = buildActiveAvatarPrompt({
  shopName: "鲜椒鸡排",
  mode: "image",
  category: "炸货",
});
equal(imagePrompt.includes("上传的产品图"), true);
equal(imagePrompt.includes("店铺经营品类：炸货"), true);
