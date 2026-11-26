import { ArrowLeft } from "lucide-react";
import { ReportView } from "../components/report";
import { EmptyState, ErrorState, PageHeader, SkeletonCard } from "../components/ui";
import { api } from "../lib/api";
import { ago } from "../lib/format";
import { useAsync } from "../lib/hooks";
import { useRoute } from "../lib/router";

export default function ReportPage() {
  const { query } = useRoute();
  const id = Number(query.get("id"));
  const a = useAsync((sig) => (id ? api.analysis(id, sig) : Promise.resolve(null)), [id]);
  if (!id) return <EmptyState title="No analysis selected"><a href="#/analyze">Analyze a plan</a> or open one from the <a href="#/">Overview</a>.</EmptyState>;
  return (
    <div className="stack-lg">
      <PageHeader eyebrow={`Analysis #${id}`} title={a.data?.name ?? "Loading report…"}
        description={a.data ? <>Source: <b>{a.data.source}</b> · analysed {ago(a.data.created_at)} · prices are estimates (see <a href="#/pricing">Price Table</a>)</> : undefined}
        actions={<a className="btn" href="#/analyze"><ArrowLeft size={14} /> Analyze another plan</a>} />
      {a.error ? <ErrorState error={a.error} onRetry={a.reload} /> : !a.data ? <><SkeletonCard lines={4} /><SkeletonCard lines={6} /></> : <ReportView report={a.data.report} id={a.data.id} name={a.data.name} />}
    </div>
  );
}
