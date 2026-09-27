import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { useSession } from "../lib/session";
import { useProfile } from "../lib/profile.jsx";
import { useContact } from "../messenger/useContact";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Segmented,
  SkeletonList,
  cx,
  formatPeso, formatDate } from "../components/ui.jsx";
import { VerificationBanner } from "../components/common.jsx";
import { perUnit } from "../components/status.jsx";
import { BoxIcon, ChatIcon, PhoneIcon, RefreshIcon, SearchIcon, TruckIcon, UsersIcon } from "../components/icons.jsx";

// Barangay pooling: farmers' confirmed requests grouped by product and
// barangay. One group offer reaches every farmer in the pool.

const EMPTY_OFFER = { price_per_unit: "", available_quantity: "", min_order_quantity: "", proposed_delivery_date: "", delivery_point: "", offer_validity: "" };

const DEMAND_STATUS = {
  collecting: { label: "Collecting", tone: "stone" },
  market_viable: { label: "Viable — ready for offers", tone: "green" },
  offered: { label: "Offer submitted", tone: "blue" },
  closed: { label: "Closed", tone: "stone" },
};

const CONFIRMATION_STATUS = {
  accepted: { label: "Accepted", tone: "green" },
  declined: { label: "Declined", tone: "stone" },
  revision_requested: { label: "Wants revision", tone: "amber" },
};

function OfferModal({ row, onClose, onDone }) {
  const { me } = useSession();
  const [form, setForm] = useState(EMPTY_OFFER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const total = Number(form.price_per_unit) * Math.min(Number(form.available_quantity) || 0, row.total_quantity);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiClient.post("/offers/submit", {
        aggregated_demand_id: row.id,
        supplier_id: me.id,
        price_per_unit: Number(form.price_per_unit),
        available_quantity: Number(form.available_quantity),
        min_order_quantity: form.min_order_quantity === "" ? null : Number(form.min_order_quantity),
        proposed_delivery_date: form.proposed_delivery_date || null,
        delivery_point: form.delivery_point || null,
        offer_validity: form.offer_validity || null,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Make a group offer" subtitle={`${row.product_name} — ${row.total_quantity} ${row.unit} pooled in Brgy. ${row.barangay}`}>
      <form onSubmit={submit} className="space-y-3.5">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Price per ${perUnit(row.unit)}`} hint="(₱)">
            <Input type="number" min="0" step="0.01" required value={form.price_per_unit} onChange={set("price_per_unit")} />
          </Field>
          <Field label="Available qty">
            <Input type="number" min="0" required value={form.available_quantity} onChange={set("available_quantity")} />
          </Field>
        </div>
        <Field label="Minimum order" hint="(optional)">
          <Input type="number" min="0" value={form.min_order_quantity} onChange={set("min_order_quantity")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Delivery date">
            <Input type="date" value={form.proposed_delivery_date} onChange={set("proposed_delivery_date")} />
          </Field>
          <Field label="Valid until">
            <Input type="date" value={form.offer_validity} onChange={set("offer_validity")} />
          </Field>
        </div>
        <Field label="Delivery point">
          <Input value={form.delivery_point} onChange={set("delivery_point")} placeholder="e.g. Barangay Hall" />
        </Field>
        {total > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3 text-sm">
            <span className="font-medium text-brand-800">Estimated order value</span>
            <span className="text-lg font-extrabold text-brand-800">{formatPeso(total)}</span>
          </div>
        )}
        <p className="text-xs text-stone-500">Farmers in the pool are notified in the app and by SMS.</p>
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" loading={busy} className="flex-1">
            Submit offer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function OfferFarmersModal({ offer, onClose }) {
  const { me } = useSession();
  const [farmers, setFarmers] = useState(null);
  const [error, setError] = useState(null);
  const contact = useContact();

  useEffect(() => {
    apiClient
      .get(`/offers/${offer.id}/farmers`)
      .then(setFarmers)
      .catch((err) => setError(err.message));
  }, [offer.id]);

  return (
    <Modal open onClose={onClose} title="Farmers on this offer" subtitle={`${offer.product_name} · Brgy. ${offer.barangay}`}>
      {error && <Alert tone="error">{error}</Alert>}
      {!farmers && !error && <SkeletonList rows={2} />}
      {farmers?.length === 0 && <EmptyState icon={UsersIcon} title="No responses yet" description="Farmers who respond to your offer appear here." />}
      <div className="divide-y divide-stone-100">
        {farmers?.map((f) => {
          const status = CONFIRMATION_STATUS[f.confirmation_status] || { label: "Pending", tone: "stone" };
          const pair = { farmer_id: f.id, supplier_id: me.id };
          return (
            <div key={f.id} className="flex items-center gap-3 py-3">
              <Avatar name={f.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-stone-900">{f.name}</p>
                <p className="text-xs text-stone-500">
                  {f.quantity ?? "?"} {f.unit || ""} · <Badge tone={status.tone}>{status.label}</Badge>
                </p>
              </div>
              <Button size="icon" variant="soft" aria-label={`Message ${f.name}`} loading={contact.isBusy("message", pair)} onClick={() => contact.message(pair)}>
                {!contact.isBusy("message", pair) && <ChatIcon className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="soft" aria-label={`Call ${f.name}`} loading={contact.isBusy("call", pair)} onClick={() => contact.call(pair)}>
                {!contact.isBusy("call", pair) && <PhoneIcon className="h-4 w-4" />}
              </Button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export default function PooledDemand({ query }) {
  const { me } = useSession();
  const { profile } = useProfile();
  const [tab, setTab] = useState("demand");
  const [rows, setRows] = useState(null);
  const [offers, setOffers] = useState(null);
  const [search, setSearch] = useState(query.q || "");
  const [viableOnly, setViableOnly] = useState(false);
  const [offering, setOffering] = useState(null);
  const [contactOffer, setContactOffer] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadDemand = () =>
    apiClient
      .get("/demand/aggregated")
      .then(setRows)
      .catch(() => setRows([]));
  const loadOffers = () =>
    apiClient
      .get(`/offers/my-offers/${me.id}`)
      .then(setOffers)
      .catch(() => setOffers([]));

  useEffect(() => {
    loadDemand();
    loadOffers();
  }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const needle = search.trim().toLowerCase();
  const filtered = (rows || []).filter(
    (r) =>
      (!needle || r.barangay.toLowerCase().includes(needle) || r.product_name.toLowerCase().includes(needle)) &&
      (!viableOnly || r.status === "market_viable")
  );

  return (
    <div>
      <PageHeader
        title="Pooled Demand"
        description="Requests grouped by barangay and product. One group offer reaches every farmer in the pool."
        action={
          <Button variant="secondary" size="sm" icon={RefreshIcon} onClick={loadDemand}>
            Refresh
          </Button>
        }
      />
      <VerificationBanner />
      {notice && (
        <Alert tone="success" className="mb-4" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: "demand", label: "Pools", icon: BoxIcon },
          { value: "offers", label: "My group offers", icon: TruckIcon },
        ]}
      />
      {tab === "demand" && (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search barangay or product" className="pl-9" />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-600">
              <input type="checkbox" checked={viableOnly} onChange={(e) => setViableOnly(e.target.checked)} className="h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500" />
              Viable only
            </label>
          </div>
          {rows === null ? (
            <SkeletonList rows={3} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={BoxIcon} title="No pools match" description="Pools form as verified farmers confirm requests." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((r) => {
                const status = DEMAND_STATUS[r.status] || { label: r.status, tone: "stone" };
                return (
                  <Card key={r.id} className={cx("flex flex-col p-4", r.status === "market_viable" && "ring-1 ring-brand-300")}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-stone-900">{r.product_name}</p>
                      <Badge tone={status.tone} dot>
                        {status.label}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-stone-500">
                      Brgy. {r.barangay} · {r.time_period}
                    </p>
                    <div className="mt-3 flex items-end justify-between">
                      <div>
                        <p className="text-2xl font-extrabold text-stone-900">
                          {r.total_quantity} <span className="text-sm font-semibold text-stone-500">{r.unit}</span>
                        </p>
                        <p className="flex items-center gap-1 text-xs text-stone-500">
                          <UsersIcon className="h-3.5 w-3.5" /> {r.farmer_count} farmer{r.farmer_count === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => setOffering(r)} disabled={r.status === "closed" || (profile && !profile.verified)}>
                        Make offer
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
      {tab === "offers" &&
        (offers === null ? (
          <SkeletonList rows={3} />
        ) : offers.length === 0 ? (
          <EmptyState icon={TruckIcon} title="No group offers yet" />
        ) : (
          <div className="space-y-3">
            {offers.map((o) => (
              <Card key={o.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-stone-900">{o.product_name}</p>
                  <p className="text-sm text-stone-500">
                    Brgy. {o.barangay} · {formatPeso(o.price_per_unit)}/{perUnit(o.demand_unit)} · {o.available_quantity} {o.demand_unit} available
                    {o.proposed_delivery_date ? ` · delivers ${formatDate(o.proposed_delivery_date)}` : ""}
                  </p>
                </div>
                <Button variant="soft" size="sm" icon={UsersIcon} onClick={() => setContactOffer(o)}>
                  Farmers
                </Button>
              </Card>
            ))}
          </div>
        ))}
      {offering && (
        <OfferModal
          row={offering}
          onClose={() => setOffering(null)}
          onDone={() => {
            setNotice("Group offer submitted — farmers in this pool have been notified.");
            loadDemand();
            loadOffers();
          }}
        />
      )}
      {contactOffer && <OfferFarmersModal offer={contactOffer} onClose={() => setContactOffer(null)} />}
    </div>
  );
}
