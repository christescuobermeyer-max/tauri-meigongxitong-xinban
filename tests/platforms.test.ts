import { deepEqual, equal } from "node:assert/strict";
import { getPlatform } from "../src/lib/platforms.js";

const meituan = getPlatform("meituan");
deepEqual(meituan.product.source, { w: 1536, h: 1024 });
deepEqual(meituan.product.export, { w: 600, h: 450 });
equal(meituan.product.maxBytes, 500 * 1024);
deepEqual(meituan.poster.export, { w: 720, h: 240 });

const taobao = getPlatform("taobao");
deepEqual(taobao.product.source, { w: 1024, h: 1024 });
deepEqual(taobao.product.export, { w: 600, h: 600 });
equal(taobao.product.maxBytes, undefined);
deepEqual(taobao.poster.export, { w: 2048, h: 600 });
