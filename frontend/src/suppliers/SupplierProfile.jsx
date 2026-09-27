import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { useSession } from "../lib/session";
import { useContact } from "../messenger/useContact";
import ProductArt from "../components/ProductArt.jsx";
import { Alert, Avatar, Badge, Button, Card, EmptyState, Skeleton, formatPeso, formatRelative } from "../components/ui.jsx";
import { CATEGORY_LABEL, Rating, perUnit } from "../components/status.jsx";
import { ArrowLeftIcon, ChatIcon, PhoneIcon, PinIcon, ShieldCheckIcon, StarIcon, StoreIcon } from "../components/icons.jsx";

export default function SupplierProfile({ id }) {
  const { role, me } = useSession();
  const contact = useContact();
  const [s, setS] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiClient.get(`/suppliers/${id}`).then(setS).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!s) return <Skeleton className="h-80 rounded-3xl" />;
  const pair = role === "farmer" ? { farmer_id: me.id, supplier_id: s.id } : null;

  return (
    <div className="mx-auto max-w-4xl">
      <button type="button" onClick={() => window.history.back()} className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-stone-500 hover:text-stone-800">
        <ArrowLeftIcon className="h-4 w-4" /> Back
      </button>
      <Card className="overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-brand-700 to-brand-900" />
        <div className="-mt-10 flex flex-col gap-4 p-5 sm:flex-row sm:items-end">
          <Avatar name={s.name} size="xl" className="ring-4 ring-white" />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-2xl font-extrabold text-stone-900">
              {s.name} {s.verified && <ShieldCheckIcon className="h-6 w-6 text-brand-600" aria-label="Verified supplier" />}
            </h1>
            <p className="flex items-center gap-1 text-sm text-stone-500">
              <PinIcon className="h-4 w-4" /> {[s.barangay, s.municipality].filter(Boolean).join(", ") || "—"}
              {s.contact_person && ` · ${s.contact_person}`}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Rating value={s.rating} count={s.review_count} className="text-sm" />
              {s.verified ? <Badge tone="green">Verified Supplier</Badge> : <Badge tone="amber">Not yet verified</Badge>}
              {s.completed_orders > 0 && <Badge tone="stone">{s.completed_orders} completed orders</Badge>}
            </div>
          </div>
          {pair && (
            <div className="flex gap-2">
              <Button icon={ChatIcon} loading={contact.isBusy("message", pair)} onClick={() => contact.message(pair)}>
                Chat
              </Button>
              <Button variant="secondary" icon={PhoneIcon} loading={contact.isBusy("call", pair)} onClick={() => contact.call(pair)}>
                Call
              </Button>
            </div>
          )}
        </div>
        {s.coverage_barangays && (
          <div className="border-t border-stone-100 px-5 py-3 text-sm text-stone-600">
            <span className="font-semibold text-stone-800">Delivers to:</span> {s.coverage_barangays}
          </div>
        )}
      </Card>

      <h2 className="mb-3 mt-8 text-lg font-extrabold text-stone-900">Products ({s.listings.length})</h2>
      {s.listings.length === 0 ? (
        <EmptyState icon={StoreIcon} title="No products listed yet" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {s.listings.map((l) => (
            <Card key={l.id} className="flex items-center gap-3 p-3">
              <ProductArt product={{ name: l.product_name, category: l.category, variant: l.variant }} className="h-16 w-16 rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-stone-900">{l.product_name}</p>
                <p className="text-xs text-stone-500">{CATEGORY_LABEL[l.category]}{l.brand ? ` · ${l.brand}` : ""}</p>
                <p className="font-extrabold text-stone-900">
                  {formatPeso(l.price)} <span className="text-xs font-medium text-stone-500">/ {perUnit(l.unit)}</span>
                  {!l.in_stock && <span className="ml-2 text-xs font-semibold text-stone-400">Out of stock</span>}
                </p>
              </div>
              {role === "farmer" && (
                <Button size="sm" onClick={() => navigate("/requests/new", { product: l.product_id, supplier: s.id })} disabled={!l.in_stock}>
                  Request
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-lg font-extrabold text-stone-900">Farmer reviews</h2>
      {s.reviews.length === 0 ? (
        <p className="text-sm text-stone-500">No reviews yet.</p>
      ) : (
        <div className="space-y-3">
          {s.reviews.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-stone-900">{r.farmer_name}</p>
                <span className="flex text-harvest-400">
                  {Array.from({ length: r.rating }, (_, i) => (
                    <StarIcon key={i} filled className="h-4 w-4" />
                  ))}
                </span>
              </div>
              <p className="text-xs text-stone-500">
                {r.product_name} · {formatRelative(r.created_at)}
              </p>
              {r.comment && <p className="mt-2 text-sm text-stone-700">{r.comment}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
