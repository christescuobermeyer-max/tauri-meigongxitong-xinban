import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const retrySource = readFileSync(new URL("../src/lib/generation-retry.ts", import.meta.url), "utf8");
const retryModule = await import(
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(retrySource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText).toString("base64")}`
);

let successAttempts = 0;
const success = await retryModule.runWithAutoRetry({
  onAttempt: (attempt: number) => {
    successAttempts = attempt;
  },
  run: async () => {
    return { value: "ok" };
  },
});

equal(success.value, "ok");
equal(success.attempt, 1);
equal(successAttempts, 1);

let failedAttempts = 0;
let capturedError: unknown;
try {
  await retryModule.runWithAutoRetry({
    maxAttempts: 2,
    onAttempt: (attempt: number) => {
      failedAttempts = attempt;
    },
    run: async (attempt: number) => {
      throw new Error(`failed-${attempt}`);
    },
  });
} catch (error: unknown) {
  capturedError = error;
}

ok(capturedError instanceof Error);
equal(failedAttempts, 1);
equal((capturedError as { attempt?: number }).attempt, 1);
equal((capturedError as Error).message, "failed-1");

let limitedAttempts = 0;
let limitedError: unknown;
try {
  await retryModule.runWithAutoRetry({
    maxAttempts: 1,
    onAttempt: (attempt: number) => {
      limitedAttempts = attempt;
    },
    run: async (attempt: number) => {
      throw new Error(`limited-${attempt}`);
    },
  });
} catch (error: unknown) {
  limitedError = error;
}

ok(limitedError instanceof Error);
equal(limitedAttempts, 1);
equal((limitedError as { attempt?: number }).attempt, 1);
equal((limitedError as Error).message, "limited-1");
