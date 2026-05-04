import { deepEqual } from "node:assert/strict";
import { getAvatarStorefrontPosterSequence } from "../src/lib/generation-sequence.js";

deepEqual(getAvatarStorefrontPosterSequence(), ["avatar", "storefront", "poster"]);
