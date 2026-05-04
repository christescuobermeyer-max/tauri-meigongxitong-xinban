import type { GenerationItem, GenerationStatus } from "../types";
import { formatDuration } from "../lib/utils";
import { IconCheck, IconAlert } from "./Icons";

type StepState = "idle" | "queued" | "running" | "done" | "failed";

interface StepInput {
  label: string;
  item: GenerationItem;
  index: number;
}

interface Props {
  steps: StepInput[];
  elapsedMs: number;
}

function toStepState(status: GenerationStatus): StepState {
  if (status === "succeeded") return "done";
  if (status === "failed") return "failed";
  if (status === "queued") return "queued";
  if (status === "running") return "running";
  return "idle";
}

export default function ProgressSteps({ steps, elapsedMs }: Props) {
  return (
    <div className="steps">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 11.5,
          color: "var(--fg-subtle)",
          marginBottom: 4,
        }}
      >
        <span>生成进度</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          已用时 {Math.floor(elapsedMs / 1000)}s
        </span>
      </div>
      {steps.map((s) => {
        const state = toStepState(s.item.status);
        return (
          <div className="step" key={s.label} data-state={state}>
            <span className="step__dot">
              {state === "done" ? (
                <IconCheck style={{ width: 9, height: 9 }} />
              ) : state === "failed" ? (
                <IconAlert style={{ width: 9, height: 9 }} />
              ) : (
                s.index
              )}
            </span>
            <span className="step__label">{s.label}</span>
            {s.item.elapsedMs && state === "done" && (
              <span className="step__time">{formatDuration(s.item.elapsedMs)}</span>
            )}
            {state === "queued" && (
              <span className="step__time">等待中</span>
            )}
            {state === "running" && (
              <span className="step__time">
                <span className="dot dot--pulse" /> 进行中
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
