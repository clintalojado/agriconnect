import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { useSession } from "../lib/session";
import { useRealtimeEvent } from "../lib/realtime.jsx";
import { useContact } from "../messenger/useContact";
import ProductArt from "../components/ProductArt.jsx";
import { Alert, Button, Card, Field, Input, Skeleton, Textarea, cx, formatPeso, parseDbDate, useToast, formatDate } from "../components/ui.jsx";
import { ORDER_STATUS, StarInput, StatusBadge, perUnit } from "../components/status.jsx";
import { ArrowLeftIcon, ChatIcon, CheckIcon, PhoneIcon, StarIcon, TruckIcon, XIcon } from "../components/icons.jsx";

function when(value) {
  const d = parseDbDate(value);
  return d ? d.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : null;
}

function Timeline({ steps }) {
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const current = s.done && !steps[i + 1]?.done;
        return (
          <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && <span className={cx("absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5", s.done && steps[i + 1]?.done ? "bg-brand-500" : "bg-stone-200")} />}
            <span
              className={cx(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                s.key === "cancelled" ? "bg-red-500 text-white" : s.done ? "bg-brand-600 text-white" : "border-2 border-stone-200 bg-white text-stone-300",
                current && s.key !== "cancelled" && "ring-4 ring-brand-100"
              )}
            >
              {s.key === "cancelled" ? <XIcon className="h-4 w-4" /> : s.key === "for_delivery" && s.done ? <TruckIcon className="h-4 w-4" /> : <CheckIcon className="h-4 w-4" />}
            </span>
            <div className="pt-1">
              <p className={cx("font-bold", s.done ? "text-stone-900" : "text-stone-400")}>{s.label}</p>
              <p className="text-xs text-stone-500">{[when(s.at), s.detail?.replace(/\d{4}-\d{2}-\d{2}/g, formatDate)].filter(Boolean).join(" · ") || (s.done ? "" : "Pending")}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ReviewBox({ order, onDone }) {
  const { me } = useSession();
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiClient.post(`/orders/${order.id}/review`, { farmer_id: me.id, rating, comment });
      if (res.points_awarded) toast({ title: `+${res.points_awarded} AgriPoints`, body: "Thanks for rating your supplier!", tone: "success" });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="font-bold text-stone-900">Rate {order.supplier_name}</h2>
      <p className="text-sm text-stone-500">Your rating helps other farmers choose — and earns you AgriPoints.</p>
      <form onSubmit={submit} className="mt-3 space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <StarInput value={rating} onChange={setRating} />
        <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="How was the product and delivery? (optional)" />
        <Button type="submit" disabled={!rating} loading={busy}>
          Submit rating
        </Button>
      </form>
    </Card>
  );
}

export default function OrderTracking({ id }) {
  const { role, me } = useSession();
  const contact = useContact();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [deliveryDate, setDeliveryDate] = useState("");

  const load = useCallback(() => {
    apiClient
      .get(`/orders/${id}`)
      .then((o) => {
        setOrder(o);
        setDeliveryDate((d) => d || o.delivery_date || "");
      })
      .catch((err) => setError(err.message));
  }, [id]);
  useEffect(load, [load]);
  useRealtimeEvent("notification", load);

  async function move(status) {
    if (status === "cancelled" && !window.confirm("Cancel this order? The request goes back to receiving quotations.")) return;
    setBusy(status);
    setError(null);
    try {
      setOrder(
        await apiClient.post(`/orders/${id}/status`, {
          actor_type: role,
          actor_id: role === "staff" ? null : me.id,
          status,
          delivery_date: status === "for_delivery" ? deliveryDate || null : undefined,
        })
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (error && !order) return <Alert tone="error">{error}</Alert>;
  if (!order) return <Skeleton className="h-96 rounded-3xl" />;

  const pair = { farmer_id: order.farmer_id, supplier_id: order.supplier_id };
  const isSupplier = role === "supplier" || role === "staff";
  const isFarmer = role === "farmer" || role === "staff";
  const pickup = order.delivery_option === "pickup";

  return (
    <div className="mx-auto max-w-4xl">
      <button type="button" onClick={() => window.history.back()} className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-stone-500 hover:text-stone-800">
        <ArrowLeftIcon className="h-4 w-4" /> Back
      </button>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Order</p>
          <h1 className="text-2xl font-extrabold text-stone-900">#{order.code}</h1>
        </div>
        <StatusBadge map={ORDER_STATUS} status={order.status} />
      </div>
      {error && (
        <Alert tone="error" className="mb-4" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="grid gap-5 md:grid-cols-[1fr_1.1fr]">
        <Card className="p-5">
          <h2 className="mb-4 font-bold text-stone-900">Tracking</h2>
          <Timeline steps={order.timeline} />
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-3 font-bold text-stone-900">Order details</h2>
            <div className="flex items-center gap-3">
              <ProductArt product={{ name: order.product_name, category: order.product_category }} className="h-14 w-14 rounded-xl" />
              <div className="flex-1">
                <p className="font-semibold text-stone-900">{order.product_name}</p>
                <p className="text-sm text-stone-500">
                  {order.quantity} {order.unit} × {formatPeso(order.price_per_unit)}/{perUnit(order.unit)}
                </p>
              </div>
              <p className="font-bold">{formatPeso(order.quantity * order.price_per_unit)}</p>
            </div>
            <dl className="mt-4 space-y-2 border-t border-stone-100 pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-stone-500">{pickup ? "Pickup" : "Delivery fee"}</dt>
                <dd className="font-semibold">{pickup ? "Farmer picks up" : formatPeso(order.delivery_fee)}</dd>
              </div>
              <div className="flex justify-between text-base">
                <dt className="font-bold">Total</dt>
                <dd className="font-extrabold text-brand-700">{formatPeso(order.total)}</dd>
              </div>
            </dl>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-stone-100 pt-3 text-sm">
              <div>
                <dt className="text-xs text-stone-500">Supplier</dt>
                <dd className="font-semibold">{order.supplier_name}</dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">Farmer</dt>
                <dd className="font-semibold">{order.farmer_name}</dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">{pickup ? "Pickup from" : "Deliver to"}</dt>
                <dd className="font-semibold">{pickup ? [order.supplier_barangay, order.supplier_municipality].filter(Boolean).join(", ") : order.delivery_location}</dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">Date</dt>
                <dd className="font-semibold">{formatDate(order.delivery_date) || "To be scheduled"}</dd>
              </div>
            </dl>
          </Card>

          {/* Actions for the current step */}
          {order.status === "confirmed" && isSupplier && (
            <Card className="p-5">
              <h2 className="font-bold text-stone-900">{pickup ? "Ready for pickup?" : "Ready to deliver?"}</h2>
              <Field label={pickup ? "Pickup date" : "Delivery date"} className="mt-3">
                <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
              </Field>
              <div className="mt-3 flex gap-2">
                <Button icon={TruckIcon} loading={busy === "for_delivery"} onClick={() => move("for_delivery")}>
                  {pickup ? "Mark ready for pickup" : "Mark for delivery"}
                </Button>
                <Button variant="ghost" loading={busy === "cancelled"} onClick={() => move("cancelled")}>
                  Cancel order
                </Button>
              </div>
            </Card>
          )}
          {order.status === "for_delivery" && isSupplier && (
            <Button className="w-full" size="lg" icon={CheckIcon} loading={busy === "delivered"} onClick={() => move("delivered")}>
              {pickup ? "Mark picked up" : "Mark delivered"}
            </Button>
          )}
          {["for_delivery", "delivered"].includes(order.status) && isFarmer && (
            <Card className="bg-brand-50 p-5 ring-1 ring-brand-200">
              <h2 className="font-bold text-brand-900">Received your farm inputs?</h2>
              <p className="text-sm text-brand-800/80">Confirm once you have them to complete the order.</p>
              <Button className="mt-3" icon={CheckIcon} loading={busy === "completed"} onClick={() => move("completed")}>
                Yes, I received them
              </Button>
            </Card>
          )}
          {order.status === "confirmed" && role === "farmer" && (
            <Button variant="ghost" className="w-full" loading={busy === "cancelled"} onClick={() => move("cancelled")}>
              Cancel order
            </Button>
          )}
          {order.status === "completed" && role === "farmer" && !order.my_rating && <ReviewBox order={order} onDone={load} />}
          {order.my_rating && (
            <Card className="flex items-center gap-2 p-4 text-sm">
              <span className="flex text-harvest-400">
                {Array.from({ length: order.my_rating }, (_, i) => (
                  <StarIcon key={i} filled className="h-4 w-4" />
                ))}
              </span>
              <span className="text-stone-600">{order.my_review || "Rated"}</span>
            </Card>
          )}

          {role !== "staff" && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="lg" icon={ChatIcon} loading={contact.isBusy("message", pair)} onClick={() => contact.message(pair)}>
                {role === "farmer" ? "Contact Supplier" : "Message Farmer"}
              </Button>
              <Button variant="secondary" size="lg" icon={PhoneIcon} loading={contact.isBusy("call", pair)} onClick={() => contact.call(pair)}>
                Call
              </Button>
            </div>
          )}
          <button type="button" onClick={() => navigate(`/requests/${order.request_id}`)} className="text-sm font-semibold text-brand-700 hover:text-brand-800">
            View original request →
          </button>
        </div>
      </div>
    </div>
  );
}
