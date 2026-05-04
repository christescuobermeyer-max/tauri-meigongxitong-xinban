import { deepEqual } from "node:assert/strict";
import {
  selectAvatarReferenceImages,
  selectPosterReferenceImages,
  selectProductUploadReferenceImages,
  selectStorefrontReferenceImages,
} from "../src/lib/reference-images.js";

deepEqual(selectAvatarReferenceImages([]), []);
deepEqual(selectAvatarReferenceImages(["a"]), ["a"]);
deepEqual(selectAvatarReferenceImages(["a", "b", "c"]), ["a"]);

deepEqual(selectProductUploadReferenceImages([]), []);
deepEqual(
  selectProductUploadReferenceImages([
    { productBase64: "p1" },
    { productBase64: "p2" },
  ]),
  ["p1"]
);
deepEqual(selectProductUploadReferenceImages([{ base64: "legacy" }]), ["legacy"]);
deepEqual(
  selectProductUploadReferenceImages([
    { productOssUrl: "https://example.com/reference.jpg", productBase64: "p1" },
  ]),
  ["https://example.com/reference.jpg"]
);

deepEqual(
  selectStorefrontReferenceImages({
    remoteUrl: "https://example.com/avatar.png",
    rawBase64: "avatar-base64",
  }),
  ["https://example.com/avatar.png"]
);
deepEqual(
  selectStorefrontReferenceImages({
    rawBase64: "avatar-base64",
  }),
  ["avatar-base64"]
);
deepEqual(
  selectStorefrontReferenceImages({
    rawBase64: null,
  }),
  null
);

deepEqual(
  selectPosterReferenceImages({
    remoteUrl: "https://example.com/storefront.png",
    rawBase64: "storefront-base64",
  }),
  ["https://example.com/storefront.png"]
);
deepEqual(
  selectPosterReferenceImages({
    rawBase64: null,
  }),
  null
);
