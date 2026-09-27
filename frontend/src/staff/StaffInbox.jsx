import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { useRealtimeEvent } from "../lib/realtime.jsx";
import { Alert, Avatar, Badge, Button, Card, EmptyState, Input, PageHeader, SkeletonList, cx, formatRelative, formatTime } from "../components/ui.jsx";
import { INBOUND_STATUS, StatusBadge, VERIFICATION_STATUS } from "../components/status.jsx";
import { CalendarIcon, ClipboardIcon, InboxIcon, MessengerIcon, PinIcon, PlusIcon, SmsIcon, SparkleIcon, TrashIcon, UsersIcon } from "../components/icons.jsx";

const UNITS = ["sacks", "bags", "kg", "liters", "bottles", "packs"];
const OPEN = ["new", "needs_info", "awaiting_confirmation"];

function ChannelIcon({ channel, className = "h-4 w-4" }) {
  return channel === "messenger" ? <MessengerIcon className={cx(className, "text-sky-600")} /> : <SmsIcon className={cx(className, "text-harvest-500")} />;
}

function Preview({ message, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const x = message.extraction || { items: [] };

  useEffect(() => {
    setEditing(false);
    setError(null);
    setDraft({
      items: (x.items || []).map((i) => ({ ...i })),
      preferred_date: x.preferred_date || "",
      preferred_date_iso: x.preferred_date_iso || "",
      delivery_location: x.delivery_location || (message.farmer_barangay ? `Brgy. ${message.farmer_barangay}, ${message.farmer_municipality}` : ""),
    });
  }, [message.id, message.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(kind, fn) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const process = () => run("process", () => apiClient.post(`/inbound/${message.id}/process`));
  const publish = () =>
    run("publish", async () => {
      const res = await apiClient.post(`/inbound/${message.id}/publish`, editing ? draft : {});
      setEditing(false);
      if (res.requests?.[0]) navigate(`/requests/${res.requests[0].id}`);
    });
  const dismiss = () => run("dismiss", () => apiClient.post(`/inbound/${message.id}/dismiss`));

  const open = OPEN.includes(message.status);
  const items = editing ? draft.items : x.items || [];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <div>
          <h2 className="font-bold text-stone-900">Structured Request (Preview)</h2>
          <p className="text-xs text-stone-500">
            Message #{message.id} · {formatRelative(message.created_at)}
            {message.confirmed_by && ` · confirmed by ${message.confirmed_by}`}
          </p>
        </div>
        <StatusBadge map={INBOUND_STATUS} status={message.status} />
      </div>
      <div className="space-y-4 p-5">
        <div className="rounded-2xl bg-stone-50 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-400">
            <ChannelIcon channel={message.channel} className="h-3.5 w-3.5" /> Original message
          </p>
          <p className="whitespace-pre-wrap text-sm italic text-stone-700">“{message.body}”</p>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        {message.status === "awaiting_confirmation" && (
          <Alert tone="info">The farmer was asked to reply OO to confirm. You can also publish it for them (assisted mode).</Alert>
        )}
        {message.farmer_verification && message.farmer_verification !== "verified" && (
          <Alert tone="warning">This farmer isn't verified yet — published requests are held until verification.</Alert>
        )}

        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-3 text-sm">
          <dt className="flex items-center gap-1.5 text-stone-500">
            <UsersIcon className="h-4 w-4" /> Farmer
          </dt>
          <dd className="font-semibold text-stone-900">
            {message.farmer_name || "Not registered"}
            {message.farmer_phone && <span className="font-normal text-stone-500"> ({message.farmer_phone})</span>}
            {message.farmer_verification && (
              <span className="ml-2">
                <StatusBadge map={VERIFICATION_STATUS} status={message.farmer_verification} dot={false} />
              </span>
            )}
          </dd>
          <dt className="flex items-center gap-1.5 text-stone-500">
            <ClipboardIcon className="h-4 w-4" /> Products
          </dt>
          <dd>
            {items.length === 0 && !editing && <span className="text-stone-400">None found</span>}
            {!editing ? (
              <ol className="list-decimal space-y-0.5 pl-4 font-semibold text-stone-900">
                {items.map((i, n) => (
                  <li key={n}>
                    {i.product_name} – {i.quantity ?? "?"} {i.unit || "?"}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="space-y-2">
                {draft.items.map((it, n) => (
                  <div key={n} className="grid grid-cols-[1fr_64px_96px_auto] gap-1.5">
                    <Input
                      value={it.product_name || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, items: d.items.map((v, j) => (j === n ? { ...v, product_name: e.target.value } : v)) }))}
                      aria-label="Product"
                      className="h-9 px-2"
                    />
                    <Input
                      type="number"
                      value={it.quantity ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, items: d.items.map((v, j) => (j === n ? { ...v, quantity: e.target.value === "" ? null : Number(e.target.value) } : v)) }))}
                      aria-label="Quantity"
                      className="h-9 px-2"
                    />
                    <select
                      className="input h-9 px-2"
                      value={it.unit || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, items: d.items.map((v, j) => (j === n ? { ...v, unit: e.target.value } : v)) }))}
                      aria-label="Unit"
                    >
                      <option value="">Unit</option>
                      {UNITS.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                    <button type="button" aria-label="Remove" onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== n) }))} className="rounded-lg px-2 text-stone-400 hover:text-red-600">
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button size="xs" variant="soft" icon={PlusIcon} onClick={() => setDraft((d) => ({ ...d, items: [...d.items, { product_name: "", quantity: null, unit: "sacks" }] }))}>
                  Add product
                </Button>
              </div>
            )}
          </dd>
          <dt className="flex items-center gap-1.5 text-stone-500">
            <PinIcon className="h-4 w-4" /> Location
          </dt>
          <dd className="font-semibold text-stone-900">
            {editing ? (
              <Input value={draft.delivery_location} onChange={(e) => setDraft((d) => ({ ...d, delivery_location: e.target.value }))} className="h-9" />
            ) : (
              draft?.delivery_location || `Brgy. ${x.barangay || message.farmer_barangay || "?"}`
            )}
          </dd>
          <dt className="flex items-center gap-1.5 text-stone-500">
            <CalendarIcon className="h-4 w-4" /> Needed by
          </dt>
          <dd className="font-semibold text-stone-900">
            {editing ? (
              <div className="grid grid-cols-2 gap-1.5">
                <Input value={draft.preferred_date} onChange={(e) => setDraft((d) => ({ ...d, preferred_date: e.target.value }))} placeholder="next week" className="h-9" />
                <Input type="date" value={draft.preferred_date_iso} onChange={(e) => setDraft((d) => ({ ...d, preferred_date_iso: e.target.value }))} className="h-9" />
              </div>
            ) : x.preferred_date ? (
              `${x.preferred_date}${x.preferred_date_iso ? ` (${x.preferred_date_iso})` : ""}`
            ) : (
              <span className="text-stone-400">Not stated</span>
            )}
          </dd>
          <dt className="text-stone-500">Request type</dt>
          <dd>
            <Badge tone={x.intent === "inquiry" ? "blue" : "amber"}>{x.intent === "inquiry" ? "Price inquiry" : "For Quotation"}</Badge>
          </dd>
          <dt className="text-stone-500">AI confidence</dt>
          <dd className="flex items-center gap-2">
            <span className="h-2 w-28 overflow-hidden rounded-full bg-stone-200">
              <span
                className={cx("block h-full rounded-full", x.confidence >= 0.75 ? "bg-brand-500" : x.confidence >= 0.4 ? "bg-harvest-400" : "bg-red-400")}
                style={{ width: `${Math.round((x.confidence || 0) * 100)}%` }}
              />
            </span>
            <span className="text-xs font-semibold text-stone-600">
              {Math.round((x.confidence || 0) * 100)}% · {x.source === "ai" ? "AI" : "offline parser"} · {x.language}
            </span>
          </dd>
        </dl>
      </div>
      {open && message.farmer_id && (
        <div className="flex flex-wrap gap-2 border-t border-stone-100 px-5 py-4">
          <Button variant="ghost" size="sm" icon={SparkleIcon} loading={busy === "process"} onClick={process}>
            Re-process
          </Button>
          <Button variant="ghost" size="sm" loading={busy === "dismiss"} onClick={dismiss}>
            Dismiss
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => setEditing((v) => !v)}>
              {editing ? "Cancel edit" : "Edit Details"}
            </Button>
            <Button loading={busy === "publish"} onClick={publish}>
              Publish Request
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function StaffInbox() {
  const [channel, setChannel] = useState("all");
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [processing, setProcessing] = useState(null);

  const load = useCallback(() => {
    apiClient
      .get(`/inbound${channel === "all" ? "" : `?channel=${channel}`}`)
      .then((d) => {
        setData(d);
        setSelectedId((id) => id ?? d.items.find((i) => OPEN.includes(i.status))?.id ?? d.items[0]?.id ?? null);
      })
      .catch(() => setData({ items: [], open_counts: {} }));
  }, [channel]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeEvent("inbound", load);

  async function processRow(row) {
    setProcessing(row.id);
    try {
      await apiClient.post(`/inbound/${row.id}/process`);
      setSelectedId(row.id);
      load();
    } catch {
      setSelectedId(row.id);
    } finally {
      setProcessing(null);
    }
  }

  const counts = data?.open_counts || {};
  const tabs = [
    { key: "all", label: "All", count: (counts.sms || 0) + (counts.messenger || 0) },
    { key: "messenger", label: "Messenger", count: counts.messenger || 0 },
    { key: "sms", label: "SMS", count: counts.sms || 0 },
  ];
  const selected = data?.items.find((i) => i.id === selectedId);

  return (
    <div>
      <PageHeader
        title="Incoming Messages"
        description="Farmers' texts from SMS and Messenger, read by AI. Farmers confirm by replying OO — or process and publish for them."
        action={
          <Button variant="secondary" onClick={() => navigate("/simulator")}>
            Open simulator
          </Button>
        }
      />
      <div className="mb-4 flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setChannel(t.key);
              setSelectedId(null);
            }}
            className={cx(
              "rounded-full px-4 py-1.5 text-sm font-semibold",
              channel === t.key ? "bg-brand-700 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
            )}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>
      {data === null ? (
        <SkeletonList rows={4} />
      ) : data.items.length === 0 ? (
        <EmptyState icon={InboxIcon} title="No messages yet" description="Texts from farmers will appear here. Try the SMS & Messenger simulator." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_440px]">
          <Card className="overflow-hidden">
            <div className="hidden grid-cols-[150px_1fr_70px_80px_96px] gap-3 border-b border-stone-100 bg-stone-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-stone-500 md:grid">
              <span>From</span>
              <span>Message</span>
              <span>Channel</span>
              <span>Received</span>
              <span className="text-right">Action</span>
            </div>
            <ul className="divide-y divide-stone-100">
              {data.items.map((m) => (
                <li
                  key={m.id}
                  className={cx(
                    "grid cursor-pointer grid-cols-[1fr_auto] gap-2 px-4 py-3 hover:bg-stone-50 md:grid-cols-[150px_1fr_70px_80px_96px] md:items-center md:gap-3",
                    selectedId === m.id && "bg-brand-50/70"
                  )}
                  onClick={() => setSelectedId(m.id)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={m.farmer_name || m.sender} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-stone-900">{m.farmer_name || m.sender}</span>
                      <span className="block md:hidden">
                        <StatusBadge map={INBOUND_STATUS} status={m.status} dot={false} />
                      </span>
                    </span>
                  </span>
                  <span className="col-span-2 line-clamp-2 text-sm text-stone-600 md:col-span-1">{m.body}</span>
                  <span className="hidden md:block">
                    <ChannelIcon channel={m.channel} className="h-5 w-5" />
                  </span>
                  <span className="hidden text-xs text-stone-500 md:block">{formatTime(m.updated_at)}</span>
                  <span className="row-start-1 flex justify-end md:row-auto">
                    {OPEN.includes(m.status) ? (
                      <Button
                        size="xs"
                        loading={processing === m.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          processRow(m);
                        }}
                      >
                        Process
                      </Button>
                    ) : (
                      <span className="hidden md:inline">
                        <StatusBadge map={INBOUND_STATUS} status={m.status} dot={false} />
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          {selected && (
            <div className="xl:sticky xl:top-24 xl:self-start">
              <Preview message={selected} onChanged={load} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
