import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { useSession } from "../lib/session";
import { useProfile } from "../lib/profile.jsx";
import ProductArt from "../components/ProductArt.jsx";
import { Alert, Button, Card, Field, Input, PageHeader, Segmented, Textarea, formatPeso } from "../components/ui.jsx";
import { VerificationBanner } from "../components/common.jsx";
import { CATEGORY_LABEL, perUnit } from "../components/status.jsx";
import { ClipboardIcon, SparkleIcon } from "../components/icons.jsx";
import AiComposer from "./AiComposer.jsx";

const UNITS = ["sacks", "bags", "kg", "liters", "bottles", "packs"];

function StructuredForm({ query }) {
  const { me } = useSession();
  const { profile } = useProfile();
  const [products, setProducts] = useState([]);
  const [product, setProduct] = useState(null); // detail with listings
  const [form, setForm] = useState({
    product_id: query.product || "",
    quantity: "",
    unit: "",
    preferred_supplier_id: query.supplier || "",
    needed_by: "",
    delivery_location: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    apiClient.get("/products").then(setProducts).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.product_id) return setProduct(null);
    apiClient
      .get(`/products/${form.product_id}`)
      .then((p) => {
        setProduct(p);
        setForm((f) => ({ ...f, unit: f.unit || p.unit }));
      })
      .catch(() => setProduct(null));
  }, [form.product_id]);

  useEffect(() => {
    if (profile && !form.delivery_location) {
      setForm((f) => ({ ...f, delivery_location: `Brgy. ${profile.barangay}, ${profile.municipality}` }));
    }
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => {
    const out = {};
    for (const p of products) (out[p.category] ||= []).push(p);
    return out;
  }, [products]);

  const selectedListing = product?.listings.find((l) => String(l.supplier_id) === String(form.preferred_supplier_id));
  const reference = selectedListing || product?.listings.find((l) => l.in_stock);
  const estimate = reference && Number(form.quantity) > 0 ? reference.price * Number(form.quantity) : null;
  const today = new Date().toISOString().slice(0, 10);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const request = await apiClient.post("/requests/create", {
        farmer_id: me.id,
        product_id: Number(form.product_id),
        quantity: Number(form.quantity),
        unit: form.unit,
        preferred_supplier_id: form.preferred_supplier_id ? Number(form.preferred_supplier_id) : null,
        needed_by: form.needed_by || null,
        delivery_location: form.delivery_location,
        notes: form.notes,
      });
      navigate(`/requests/${request.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {product && (
        <div className="flex items-center gap-3 rounded-2xl bg-stone-50 p-3">
          <ProductArt product={product} className="h-14 w-14 rounded-xl" />
          <div>
            <p className="font-bold text-stone-900">{product.name}</p>
            <p className="text-sm text-stone-500">
              {product.min_price != null ? `from ${formatPeso(product.min_price)} / ${perUnit(product.price_unit)}` : "No listed price yet"}
            </p>
          </div>
        </div>
      )}
      <Field label="Product">
        <select value={form.product_id} onChange={set("product_id")} required className="input">
          <option value="">Choose a farm input…</option>
          {Object.entries(grouped).map(([category, items]) => (
            <optgroup key={category} label={CATEGORY_LABEL[category]}>
              {items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-[1fr_140px] gap-3">
        <Field label="Quantity">
          <Input type="number" min="0" step="any" value={form.quantity} onChange={set("quantity")} required placeholder="5" />
        </Field>
        <Field label="Unit">
          <select value={form.unit} onChange={set("unit")} required className="input">
            <option value="">Unit</option>
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Preferred supplier" hint="(optional)">
        <select value={form.preferred_supplier_id} onChange={set("preferred_supplier_id")} className="input" disabled={!product}>
          <option value="">Any supplier — get several quotations</option>
          {product?.listings.map((l) => (
            <option key={l.supplier_id} value={l.supplier_id}>
              {l.supplier_name} — {formatPeso(l.price)}/{perUnit(l.unit)}
              {l.in_stock ? "" : " (out of stock)"}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Needed by">
          <Input type="date" min={today} value={form.needed_by} onChange={set("needed_by")} />
        </Field>
        <Field label="Delivery location">
          <Input value={form.delivery_location} onChange={set("delivery_location")} placeholder="Barangay Hall, Brgy. Katipunan" />
        </Field>
      </div>
      <Field label="Additional notes" hint="(optional)">
        <Textarea rows={3} value={form.notes} onChange={set("notes")} placeholder="e.g. preferred brand, delivery instructions" />
      </Field>
      {estimate != null && (
        <div className="flex items-center justify-between rounded-2xl bg-brand-50 px-4 py-3 text-sm">
          <span className="font-medium text-brand-800">Estimate at listed price{selectedListing ? "" : " (lowest)"}</span>
          <span className="text-lg font-extrabold text-brand-800">{formatPeso(estimate)}</span>
        </div>
      )}
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        Submit Request
      </Button>
      <p className="text-center text-xs text-stone-500">Suppliers send quotations; you choose which one to accept.</p>
    </form>
  );
}

export default function CreateRequest({ query }) {
  const [mode, setMode] = useState(query.mode === "ai" ? "ai" : "form");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="New request" title="Create Request" description="Ask verified suppliers for quotations. You'll pick the best one." />
      <VerificationBanner />
      <Segmented
        className="mb-5"
        value={mode}
        onChange={setMode}
        options={[
          { value: "form", label: "Fill in a form", icon: ClipboardIcon },
          { value: "ai", label: "Type or speak it", icon: SparkleIcon },
        ]}
      />
      <Card className="p-5 sm:p-6">{mode === "form" ? <StructuredForm query={query} /> : <AiComposer />}</Card>
    </div>
  );
}
