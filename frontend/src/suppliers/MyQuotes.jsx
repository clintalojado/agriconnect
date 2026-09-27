import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { useSession } from "../lib/session";
import { useRealtimeEvent } from "../lib/realtime.jsx";
import { Button, Card, EmptyState, PageHeader, SkeletonList, formatPeso, formatRelative } from "../components/ui.jsx";
import { QUOTE_STATUS, StatusBadge, perUnit } from "../components/status.jsx";
import { TagIcon } from "../components/icons.jsx";

export default function MyQuotes() {
  const { me } = useSession();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = () =>
    apiClient
      .get(`/quotes/supplier/${me.id}`)
      .then(setRows)
      .catch(() => setRows([]));
  useEffect(() => {
    load();
  }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtimeEvent("notification", load);

  async function withdraw(q) {
    if (!window.confirm("Withdraw this quotation?")) return;
    setBusy(q.id);
    try {
      await apiClient.post(`/quotes/${q.id}/withdraw`, { supplier_id: me.id });
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="My Quotes" description="Quotations you've sent and what the farmers decided." />
      {rows === null ? (
        <SkeletonList rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState icon={TagIcon} title="No quotations yet" action={<Button onClick={() => navigate("/dashboard")}>See new requests</Button>} />
      ) : (
        <div className="space-y-3">
          {rows.map((q) => (
            <Card key={q.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <button type="button" onClick={() => navigate(`/requests/${q.request_id}`)} className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-2">
                  <p className="truncate font-bold text-stone-900">{q.product_name}</p>
                  <StatusBadge map={QUOTE_STATUS} status={q.status} dot={false} />
                </div>
                <p className="text-sm text-stone-600">
                  {q.quantity} {q.unit} × {formatPeso(q.price_per_unit)}/{perUnit(q.unit)} · {q.farmer_name}, Brgy. {q.barangay}
                </p>
                <p className="text-xs text-stone-500">
                  Sent {formatRelative(q.created_at)}
                  {q.order_code && ` · Order ${q.order_code}`}
                </p>
              </button>
              <div className="flex items-center gap-3">
                <p className="text-lg font-extrabold text-stone-900">{formatPeso(q.total)}</p>
                {q.order_id ? (
                  <Button size="sm" onClick={() => navigate(`/orders/${q.order_id}`)}>
                    Open order
                  </Button>
                ) : q.status === "pending" ? (
                  <Button size="sm" variant="ghost" loading={busy === q.id} onClick={() => withdraw(q)}>
                    Withdraw
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
