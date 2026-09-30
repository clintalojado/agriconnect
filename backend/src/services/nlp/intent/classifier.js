// Intent classifier for farmer messages: multinomial logistic regression
// (softmax) trained with mini-batch-free SGD and L2 regularisation.
//
// Features per message:
//   w:<word>          word unigrams      ("magkano", "delivery")
//   b:<word>_<word>   word bigrams       ("cash_on", "saan_kayo")
//   c:<3 letters>     character trigrams of each word, with boundaries —
//                     these make the model tolerant of misspellings and
//                     text-speak ("mgkano", "delivry", "slmat").
// Values are binary and the vector is L2-normalised.
//
// Plain JavaScript, no dependencies, deterministic (seeded shuffle), and fast:
// training on the bundled dataset takes well under a second.

const STOPWORDS = new Set(["po", "ho", "opo", "ba", "na", "pa", "ng", "nga", "ang", "yung", "ung", "the", "a", "an"]);

/** Lowercase, strip accents/punctuation, squeeze "poooo" → "poo", numbers → <num>. */
function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(.)\1{2,}/g, "$1$1")
    .replace(/\d+([.,]\d+)?/g, " <num> ")
    .replace(/[^a-z<>\s'-]/g, " ")
    .replace(/['-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalize(text).split(" ").filter(Boolean);
}

function featurize(text) {
  const tokens = tokenize(text);
  const content = tokens.filter((t) => !STOPWORDS.has(t));
  const features = new Set();
  for (const t of content) {
    features.add(`w:${t}`);
    if (t === "<num>") continue;
    const padded = `^${t}$`;
    for (let i = 0; i + 3 <= padded.length; i++) features.add(`c:${padded.slice(i, i + 3)}`);
  }
  for (let i = 0; i + 1 < content.length; i++) features.add(`b:${content[i]}_${content[i + 1]}`);
  return [...features];
}

// Small seeded PRNG (mulberry32) so training is reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function softmax(scores) {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/**
 * Trains a model from [{ text, intent }].
 * Returns { labels, vocab: Map<feature, index>, weights: Float64Array[], bias: number[] }.
 */
function train(examples, { epochs = 60, learningRate = 1, l2 = 1e-5, seed = 42 } = {}) {
  const labels = [...new Set(examples.map((e) => e.intent))].sort();
  const labelIndex = new Map(labels.map((l, i) => [l, i]));

  const vocab = new Map();
  const rows = examples.map((e) => {
    const idx = featurize(e.text).map((f) => {
      if (!vocab.has(f)) vocab.set(f, vocab.size);
      return vocab.get(f);
    });
    return { idx, value: idx.length ? 1 / Math.sqrt(idx.length) : 0, y: labelIndex.get(e.intent) };
  });

  const weights = labels.map(() => new Float64Array(vocab.size));
  const bias = labels.map(() => 0);
  const random = rng(seed);
  const order = rows.map((_, i) => i);

  for (let epoch = 0; epoch < epochs; epoch++) {
    // Fisher–Yates shuffle each epoch.
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const lr = learningRate / (1 + epoch * 0.1);
    for (const r of order) {
      const { idx, value, y } = rows[r];
      const scores = weights.map((w, k) => bias[k] + idx.reduce((s, f) => s + w[f] * value, 0));
      const probs = softmax(scores);
      for (let k = 0; k < labels.length; k++) {
        const grad = probs[k] - (k === y ? 1 : 0);
        const w = weights[k];
        for (const f of idx) w[f] -= lr * (grad * value + l2 * w[f]);
        bias[k] -= lr * grad;
      }
    }
  }
  return { labels, vocab, weights, bias };
}

/** Returns { intent, confidence, ranking: [{ intent, confidence }] }. */
function predict(model, text) {
  const idx = featurize(text)
    .map((f) => model.vocab.get(f))
    .filter((i) => i !== undefined);
  const value = idx.length ? 1 / Math.sqrt(idx.length) : 0;
  const scores = model.weights.map((w, k) => model.bias[k] + idx.reduce((s, f) => s + w[f] * value, 0));
  const probs = softmax(scores);
  const ranking = model.labels
    .map((intent, k) => ({ intent, confidence: probs[k] }))
    .sort((a, b) => b.confidence - a.confidence);
  // Nothing recognised at all (e.g. emoji only): no evidence for any intent.
  if (idx.length === 0) return { intent: null, confidence: 0, ranking };
  return { intent: ranking[0].intent, confidence: ranking[0].confidence, ranking };
}

module.exports = { train, predict, featurize, normalize, tokenize };
