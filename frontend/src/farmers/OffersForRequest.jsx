import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { useContact } from "../messenger/useContact";
import { Alert, Avatar, Badge, Button, EmptyState, SkeletonList, formatPeso, formatDate } from "../components/ui.jsx";
import { ChatIcon, CheckIcon, ClockIcon, PhoneIcon, StoreIcon, TruckIcon } from "../components/icons.jsx";

const MY_STATUS = {
  accepted: { label: "You accepted", tone: "green" },
  declined: { label: "You declined", tone: "stone" },
  revision_requested: { label: "Revision requested", tone: "amber" },
};

export default function OffersForRequest({ requestId, farmerId }) {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [respondingId, setRespondingId] = useState(null);
  const [summaries, setSummaries] = useState({});
  const contact = useContact();

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { offers: rows } = await apiClient.get(`/confirmations/offers/${requestId}`);
      setOffers(rows);
    } catch (err) {
      setError(err.message || "Could not load offers.");
    } finally {
      setLoading(false);
    }
  }

  async function respond(offerId, status) {
    setError(null);
    setRespondingId(offerId);
    try {
      const path =
        status === "accepted" ? "/confirmations/accept" : status === "declined" ? "/confirmations/decline" : "/confirmations/revise";
      const summary = await apiClient.post(path, { request_id: requestId, offer_id: offerId, farmer_id: farmerId });
      setSummaries((prev) => ({ ...prev, [offerId]: summary }));
      await load();
    } catch (err) {
      setError(err.message || "Could not save your response.");
    } finally {
      setRespondingId(null);
    }
  }

  if (loading) return <SkeletonList rows={1} />;

  const cheapest = offers.length > 1 ? Math.min(...offers.map((o) => Number(o.price_per_unit))) : null;

  return (
    <div>
      {error && (
        <Alert tone="error" className="mb-3" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {offers.length === 0 ? (
        <EmptyState
          icon={ClockIcon}
          title="No offers yet"
          description="Suppliers see pooled demand from your barangay. We'll notify you (and text you, if you added a number) when an offer arrives."
        />
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => {
            const mine = MY_STATUS[offer.my_status];
            const pair = { farmer_id: farmerId, supplier_id: offer.supplier_id, offer_id: offer.id };
            return (
              <div key={offer.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={offer.supplier_name} />
                    <div className="min-w-0">
                      <p className="truncate font-bold text-stone-900">{offer.supplier_name}</p>
                      <p className="text-xl font-extrabold text-brand-700">
                        {formatPeso(offer.price_per_unit)}
                        <span className="text-sm font-medium text-stone-500"> / {offer.demand_unit || "unit"}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {mine && <Badge tone={mine.tone}>{mine.label}</Badge>}
                    {cheapest != null && Number(offer.price_per_unit) === cheapest && <Badge tone="green">Lowest price</Badge>}
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-stone-50 px-3 py-2">
                    <dt className="flex items-center gap-1 text-xs text-stone-500">
                      <StoreIcon className="h-3.5 w-3.5" /> Available
                    </dt>
                    <dd className="font-semibold text-stone-800">
                      {offer.available_quantity} {offer.demand_unit}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-stone-50 px-3 py-2">
                    <dt className="flex items-center gap-1 text-xs text-stone-500">
                      <TruckIcon className="h-3.5 w-3.5" /> Delivery
                    </dt>
                    <dd className="truncate font-semibold text-stone-800">
                      {formatDate(offer.proposed_delivery_date) || "To be arranged"}
                      {offer.delivery_point ? ` · ${offer.delivery_point}` : ""}
                    </dd>
                  </div>
                </dl>

                {offer.my_status === "accepted" && summaries[offer.id] && (
                  <p className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-xs font-medium text-brand-800">
                    {summaries[offer.id].confirmed_farmer_count} farmer(s) confirmed so far, totaling {summaries[offer.id].confirmed_quantity}{" "}
                    {offer.demand_unit}.
                  </p>
                )}

                <div className="mt-3.5 grid grid-cols-3 gap-2">
                  <Button size="sm" icon={CheckIcon} loading={respondingId === offer.id} onClick={() => respond(offer.id, "accepted")}>
                    Accept
                  </Button>
                  <Button size="sm" variant="warning" disabled={respondingId === offer.id} onClick={() => respond(offer.id, "revision_requested")}>
                    Revise
                  </Button>
                  <Button size="sm" variant="secondary" disabled={respondingId === offer.id} onClick={() => respond(offer.id, "declined")}>
                    Decline
                  </Button>
                </div>

                {farmerId && (
                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-stone-100 pt-3">
                    <Button size="sm" variant="soft" icon={ChatIcon} loading={contact.isBusy("message", pair)} onClick={() => contact.message(pair)}>
                      Message
                    </Button>
                    <Button size="sm" variant="soft" icon={PhoneIcon} loading={contact.isBusy("call", pair)} onClick={() => contact.call(pair)}>
                      Call
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
