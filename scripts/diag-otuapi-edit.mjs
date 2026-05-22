// 验证 otuapi 是否真的支持在 generations 端点直接传 image 字段做参考图。
// 用一张极小的 1x1 红色 PNG 做 base64 参考图。

const API_KEY = "sk-FzqsnuwALwXbdpT4TXZPKBo67zkqIXiMpAW5z1MbzWKF2Qm5";
const URL = "https://otuapi.com/v1/images/generations";

// 1x1 红色 PNG base64
const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

const t0 = performance.now();
const res = await fetch(URL, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
  body: JSON.stringify({
    model: "image2",
    prompt: "Make this color softer and more orange",
    size: "1024x1024",
    image: [TINY_PNG],
  }),
});
const elapsed = performance.now() - t0;
console.log(`status=${res.status} elapsed=${(elapsed/1000).toFixed(2)}s`);
const body = await res.text();
const preview = body.slice(0, 300);
console.log(`preview: ${preview}`);

try {
  const json = JSON.parse(body);
  const data = json?.data?.[0];
  console.log(`has b64_json: ${Boolean(data?.b64_json)}, has url: ${Boolean(data?.url)}, b64_len: ${data?.b64_json?.length ?? 0}`);
} catch (e) {
  console.log("non-JSON response");
}
