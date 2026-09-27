import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { EmptyState, PageHeader, SkeletonList, cx } from "../components/ui.jsx";
import { REQUEST_STATUS } from "../components/status.jsx";
import { ClipboardIcon } from "../components/icons.jsx";
import { RequestRow } from "../farmers/MyRequests.jsx";

const FILTERS = ["all", "awaiting_verification", "for_quotation", "supplier_confirmed", "for_delivery", "completed", "rejected"];

export default function StaffRequests() {
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState(null);

  useEffect(() => {
    setRows(null);
    apiClient
      .get(`/requests${status === "all" ? "" : `?status=${status}`}`)
      .then((all) => setRows(all.filter((r) => r.display_status !== "draft")))
      .catch(() => setRows([]));
  }, [status]);

  return (
    <div>
      <PageHeader title="Structured Requests" description="Every farmer request from the app, SMS, and Messenger." />
      <div className="scrollbar-thin -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cx(
              "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold",
              status === s ? "bg-brand-700 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
            )}
          >
            {s === "all" ? "All" : REQUEST_STATUS[s].label}
          </button>
        ))}
      </div>
      {rows === null ? (
        <SkeletonList rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ClipboardIcon} title="No requests" />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <RequestRow key={r.id} r={r} showFarmer onClick={() => navigate(`/requests/${r.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
