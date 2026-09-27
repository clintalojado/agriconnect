import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import { useSession } from "../lib/session";
import ProductArt from "../components/ProductArt.jsx";
import { Alert, Button, Card, EmptyState, Field, Input, Modal, PageHeader, SkeletonList, Toggle, formatPeso } from "../components/ui.jsx";
import { VerificationBanner } from "../components/common.jsx";
import { CATEGORY_LABEL, perUnit } from "../components/status.jsx";
import { EditIcon, PlusIcon, StoreIcon, TrashIcon } from "../components/icons.jsx";

const UNITS = ["sacks", "bags", "kg", "liters", "bottles", "packs"];

function ListingModal({ products, listing, onClose, onSaved }) {
  const { me } = useSession();
  const [form, setForm] = useState({
    product_id: listing?.product_id ?? "",
    price: listing?.price ?? "",
    unit: listing?.unit ?? "",
    brand: listing?.brand ?? "",
    in_stock: listing ? Boolean(listing.in_stock) : true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const product = products.find((p) => String(p.id) === String(form.product_id));
      await apiClient.put(`/suppliers/${me.id}/products/${form.product_id}`, {
        price: Number(form.price),
        unit: form.unit || product?.unit,
        brand: form.brand,
        in_stock: form.in_stock,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={listing ? `Edit ${listing.product_name}` : "Add a product"}>
      <form onSubmit={save} className="space-y-3.5">
        {error && <Alert tone="error">{error}</Alert>}
        {!listing && (
          <Field label="Product">
            <select
              className="input"
              required
              value={form.product_id}
              onChange={(e) => {
                const p = products.find((x) => String(x.id) === e.target.value);
                setForm((f) => ({ ...f, product_id: e.target.value, unit: p?.unit || f.unit }));
              }}
            >
              <option value="">Choose from the catalog…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({CATEGORY_LABEL[p.category]})
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price" hint="(₱)">
            <Input type="number" min="0" step="0.01" required value={form.price} onChange={set("price")} />
          </Field>
          <Field label="Per">
            <select className="input" value={form.unit} onChange={set("unit")} required>
              <option value="">Unit</option>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {perUnit(u)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Brand" hint="(optional)">
          <Input value={form.brand} onChange={set("brand")} />
        </Field>
        <Toggle checked={form.in_stock} onChange={(v) => setForm((f) => ({ ...f, in_stock: v }))} label="In stock" />
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function MyProducts() {
  const { me } = useSession();
  const [listings, setListings] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [editing, setEditing] = useState(null); // listing | "new"

  const load = () =>
    apiClient
      .get(`/suppliers/${me.id}/products`)
      .then(setListings)
      .catch(() => setListings([]));

  useEffect(() => {
    load();
    apiClient.get("/products").then(setCatalog).catch(() => {});
  }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const available = useMemo(() => catalog.filter((p) => !listings?.some((l) => l.product_id === p.id)), [catalog, listings]);

  async function remove(l) {
    if (!window.confirm(`Remove ${l.product_name} from your products?`)) return;
    await apiClient.delete(`/suppliers/${me.id}/products/${l.product_id}`);
    load();
  }

  return (
    <div>
      <PageHeader
        title="My Products"
        description="What you sell and at what price. Farmers see your in-stock prices in the marketplace, and requests for these products show under “My Products”."
        action={
          <Button icon={PlusIcon} onClick={() => setEditing("new")} disabled={available.length === 0}>
            Add product
          </Button>
        }
      />
      <VerificationBanner />
      {listings === null ? (
        <SkeletonList rows={3} />
      ) : listings.length === 0 ? (
        <EmptyState icon={StoreIcon} title="No products yet" description="Add the farm inputs you carry." action={<Button onClick={() => setEditing("new")}>Add your first product</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {listings.map((l) => (
            <Card key={l.id} className="flex items-center gap-3 p-3">
              <ProductArt product={{ name: l.product_name, category: l.category, variant: l.variant }} className="h-16 w-16 rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-stone-900">{l.product_name}</p>
                <p className="font-extrabold text-stone-900">
                  {formatPeso(l.price)} <span className="text-xs font-medium text-stone-500">/ {perUnit(l.unit)}</span>
                </p>
                <p className={l.in_stock ? "text-xs font-semibold text-brand-700" : "text-xs font-semibold text-stone-400"}>
                  {l.in_stock ? "In stock" : "Out of stock"}
                  {l.brand ? ` · ${l.brand}` : ""}
                </p>
              </div>
              <Button size="icon" variant="ghost" aria-label={`Edit ${l.product_name}`} onClick={() => setEditing(l)}>
                <EditIcon className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" aria-label={`Remove ${l.product_name}`} onClick={() => remove(l)} className="hover:text-red-600">
                <TrashIcon className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}
      {editing && <ListingModal products={available} listing={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}
