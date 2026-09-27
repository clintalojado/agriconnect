import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../api/client";
import { useSession } from "../lib/session";
import { useRealtimeEvent } from "../lib/realtime.jsx";
import { useNavigate } from "../lib/navigation";
import { useCall } from "../calls/CallProvider.jsx";
import {
  Alert,
  Avatar,
  Button,
  Card,
  EmptyState,
  Skeleton,
  Toggle,
  cx,
  formatRelative,
  formatTime,
  parseDbDate,
} from "../components/ui.jsx";
import {
  ArrowLeftIcon,
  ChatIcon,
  CheckDoubleIcon,
  CheckIcon,
  PhoneIcon,
  SearchIcon,
  SendIcon,
  SmsIcon,
  SproutIcon,
  StoreIcon,
  TagIcon,
} from "../components/icons.jsx";

const QUICK_REPLIES = {
  farmer: ["Magkano po ang delivery?", "Kailan po ang delivery?", "Pwede po ba sa Barangay Hall?", "Salamat po!"],
  supplier: ["Available pa po.", "Ide-deliver po namin sa Barangay Hall.", "Pwede po bang mag-confirm?", "Salamat po!"],
};

function counterpart(conversation, role) {
  return role === "farmer"
    ? {
        name: conversation.supplier_name,
        phone: conversation.supplier_phone,
        detail: conversation.supplier_contact ? `Contact: ${conversation.supplier_contact}` : "Supplier",
      }
    : {
        name: conversation.farmer_name,
        phone: conversation.farmer_phone,
        detail: conversation.farmer_barangay ? `Farmer · Brgy. ${conversation.farmer_barangay}` : "Farmer",
      };
}

/** Total unread messages for this tab's active role; refreshes on live events. */
export function useUnreadCount() {
  const { role, me } = useSession();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!me?.id || (role !== "farmer" && role !== "supplier")) return setCount(0);
    try {
      const rows = await apiClient.get(`/conversations?participant_type=${role}&participant_id=${me.id}`);
      setCount(rows.reduce((sum, c) => sum + (c.unread_count || 0), 0));
    } catch {
      // badge is best-effort
    }
  }, [role, me?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useRealtimeEvent("message", refresh);
  useRealtimeEvent("read", refresh);
  return count;
}

function dayLabel(value) {
  const date = parseDbDate(value);
  if (!date) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function ConversationList({ conversations, loading, activeId, role, onSelect, query, onQuery }) {
  const filtered = conversations.filter((c) =>
    counterpart(c, role).name.toLowerCase().includes(query.trim().toLowerCase())
  );
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-stone-100 p-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search conversations"
            className="input h-10 pl-9"
          />
        </div>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {loading && conversations.length === 0 ? (
          <div className="space-y-4 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="mt-2 h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-stone-500">
            {conversations.length === 0 ? "No conversations yet." : "No matches."}
          </p>
        ) : (
          filtered.map((c) => {
            const other = counterpart(c, role);
            const active = c.id === activeId;
            const mine = c.last_sender_type === role;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={cx(
                  "flex w-full items-center gap-3 border-l-[3px] px-3 py-3 text-left transition-colors",
                  active ? "border-brand-600 bg-brand-50/70" : "border-transparent hover:bg-stone-50"
                )}
              >
                <Avatar name={other.name} online={c.counterpart_online} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={cx("truncate text-sm", c.unread_count ? "font-bold text-stone-900" : "font-semibold text-stone-800")}>
                      {other.name}
                    </p>
                    <span className="shrink-0 text-[11px] text-stone-400">{formatRelative(c.last_message_at || c.created_at)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className={cx("truncate text-xs", c.unread_count ? "font-medium text-stone-700" : "text-stone-500")}>
                      {c.last_message ? `${mine ? "You: " : ""}${c.last_message}` : "Say hello 👋"}
                    </p>
                    {c.unread_count > 0 && (
                      <span className="shrink-0 rounded-full bg-brand-600 px-1.5 text-[10px] font-bold leading-[18px] text-white">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message, mine }) {
  if (message.sender_type === "system") {
    return (
      <div className="my-2 flex justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-500">
          {/call/i.test(message.body) ? <PhoneIcon className="h-3 w-3" /> : <TagIcon className="h-3 w-3" />} {message.body} · {formatTime(message.created_at)}
        </span>
      </div>
    );
  }
  return (
    <div className={cx("flex animate-fade-in-up", mine ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
          mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md border border-stone-200 bg-white text-stone-800"
        )}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
        <div className={cx("mt-1 flex items-center justify-end gap-1 text-[10px]", mine ? "text-brand-100" : "text-stone-400")}>
          {message.channel === "sms" && (
            <span className="inline-flex items-center gap-0.5 font-semibold">
              <SmsIcon className="h-3 w-3" /> SMS
            </span>
          )}
          <span>{formatTime(message.created_at)}</span>
          {mine &&
            (message.read_at ? (
              <CheckDoubleIcon className="h-3.5 w-3.5 text-harvest-200" aria-label="Read" />
            ) : (
              <CheckIcon className="h-3.5 w-3.5" aria-label="Sent" />
            ))}
        </div>
      </div>
    </div>
  );
}

function Thread({ conversation, role, onBack }) {
  const { startCall, call } = useCall();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sendSms, setSendSms] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const other = counterpart(conversation, role);

  const markRead = useCallback(() => {
    apiClient.post(`/conversations/${conversation.id}/read`, { reader_type: role }).catch(() => {});
  }, [conversation.id, role]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setError(null);
    apiClient
      .get(`/conversations/${conversation.id}/messages`)
      .then((rows) => {
        if (cancelled) return;
        setMessages(rows);
        markRead();
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [conversation.id, markRead]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);

  useRealtimeEvent("message", ({ conversation_id, message }) => {
    if (conversation_id !== conversation.id) return;
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    if (message.sender_type !== role && message.sender_type !== "system") markRead();
  });

  useRealtimeEvent("read", ({ conversation_id, reader_type }) => {
    if (conversation_id !== conversation.id || reader_type === role) return;
    const now = new Date().toISOString();
    setMessages((prev) => prev.map((m) => (m.sender_type === role && !m.read_at ? { ...m, read_at: now } : m)));
  });

  async function send(text) {
    const body = (text ?? draft).trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const { message, sms } = await apiClient.post(`/conversations/${conversation.id}/messages`, {
        sender_type: role,
        body,
        send_sms: sendSms,
      });
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      if (text == null) setDraft("");
      if (sms?.status === "failed") setError(`Message saved, but the SMS copy failed: ${sms.error}`);
      inputRef.current?.focus();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const grouped = useMemo(() => {
    const out = [];
    let lastDay = null;
    for (const m of messages) {
      const label = dayLabel(m.created_at);
      if (label !== lastDay) {
        out.push({ divider: label, key: `d-${m.id}` });
        lastDay = label;
      }
      out.push({ message: m, key: m.id });
    }
    return out;
  }, [messages]);

  const inCall = call && call.phase !== "ended";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-stone-100 px-3 py-2.5 sm:px-4">
        <button type="button" onClick={onBack} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 md:hidden" aria-label="Back">
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <Avatar name={other.name} online={conversation.counterpart_online} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-stone-900">{other.name}</p>
          <p className="truncate text-xs text-stone-500">
            {conversation.counterpart_online ? <span className="font-medium text-brand-600">Online · </span> : null}
            {other.detail}
          </p>
        </div>
        {other.phone && (
          <a
            href={`tel:${other.phone}`}
            className="hidden h-9 items-center gap-1.5 rounded-xl border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50 sm:inline-flex"
            title={`Call ${other.phone} with your phone`}
          >
            <PhoneIcon className="h-4 w-4" /> {other.phone}
          </a>
        )}
        <Button size="sm" icon={PhoneIcon} onClick={() => startCall(conversation)} disabled={inCall} title="Free voice call over the internet">
          Call
        </Button>
      </div>

      <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-2 overflow-y-auto bg-stone-50/70 px-3 py-4 sm:px-5">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-2/3 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
            <Skeleton className="h-10 w-3/5 rounded-2xl" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Avatar name={other.name} size="lg" />
            <p className="mt-3 font-semibold text-stone-800">Start chatting with {other.name}</p>
            <p className="mt-1 max-w-xs text-sm text-stone-500">Ask about prices, delivery dates, or the pickup point.</p>
          </div>
        ) : (
          grouped.map((item) =>
            item.divider ? (
              <div key={item.key} className="flex items-center gap-3 py-2">
                <span className="h-px flex-1 bg-stone-200" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{item.divider}</span>
                <span className="h-px flex-1 bg-stone-200" />
              </div>
            ) : (
              <MessageBubble key={item.key} message={item.message} mine={item.message.sender_type === role} />
            )
          )
        )}
      </div>

      <div className="border-t border-stone-100 bg-white p-3">
        {error && (
          <Alert tone="error" className="mb-2" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        <div className="scrollbar-thin mb-2 flex gap-1.5 overflow-x-auto pb-1">
          {QUICK_REPLIES[role].map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => send(text)}
              disabled={sending}
              className="shrink-0 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              {text}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={2000}
            placeholder="Type a message…"
            className="input max-h-32 min-h-[42px] flex-1 resize-none"
          />
          <Button onClick={() => send()} loading={sending} disabled={!draft.trim()} size="icon" className="h-[42px] w-[42px]" aria-label="Send">
            {!sending && <SendIcon className="h-5 w-5" />}
          </Button>
        </div>
        <div className="mt-2.5">
          <Toggle
            checked={sendSms}
            onChange={setSendSms}
            label="Also send as SMS"
            description={other.phone ? `Texts a copy to ${other.phone}, for when they're offline.` : "They have no phone number on file."}
          />
        </div>
      </div>
    </div>
  );
}

export default function Messenger({ initialConversationId }) {
  const { role, me } = useSession();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeId, setActiveId] = useState(initialConversationId || null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (initialConversationId) setActiveId(initialConversationId);
  }, [initialConversationId]);

  const load = useCallback(async () => {
    if (!role || !me?.id) return;
    setLoading(true);
    try {
      const rows = await apiClient.get(`/conversations?participant_type=${role}&participant_id=${me.id}`);
      setConversations(rows);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [role, me?.id]);

  useEffect(() => {
    setConversations([]);
    load();
  }, [load]);

  useRealtimeEvent("message", load);
  useRealtimeEvent("read", load);

  if (role !== "farmer" && role !== "supplier") {
    return (
      <EmptyState
        icon={ChatIcon}
        title="Set up your profile to start messaging"
        description="Farmers and suppliers can chat, text, and call each other about offers and deliveries."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button icon={SproutIcon} onClick={() => navigate("/start", { role: "farmer" })}>
              I'm a farmer
            </Button>
            <Button variant="secondary" icon={StoreIcon} onClick={() => navigate("/start", { role: "supplier" })}>
              I'm a supplier
            </Button>
          </div>
        }
      />
    );
  }

  const active = conversations.find((c) => c.id === activeId);

  return (
    <div>
      {error && (
        <Alert tone="error" className="mb-4" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Card className="grid h-[calc(100vh-15rem)] min-h-[520px] overflow-hidden md:grid-cols-[320px_1fr]">
        <div className={cx("border-r border-stone-100", active ? "hidden md:block" : "block")}>
          <ConversationList
            conversations={conversations}
            loading={loading}
            activeId={activeId}
            role={role}
            onSelect={setActiveId}
            query={query}
            onQuery={setQuery}
          />
        </div>
        <div className={cx("min-w-0", active ? "block" : "hidden md:block")}>
          {active ? (
            <Thread key={active.id} conversation={active} role={role} onBack={() => setActiveId(null)} />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                className="border-none bg-transparent"
                icon={ChatIcon}
                title={conversations.length ? "Pick a conversation" : "No conversations yet"}
                description={
                  role === "farmer"
                    ? "Open an offer on your request and tap “Message” to chat with the supplier."
                    : "Farmers who message you appear here. You can also contact farmers from “My Offers”."
                }
              />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
