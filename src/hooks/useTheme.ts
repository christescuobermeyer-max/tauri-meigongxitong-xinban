import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  getStoredTheme,
  persistTheme,
  resolveTheme,
  watchSystemTheme,
  type ResolvedTheme,
  type Theme,
} from "../lib/theme";

const ORDER: Theme[] = ["light", "dark", "system"];

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(getStoredTheme()));

  useEffect(() => {
    const next = applyTheme(theme);
    setResolved(next);
    persistTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;
    return watchSystemTheme(() => {
      const next = applyTheme("system");
      setResolved(next);
    });
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const idx = ORDER.indexOf(current);
      return ORDER[(idx + 1) % ORDER.length];
    });
  }, []);

  return { theme, resolved, setTheme, cycleTheme };
}
