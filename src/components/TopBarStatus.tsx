import ThemeToggle from "./ThemeToggle";
import type { Theme } from "../lib/theme";
import type { GenerationLine } from "../types";

interface Props {
  generationLine: GenerationLine;
  todayCount: number;
  totalCount: number;
  busy: boolean;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

const LINE_LABEL: Record<GenerationLine, string> = {
  line1: "线路1",
  line2: "线路2",
  line3: "线路3",
  line4: "线路4",
  line5: "线路5",
  line6: "线路6",
};

const LINE_TONE: Record<GenerationLine, "success" | "warn" | "info" | "gold" | "violet"> = {
  line1: "success",
  line2: "success",
  line3: "info",
  line4: "warn",
  line5: "gold",
  line6: "violet",
};

export default function TopBarStatus({
  generationLine,
  todayCount,
  totalCount,
  busy,
  theme,
  onThemeChange,
}: Props) {
  return (
    <>
      <span
        className="badge topbar-line-badge"
        data-tone={LINE_TONE[generationLine]}
        data-line={generationLine}
        title="当前选择的生图线路"
      >
        当前是 <strong>{LINE_LABEL[generationLine]}</strong>
      </span>
      <span className="badge" data-tone="accent" title="该账号累计成功归档到 OSS 的图片数">
        总生图 <strong style={{ marginLeft: 4 }}>{totalCount}</strong> 张
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
