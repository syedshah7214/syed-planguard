import { ListChecks, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, CardHead, ErrorState, PageHeader, Segmented, SevBadge, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { titleCase } from "../lib/format";
import { useAsync } from "../lib/hooks";
import { useRoute } from "../lib/router";

export default function Policies() {
  const { query } = useRoute();
  const rules = useAsync((sig) => api.rules(sig), []);
  const [q, setQ] = useState(query.get("q") ?? "");
  const [cat, setCat] = useState("all");
  const shown = useMemo(() => (rules.data ?? []).filter((r) => (cat === "all" || r.category === cat) &&
    `${r.id} ${r.title} ${r.remediation}`.toLowerCase().includes(q.toLowerCase())), [rules.data, q, cat]);
  return (
    <div className="stack-lg">
      <PageHeader eyebrow="Policy as code" title="Policy Rules" description={<>Every rule lives in <code>backend/planguard/rules.py</code> with a stable ID, severity, remediation and reference, so a CI log line is actionable on its own.</>} />
      <Card>
        <CardHead icon={<ListChecks size={17} />} title={rules.data ? `${shown.length} of ${rules.data.length} rules` : "Rules"}
          actions={<div className="filters">
            <label className="input"><Search size={14} aria-hidden="true" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rules" aria-label="Search rules" /></label>
            <Segmented label="Category" value={cat} onChange={setCat} options={["all", "security", "cost", "reliability", "change-safety"].map((c) => ({ value: c, label: c === "all" ? "All" : titleCase(c) }))} />
          </div>} />
        {rules.error ? <ErrorState error={rules.error} onRetry={rules.reload} /> : !rules.data ? <Skeleton h={300} /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>ID</th><th>Severity</th><th>Rule</th><th>Category</th><th>Remediation</th><th>Reference</th></tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.id}><td className="mono small">{r.id}</td><td><SevBadge s={r.severity} /></td><td>{r.title}</td><td className="small">{r.category}</td><td className="small wrap">{r.remediation}</td><td className="small wrap muted">{r.reference}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
