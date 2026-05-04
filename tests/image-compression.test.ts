import { deepEqual } from "node:assert/strict";
import { calculateScaledSize } from "../src/lib/image-compression.js";

deepEqual(calculateScaledSize(4000, 2000, 512), { width: 512, height: 256 });
deepEqual(calculateScaledSize(900, 1200, 512), { width: 384, height: 512 });
deepEqual(calculateScaledSize(320, 240, 512), { width: 320, height: 240 });
