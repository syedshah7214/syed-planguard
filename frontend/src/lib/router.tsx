import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

/** Tiny hash router: no dependency, works on any static host (GitHub Pages, S3, nginx). */
export interface Route { path: string; query: URLSearchParams }

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [path, qs] = raw.split("?");
  return { path: path || "/", query: new URLSearchParams(qs ?? "") };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function navigate(to: string) {
  const target = to.startsWith("#") ? to : `#${to}`;
  if (window.location.hash !== target) window.location.hash = target;
}

/** Update query params of the current route without adding history noise. */
export function setQuery(updates: Record<string, string | null>) {
  const { path, query } = parse();
  Object.entries(updates).forEach(([k, v]) => (v === null || v === "" ? query.delete(k) : query.set(k, v)));
  const qs = query.toString();
  history.replaceState(null, "", `#${path}${qs ? `?${qs}` : ""}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      href={`#${to}`}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
      }}
      {...rest}
    />
  );
}
