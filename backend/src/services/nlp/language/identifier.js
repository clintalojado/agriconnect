// Language identifier for farmer messages: multinomial Naive Bayes over
// character n-grams (1–4 letters, with word boundaries) plus whole words.
// Character n-grams carry most of the signal — "ng", "ang" (Tagalog), "og",
// "nako" (Bisaya), "sang", "kag" (Hiligaynon), "ti", "ak" (Ilocano) — and
// keep working on misspellings and text-speak.
//
// Plain JavaScript, no dependencies; training on the bundled corpus takes a
// few milliseconds.

const ALPHA = 0.1; // Laplace smoothing
const WORD_WEIGHT = 2; // a whole known word counts as much as two n-grams

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(.)\1{2,}/g, "$1$1") // "salamaaat" → "salamaat"
    .replace(/[^a-zñ\s'-]/g, " ")
    .replace(/['-]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function features(words) {
  const counts = new Map();
  const add = (f, n = 1) => counts.set(f, (counts.get(f) || 0) + n);
  for (const w of words) {
    add(`w:${w}`, WORD_WEIGHT);
    const padded = ` ${w} `;
    for (let n = 1; n <= 4; n++) {
      for (let i = 0; i + n <= padded.length; i++) {
        const gram = padded.slice(i, i + n);
        if (gram.trim()) add(`c:${gram}`);
      }
    }
  }
  return counts;
}

/**
 * Trains on { language: [sentences] }. Besides the n-gram statistics it
 * records which languages each word was seen in, used to tell whether a
 * message holds any real evidence of its language.
 */
function train(corpus) {
  const languages = Object.keys(corpus);
  const counts = {};
  const totals = {};
  const vocab = new Set();
  const wordLanguages = new Map();
  // Capitalised after the first word: a name or place ("si Juan", "taga Lika").
  const properNouns = new Set();

  for (const language of languages) {
    counts[language] = new Map();
    totals[language] = 0;
    for (const sentence of corpus[language]) {
      for (const m of sentence.slice(1).matchAll(/\b[A-Z][a-zñ]+/g)) properNouns.add(m[0].toLowerCase());
      const words = normalize(sentence);
      for (const w of words) {
        if (!wordLanguages.has(w)) wordLanguages.set(w, new Set());
        wordLanguages.get(w).add(language);
      }
      for (const [f, n] of features(words)) {
        counts[language].set(f, (counts[language].get(f) || 0) + n);
        totals[language] += n;
        vocab.add(f);
      }
    }
  }
  for (const w of properNouns) wordLanguages.delete(w);
  return { languages, counts, totals, vocabSize: vocab.size, wordLanguages };
}

function softmax(scores) {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/**
 * Returns { ranking: [{ language, confidence }], words }. Confidence is the
 * Naive Bayes posterior with the log-likelihoods averaged per word, which
 * keeps it calibrated for both one-word and long messages.
 */
function predict(model, text) {
  const words = normalize(text);
  const feats = features(words);
  const scores = model.languages.map((language) => {
    const c = model.counts[language];
    const denom = Math.log(model.totals[language] + ALPHA * model.vocabSize);
    let score = 0;
    for (const [f, n] of feats) score += n * (Math.log((c.get(f) || 0) + ALPHA) - denom);
    return score / Math.max(1, words.length);
  });
  const probs = softmax(scores);
  const ranking = model.languages
    .map((language, i) => ({ language, confidence: probs[i] }))
    .sort((a, b) => b.confidence - a.confidence);
  return { ranking, words };
}

module.exports = { train, predict, normalize };
