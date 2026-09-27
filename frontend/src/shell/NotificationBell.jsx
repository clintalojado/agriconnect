import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { useSession } from "../lib/session";
import { useRealtimeEvent } from "../lib/realtime.jsx";
import { cx, formatRelative, useToast } from "../components/ui.jsx";
import { BellIcon } from "../components/icons.jsx";

const NotificationsContext = createContext({ items: [], unread: 0, loading: false, markRead: () => {}, reload: () => {} });

/**
 * One notification store per tab (the bell appears in both the desktop and
 * mobile headers, and in Messages → Notifications). Also shows a toast for
 * each new notification.
 */
export function NotificationsProvider({ children }) {
  const value = useNotificationState();
  const toast = useToast();
  useRealtimeEvent("notification", (n) => {
    if (n?.title) {
      toast({
        title: n.title,
        body: n.body,
        tone: "success",
        action: n.link ? { label: "Open", onClick: () => openNotification(n, value.markRead) } : undefined,
      });
    }
  });
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationsContext);
}

function useNotificationState() {
  const { role, me } = useSession();
  const [state, setState] = useState({ items: [], unread: 0, loading: true });
  const enabled = (role === "farmer" || role === "supplier") && me?.id;

  const load = useCallback(async () => {
    if (!enabled) return setState({ items: [], unread: 0, loading: false });
    try {
      const data = await apiClient.get(`/notifications?recipient_type=${role}&recipient_id=${me.id}`);
      setState({ ...data, loading: false });
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [enabled, role, me?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeEvent("notification", (n) => {
    if (!n?.id) return;
    setState((prev) => ({ ...prev, items: [n, ...prev.items.filter((i) => i.id !== n.id)].slice(0, 30), unread: prev.unread + 1 }));
  });

  const markRead = useCallback(
    async (ids) => {
      if (!enabled) return;
      try {
        const data = await apiClient.post("/notifications/read", { recipient_type: role, recipient_id: me.id, ids });
        setState({ ...data, loading: false });
      } catch {
        // best-effort
      }
    },
    [enabled, role, me?.id]
  );

  return { ...state, markRead, reload: load };
}

export function openNotification(n, markRead) {
  if (!n.read_at) markRead([n.id]);
  if (n.link) window.location.hash = n.link.replace(/^#/, "");
}

export function NotificationList({ items, markRead, empty = "You're all caught up." }) {
  if (items.length === 0) return <p className="px-4 py-8 text-center text-sm text-stone-500">{empty}</p>;
  return (
    <ul className="divide-y divide-stone-100">
      {items.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            onClick={() => openNotification(n, markRead)}
            className={cx("flex w-full gap-3 px-4 py-3 text-left hover:bg-stone-50", !n.read_at && "bg-brand-50/50")}
          >
            <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-brand-500")} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-stone-900">{n.title}</span>
              {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-stone-500">{n.body}</span>}
              <span className="mt-1 block text-[11px] text-stone-400">{formatRelative(n.created_at)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function NotificationBell({ tone = "light" }) {
  const { items, unread, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className={cx(
          "relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
          tone === "dark" ? "text-white hover:bg-white/10" : "text-stone-600 hover:bg-stone-100"
        )}
      >
        <BellIcon className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lift animate-fade-in-up">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <p className="font-bold text-stone-900">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={() => markRead()} className="text-xs font-semibold text-brand-700 hover:text-brand-800">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto" onClick={() => setOpen(false)}>
            <NotificationList items={items} markRead={markRead} />
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/messages", { tab: "notifications" });
            }}
            className="block w-full border-t border-stone-100 py-2.5 text-center text-xs font-semibold text-stone-600 hover:bg-stone-50"
          >
            See all
          </button>
        </div>
      )}
    </div>
  );
}
