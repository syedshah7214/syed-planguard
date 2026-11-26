import { BookOpen, ExternalLink, Terminal, Workflow } from "lucide-react";
import { Card, CardHead, JsonBlock, PageHeader } from "../components/ui";
import { API_BASE } from "../lib/api";

const ACTION = `# .github/workflows/terraform.yml
name: terraform
on: pull_request
permissions:
  contents: read
jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - run: terraform init -input=false
      - run: terraform plan -input=false -out tfplan
      - run: terraform show -json tfplan > plan.json
      - uses: syedshah7214/syed-planguard@main   # composite action in this repo
        with:
          plan-file: plan.json
          budget: "50"
          fail-on: high`;

export default function CiDocs() {
  return (
    <div className="stack-lg">
      <PageHeader eyebrow="Integrate" title="CI Integration" description="PlanGuard is built to run between terraform plan and terraform apply. The same engine powers the CLI, the GitHub Action and this dashboard."
        actions={<a className="btn" href={`${API_BASE}/docs`} target="_blank" rel="noreferrer">API docs <ExternalLink size={13} /></a>} />
      <section className="grid grid--2">
        <Card>
          <CardHead icon={<Terminal size={17} />} title="Command line" />
          <JsonBlock label="shell" value={`cd backend\npython -m planguard plan.json --budget 50 --fail-on high\npython -m planguard plan.json --format markdown > comment.md\npython -m planguard plan.json --format json`} />
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Exit code</th><th>Meaning</th></tr></thead>
            <tbody><tr><td className="mono">0</td><td>PASS or WARN — apply may continue</td></tr><tr><td className="mono">1</td><td>FAIL — stop the pipeline</td></tr><tr><td className="mono">2</td><td>Invalid input (not a Terraform JSON plan)</td></tr></tbody>
          </table></div>
        </Card>
        <Card>
          <CardHead icon={<Workflow size={17} />} title="GitHub Actions" sub="action.yml in the repository root" />
          <JsonBlock label="yaml" value={ACTION} />
          <p className="muted small">The action writes a Markdown report to the job summary and fails the job on FAIL. No cloud credentials are needed to analyse a plan.</p>
        </Card>
      </section>
      <Card>
        <CardHead icon={<BookOpen size={17} />} title="How this repository tests itself" />
        <ul className="reasons">
          <li>Unit and API tests (pytest) with a coverage gate, ruff lint, ESLint and a TypeScript build.</li>
          <li>A <code>terraform plan</code> job builds real plans from <code>examples/terraform/secure</code> and <code>insecure</code> using placeholder credentials — no AWS account is touched.</li>
          <li>PlanGuard must PASS the secure plan and FAIL the insecure one; otherwise the pipeline fails.</li>
          <li>Secret scanning (gitleaks) and dependency audits (pip-audit, npm audit).</li>
        </ul>
      </Card>
    </div>
  );
}
