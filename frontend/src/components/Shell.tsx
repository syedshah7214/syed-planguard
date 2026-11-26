import { ChevronsLeft, ChevronsRight, Menu, RefreshCw, Search, Wifi, WifiOff, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { NAV } from "../lib/nav";
import { usePrefs } from "../lib/prefs";
import { useRoute } from "../lib/router";
import { useStatus } from "../lib/status";
import { Monogram, Wordmark } from "./Brand";

function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { prefs, set } = usePrefs();
  const { path } = useRoute();
  const collapsed = prefs.sidebarCollapsed;
  return (
    <>
      <div className={`scrim ${mobileOpen ? "scrim--on" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar ${collapsed ? "sidebar--collapsed" : ""} ${mobileOpen ? "sidebar--open" : ""}`} aria-label="Main navigation">
        <div className="sidebar__brand">
          <a href="#/" className="sidebar__logo" aria-label="SYED PlanGuard — Overview"><Monogram size={34} />{!collapsed && <Wordmark />}</a>
          <button className="icon-btn sidebar__close" onClick={onClose} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <nav className="sidebar__nav">
          {NAV.map((g) => (
            <div key={g.label} className="navgroup">
              <p className="navgroup__label">{collapsed ? "·" : g.label}</p>
              <ul>
                {g.items.map((it) => {
                  const active = it.path === path || (it.path === "/analyze" && path === "/report");
                  const Icon = it.icon;
                  return (
                    <li key={it.path}>
                      <a href={`#${it.path}`} className={`navlink ${active ? "navlink--active" : ""}`} aria-current={active ? "page" : undefined} onClick={onClose} data-tip={collapsed ? it.label : undefined}>
                        <Icon size={18} aria-hidden="true" /><span className="navlink__label">{it.label}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <button className="sidebar__collapse" onClick={() => set("sidebarCollapsed", !collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} /><span>Collapse</span></>}
        </button>
      </aside>
    </>
  );
}

export function Shell({ children, onSearch }: { children: ReactNode; onSearch: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { prefs } = usePrefs();
  const { connectivity, version, bump, check } = useStatus();
  return (
    <div className={`shell ${prefs.sidebarCollapsed ? "shell--collapsed" : ""}`}>
      <a className="skip" href="#main">Skip to content</a>
      <div className="ambient" aria-hidden="true" />
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="shell__main">
        <header className="topbar">
          <button className="icon-btn icon-btn--lg topbar__menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <button className="searchbox" onClick={onSearch} aria-label="Search and commands (Ctrl+K)">
            <Search size={15} aria-hidden="true" /><span>Search pages, analyses, rules…</span><kbd>Ctrl K</kbd>
          </button>
          <div className="topbar__status">
            <span className="badge badge--muted mono" title="Default policy used for new analyses (change in Analyze)">Budget ${prefs.budget}/mo · fail on {prefs.failOn}</span>
            <span className={`conn conn--${connectivity}`} title={version ? `API v${version}` : "API status"}>
              {connectivity === "offline" ? <WifiOff size={14} /> : <Wifi size={14} />}<span className="conn__label">API {connectivity}</span>
            </span>
            <button className="btn btn--ghost" onClick={() => { check(); bump(); }} aria-label="Refresh data"><RefreshCw size={14} /><span className="btn__label">Refresh</span></button>
          </div>
        </header>
        <main id="main" className="page" tabIndex={-1}>{children}</main>
        <footer className="footer">
          <span className="footer__brand"><Monogram size={20} /> <b>SYED</b> · Cloud &amp; DevOps Engineering</span>
          <span className="muted small">PlanGuard · Terraform · FastAPI · React · GitHub Actions</span>
        </footer>
      </div>
    </div>
  );
}
