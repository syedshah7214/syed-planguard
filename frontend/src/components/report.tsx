import { Check, Copy, Download, FileCode2, Layers, ShieldAlert, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { downloadText, pct, signedUsd, titleCase, usd } from "../lib/format";
import type { Finding, Report, Severity } from "../lib/types";
import { useToast } from "./Toasts";
import { Card, CardHead, DECISION_TEXT, DecisionPill, EmptyState, Expandable, JsonBlock, Segmented, SevBadge, Stat } from "./ui";

const SEVS: Severity[] = ["critical", "high", "medium", "low"];
const CATS = ["all", "security", "cost", "reliability", "change-safety"] as const;

export function BudgetBar({ used, budget, after }: { used: number | null; budget: number | null; after: number }) {
  if (!budget) return <p className="muted small">No budget set for this analysis.</p>;
  const v = Math.min(1.25, used ?? 0);
  const tone = (used ?? 0) > 1 ? "var(--red)" : (used ?? 0) >= 0.8 ? "var(--amber)" : "var(--green)";
  return (
    <div className="bbar" role="img" aria-label={`Projected ${usd(after)} of ${usd(budget)} budget`}>
      <div className="bbar__track">
        <span className="bbar__fill" style={{ width: `${(v / 1.25) * 100}%`, background: tone }} />
        <span className="bbar__tick" style={{ left: `${(0.8 / 1.25) * 100}%` }}><em>80% warn</em></span>
        <span className="bbar__tick bbar__tick--limit" style={{ left: `${(1 / 1.25) * 100}%` }}><em>budget</em></span>
      </div>
    </div>
  );
}

function FindingRow({ f }: { f: Finding }) {
  return (
    <Expandable title={<><SevBadge s={f.severity} /><span className="mono small">{f.rule_id}</span> {f.title}</>} meta={<code>{f.address}</code>}>
      <dl className="kv kv--stack">
        <div><dt>What we found</dt><dd>{f.detail}</dd></div>
        <div><dt>How to fix</dt><dd>{f.remediation}</dd></div>
        <div><dt>Reference</dt><dd>{f.reference} · category: {f.category}</dd></div>
      </dl>
    </Expandable>
  );
}

export function ReportView({ report, id, name }: { report: Report; id: number | null; name: string }) {
  const toast = useToast();
  const [cat, setCat] = useState<(typeof CATS)[number]>("all");
  const [copied, setCopied] = useState(false);
  const findings = useMemo(() => report.findings.filter((f) => cat === "all" || f.category === cat), [report, cat]);
  const services = Object.entries(report.cost.by_service);
  const maxSvc = Math.max(1, ...services.map(([, v]) => v));
  const c = report.cost;

  const copyComment = async () => {
    if (!id) return;
    try {
      const md = await api.markdown(id);
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast.push({ tone: "success", title: "PR comment copied", body: "Paste it into a pull request or issue." });
    } catch (e) {
      toast.push({ tone: "error", title: "Could not copy", body: (e as Error).message });
    }
  };

  return (
    <div className="stack-lg">
      <section className={`card verdictcard verdictcard--${report.decision.toLowerCase()}`} aria-live="polite">
        <div className="verdictcard__main">
          <p className="eyebrow">Gate decision · {name}</p>
          <div className="verdictcard__row">
            <DecisionPill d={report.decision} size="lg" />
            <span className="verdictcard__text">{DECISION_TEXT[report.decision]}</span>
          </div>
          <ul className="reasons">{report.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
        <div className="verdictcard__actions">
          {id && <button className="btn" onClick={copyComment}>{copied ? <Check size={14} /> : <Copy size={14} />} Copy PR comment</button>}
          <button className="btn" onClick={() => downloadText(`planguard-report-${id ?? "draft"}.json`, JSON.stringify(report, null, 2))}><Download size={14} /> Download JSON</button>
          <p className="muted small">fail on ≥ <b>{report.options.fail_on}</b> · budget {report.options.budget_usd ? `${usd(report.options.budget_usd, 0)}/mo` : "none"}</p>
        </div>
      </section>

      <section className="grid grid--4">
        <Card><Stat label="Projected monthly cost" value={usd(c.monthly_after)} hint={`${report.region} list prices · ${report.prices_as_of}`} /></Card>
        <Card><Stat label="Change vs. current" value={signedUsd(c.monthly_delta)} tone={c.monthly_delta > 0 ? "warn" : "ok"} hint={`was ${usd(c.monthly_before)}/mo`} /></Card>
        <Card>
          <Stat label="Budget used" value={c.budget ? pct(c.budget_used) : "—"} tone={(c.budget_used ?? 0) > 1 ? "bad" : (c.budget_used ?? 0) >= 0.8 ? "warn" : "ok"} hint={c.budget ? `of ${usd(c.budget, 0)}/month` : "no budget"} />
          <BudgetBar used={c.budget_used} budget={c.budget} after={c.monthly_after} />
        </Card>
        <Card>
          <Stat label="Findings" value={report.findings.length} tone={report.findings_by_severity.critical + report.findings_by_severity.high ? "bad" : report.findings.length ? "warn" : "ok"} />
          <div className="sevcounts">{SEVS.map((s) => <span key={s} className={`sevtag sevtag--${s}`}>{report.findings_by_severity[s]} {s}</span>)}</div>
        </Card>
      </section>

      <section className="grid grid--split">
        <Card>
          <CardHead icon={<ShieldAlert size={17} />} title="Policy findings" sub={`${report.findings.length} total · sorted by severity`}
            actions={<Segmented label="Category" value={cat} onChange={setCat} options={CATS.map((x) => ({ value: x, label: x === "all" ? "All" : titleCase(x) }))} />} />
          {findings.length === 0 ? <EmptyState title={report.findings.length ? "No findings in this category" : "No policy findings"}>{report.findings.length ? null : "Every rule passed for this plan."}</EmptyState>
            : <div className="stack-sm">{findings.map((f, i) => <FindingRow key={`${f.rule_id}-${f.address}-${i}`} f={f} />)}</div>}
        </Card>
        <div className="stack">
          <Card>
            <CardHead icon={<Layers size={17} />} title="Plan summary" sub={report.terraform_version ? `Terraform ${report.terraform_version}` : undefined} />
            <div className="actionchips">
              {(["create", "update", "replace", "delete"] as const).map((a) => <span key={a} className={`act act--${a}`}><b>{report.summary[a]}</b> {a}</span>)}
            </div>
          </Card>
          <Card>
            <CardHead icon={<Wallet size={17} />} title="Cost by service" sub="Projected monthly, fixed charges only" />
            {services.length === 0 ? <p className="muted small">No fixed monthly charges in this plan.</p> : (
              <ul className="svcbars">
                {services.map(([svc, v]) => (
                  <li key={svc}><span className="mono small">{svc}</span><span className="svcbars__track"><span style={{ width: `${(v / maxSvc) * 100}%` }} /></span><b className="mono small">{usd(v)}</b></li>
                ))}
              </ul>
            )}
            <p className="muted small">Not included: {c.excludes}.</p>
            {c.unpriced.length > 0 && <p className="small warnc">Could not price: {c.unpriced.join(", ")}</p>}
          </Card>
        </div>
      </section>

      <Card>
        <CardHead icon={<FileCode2 size={17} />} title="Resources" sub={`${report.resources.length} resource changes`} />
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Resource</th><th>Action</th><th>Monthly after</th><th>Δ / month</th><th>Pricing basis</th></tr></thead>
            <tbody>
              {report.resources.map((r) => (
                <tr key={r.address}>
                  <td className="mono small">{r.address}</td>
                  <td><span className={`act act--${r.action}`}>{r.action}</span></td>
                  <td className="mono">{r.cost_kind === "usage_based" ? <span className="muted">usage-based</span> : usd(r.monthly_after)}</td>
                  <td className={`mono ${r.monthly_delta && r.monthly_delta > 0 ? "warnc" : r.monthly_delta && r.monthly_delta < 0 ? "good" : "muted"}`}>{r.monthly_delta === null ? "—" : signedUsd(r.monthly_delta)}</td>
                  <td className="small wrap muted">{r.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {id && <PrComment id={id} />}
    </div>
  );
}

function PrComment({ id }: { id: number }) {
  const [md, setMd] = useState<string | null>(null);
  return (
    <Expandable title="Pull-request comment preview (Markdown)" defaultOpen={false}>
      {md === null ? <button className="btn" onClick={() => api.markdown(id).then(setMd).catch((e) => setMd(`Could not load: ${(e as Error).message}`))}>Load preview</button>
        : <JsonBlock label="markdown" value={md} />}
    </Expandable>
  );
}
