import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { useSession } from "../lib/session";
import { useProfile } from "../lib/profile.jsx";
import { useRealtimeEvent } from "../lib/realtime.jsx";
import ProductArt from "../components/ProductArt.jsx";
import { Button, Card, EmptyState, PageHeader, SkeletonList, cx, formatPeso, formatRelative, formatDate } from "../components/ui.jsx";
import { VerificationBanner } from "../components/common.jsx";
import { QUOTE_STATUS, StatusBadge, perUnit } from "../components/status.jsx";
import { BoxIcon, ClipboardIcon, PinIcon, TagIcon, TruckIcon } from "../components/icons.jsx";
import SendQuoteModal from "./SendQuoteModal.jsx";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "nearby", label: "Nearby" },
  { key: "my_products", label: "My Products" },
];

function Stat({ icon: Icon, label, value, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white p-3 text-left shadow-card hover:border-brand-300 sm:p-4">
      <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 sm:flex">
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-[11px] font-medium leading-tight text-stone-500 sm:text-xs">{label}</span>
        <span className="block text-xl font-extrabold text-stone-900">{value ?? "–"}</span>
      </span>
    </button>
  );
}

export default function SupplierHome() {
  const { me } = useSession();
  const { profile } = useProfile();
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState(null);
  const [stats, setStats] = useState({});
  const [quoting, setQuoting] = useState(null);

  const load = () => {
    apiClient
      .get(`/requests/open/${me.id}?filter=${filter}`)
      .then(setRows)
      .catch(() => setRows([]));
  };
  const loadStats = () => {
    Promise.all([apiClient.get(`/quotes/supplier/${me.id}`), apiClient.get(`/orders?supplier_id=${me.id}`), apiClient.get(`/requests/open/${me.id}`)])
      .then(([quotes, orders, open]) =>
        setStats({
          open: open.length,
          pending: quotes.filter((q) => q.status === "pending").length,
          toDeliver: orders.filter((o) => ["confirmed", "for_delivery"].includes(o.status)).length,
        })
      )
      .catch(() => {});
  };

  useEffect(load, [filter, me.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(loadStats, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtimeEvent("notification", () => {
    load();
    loadStats();
  });

  return (
    <div>
      <PageHeader
        eyebrow={profile?.name}
        title="New Requests"
        description="Farmers' requests from verified accounts. Send a quotation — the farmer picks the best one."
      />
      <VerificationBanner />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat icon={ClipboardIcon} label="Open requests" value={stats.open} onClick={() => setFilter("all")} />
        <Stat icon={TagIcon} label="Quotes awaiting farmer" value={stats.pending} onClick={() => navigate("/quotes")} />
        <Stat icon={TruckIcon} label="Orders to deliver" value={stats.toDeliver} onClick={() => navigate("/orders")} />
      </div>

      <div className="mb-4 flex gap-2" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cx(
              "rounded-full px-4 py-1.5 text-sm font-semibold",
              filter === f.key ? "bg-brand-700 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows === null ? (
        <SkeletonList rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BoxIcon}
          title="No open requests here"
          description={
            filter === "nearby"
              ? "Add the barangays you deliver to in Settings to see nearby requests."
              : filter === "my_products"
                ? "List your products in My Products to match requests."
                : "New requests from verified farmers will appear here."
          }
          action={
            filter === "my_products" ? (
              <Button onClick={() => navigate("/products")}>Add products</Button>
            ) : filter === "nearby" ? (
              <Button onClick={() => navigate("/settings")}>Update coverage</Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.id} className="flex flex-col p-4">
              <div className="flex items-start gap-3">
                <ProductArt product={{ name: r.product_name, category: r.product_category }} className="h-16 w-16 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-stone-900">{r.product_name}</p>
                    {r.my_quote ? (
                      <StatusBadge map={QUOTE_STATUS} status={r.my_quote.status} dot={false} />
                    ) : (
                      <StatusBadge map={{ q: { label: "For Quotation", tone: "amber" } }} status="q" dot={false} />
                    )}
                  </div>
                  <p className="text-sm font-semibold text-stone-700">
                    {r.quantity} {r.unit}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-stone-500">
                    <PinIcon className="h-3 w-3" /> Brgy. {r.barangay}
                    {r.farmer_municipality ? `, ${r.farmer_municipality}` : ""}
                    {r.nearby && <span className="ml-1 font-semibold text-brand-700">· nearby</span>}
                  </p>
                  <p className="text-xs text-stone-500">
                    {r.preferred_date ? `Needed ${formatDate(r.needed_by || r.preferred_date)}` : "No deadline"} · {formatRelative(r.created_at)}
                    {r.quote_count > 0 && ` · ${r.quote_count} quote${r.quote_count > 1 ? "s" : ""}`}
                  </p>
                  {r.preferred_supplier_id === me.id && <p className="mt-1 text-xs font-bold text-harvest-600">★ The farmer picked your store</p>}
                  {r.my_quote && (
                    <p className="mt-1 text-xs font-semibold text-stone-700">
                      Your quote: {formatPeso(r.my_quote.price_per_unit)}/{perUnit(r.unit)}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="secondary" size="sm" onClick={() => navigate(`/requests/${r.id}`)}>
                  View Details
                </Button>
                <Button size="sm" onClick={() => setQuoting(r)} disabled={profile && !profile.verified}>
                  {r.my_quote ? "Update Quote" : "Send Quote"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {quoting && (
        <SendQuoteModal
          request={quoting}
          existing={quoting.my_quote?.status === "pending" ? quoting.my_quote : null}
          onClose={() => setQuoting(null)}
          onSent={() => {
            load();
            loadStats();
          }}
        />
      )}
    </div>
  );
}
