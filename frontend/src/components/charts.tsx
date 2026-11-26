import { useId, useMemo, useState, type ReactNode } from "react";
import { useWidth } from "../lib/hooks";

/* ------------------------------------------------------------------ Donut */

export function Donut({ value, size = 168, stroke = 14, tone, label, sub }: { value: number | null; size?: number; stroke?: number; tone: string; label: ReactNode; sub?: string }) {
  const id = useId().replace(/:/g, "");
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id={`dg${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={tone} />
            <stop offset="1" stopColor="var(--violet)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} className="donut__track" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#dg${id})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="donut__value" />
      </svg>
      <div className="donut__label">
        <strong>{label}</strong>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Sparkline */

export function Sparkline({ values, tone = "var(--cyan)", height = 36, label }: { values: (number | null)[]; tone?: string; height?: number; label: string }) {
  const id = useId().replace(/:/g, "");
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <div className="spark-empty small muted" style={{ height }}>Not enough history</div>;
  const w = 160;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pts = values.map((v, i) => (v === null ? null : [(i / (values.length - 1)) * w, height - 3 - ((v - min) / span) * (height - 6)] as const));
  const segs: string[] = [];
  let cur = "";
  pts.forEach((p) => {
    if (!p) { if (cur) segs.push(cur); cur = ""; return; }
    cur += `${cur ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  const first = pts.find(Boolean)!;
  const last = [...pts].reverse().find(Boolean)!;
  const area = `${segs.join("")}L${last[0]},${height}L${first[0]},${height}Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} style={{ height }}>
      <defs>
        <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tone} stopOpacity=".3" /><stop offset="1" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>
      {segs.length === 1 && <path d={area} fill={`url(#sp${id})`} />}
      {segs.map((d, i) => <path key={i} d={d} fill="none" stroke={tone} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />)}
      {pts.map((p, i) => p && !pts[i - 1] && !pts[i + 1] ? <circle key={`p${i}`} cx={p[0]} cy={p[1]} r="2.2" fill={tone} /> : null)}
    </svg>
  );
}

/* ------------------------------------------------------------------ Line / area chart */

export interface Series { name: string; color: string; values: (number | null)[]; area?: boolean }
export interface Threshold { value: number; label: string; color: string }

export function LineChart({
  labels, series, height = 220, yFormat = (v) => String(v), thresholds = [], yMin, yMax, xFormat = (l) => l, ariaLabel,
}: {
  labels: string[]; series: Series[]; height?: number; yFormat?: (v: number) => string; thresholds?: Threshold[];
  yMin?: number; yMax?: number; xFormat?: (l: string) => string; ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");
  const w = Math.max(width, 280);
  const pad = { l: 48, r: 12, t: 12, b: 26 };

  const { lo, hi } = useMemo(() => {
    const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
    thresholds.forEach((t) => all.push(t.value));
    let lo = yMin ?? Math.min(...all, 0);
    let hi = yMax ?? Math.max(...all, 1e-9);
    if (hi === lo) hi = lo + 1;
    if (yMax === undefined) hi += (hi - lo) * 0.08;
    if (yMin === undefined && lo > 0) lo = Math.max(0, lo - (hi - lo) * 0.08);
    return { lo, hi };
  }, [series, thresholds, yMin, yMax]);

  const empty = labels.length === 0 || series.every((s) => s.values.every((v) => v === null));
  const x = (i: number) => pad.l + (labels.length <= 1 ? 0 : (i / (labels.length - 1)) * (w - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * (height - pad.t - pad.b);
  const ticks = [...new Set([lo, lo + (hi - lo) / 2, hi])];
  const xTicks = [...new Set(labels.length > 1 ? [0, Math.floor((labels.length - 1) / 2), labels.length - 1] : [0])];

  const path = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    const i = Math.round(((px - pad.l) / (w - pad.l - pad.r)) * (labels.length - 1));
    setHover(Math.max(0, Math.min(labels.length - 1, i)));
  };

  return (
    <div className="chart" ref={ref}>
      {empty ? (
        <div className="chart-empty muted small" style={{ height }}>No data points in this range yet.</div>
      ) : (
        <>
          <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img" aria-label={ariaLabel}
            onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.name} id={`lg${uid}${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={s.color} stopOpacity=".28" /><stop offset="1" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="gridline" />
                <text x={pad.l - 8} y={y(t) + 4} className="axis" textAnchor="end">{yFormat(t)}</text>
              </g>
            ))}
            {xTicks.map((i) => (
              <text key={i} x={x(i)} y={height - 6} className="axis" textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}>{xFormat(labels[i])}</text>
            ))}
            {thresholds.map((t) => (
              <g key={t.label}>
                <line x1={pad.l} x2={w - pad.r} y1={y(t.value)} y2={y(t.value)} stroke={t.color} strokeDasharray="5 5" strokeWidth="1" opacity=".75" />
                <text x={w - pad.r - 4} y={y(t.value) - 5} className="axis" textAnchor="end" fill={t.color}>{t.label}</text>
              </g>
            ))}
            {series.map((s, i) => {
              const d = path(s.values);
              const firstIdx = s.values.findIndex((v) => v !== null);
              const lastIdx = s.values.length - 1 - [...s.values].reverse().findIndex((v) => v !== null);
              const contiguous = s.values.slice(firstIdx, lastIdx + 1).every((v) => v !== null);
              return (
                <g key={s.name}>
                  {s.area && contiguous && firstIdx >= 0 && (
                    <path d={`${d}L${x(lastIdx)},${height - pad.b}L${x(firstIdx)},${height - pad.b}Z`} fill={`url(#lg${uid}${i})`} />
                  )}
                  <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" className="chart__line" />
                </g>
              );
            })}
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} className="crosshair" />
                {series.map((s) => s.values[hover] !== null && (
                  <circle key={s.name} cx={x(hover)} cy={y(s.values[hover] as number)} r="4" fill={s.color} stroke="var(--bg)" strokeWidth="2" />
                ))}
              </g>
            )}
          </svg>
          {hover !== null && (
            <div className="chart-tip" style={{ left: `${(x(hover) / w) * 100}%` }} role="status">
              <b>{xFormat(labels[hover])}</b>
              {series.map((s) => (
                <span key={s.name}><i style={{ background: s.color }} />{s.name}: <b>{s.values[hover] === null ? "—" : yFormat(s.values[hover] as number)}</b></span>
              ))}
            </div>
          )}
        </>
      )}
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}
          {thresholds.map((t) => <span key={t.label}><i className="legend__dash" style={{ borderColor: t.color }} />{t.label}</span>)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Stacked bars */

export function StackedBars({ data, height = 200, ariaLabel }: { data: { label: string; a: number; b: number }[]; height?: number; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const w = Math.max(width, 280);
  const pad = { l: 32, r: 8, t: 10, b: 24 };
  if (!data.length) return <div className="chart-empty muted small" ref={ref} style={{ height }}>No deployments in this range.</div>;
  const max = Math.max(1, ...data.map((d) => d.a + d.b));
  const bw = (w - pad.l - pad.r) / data.length;
  const sy = (v: number) => ((height - pad.t - pad.b) * v) / max;
  const ticks = [...new Set([0, Math.ceil(max / 2), max])];
  const active = hover === null ? null : data[hover];
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img" aria-label={ariaLabel} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={height - pad.b - sy(t)} y2={height - pad.b - sy(t)} className="gridline" />
            <text x={pad.l - 8} y={height - pad.b - sy(t) + 4} className="axis" textAnchor="end">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + i * bw + bw * 0.2;
          const bwi = Math.max(2, bw * 0.6);
          return (
            <g key={d.label} onPointerEnter={() => setHover(i)} className={hover === i ? "bar bar--on" : "bar"}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={height - pad.t - pad.b} fill="transparent" />
              <rect x={x} y={height - pad.b - sy(d.a)} width={bwi} height={sy(d.a)} rx="2" className="bar__a" />
              {d.b > 0 && <rect x={x} y={height - pad.b - sy(d.a) - sy(d.b) - 1} width={bwi} height={sy(d.b)} rx="2" className="bar__b" />}
            </g>
          );
        })}
        {[...new Set([0, Math.floor(data.length / 2), data.length - 1])].map((i) => (
          <text key={i} x={pad.l + i * bw + bw / 2} y={height - 6} className="axis" textAnchor="middle">{data[i].label.slice(5)}</text>
        ))}
      </svg>
      <div className="legend">
        <span><i style={{ background: "var(--cyan)" }} />Successful</span>
        <span><i style={{ background: "var(--red)" }} />Failed / rolled back</span>
        <span className="legend__readout mono">{active ? `${active.label}: ${active.a} ok · ${active.b} failed` : "Hover a bar for details"}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Threshold meter */

export function BudgetMeter({ value, warnBelow }: { value: number | null; warnBelow: number }) {
  const v = value === null ? null : Math.max(-0.2, Math.min(1, value));
  const pos = (n: number) => `${((n + 0.2) / 1.2) * 100}%`;
  const tone = value === null ? "var(--muted)" : value <= 0 ? "var(--red)" : value < warnBelow ? "var(--amber)" : "var(--green)";
  return (
    <div className="meter" role="img" aria-label={`Budget remaining ${value === null ? "unknown" : `${(value * 100).toFixed(1)}%`}; block at 0%, warn below ${(warnBelow * 100).toFixed(0)}%`}>
      <div className="meter__track">
        <span className="meter__zone meter__zone--block" style={{ left: 0, width: pos(0) }} />
        <span className="meter__zone meter__zone--warn" style={{ left: pos(0), width: `calc(${pos(warnBelow)} - ${pos(0)})` }} />
        {v !== null && <span className="meter__fill" style={{ width: pos(v), background: tone }} />}
        <span className="meter__tick" style={{ left: pos(0) }}><em>0% BLOCK</em></span>
        <span className="meter__tick" style={{ left: pos(warnBelow) }}><em>{(warnBelow * 100).toFixed(0)}% WARN</em></span>
      </div>
    </div>
  );
}
