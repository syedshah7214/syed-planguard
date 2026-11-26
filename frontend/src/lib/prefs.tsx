import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface Prefs {
  sidebarCollapsed: boolean;
  budget: number;
  failOn: "critical" | "high" | "medium" | "low";
  motion: "system" | "reduced" | "full";
}

const DEFAULTS: Prefs = { sidebarCollapsed: false, budget: 50, failOn: "high", motion: "system" };
const KEY = "planguard.prefs.v1";

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

interface Ctx { prefs: Prefs; set: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void; reset: () => void }
const PrefsContext = createContext<Ctx | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage blocked */ }
    const reduce = prefs.motion === "reduced" || (prefs.motion === "system" && matchMedia("(prefers-reduced-motion: reduce)").matches);
    document.documentElement.dataset.motion = reduce ? "reduced" : "full";
  }, [prefs]);
  const set = useCallback(<K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v })), []);
  const reset = useCallback(() => setPrefs(DEFAULTS), []);
  const value = useMemo(() => ({ prefs, set, reset }), [prefs, set, reset]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Ctx {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs outside PrefsProvider");
  return ctx;
}
