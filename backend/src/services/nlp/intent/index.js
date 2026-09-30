// The trained intent model, built once on first use from dataset.js.

const { train, predict } = require("./classifier");
const { EXAMPLES, INTENTS } = require("./dataset");

// Below this confidence the message is treated as "not understood".
const CONFIDENCE_THRESHOLD = 0.4;

let model = null;
let trainedAt = null;
let trainMs = null;

function getModel() {
  if (!model) {
    const started = Date.now();
    model = train(EXAMPLES);
    trainMs = Date.now() - started;
    trainedAt = new Date().toISOString();
  }
  return model;
}

/** { intent, confidence, understood, ranking (top 3) } for one message. */
function classifyIntent(text) {
  const result = predict(getModel(), text);
  return {
    intent: result.intent,
    confidence: Math.round(result.confidence * 1000) / 1000,
    understood: Boolean(result.intent) && result.confidence >= CONFIDENCE_THRESHOLD,
    ranking: result.ranking.slice(0, 3).map((r) => ({ intent: r.intent, confidence: Math.round(r.confidence * 1000) / 1000 })),
  };
}

function modelInfo() {
  const m = getModel();
  return {
    algorithm: "Multinomial logistic regression (softmax), SGD with L2 regularisation",
    features: "word unigrams + word bigrams + character trigrams (binary, L2-normalised)",
    intents: m.labels,
    training_examples: EXAMPLES.length,
    examples_per_intent: Object.fromEntries(Object.entries(INTENTS).map(([k, v]) => [k, v.length])),
    vocabulary_size: m.vocab.size,
    confidence_threshold: CONFIDENCE_THRESHOLD,
    trained_at: trainedAt,
    training_ms: trainMs,
  };
}

module.exports = { classifyIntent, modelInfo, CONFIDENCE_THRESHOLD };
