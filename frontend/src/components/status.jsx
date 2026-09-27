import { Badge } from "./ui.jsx";
import { StarIcon } from "./icons.jsx";

// Status labels and colors shared by every screen (names follow the app designs).

export const REQUEST_STATUS = {
  draft: { label: "Draft", tone: "stone" },
  awaiting_verification: { label: "Awaiting verification", tone: "violet" },
  for_quotation: { label: "For Quotation", tone: "amber" },
  supplier_confirmed: { label: "Supplier Confirmed", tone: "green" },
  for_delivery: { label: "For Delivery", tone: "blue" },
  delivered: { label: "Delivered", tone: "blue" },
  completed: { label: "Completed", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
};

export const ORDER_STATUS = {
  confirmed: { label: "Confirmed", tone: "green" },
  for_delivery: { label: "For Delivery", tone: "blue" },
  delivered: { label: "Delivered", tone: "blue" },
  completed: { label: "Completed", tone: "stone" },
  cancelled: { label: "Cancelled", tone: "red" },
};

export const QUOTE_STATUS = {
  pending: { label: "Awaiting farmer", tone: "amber" },
  accepted: { label: "Accepted", tone: "green" },
  declined: { label: "Not selected", tone: "stone" },
  withdrawn: { label: "Withdrawn", tone: "stone" },
};

export const INBOUND_STATUS = {
  new: { label: "New", tone: "blue" },
  needs_info: { label: "Needs info", tone: "amber" },
  awaiting_confirmation: { label: "Awaiting farmer OK", tone: "violet" },
  answered: { label: "Answered", tone: "stone" },
  published: { label: "Published", tone: "green" },
  dismissed: { label: "Dismissed", tone: "stone" },
};

export const VERIFICATION_STATUS = {
  pending: { label: "Pending verification", tone: "violet" },
  more_info: { label: "More info needed", tone: "amber" },
  verified: { label: "Verified", tone: "green" },
  rejected: { label: "Not approved", tone: "red" },
};

export function StatusBadge({ map, status, dot = true }) {
  const meta = map[status] || { label: status, tone: "stone" };
  return (
    <Badge tone={meta.tone} dot={dot}>
      {meta.label}
    </Badge>
  );
}

export function Rating({ value, count, className = "" }) {
  if (!value) return <span className={`text-xs font-medium text-stone-400 ${className}`}>New</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold text-stone-700 ${className}`}>
      <StarIcon filled className="h-3.5 w-3.5 text-harvest-400" />
      {Number(value).toFixed(1)}
      {count != null && <span className="font-normal text-stone-400">({count})</span>}
    </span>
  );
}

export function StarInput({ value, onChange }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onClick={() => onChange(n)}
          className="rounded p-0.5 text-harvest-400 transition-transform hover:scale-110"
        >
          <StarIcon filled={n <= value} className="h-7 w-7" />
        </button>
      ))}
    </div>
  );
}

export const CATEGORY_LABEL = {
  all: "All",
  seeds: "Seeds",
  fertilizer: "Fertilizer",
  pesticide: "Pesticide",
  feeds: "Feeds",
  tools: "Tools",
};

export function perUnit(unit) {
  return { sacks: "sack", bags: "bag", bottles: "bottle", liters: "liter", packs: "pack" }[unit] || unit || "unit";
}
