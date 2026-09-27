import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { EmptyState, Input, PageHeader, Skeleton, cx } from "../components/ui.jsx";
import { ProductCard } from "../components/common.jsx";
import { CATEGORY_LABEL } from "../components/status.jsx";
import { SearchIcon, SproutIcon } from "../components/icons.jsx";

const CATEGORIES = ["all", "seeds", "fertilizer", "pesticide", "feeds"];

export default function Marketplace({ query }) {
  const [category, setCategory] = useState(query.category || "all");
  const [q, setQ] = useState(query.q || "");
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (category !== "all") params.set("category", category);
      if (q.trim()) params.set("q", q.trim());
      apiClient
        .get(`/products?${params}`)
        .then((rows) => {
          setProducts(rows);
          setError(null);
        })
        .catch((err) => setError(err.message));
    }, 200);
    return () => clearTimeout(timer);
  }, [category, q]);

  return (
    <div>
      <PageHeader
        eyebrow="Marketplace"
        title="Farm inputs"
        description="Prices shown are the lowest from verified suppliers. Add an item to a request to get quotations delivered to your barangay."
      />
      <div className="relative mb-3">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search farm inputs…" className="h-11 pl-10" aria-label="Search farm inputs" />
      </div>
      <div className="scrollbar-thin -mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={category === c}
            onClick={() => {
              setCategory(c);
              navigate("/marketplace", c === "all" ? {} : { category: c });
            }}
            className={cx(
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
              category === c ? "bg-brand-700 text-white shadow-sm" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
            )}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {products === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState icon={SproutIcon} title="No farm inputs match" description="Try another word or category." />
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} compact />
            ))}
          </div>
          <div className="hidden grid-cols-3 gap-4 sm:grid lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
