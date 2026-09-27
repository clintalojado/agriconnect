import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { useSession } from "../lib/session";
import { Alert, Button, Field, Input, Modal, Textarea, cx, formatPeso } from "../components/ui.jsx";
import { perUnit } from "../components/status.jsx";

/** Supplier quotation form (BPMN: check stock & location → submit price, quantity, delivery option, timing). */
export default function SendQuoteModal({ request, existing, onClose, onSent }) {
  const { me } = useSession();
  const [listing, setListing] = useState(null);
  const [form, setForm] = useState({
    price_per_unit: existing?.price_per_unit ?? "",
    quantity: existing?.quantity ?? request.quantity,
    delivery_fee: existing?.delivery_fee ?? 0,
    delivery_option: existing?.delivery_option ?? "delivery",
    delivery_date: existing?.delivery_date ?? request.needed_by ?? "",
    note: existing?.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Prefill the price from the supplier's own listing for this product.
  useEffect(() => {
    apiClient
      .get(`/suppliers/${me.id}/products`)
      .then((rows) => {
        const match = rows.find((l) => l.product_id === request.product_id);
        setListing(match || null);
        if (match && !existing) setForm((f) => ({ ...f, price_per_unit: f.price_per_unit || match.price }));
      })
      .catch(() => {});
  }, [me.id, request.product_id, existing]);

  const total = Number(form.price_per_unit) * Number(form.quantity) + Number(form.delivery_fee || 0);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const quote = await apiClient.post("/quotes", {
        request_id: request.id,
        supplier_id: me.id,
        price_per_unit: Number(form.price_per_unit),
        quantity: Number(form.quantity),
        delivery_fee: Number(form.delivery_fee || 0),
        delivery_option: form.delivery_option,
        delivery_date: form.delivery_date || null,
        note: form.note,
      });
      onSent?.(quote);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? "Update your quotation" : "Send Quote"}
      subtitle={`${request.quantity} ${request.unit} ${request.product_name} · Brgy. ${request.barangay}${request.preferred_date ? ` · needed ${request.preferred_date}` : ""}`}
    >
      <form onSubmit={submit} className="space-y-3.5">
        {error && <Alert tone="error">{error}</Alert>}
        {listing && !listing.in_stock && <Alert tone="warning">Your listing says this product is out of stock.</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Price per ${perUnit(request.unit)}`} hint="(₱)">
            <Input type="number" min="0" step="0.01" required value={form.price_per_unit} onChange={set("price_per_unit")} />
          </Field>
          <Field label="Quantity">
            <Input type="number" min="0" step="any" required value={form.quantity} onChange={set("quantity")} />
          </Field>
        </div>
        <Field label="Delivery option">
          <div className="grid grid-cols-2 gap-2">
            {[
              ["delivery", "Deliver to barangay"],
              ["pickup", "Farmer picks up"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, delivery_option: value, delivery_fee: value === "pickup" ? 0 : f.delivery_fee }))}
                className={cx(
                  "rounded-xl border px-3 py-2.5 text-sm font-semibold",
                  form.delivery_option === value ? "border-brand-500 bg-brand-50 text-brand-800" : "border-stone-300 text-stone-600 hover:bg-stone-50"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={form.delivery_option === "pickup" ? "Ready on" : "Delivery date"}>
            <Input type="date" value={form.delivery_date || ""} onChange={set("delivery_date")} />
          </Field>
          <Field label="Delivery fee" hint="(₱)">
            <Input type="number" min="0" step="0.01" value={form.delivery_fee} onChange={set("delivery_fee")} disabled={form.delivery_option === "pickup"} />
          </Field>
        </div>
        <Field label="Note to farmer" hint="(optional)">
          <Textarea rows={2} value={form.note} onChange={set("note")} placeholder="e.g. brand, payment on delivery" />
        </Field>
        {total > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3 text-sm">
            <span className="font-medium text-brand-800">Quotation total</span>
            <span className="text-lg font-extrabold text-brand-800">{formatPeso(total)}</span>
          </div>
        )}
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" loading={busy}>
            {existing ? "Update quote" : "Send quote"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
