import { useEffect, useRef, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { useSession } from "../lib/session";
import { cx } from "../components/ui.jsx";
import { PinIcon, SearchIcon, ShieldCheckIcon, StoreIcon, TagIcon } from "../components/icons.jsx";

/** Top-bar search across farm inputs, suppliers, and barangays. */
export default function GlobalSearch({ className }) {
  const { role } = useSession();
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return undefined;
    }
    const timer = setTimeout(() => {
      apiClient
        .get(`/products/search?q=${encodeURIComponent(q.trim())}`)
        .then(setResults)
        .catch(() => setResults(null));
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function go(to, query) {
    setOpen(false);
    setQ("");
    navigate(to, query);
  }

  function submit(e) {
    e.preventDefault();
    if (!q.trim()) return;
    if (role === "farmer") go("/marketplace", { q: q.trim() });
    else if (results?.products?.[0]) go(`/marketplace/product/${results.products[0].id}`);
  }

  const hasResults = results && (results.products.length || results.suppliers.length || results.barangays.length);

  return (
    <div ref={ref} className={cx("relative", className)}>
      <form onSubmit={submit} role="search">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search farm inputs, suppliers, or barangay…"
          aria-label="Search"
          className="h-11 w-full rounded-xl border border-stone-200 bg-stone-50 pl-10 pr-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-500/10"
        />
      </form>
      {open && q.trim().length >= 2 && (
        <div className="absolute inset-x-0 z-40 mt-2 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lift animate-fade-in-up">
          {!hasResults ? (
            <p className="px-4 py-6 text-center text-sm text-stone-500">{results ? "No matches." : "Searching…"}</p>
          ) : (
            <div className="max-h-96 overflow-y-auto py-2">
              {results.products.length > 0 && <p className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-stone-400">Farm inputs</p>}
              {results.products.map((p) => (
                <button key={`p${p.id}`} type="button" onClick={() => go(`/marketplace/product/${p.id}`)} className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-stone-50">
                  <TagIcon className="h-4 w-4 text-brand-600" /> <span className="font-medium text-stone-800">{p.name}</span>
                  <span className="ml-auto text-xs capitalize text-stone-400">{p.category}</span>
                </button>
              ))}
              {results.suppliers.length > 0 && <p className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-stone-400">Suppliers</p>}
              {results.suppliers.map((s) => (
                <button key={`s${s.id}`} type="button" onClick={() => go(`/suppliers/${s.id}`)} className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-stone-50">
                  <StoreIcon className="h-4 w-4 text-harvest-500" /> <span className="font-medium text-stone-800">{s.name}</span>
                  {s.verified ? <ShieldCheckIcon className="h-4 w-4 text-brand-600" /> : null}
                  <span className="ml-auto text-xs text-stone-400">{s.municipality || s.barangay}</span>
                </button>
              ))}
              {results.barangays.length > 0 && <p className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-stone-400">Barangays</p>}
              {results.barangays.map((b) => (
                <button
                  key={`b${b.barangay}`}
                  type="button"
                  onClick={() => go(role === "supplier" ? "/pooled" : "/suppliers", { q: b.barangay })}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-stone-50"
                >
                  <PinIcon className="h-4 w-4 text-sky-600" /> <span className="font-medium text-stone-800">Brgy. {b.barangay}</span>
                  <span className="ml-auto text-xs text-stone-400">{b.request_count} requests</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
