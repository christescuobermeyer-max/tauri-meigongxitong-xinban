export const AUTO_GENERATION_MAX_ATTEMPTS = 2;

export interface AutoRetryError extends Error {
  attempt: number;
}

export async function runWithAutoRetry<T extends object>(options: {
  onAttempt: (attempt: number) => void;
  run: (attempt: number) => Promise<T>;
}): Promise<T & { attempt: number }> {
  for (let attempt = 1; attempt <= AUTO_GENERATION_MAX_ATTEMPTS; attempt += 1) {
    options.onAttempt(attempt);
    try {
      const result = await options.run(attempt);
      return { ...result, attempt };
    } catch (error: unknown) {
      if (attempt >= AUTO_GENERATION_MAX_ATTEMPTS) {
        throw attachAutoRetryAttempt(error, attempt);
      }
    }
  }

  throw new Error("自动重试流程异常结束");
}

export function getAutoRetryAttempt(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("attempt" in error)) return undefined;
  const attempt = (error as { attempt?: unknown }).attempt;
  return typeof attempt === "number" ? attempt : undefined;
}

function attachAutoRetryAttempt(error: unknown, attempt: number): AutoRetryError {
  const target = error instanceof Error ? error : new Error(String(error));
  (target as AutoRetryError).attempt = attempt;
  return target as AutoRetryError;
}
