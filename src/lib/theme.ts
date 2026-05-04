export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "csch-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

export function applyTheme(theme: Theme): ResolvedTheme {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePref = theme;
  root.style.colorScheme = resolved;
  return resolved;
}

export function persistTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function watchSystemTheme(handler: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(DARK_QUERY);
  const onChange = () => handler();
  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
}
