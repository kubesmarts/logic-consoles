/**
 * Theme management shared by the shell, Monaco, the CNCF diagram and React Flow.
 *
 * PatternFly 6 dark mode is the `pf-v6-theme-dark` class on <html>. The resolved
 * mode ("light" | "dark") is exposed so every editor/graph can honour the same theme.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ThemePreference } from "../contracts/index.ts";

export type ResolvedTheme = "light" | "dark";

const PF_DARK_CLASS = "pf-v6-theme-dark";

interface ThemeContextValue {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
  setPreference(next: ThemePreference): void;
  toggle(): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const prefersDark = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

const resolve = (preference: ThemePreference): ResolvedTheme =>
  preference === "system" ? (prefersDark() ? "dark" : "light") : preference;

export const ThemeProvider = ({
  children,
  initialPreference = "light",
}: {
  readonly children: ReactNode;
  readonly initialPreference?: ThemePreference;
}): ReactNode => {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);
  const resolved = resolve(preference);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle(PF_DARK_CLASS, resolved === "dark");
  }, [resolved]);

  const toggle = useCallback(() => {
    setPreference((current) => (resolve(current) === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference, toggle }),
    [preference, resolved, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return value;
};
