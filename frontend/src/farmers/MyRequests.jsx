import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { useSession } from "../lib/session";
import { useRealtimeEvent } from "../lib/realtime.jsx";
import ProductArt from "../components/ProductArt.jsx";
import { Button, Card, EmptyState, PageHeader, SkeletonList, cx, formatRelative, formatDate } from "../components/ui.jsx";
import { VerificationBanner } from "../components/common.jsx";
import { REQUEST_STATUS, StatusBadge } from "../components/status.jsx";
import { ClipboardIcon, MessengerIcon, PlusIcon, SmsIcon } from "../components/icons.jsx";

const TABS = [
  { key: "all", label: "All" },
  { key: "for_quotation", label: "For Quotation", match: ["for_quotation", "awaiting_verification"] },
  { key: "confirmed", label: "Confirmed", match: ["supplier_confirmed"] },
  { key: "for_delivery", label: "For Delivery", match: ["for_delivery", "delivered"] },
  { key: "completed", label: "Completed", match: ["completed"] },
];

export function RequestRow({ r, onClick, showFarmer = false }) {
  return (
    <Card className="p-0">
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 p-3.5 text-left sm:gap-4 sm:p-4">
        <ProductArt product={{ name: r.product_name, category: r.product_category }} className="h-16 w-16 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-bold text-stone-900">{r.product_name}</p>
            <StatusBadge map={REQUEST_STATUS} status={r.display_status} dot={false} />
          </div>
          <p className="text-sm text-stone-600">
            {r.quantity} {r.unit}
            {showFarmer && ` · ${r.farmer_name}`}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-stone-500">
            {r.channel === "sms" && <SmsIcon className="h-3.5 w-3.5 shrink-0" />}
            {r.channel === "messenger" && <MessengerIcon className="h-3.5 w-3.5 shrink-0 text-sky-600" />}
            Brgy. {r.barangay}
            {r.preferred_date ? ` · needed ${formatDate(r.preferred_date)}` : ""} · {formatRelative(r.created_at)}
          </p>
          {r.display_status === "for_quotation" && (
            <p className={cx("mt-1 text-xs font-semibold", r.quote_count ? "text-brand-700" : "text-stone-400")}>
              {r.quote_count ? `${r.quote_count} quote${r.quote_count > 1 ? "s" : ""} received` : "Waiting for quotations"}
            </p>
          )}
          {r.order_code && <p className="mt-1 text-xs font-semibold text-stone-600">Order {r.order_code} · {r.order_supplier_name}</p>}
        </div>
      </button>
    </Card>
  );
}

export default function MyRequests({ query }) {
  const { me } = useSession();
  const [tab, setTab] = useState(query.tab || "all");
  const [rows, setRows] = useState(null);

  const load = () =>
    apiClient
      .get(`/requests/${me.id}`)
      .then((all) => setRows(all.filter((r) => r.display_status !== "draft")))
      .catch(() => setRows([]));

  useEffect(() => {
    load();
  }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtimeEvent("notification", load);

  const active = TABS.find((t) => t.key === tab);
  const shown = rows?.filter((r) => !active.match || active.match.includes(r.display_status));

  return (
    <div>
      <PageHeader
        title="My Requests"
        description="Every request you've made in the app, by SMS, or on Messenger."
        action={
          <Button icon={PlusIcon} onClick={() => navigate("/requests/new")}>
            New request
          </Button>
        }
      />
      <VerificationBanner />
      <div className="scrollbar-thin -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
        {TABS.map((t) => {
          const count = rows?.filter((r) => !t.match || t.match.includes(r.display_status)).length;
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
          icon={ClipboardIcon}
          title={rows.length ? "Nothing here" : "No requests yet"}
          description="Request fertilizer, seeds, pesticides, or feeds and suppliers will send quotations."
          action={<Button onClick={() => navigate("/requests/new")}>Request inputs</Button>}
        />
      ) : (
        <div className="space-y-3">
          {shown.map((r) => (
            <RequestRow key={r.id} r={r} onClick={() => navigate(`/requests/${r.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
