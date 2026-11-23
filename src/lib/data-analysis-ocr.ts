import { createWorker, OEM, PSM } from "tesseract.js";
import workerPath from "tesseract.js/dist/worker.min.js?url&no-inline";
import corePath from "tesseract.js-core/tesseract-core-lstm.wasm.js?url&no-inline";
import languagePath from "@tesseract.js-data/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz?url&no-inline";

export async function readTrafficScreenshot(dataUrl: string): Promise<string> {
  const langPath = new URL(".", new URL(languagePath, window.location.href)).href;
  let timer: number | undefined;
  let cancelled = false;
  const failure = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error("截图识别超时")), 30_000);
  });
  let ocrError: (error: Error) => void = () => {};
  const workerError = new Promise<never>((_, reject) => { ocrError = reject; });
  const workerTask = createWorker("chi_sim", OEM.LSTM_ONLY, {
    langPath,
    workerPath,
    workerBlobURL: false,
    corePath,
    cacheMethod: "none",
    errorHandler: (error) => ocrError(new Error(String(error))),
  });
  const recognition = workerTask.then(async (worker) => {
    if (cancelled) return "";
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const result = await worker.recognize(dataUrl);
    return result.data.text;
  });
  try {
    return await Promise.race([recognition, failure, workerError]);
  } finally {
    cancelled = true;
    window.clearTimeout(timer);
    void workerTask.then((worker) => worker.terminate()).catch(() => {});
  }
}
