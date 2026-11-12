import brushUrl from "../../assets/fonts/animation-brush.ttf?url";
import displayUrl from "../../assets/fonts/animation-display.ttf?url";
import cuteUrl from "../../assets/fonts/animation-cute.ttf?url";

// OFL 字体子集（马善政毛笔楷书 / 站酷庆科黄油体 / 站酷快乐体），仅含动图文案用字。
export const ANIMATION_FONTS = { brush: "CSGH Brush", display: "CSGH Display", cute: "CSGH Cute" } as const;

let ready: Promise<void> | null = null;

/** 加载动图字体；失败时回退系统字体，不阻断制作。 */
export function loadAnimationFonts(): Promise<void> {
  ready ??= Promise.all([
    [ANIMATION_FONTS.brush, brushUrl],
    [ANIMATION_FONTS.display, displayUrl],
    [ANIMATION_FONTS.cute, cuteUrl],
  ].map(async ([family, url]) => {
    const face = new FontFace(family, `url(${url})`);
    await face.load();
    document.fonts.add(face);
  })).then(() => undefined, () => undefined);
  return ready;
}
