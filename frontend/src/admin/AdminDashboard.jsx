import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import { Alert, Button, Card, EmptyState, Field, Input, PageHeader, Skeleton, cx, formatPeso } from "../components/ui.jsx";
import { BoxIcon, ChartIcon, CheckIcon, ClockIcon, PesoIcon, RouteIcon, TagIcon, TruckIcon, UsersIcon } from "../components/icons.jsx";

const CHROME = {
  grid: "#e1e0d9",
  axis: "#898781",
  primaryInk: "#0b0b0b",
  secondaryInk: "#52514e",
};

// Ordinal blue ramp (light -> dark) for ordered funnel stages, per the dataviz
// skill: magnitude comparisons across ordered stages use one hue, not one
// categorical color per bar.
const REQUEST_FUNNEL_COLORS = ["#6da7ec", "#2a78d6", "#184f95"]; // submitted -> aggregated -> fulfilled
const ORDER_FUNNEL_COLORS = ["#6da7ec", "#1c5cab"]; // confirmed -> completed

function StatCard({ icon: Icon, label, value, highlight }) {
  return (
    <Card className={cx("p-4", highlight && "bg-gradient-to-br from-brand-50 to-white ring-1 ring-brand-200")}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-stone-500">{label}</p>
        <Icon className={cx("h-4 w-4", highlight ? "text-brand-600" : "text-stone-400")} />
      </div>
      <p className={cx("mt-2 text-2xl font-extrabold tracking-tight", highlight ? "text-brand-800" : "text-stone-900")}>{value}</p>
    </Card>
  );
}

function FunnelChart({ data, colors }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={CHROME.grid} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: CHROME.axis, fontSize: 12 }} axisLine={{ stroke: CHROME.axis }} tickLine={false} />
        <YAxis tick={{ fill: CHROME.axis, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 12, borderColor: CHROME.grid, fontSize: 13 }} labelStyle={{ color: CHROME.primaryInk }} cursor={{ fill: "#f5f5f4" }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={64}>
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={colors[index % colors.length]} />
          ))}
          <LabelList dataKey="value" position="top" fill={CHROME.secondaryInk} fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const EMPTY_FILTERS = { barangay: "", start_date: "", end_date: "" };

function ImpactView() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const timer = setTimeout(load, 250); // debounce typing in the barangay filter
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.barangay, filters.start_date, filters.end_date]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.barangay) params.set("barangay", filters.barangay);
      if (filters.start_date) params.set("start_date", filters.start_date);
      if (filters.end_date) params.set("end_date", filters.end_date);
      const query = params.toString();
      setSummary(await apiClient.get(`/impact/summary${query ? `?${query}` : ""}`));
    } catch (err) {
      setError(err.message || "Could not load impact data.");
    } finally {
      setLoading(false);
    }
  }

  function updateFilter(field, value) {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }

  const requestFunnelData = summary
    ? [
        { name: "Submitted", value: summary.requests.submitted },
        { name: "Aggregated", value: summary.requests.aggregated },
        { name: "Fulfilled", value: summary.requests.fulfilled },
      ]
    : [];

  const orderFunnelData = summary
    ? [
        { name: "Confirmed", value: summary.orders.confirmed },
        { name: "Completed", value: summary.orders.completed },
      ]
    : [];

  const barangays = summary ? Object.keys(summary.top_products_by_barangay).sort() : [];
  const hasFilters = filters.barangay || filters.start_date || filters.end_date;

  return (
    <div>
      <Card className="mb-5 grid grid-cols-1 gap-3.5 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label="Barangay">
          <Input value={filters.barangay} onChange={(e) => updateFilter("barangay", e.target.value)} placeholder="All barangays" />
        </Field>
        <Field label="From">
          <Input type="date" value={filters.start_date} onChange={(e) => updateFilter("start_date", e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={filters.end_date} onChange={(e) => updateFilter("end_date", e.target.value)} />
        </Field>
        <Button variant="ghost" disabled={!hasFilters} onClick={() => setFilters(EMPTY_FILTERS)}>
          Clear
        </Button>
      </Card>

      {error && (
        <Alert tone="error" className="mb-5">
          {error}
        </Alert>
      )}

      {!summary ? (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="mt-3 h-7 w-1/2" />
            </Card>
          ))}
        </div>
      ) : (
        <div className={cx("transition-opacity", loading && "opacity-60")}>
          <div className="mb-6 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard icon={UsersIcon} label="Total farmers" value={summary.farmers.total} />
            <StatCard icon={UsersIcon} label="Active farmers" value={summary.farmers.active} />
            <StatCard icon={ChartIcon} label="Supplier response rate" value={`${summary.supplier_response_rate_pct}%`} />
            <StatCard
              icon={ClockIcon}
              label="Avg fulfillment time"
              value={summary.avg_fulfillment_days != null ? `${summary.avg_fulfillment_days} days` : "—"}
            />
            <StatCard icon={CheckIcon} label="Confirmed orders" value={summary.orders.confirmed} />
            <StatCard icon={TruckIcon} label="Completed orders" value={summary.orders.completed} />
            <StatCard icon={RouteIcon} label="Trips avoided" value={summary.impact.trips_avoided} highlight />
            <StatCard icon={PesoIcon} label="Estimated savings" value={formatPeso(summary.impact.estimated_savings_php)} highlight />
            <StatCard icon={TagIcon} label="Transaction value" value={formatPeso(summary.impact.transaction_value_php || 0)} />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-1 text-sm font-bold text-stone-800">Requests</h3>
              <p className="mb-2 text-xs text-stone-500">Submitted → pooled → delivered</p>
              <FunnelChart data={requestFunnelData} colors={REQUEST_FUNNEL_COLORS} />
            </Card>
            <Card className="p-5">
              <h3 className="mb-1 text-sm font-bold text-stone-800">Orders</h3>
              <p className="mb-2 text-xs text-stone-500">Confirmed by farmers → delivered</p>
              <FunnelChart data={orderFunnelData} colors={ORDER_FUNNEL_COLORS} />
            </Card>
          </div>

          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold text-stone-800">Top requested products by barangay</h3>
            {barangays.length === 0 ? (
              <EmptyState icon={BoxIcon} title="No requests yet" />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {barangays.map((barangay) => {
                  const products = summary.top_products_by_barangay[barangay];
                  const max = Math.max(...products.map((p) => p.total_quantity), 1);
                  return (
                    <div key={barangay} className="rounded-xl border border-stone-100 bg-stone-50/60 p-4">
                      <p className="mb-3 font-bold text-stone-900">Brgy. {barangay}</p>
                      <ul className="space-y-2.5">
                        {products.map((p) => (
                          <li key={p.product_name}>
                            <div className="flex justify-between gap-2 text-sm">
                              <span className="truncate text-stone-700">{p.product_name}</span>
                              <span className="shrink-0 font-semibold text-stone-900">{p.total_quantity}</span>
                            </div>
                            <div className="mt-1 h-1.5 rounded-full bg-stone-200">
                              <div className="h-1.5 rounded-full bg-[#2a78d6]" style={{ width: `${(p.total_quantity / max) * 100}%` }} />
                            </div>
                            <p className="mt-0.5 text-[11px] text-stone-400">
                              {p.request_count} request{p.request_count === 1 ? "" : "s"}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <div>
      <PageHeader
        eyebrow="Reports & analytics"
        title="Impact dashboard"
        description="Program-wide metrics across farmers, requests, orders, and estimated savings."
      />
      <ImpactView />
    </div>
  );
}
