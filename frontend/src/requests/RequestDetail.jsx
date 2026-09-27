import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { useSession } from "../lib/session";
import { useRealtimeEvent } from "../lib/realtime.jsx";
import { useCall } from "../calls/CallProvider.jsx";
import ProductArt from "../components/ProductArt.jsx";
import OffersForRequest from "../farmers/OffersForRequest.jsx";
import SendQuoteModal from "../suppliers/SendQuoteModal.jsx";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  Skeleton,
  formatPeso,
  formatRelative, formatDate } from "../components/ui.jsx";
import { QUOTE_STATUS, REQUEST_STATUS, Rating, StatusBadge, perUnit } from "../components/status.jsx";
import {
  ArrowLeftIcon,
  BoxIcon,
  CalendarIcon,
  ChatIcon,
  CheckIcon,
  ClockIcon,
  MessengerIcon,
  PinIcon,
  ShieldCheckIcon,
  SmsIcon,
  TagIcon,
  TruckIcon,
  XIcon,
} from "../components/icons.jsx";

function Fact({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
      <div>
        <p className="text-xs text-stone-500">{label}</p>
        <p className="text-sm font-semibold text-stone-800">{value}</p>
      </div>
    </div>
  );
}

function QuoteCard({ quote, request, role, onAccept, onDecline, onNegotiate, busy }) {
  const open = request.display_status === "for_quotation" && quote.status === "pending";
  return (
    <Card className={quote.status === "accepted" ? "p-4 ring-2 ring-brand-400" : "p-4"}>
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => navigate(`/suppliers/${quote.supplier_id}`)} className="flex min-w-0 items-center gap-3 text-left">
          <Avatar name={quote.supplier_name} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 font-bold text-stone-900">
              <span className="leading-tight">{quote.supplier_name}</span>
              {quote.supplier_verified ? <ShieldCheckIcon className="h-4 w-4 shrink-0 text-brand-600" /> : null}
            </span>
            <span className="flex flex-wrap items-center gap-x-3 text-xs text-stone-500">
              <span className="flex items-center gap-0.5">
                <PinIcon className="h-3 w-3" /> {quote.supplier_municipality || quote.supplier_barangay || "—"}
              </span>
              <Rating value={quote.supplier_rating} count={quote.supplier_review_count} />
            </span>
          </span>
        </button>
        <span className="shrink-0">
          <StatusBadge map={QUOTE_STATUS} status={quote.status} dot={false} />
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="rounded-xl bg-stone-50 px-3 py-2">
          <p className="text-xs text-stone-500">Price</p>
          <p className="font-bold text-stone-900">
            {formatPeso(quote.price_per_unit)}/{perUnit(request.unit)}
          </p>
        </div>
        <div className="rounded-xl bg-stone-50 px-3 py-2">
          <p className="text-xs text-stone-500">Quantity</p>
          <p className="font-bold text-stone-900">
            {quote.quantity} {request.unit}
          </p>
        </div>
        <div className="rounded-xl bg-stone-50 px-3 py-2">
          <p className="text-xs text-stone-500">{quote.delivery_option === "pickup" ? "Pickup" : "Delivery"}</p>
          <p className="font-bold text-stone-900">
            {formatDate(quote.delivery_date) || "To arrange"}
            {quote.delivery_fee ? <span className="block text-xs font-medium text-stone-500">+{formatPeso(quote.delivery_fee)} fee</span> : null}
          </p>
        </div>
        <div className="rounded-xl bg-brand-50 px-3 py-2">
          <p className="text-xs text-brand-700">Total</p>
          <p className="text-lg font-extrabold text-brand-800">{formatPeso(quote.total)}</p>
        </div>
      </div>
      {quote.note && <p className="mt-3 rounded-xl bg-harvest-50 px-3 py-2 text-sm text-stone-700">“{quote.note}”</p>}
      {role === "farmer" && open && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button size="sm" icon={CheckIcon} onClick={() => onAccept(quote)} disabled={busy}>
            Accept
          </Button>
          <Button size="sm" variant="secondary" icon={ChatIcon} onClick={() => onNegotiate(quote)} disabled={busy}>
            Negotiate
          </Button>
          <Button size="sm" variant="ghost" icon={XIcon} onClick={() => onDecline(quote)} disabled={busy}>
            Decline
          </Button>
        </div>
      )}
    </Card>
  );
}

export default function RequestDetail({ id }) {
  const { role, me } = useSession();
  const { startCall } = useCall();
  const [request, setRequest] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [accepting, setAccepting] = useState(null);
  const [quoting, setQuoting] = useState(false);

  const load = useCallback(() => {
    apiClient
      .get(`/requests/detail/${id}`)
      .then((r) => {
        setRequest(r);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeEvent("notification", load);

  async function act(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const accept = () =>
    act(async () => {
      const order = await apiClient.post(`/quotes/${accepting.id}/accept`, { farmer_id: me.id });
      setAccepting(null);
      navigate(`/orders/${order.id}`);
    });
  const decline = (quote) => act(async () => (await apiClient.post(`/quotes/${quote.id}/decline`, { farmer_id: me.id }), load()));
  const negotiate = (quote) =>
    act(async () => {
      const conversation = await apiClient.post(`/quotes/${quote.id}/negotiate`, { farmer_id: me.id });
      navigate(`/messages/${conversation.id}`);
    });
  const reject = () =>
    act(async () => {
      const reason = window.prompt("Reason for rejecting this request (sent to the record):");
      if (reason === null) return;
      await apiClient.post(`/requests/${id}/reject`, { reason });
      load();
    });

  if (error && !request) return <Alert tone="error">{error}</Alert>;
  if (!request) return <Skeleton className="h-96 rounded-3xl" />;

  const myQuote = role === "supplier" ? request.quotes.find((q) => q.supplier_id === me.id) : null;
  const visibleQuotes = role === "supplier" ? (myQuote ? [myQuote] : []) : request.quotes;
  const canQuote = role === "supplier" && request.display_status === "for_quotation" && (!myQuote || myQuote.status === "pending");

  return (
    <div className="mx-auto max-w-4xl">
      <button type="button" onClick={() => window.history.back()} className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-stone-500 hover:text-stone-800">
        <ArrowLeftIcon className="h-4 w-4" /> Back
      </button>
      {error && (
        <Alert tone="error" className="mb-4" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <ProductArt product={{ name: request.product_name, category: request.product_category, variant: request.product_variant }} className="h-24 w-24 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Request #{request.id}</p>
            <h1 className="text-2xl font-extrabold text-stone-900">{request.product_name}</h1>
            <p className="text-stone-600">
              {request.quantity} {request.unit}
              {role !== "farmer" && ` · ${request.farmer_name}`}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <StatusBadge map={REQUEST_STATUS} status={request.display_status} />
            {canQuote && (
              <Button icon={TagIcon} onClick={() => setQuoting(true)}>
                {myQuote ? "Update quote" : "Send Quote"}
              </Button>
            )}
            {role === "staff" && !request.order_id && request.status !== "rejected" && (
              <Button variant="danger" size="sm" onClick={reject} loading={busy}>
                Reject request
              </Button>
            )}
          </div>
        </div>
        <div className="grid gap-4 border-t border-stone-100 bg-stone-50/60 p-5 sm:grid-cols-3">
          <Fact icon={PinIcon} label="Delivery location" value={request.delivery_location || `Brgy. ${request.barangay}`} />
          <Fact icon={CalendarIcon} label="Needed by" value={request.needed_by && request.preferred_date !== request.needed_by ? `${request.preferred_date || ""} (${formatDate(request.needed_by)})`.trim() : formatDate(request.preferred_date || request.needed_by)} />
          <Fact icon={ClockIcon} label="Requested" value={formatRelative(request.created_at)} />
          <Fact
            icon={request.channel === "messenger" ? MessengerIcon : request.channel === "sms" ? SmsIcon : BoxIcon}
            label="Sent via"
            value={{ app: "AgriConnect app", sms: "SMS", messenger: "Messenger" }[request.channel]}
          />
          {request.notes && <Fact icon={ChatIcon} label="Notes" value={request.notes} />}
        </div>
        {request.channel !== "app" && request.raw_message && (
          <div className="border-t border-stone-100 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Original message</p>
            <p className="mt-1 whitespace-pre-wrap text-sm italic text-stone-600">“{request.raw_message}”</p>
          </div>
        )}
      </Card>

      {request.display_status === "awaiting_verification" && (
        <Alert tone="warning" className="mt-4" title="Waiting for farmer verification">
          Suppliers will see this request once the barangay, LGU, or cooperative verifies the farmer's profile.
        </Alert>
      )}

      {request.order_id && (
        <Card className="mt-4 flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
            <TruckIcon className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="font-bold text-stone-900">Order {request.order_code}</p>
            <p className="text-sm text-stone-500">
              with {request.order_supplier_name} · {formatPeso(request.order_total)}
            </p>
          </div>
          <Button onClick={() => navigate(`/orders/${request.order_id}`)}>Track order</Button>
        </Card>
      )}

      <h2 className="mb-3 mt-8 flex items-center gap-2 text-lg font-extrabold text-stone-900">
        {role === "supplier" ? "Your quotation" : "Quotations"}
        {role !== "supplier" && request.quotes.length > 0 && <Badge tone="green">{request.quotes.length}</Badge>}
      </h2>
      {visibleQuotes.length === 0 ? (
        <EmptyState
          icon={TagIcon}
          title={role === "supplier" ? "You haven't quoted yet" : "No quotations yet"}
          description={
            role === "supplier"
              ? "Check your stock and send the farmer your price, quantity, and delivery option."
              : "Verified suppliers who sell this product or cover your barangay have been notified."
          }
          action={canQuote ? <Button onClick={() => setQuoting(true)}>Send Quote</Button> : null}
        />
      ) : (
        <div className="space-y-3">
          {visibleQuotes.map((q) => (
            <QuoteCard key={q.id} quote={q} request={request} role={role} busy={busy} onAccept={setAccepting} onDecline={decline} onNegotiate={negotiate} />
          ))}
        </div>
      )}
      {role === "supplier" && request.quotes.length > 1 && (
        <p className="mt-2 text-xs text-stone-500">{request.quotes.length - 1} other supplier(s) also quoted. Their prices are private.</p>
      )}

      {role === "farmer" && request.display_status === "for_quotation" && (
        <div className="mt-8">
          <h2 className="mb-1 text-lg font-extrabold text-stone-900">Barangay group offers</h2>
          <p className="mb-3 text-sm text-stone-500">Offers made to everyone in Brgy. {request.barangay} who needs this product.</p>
          <OffersForRequest requestId={request.id} farmerId={me.id} />
        </div>
      )}

      {role === "supplier" && (
        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={ChatIcon}
            onClick={async () => {
              const c = await apiClient.post("/conversations", { farmer_id: request.farmer_id, supplier_id: me.id });
              navigate(`/messages/${c.id}`);
            }}
          >
            Message farmer
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              const c = await apiClient.post("/conversations", { farmer_id: request.farmer_id, supplier_id: me.id });
              startCall(c);
            }}
          >
            Call farmer
          </Button>
        </div>
      )}

      {accepting && (
        <Modal
          open
          onClose={() => setAccepting(null)}
          title="Accept this quotation?"
          subtitle={`${accepting.supplier_name} will be asked to prepare your order.`}
          footer={
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setAccepting(null)}>
                Not yet
              </Button>
              <Button className="flex-1" loading={busy} onClick={accept}>
                Confirm order
              </Button>
            </div>
          }
        >
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-500">
                {accepting.quantity} {request.unit} × {formatPeso(accepting.price_per_unit)}
              </dt>
              <dd className="font-semibold">{formatPeso(accepting.quantity * accepting.price_per_unit)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500">{accepting.delivery_option === "pickup" ? "Pickup" : "Delivery fee"}</dt>
              <dd className="font-semibold">{formatPeso(accepting.delivery_fee)}</dd>
            </div>
            <div className="flex justify-between border-t border-stone-100 pt-2 text-base">
              <dt className="font-bold">Total</dt>
              <dd className="font-extrabold text-brand-700">{formatPeso(accepting.total)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-stone-500">Other quotations for this request will be declined.</p>
        </Modal>
      )}
      {quoting && <SendQuoteModal request={request} existing={myQuote?.status === "pending" ? myQuote : null} onClose={() => setQuoting(false)} onSent={load} />}
    </div>
  );
}
