import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { apiClient } from "../api/client";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader, Segmented, cx, formatRelative, formatTime } from "../components/ui.jsx";
import { INBOUND_STATUS, StatusBadge } from "../components/status.jsx";
import { MessengerIcon, RefreshIcon, SendIcon, SmsIcon, SparkleIcon } from "../components/icons.jsx";

// Staff tool: act as a farmer texting AgriConnect by SMS or Messenger and
// watch the whole flow — registration, OTP, AI reading, confirmation.

const SAMPLES = [
  "Sir, palit ko 5 sako urea ug 2 sako abono. Pwede delivery sa Brgy. Katipunan mga next week?",
  "Pa order 3 sako feeds para sa manok. Pwede hatod karong Sabado?",
  "Maayong aga, mabakal ako sang lima ka sako nga urea buwas",
  "Naimbag a bigat, gumatangak ti tallo a sako nga abono",
  "OO",
  "tagpila ang abono subong?",
  "magkano po ang urea?",
  "gusto ko ng urea",
  "STATUS",
  "HELP",
];

const DEFAULT_SENDER = { sms: "09171234567", messenger: "PSID-DEMO-1" };

// The farmer's language; Bikol, Waray, Kapampangan, Pangasinan, and
// Maguindanaon texts are understood and answered in Tagalog.
const LANGUAGE_LABEL = {
  tagalog: "Tagalog", bisaya: "Bisaya", hiligaynon: "Hiligaynon", ilocano: "Ilocano", english: "English",
  bikol: "Bikol (reply in Tagalog)", waray: "Waray (reply in Tagalog)", kapampangan: "Kapampangan (reply in Tagalog)",
  pangasinan: "Pangasinan (reply in Tagalog)", maguindanaon: "Maguindanaon (reply in Tagalog)",
};

function PhoneThread({ messages, channel }) {
  const scrollRef = useRef(null);
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);
  const messenger = channel === "messenger";

  return (
    <div ref={scrollRef} className="scrollbar-thin h-[300px] space-y-2 sm:h-[420px] overflow-y-auto bg-stone-100 px-3 py-4">
      {messages.length === 0 ? (
        <p className="pt-24 text-center text-xs text-stone-400 sm:pt-32">Send a message to start. Try the samples below.</p>
      ) : (
        messages.map((m) => {
          const fromFarmer = m.direction === "inbound";
          return (
            <div key={m.id} className={cx("flex animate-fade-in-up", fromFarmer ? "justify-end" : "justify-start")}>
              <div
                className={cx(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm",
                  fromFarmer ? cx("rounded-br-md text-white", messenger ? "bg-[#0a7cff]" : "bg-sky-500") : "rounded-bl-md bg-white text-stone-800"
                )}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cx("mt-0.5 text-right text-[10px]", fromFarmer ? "text-white/70" : "text-stone-400")}>
                  {formatTime(m.created_at)}
                  {m.status === "failed" && " · failed"}
                </p>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function SmsSimulator() {
  const [channel, setChannel] = useState("messenger");
  const [sender, setSender] = useState(DEFAULT_SENDER.messenger);
  const [draft, setDraft] = useState("");
  const [thread, setThread] = useState([]);
  const [last, setLast] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState({});

  async function refresh(target = sender, ch = channel) {
    if (!target.trim()) return setThread([]);
    try {
      const rows = await apiClient.get(`/sms/log?limit=100&channel=${ch}&phone=${encodeURIComponent(target.trim())}`);
      setThread([...rows].reverse());
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    Promise.all([apiClient.get("/sms/status").catch(() => ({})), apiClient.get("/nlp/status").catch(() => ({}))]).then(([sms, nlp]) =>
      setStatus({ sms: sms.provider, messenger: sms.messenger, engine: nlp.active_engine })
    );
  }, []);

  useEffect(() => {
    const t = setTimeout(() => refresh(sender, channel), 250);
    return () => clearTimeout(t);
  }, [sender, channel]); // eslint-disable-line react-hooks/exhaustive-deps

  function switchChannel(ch) {
    setChannel(ch);
    setSender(DEFAULT_SENDER[ch]);
    setLast(null);
  }

  async function send(text) {
    const message = (text ?? draft).trim();
    if (!message || !sender.trim()) return;
    setSending(true);
    setError(null);
    try {
      setLast(await apiClient.post("/inbound/simulate", { channel, sender: sender.trim(), message }));
      if (text == null) setDraft("");
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  const x = last?.inbound?.extraction;

  return (
    <div>
      <PageHeader
        title="SMS & Messenger simulator"
        description="Text AgriConnect as a farmer would. New numbers go through registration first; orders come back as a structured request to confirm with OO."
        action={
          <Segmented
            value={channel}
            onChange={switchChannel}
            options={[
              { value: "messenger", label: "Messenger", icon: MessengerIcon },
              { value: "sms", label: "SMS", icon: SmsIcon },
            ]}
          />
        }
      />
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-stone-100 p-4">
            {channel === "messenger" ? <MessengerIcon className="h-6 w-6 text-[#0a7cff]" /> : <SmsIcon className="h-6 w-6 text-harvest-500" />}
            <div className="flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">{channel === "sms" ? "Farmer's phone number" : "Messenger user ID"}</p>
              <Input value={sender} onChange={(e) => setSender(e.target.value)} className="mt-1 h-9" aria-label="Sender" />
            </div>
          </div>
          <PhoneThread messages={thread} channel={channel} />
          <div className="border-t border-stone-100 bg-white p-3">
            <div className="scrollbar-thin mb-2 flex gap-1.5 overflow-x-auto pb-1">
              {SAMPLES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  disabled={sending}
                  className="max-w-[16rem] shrink-0 truncate rounded-full border border-stone-200 px-2.5 py-1 text-[11px] font-medium text-stone-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                  title={s}
                >
                  {s}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex gap-2"
            >
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Aa" maxLength={480} />
              <Button type="submit" size="icon" className="h-[42px] w-[42px]" loading={sending} disabled={!draft.trim()} aria-label="Send">
                {!sending && <SendIcon className="h-5 w-5" />}
              </Button>
            </form>
          </div>
        </Card>

        <div className="space-y-5">
          {error && (
            <Alert tone="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          <Card className="p-5">
            <CardHeader icon={SparkleIcon} title="What happened" subtitle="How the last message was handled" />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {status.sms && <Badge tone="blue">SMS: {status.sms}</Badge>}
              {status.messenger && <Badge tone="blue">Messenger: {status.messenger}</Badge>}
              {status.engine && <Badge tone={status.engine === "ai" ? "violet" : "stone"}>{status.engine === "ai" ? "AI reader" : "Offline reader"}</Badge>}
            </div>
            {!last ? (
              <p className="mt-4 text-sm text-stone-500">Send a message to see how it's handled.</p>
            ) : (
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  {last.language && <Badge tone="blue">Language: {LANGUAGE_LABEL[last.language] || last.language}</Badge>}
                  {last.registration && <Badge tone="violet">Registration: {last.registration.replace("_", " ")}</Badge>}
                  {last.farmer && <Badge tone="stone">Farmer #{last.farmer.id} · {last.farmer.verification_status}</Badge>}
                  {last.inbound && <StatusBadge map={INBOUND_STATUS} status={last.inbound.status} />}
                  {last.requests?.length > 0 && <Badge tone="green">{last.requests.length} request(s) stored</Badge>}
                </div>
                {x && (
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {[
                      ["Products", x.items?.map((i) => `${i.quantity ?? "?"} ${i.unit || ""} ${i.product_name}`).join(", ")],
                      ["Barangay", x.barangay],
                      ["Needed by", x.preferred_date ? `${x.preferred_date}${x.preferred_date_iso ? ` (${x.preferred_date_iso})` : ""}` : null],
                      ["Intent", x.intent],
                      ["Language", x.language],
                      ["Confidence", `${Math.round((x.confidence || 0) * 100)}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-stone-50 px-3 py-2">
                        <dt className="text-xs text-stone-500">{label}</dt>
                        <dd className="font-semibold text-stone-800">{value || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            )}
          </Card>
          <RecentLog />
        </div>
      </div>
    </div>
  );
}

function RecentLog() {
  const [log, setLog] = useState([]);
  const load = () => apiClient.get("/sms/log?limit=15").then(setLog).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <Card className="p-5">
      <CardHeader icon={SmsIcon} title="Recent texts" subtitle="Every SMS and Messenger message, in and out" action={<Button variant="ghost" size="xs" icon={RefreshIcon} onClick={load} aria-label="Refresh" />} />
      {log.length === 0 ? (
        <EmptyState className="mt-4" title="No texts yet" />
      ) : (
        <ul className="mt-4 divide-y divide-stone-100">
          {log.map((row) => (
            <li key={row.id} className="flex items-start gap-3 py-2.5 text-sm">
              {row.channel === "messenger" ? <MessengerIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#0a7cff]" /> : <SmsIcon className="mt-0.5 h-4 w-4 shrink-0 text-harvest-500" />}
              <Badge tone={row.direction === "inbound" ? "blue" : row.status === "failed" ? "red" : "green"}>
                {row.direction === "inbound" ? "In" : row.status === "failed" ? "Failed" : "Out"}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-stone-800">{row.body}</p>
                <p className="text-xs text-stone-400">
                  {row.phone} · {formatRelative(row.created_at)}
                  {row.error ? ` · ${row.error}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
