import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../api/client";
import { cx } from "./ui.jsx";
import { ChatIcon, LeafMark, SendIcon, XIcon } from "./icons.jsx";

// Public website chat with the AgriConnect bot — the same bot as SMS and
// Messenger (registration, orders with OO, ML answers), no Facebook needed.
// Open it from anywhere with openChat().

const OPEN_EVENT = "agriconnect:open-chat";
export function openChat(message) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { message } }));
}

const SESSION_KEY = "agriconnect.chatSession";
const POLL_MS = 8000;
const SUGGESTIONS = ["Hello", "Paano mag-order?", "Magkano ang urea?", "May delivery ba sa Dalipe?", "Anong abono sa palay?"];

function newSessionId() {
  const bytes = new Uint8Array(16);
  (window.crypto || {}).getRandomValues?.(bytes);
  const random = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `web${random || Math.random().toString(36).slice(2).padEnd(24, "0")}`;
}

// Kept per browser so a visitor keeps their chat (and registration) across visits.
let memorySession = null;
function getSessionId() {
  try {
    let id = window.localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = newSessionId();
      window.localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    memorySession ||= newSessionId();
    return memorySession;
  }
}

function Bubble({ direction, children }) {
  const mine = direction === "inbound"; // inbound = sent by the visitor
  return (
    <div className={cx("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[85%] animate-fade-in-up whitespace-pre-line break-words rounded-2xl px-3.5 py-2 text-[14px] leading-snug",
          mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-white text-stone-800 shadow-sm ring-1 ring-stone-200/70"
        )}
      >
        {children}
      </div>
    </div>
  );
}

// A shareable link opens the chat directly: https://…/?chat=1
function linkOpensChat() {
  return /[?&]chat=1\b/.test(window.location.search + window.location.hash);
}

export default function ChatWidget() {
  const [open, setOpen] = useState(linkOpensChat);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const sessionId = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const lastId = useRef(0);

  const merge = useCallback((rows) => {
    if (!rows.length) return;
    lastId.current = Math.max(lastId.current, ...rows.map((r) => r.id));
    setMessages((current) => {
      const seen = new Set(current.map((m) => m.id));
      const fresh = rows.filter((r) => !seen.has(r.id));
      // Drop optimistic copies once the server has the real message.
      const kept = current.filter((m) => !(m.pending && fresh.some((r) => r.direction === "inbound" && r.body === m.body)));
      return fresh.length ? [...kept, ...fresh] : kept;
    });
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const rows = await apiClient.get(`/chat/history?session_id=${sessionId.current}&after_id=${lastId.current}`);
      merge(rows);
    } catch {
      /* offline for a moment — the next poll retries */
    } finally {
      setLoaded(true);
    }
  }, [merge]);

  // Open from elsewhere on the page (e.g. the hero's "Try the chatbot" button).
  useEffect(() => {
    const onOpen = (e) => {
      setOpen(true);
      if (e.detail?.message) setDraft(e.detail.message);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  // Load history when opened, then poll for replies that arrive later (supplier quotes).
  useEffect(() => {
    if (!open) return;
    sessionId.current ||= getSessionId();
    fetchHistory();
    const timer = setInterval(fetchHistory, POLL_MS);
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearInterval(timer);
  }, [open, fetchHistory]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text) {
    const body = text.trim();
    if (!body || sending) return;
    setDraft("");
    setError(null);
    setSending(true);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, direction: "inbound", body, pending: true }]);
    try {
      await apiClient.post("/chat/message", { session_id: sessionId.current, message: body });
      await fetchHistory();
    } catch (err) {
      setError(err.message);
      setMessages((m) => m.filter((x) => !(x.pending && x.body === body)));
      setDraft(body);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-brand-600 py-3 pl-3 pr-5 font-semibold text-white shadow-lg shadow-brand-900/30 transition hover:-translate-y-0.5 hover:bg-brand-700"
          aria-label="Chat with the AgriConnect bot"
        >
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
            <ChatIcon className="h-5 w-5" />
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-harvest-300 ring-2 ring-brand-600 motion-safe:animate-ping" />
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-harvest-300 ring-2 ring-brand-600" />
          </span>
          <span className="text-sm">Try the chatbot</span>
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="AgriConnect chatbot"
          className="fixed inset-0 z-50 flex flex-col bg-stone-100 animate-pop-in sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[600px] sm:max-h-[calc(100vh-40px)] sm:w-[380px] sm:overflow-hidden sm:rounded-3xl sm:shadow-2xl sm:ring-1 sm:ring-stone-900/10"
        >
          <header className="flex items-center gap-3 bg-brand-800 px-4 py-3 text-white">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <LeafMark className="h-5 w-5 text-brand-200" />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-brand-800" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold leading-tight">AgriConnect Bot</p>
              <p className="text-xs text-brand-100/80">{sending ? "typing…" : "Online · Tagalog, Bisaya, English"}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-white/10" aria-label="Close chat">
              <XIcon className="h-5 w-5" />
            </button>
          </header>

          <div ref={listRef} className="scrollbar-thin flex-1 space-y-2.5 overflow-y-auto p-4">
            <Bubble direction="outbound">
              Kumusta po! 🌾 Ako ang AgriConnect bot. Mag-order ng abono, binhi, gamot, o feeds sa sariling salita, o magtanong
              tungkol sa presyo, delivery, at pagtatanim.
            </Bubble>
            {messages.map((m) => (
              <Bubble key={m.id} direction={m.direction}>
                {m.body}
              </Bubble>
            ))}
            {sending && (
              <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-md bg-white px-3 py-3 shadow-sm ring-1 ring-stone-200/70">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-stone-400" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            )}
            {loaded && messages.length === 0 && !sending && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-brand-800 ring-1 ring-brand-200 transition hover:bg-brand-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <p className="bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-end gap-2 border-t border-stone-200 bg-white p-3"
          >
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 500))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              rows={1}
              placeholder='hal. "5 sako urea sa Katipunan"'
              className="max-h-28 min-h-[42px] flex-1 resize-none rounded-2xl border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
              aria-label="Message"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-40"
              aria-label="Send"
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </form>
          <p className="bg-white px-3 pb-2 text-center text-[10px] text-stone-400">
            Type DELETE MY DATA anytime to erase your data · <a href="/privacy" className="underline">Privacy</a>
          </p>
        </section>
      )}
    </>
  );
}
