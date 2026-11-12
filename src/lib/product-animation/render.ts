import { ANIMATION_STYLES, containImage, type AnimationStyle } from "./policy";
import { PREMIUM_STYLES, createPremiumRenderer, type PremiumStyle } from "./render-premium";
import { BOLD_STYLES, createBoldRenderer, type BoldStyle } from "./render-bold";

export function createAnimationRenderer(image: HTMLImageElement, width: number, height: number, style: AnimationStyle) {
  if (PREMIUM_STYLES.has(style)) return createPremiumRenderer(image, width, height, style as PremiumStyle);
  if (BOLD_STYLES.has(style)) return createBoldRenderer(image, width, height, style as BoldStyle);
  const background = document.createElement("canvas");
  background.width = width;
  background.height = height;
  const base = background.getContext("2d")!;
  base.fillStyle = "#211713";
  base.fillRect(0, 0, width, height);
  const fit = containImage(image.naturalWidth, image.naturalHeight, width, height);
  base.drawImage(image, fit.x, fit.y, fit.width, fit.height);
  const definition = ANIMATION_STYLES.find((entry) => entry.id === style)!;
  const font = '"Microsoft YaHei", "PingFang SC", "Heiti SC", sans-serif';

  function star(context: CanvasRenderingContext2D, horizontal: number, vertical: number, radius: number) {
    context.beginPath();
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4;
      const size = index % 2 ? radius * .24 : radius;
      const point = [horizontal + Math.cos(angle) * size, vertical + Math.sin(angle) * size];
      if (index === 0) context.moveTo(point[0], point[1]); else context.lineTo(point[0], point[1]);
    }
    context.closePath();context.fillStyle = "#ffe454";context.fill();
    context.strokeStyle = "#fff8e3";context.lineWidth = 2;context.stroke();
  }

  function heart(context: CanvasRenderingContext2D, horizontal: number, vertical: number, radius: number) {
    context.beginPath();
    for (let index = 0; index <= 64; index++) {
      const angle = index / 64 * Math.PI * 2;
      const pointX = horizontal + 16 * Math.sin(angle) ** 3 * radius / 17;
      const pointY = vertical - (13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle)) * radius / 17;
      if (!index) context.moveTo(pointX, pointY); else context.lineTo(pointX, pointY);
    }
    context.fillStyle = "#ff5179";context.fill();context.strokeStyle = "#fff4ed";context.lineWidth = 3;context.stroke();
  }

  function steam(context: CanvasRenderingContext2D, progress: number) {
    context.save();context.beginPath();context.rect(0, 300, 1024, 280);context.clip();
    [[230, 521], [345, 463], [484, 498], [589, 454], [786, 510], [868, 478]].forEach(([originX, originY], index) => {
      const step = (progress + index * .173) % 1;
      const bottom = originY - step * 133;
      const drift = 17 * Math.sin(step * Math.PI * 2 + index);
      const opacity = Math.sin(step * Math.PI) * .48;
      const fade = context.createLinearGradient(0, 300, 0, 560);
      fade.addColorStop(0, "rgba(255,248,232,0)");fade.addColorStop(.2, `rgba(255,248,232,${opacity})`);
      fade.addColorStop(.8, `rgba(255,248,232,${opacity})`);fade.addColorStop(1, "rgba(255,248,232,0)");
      context.beginPath();context.moveTo(originX, bottom);
      context.bezierCurveTo(originX - 30 + drift, bottom - 35, originX + 36 + drift, bottom - 60, originX + drift, bottom - 105);
      context.strokeStyle = fade;context.lineCap = "round";
      for (const thickness of [23, 12, 5]) {
        context.globalAlpha = thickness === 23 ? .25 : .65;
        context.lineWidth = thickness;context.stroke();
      }
    });
    context.restore();
  }

  return (canvas: HTMLCanvasElement, progress: number) => {
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width;canvas.height = height; }
    const context = canvas.getContext("2d")!;
    context.setTransform(1, 0, 0, 1, 0, 0);context.clearRect(0, 0, width, height);context.drawImage(background, 0, 0);
    context.save();context.scale(width / 1024, height / 771);
    const phase = progress * Math.PI * 2;
    steam(context, progress);
    let horizontal = 512;
    let vertical = 660;
    let rotation = 0;
    let zoom = 1;
    if (style === "sparkle") {
      horizontal += 50 * Math.sin(phase);vertical += 20 * Math.cos(phase);
      rotation = 12 * Math.sin(phase);zoom = 1 + .14 * Math.cos(phase * 2);
      [[103, 459], [938, 388], [913, 584], [142, 595], [334, 672], [699, 665]].forEach(([pointX, pointY], index) => {
        const light = .5 + .5 * Math.sin(phase * 2 + index);
        star(context, pointX + 24 * Math.cos(phase + index), pointY + 25 * Math.sin(phase + index), 14 + 32 * light);
      });
    } else {
      zoom = .85 + .48 * Math.max(Math.max(0, Math.sin(phase)) ** 8, Math.max(0, Math.sin(phase - .8)) ** 12 * .82);
      horizontal = 270 + 24 * Math.sin(phase);vertical = 647 - 20 * Math.sin(phase);rotation = 9 * Math.sin(phase);
      for (let index = 0; index < 8; index++) {
        const step = (progress + index / 8) % 1;
        context.save();context.globalAlpha = Math.sin(Math.PI * step) ** .5;
        heart(context, (index % 2 ? 924 : 94) + 31 * Math.sin(step * Math.PI * 2 + index), 740 - step * 365, 22 + 19 * Math.sin(Math.PI * step));context.restore();
      }
    }
    context.translate(horizontal, vertical);context.rotate(rotation * Math.PI / 180);context.scale(zoom, zoom);
    context.fillStyle = "#561c16";context.beginPath();context.roundRect(-140, -57, 280, 120, 35);context.fill();
    context.fillStyle = definition.color;context.strokeStyle = "#fff7df";context.lineWidth = 5;context.beginPath();context.roundRect(-145, -65, 280, 120, 35);context.fill();context.stroke();
    context.fillStyle = definition.ink;context.textAlign = "center";context.textBaseline = "middle";
    context.font = `bold 62px ${font}`;context.fillText(definition.word, -5, -19);
    context.font = `18px ${font}`;context.fillText(definition.subtitle, -5, 33);
    context.restore();
  };
}
