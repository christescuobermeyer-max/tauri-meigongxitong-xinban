import ThemeToggle from "./ThemeToggle";
import type { Theme } from "../lib/theme";
import type { GenerationLine } from "../types";

interface Props {
  generationLine: GenerationLine;
  todayCount: number;
  busy: boolean;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

const LINE_LABEL: Record<GenerationLine, string> = {
  line1: "线路1",
  line2: "线路2",
  line3: "线路3",
};

const LINE_TONE: Record<GenerationLine, "success" | "warn" | "info"> = {
  line1: "success",
  line2: "warn",
  line3: "info",
};

export default function TopBarStatus({
  generationLine,
  todayCount,
  busy,
  theme,
  onThemeChange,
}: Props) {
  return (
    <>
      <span
        className="badge topbar-line-badge"
        data-tone={LINE_TONE[generationLine]}
        title="当前选择的生图线路"
      >
        当前是 <strong>{LINE_LABEL[generationLine]}</strong>
      </span>
      <span className="badge" data-tone="info" title="今日已成功归档到 OSS 的图片数">
        今日已生图 <strong style={{ marginLeft: 4 }}>{todayCount}</strong> 张
      </span>
      <span className="badge" data-tone={busy ? "info" : "success"}>
        <span className={busy ? "dot dot--pulse" : "dot"} />
        {busy ? "生成中" : "就绪"}
      </span>
      <ThemeToggle theme={theme} onChange={onThemeChange} />
    </>
  );
}
