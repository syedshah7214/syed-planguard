import { FileJson, FlaskConical, Play, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useToast } from "../components/Toasts";
import { Card, CardHead, ErrorState, PageHeader, Segmented, Select, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { titleCase, usd } from "../lib/format";
import { useAsync } from "../lib/hooks";
import { usePrefs, type Prefs } from "../lib/prefs";
import { navigate } from "../lib/router";
import { useStatus } from "../lib/status";

type Mode = "sample" | "paste" | "upload";
const MAX = 5 * 1024 * 1024;

export default function Analyze() {
  const { prefs, set } = usePrefs();
  const { bump } = useStatus();
  const toast = useToast();
  const samples = useAsync((sig) => api.samples(sig), []);
  const [mode, setMode] = useState<Mode>("sample");
  const [sample, setSample] = useState("risky-startup-stack");
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [name, setName] = useState("");
  const [noBudget, setNoBudget] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (f.size > MAX) { setError("File is larger than 5 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setFile({ name: f.name, text: String(reader.result) });
    reader.onerror = () => setError("Could not read the file.");
    reader.readAsText(f);
  };

  const run = async (override?: string) => {
    setBusy(true);
    setError(null);
    try {
      const m: Mode = override ? "sample" : mode;
      const sampleName = override ?? sample;
      let plan: unknown;
      let label = name.trim();
      if (m === "sample") { plan = await api.sample(sampleName); label ||= titleCase(sampleName); }
      else if (m === "paste") {
        if (!text.trim()) throw new Error("Paste the output of `terraform show -json tfplan` first.");
        plan = text; label ||= "Pasted plan";
      } else {
        if (!file) throw new Error("Choose a plan JSON file first.");
        plan = file.text; label ||= file.name;
      }
      const res = await api.analyze({ plan, name: label, source: m === "sample" ? "sample" : "upload", budget_usd: noBudget ? null : prefs.budget, fail_on: prefs.failOn });
      toast.push({ tone: res.report.decision === "PASS" ? "success" : res.report.decision === "WARN" ? "warn" : "error", title: `${label}: ${res.report.decision}`, body: res.report.reasons[0] });
      bump();
      navigate(`/report?id=${res.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack-lg">
      <PageHeader eyebrow="Analyze" title="Analyze a Terraform plan"
        description={<>Generate the input with <code>terraform plan -out tfplan</code> then <code>terraform show -json tfplan &gt; plan.json</code>. The plan is analysed by the PlanGuard API and saved to your local history.</>} />
      <section className="grid grid--lab">
        <Card>
          <CardHead icon={<FlaskConical size={17} />} title="Policy" sub="Saved as your default" />
          <div className="form">
            <label className="field"><span>Monthly budget (USD)</span>
              <input type="number" min={0} step={5} value={prefs.budget} disabled={noBudget} onChange={(e) => set("budget", Math.max(0, Number(e.target.value)))} className="mono" />
            </label>
            <div className="presetrow">{[10, 50, 100, 500].map((b) => <button key={b} className={`chip ${prefs.budget === b && !noBudget ? "chip--ok" : ""}`} onClick={() => { setNoBudget(false); set("budget", b); }}>{usd(b, 0)}</button>)}</div>
            <label className="toggle"><input type="checkbox" checked={noBudget} onChange={(e) => setNoBudget(e.target.checked)} /><span>No budget limit for this run</span></label>
            <Select label="Fail the gate on findings at or above" value={prefs.failOn} onChange={(v) => set("failOn", v as Prefs["failOn"])}
              options={["critical", "high", "medium", "low"].map((s) => ({ value: s, label: s }))} />
            <label className="field"><span>Analysis name (optional)</span><input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. PR #42 — add RDS" /></label>
            <p className="muted small">FAIL = finding at/above the threshold or cost over budget · WARN = medium findings, ≥80% of budget, or unpriced resources.</p>
          </div>
        </Card>

        <Card>
          <CardHead icon={<FileJson size={17} />} title="Plan input" actions={<Segmented label="Input type" value={mode} onChange={setMode}
            options={[{ value: "sample", label: "Sample plans" }, { value: "paste", label: "Paste JSON" }, { value: "upload", label: "Upload file" }]} />} />
          {mode === "sample" && (samples.error ? <ErrorState error={samples.error} onRetry={samples.reload} /> : !samples.data ? <Skeleton h={220} /> : (
            <div className="samplegrid" role="radiogroup" aria-label="Sample plans">
              {samples.data.map((s) => (
                <button key={s.name} role="radio" aria-checked={sample === s.name} className={`samplecard ${sample === s.name ? "on" : ""}`} onClick={() => setSample(s.name)}>
                  <b>{titleCase(s.name)}</b><span className="muted small">{s.description}</span><span className="mono small">{s.resources} resource changes</span>
                </button>
              ))}
              <p className="badge badge--demo">Sample plans are hand-written in the official Terraform JSON plan format for demos.</p>
            </div>
          ))}
          {mode === "paste" && (
            <label className="field"><span>terraform show -json output</span>
              <textarea className="codearea" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} placeholder={'{\n  "format_version": "1.2",\n  "resource_changes": [ ... ]\n}'} />
            </label>
          )}
          {mode === "upload" && (
            <div className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}>
              <Upload size={26} aria-hidden="true" />
              <p>{file ? <><b>{file.name}</b> · {(file.text.length / 1024).toFixed(1)} KB ready</> : "Drop plan.json here"}</p>
              <button className="btn" onClick={() => fileRef.current?.click()}>Choose file</button>
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
              <p className="muted small">Read in your browser and sent only to your PlanGuard API. Max 5 MB.</p>
            </div>
          )}
          {error && <p className="formerror" role="alert">{error}</p>}
          <button className="btn btn--primary btn--block" onClick={() => run()} disabled={busy}><Play size={15} />{busy ? "Analysing…" : "Run PlanGuard"}</button>
        </Card>
      </section>
    </div>
  );
}
