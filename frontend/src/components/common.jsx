import { navigate } from "../lib/router";
import { useProfile } from "../lib/profile.jsx";
import { useSession } from "../lib/session";
import ProductArt from "./ProductArt.jsx";
import { Alert, Button, Card, cx, formatPeso } from "./ui.jsx";
import { PinIcon } from "./icons.jsx";
import { Rating, perUnit } from "./status.jsx";

export function SectionTitle({ title, action, onAction, className }) {
  return (
    <div className={cx("mb-3 flex items-end justify-between gap-3", className)}>
      <h2 className="text-lg font-extrabold tracking-tight text-stone-900">{title}</h2>
      {action && (
        <button type="button" onClick={onAction} className="text-sm font-semibold text-brand-700 hover:text-brand-800">
          {action}
        </button>
      )}
    </div>
  );
}

/** Marketplace product card (image, price, location, rating, "Add to Request"). */
export function ProductCard({ product, compact = false }) {
  const { role } = useSession();
  const open = () => navigate(`/marketplace/product/${product.id}`);
  const price =
    product.min_price != null ? (
      <p className="mt-1 font-extrabold text-stone-900">
        {formatPeso(product.min_price)} <span className="text-xs font-medium text-stone-500">/ {perUnit(product.price_unit)}</span>
      </p>
    ) : (
      <p className="mt-1 text-xs font-medium text-stone-400">Ask suppliers for a quote</p>
    );

  if (compact) {
    return (
      <Card className="flex items-center gap-3 p-3">
        <button type="button" onClick={open} className="shrink-0">
          <ProductArt product={product} className="h-20 w-20 rounded-xl" />
        </button>
        <button type="button" onClick={open} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-bold text-stone-900">{product.name}</p>
          {product.variant && <p className="truncate text-xs text-stone-500">{product.variant}</p>}
          {price}
          <div className="mt-0.5 flex items-center gap-3">
            <Rating value={product.rating} count={product.review_count} />
            {product.location && (
              <span className="flex items-center gap-0.5 text-xs text-stone-500">
                <PinIcon className="h-3 w-3" /> {product.location}
              </span>
            )}
          </div>
        </button>
        {role === "farmer" && (
          <Button size="sm" onClick={() => navigate("/requests/new", { product: product.id })} aria-label={`Request ${product.name}`}>
            Add
          </Button>
        )}
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lift">
      <button type="button" onClick={open} className="block">
        <ProductArt product={product} className="aspect-[4/3] w-full" />
      </button>
      <div className="flex flex-1 flex-col p-3.5">
        <button type="button" onClick={open} className="text-left">
          {/* Two lines reserved so cards in a row line up */}
          <p className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-snug text-stone-900">{product.name}</p>
        </button>
        {price}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {product.location && (
            <span className="flex items-center gap-0.5 text-xs text-stone-500">
              <PinIcon className="h-3 w-3" /> {product.location}
            </span>
          )}
          <Rating value={product.rating} count={product.review_count} />
        </div>
        {role === "farmer" && (
          <div className="mt-auto pt-3">
            <Button size="sm" className="w-full" onClick={() => navigate("/requests/new", { product: product.id })}>
              Add to Request
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Tells farmers/suppliers why they're limited until staff verify them. */
export function VerificationBanner() {
  const { role } = useSession();
  const { profile } = useProfile();
  if (!profile) return null;
  if (role === "farmer" && profile.verification_status !== "verified") {
    const status = profile.verification_status;
    return (
      <Alert
        tone={status === "rejected" ? "error" : "warning"}
        className="mb-5"
        title={
          status === "rejected"
            ? "Your profile was not approved"
            : status === "more_info"
              ? "Your barangay needs more information"
              : "Your profile is waiting for verification"
        }
      >
        {status === "pending"
          ? "Your barangay, LGU, or cooperative will check your details. You can already make requests — suppliers see them once you're verified."
          : "Please contact your barangay or cooperative office. You can review your details in Settings."}
      </Alert>
    );
  }
  if (role === "supplier" && !profile.verified) {
    return (
      <Alert tone="warning" className="mb-5" title="Your store is waiting for verification">
        You can set up your products now. Once staff verify your store, you'll appear in the marketplace and can send quotations.
      </Alert>
    );
  }
  return null;
}
