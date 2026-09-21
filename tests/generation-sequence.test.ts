import { deepEqual } from "node:assert/strict";
import {
  getAvatarStorefrontPosterSequence,
  getSelectedAvatarStorefrontPosterSequence,
} from "../src/lib/generation-sequence.js";

deepEqual(getAvatarStorefrontPosterSequence(), ["avatar", "storefront", "poster"]);
deepEqual(
  getSelectedAvatarStorefrontPosterSequence({ avatar: false, storefront: true, poster: true }),
  ["storefront", "poster"]
);
