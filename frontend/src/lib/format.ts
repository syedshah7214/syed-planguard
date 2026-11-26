export const usd = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined ? "—" : `$${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const signedUsd = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${usd(Math.abs(v))}`;

export const pct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? "—" : `${(v * 100).toFixed(digits)}%`;

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function downloadText(filename: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const titleCase = (s: string) => s.replace(/(^|[-_ ])(\w)/g, (_, sp, c) => `${sp === "-" || sp === "_" ? " " : sp}${c.toUpperCase()}`);
