import { useId } from "react";

/** SYED monogram: hexagon (infrastructure node) wrapping an S drawn as a circuit trace. */
export function Monogram({ size = 36, animated = false }: { size?: number; animated?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="SYED" className={animated ? "mono mono--animated" : "mono"}>
      <defs>
        <linearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00D9FF" />
          <stop offset=".55" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <path className="mono__hex" d="M32 3 57 17.5v29L32 61 7 46.5v-29z" fill="rgba(16,24,43,.85)" stroke={`url(#m${id})`} strokeWidth="3" />
      <path className="mono__s" d="M42 22H28a5 5 0 0 0 0 10h8a5 5 0 0 1 0 10H22" fill="none" stroke={`url(#m${id})`} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="mono__node" cx="42" cy="22" r="3.2" fill="#00D9FF" />
      <circle className="mono__node mono__node--b" cx="22" cy="42" r="3.2" fill="#8B5CF6" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="wordmark">
      <span className="wordmark__name">SYED</span>
      {!compact && <span className="wordmark__divider" aria-hidden="true" />}
      {!compact && <span className="wordmark__product">PlanGuard</span>}
    </div>
  );
}

/** Brief branded loader. It fades as soon as the first data arrives — it never adds an artificial delay. */
export function Splash({ leaving }: { leaving: boolean }) {
  return (
    <div className={`splash ${leaving ? "splash--leaving" : ""}`} role="status" aria-live="polite" aria-label="Loading PlanGuard">
      <div className="splash__inner">
        <Monogram size={84} animated />
        <p className="splash__title">SYED <span>PlanGuard</span></p>
        <p className="splash__sub">Terraform Cost &amp; Risk Gate</p>
        <div className="splash__bar" aria-hidden="true"><span /></div>
      </div>
    </div>
  );
}
