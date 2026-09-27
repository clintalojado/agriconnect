import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { useSession } from "../lib/session";
import { Avatar, Badge, Button, Card, EmptyState, Input, PageHeader, SkeletonList, cx } from "../components/ui.jsx";
import { CATEGORY_LABEL, Rating } from "../components/status.jsx";
import { PinIcon, SearchIcon, ShieldCheckIcon, StoreIcon } from "../components/icons.jsx";

const CATEGORIES = ["all", "seeds", "fertilizer", "pesticide", "feeds"];

export default function SupplierDirectory({ query }) {
  const { role } = useSession();
  const staff = role === "staff";
  const [q, setQ] = useState(query.q || "");
  const [category, setCategory] = useState("all");
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (category !== "all") params.set("category", category);
    if (staff) params.set("all", "1");
    apiClient
      .get(`/suppliers?${params}`)
      .then(setRows)
      .catch(() => setRows([]));
  };

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [q, category, staff]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleVerified(s) {
    setBusyId(s.id);
    try {
      await apiClient.post(`/suppliers/${s.id}/verification`, { verified: !s.verified });
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={staff ? "Suppliers" : "Supplier Listings"}
        description={staff ? "Verify stores before they can quote. Unverified stores don't appear to farmers." : "Verified agri-input stores serving your area."}
      />
      <div className="relative mb-3">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search suppliers, barangay, or town…" className="h-11 pl-10" aria-label="Search suppliers" />
      </div>
      <div className="scrollbar-thin -mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={cx(
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold",
              category === c ? "bg-brand-700 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
            )}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      {rows === null ? (
        <SkeletonList rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState icon={StoreIcon} title="No suppliers found" description={staff ? "Suppliers appear here after they sign up." : "Try another search."} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((s) => (
            <Card key={s.id} className="flex items-center gap-3 p-4">
              <button type="button" onClick={() => navigate(`/suppliers/${s.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar name={s.name} size="lg" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-bold text-stone-900">
                    {s.verified && <ShieldCheckIcon className="h-4 w-4 shrink-0 text-brand-600" aria-label="Verified" />}
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs text-stone-500">
                    <PinIcon className="h-3 w-3" /> {[s.barangay, s.municipality].filter(Boolean).join(", ") || "Location not set"}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <Rating value={s.rating} count={s.review_count} />
                    {s.completed_orders > 0 && <span className="text-xs text-stone-400">{s.completed_orders} orders</span>}
                  </span>
                  <span className="mt-1 block truncate text-xs text-stone-500">{s.categories.map((c) => CATEGORY_LABEL[c] || c).join(", ") || "No products listed"}</span>
                </span>
              </button>
              {staff ? (
                <div className="flex flex-col items-end gap-2">
                  <Badge tone={s.verified ? "green" : "amber"}>{s.verified ? "Verified" : "Unverified"}</Badge>
                  <Button size="xs" variant={s.verified ? "ghost" : "primary"} loading={busyId === s.id} onClick={() => toggleVerified(s)}>
                    {s.verified ? "Unverify" : "Verify"}
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => navigate(`/suppliers/${s.id}`)}>
                  View
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
