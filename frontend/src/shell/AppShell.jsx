import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { ROLES, setActiveRole, signOut, useSession } from "../lib/session";
import { useProfile } from "../lib/profile.jsx";
import { useRealtimeConnected, useRealtimeEvent } from "../lib/realtime.jsx";
import { useUnreadCount } from "../messenger/Messenger.jsx";
import { Avatar, cx, useToast } from "../components/ui.jsx";
import { ChevronDownIcon, LeafMark, LogOutIcon, PinIcon, PlusIcon } from "../components/icons.jsx";
import NotificationBell from "./NotificationBell.jsx";
import GlobalSearch from "./GlobalSearch.jsx";
import { NAV, ROLE_LABEL } from "./nav.js";

/** Live counters for nav badges: unread chats (farmer/supplier) or open inbox/verification (staff). */
function useBadges(role) {
  const unread = useUnreadCount();
  const [staff, setStaff] = useState({ inbox: 0, verification: 0 });

  const loadStaff = useCallback(async () => {
    if (role !== "staff") return;
    try {
      const o = await apiClient.get("/admin/overview");
      setStaff({ inbox: o.inbox.open, verification: o.farmers.pending_verification + o.suppliers.unverified });
    } catch {
      // badges are best-effort
    }
  }, [role]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);
  useRealtimeEvent("inbound", loadStaff);
  useRealtimeEvent("verification", loadStaff);

  return { unread, ...staff };
}

function Brand({ compact }) {
  return (
    <button type="button" onClick={() => navigate("/dashboard")} className="flex items-center gap-2.5 text-left">
      <LeafMark className={cx("shrink-0 text-brand-300", compact ? "h-7 w-7" : "h-9 w-9")} />
      <span>
        <span className={cx("block font-extrabold tracking-tight", compact ? "text-lg" : "text-2xl")}>AgriConnect</span>
        {!compact && <span className="block text-xs text-harvest-200">Farm Inputs, Closer to You.</span>}
      </span>
    </button>
  );
}

function AccountMenu({ align = "right", children }) {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const accounts = ROLES.filter((r) => session[r]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} className="w-full">
        {children}
      </button>
      {open && (
        <div
          role="menu"
          className={cx(
            "absolute z-40 w-64 overflow-hidden rounded-2xl border border-stone-200 bg-white py-2 text-stone-800 shadow-lift animate-fade-in-up",
            align === "right" ? "right-0 mt-2" : "bottom-full left-0 mb-2"
          )}
        >
          <p className="px-4 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-stone-400">Switch account</p>
          {accounts.map((r) => (
            <button
              key={r}
              type="button"
              role="menuitem"
              onClick={() => {
                setActiveRole(r);
                setOpen(false);
                navigate("/dashboard");
              }}
              className={cx("flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-stone-50", session.role === r && "bg-brand-50")}
            >
              <Avatar name={session[r].name} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{session[r].name}</span>
                <span className="block text-xs text-stone-500">{ROLE_LABEL[r]}</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate("/start");
            }}
            className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm font-medium hover:bg-stone-50"
          >
            <PlusIcon className="h-4 w-4 text-stone-500" /> Add another account
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOut(session.role);
              navigate("/");
            }}
            className="flex w-full items-center gap-3 border-t border-stone-100 px-4 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <LogOutIcon className="h-4 w-4" /> Sign out of {ROLE_LABEL[session.role]?.toLowerCase()}
          </button>
        </div>
      )}
    </div>
  );
}

function NavBadge({ count, dark }) {
  if (!count) return null;
  return (
    <span className={cx("ml-auto rounded-full px-1.5 text-[10px] font-bold leading-[18px]", dark ? "bg-red-500 text-white" : "bg-red-500 text-white")}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function AppShell({ current, children }) {
  const { role, me } = useSession();
  const toast = useToast();

  // New chat messages pop up anywhere except the Messages screen.
  useRealtimeEvent("message", ({ conversation_id, message }) => {
    if (message.sender_type === role || message.sender_type === "system" || current === "messages") return;
    toast({ title: "New message", body: message.body, action: { label: "Open chat", onClick: () => navigate(`/messages/${conversation_id}`) } });
  });
  const { profile } = useProfile();
  const connected = useRealtimeConnected();
  const badges = useBadges(role);
  const items = NAV[role] || [];
  const mobileItems = items.filter((i) => i.mobile);
  const location = profile?.barangay ? `Brgy. ${profile.barangay}` : role === "staff" ? me?.org : null;

  return (
    <div className="min-h-screen lg:pl-[264px]">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col bg-gradient-to-b from-brand-900 via-brand-900 to-brand-950 text-white lg:flex">
        <div className="px-6 pb-6 pt-7">
          <Brand />
        </div>
        <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3" aria-label="Main">
          {items.map((item) => {
            const active = current === item.to;
            return (
              <button
                key={item.to}
                type="button"
                onClick={() => navigate(`/${item.to}`)}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-[15px] font-semibold transition-colors",
                  active ? "bg-brand-600 text-white shadow-sm" : "text-brand-50/85 hover:bg-white/10 hover:text-white"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {item.label}
                <NavBadge count={item.badge ? badges[item.badge] : 0} dark />
              </button>
            );
          })}
        </nav>
        <div className="p-3">
          <AccountMenu align="up">
            <span className="flex items-center gap-3 rounded-2xl bg-white/10 p-3 text-left ring-1 ring-white/10 hover:bg-white/15">
              <Avatar name={me?.name || "?"} online={connected} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{me?.name}</span>
                <span className="block truncate text-xs text-brand-100/70">{ROLE_LABEL[role]}</span>
              </span>
              <ChevronDownIcon className="h-4 w-4 rotate-180 text-brand-100/70" />
            </span>
          </AccountMenu>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
        {/* mobile */}
        <div className="flex items-center justify-between gap-3 bg-brand-900 px-4 py-3 text-white lg:hidden">
          <Brand compact />
          <div className="flex items-center gap-1">
            {role !== "staff" && <NotificationBell tone="dark" />}
            <AccountMenu>
              <Avatar name={me?.name || "?"} size="sm" online={connected} />
            </AccountMenu>
          </div>
        </div>
        {/* desktop */}
        <div className="hidden items-center gap-4 px-6 py-3 lg:flex">
          <GlobalSearch className="max-w-xl flex-1" />
          <div className="ml-auto flex items-center gap-2">
            {location && (
              <span className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-stone-700">
                <PinIcon className="h-4 w-4 text-brand-600" /> {location}
              </span>
            )}
            <span
              className={cx("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", connected ? "bg-brand-50 text-brand-700" : "bg-stone-100 text-stone-500")}
              title={connected ? "Live updates on" : "Reconnecting…"}
            >
              <span className={cx("h-2 w-2 rounded-full", connected ? "animate-pulse bg-brand-500" : "bg-stone-400")} />
              {connected ? "Live" : "Connecting…"}
            </span>
            {role !== "staff" && <NotificationBell />}
            <AccountMenu>
              <span className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-stone-100">
                <Avatar name={me?.name || "?"} size="sm" />
                <ChevronDownIcon className="h-4 w-4 text-stone-400" />
              </span>
            </AccountMenu>
          </div>
        </div>
        <div className="px-4 pb-3 pt-3 lg:hidden">
          <GlobalSearch />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 animate-fade-in-up sm:px-6 lg:pb-12 lg:pt-7" key={current}>
        {children}
      </main>

      {/* Bottom tabs (mobile) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        aria-label="Main"
      >
        <div className="mx-auto flex max-w-lg">
          {mobileItems.map((item) => {
            const active = current === item.to;
            const count = item.badge ? badges[item.badge] : 0;
            return (
              <button
                key={item.to}
                type="button"
                onClick={() => navigate(`/${item.to}`)}
                aria-current={active ? "page" : undefined}
                className={cx("relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold", active ? "text-brand-700" : "text-stone-500")}
              >
                <item.icon className="h-6 w-6" />
                {item.mobile}
                {count > 0 && (
                  <span className="absolute left-1/2 top-1 ml-2 min-w-[16px] rounded-full bg-red-500 px-1 text-center text-[9px] font-bold leading-4 text-white">
                    {count > 9 ? "9+" : count}
                  </span>
                )}
                {active && <span className="absolute inset-x-6 top-0 h-[3px] rounded-b-full bg-brand-600" />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
