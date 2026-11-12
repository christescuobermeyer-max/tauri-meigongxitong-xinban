// 大幅动效：热气 + 贴纸 + 大幅动作组合在同一画面；progress∈[0,1) 无缝循环。
// 尺寸按画布宽度等比（U = W/1024），位置相对原图区域，适配任意菜品图。
import { ANIMATION_FONTS as F } from "./fonts";

export type BoldStyle = "burst" | "swing" | "blaze" | "beat" | "stamp" | "flip";
export const BOLD_STYLES = new Set<string>(["burst", "swing", "blaze", "beat", "stamp", "flip"]);

type Ctx = CanvasRenderingContext2D;
type Layer = { canvas: HTMLCanvasElement; w: number; h: number };

const TAU = Math.PI * 2;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const elastic = (x: number) => x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (TAU / 3)) + 1;
const backOut = (x: number) => { const c = 2.2; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const easeIn = (x: number) => x * x * x;
const smooth = (a: number, b: number, v: number) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };
function random(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const canvasOf = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

function puffSprite(size: number) {
  const c = canvasOf(size, size); const g = c.getContext("2d")!; const rnd = random(7);
  for (let i = 0; i < 7; i++) {
    const x = size * (0.35 + rnd() * 0.3), y = size * (0.35 + rnd() * 0.3), r = size * (0.22 + rnd() * 0.2);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(255,255,255,0.55)"); grad.addColorStop(0.5, "rgba(255,255,255,0.22)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
  }
  return c;
}
function glowDot(size: number, inner: string, outer: string) {
  const c = canvasOf(size, size); const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner); grad.addColorStop(0.25, outer); grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad; g.fillRect(0, 0, size, size); return c;
}
function heartPath(g: Ctx, x: number, y: number, r: number) {
  g.beginPath(); g.moveTo(x, y + r * 0.95);
  g.bezierCurveTo(x - r * 1.35, y + r * 0.05, x - r * 0.95, y - r * 1.05, x, y - r * 0.38);
  g.bezierCurveTo(x + r * 0.95, y - r * 1.05, x + r * 1.35, y + r * 0.05, x, y + r * 0.95); g.closePath();
}
function starPath(g: Ctx, x: number, y: number, r: number, inner = 0.45, points = 5, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) { const a = rot + i * Math.PI / points; const rr = i % 2 ? r * inner : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath();
}

// 贴纸字：白色描边 + 深色细边 + 渐变填充 + 投影，像模切贴纸
function stickerText(text: string, font: string, size: number, colors: string[], U: number, { white = 16, dark = 6, darkColor = "#5a1608" } = {}): Layer {
  const probe = canvasOf(1, 1).getContext("2d")!; probe.font = `${size}px "${font}"`;
  const pad = white + 24 * U;
  const c = canvasOf(probe.measureText(text).width + pad * 2, size * 1.15 + pad * 2); const g = c.getContext("2d")!;
  g.font = `${size}px "${font}"`; g.textBaseline = "top"; g.lineJoin = "round";
  g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = 14 * U; g.shadowOffsetY = 6 * U;
  g.lineWidth = white * 2 * U; g.strokeStyle = "#fffaf0"; g.strokeText(text, pad, pad);
  g.shadowColor = "transparent"; g.lineWidth = dark * 2 * U; g.strokeStyle = darkColor; g.strokeText(text, pad, pad);
  const grad = g.createLinearGradient(0, pad, 0, pad + size);
  colors.forEach((color, i) => grad.addColorStop(i / (colors.length - 1), color));
  g.fillStyle = grad; g.fillText(text, pad, pad);
  g.save(); g.globalCompositeOperation = "source-atop"; g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(0, 0, c.width, pad + size * 0.42); g.restore();
  return { canvas: c, w: c.width, h: c.height };
}

export function createBoldRenderer(image: HTMLImageElement, W: number, H: number, style: BoldStyle) {
  const U = W / 1024;
  const bg = canvasOf(W, H); const b = bg.getContext("2d")!;
  b.fillStyle = "#211713"; b.fillRect(0, 0, W, H);
  const s = Math.min(W / image.naturalWidth, H / image.naturalHeight);
  const iw = image.naturalWidth * s, ih = image.naturalHeight * s, ix = (W - iw) / 2, iy = (H - ih) / 2;
  b.drawImage(image, ix, iy, iw, ih);
  if (style === "blaze") {
    b.globalCompositeOperation = "screen";
    const glow = b.createRadialGradient(W / 2, iy + ih * 1.05, 0, W / 2, iy + ih * 1.05, ih * 0.75);
    glow.addColorStop(0, "rgba(255,120,30,0.3)"); glow.addColorStop(1, "rgba(255,80,20,0)");
    b.fillStyle = glow; b.fillRect(0, 0, W, H); b.globalCompositeOperation = "source-over";
  }

  const rnd = random(77);
  const puff = puffSprite(128);
  const puffs = Array.from({ length: 30 }, () => ({
    x: ix + iw * (0.28 + rnd() * 0.44), y: iy + ih * (0.5 + rnd() * 0.14), seed: rnd(), size: 70 + rnd() * 70,
    sway: 14 + rnd() * 22, rise: ih * (0.28 + rnd() * 0.16), wind: (rnd() - 0.5) * 50, phase: rnd() * TAU,
  }));
  const spark = glowDot(64, "rgba(255,255,235,1)", "rgba(255,190,60,0.7)");
  const ember = glowDot(64, "rgba(255,255,230,1)", "rgba(255,150,30,0.8)");
  const sparks = Array.from({ length: 16 }, (_, i) => ({ a: i / 16 * TAU + rnd() * 0.3, d: 120 + rnd() * 120, size: 8 + rnd() * 10 }));
  const embers = Array.from({ length: 60 }, () => ({ x: rnd() < 0.5 ? rnd() * 0.3 : 0.7 + rnd() * 0.3, seed: rnd(), speed: 1 + Math.floor(rnd() * 2), sway: rnd() * 30, size: 10 + rnd() * 16, flick: rnd() * TAU }));
  const floaters = Array.from({ length: 10 }, (_, i) => ({ side: i % 2, seed: i / 10 + rnd() * 0.04, x: 0.04 + rnd() * 0.12, size: 18 + rnd() * 16, sway: 12 + rnd() * 18 }));
  const glints = Array.from({ length: 9 }, (_, i) => ({ x: ix + iw * (0.24 + rnd() * 0.52), y: iy + ih * (0.42 + rnd() * 0.4), at: i / 9, size: 24 + rnd() * 20 }));

  let main: Layer | null = null, tag: Layer | null = null, board: Layer | null = null, heart: Layer | null = null, seal: Layer | null = null, cards: Layer[] = [];
  if (style === "burst") {
    main = stickerText("真香", F.brush, 190 * U, ["#fff7d6", "#ffd25a", "#ff9a1f"], U);
    tag = stickerText("爆香来袭", F.display, 40 * U, ["#ffffff", "#ffe2e2"], U, { white: 8, dark: 3, darkColor: "#a3120a" });
  } else if (style === "swing") {
    const bw = 330 * U, bh = 170 * U; const c = canvasOf(bw + 60 * U, bh + 60 * U); const g = c.getContext("2d")!; const ox = 30 * U, oy = 24 * U;
    g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = 18 * U; g.shadowOffsetY = 8 * U;
    g.fillStyle = "#fffaf0"; g.beginPath(); g.roundRect(ox - 10 * U, oy - 10 * U, bw + 20 * U, bh + 20 * U, 26 * U); g.fill(); g.shadowColor = "transparent";
    let grad = g.createLinearGradient(0, oy, 0, oy + bh); grad.addColorStop(0, "#e2382a"); grad.addColorStop(1, "#8f1209");
    g.fillStyle = grad; g.beginPath(); g.roundRect(ox, oy, bw, bh, 18 * U); g.fill();
    g.strokeStyle = "#f7cf6b"; g.lineWidth = 5 * U; g.beginPath(); g.roundRect(ox + 10 * U, oy + 10 * U, bw - 20 * U, bh - 20 * U, 12 * U); g.stroke();
    g.font = `${108 * U}px "${F.display}"`; g.textAlign = "center"; g.textBaseline = "middle";
    grad = g.createLinearGradient(0, oy + 20 * U, 0, oy + 130 * U); grad.addColorStop(0, "#fff4c4"); grad.addColorStop(1, "#f2b33d"); g.fillStyle = grad; g.fillText("美味", ox + bw / 2, oy + bh * 0.44);
    g.font = `${28 * U}px "${F.display}"`; g.fillStyle = "#ffe7a6"; g.fillText("· 鲜 香 浓 郁 ·", ox + bw / 2, oy + bh * 0.82);
    board = { canvas: c, w: c.width, h: c.height };
  } else if (style === "blaze") {
    main = stickerText("好吃到爆", F.display, 130 * U, ["#fff4b8", "#ffb52e", "#ff4d1a"], U, { darkColor: "#4a0f05" });
  } else if (style === "beat") {
    const r = 120 * U; const c = canvasOf(r * 3.2, r * 3); const g = c.getContext("2d")!; const cx = c.width / 2, cy = c.height / 2 + 6 * U;
    g.shadowColor = "rgba(0,0,0,0.4)"; g.shadowBlur = 18 * U; g.shadowOffsetY = 8 * U;
    g.fillStyle = "#fffaf0"; heartPath(g, cx, cy, r * 1.14); g.fill(); g.shadowColor = "transparent";
    const grad = g.createLinearGradient(0, cy - r, 0, cy + r); grad.addColorStop(0, "#ff86ad"); grad.addColorStop(1, "#e3134f");
    g.fillStyle = grad; heartPath(g, cx, cy, r); g.fill();
    g.fillStyle = "rgba(255,255,255,0.45)"; g.beginPath(); g.ellipse(cx - r * 0.45, cy - r * 0.4, r * 0.22, r * 0.12, -0.6, 0, TAU); g.fill();
    g.font = `${92 * U}px "${F.cute}"`; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
    g.lineWidth = 8 * U; g.strokeStyle = "#a3083a"; g.strokeText("爱了", cx, cy - r * 0.05); g.fillStyle = "#ffffff"; g.fillText("爱了", cx, cy - r * 0.05);
    heart = { canvas: c, w: c.width, h: c.height };
  } else if (style === "stamp") {
    const R = 120 * U; const size = Math.ceil(R * 2 + 50 * U); const c = canvasOf(size, size); const g = c.getContext("2d")!; const m = size / 2;
    g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = 16 * U; g.shadowOffsetY = 6 * U;
    g.fillStyle = "#fffaf0"; g.beginPath(); g.arc(m, m, R + 12 * U, 0, TAU); g.fill(); g.shadowColor = "transparent";
    const grad = g.createRadialGradient(m - R * 0.3, m - R * 0.3, R * 0.1, m, m, R); grad.addColorStop(0, "#ef3b2a"); grad.addColorStop(1, "#a0150d");
    g.fillStyle = grad; g.beginPath(); g.arc(m, m, R, 0, TAU); g.fill();
    g.strokeStyle = "#ffe6c8"; g.lineWidth = 4 * U; g.setLineDash([10 * U, 7 * U]); g.beginPath(); g.arc(m, m, R - 14 * U, 0, TAU); g.stroke(); g.setLineDash([]);
    g.font = `${110 * U}px "${F.brush}"`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#fff3e0"; g.fillText("必点", m, m + 4 * U);
    seal = { canvas: c, w: size, h: size };
    tag = stickerText("招牌推荐", F.display, 40 * U, ["#fff8d0", "#ffcf48"], U, { white: 8, dark: 3, darkColor: "#7a2a05" });
  } else {
    cards = ([["真香", ["#fff7d6", "#ffd25a", "#ff9a1f"], "#7a2a05"], ["好吃", ["#ffe0d0", "#ff7a3d", "#e8320f"], "#5a1005"], ["必点", ["#fff4c4", "#ffcf48", "#e79a10"], "#6a2a05"]] as const)
      .map(([text, colors, dark]) => stickerText(text, F.cute, 150 * U, [...colors], U, { darkColor: dark }));
  }

  function steam(g: Ctx, t: number) {
    for (const p of puffs) {
      const k = (t + p.seed) % 1; const size = p.size * U * (0.55 + 1.5 * k);
      g.globalAlpha = Math.sin(Math.PI * k) ** 1.3 * 0.55;
      g.drawImage(puff, p.x + Math.sin(k * TAU * 0.9 + p.phase) * p.sway * U + p.wind * k * U - size / 2, p.y - p.rise * k - size / 2, size, size);
    }
    g.globalAlpha = 1;
  }
  function sparkleStar(g: Ctx, x: number, y: number, r: number, a: number) {
    g.save(); g.globalAlpha = a; g.globalCompositeOperation = "screen"; g.drawImage(spark, x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
    g.fillStyle = "rgba(255,252,235,0.95)"; starPath(g, x, y, r, 0.22, 4, 0); g.fill(); g.restore();
  }
  function ring(g: Ctx, x: number, y: number, k: number, maxR: number, color: string, width: number) {
    if (k <= 0 || k >= 1) return;
    g.save(); g.globalAlpha = (1 - k) * 0.9; g.strokeStyle = color; g.lineWidth = width * (1 - k) * U + 1; g.beginPath(); g.arc(x, y, maxR * U * (0.3 + 0.7 * k), 0, TAU); g.stroke(); g.restore();
  }
  function burstSparks(g: Ctx, x: number, y: number, k: number, scale = 1) {
    if (k <= 0 || k >= 1) return;
    g.save(); g.globalCompositeOperation = "screen";
    for (const p of sparks) { const d = p.d * U * scale * (1 - (1 - k) ** 3); const sz = p.size * U * (1 - k) + 1; g.globalAlpha = 1 - k; g.drawImage(spark, x + Math.cos(p.a) * d - sz, y + Math.sin(p.a) * d - sz, sz * 2, sz * 2); }
    g.restore();
  }
  function drawLayer(g: Ctx, layer: Layer, x: number, y: number, scale = 1, rot = 0, sx = 1, sy = 1, alpha = 1) {
    if (scale <= 0.001 || alpha <= 0) return;
    g.save(); g.globalAlpha = alpha; g.translate(x, y); g.rotate(rot); g.scale(scale * sx, scale * sy); g.drawImage(layer.canvas, -layer.w / 2, -layer.h / 2); g.restore();
  }

  return (canvas: HTMLCanvasElement, progress: number) => {
    // Animation-frame timestamps can precede the recorded start, so keep progress within [0, 1).
    const t = ((progress % 1) + 1) % 1;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const g = canvas.getContext("2d")!; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    g.drawImage(bg, 0, 0);
    const phase = t * TAU;
    const left = ix + iw * 0.2, bottom = iy + ih * 0.8, right = ix + iw * 0.8;

    if (style === "blaze") {
      g.save(); g.globalCompositeOperation = "screen";
      for (const e of embers) {
        const k = (t * e.speed + e.seed) % 1; const x = ix + iw * e.x + Math.sin(k * TAU + e.flick) * e.sway * U; const y = iy + ih * (1.02 - k * 0.8);
        const sz = e.size * U * (1 - k * 0.5); g.globalAlpha = clamp(Math.sin(Math.PI * k) * (0.7 + 0.3 * Math.sin(phase * 6 + e.flick))); g.drawImage(ember, x - sz, y - sz * 1.8, sz * 2, sz * 3.6);
      }
      g.restore();
    }
    steam(g, t);

    if (style === "burst" && main && tag) {
      const pop = clamp(t / 0.22), out = smooth(0.9, 1, t);
      const scale = elastic(pop) * (1 - out);
      const rot = lerp(-0.45, -0.12, backOut(pop)) + Math.sin(phase * 3) * 0.06 * (pop >= 1 ? 1 : 0);
      const cx = left + 30 * U, cy = bottom - 10 * U;
      if (scale > 0.01) {
        g.save(); g.translate(cx, cy); g.rotate(phase * 0.5); g.globalCompositeOperation = "screen"; g.globalAlpha = 0.55 * scale;
        for (let i = 0; i < 14; i++) {
          g.rotate(TAU / 14); const grad = g.createLinearGradient(0, 0, 260 * U, 0); grad.addColorStop(0, "rgba(255,220,90,0.9)"); grad.addColorStop(1, "rgba(255,160,40,0)");
          g.fillStyle = grad; g.beginPath(); g.moveTo(0, 0); g.lineTo(260 * U * scale, -20 * U); g.lineTo(260 * U * scale, 20 * U); g.closePath(); g.fill();
        }
        g.restore();
      }
      burstSparks(g, cx, cy, clamp((t - 0.06) / 0.4), 1.4);
      drawLayer(g, main, cx, cy, scale, rot);
      drawLayer(g, tag, cx + 120 * U, cy - 110 * U, backOut(clamp((t - 0.16) / 0.14)) * (1 - out), 0.18 + Math.sin(phase * 2) * 0.08);
    }
    if (style === "swing" && board) {
      for (const star of glints) { const k = (t - star.at + 1) % 1; const a = k < 0.4 ? Math.sin(Math.PI * k / 0.4) : 0; if (a > 0) sparkleStar(g, star.x, star.y, star.size * U * (0.6 + 0.6 * a), a); }
      g.save(); g.translate(ix + iw * 0.2, iy + ih + 10 * U); g.rotate(Math.sin(phase * 2) * 0.32);
      const pole = g.createLinearGradient(-8 * U, 0, 8 * U, 0); pole.addColorStop(0, "#7a4a22"); pole.addColorStop(0.5, "#c58a4a"); pole.addColorStop(1, "#6a3c18");
      g.fillStyle = "#fffaf0"; g.fillRect(-11 * U, -300 * U, 22 * U, 300 * U); g.fillStyle = pole; g.fillRect(-7 * U, -300 * U, 14 * U, 300 * U);
      g.drawImage(board.canvas, -board.w / 2, -300 * U - board.h + 30 * U); g.restore();
    }
    if (style === "blaze" && main) {
      const fall = clamp(t / 0.14), land = clamp((t - 0.14) / 0.16), out = smooth(0.9, 1, t);
      const cx = left + 110 * U, cy = bottom;
      const y = fall < 1 ? lerp(iy - 200 * U, cy, easeIn(fall)) : cy;
      const squash = fall < 1 ? 1 : 1 - Math.sin(land * Math.PI * 2.5) * Math.exp(-land * 3) * 0.28;
      const shake = t > 0.14 && t < 0.4 ? Math.sin(t * 220) * 6 * U * (1 - (t - 0.14) / 0.26) : 0;
      ring(g, cx, cy + 40 * U, clamp((t - 0.14) / 0.3), 320, "rgba(255,210,120,1)", 18);
      burstSparks(g, cx, cy + 30 * U, clamp((t - 0.14) / 0.35), 1.2);
      drawLayer(g, main, cx + shake, y, 1 - out, -0.06 + shake * 0.002, 2 - squash, squash, 1 - out);
    }
    if (style === "beat" && heart) {
      for (const h of floaters) {
        const k = (t + h.seed) % 1; const x = h.side ? ix + iw * (1 - h.x) : ix + iw * h.x; const y = iy + ih * (1.0 - k * 0.85); const r = h.size * U * (0.7 + 0.5 * Math.sin(Math.PI * k));
        g.save(); g.globalAlpha = Math.sin(Math.PI * k) ** 0.8 * 0.9; g.translate(x + Math.sin(k * TAU * 1.3 + h.seed * 9) * h.sway * U, y); g.rotate(Math.sin(k * TAU) * 0.3);
        g.shadowColor = "rgba(255,80,130,0.7)"; g.shadowBlur = 10 * U; g.fillStyle = "#ff5a8c"; heartPath(g, 0, 0, r); g.fill(); g.restore();
      }
      const k = (t % 0.5) / 0.5; const beat = Math.max(Math.exp(-(((k - 0.06) / 0.05) ** 2)), 0.8 * Math.exp(-(((k - 0.24) / 0.05) ** 2)));
      const cx = left + 40 * U, cy = bottom - 30 * U;
      for (const start of [0.06, 0.24]) {
        const kk = clamp((k - start) / 0.4);
        if (kk > 0 && kk < 1) for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + start * 10; const d = (90 + 150 * kk) * U; g.save(); g.globalAlpha = 1 - kk; g.fillStyle = "#ff7aa5"; heartPath(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 14 * U * (1 - kk * 0.5)); g.fill(); g.restore(); }
      }
      drawLayer(g, heart, cx, cy, 1 + 0.3 * beat, Math.sin(phase * 2) * 0.08);
    }
    if (style === "stamp" && seal && tag) {
      const drop = clamp((t - 0.04) / 0.12), out = smooth(0.92, 1, t);
      const cx = right - 20 * U, cy = bottom - 10 * U;
      const scale = drop <= 0 ? 0 : lerp(2.6, 1, easeIn(drop)) * (1 - out);
      ring(g, cx, cy, clamp((t - 0.16) / 0.3), 280, "rgba(255,240,220,1)", 16);
      burstSparks(g, cx, cy, clamp((t - 0.16) / 0.35), 1.1);
      drawLayer(g, seal, cx, cy, scale, -0.18 + (drop >= 1 ? Math.sin((t - 0.16) * 60) * 0.06 * Math.exp(-(t - 0.16) * 12) : 0), 1, 1, drop <= 0 ? 0 : clamp(drop * 2) * (1 - out));
      drawLayer(g, tag, cx - 10 * U, cy - 150 * U, backOut(clamp((t - 0.24) / 0.14)) * (1 - out), -0.1 + Math.sin(phase * 2) * 0.06);
      const bounce = Math.abs(Math.sin(phase * 3)) * 36 * U;
      g.save(); g.translate(left - 10 * U + bounce * 0.7, bottom - 40 * U - bounce * 0.7); g.rotate(-0.75); g.lineJoin = "round";
      const arrow = () => { g.beginPath(); g.moveTo(-70 * U, -22 * U); g.lineTo(20 * U, -22 * U); g.lineTo(20 * U, -50 * U); g.lineTo(80 * U, 0); g.lineTo(20 * U, 50 * U); g.lineTo(20 * U, 22 * U); g.lineTo(-70 * U, 22 * U); g.closePath(); };
      g.shadowColor = "rgba(0,0,0,0.4)"; g.shadowBlur = 12 * U; g.shadowOffsetY = 5 * U; arrow(); g.lineWidth = 22 * U; g.strokeStyle = "#fffaf0"; g.stroke(); g.shadowColor = "transparent";
      arrow(); g.lineWidth = 6 * U; g.strokeStyle = "#7a2a05"; g.stroke(); const grad = g.createLinearGradient(0, -50 * U, 0, 50 * U); grad.addColorStop(0, "#fff4b0"); grad.addColorStop(1, "#ffb400"); g.fillStyle = grad; arrow(); g.fill(); g.restore();
    }
    if (style === "flip" && cards.length) {
      const seg = t * 3; const index = Math.min(2, Math.floor(seg)); const k = seg - index;
      const cx = right - 20 * U, cy = bottom - 20 * U;
      let sx = 1;
      if (k > 0.82) sx = Math.cos((k - 0.82) / 0.18 * Math.PI / 2);
      else if (k < 0.18) sx = Math.sin(k / 0.18 * Math.PI / 2);
      const hop = k < 0.18 ? Math.sin(k / 0.18 * Math.PI) * 40 * U : 0;
      const kk = clamp(k / 0.45);
      if (kk > 0 && kk < 1) for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.45; const d = (120 + 170 * kk) * U; g.save(); g.globalAlpha = 1 - kk; g.fillStyle = i % 2 ? "#ffe066" : "#ffffff"; starPath(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 16 * U * (1 - kk * 0.4)); g.fill(); g.restore(); }
      drawLayer(g, cards[index], cx, cy - hop, 1 + 0.06 * Math.sin(phase * 6), Math.sin(phase * 3) * 0.06, Math.max(0.02, sx), 1);
    }
  };
}
