import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { navigate } from "../lib/router";
import { useSession } from "../lib/session";
import { Button, Card, EmptyState, Skeleton, cx } from "../components/ui.jsx";
import { ProductCard, SectionTitle, VerificationBanner } from "../components/common.jsx";
import { REQUEST_STATUS, StatusBadge } from "../components/status.jsx";
import ProductArt from "../components/ProductArt.jsx";
import {
  AwardIcon,
  BoxIcon,
  ChevronDownIcon,
  ClipboardIcon,
  SproutIcon,
  StoreIcon,
  TagIcon,
  UsersIcon,
} from "../components/icons.jsx";

const QUICK_ACTIONS = [
  { label: "Request Inputs", icon: ClipboardIcon, to: "/requests/new" },
  { label: "Compare Prices", icon: TagIcon, to: "/marketplace" },
  { label: "Track Orders", icon: BoxIcon, to: "/orders" },
  { label: "AgriPoints", icon: AwardIcon, to: "/points" },
  { label: "Find Suppliers", icon: StoreIcon, to: "/suppliers" },
  { label: "Community", icon: UsersIcon, to: "/community" },
];

function HeroIllustration() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden="true">
      <circle cx="250" cy="52" r="26" fill="#fbb64d" opacity=".9" />
      <path d="M0 150c60-30 120-34 180-18s100 8 140-12v80H0z" fill="#51b37f" opacity=".55" />
      <path d="M0 170c70-22 140-20 200-6s90 6 120-6v42H0z" fill="#2f9763" />
      {Array.from({ length: 14 }, (_, i) => (
        <g key={i} transform={`translate(${14 + i * 22} ${150 + (i % 2) * 6})`} stroke="#14412e" strokeWidth="2" strokeLinecap="round">
          <path d="M0 22V4" />
          <path d="M0 10c-6-2-9-6-9-10 5 0 8 3 9 8M0 8c5-3 8-6 9-9 0 5-4 8-9 10" fill="#84cfa6" />
        </g>
      ))}
    </svg>
  );
}

function ActiveRequests() {
  const { me } = useSession();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    apiClient
      .get(`/requests/${me.id}`)
      .then((all) => setRows(all.filter((r) => !["completed", "rejected", "draft"].includes(r.display_status)).slice(0, 4)))
      .catch(() => setRows([]));
  }, [me.id]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between bg-brand-800 px-4 py-3 text-white">
        <h2 className="font-bold">My Active Requests</h2>
        <button type="button" onClick={() => navigate("/requests")} className="text-xs font-semibold text-brand-100 hover:text-white">
          View All
        </button>
      </div>
      {rows === null ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-5 text-center">
          <p className="text-sm text-stone-500">No active requests.</p>
          <Button size="sm" className="mt-3" onClick={() => navigate("/requests/new")}>
            Request inputs
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-stone-100">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => navigate(`/requests/${r.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50">
                <ProductArt product={{ name: r.product_name, category: r.product_category }} className="h-10 w-10 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-stone-900">{r.product_name}</span>
                  <span className="block truncate text-xs text-stone-500">
                    {r.quantity} {r.unit} · Brgy. {r.barangay}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <StatusBadge map={REQUEST_STATUS} status={r.display_status} dot={false} />
                  {r.display_status === "for_quotation" && r.quote_count > 0 && (
                    <span className="text-[11px] font-semibold text-brand-700">
                      {r.quote_count} quote{r.quote_count > 1 ? "s" : ""}
                    </span>
                  )}
                </span>
                <ChevronDownIcon className="h-4 w-4 -rotate-90 text-stone-300" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PointsCard() {
  const { me } = useSession();
  const [points, setPoints] = useState(null);
  useEffect(() => {
    apiClient.get(`/farmers/${me.id}/points`).then(setPoints).catch(() => {});
  }, [me.id]);
  return (
    <Card className="bg-gradient-to-br from-harvest-50 via-white to-brand-50 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-harvest-400 text-white shadow-sm">
          <AwardIcon className="h-6 w-6" />
        </span>
        <div>
          <h2 className="font-bold text-stone-900">Get AgriPoints</h2>
          <p className="text-xs text-stone-500">Earn points for every successful transaction and community activity.</p>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-3xl font-extrabold text-stone-900">{points ? points.total : "–"}</p>
          <p className="text-xs font-semibold text-stone-500">AgriPoints{points ? ` · ${points.tier}` : ""}</p>
        </div>
        <button type="button" onClick={() => navigate("/points")} className="text-sm font-semibold text-brand-700 hover:text-brand-800">
          View Rewards →
        </button>
      </div>
    </Card>
  );
}

export default function FarmerDashboard() {
  const { me } = useSession();
  const [popular, setPopular] = useState(null);

  useEffect(() => {
    apiClient.get("/products/popular?limit=8").then(setPopular).catch(() => setPopular([]));
  }, []);

  return (
    <div>
      <VerificationBanner />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 text-white shadow-lift">
            <div className="absolute inset-y-0 right-0 hidden w-1/2 sm:block">
              <HeroIllustration />
            </div>
            <div className="relative p-6 sm:max-w-[60%] sm:p-8">
              <p className="text-sm font-semibold text-brand-100">Magandang araw, {me.name.split(" ")[0]}!</p>
              <h1 className="mt-2 text-2xl font-extrabold leading-tight sm:text-3xl">
                Farm Inputs.
                <span className="block text-brand-300">Closer to You.</span>
              </h1>
              <p className="mt-3 text-sm text-brand-50/85">
                Find, request, and get farm inputs from trusted suppliers in your barangay and nearby areas.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button onClick={() => navigate("/marketplace")} variant="light">
                  Browse Farm Inputs →
                </Button>
                <Button variant="outlineLight" onClick={() => navigate("/requests/new")}>
                  Request inputs
                </Button>
              </div>
            </div>
            <p className="relative hidden px-8 pb-5 text-right text-sm font-semibold italic text-brand-100/90 sm:block">
              “Stronger Farmers, Stronger Communities”
            </p>
          </div>

          {/* Quick actions */}
          <Card className="grid grid-cols-3 gap-y-4 p-4 sm:grid-cols-6">
            {QUICK_ACTIONS.map((a) => (
              <button key={a.label} type="button" onClick={() => navigate(a.to)} className="group flex flex-col items-center gap-2 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100 transition group-hover:bg-brand-600 group-hover:text-white">
                  <a.icon className="h-6 w-6" />
                </span>
                <span className="text-xs font-semibold text-stone-700">{a.label}</span>
              </button>
            ))}
          </Card>

          <div>
            <SectionTitle title="Popular Farm Inputs" action="View All" onAction={() => navigate("/marketplace")} />
            {popular === null ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
                ))}
              </div>
            ) : popular.length === 0 ? (
              <EmptyState icon={SproutIcon} title="No products yet" />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {popular.slice(0, 8).map((p, i) => (
                  <div key={p.id} className={cx(i >= 4 && "hidden sm:block")}>
                    <ProductCard product={p} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <ActiveRequests />
          <PointsCard />
          <button
            type="button"
            onClick={() => navigate("/community")}
            className="relative block w-full overflow-hidden rounded-3xl bg-gradient-to-br from-harvest-500 to-harvest-600 p-6 text-left text-white shadow-lift"
          >
            <UsersIcon className="absolute -bottom-4 -right-4 h-32 w-32 text-white/15" />
            <p className="text-xl font-extrabold italic leading-tight">
              Stronger Farmers,
              <br />
              Stronger Communities
            </p>
            <p className="mt-2 text-sm text-white/85">Share tips and ask neighbors in the community →</p>
          </button>
        </div>
      </div>
    </div>
  );
}
