import { useEffect, useRef, useState } from "react";
import { useToast } from "../components/Toast";
import type { WorkspaceTab } from "../lib/workspace-catalog";
import type { GenerationLine } from "../types";
import { useWorkspaceHistory } from "./generation/useWorkspaceHistory";
import { useWorkspaceSlots } from "./generation/useWorkspaceSlots";

export type { WorkspaceTab } from "../lib/workspace-catalog";

// 前端账号最多允许 10 个任务，额外提交等待现有任务完成。
const FRONTEND_GENERATION_USER_LIMIT = 10;

export default function useGenerationWorkspace({ userId }: { userId: string }) {
  const toast = useToast();
  const [tab, setTab] = useState<WorkspaceTab>("avatarStorefront");
  const generationLine: GenerationLine = "line5";
  const setGenerationLine = (_line: GenerationLine) => undefined;
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const { recordHistory, ...history } = useWorkspaceHistory({ userId, tab, generationLine, onToast: toast.show });
  const slots = useWorkspaceSlots({ generationLine, setGenerationLine, toast, recordHistory });
  const { menuDesign, ...slotGroups } = slots;
  const activeGenerationTaskCount = Number(menuDesign.busy) +
    Object.values(slotGroups).reduce((count, group) => count + group.filter((slot) => slot.busy).length, 0);
  const generationTaskLimit = FRONTEND_GENERATION_USER_LIMIT;
  const generationCapacityFull = activeGenerationTaskCount >= generationTaskLimit;
  const busy = activeGenerationTaskCount > 0;

  useEffect(() => {
    if (!busy) {
      startedAt.current = null;
      setElapsed(0);
      return;
    }
    if (startedAt.current === null) startedAt.current = Date.now();
    const timer = setInterval(() => {
      if (startedAt.current) setElapsed(Date.now() - startedAt.current);
    }, 200);
    return () => clearInterval(timer);
  }, [busy]);

  return { tab, setTab, generationLine, setGenerationLine, ...history, ...slots,
    busy, activeGenerationTaskCount, generationTaskLimit, generationCapacityFull, elapsed };
}

export type GenerationWorkspace = ReturnType<typeof useGenerationWorkspace>;
