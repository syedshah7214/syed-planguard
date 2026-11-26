import { AlertOctagon, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Info, RefreshCw, ShieldAlert, ShieldCheck, ShieldX, TriangleAlert } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { Decision, Severity } from "../lib/types";

export function Card({ children, className = "", as: As = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "article" | "div" } & React.HTMLAttributes<HTMLElement>) {
  return <As className={`card ${className}`} {...rest}>{children}</As>;
}

export function CardHead({ icon, title, sub, actions }: { icon?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="card-head">
      <div className="card-head__title">
        {icon && <span className="card-head__icon" aria-hidden="true">{icon}</span>}
        <div><h2>{title}</h2>{sub && <p className="muted small">{sub}</p>}</div>
      </div>
      {actions && <div className="card-head__actions">{actions}</div>}
    </header>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="page-head__desc">{description}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </header>
  );
}

const DECISION_ICON = { PASS: ShieldCheck, WARN: ShieldAlert, FAIL: ShieldX };
export const DECISION_TEXT = { PASS: "Safe to apply", WARN: "Apply with caution", FAIL: "Apply blocked" };

export function DecisionPill({ d, size = "sm" }: { d: Decision; size?: "sm" | "lg" }) {
  const Icon = DECISION_ICON[d];
  return (
    <span className={`pill pill--${d.toLowerCase()} pill--${size}`}>
      <Icon size={size === "lg" ? 18 : 13} aria-hidden="true" />{d}
    </span>
  );
}

export function SevBadge({ s }: { s: Severity }) {
  return <span className={`sevtag sevtag--${s}`}>{s}</span>;
}

export function Skeleton({ h = 16, w = "100%", r = 8, className = "" }: { h?: number; w?: number | string; r?: number; className?: string }) {
  return <span className={`skeleton ${className}`} style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card" aria-busy="true" aria-label="Loading">
      <Skeleton h={14} w="40%" />
      <div className="stack-sm" style={{ marginTop: 16 }}>
        {Array.from({ length: lines }, (_, i) => <Skeleton key={i} h={12} w={`${90 - i * 12}%`} />)}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty__icon" aria-hidden="true">{icon ?? <Info size={20} />}</span>
      <b>{title}</b>
      {children && <div className="muted small empty__body">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error | string; onRetry?: () => void }) {
  return (
    <div className="empty empty--error" role="alert">
      <span className="empty__icon" aria-hidden="true"><AlertOctagon size={20} /></span>
      <b>Could not load this data</b>
      <p className="muted small">{typeof error === "string" ? error : error.message}</p>
      {onRetry && <button className="btn" onClick={onRetry}><RefreshCw size={14} /> Retry</button>}
    </div>
  );
}

export function Tip({ text, children }: { text: string; children?: ReactNode }) {
  const id = useId();
  return (
    <span className="tip">
      <button type="button" className="tip__btn" aria-describedby={id} aria-label="More information">
        {children ?? <Info size={13} />}
      </button>
      <span role="tooltip" id={id} className="tip__bubble">{text}</span>
    </span>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select({ value, onChange, options, label, hideLabel = false }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string; hideLabel?: boolean }) {
  const id = useId();
  return (
    <label className={`select ${hideLabel ? "select--bare" : ""}`} htmlFor={id}>
      <span className={hideLabel ? "sr-only" : "select__label"}>{label}</span>
      <span className="select__wrap">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={14} aria-hidden="true" />
      </span>
    </label>
  );
}

export function Pagination({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= limit) return total ? <p className="muted small pager">{total} record{total === 1 ? "" : "s"}</p> : null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <nav className="pager" aria-label="Pagination">
      <span className="muted small">{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
      <button className="icon-btn" disabled={page <= 1} onClick={() => onChange(offset - limit)} aria-label="Previous page"><ChevronLeft size={16} /></button>
      <span className="small mono">{page} / {pages}</span>
      <button className="icon-btn" disabled={page >= pages} onClick={() => onChange(offset + limit)} aria-label="Next page"><ChevronRight size={16} /></button>
    </nav>
  );
}

export function JsonBlock({ value, label }: { value: unknown; label: string }) {
  const [copied, setCopied] = useState(false);
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <div className="json">
      <div className="json__bar">
        <span className="mono small">{label}</span>
        <button className="icon-btn" aria-label={`Copy ${label}`} onClick={async () => {
          try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
        }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
      </div>
      <pre tabIndex={0}><code>{text}</code></pre>
    </div>
  );
}

export function Expandable({ title, children, defaultOpen = false, meta }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; meta?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={`expand ${open ? "expand--open" : ""}`}>
      <button className="expand__head" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <ChevronRight size={15} className="expand__chev" aria-hidden="true" />
        <span className="expand__title">{title}</span>
        {meta && <span className="expand__meta">{meta}</span>}
      </button>
      {open && <div id={id} className="expand__body">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "ok" | "warn" | "bad" | "muted" }) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ""}`}>
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {hint && <span className="stat__hint">{hint}</span>}
    </div>
  );
}

export function Availability({ label, state }: { label: string; state: "implemented" | "partial" | "planned" | "not_configured" }) {
  const text = { implemented: "Implemented", partial: "Partially available", planned: "Planned", not_configured: "Integration not configured" }[state];
  const Icon = state === "implemented" ? Check : TriangleAlert;
  return <span className={`avail avail--${state}`} title={label}><Icon size={12} aria-hidden="true" />{text}</span>;
}
