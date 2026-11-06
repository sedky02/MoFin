"use client";

import * as React from "react";

type Theme = "light" | "dark";
type ThemeContextValue = {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "mofin-theme";

export const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    // Light by default; dark only when the user chose it.
    var theme = stored || 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();
`;

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

const themeListeners = new Set<() => void>();

function subscribeTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

function readTheme(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Reads what the init script already applied; "light" on the server.
  const theme = React.useSyncExternalStore(
    subscribeTheme,
    readTheme,
    () => "light" as Theme,
  );

  // React Compiler memoizes these automatically — no manual useCallback/useMemo.
  const setTheme = (t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    applyTheme(t);
    themeListeners.forEach((l) => l());
  };

  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
