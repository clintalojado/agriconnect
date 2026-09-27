import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { useSession } from "../lib/session";
import { useRealtimeEvent } from "../lib/realtime.jsx";
import ProductArt from "../components/ProductArt.jsx";
import { Card, EmptyState, PageHeader, SkeletonList, cx, formatPeso, formatRelative, formatDate } from "../components/ui.jsx";
import { ORDER_STATUS, StatusBadge } from "../components/status.jsx";
import { BoxIcon } from "../components/icons.jsx";

const TABS = [
  { key: "all", label: "All" },
  { key: "confirmed", label: "Confirmed" },
  { key: "for_delivery", label: "For Delivery", match: ["for_delivery", "delivered"] },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

export default function Orders({ query }) {
  const { role, me } = useSession();
  const [tab, setTab] = useState(query.tab || "all");
  const [rows, setRows] = useState(null);

  const load = () => {
    const filter = role === "farmer" ? `?farmer_id=${me.id}` : role === "supplier" ? `?supplier_id=${me.id}` : "";
    apiClient
      .get(`/orders${filter}`)
      .then(setRows)
      .catch(() => setRows([]));
  };
  useEffect(load, [role, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtimeEvent("notification", load);

  const matches = (t, o) => t.key === "all" || (t.match || [t.key]).includes(o.status);
  const active = TABS.find((t) => t.key === tab);
  const shown = rows?.filter((o) => matches(active, o));

  return (
    <div>
      <PageHeader
        title={role === "supplier" ? "Orders to fulfill" : role === "staff" ? "All orders" : "My Orders"}
        description={role === "supplier" ? "Accepted quotations. Update the delivery status as you go." : "Track each order from confirmation to delivery."}
      />
      <div className="scrollbar-thin -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
        {TABS.map((t) => {
          const count = rows?.filter((o) => matches(t, o)).length;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cx(
                "shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold",
                tab === t.key ? "bg-brand-700 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
              )}
            >
              {t.label}
              {count ? <span className="ml-1.5 opacity-70">{count}</span> : null}
            </button>
          );
        })}
      </div>
      {rows === null ? (
        <SkeletonList rows={3} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={BoxIcon}
          title="No orders here"
          description={role === "farmer" ? "Accept a supplier's quotation on one of your requests to place an order." : "Orders appear when farmers accept quotations."}
        />
      ) : (
        <div className="space-y-3">
          {shown.map((o) => (
            <Card key={o.id} className="p-0">
              <button type="button" onClick={() => navigate(`/orders/${o.id}`)} className="flex w-full items-center gap-3 p-3.5 text-left sm:gap-4 sm:p-4">
                <ProductArt product={{ name: o.product_name, category: o.product_category }} className="h-16 w-16 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-bold text-stone-900">{o.product_name}</p>
                    <StatusBadge map={ORDER_STATUS} status={o.status} dot={false} />
                  </div>
                  <p className="text-sm text-stone-600">
                    {o.quantity} {o.unit} · {role === "supplier" ? o.farmer_name : o.supplier_name}
                    {role === "staff" && ` → ${o.farmer_name}`}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {o.code} · {o.delivery_date ? `delivery ${formatDate(o.delivery_date)}` : formatRelative(o.created_at)}
                  </p>
                </div>
                <p className="hidden text-right font-extrabold text-stone-900 sm:block">{formatPeso(o.total)}</p>
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
