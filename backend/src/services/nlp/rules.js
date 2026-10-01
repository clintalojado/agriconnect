// Offline, rule-based extractor for farmer messages. It is the fallback when
// the Claude API is unavailable (no key, outage, rate limit) or when
// NLP_MODE=rules. It is less accurate than the AI path, and its confidence
// scores are deliberately conservative so the review screen flags more fields
// for the farmer to double-check.

const { PRODUCTS, NUMBER_WORDS, MONTHS, WEEKDAYS, canonicalUnit } = require("./lexicon");
const { identifyLanguage } = require("./language");
const { findBarangayInText, isMlangBarangay, canonicalBarangay } = require("../locations");

// "How much / is there" and "buy / need" in the languages the bot reads.
const INQUIRY_WORDS =
  /\b(magkano|magkanu|pila|pilan|tagpila|tag pila|tagpira|pira|pigara|mano|presyo|presyu|price|how much|available ba|naa ba|naa bay|meron ba|meron bang|may stock|stock ba|may ara|ara bala|adda kadi|adda pay|igwa|mayda|atin ba|aden|do you have|is there)\b|\?\s*$/;
const PURCHASE_WORDS =
  /\b(order|request|bili|bibili|palit|paliton|mopalit|mapalit|bakal|mabakal|bakalon|gatang|gumatang|gumatangak|gatangen|saliwan|saliwen|pamasa|kailangan|kinahanglan|kasapulak|kasapulan|kaipuhan|nakaukolan|need|gusto|buri|labay|kayatko|karuyag|want|pwede|puwede|pa-order|reserve)\b/;
const BARANGAY_STOPWORDS = new Set([
  "namo", "namin", "amo", "amon", "ko", "po", "pu", "nato", "natin", "kami", "ninyo", "nyo", "sa", "ng", "para", "kailangan",
  "kinahanglan", "before", "bago", "next", "sunod", "masunod", "please", "palihug", "palihog", "salamat", "thanks", "na", "nga",
  "ug", "og", "kag", "ken", "mga", "pwede", "puwede", "delivery", "hatod", "deliver", "asap", "karon", "subong", "ita", "ngayon",
  "this", "by", "at", "and", "iti", "ti", "ditoy", "diri", "buwas", "ugma", "bukas", "inton",
]);

// The rule path labels its own extraction; it only commits to a language when
// the message has words specific to one (else "other").
function detectLanguage(text) {
  const result = identifyLanguage(text);
  return result.confident ? result.language : "other";
}

// Every product mentioned, in the order it appears. The generic "fertilizer"
// entry only counts where no specific product already covers that text
// (so "complete fertilizer" isn't also read as plain fertilizer).
function findProductHits(lower) {
  const hits = [];
  for (const product of PRODUCTS) {
    const matches = product.patterns
      .map((re) => lower.match(re))
      .filter(Boolean)
      .sort((a, b) => a.index - b.index);
    if (matches.length === 0) continue;
    const m = matches[0];
    const hit = { product, index: m.index, end: m.index + m[0].length };
    if (product.generic && hits.some((h) => h.product.name === product.name || (hit.index < h.end && hit.end > h.index))) continue;
    hits.push(hit);
  }
  return hits.sort((a, b) => a.index - b.index);
}

const UNIT_WORDS =
  "sa+k[ou](?:ng|s)?|sacks?|bags?|kaban|kilo(?:s|ng|grams?)?|kgs?|kls?|lit(?:ro|er|re)s?|litrong|ltrs?|bote(?:ng)?|botelya|bottles?|packs?|pakete(?:ng)?|sachets?";

// Words between a number and its unit: "lima ka sako", "lima a sako" (Ilocano),
// "lima nin sako" (Bikol), "lima hin sako" (Waray), "5 x sako".
const QUANTITY_LINKERS = ["ka", "na", "ng", "nga", "a", "nin", "hin", "ya"];

// "<number> [linker] <unit>" anywhere in the text, e.g. "5 sako", "lima ka sako", "50kg".
function findQuantityHits(lower) {
  const numbers = `\\d+(?:\\.\\d+)?|${Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join("|")}`;
  const linker = `(?:(?:${QUANTITY_LINKERS.join("|")})\\s+|x\\s*)?`;
  const re = new RegExp(`\\b(${numbers})\\s*${linker}(${UNIT_WORDS})\\b`, "g");
  return [...lower.matchAll(re)].map((m) => ({
    index: m.index,
    quantity: parseNumberToken(m[1]),
    unit: canonicalUnit(m[2]),
  }));
}

// Pairs each product with the quantity in its part of the message: the
// nearest "<n> <unit>" before it (farmers usually write "5 sako urea"),
// otherwise the first one after it ("urea 5 sako").
function pairItems(productHits, quantityHits, length) {
  const used = new Set();
  return productHits.map((hit, i) => {
    const segStart = i === 0 ? 0 : productHits[i - 1].end;
    const segEnd = i === productHits.length - 1 ? length : productHits[i + 1].index;
    const inSegment = quantityHits.filter((q, qi) => !used.has(qi) && q.index >= segStart && q.index < segEnd);
    const before = inSegment.filter((q) => q.index < hit.index).pop();
    const chosen = before || inSegment.find((q) => q.index >= hit.end);
    if (chosen) used.add(quantityHits.indexOf(chosen));
    return { product: hit.product, quantity: chosen?.quantity ?? null, unit: chosen?.unit ?? null };
  });
}

function parseNumberToken(token) {
  if (/^\d+(\.\d+)?$/.test(token)) return Number(token);
  if (token in NUMBER_WORDS) return NUMBER_WORDS[token];
  return null;
}

// Finds "<number> [linker] <unit>" first (e.g. "10 sako", "sampung sako",
// "5 ka sako", "3 na bag"), then falls back to a bare number.
function findQuantity(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const n = parseNumberToken(tokens[i]);
    if (n == null) continue;
    for (const offset of [1, 2]) {
      const candidate = tokens[i + offset];
      if (!candidate) break;
      const unit = canonicalUnit(candidate);
      if (unit) return { quantity: n, unit, unitExplicit: true };
      if (![...QUANTITY_LINKERS, "pcs", "x"].includes(candidate)) break;
    }
  }
  // "kg"/"kls" glued to the number: "50kg"
  for (const token of tokens) {
    const glued = token.match(/^(\d+(?:\.\d+)?)([a-z]+)$/);
    if (glued) {
      const unit = canonicalUnit(glued[2]);
      if (unit) return { quantity: Number(glued[1]), unit, unitExplicit: true };
    }
  }
  for (const token of tokens) {
    const n = parseNumberToken(token);
    // Skip years and NPK grade fragments like 14-14-14 (tokenized separately).
    if (n != null && n > 0 && n < 1900) {
      // The unit may come separately, e.g. a follow-up text that just says "litro po".
      const unit = tokens.map(canonicalUnit).find(Boolean) || null;
      return { quantity: n, unit, unitExplicit: Boolean(unit) };
    }
  }
  return null;
}

function titleCase(words) {
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function findBarangay(original) {
  const match = original.match(/\b(?:barangay|brgy\.?|bgy\.?|baryo|purok)\s+([A-Za-zÑñ0-9.'-]+(?:\s+[A-Za-zÑñ0-9.'-]+){0,2})/i);
  // Without a "brgy" marker, fall back to a known M'lang barangay named anywhere.
  if (!match) return findBarangayInText(original);
  // "brgy new rizal sunod semana" → the known name, not the words after it.
  const after = match[1].split(/\s+/).map((w) => w.replace(/[.,!?]+$/, ""));
  for (let n = after.length; n > 0; n--) {
    const candidate = after.slice(0, n).join(" ");
    if (isMlangBarangay(candidate)) return canonicalBarangay(candidate);
  }
  const words = [];
  for (const word of match[1].split(/\s+/)) {
    const clean = word.replace(/[.,!?]+$/, "");
    if (!clean || BARANGAY_STOPWORDS.has(clean.toLowerCase())) break;
    words.push(clean);
    if (word !== clean) break; // punctuation ends the name
  }
  return words.length ? canonicalBarangay(titleCase(words)) : null;
}

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Returns { phrase, iso } — phrase kept close to the farmer's wording, iso a
// best-guess deadline date.
function findDate(lower, today, original) {
  const phraseOf = (m) => original.substr(m.index, m[0].length);
  const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
  const beforeMonth = lower.match(
    new RegExp(`\\b(before|bago(?:\\s+mag)?|sa\\s+dili\\s+pa|until|hanggang)\\s+(${monthNames})\\b`)
  );
  const plainMonth = lower.match(new RegExp(`\\b(?:sa|this|in|pag|inig)\\s+(${monthNames})\\b`));

  function nextOccurrence(monthIndex, day) {
    let year = today.getFullYear();
    const candidate = new Date(year, monthIndex, day);
    if (candidate < today) year += 1;
    return new Date(year, monthIndex, day);
  }

  if (beforeMonth) {
    const monthIndex = MONTHS[beforeMonth[2]];
    const firstOfMonth = nextOccurrence(monthIndex, 1);
    return { phrase: phraseOf(beforeMonth), iso: isoDate(addDays(firstOfMonth, -1)) };
  }
  if (plainMonth && plainMonth[1] !== "may") {
    // "sa may" is also Tagalog for "near"/"there is", so bare "may" is ignored.
    return { phrase: phraseOf(plainMonth), iso: isoDate(nextOccurrence(MONTHS[plainMonth[1]], 1)) };
  }

  const relative = [
    // bukas (Tagalog/Kapampangan), ugma (Bisaya), buwas (Hiligaynon/Waray), inton bigat (Ilocano), nabuas (Pangasinan)
    { re: /\b(bukas|ugma|buwas|inton bigat|intono bigat|nabuas|tomorrow)\b/, days: 1 },
    {
      re: /\b(next week|susunod na linggo|sunod semana|sunod nga semana|sa sunod semana|masunod nga semana|sunod na semana|sumaruno a lawas|inton sumaruno a lawas|susunod a dominggu)\b/,
      days: 7,
    },
    { re: /\b(asap|agad|dayon|karon dayon|subong dayon|ngayon din|urgent|madalian|ita met laeng)\b/, days: 0 },
  ];
  for (const { re, days } of relative) {
    const m = lower.match(re);
    if (m) return { phrase: phraseOf(m), iso: isoDate(addDays(today, days)) };
  }

  // "Sabado", "karong Sabado", "this Saturday": the next such day (today counts).
  const dayNames = Object.keys(WEEKDAYS).join("|");
  const weekday = lower.match(new RegExp(`\\b(?:(?:sa|karong|ngayong|this|on|inton|sa darating na)\\s+)?(${dayNames})\\b`));
  if (weekday) {
    const ahead = (WEEKDAYS[weekday[1]] - today.getDay() + 7) % 7;
    return { phrase: phraseOf(weekday), iso: isoDate(addDays(today, ahead)) };
  }

  const nextMonth = lower.match(
    /\b(next month|susunod na buwan|sunod buwan|sunod nga bulan|sunod bulan|masunod nga bulan|sunod na bulan|sumaruno a bulan)\b/
  );
  if (nextMonth) {
    return { phrase: phraseOf(nextMonth), iso: isoDate(new Date(today.getFullYear(), today.getMonth() + 1, 1)) };
  }
  return null;
}

function detectIntent(lower, hasProduct, hasQuantity) {
  const asks = INQUIRY_WORDS.test(lower);
  const buys = PURCHASE_WORDS.test(lower);
  if (hasProduct && hasQuantity && (buys || !asks)) return "purchase_request";
  if (asks) return "inquiry";
  if (hasProduct && buys) return "purchase_request";
  return hasProduct ? "purchase_request" : "other";
}

function extractWithRules(rawMessage, { today = new Date() } = {}) {
  const lower = rawMessage.toLowerCase();
  const tokens = lower.split(/[^a-z0-9ñ.-]+/i).map((t) => t.replace(/^[.-]+|[.-]+$/g, "")).filter(Boolean);

  const productHits = findProductHits(lower);
  const items = pairItems(productHits, findQuantityHits(lower), lower.length);
  const productHit = productHits[0] || null;
  // Main item: its paired "<n> <unit>", else any number in the message.
  const quantityHit = items[0]?.quantity != null ? { ...items[0], unitExplicit: Boolean(items[0].unit) } : findQuantity(tokens);
  const barangay = findBarangay(rawMessage);
  const date = findDate(lower, today, rawMessage);
  const language = detectLanguage(rawMessage);

  const defaultsToSacks = (name) => /fertilizer|urea|sulfate|ammophos|potash|feed/i.test(name);
  let unit = quantityHit?.unit ?? null;
  let unitConfidence = quantityHit?.unitExplicit ? 0.8 : 0;
  // Fertilizer and feed counts without a unit are almost always sacks.
  if (!unit && quantityHit && productHit && defaultsToSacks(productHit.product.name)) {
    unit = "sacks";
    unitConfidence = 0.4;
  }

  const additional = items.slice(1).map((item) => ({
    product_name: item.product.name,
    quantity: item.quantity,
    unit: item.unit ?? (item.quantity != null && defaultsToSacks(item.product.name) ? "sacks" : null),
  }));

  return {
    product_name: productHit?.product.name ?? null,
    quantity: quantityHit?.quantity ?? null,
    unit,
    barangay,
    preferred_date: date?.phrase ?? null,
    preferred_date_iso: date?.iso ?? null,
    intent: detectIntent(lower, Boolean(productHit), Boolean(quantityHit)),
    language,
    additional_items: additional,
    clarification_question: null, // filled in by the shared post-processing step
    reply_message: null,
    confidence: {
      product_name: productHit ? (productHit.product.generic ? 0.4 : 0.8) : 0,
      quantity: quantityHit ? (quantityHit.unitExplicit ? 0.8 : 0.5) : 0,
      unit: unitConfidence,
      barangay: barangay ? 0.65 : 0,
      preferred_date: date ? 0.7 : 0,
    },
  };
}

module.exports = { extractWithRules, isoDate };
