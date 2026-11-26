import type { AnalysisSummary, Page, PriceTable, Report, Rule, Sample, Stats } from "./types";

export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15_000);
  init.signal?.addEventListener("abort", () => ctrl.abort());
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...init, signal: ctrl.signal, headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) } });
    const text = await res.text();
    let data: unknown = text;
    try { data = text ? JSON.parse(text) : null; } catch { /* plain text */ }
    if (!res.ok) {
      const detail = (data as { detail?: unknown })?.detail;
      if (typeof detail === "string") throw new ApiError(detail, res.status);
      if (Array.isArray(detail)) throw new ApiError(detail.map((d: { msg?: string }) => d.msg).join("; "), res.status);
      if ([502, 503, 504].includes(res.status)) throw new ApiError("API unreachable — is the PlanGuard API running on port 8100?", res.status);
      throw new ApiError(`API responded ${res.status}`, res.status);
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (init.signal?.aborted) throw err;
    throw new ApiError("API unreachable — is the PlanGuard API running on port 8100?", null);
  } finally {
    clearTimeout(timer);
  }
}

export interface AnalyzeBody { plan: unknown; name: string; source: "sample" | "upload" | "ci"; budget_usd: number | null; fail_on: string; save?: boolean }

export const api = {
  health: (signal?: AbortSignal) => request<{ status: string; version: string }>("/health", { signal, timeoutMs: 4000 }),
  samples: (signal?: AbortSignal) => request<Sample[]>("/api/v1/samples", { signal }),
  sample: (name: string, signal?: AbortSignal) => request<unknown>(`/api/v1/samples/${encodeURIComponent(name)}`, { signal }),
  rules: (signal?: AbortSignal) => request<Rule[]>("/api/v1/rules", { signal }),
  pricing: (signal?: AbortSignal) => request<PriceTable>("/api/v1/pricing", { signal }),
  stats: (signal?: AbortSignal) => request<Stats>("/api/v1/stats", { signal }),
  analyses: (limit: number, offset: number, signal?: AbortSignal) => request<Page<AnalysisSummary>>(`/api/v1/analyses?limit=${limit}&offset=${offset}`, { signal }),
  analysis: (id: number, signal?: AbortSignal) => request<{ id: number; name: string; source: string; created_at: string; report: Report }>(`/api/v1/analyses/${id}`, { signal }),
  markdown: (id: number, signal?: AbortSignal) => request<string>(`/api/v1/analyses/${id}/markdown`, { signal }),
  analyze: (body: AnalyzeBody) => request<{ id: number | null; name: string; report: Report }>("/api/v1/analyze", { method: "POST", body: JSON.stringify(body), timeoutMs: 30_000 }),
};
