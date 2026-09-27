import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertIcon, CheckIcon, InfoIcon, XIcon } from "./icons.jsx";

export function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

// ---------- Buttons ----------

const BUTTON_VARIANTS = {
  primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800",
  secondary: "border border-stone-300 bg-white text-stone-700 shadow-sm hover:bg-stone-50 hover:border-stone-400",
  soft: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  ghost: "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  warning: "border border-harvest-300 bg-harvest-50 text-harvest-600 hover:bg-harvest-100",
  // For dark (green) backgrounds. Use these instead of overriding colors with
  // className — conflicting Tailwind color classes don't reliably win.
  light: "bg-white text-brand-900 shadow-sm hover:bg-brand-50",
  outlineLight: "text-white ring-1 ring-inset ring-white/35 hover:bg-white/10",
  dangerGhost: "text-red-600 hover:bg-red-50",
};

const BUTTON_SIZES = {
  xs: "h-7 px-2.5 text-xs gap-1 rounded-lg",
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-base gap-2 rounded-xl",
  icon: "h-9 w-9 rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon: Icon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        "inline-flex shrink-0 items-center justify-center font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className
      )}
      {...props}
    >
      {loading ? <Spinner className="h-4 w-4" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className = "h-5 w-5" }) {
  return (
    <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------- Layout ----------

export function Card({ className, children, ...props }) {
  return (
    <div className={cx("rounded-2xl border border-stone-200/80 bg-white shadow-card", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ icon: Icon, title, subtitle, action, className }) {
  return (
    <div className={cx("flex items-start justify-between gap-3", className)}>
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-stone-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, eyebrow, action }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-wider text-brand-600">{eyebrow}</p>}
        <h2 className="text-2xl font-extrabold tracking-tight text-stone-900 sm:text-[28px]">{title}</h2>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-stone-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------- Forms ----------

export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cx("block", className)}>
      {label && (
        <span className="mb-1.5 block text-sm font-semibold text-stone-700">
          {label} {hint && <span className="font-normal text-stone-400">{hint}</span>}
        </span>
      )}
      {children}
      {error && <span className="mt-1.5 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}

export function Input({ className, ...props }) {
  return <input className={cx("input", className)} {...props} />;
}

export function Textarea({ className, ...props }) {
  return <textarea className={cx("input resize-none leading-relaxed", className)} {...props} />;
}

export function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer select-none items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand-600" : "bg-stone-300"
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          )}
        />
      </button>
      <span className="text-sm">
        <span className="font-medium text-stone-700">{label}</span>
        {description && <span className="block text-xs text-stone-500">{description}</span>}
      </span>
    </label>
  );
}

// ---------- Status ----------

const BADGE_TONES = {
  green: "bg-brand-50 text-brand-700 ring-brand-600/20",
  amber: "bg-harvest-50 text-harvest-600 ring-harvest-500/25",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
  stone: "bg-stone-100 text-stone-600 ring-stone-500/20",
};

const DOT_TONES = {
  green: "bg-brand-500",
  amber: "bg-harvest-400",
  blue: "bg-sky-500",
  red: "bg-red-500",
  violet: "bg-violet-500",
  stone: "bg-stone-400",
};

export function Badge({ tone = "stone", dot = false, className, children }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        BADGE_TONES[tone],
        className
      )}
    >
      {dot && <span className={cx("h-1.5 w-1.5 rounded-full", DOT_TONES[tone])} />}
      {children}
    </span>
  );
}

const ALERT_TONES = {
  error: { box: "border-red-200 bg-red-50 text-red-800", icon: AlertIcon, iconColor: "text-red-500" },
  warning: { box: "border-harvest-200 bg-harvest-50 text-stone-800", icon: AlertIcon, iconColor: "text-harvest-500" },
  success: { box: "border-brand-200 bg-brand-50 text-brand-900", icon: CheckIcon, iconColor: "text-brand-600" },
  info: { box: "border-sky-200 bg-sky-50 text-sky-900", icon: InfoIcon, iconColor: "text-sky-500" },
};

export function Alert({ tone = "info", title, children, onClose, className }) {
  const style = ALERT_TONES[tone];
  const Icon = style.icon;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex gap-3 rounded-xl border px-4 py-3 text-sm", style.box, className)}>
      <Icon className={cx("mt-0.5 h-4 w-4 shrink-0", style.iconColor)} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Dismiss">
          <XIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cx("rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-10 text-center", className)}>
      {Icon && (
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-400">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <p className="font-semibold text-stone-800">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-stone-500">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cx("animate-pulse rounded-lg bg-stone-200/70", className)} />;
}

export function SkeletonList({ rows = 3 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-2.5 h-3 w-1/2" />
        </Card>
      ))}
    </div>
  );
}

// ---------- Navigation ----------

export function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cx("inline-flex rounded-xl bg-stone-200/60 p-1", className)} role="tablist">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-all",
              active ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"
            )}
          >
            {opt.icon && <opt.icon className="h-4 w-4" />}
            {opt.label}
            {opt.count > 0 && (
              <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold leading-4 text-white">{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------- People ----------

const AVATAR_TONES = [
  "bg-brand-100 text-brand-800",
  "bg-harvest-100 text-harvest-600",
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
  "bg-rose-100 text-rose-800",
];

export function Avatar({ name = "?", size = "md", online, className }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") || "?";
  const tone = AVATAR_TONES[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  const sizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg", xl: "h-20 w-20 text-2xl" };
  return (
    <span className={cx("relative inline-flex shrink-0", className)}>
      <span className={cx("flex items-center justify-center rounded-full font-bold", sizes[size], tone)}>{initials}</span>
      {online != null && (
        <span
          className={cx(
            "absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-white",
            online ? "bg-brand-500" : "bg-stone-300"
          )}
          title={online ? "Online" : "Offline"}
        />
      )}
    </span>
  );
}

// ---------- Modal ----------

export function Modal({ open, onClose, title, subtitle, children, footer, size = "md" }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-2xl" };
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-stone-900/50 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          "flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-lift animate-fade-in-up sm:rounded-3xl",
          widths[size]
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 pb-4 pt-5">
          <div>
            <h3 className="text-lg font-bold text-stone-900">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Close">
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-stone-100 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Toasts ----------

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    ({ title, body, tone = "info", action, duration = 6000 }) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { id, title, body, tone, action }]);
      if (duration) setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:top-4 sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto w-full max-w-sm animate-fade-in-up rounded-2xl border border-stone-200 bg-white p-4 shadow-lift"
          >
            <div className="flex gap-3">
              <span
                className={cx(
                  "mt-1 h-2 w-2 shrink-0 rounded-full",
                  t.tone === "error" ? "bg-red-500" : t.tone === "success" ? "bg-brand-500" : "bg-sky-500"
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-stone-900">{t.title}</p>
                {t.body && <p className="mt-0.5 line-clamp-2 text-sm text-stone-500">{t.body}</p>}
                {t.action && (
                  <button
                    type="button"
                    onClick={() => {
                      t.action.onClick();
                      dismiss(t.id);
                    }}
                    className="mt-2 text-sm font-semibold text-brand-700 hover:text-brand-800"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} className="text-stone-400 hover:text-stone-600" aria-label="Dismiss">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ---------- Formatting ----------

// SQLite datetime('now') values are UTC without a zone marker.
export function parseDbDate(value) {
  if (!value) return null;
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

export function formatRelative(value) {
  const date = parseDbDate(value);
  if (!date) return "";
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diff < 7 * 86400) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatTime(value) {
  const date = parseDbDate(value);
  return date ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}

/** "2026-10-15" → "Oct 15, 2026". Non-date text (e.g. "next week") is returned as-is. */
export function formatDate(value) {
  if (!value) return "";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(value);
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export function formatPeso(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
