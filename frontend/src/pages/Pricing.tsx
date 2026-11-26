import { ReceiptText } from "lucide-react";
import { Card, CardHead, ErrorState, PageHeader, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { usd } from "../lib/format";
import { useAsync } from "../lib/hooks";

function RateTable({ title, rows, unit, hours }: { title: string; rows: Record<string, number>; unit: string; hours?: number }) {
  return (
    <Card>
      <CardHead title={title} />
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Type</th><th>Rate</th>{hours && <th>≈ per month</th>}</tr></thead>
        <tbody>{Object.entries(rows).map(([k, v]) => <tr key={k}><td className="mono small">{k}</td><td className="mono">${v} {unit}</td>{hours && <td className="mono muted">{usd(v * hours)}</td>}</tr>)}</tbody>
      </table></div>
    </Card>
  );
}

export default function Pricing() {
  const p = useAsync((sig) => api.pricing(sig), []);
  return (
    <div className="stack-lg">
      <PageHeader eyebrow="Transparency" title="Price Table"
        description={p.data ? <>AWS on-demand <b>list prices</b>, {p.data.region}, checked {p.data.as_of}, {p.data.hours_per_month} hours per month. These are estimates: confirm with the AWS Pricing Calculator before committing to a design.</> : undefined} />
      {p.error ? <ErrorState error={p.error} onRetry={p.reload} /> : !p.data ? <Skeleton h={400} /> : (
        <>
          <Card className="notice">
            <CardHead icon={<ReceiptText size={17} />} title="Not included in estimates" />
            <ul className="reasons">{p.data.excluded.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className="muted small">Usage-based resources (shown as $0 fixed): {p.data.usage_based.join(", ")}.</p>
          </Card>
          <section className="grid grid--2">
            <RateTable title="EC2 (Linux, per hour)" rows={p.data.ec2_hourly} unit="/h" hours={p.data.hours_per_month} />
            <RateTable title="RDS MySQL/PostgreSQL, single-AZ (per hour)" rows={p.data.rds_hourly_single_az} unit="/h" hours={p.data.hours_per_month} />
            <RateTable title="EBS volumes (per GB-month)" rows={p.data.ebs_gb_month} unit="/GB-mo" />
            <RateTable title="ElastiCache (per hour)" rows={p.data.elasticache_hourly} unit="/h" hours={p.data.hours_per_month} />
          </section>
          <Card>
            <CardHead title="Fixed monthly charges" />
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Resource type</th><th>Monthly</th><th>Basis</th></tr></thead>
              <tbody>{Object.entries(p.data.flat_monthly).map(([k, v]) => <tr key={k}><td className="mono small">{k}</td><td className="mono">{usd(v.usd)}</td><td className="small wrap muted">{v.basis}</td></tr>)}</tbody>
            </table></div>
          </Card>
        </>
      )}
    </div>
  );
}
