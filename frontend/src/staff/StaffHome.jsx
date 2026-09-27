import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { useSession } from "../lib/session";
import { useRealtimeEvent } from "../lib/realtime.jsx";
import { Card, PageHeader, Skeleton } from "../components/ui.jsx";
import ProcessFlow from "../components/ProcessFlow.jsx";
import { BoxIcon, ClipboardIcon, InboxIcon, ShieldCheckIcon, StoreIcon, TagIcon, TruckIcon, UsersIcon } from "../components/icons.jsx";

function Tile({ icon: Icon, label, value, hint, to, alert }) {
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={`rounded-2xl border bg-white p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lift ${alert ? "border-harvest-300" : "border-stone-200/80"}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-stone-500">{label}</p>
        <Icon className={alert ? "h-4 w-4 text-harvest-500" : "h-4 w-4 text-stone-400"} />
      </div>
      <p className="mt-2 text-2xl font-extrabold text-stone-900">{value}</p>
      {hint && <p className="text-xs text-stone-500">{hint}</p>}
    </button>
  );
}

export default function StaffHome() {
  const { staff } = useSession();
  const [o, setO] = useState(null);
  const load = useCallback(() => apiClient.get("/admin/overview").then(setO).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);
  useRealtimeEvent("inbound", load);
  useRealtimeEvent("verification", load);

  return (
    <div>
      <PageHeader eyebrow={staff?.org} title="Staff dashboard" description="Help farmers get their requests through: verify profiles, process texts, and watch orders to completion." />
      {!o ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile icon={InboxIcon} label="Incoming messages to process" value={o.inbox.open} hint={`${o.inbox.awaiting_confirmation} awaiting farmer OK`} to="/inbox" alert={o.inbox.open > 0} />
          <Tile icon={ShieldCheckIcon} label="Farmers to verify" value={o.farmers.pending_verification} hint={`${o.farmers.total} farmers total`} to="/verification" alert={o.farmers.pending_verification > 0} />
          <Tile icon={StoreIcon} label="Suppliers to verify" value={o.suppliers.unverified} hint={`${o.suppliers.total} suppliers total`} to="/suppliers" alert={o.suppliers.unverified > 0} />
          <Tile icon={TagIcon} label="Requests without quotes" value={o.requests.without_quotes} hint={`${o.requests.open} open requests`} to="/requests" alert={o.requests.without_quotes > 0} />
          <Tile icon={ClipboardIcon} label="Confirmed orders" value={o.orders.confirmed || 0} to="/orders" />
          <Tile icon={TruckIcon} label="For delivery" value={(o.orders.for_delivery || 0) + (o.orders.delivered || 0)} to="/orders" />
          <Tile icon={BoxIcon} label="Completed orders" value={o.orders.completed || 0} to="/reports" />
          <Tile icon={UsersIcon} label="Registered farmers" value={o.farmers.total} to="/verification" />
        </div>
      )}
      <h2 className="mb-3 mt-10 text-lg font-extrabold text-stone-900">Business process</h2>
      <p className="-mt-2 mb-4 text-sm text-stone-500">From a farmer's text message to a fulfilled order.</p>
      <ProcessFlow />
    </div>
  );
}
