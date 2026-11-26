import { CornerDownLeft, FileText, ListChecks, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { ALL_NAV } from "../lib/nav";
import { navigate } from "../lib/router";
import type { AnalysisSummary, Rule } from "../lib/types";

interface Item { id: string; group: string; label: string; hint?: string; icon: ReactNode; run: () => void }

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<AnalysisSummary[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ(""); setActive(0);
    setTimeout(() => input.current?.focus(), 10);
    const ctrl = new AbortController();
    api.analyses(20, 0, ctrl.signal).then((p) => setRecent(p.items)).catch(() => setRecent([]));
    api.rules(ctrl.signal).then(setRules).catch(() => setRules([]));
    return () => ctrl.abort();
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const ql = q.toLowerCase();
    const match = (s: string) => !ql || s.toLowerCase().includes(ql);
    const go = (to: string) => () => { navigate(to); onClose(); };
    const out: Item[] = [];
    ALL_NAV.filter((n) => match(`${n.label} ${n.keywords}`)).forEach((n) => {
      const Icon = n.icon;
      out.push({ id: `p${n.path}`, group: "Pages", label: n.label, icon: <Icon size={16} />, run: go(n.path) });
    });
    recent.filter((a) => match(`${a.name} ${a.decision}`)).slice(0, 8).forEach((a) =>
      out.push({ id: `a${a.id}`, group: "Analyses", label: a.name, hint: `${a.decision} · #${a.id}`, icon: <FileText size={16} />, run: go(`/report?id=${a.id}`) }));
    if (ql) rules.filter((r) => match(`${r.id} ${r.title} ${r.category}`)).slice(0, 6).forEach((r) =>
      out.push({ id: `r${r.id}`, group: "Rules", label: `${r.id} ${r.title}`, hint: r.severity, icon: <ListChecks size={16} />, run: go(`/policies?q=${r.id}`) }));
    return out;
  }, [q, recent, rules, onClose]);

  useEffect(() => { setActive(0); }, [q]);
  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); items[active]?.run(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };
  let lastGroup = "";
  return (
    <div className="palette-scrim" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="palette__input">
          <Search size={17} aria-hidden="true" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages, analyses, rule IDs…" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={items[active] ? `pi-${items[active].id}` : undefined} />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette__list" id="palette-list" role="listbox">
          {items.length === 0 && <li className="palette__empty muted small">No matches.</li>}
          {items.map((it, idx) => {
            const header = it.group !== lastGroup ? (lastGroup = it.group) : null;
            return (
              <li key={it.id} role="presentation">
                {header && <p className="palette__group">{header}</p>}
                <button id={`pi-${it.id}`} role="option" aria-selected={idx === active} className={idx === active ? "on" : ""} onMouseEnter={() => setActive(idx)} onClick={it.run}>
                  <span className="palette__icon" aria-hidden="true">{it.icon}</span>
                  <span className="palette__label">{it.label}</span>
                  {it.hint && <span className="palette__hint mono">{it.hint}</span>}
                  {idx === active && <CornerDownLeft size={14} className="palette__enter" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="palette__foot muted small"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>Enter</kbd> open</span><span><kbd>Ctrl K</kbd> toggle</span></div>
      </div>
    </div>
  );
}
