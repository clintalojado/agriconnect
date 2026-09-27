const SINGULAR = { sacks: "sack", bags: "bag", bottles: "bottle", liters: "liter", packs: "pack" };

/** "sacks" → "sack", for prices like "P1,150/sack". */
function perUnit(unit) {
  return SINGULAR[unit] || unit || "unit";
}

/** "P1,150" — plain P rather than ₱ so it survives any SMS gateway. */
function money(amount) {
  return `P${Number(amount).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

module.exports = { perUnit, money };
