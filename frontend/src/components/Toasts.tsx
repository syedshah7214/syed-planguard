import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Tone = "success" | "info" | "warn" | "error";
interface Toast { id: number; tone: Tone; title: string; body?: string }
interface Ctx { push: (t: Omit<Toast, "id">) => void }

const ToastContext = createContext<Ctx | null>(null);
const ICON = { success: CheckCircle2, info: Info, warn: TriangleAlert, error: XCircle };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = ++seq.current;
    setToasts((all) => [...all.slice(-3), { ...t, id }]);
    setTimeout(() => dismiss(id), t.tone === "error" ? 7000 : 4500);
  }, [dismiss]);
  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <div key={t.id} className={`toast toast--${t.tone}`} role={t.tone === "error" ? "alert" : "status"}>
              <Icon size={18} aria-hidden="true" />
              <div className="toast__text"><b>{t.title}</b>{t.body && <p>{t.body}</p>}</div>
              <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Dismiss notification"><X size={14} /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}
