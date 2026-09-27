import { cx } from "./ui.jsx";
import { AwardIcon, BoxIcon, ShieldCheckIcon, SparkleIcon, UsersIcon } from "./icons.jsx";

// The AgriConnect business process (BPMN), phase by phase — who does what.
export const PHASES = [
  {
    n: 1,
    title: "Registration & Verification",
    icon: ShieldCheckIcon,
    color: "from-brand-700 to-brand-800",
    chip: "bg-brand-50 text-brand-800 ring-brand-200",
    steps: [
      ["Farmer", "Sends a first message by SMS, Messenger, or the app"],
      ["System", "Checks if registered; if not, asks name, barangay, municipality"],
      ["System", "Sends an OTP to confirm the phone number"],
      ["Barangay / LGU / Coop", "Reviews and approves the farmer (verification record)"],
    ],
  },
  {
    n: 2,
    title: "Request Intake & AI Processing",
    icon: SparkleIcon,
    color: "from-sky-500 to-sky-600",
    chip: "bg-sky-50 text-sky-800 ring-sky-200",
    steps: [
      ["System", "AI/NLP extracts products, quantities, location, timing, intent"],
      ["System", "Builds a structured request with a confidence score"],
      ["Farmer", "Confirms (reply OO) or edits the request details"],
      ["System", "Stores the validated request"],
    ],
  },
  {
    n: 3,
    title: "Demand Aggregation & Supplier Matching",
    icon: UsersIcon,
    color: "from-harvest-400 to-harvest-500",
    chip: "bg-harvest-50 text-harvest-600 ring-harvest-200",
    steps: [
      ["System", "Pools demand by product, barangay, and schedule"],
      ["System", "Matches verified suppliers and requests quotations"],
      ["Supplier", "Checks stock and location, submits price, quantity, delivery option, timing"],
      ["Farmer", "Receives quotations and picks a supplier"],
    ],
  },
  {
    n: 4,
    title: "Order Confirmation & Fulfillment",
    icon: BoxIcon,
    color: "from-violet-500 to-violet-600",
    chip: "bg-violet-50 text-violet-800 ring-violet-200",
    steps: [
      ["System", "Records the selected supplier and creates the order"],
      ["Supplier", "Receives the confirmed order, prepares and delivers"],
      ["Supplier", "Updates the delivery status"],
      ["Farmer", "Gets confirmation and delivery updates"],
    ],
  },
  {
    n: 5,
    title: "Completion & Engagement",
    icon: AwardIcon,
    color: "from-brand-400 to-brand-500",
    chip: "bg-brand-50 text-brand-800 ring-brand-200",
    steps: [
      ["Farmer", "Confirms receipt of the farm inputs"],
      ["Farmer", "Rates the supplier and earns AgriPoints"],
      ["System", "Updates AgriPoints, transactions, and reports"],
    ],
  },
];

const ACTOR_TONE = {
  Farmer: "bg-brand-100 text-brand-800",
  System: "bg-sky-100 text-sky-800",
  "Barangay / LGU / Coop": "bg-stone-200 text-stone-700",
  Supplier: "bg-harvest-100 text-harvest-600",
};

export default function ProcessFlow({ compact = false, highlight }) {
  return (
    <div className={cx("grid gap-3", compact ? "sm:grid-cols-5" : "md:grid-cols-2 xl:grid-cols-5")}>
      {PHASES.map((phase) => (
        <div
          key={phase.n}
          className={cx(
            "flex flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-card",
            highlight && highlight !== phase.n && "opacity-60"
          )}
        >
          <div className={cx("flex items-center gap-2 bg-gradient-to-r px-4 py-3 text-white", phase.color)}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-extrabold">{phase.n}</span>
            <p className="text-sm font-bold leading-tight">{phase.title}</p>
          </div>
          {!compact && (
            <ol className="flex-1 space-y-2.5 p-4">
              {phase.steps.map(([actor, text], i) => (
                <li key={i} className="text-sm leading-snug text-stone-700">
                  <span className={cx("mr-1.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", ACTOR_TONE[actor])}>{actor}</span>
                  {text}
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  );
}
