import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";

export type Connectivity = "checking" | "online" | "offline";
interface Ctx { connectivity: Connectivity; version: string | null; tick: number; bump: () => void; check: () => void }
const StatusContext = createContext<Ctx | null>(null);

/** API connectivity + a shared "something changed" counter pages use to reload. */
export function StatusProvider({ children }: { children: ReactNode }) {
  const [connectivity, setConnectivity] = useState<Connectivity>("checking");
  const [version, setVersion] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const check = useCallback(() => {
    api.health().then((h) => { setConnectivity("online"); setVersion(h.version); }).catch(() => setConnectivity("offline"));
  }, []);
  useEffect(() => {
    check();
    const t = setInterval(() => { if (document.visibilityState === "visible") check(); }, 30_000);
    return () => clearInterval(t);
  }, [check]);
  const bump = useCallback(() => setTick((x) => x + 1), []);
  const value = useMemo(() => ({ connectivity, version, tick, bump, check }), [connectivity, version, tick, bump, check]);
  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export function useStatus(): Ctx {
  const ctx = useContext(StatusContext);
  if (!ctx) throw new Error("useStatus outside StatusProvider");
  return ctx;
}
