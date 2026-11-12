// 精致动效：所有动效以 progress∈[0,1) 周期循环，首尾无缝。
// 尺寸按画布宽度等比（U = W/1024），位置相对原图区域，适配任意菜品图；底图尽量静止以控制 GIF 体积。
import { ANIMATION_FONTS as F } from "./fonts";

export type PremiumStyle = "smoke" | "gilded" | "wok" | "crush" | "signature";
export const PREMIUM_STYLES = new Set<string>(["smoke", "gilded", "wok", "crush", "signature"]);

type Ctx = CanvasRenderingContext2D;
type Layer = { canvas: HTMLCanvasElement; w: number; h: number };
type Line = { text: string; font: string; lineHeight: number; dx?: number; draw: (g: Ctx, x: number, y: number) => void };

const TAU = Math.PI * 2;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };
const backOut = (x: number) => { const c = 1.9; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
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
  g.bezierCurveTo(x + r * 0.95, y - r * 1.05, x + r * 1.35, y + r * 0.05, x, y + r * 0.95);
  g.closePath();
}

function textLayer(lines: Line[], padding: number): Layer {
  const probe = canvasOf(1, 1).getContext("2d")!;
  let w = 0, h = 0;
  for (const line of lines) { probe.font = line.font; w = Math.max(w, probe.measureText(line.text).width + (line.dx || 0)); h += line.lineHeight; }
  const c = canvasOf(w + padding * 2, h + padding * 2); const g = c.getContext("2d")!; let y = padding;
  for (const line of lines) { g.save(); g.font = line.font; g.textBaseline = "top"; g.textAlign = "left"; line.draw(g, padding + (line.dx || 0), y); g.restore(); y += line.lineHeight; }
  return { canvas: c, w: c.width, h: c.height };
}

export function createPremiumRenderer(image: HTMLImageElement, W: number, H: number, style: PremiumStyle) {
  const U = W / 1024;
  const bg = canvasOf(W, H); const b = bg.getContext("2d")!;
  b.fillStyle = "#211713"; b.fillRect(0, 0, W, H);
  const s = Math.min(W / image.naturalWidth, H / image.naturalHeight);
  const iw = image.naturalWidth * s, ih = image.naturalHeight * s, ix = (W - iw) / 2, iy = (H - ih) / 2;
  b.drawImage(image, ix, iy, iw, ih);
  if (style === "wok") {
    // 静态暖光进入底图，不增加每帧变化像素
    b.globalCompositeOperation = "screen";
    const glow = b.createRadialGradient(W / 2, iy + ih * 1.05, 0, W / 2, iy + ih * 1.05, ih * 0.75);
    glow.addColorStop(0, "rgba(255,120,30,0.3)"); glow.addColorStop(1, "rgba(255,80,20,0)");
    b.fillStyle = glow; b.fillRect(0, 0, W, H); b.globalCompositeOperation = "source-over";
  }

  const rnd = random(20261112);
  const puff = puffSprite(128);
  const strong = style === "smoke";
  const steamLevel = strong ? 1 : 0.4;
  const puffs = Array.from({ length: Math.round(40 * steamLevel) }, () => ({
    x: ix + iw * (strong ? 0.24 + rnd() * 0.52 : 0.32 + rnd() * 0.36), y: iy + ih * (0.5 + rnd() * 0.14), seed: rnd(),
    size: strong ? 80 + rnd() * 80 : 60 + rnd() * 60, sway: 14 + rnd() * 22, rise: ih * (0.28 + rnd() * 0.16), wind: (rnd() - 0.5) * 50, phase: rnd() * TAU,
  }));
  const ember = glowDot(64, "rgba(255,255,230,1)", "rgba(255,170,40,0.75)");
  const glint = glowDot(64, "rgba(255,255,240,1)", "rgba(255,210,110,0.5)");
  const bokeh = glowDot(64, "rgba(255,210,225,0.5)", "rgba(255,120,160,0.22)");
  const embers = Array.from({ length: 56 }, () => ({ x: rnd(), seed: rnd(), speed: 1 + Math.floor(rnd() * 2), sway: rnd() * 34, size: 10 + rnd() * 14, flick: rnd() * TAU }));
  const glints = Array.from({ length: 10 }, (_, i) => ({ x: ix + iw * (0.22 + rnd() * 0.56), y: iy + ih * (0.4 + rnd() * 0.42), at: i / 10, size: 26 + rnd() * 22 }));
  const hearts = Array.from({ length: 12 }, (_, i) => ({ side: i % 2, seed: i / 12 + rnd() * 0.04, x: 0.04 + rnd() * 0.14, size: 20 + rnd() * 18, sway: 12 + rnd() * 18 }));
  const bokehs = Array.from({ length: 12 }, () => ({ x: rnd(), seed: rnd(), size: 40 + rnd() * 70 }));

  let layer: Layer | null = null;
  let badge: { disc: HTMLCanvasElement; ring: HTMLCanvasElement; size: number; R: number } | null = null;
  if (style === "smoke") {
    layer = textLayer([
      { text: "真香", font: `${172 * U}px "${F.brush}"`, lineHeight: 172 * U, draw: (g, x, y) => {
        g.shadowColor = "rgba(0,0,0,0.55)"; g.shadowBlur = 14 * U; g.shadowOffsetY = 4 * U;
        const grad = g.createLinearGradient(0, y, 0, y + 172 * U); grad.addColorStop(0, "#fffaf0"); grad.addColorStop(1, "#ffe2b0");
        g.fillStyle = grad; g.fillText("真香", x, y); } },
      { text: "一口入魂 · 香气扑鼻", dx: 10 * U, font: `${30 * U}px "${F.brush}"`, lineHeight: 40 * U, draw: (g, x, y) => {
        g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 8 * U; g.fillStyle = "#ffe9c7"; g.fillText("一口入魂 · 香气扑鼻", x, y + 6 * U); } },
    ], 24 * U);
  } else if (style === "gilded") {
    layer = textLayer([
      { text: "美味", font: `${150 * U}px "${F.display}"`, lineHeight: 158 * U, draw: (g, x, y) => {
        g.shadowColor = "rgba(40,15,0,0.65)"; g.shadowBlur = 16 * U; g.shadowOffsetY = 5 * U;
        const grad = g.createLinearGradient(0, y, 0, y + 150 * U);
        grad.addColorStop(0, "#fff6cf"); grad.addColorStop(0.45, "#ffd36a"); grad.addColorStop(0.55, "#e7a531"); grad.addColorStop(1, "#ffe39a");
        g.fillStyle = grad; g.fillText("美味", x, y); } },
      { text: "· 鲜 香 浓 郁 ·", dx: 26 * U, font: `${26 * U}px "${F.display}"`, lineHeight: 36 * U, draw: (g, x, y) => {
        g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 6 * U; g.fillStyle = "#ffe7a8"; g.fillText("· 鲜 香 浓 郁 ·", x, y + 4 * U); } },
    ], 28 * U);
  } else if (style === "wok") {
    layer = textLayer([{ text: "好吃到爆", font: `${124 * U}px "${F.display}"`, lineHeight: 134 * U, draw: (g, x, y) => {
      g.lineJoin = "round"; g.lineWidth = 12 * U; g.strokeStyle = "#4a0f05"; g.shadowColor = "rgba(255,90,20,0.75)"; g.shadowBlur = 22 * U; g.strokeText("好吃到爆", x, y);
      g.shadowBlur = 0; const grad = g.createLinearGradient(0, y, 0, y + 124 * U);
      grad.addColorStop(0, "#fff3b0"); grad.addColorStop(0.5, "#ffb52e"); grad.addColorStop(1, "#ff5a1f"); g.fillStyle = grad; g.fillText("好吃到爆", x, y); } }], 30 * U);
  } else if (style === "crush") {
    layer = textLayer([{ text: "爱了爱了", font: `${118 * U}px "${F.cute}"`, lineHeight: 126 * U, draw: (g, x, y) => {
      g.lineJoin = "round"; g.lineWidth = 10 * U; g.strokeStyle = "#ffffff"; g.shadowColor = "rgba(120,0,40,0.45)"; g.shadowBlur = 14 * U; g.strokeText("爱了爱了", x, y);
      g.shadowBlur = 0; const grad = g.createLinearGradient(0, y, 0, y + 118 * U); grad.addColorStop(0, "#ff7aa5"); grad.addColorStop(1, "#e8255f");
      g.fillStyle = grad; g.fillText("爱了爱了", x, y); } }], 26 * U);
  } else {
    const R = 132 * U; const size = Math.ceil(R * 2 + 40 * U); const c = size / 2;
    const disc = canvasOf(size, size); const d = disc.getContext("2d")!;
    d.shadowColor = "rgba(0,0,0,0.5)"; d.shadowBlur = 18 * U; d.shadowOffsetY = 6 * U;
    let grad = d.createRadialGradient(c - R * 0.3, c - R * 0.3, R * 0.1, c, c, R);
    grad.addColorStop(0, "#e8402c"); grad.addColorStop(1, "#9e1610"); d.fillStyle = grad; d.beginPath(); d.arc(c, c, R, 0, TAU); d.fill();
    d.shadowColor = "transparent"; d.lineWidth = 5 * U; d.strokeStyle = "#f7cf6b"; d.beginPath(); d.arc(c, c, R - 6 * U, 0, TAU); d.stroke();
    d.lineWidth = 1.5 * U; d.beginPath(); d.arc(c, c, R * 0.62, 0, TAU); d.stroke();
    d.textAlign = "center"; d.textBaseline = "middle"; d.font = `${96 * U}px "${F.brush}"`;
    grad = d.createLinearGradient(0, c - 40 * U, 0, c + 40 * U); grad.addColorStop(0, "#fff4c4"); grad.addColorStop(1, "#f2b33d"); d.fillStyle = grad; d.fillText("必点", c, c + 4 * U);
    const ring = canvasOf(size, size); const r = ring.getContext("2d")!;
    r.translate(c, c); r.fillStyle = "#ffe7a6"; r.font = `${27 * U}px "${F.display}"`; r.textAlign = "center"; r.textBaseline = "middle";
    const chars = [..."人气招牌 · 本店推荐 · 回头客必点 · "];
    chars.forEach((ch, i) => { r.save(); r.rotate(i / chars.length * TAU); r.fillText(ch, 0, -(R * 0.81)); r.restore(); });
    badge = { disc, ring, size, R };
  }
  const shimmer = layer && style === "gilded" ? canvasOf(layer.w, layer.h) : null;

  function steam(g: Ctx, t: number) {
    for (const p of puffs) {
      const k = (t + p.seed) % 1;
      const size = p.size * U * (0.55 + 1.5 * k);
      g.globalAlpha = Math.sin(Math.PI * k) ** 1.3 * 0.62 * (0.55 + 0.45 * steamLevel);
      g.drawImage(puff, p.x + Math.sin(k * TAU * 0.9 + p.phase) * p.sway * U + p.wind * k * U - size / 2, p.y - p.rise * k - size / 2, size, size);
    }
    g.globalAlpha = 1;
  }
  function scrim(g: Ctx, x: number, y: number, rx: number, ry: number, alpha: number) {
    g.save(); g.translate(x, y); g.scale(rx, ry);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, `rgba(20,8,4,${alpha})`); grad.addColorStop(0.6, `rgba(20,8,4,${alpha * 0.55})`); grad.addColorStop(1, "rgba(20,8,4,0)");
    g.fillStyle = grad; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore();
  }
  function lightSweep(g: Ctx, t: number, from: number, to: number, alpha: number) {
    const k = smooth(from, to, t); if (k <= 0 || k >= 1) return;
    g.save(); g.globalCompositeOperation = "screen"; g.translate(ix - iw * 0.35 + iw * 1.7 * k, iy + ih / 2); g.rotate(-0.38);
    const grad = g.createLinearGradient(-170 * U, 0, 170 * U, 0);
    grad.addColorStop(0, "rgba(255,240,210,0)"); grad.addColorStop(0.42, `rgba(255,244,220,${alpha * 0.5})`); grad.addColorStop(0.5, `rgba(255,250,235,${alpha})`);
    grad.addColorStop(0.58, `rgba(255,244,220,${alpha * 0.5})`); grad.addColorStop(1, "rgba(255,240,210,0)");
    g.fillStyle = grad; g.fillRect(-170 * U, -ih, 340 * U, ih * 2); g.restore();
  }
  function sparkleStar(g: Ctx, x: number, y: number, r: number, a: number) {
    g.save(); g.globalAlpha = a; g.globalCompositeOperation = "screen";
    g.drawImage(glint, x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
    g.fillStyle = "rgba(255,252,235,0.95)"; g.beginPath();
    g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r * 0.22, y); g.quadraticCurveTo(x, y, x, y + r);
    g.quadraticCurveTo(x, y, x - r * 0.22, y); g.quadraticCurveTo(x, y, x, y - r);
    g.moveTo(x - r * 0.7, y); g.quadraticCurveTo(x, y, x, y + r * 0.14); g.quadraticCurveTo(x, y, x + r * 0.7, y);
    g.quadraticCurveTo(x, y, x, y - r * 0.14); g.quadraticCurveTo(x, y, x - r * 0.7, y); g.fill(); g.restore();
  }

  return (canvas: HTMLCanvasElement, t: number) => {
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const g = canvas.getContext("2d")!; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    g.drawImage(bg, 0, 0);
    const phase = t * TAU;

    if (style === "crush") {
      g.save(); g.globalCompositeOperation = "screen";
      for (const o of bokehs) {
        const k = (t + o.seed) % 1; const x = o.x < 0.5 ? ix + iw * o.x * 0.36 : ix + iw * (0.82 + (o.x - 0.5) * 0.36); const y = iy + ih * (1.05 - k * 1.1);
        g.globalAlpha = Math.sin(Math.PI * k) * 0.7; const sz = o.size * U; g.drawImage(bokeh, x - sz / 2, y - sz / 2, sz, sz);
      }
      g.restore();
    }
    steam(g, t);
    if (style === "gilded") {
      lightSweep(g, t, 0.05, 0.6, 0.62);
      for (const star of glints) { const k = (t - star.at + 1) % 1; const a = k < 0.4 ? Math.sin(Math.PI * k / 0.4) : 0; if (a > 0) sparkleStar(g, star.x, star.y, star.size * U * (0.6 + 0.6 * a), a); }
    }
    if (style === "wok") {
      g.save(); g.globalCompositeOperation = "screen";
      for (const e of embers) {
        const k = (t * e.speed + e.seed) % 1; const x = ix + iw * e.x + Math.sin(k * TAU + e.flick) * e.sway * U; const y = iy + ih * (1.02 - k * 0.75);
        const sz = e.size * U * (1 - k * 0.5);
        g.globalAlpha = clamp(Math.sin(Math.PI * k) * (0.65 + 0.35 * Math.sin(phase * 6 + e.flick))); g.drawImage(ember, x - sz, y - sz * 1.8, sz * 2, sz * 3.6);
      }
      g.restore();
    }
    if (style === "crush") {
      for (const h of hearts) {
        const k = (t + h.seed) % 1; const x = h.side ? ix + iw * (1 - h.x) : ix + iw * h.x; const y = iy + ih * (1.0 - k * 0.85);
        const r = h.size * U * (0.7 + 0.5 * Math.sin(Math.PI * k));
        g.save(); g.globalAlpha = Math.sin(Math.PI * k) ** 0.8 * 0.92; g.translate(x + Math.sin(k * TAU * 1.3 + h.seed * 9) * h.sway * U, y); g.rotate(Math.sin(k * TAU) * 0.25);
        g.shadowColor = "rgba(255,80,130,0.7)"; g.shadowBlur = 12 * U; const grad = g.createLinearGradient(0, -r, 0, r); grad.addColorStop(0, "#ff9dbb"); grad.addColorStop(1, "#ff3d77");
        g.fillStyle = grad; heartPath(g, 0, 0, r); g.fill(); g.shadowBlur = 0; g.fillStyle = "rgba(255,255,255,0.55)"; g.beginPath(); g.ellipse(-r * 0.42, -r * 0.35, r * 0.18, r * 0.11, -0.6, 0, TAU); g.fill(); g.restore();
      }
    }

    if (layer) {
      const right = style === "gilded"; const margin = 34 * U;
      const x0 = right ? ix + iw - layer.w - margin + 24 * U : ix + margin - 24 * U;
      const y0 = iy + ih - layer.h - margin + 24 * U;
      scrim(g, x0 + layer.w / 2, y0 + layer.h * 0.55, layer.w * 0.62, layer.h * 0.62, 0.5);
      let scale = 1, dy = 0;
      if (style === "smoke") dy = Math.sin(phase) * 6 * U;
      if (style === "gilded") dy = Math.sin(phase) * 4 * U;
      if (style === "wok") { const beat = Math.max(0, Math.sin(phase * 2)) ** 6; scale = 1 + 0.07 * beat; dy = -beat * 6 * U; }
      if (style === "crush") { const k = t % 0.5 / 0.5; scale = 1 + 0.09 * Math.max(Math.exp(-(((k - 0.08) / 0.05) ** 2)), 0.7 * Math.exp(-(((k - 0.26) / 0.05) ** 2))); }
      g.save(); g.translate(x0 + layer.w / 2, y0 + layer.h / 2 + dy); g.scale(scale, scale); g.drawImage(layer.canvas, -layer.w / 2, -layer.h / 2); g.restore();
      if (shimmer) {
        const k = smooth(0.2, 0.62, t);
        if (k > 0 && k < 1) {
          const q = shimmer.getContext("2d")!; q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = "source-over"; q.clearRect(0, 0, layer.w, layer.h);
          q.drawImage(layer.canvas, 0, 0); q.globalCompositeOperation = "source-atop"; q.translate(layer.w * (-0.3 + 1.6 * k), 0); q.rotate(0.3);
          const grad = q.createLinearGradient(-40 * U, 0, 40 * U, 0); grad.addColorStop(0, "rgba(255,255,255,0)"); grad.addColorStop(0.5, "rgba(255,255,255,0.85)"); grad.addColorStop(1, "rgba(255,255,255,0)");
          q.fillStyle = grad; q.fillRect(-40 * U, -layer.h, 80 * U, layer.h * 3);
          g.save(); g.globalCompositeOperation = "screen"; g.drawImage(shimmer, x0, y0 + dy); g.restore();
        }
      }
      if (style === "smoke") {
        const k = clamp((t - 0.04) / 0.14); const stamp = k < 1 ? 1.35 - 0.35 * backOut(k) : 1;
        const sz = 62 * U;
        g.save(); g.translate(x0 + layer.w - 38 * U, y0 + 70 * U + dy); g.rotate(-0.08); g.scale(stamp, stamp); g.globalAlpha = 0.95;
        g.fillStyle = "#c8261c"; g.beginPath(); g.roundRect(-sz / 2, -sz / 2, sz, sz, 8 * U); g.fill();
        g.strokeStyle = "rgba(255,235,220,0.9)"; g.lineWidth = 2 * U; g.beginPath(); g.roundRect(-sz / 2 + 5 * U, -sz / 2 + 5 * U, sz - 10 * U, sz - 10 * U, 5 * U); g.stroke();
        g.fillStyle = "#fff1e6"; g.font = `${40 * U}px "${F.brush}"`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("香", 0, 2 * U); g.restore();
      }
    }
    if (badge) {
      const { disc, ring, size, R } = badge; const bob = Math.sin(phase) * 6 * U;
      const cx = ix + iw - size / 2 - 22 * U, cy = iy + ih - size / 2 - 18 * U + bob;
      const pulse = 1 + 0.04 * Math.max(0, Math.sin(phase * 2)) ** 4;
      g.save(); g.translate(cx, cy); g.scale(pulse, pulse); g.drawImage(disc, -size / 2, -size / 2); g.rotate(t * TAU); g.drawImage(ring, -size / 2, -size / 2); g.restore();
      g.save(); g.beginPath(); g.arc(cx, cy, R * pulse, 0, TAU); g.clip(); lightSweep(g, t, 0.5, 0.8, 0.55); g.restore();
    }
  };
}
