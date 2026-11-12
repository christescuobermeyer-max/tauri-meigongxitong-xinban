import { supabase } from "../supabase";
import { getBackendGatewayUrl } from "../desktop/gateway";
import { ensureTauriInvoke } from "../desktop/invoke";
import { containImage, type AnimationFormat } from "./policy";
import type { AnimationResult } from "./desktop";

export interface ModelSpec { width: number; height: number; durationMs: number; format: AnimationFormat; style: "steam" }
export interface ModelJob {
  id: string; status: "queued" | "submitting" | "running" | "processing" | "reconciling" | "succeeded" | "failed";
  spec: ModelSpec; error?: string; createdAt: string;
  result?: { url: string; posterUrl: string; media: AnimationResult["media"]; sourceMedia: { width: number; height: number; frames: number; durationMs: number; cycles: number; upscaled: boolean }; sha256: string };
}
export const modelJobActive = (job: ModelJob) => !["succeeded", "failed"].includes(job.status);
export const modelJobLabel = (job: ModelJob) => ({ queued: "等待模型生成", submitting: "正在提交模型", running: "模型正在生成动图", processing: "正在验证并保存动图", reconciling: "提交状态待核对，请勿重复生成", succeeded: "模型动图已完成", failed: "模型生成失败" }[job.status]);

export async function modelRequest<T>(path: string, body?: unknown): Promise<T> {
  const url = getBackendGatewayUrl();
  if (!url) throw new Error("未配置云端网关");
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error("请重新登录后生成动图");
  const controller = new AbortController();const timeout = window.setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(`${url}/api/animations/${path}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
    if (!response.ok) {
      if (response.status === 404) throw new Error("云端尚未部署模型动图功能");
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `动图请求失败（${response.status}）`);
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("动图请求超时，请刷新同一任务的状态，避免重复生成");
    throw error;
  } finally { window.clearTimeout(timeout); }
}
export const fetchModelJobs = async () => (await modelRequest<{ jobs: ModelJob[] }>("jobs")).jobs;
export function sourcePng(image: HTMLImageElement, spec: ModelSpec): string {
  const canvas = document.createElement("canvas");canvas.width = spec.width;canvas.height = spec.height;
  const context = canvas.getContext("2d")!;context.fillStyle = "#211713";context.fillRect(0, 0, spec.width, spec.height);
  const fit = containImage(image.naturalWidth, image.naturalHeight, spec.width, spec.height);
  context.drawImage(image, fit.x, fit.y, fit.width, fit.height);
  const data = canvas.toDataURL("image/png").split(",")[1];canvas.width = canvas.height = 1;
  if (data.length > 27_000_000) throw new Error("参考图过大，请选择较小画布");
  return data;
}
export async function importModelJob(userId: string, id: string): Promise<AnimationResult> {
  const job = (await modelRequest<{ jobs: ModelJob[] }>(`jobs?id=${encodeURIComponent(id)}`)).jobs[0];
  if (job?.status !== "succeeded" || !job.result) throw new Error("动图尚未完成");
  const response = await fetch(job.result.url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body) throw new Error("动图下载失败，请重试下载");
  const reader = response.body.getReader();const chunks: Uint8Array[] = [];let count = 0;
  try {
    while (true) { const part = await reader.read();if (part.done) break;count += part.value.length;if (count > 5_000_000) throw new Error("下载动图超过5M");chunks.push(part.value); }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(count);let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset);offset += chunk.length; }
  let binary = "";for (let index = 0;index < bytes.length;index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return ensureTauriInvoke()<AnimationResult>("import_model_animation", { userId, id, data: btoa(binary), spec: job.spec, sha256: job.result.sha256 });
}
