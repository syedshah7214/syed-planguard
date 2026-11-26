export type Decision = "PASS" | "WARN" | "FAIL";
export type Severity = "critical" | "high" | "medium" | "low";
export type Action = "create" | "update" | "replace" | "delete" | "no-op" | "read";

export interface Finding {
  rule_id: string;
  title: string;
  severity: Severity;
  category: "security" | "cost" | "reliability" | "change-safety";
  address: string;
  detail: string;
  remediation: string;
  reference: string;
}

export interface ResourceCost {
  address: string;
  type: string;
  action: Action;
  monthly_before: number | null;
  monthly_after: number | null;
  monthly_delta: number | null;
  basis: string;
  cost_kind: "fixed" | "usage_based" | "free" | "unknown";
}

export interface Report {
  tool_version: string;
  terraform_version: string | null;
  region: string;
  prices_as_of: string;
  decision: Decision;
  reasons: string[];
  summary: Record<Action, number>;
  cost: {
    monthly_before: number;
    monthly_after: number;
    monthly_delta: number;
    budget: number | null;
    budget_used: number | null;
    by_service: Record<string, number>;
    unpriced: string[];
    excludes: string;
  };
  resources: ResourceCost[];
  findings: Finding[];
  findings_by_severity: Record<Severity, number>;
  options: { budget_usd: number | null; fail_on: Severity };
}

export interface AnalysisSummary {
  id: number;
  name: string;
  source: "sample" | "upload" | "ci";
  decision: Decision;
  monthly_after: number;
  monthly_delta: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  resources: number;
  created_at: string;
}

export interface Page<T> { total: number; limit: number; offset: number; items: T[] }
export interface Sample { name: string; description: string; resources: number }
export interface Rule { id: string; title: string; severity: Severity; category: Finding["category"]; remediation: string; reference: string }
export interface Stats { analyses: number; pass: number; warn: number; fail: number; critical_findings: number; high_findings: number; blocked_monthly_usd: number }
export interface PriceTable {
  region: string;
  as_of: string;
  hours_per_month: number;
  ec2_hourly: Record<string, number>;
  rds_hourly_single_az: Record<string, number>;
  elasticache_hourly: Record<string, number>;
  ebs_gb_month: Record<string, number>;
  rds_storage_gb_month: Record<string, number>;
  flat_monthly: Record<string, { usd: number; basis: string }>;
  usage_based: string[];
  excluded: string[];
}
