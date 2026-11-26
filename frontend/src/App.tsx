import { lazy, Suspense, useCallback, useEffect, useState, type ComponentType, type LazyExoticComponent } from "react";
import { Splash } from "./components/Brand";
import { CommandPalette } from "./components/CommandPalette";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Shell } from "./components/Shell";
import { ToastProvider } from "./components/Toasts";
import { EmptyState, SkeletonCard } from "./components/ui";
import { ALL_NAV } from "./lib/nav";
import { PrefsProvider } from "./lib/prefs";
import { useRoute } from "./lib/router";
import { StatusProvider, useStatus } from "./lib/status";

const PAGES: Record<string, LazyExoticComponent<ComponentType>> = {
  "/": lazy(() => import("./pages/Overview")),
  "/analyze": lazy(() => import("./pages/Analyze")),
  "/report": lazy(() => import("./pages/ReportPage")),
  "/policies": lazy(() => import("./pages/Policies")),
  "/pricing": lazy(() => import("./pages/Pricing")),
  "/ci": lazy(() => import("./pages/CiDocs")),
};

function Routed() {
  const { path } = useRoute();
  const Page = PAGES[path];
  const title = path === "/report" ? "Report" : ALL_NAV.find((n) => n.path === path)?.label;
  useEffect(() => { document.title = `${title ?? "Not found"} · SYED PlanGuard`; window.scrollTo(0, 0); }, [title]);
  if (!Page) return <EmptyState title="Page not found">That route does not exist. <a href="#/">Back to Overview</a>.</EmptyState>;
  return (
    <ErrorBoundary resetKey={path}>
      <Suspense fallback={<div className="grid grid--3" aria-busy="true"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>}>
        <div className="page-enter" key={path}><Page /></div>
      </Suspense>
    </ErrorBoundary>
  );
}

function Inner() {
  const { connectivity } = useStatus();
  const [palette, setPalette] = useState(false);
  const [splash, setSplash] = useState<"on" | "leaving" | "off">("on");
  useEffect(() => {
    if (splash !== "on" || connectivity === "checking") return;
    setSplash("leaving");
    const t = setTimeout(() => setSplash("off"), 450);
    return () => clearTimeout(t);
  }, [connectivity, splash]);
  const toggle = useCallback(() => setPalette((p) => !p), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); toggle(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
  return (
    <>
      {splash !== "off" && <Splash leaving={splash === "leaving"} />}
      <Shell onSearch={toggle}><Routed /></Shell>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </>
  );
}

export default function App() {
  return (
    <PrefsProvider>
      <ToastProvider>
        <StatusProvider>
          <Inner />
        </StatusProvider>
      </ToastProvider>
    </PrefsProvider>
  );
}
