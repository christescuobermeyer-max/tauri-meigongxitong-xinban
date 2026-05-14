import type { BrandStyle, ThemeColor } from "../types";

interface Props {
  themeColor: ThemeColor | "";
  setThemeColor: (value: ThemeColor | "") => void;
  brandStyle: BrandStyle | "";
  setBrandStyle: (value: BrandStyle | "") => void;
}

const THEME_COLOR_OPTIONS: Array<{ value: ThemeColor; label: string }> = [
  { value: "light", label: "浅色主题色" },
  { value: "dark", label: "深色主题色" },
  { value: "red", label: "红色主题色" },
  { value: "yellow", label: "黄色主题色" },
  { value: "orange", label: "橙色主题色" },
];

const BRAND_STYLE_OPTIONS: Array<{ value: BrandStyle; label: string }> = [
  { value: "young", label: "年轻化风格" },
  { value: "lifeFire", label: "生活烟火风格" },
  { value: "fresh", label: "清爽风格" },
];

export default function AppearanceFields({
  themeColor,
  setThemeColor,
  brandStyle,
  setBrandStyle,
}: Props) {
  return (
    <>
      <div className="field">
        <label className="field__label">主题色（可选）</label>
        <select
          className="input"
          value={themeColor}
          onChange={(e) => setThemeColor(e.target.value as ThemeColor | "")}
        >
          <option value="">不指定（保持默认提示词）</option>
          {THEME_COLOR_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="field__hint">选中后将作为画面主色调写入提示词，不选则与之前完全一致</span>
      </div>

      <div className="field">
        <label className="field__label">设计风格（可选）</label>
        <select
          className="input"
          value={brandStyle}
          onChange={(e) => setBrandStyle(e.target.value as BrandStyle | "")}
        >
          <option value="">不指定（保持默认提示词）</option>
          {BRAND_STYLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="field__hint">选中后将作为整体风格描述写入提示词，不选则与之前完全一致</span>
      </div>
    </>
  );
}
