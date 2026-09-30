// Evaluates the intent classifier two ways:
//   1. Held-out test set (test-set.js): messages never seen in training.
//   2. 5-fold stratified cross-validation over the training data.
// Prints accuracy, macro-F1, per-intent precision/recall/F1 and the misses.
//   npm run nlp:eval            (add --json for machine-readable output)

const { train, predict } = require("../src/services/nlp/intent/classifier");
const { EXAMPLES } = require("../src/services/nlp/intent/dataset");
const { TEST_SET } = require("../src/services/nlp/intent/test-set");

function score(pairs) {
  const labels = [...new Set(pairs.flatMap((p) => [p.expected, p.predicted]))].sort();
  const perIntent = labels.map((label) => {
    const tp = pairs.filter((p) => p.expected === label && p.predicted === label).length;
    const fp = pairs.filter((p) => p.expected !== label && p.predicted === label).length;
    const fn = pairs.filter((p) => p.expected === label && p.predicted !== label).length;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    return { label, support: tp + fn, precision, recall, f1 };
  }).filter((r) => r.support > 0);
  const accuracy = pairs.filter((p) => p.expected === p.predicted).length / pairs.length;
  const macroF1 = perIntent.reduce((s, r) => s + r.f1, 0) / perIntent.length;
  return { accuracy, macroF1, perIntent };
}

function holdOut() {
  const model = train(EXAMPLES);
  const pairs = TEST_SET.map((t) => {
    const p = predict(model, t.text);
    return { text: t.text, expected: t.intent, predicted: p.intent, confidence: p.confidence };
  });
  return { ...score(pairs), misses: pairs.filter((p) => p.expected !== p.predicted), n: pairs.length };
}

function crossValidate(folds = 5) {
  // Stratified: deal each intent's examples round-robin into the folds.
  const buckets = Array.from({ length: folds }, () => []);
  const byIntent = {};
  for (const e of EXAMPLES) (byIntent[e.intent] ||= []).push(e);
  for (const list of Object.values(byIntent)) list.forEach((e, i) => buckets[i % folds].push(e));

  const pairs = [];
  for (let k = 0; k < folds; k++) {
    const model = train(buckets.filter((_, i) => i !== k).flat());
    for (const e of buckets[k]) pairs.push({ expected: e.intent, predicted: predict(model, e.text).intent });
  }
  return score(pairs);
}

const pct = (n) => `${(n * 100).toFixed(1)}%`;
const holdout = holdOut();
const cv = crossValidate();

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ holdout, cross_validation: cv }, null, 2));
  process.exit(0);
}

console.log(`Training examples: ${EXAMPLES.length}   Held-out test messages: ${holdout.n}\n`);
console.log(`HELD-OUT TEST SET   accuracy ${pct(holdout.accuracy)}   macro-F1 ${pct(holdout.macroF1)}`);
console.log(`5-FOLD CROSS-VAL    accuracy ${pct(cv.accuracy)}   macro-F1 ${pct(cv.macroF1)}\n`);
console.log("Per intent (held-out):");
console.log("  intent               n   precision  recall   F1");
for (const r of holdout.perIntent) {
  console.log(`  ${r.label.padEnd(18)} ${String(r.support).padStart(3)}   ${pct(r.precision).padStart(7)}  ${pct(r.recall).padStart(7)}  ${pct(r.f1).padStart(7)}`);
}
if (holdout.misses.length) {
  console.log("\nMisclassified (held-out):");
  for (const m of holdout.misses) console.log(`  "${m.text}"  expected ${m.expected}, got ${m.predicted} (${pct(m.confidence)})`);
}
