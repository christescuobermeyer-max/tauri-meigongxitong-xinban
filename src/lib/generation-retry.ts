export const AUTO_GENERATION_MAX_ATTEMPTS = 1;

export interface AutoRetryError extends Error {
  attempt: number;
}

export async function runWithAutoRetry<T extends object>(options: {
  onAttempt: (attempt: number) => void;
  run: (attempt: number) => Promise<T>;
}): Promise<T & { attempt: number }> {
  const attempt = AUTO_GENERATION_MAX_ATTEMPTS;
  options.onAttempt(attempt);
  try {
    const result = await options.run(attempt);
    return { ...result, attempt };
  } catch (error: unknown) {
    throw attachAutoRetryAttempt(error, attempt);
  }
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
