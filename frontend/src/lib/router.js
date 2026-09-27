import { createContext, useContext, useEffect, useState } from "react";

// Hash routes: #/requests/12?tab=quotes → { path: ["requests", "12"], query: { tab: "quotes" } }.
// The hash is the source of truth, so refresh and the Back button work.

export function parseLocation() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart = ""] = raw.split("?");
  return {
    path: pathPart.split("/").filter(Boolean).map(decodeURIComponent),
    query: Object.fromEntries(new URLSearchParams(queryPart)),
  };
}

/** navigate("/requests/12") or navigate("/marketplace", { category: "seeds" }) */
export function navigate(to, query) {
  const qs = query && Object.keys(query).length ? `?${new URLSearchParams(query)}` : "";
  const hash = `#${to.startsWith("/") ? to : `/${to}`}${qs}`;
  if (window.location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = hash;
  }
}

export function useLocation() {
  const [location, setLocation] = useState(parseLocation);
  useEffect(() => {
    const onChange = () => {
      setLocation(parseLocation());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return location;
}

// Kept for older components that call useNavigate()(path).
export const NavigationContext = createContext(navigate);
export function useNavigate() {
  return useContext(NavigationContext);
}
