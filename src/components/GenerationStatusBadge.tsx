import type { GenerationItem } from "../types";
import { formatDuration } from "../lib/utils";
import { IconAlert, IconCheck } from "./Icons";

export default function GenerationStatusBadge({
  status,
  elapsedMs,
}: {
  status: GenerationItem["status"];
  elapsedMs?: number;
}) {
  if (status === "idle") return <span className="badge">未生成</span>;
  if (status === "queued")
    return (
      <span className="badge" data-tone="info">
        <span className="dot dot--pulse" />
        排队中
      </span>
    );
  if (status === "running")
    return (
      <span className="badge" data-tone="info">
        <span className="dot dot--pulse" />
        生成中
      </span>
    );
  if (status === "succeeded")
    return (
      <span className="badge" data-tone="success">
        <IconCheck style={{ width: 11, height: 11 }} />
        完成 {elapsedMs ? `· ${formatDuration(elapsedMs)}` : ""}
      </span>
    );
  return (
    <span className="badge" data-tone="error">
      <IconAlert style={{ width: 11, height: 11 }} />
      失败
    </span>
  );
}
