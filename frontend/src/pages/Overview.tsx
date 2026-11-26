import { ArrowRight, FileSearch, History, Play } from "lucide-react";
import { useState } from "react";
import { useToast } from "../components/Toasts";
import { Card, CardHead, DecisionPill, EmptyState, ErrorState, Pagination, Skeleton, Stat } from "../components/ui";
import { api } from "../lib/api";
import { ago, signedUsd, titleCase, usd } from "../lib/format";
import { useAsync } from "../lib/hooks";
import { usePrefs } from "../lib/prefs";
import { navigate } from "../lib/router";
import { useStatus } from "../lib/status";

const FLOW = [
  ["terraform plan", "-out tfplan"], ["terraform show", "-json > plan.json"], ["PlanGuard", "cost + 18 policy rules"],
  ["Gate", "PASS · WARN · FAIL"], ["terraform apply", "only if not FAIL"],
];

export default function Overview() {
  const { tick, bump } = useStatus();
  const { prefs } = usePrefs();
  const toast = useToast();
  const [offset, setOffset] = useState(0);
  const [running, setRunning] = useState<string | null>(null);
  const stats = useAsync((sig) => api.stats(sig), [tick]);
  const hist = useAsync((sig) => api.analyses(8, offset, sig), [tick, offset]);
  const latest = hist.data?.items[0];

  const runSample = async (name: string) => {
    setRunning(name);
    try {
      const plan = await api.sample(name);
      const r = await api.analyze({ plan, name: titleCase(name), source: "sample", budget_usd: prefs.budget, fail_on: prefs.failOn });
      bump();
      navigate(`/report?id=${r.id}`);
    } catch (e) {
      toast.push({ tone: "error", title: "Analysis failed", body: (e as Error).message });
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="stack-lg">
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">Terraform Cost &amp; Risk Gate</p>
          <h1>SYED <span className="grad">PlanGuard</span></h1>
          <p className="hero__tagline">Catch the AWS bill and the security hole before <code>terraform apply</code>.</p>
          <p className="hero__lede">PlanGuard reads a Terraform plan, estimates the monthly AWS cost, runs 18 security, cost and change-safety rules, and gives your pipeline a single answer: <b>PASS</b>, <b>WARN</b> or <b>FAIL</b>.</p>
          <div className="chips">
            <button className="btn btn--primary" onClick={() => navigate("/analyze")}><FileSearch size={15} /> Analyze a plan</button>
            <button className="btn" onClick={() => runSample("risky-startup-stack")} disabled={!!running}><Play size={15} />{running ? "Running…" : "Try the risky sample"}</button>
          </div>
        </div>
        <Card className="flowcard">
          <CardHead title="Where it runs" sub="In CI, between plan and apply" />
          <ol className="vflow">
            {FLOW.map(([a, b], i) => <li key={a} className={i === 3 ? "vflow__gate" : ""}><span className="vflow__n">{i + 1}</span><span><b>{a}</b><small className="mono">{b}</small></span></li>)}
          </ol>
        </Card>
      </section>

      <section className="grid grid--4" aria-label="History statistics">
        {!stats.data ? Array.from({ length: 4 }, (_, i) => <Card key={i}><Skeleton h={50} /></Card>) : <>
          <Card><Stat label="Plans analysed" value={stats.data.analyses} hint={`${stats.data.pass} pass · ${stats.data.warn} warn · ${stats.data.fail} fail`} /></Card>
          <Card><Stat label="Plans blocked" value={stats.data.fail} tone={stats.data.fail ? "bad" : "ok"} hint="would have stopped terraform apply" /></Card>
          <Card><Stat label="Critical + high findings" value={stats.data.critical_findings + stats.data.high_findings} tone={stats.data.critical_findings ? "bad" : undefined} hint="caught before reaching AWS" /></Card>
          <Card><Stat label="Monthly cost in blocked plans" value={usd(stats.data.blocked_monthly_usd, 0)} tone="warn" hint="projected, list prices" /></Card>
        </>}
      </section>
      {stats.error && <ErrorState error={stats.error} onRetry={stats.reload} />}

      <section className="grid grid--split">
        <Card>
          <CardHead icon={<History size={17} />} title="Analysis history" sub="Stored locally by your PlanGuard API" />
          {hist.error ? <ErrorState error={hist.error} onRetry={hist.reload} /> : !hist.data ? <Skeleton h={240} /> : hist.data.total === 0 ? (
            <EmptyState title="No plans analysed yet">Run a sample or upload your own <code>plan.json</code>.</EmptyState>
          ) : (
            <>
              <div className="table-wrap"><table className="table table--rows">
                <thead><tr><th>#</th><th>Plan</th><th>Decision</th><th>Monthly</th><th>Δ</th><th>Crit/High</th><th>When</th></tr></thead>
                <tbody>{hist.data.items.map((a) => (
                  <tr key={a.id} className="clickable" tabIndex={0} onClick={() => navigate(`/report?id=${a.id}`)} onKeyDown={(e) => { if (e.key === "Enter") navigate(`/report?id=${a.id}`); }}>
                    <td className="mono muted">{a.id}</td><td>{a.name} <span className="srcdot srcdot--demo">{a.source}</span></td>
                    <td><DecisionPill d={a.decision} /></td><td className="mono">{usd(a.monthly_after)}</td>
                    <td className="mono muted">{signedUsd(a.monthly_delta)}</td><td className={`mono ${a.critical + a.high ? "bad" : ""}`}>{a.critical}/{a.high}</td><td className="muted small">{ago(a.created_at)}</td>
                  </tr>))}</tbody>
              </table></div>
              <Pagination total={hist.data.total} limit={hist.data.limit} offset={hist.data.offset} onChange={setOffset} />
            </>
          )}
        </Card>
        <div className="stack">
          <Card>
            <CardHead title="Latest decision" />
            {!latest ? <p className="muted small">Nothing analysed yet.</p> : (
              <div className="latest">
                <DecisionPill d={latest.decision} size="lg" />
                <p><b>{latest.name}</b><br /><span className="muted small">{usd(latest.monthly_after)}/month · {latest.critical} critical · {latest.high} high · {ago(latest.created_at)}</span></p>
                <a className="link" href={`#/report?id=${latest.id}`}>Open report <ArrowRight size={13} /></a>
              </div>
            )}
          </Card>
          <Card>
            <CardHead title="Quick samples" sub="Hand-written demo plans" />
            <div className="stack-sm">
              {["risky-startup-stack", "student-lab-secure", "prod-db-replacement", "kubernetes-cost-spike"].map((s) => (
                <button key={s} className="samplerow" onClick={() => runSample(s)} disabled={!!running}><Play size={13} />{titleCase(s)}{running === s && <span className="muted small"> running…</span>}</button>
              ))}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
