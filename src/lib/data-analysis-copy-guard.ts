// 数据分析图防"原样返回截图"检查：生成结果和上传截图做灰度结构比对，
// 结构相关度过高说明模型把截图原样（或整张缩放后居中）吐了回来，不能当成品交付。

export const COPY_SAMPLE_SIZE = 48;
export const COPY_CORRELATION_THRESHOLD = 0.88;
const SAME_ASPECT_TOLERANCE = 0.08;

export interface CopyCheckSamples {
  sourceAspect: number;
  resultAspect: number;
  /** 截图拉伸采样的灰度值 */
  source: ArrayLike<number>;
  /** 结果整张拉伸采样的灰度值 */
  result: ArrayLike<number>;
  /** 结果中间与截图同宽高比的区域（按高度铺满）采样的灰度值 */
  resultCenter: ArrayLike<number>;
}

/** 皮尔逊相关系数；任一方几乎纯色时返回 0（无结构可比）。 */
export function grayCorrelation(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i++) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= n;
  meanB /= n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA < n || varB < n) return 0;
  return cov / Math.sqrt(varA * varB);
}

export function looksLikeSourceCopy(samples: CopyCheckSamples): boolean {
  const sameAspect =
    Math.abs(samples.resultAspect - samples.sourceAspect) / samples.sourceAspect < SAME_ASPECT_TOLERANCE;
  if (sameAspect && grayCorrelation(samples.source, samples.result) >= COPY_CORRELATION_THRESHOLD) {
    return true;
  }
  return grayCorrelation(samples.source, samples.resultCenter) >= COPY_CORRELATION_THRESHOLD;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = src;
  });
}

function sampleGray(
  image: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number
): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = COPY_SAMPLE_SIZE;
  canvas.height = COPY_SAMPLE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建比对画布");
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, COPY_SAMPLE_SIZE, COPY_SAMPLE_SIZE);
  const rgba = ctx.getImageData(0, 0, COPY_SAMPLE_SIZE, COPY_SAMPLE_SIZE).data;
  const gray = new Uint8ClampedArray(COPY_SAMPLE_SIZE * COPY_SAMPLE_SIZE);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  return gray;
}

/** 浏览器内比对生成结果和上传截图；比对本身出错时返回 false，不拦截正常结果。 */
export async function isResultCopyOfSource(resultSrc: string, sourceSrc: string): Promise<boolean> {
  try {
    const [result, source] = await Promise.all([loadImage(resultSrc), loadImage(sourceSrc)]);
    const sourceAspect = source.naturalWidth / source.naturalHeight;
    const resultAspect = result.naturalWidth / result.naturalHeight;
    const centerW = Math.min(result.naturalWidth, result.naturalHeight * sourceAspect);
    const centerH = centerW / sourceAspect;
    return looksLikeSourceCopy({
      sourceAspect,
      resultAspect,
      source: sampleGray(source, 0, 0, source.naturalWidth, source.naturalHeight),
      result: sampleGray(result, 0, 0, result.naturalWidth, result.naturalHeight),
      resultCenter: sampleGray(
        result,
        (result.naturalWidth - centerW) / 2,
        (result.naturalHeight - centerH) / 2,
        centerW,
        centerH
      ),
    });
  } catch (error) {
    console.warn("数据分析图原图比对失败", error);
    return false;
  }
}
