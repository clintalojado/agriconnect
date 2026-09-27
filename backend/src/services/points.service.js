// AgriPoints: farmers earn points for completed transactions and community
// activity. Each award has a unique `ref`, so repeating an action (e.g.
// completing the same order twice) never awards twice.

const { getDb } = require("../db/connection");

const AWARDS = {
  request_published: { points: 2, reason: "Request submitted" },
  order_completed: { points: 10, reason: "Order completed" },
  review_posted: { points: 5, reason: "Rated a supplier" },
  community_post: { points: 1, reason: "Shared in the community" },
};

// Point levels shown on the AgriPoints page.
const TIERS = [
  { name: "Seedling", min: 0 },
  { name: "Sprout", min: 50 },
  { name: "Harvester", min: 150 },
  { name: "Community Champion", min: 400 },
];

function award(farmerId, kind, ref) {
  const rule = AWARDS[kind];
  if (!rule || !farmerId) return null;
  const result = getDb()
    .prepare("INSERT OR IGNORE INTO agripoints (farmer_id, points, reason, ref) VALUES (?, ?, ?, ?)")
    .run(farmerId, rule.points, rule.reason, `${kind}:${ref}`);
  return result.changes ? rule.points : 0;
}

function getPoints(farmerId) {
  const db = getDb();
  const { total } = db.prepare("SELECT COALESCE(SUM(points), 0) AS total FROM agripoints WHERE farmer_id = ?").get(farmerId);
  const history = db
    .prepare("SELECT id, points, reason, ref, created_at FROM agripoints WHERE farmer_id = ? ORDER BY id DESC LIMIT 50")
    .all(farmerId);
  const tier = [...TIERS].reverse().find((t) => total >= t.min);
  const next = TIERS.find((t) => t.min > total) || null;
  return {
    total,
    tier: tier.name,
    next_tier: next ? { name: next.name, points_needed: next.min - total } : null,
    history,
    ways_to_earn: Object.values(AWARDS),
  };
}

module.exports = { award, getPoints, TIERS };
