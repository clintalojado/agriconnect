import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { useSession } from "../lib/session";
import { Card, EmptyState, PageHeader, Skeleton, formatRelative } from "../components/ui.jsx";
import { AwardIcon, CheckIcon } from "../components/icons.jsx";

const TIERS = [
  { name: "Seedling", min: 0 },
  { name: "Sprout", min: 50 },
  { name: "Harvester", min: 150 },
  { name: "Community Champion", min: 400 },
];

export default function AgriPoints() {
  const { me } = useSession();
  const [data, setData] = useState(null);

  useEffect(() => {
    apiClient.get(`/farmers/${me.id}/points`).then(setData).catch(() => setData({ total: 0, history: [], ways_to_earn: [] }));
  }, [me.id]);

  if (!data) return <Skeleton className="h-72 rounded-3xl" />;
  const next = data.next_tier;
  const currentMin = TIERS.find((t) => t.name === data.tier)?.min ?? 0;
  const progress = next ? ((data.total - currentMin) / (data.total - currentMin + next.points_needed)) * 100 : 100;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="AgriPoints" description="Earn points for every successful transaction and community activity." />
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-harvest-400 via-harvest-500 to-harvest-600 p-6 text-white">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 ring-2 ring-white/40">
              <AwardIcon className="h-9 w-9" />
            </span>
            <div>
              <p className="text-4xl font-extrabold">{data.total}</p>
              <p className="font-semibold text-white/90">AgriPoints · {data.tier}</p>
            </div>
          </div>
          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white" style={{ width: `${Math.max(4, Math.min(100, progress))}%` }} />
          </div>
          <p className="mt-2 text-sm text-white/90">{next ? `${next.points_needed} more points to ${next.name}` : "Top tier reached — salamat!"}</p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {data.ways_to_earn.map((w) => (
            <div key={w.reason} className="flex items-center gap-3 rounded-2xl bg-stone-50 p-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-harvest-100 font-extrabold text-harvest-600">+{w.points}</span>
              <span className="text-sm font-semibold text-stone-700">{w.reason}</span>
            </div>
          ))}
        </div>
      </Card>

      <h2 className="mb-3 mt-8 text-lg font-extrabold text-stone-900">Tiers</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TIERS.map((t) => (
          <Card key={t.name} className={data.total >= t.min ? "p-4 ring-1 ring-harvest-300" : "p-4 opacity-60"}>
            <p className="text-sm font-bold text-stone-900">{t.name}</p>
            <p className="text-xs text-stone-500">{t.min}+ points</p>
            {data.total >= t.min && <CheckIcon className="mt-2 h-4 w-4 text-brand-600" />}
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-extrabold text-stone-900">History</h2>
      {data.history.length === 0 ? (
        <EmptyState icon={AwardIcon} title="No points yet" description="Submit a request or complete an order to start earning." />
      ) : (
        <Card className="divide-y divide-stone-100">
          {data.history.map((h) => (
            <div key={h.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-stone-800">{h.reason}</p>
                <p className="text-xs text-stone-400">{formatRelative(h.created_at)}</p>
              </div>
              <span className="font-extrabold text-brand-700">+{h.points}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
