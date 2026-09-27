import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { useSession } from "../lib/session";
import { useContact } from "../messenger/useContact";
import ProductArt from "../components/ProductArt.jsx";
import { Alert, Avatar, Badge, Button, Card, EmptyState, Skeleton, formatPeso } from "../components/ui.jsx";
import { Rating, perUnit, CATEGORY_LABEL } from "../components/status.jsx";
import { ArrowLeftIcon, ChatIcon, ClipboardIcon, PhoneIcon, PinIcon, ShieldCheckIcon, StoreIcon } from "../components/icons.jsx";

export default function ProductDetails({ id }) {
  const { role, me } = useSession();
  const contact = useContact();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiClient.get(`/products/${id}`).then(setProduct).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!product) return <Skeleton className="h-96 rounded-3xl" />;

  const best = product.listings.find((l) => l.in_stock);
  const isFarmer = role === "farmer";

  return (
    <div>
      <button type="button" onClick={() => window.history.back()} className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-stone-500 hover:text-stone-800">
        <ArrowLeftIcon className="h-4 w-4" /> Back
      </button>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <ProductArt product={product} className="aspect-square w-full rounded-3xl lg:aspect-[4/3]" />
        <div>
          <Badge tone="green">{CATEGORY_LABEL[product.category]}</Badge>
          <h1 className="mt-2 text-2xl font-extrabold text-stone-900 sm:text-3xl">{product.name}</h1>
          {product.variant && <p className="text-stone-500">{product.variant}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            {product.min_price != null ? (
              <p className="text-2xl font-extrabold text-brand-700">
                {formatPeso(product.min_price)} <span className="text-sm font-medium text-stone-500">/ {perUnit(product.price_unit)} · lowest</span>
              </p>
            ) : (
              <p className="font-semibold text-stone-500">No listed price yet — request a quotation</p>
            )}
            <Rating value={product.rating} count={product.review_count} className="text-sm" />
          </div>
          {best && (
            <p className="mt-1 flex items-center gap-1.5 text-sm">
              <span className="font-semibold text-brand-700">● In stock</span>
              <span className="text-stone-400">·</span>
              <PinIcon className="h-3.5 w-3.5 text-stone-400" /> <span className="text-stone-600">{best.municipality || best.barangay}</span>
            </p>
          )}
          <h2 className="mt-5 text-sm font-bold text-stone-900">Product description</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{product.description}</p>

          {isFarmer && (
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                size="lg"
                icon={ChatIcon}
                disabled={!best}
                loading={best && contact.isBusy("message", { farmer_id: me.id, supplier_id: best.supplier_id })}
                onClick={() => contact.message({ farmer_id: me.id, supplier_id: best.supplier_id })}
              >
                Chat Supplier
              </Button>
              <Button size="lg" icon={ClipboardIcon} onClick={() => navigate("/requests/new", { product: product.id })}>
                Add to Request
              </Button>
            </div>
          )}
        </div>
      </div>

      <h2 className="mb-3 mt-10 text-lg font-extrabold text-stone-900">Suppliers selling this ({product.listings.length})</h2>
      {product.listings.length === 0 ? (
        <EmptyState icon={StoreIcon} title="No verified supplier lists this yet" description="You can still request it — suppliers who carry it will send quotations." />
      ) : (
        <div className="space-y-3">
          {product.listings.map((l) => {
            const pair = isFarmer ? { farmer_id: me.id, supplier_id: l.supplier_id } : null;
            return (
              <Card key={l.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <button type="button" onClick={() => navigate(`/suppliers/${l.supplier_id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar name={l.supplier_name} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-bold text-stone-900">
                      <span className="truncate">{l.supplier_name}</span>
                      {l.verified ? <ShieldCheckIcon className="h-4 w-4 shrink-0 text-brand-600" aria-label="Verified supplier" /> : null}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 text-xs text-stone-500">
                      <span className="flex items-center gap-0.5">
                        <PinIcon className="h-3 w-3" /> {[l.barangay, l.municipality].filter(Boolean).join(", ") || "—"}
                      </span>
                      <Rating value={l.supplier_rating} count={l.supplier_review_count} />
                      {l.brand && <span>Brand: {l.brand}</span>}
                    </span>
                  </span>
                </button>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <div className="text-right">
                    <p className="font-extrabold text-stone-900">
                      {formatPeso(l.price)} <span className="text-xs font-medium text-stone-500">/ {perUnit(l.unit)}</span>
                    </p>
                    <p className={l.in_stock ? "text-xs font-semibold text-brand-700" : "text-xs font-semibold text-stone-400"}>
                      {l.in_stock ? "In stock" : "Out of stock"}
                    </p>
                  </div>
                  {isFarmer && (
                    <div className="flex gap-1.5">
                      <Button size="icon" variant="soft" aria-label={`Chat ${l.supplier_name}`} loading={contact.isBusy("message", pair)} onClick={() => contact.message(pair)}>
                        {!contact.isBusy("message", pair) && <ChatIcon className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="soft" aria-label={`Call ${l.supplier_name}`} loading={contact.isBusy("call", pair)} onClick={() => contact.call(pair)}>
                        {!contact.isBusy("call", pair) && <PhoneIcon className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" onClick={() => navigate("/requests/new", { product: product.id, supplier: l.supplier_id })}>
                        Request
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
