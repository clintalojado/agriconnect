// The trained language identifier, built once on first use from corpus.js.

const { train, predict } = require("./identifier");
const { CORPUS } = require("./corpus");

// Words every Philippine language (and Taglish) uses the same way: on their
// own they say nothing about which language the farmer speaks.
const NEUTRAL_WORDS = new Set([
  "oo", "ok", "okay", "oks", "sige", "salamat", "yes", "no", "hello", "hi", "status", "help", "reg", "skip",
  "urea", "abono", "sako", "kilo", "order", "delivery", "presyo", "supplier", "barangay", "brgy", "mais", "feeds",
]);
// A word seen in at most this many languages' training text counts as evidence.
const MAX_EVIDENCE_LANGUAGES = 3;
// Below this posterior the message is too ambiguous to change the reply language.
const CONFIDENCE_THRESHOLD = 0.5;

let model = null;

function getModel() {
  if (!model) model = train(CORPUS);
  return model;
}

/**
 * Identifies the language of one message.
 * Returns { language, confidence, confident, ranking (top 3), evidence }.
 * `confident` is false for messages without language-specific words — "OO",
 * "5 sako urea", a name — so callers keep using the farmer's known language.
 */
function identifyLanguage(text) {
  const m = getModel();
  const { ranking, words } = predict(m, text);
  const evidence = words.filter((w) => {
    if (NEUTRAL_WORDS.has(w) || w.length < 2) return false;
    const seen = m.wordLanguages.get(w);
    return seen && seen.size <= MAX_EVIDENCE_LANGUAGES;
  });

  let top = ranking[0];
  // Taglish and other code-switching: English plus any Filipino-only word
  // means the farmer reads Filipino, so answer in that language.
  if (top.language === "english" && evidence.some((w) => !m.wordLanguages.get(w).has("english"))) {
    top = ranking.find((r) => r.language !== "english");
  }

  return {
    language: top.language,
    confidence: Math.round(top.confidence * 1000) / 1000,
    confident: evidence.length > 0 && top.confidence >= CONFIDENCE_THRESHOLD,
    ranking: ranking.slice(0, 3).map((r) => ({ language: r.language, confidence: Math.round(r.confidence * 1000) / 1000 })),
    evidence,
  };
}

function languageModelInfo() {
  const m = getModel();
  return {
    algorithm: "Multinomial Naive Bayes over character 1–4-grams and words",
    languages: m.languages,
    training_sentences: Object.fromEntries(Object.entries(CORPUS).map(([k, v]) => [k, v.length])),
    confidence_threshold: CONFIDENCE_THRESHOLD,
  };
}

module.exports = { identifyLanguage, languageModelInfo };
