import { useCallback, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "winddesk-theme";

function current(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(current);
  const toggle = useCallback(() => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#0d0d0d" : "#f5f5f2");
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the toggle still works for this session.
    }
    setTheme(next);
  }, []);
  return [theme, toggle];
}
