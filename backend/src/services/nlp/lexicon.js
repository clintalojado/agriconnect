// Shared vocabulary for the NLP layer: canonical product/unit names and the
// Tagalog/Bisaya/English words farmers use for them. Used by the rule-based
// parser directly, and to normalize the AI extraction so both paths store the
// same product names (which is what demand aggregation groups on).

// Order matters: more specific products must come before generic ones
// ("organic fertilizer" before "fertilizer").
const PRODUCTS = [
  { name: "Urea (46-0-0)", patterns: [/\b46-0-0\b/, /\bu+r+[ie]+y?a\b/, /\byurya\b/, /\buria\b/] },
  { name: "Complete fertilizer (14-14-14)", patterns: [/\b14-14-14\b/, /\btriple\s*14\b/, /\bcomplete\b/, /\bkomplit\b/] },
  { name: "Ammonium sulfate (21-0-0)", patterns: [/\b21-0-0\b/, /\bammonium\b/, /\bamsul\b/, /\bamonyum\b/] },
  { name: "Ammophos (16-20-0)", patterns: [/\b16-20-0\b/, /\bammophos\b/, /\bamophos\b/] },
  { name: "Muriate of potash (0-0-60)", patterns: [/\b0-0-60\b/, /\bpotash\b/, /\bmuriate\b/] },
  { name: "Organic fertilizer", patterns: [/\borganic\b/, /\borganiko\b/, /\bvermicast\b/, /\bcompost\b/] },
  { name: "Hybrid corn seeds", patterns: [/\b(hybrid\s+)?(corn|mais)\s*(seeds?|binhi|liso|similya)\b/, /\b(binhi|liso|similya)\s*(ng\s+|sa\s+)?(corn|mais)\b/] },
  { name: "Rice seeds", patterns: [/\b(rice|palay|humay)\s*(seeds?|binhi|liso|similya)\b/, /\b(binhi|liso|similya)\s*(ng\s+|sa\s+)?(rice|palay|humay)\b/, /\bcertified\s+seeds?\b/] },
  { name: "Herbicide", patterns: [/\bherbicides?\b/, /\bpamatay\s*(ng\s+)?damo\b/, /\bhilo\s*(sa\s+)?sagbot\b/] },
  { name: "Insecticide", patterns: [/\binsecticides?\b/, /\bpesticides?\b/, /\bpamatay\s*(ng\s+)?(insekto|peste)\b/, /\bhilo\s*(sa\s+)?(insekto|peste)\b/] },
  { name: "Fungicide", patterns: [/\bfungicides?\b/] },
  {
    name: "Hog grower feed",
    patterns: [
      /\b(hog|pig|swine)\s*(grower\s*)?feeds?\b/,
      /\bfeeds?\s*(para\s+)?(sa\s+)?(baboy|hog|pig|swine)s?\b/,
      /\bpakain\s*(sa\s+|ng\s+)?baboy\b/,
    ],
  },
  {
    name: "Chicken feed",
    patterns: [
      /\b(chicken|poultry|layer|broiler)\s*feeds?\b/,
      /\bfeeds?\s*(para\s+)?(sa\s+)?(manok|chicken|poultry)\b/,
      /\bpakain\s*(sa\s+|ng\s+)?manok\b/,
      /\bpatuka\b/,
    ],
  },
  // Plain "abono"/"fertilizer" usually means complete fertilizer; it's marked
  // generic so its confidence stays low and the farmer is asked to check it.
  { name: "Complete fertilizer (14-14-14)", generic: true, patterns: [/\bfertili[sz]er\b/, /\babono\b/, /\bpataba\b/] },
];

const UNITS = [
  { name: "sacks", patterns: [/^sa+ko(ng|s)?$/, /^sacks?$/, /^bags?$/, /^baks?$/, /^kaban$/] },
  { name: "kg", patterns: [/^kilos?$/, /^kgs?$/, /^kls?$/, /^kilograms?$/, /^kilo(ng|gramo)$/] },
  { name: "liters", patterns: [/^lit(ro|er|re)s?(ng)?$/, /^ltrs?$/, /^l$/] },
  { name: "bottles", patterns: [/^bot(e|ol|tles?)(ng)?$/] },
  { name: "packs", patterns: [/^pa(ck|ke)(s|ts?|te|teng)?$/, /^sachets?$/] },
];

const NUMBER_WORDS = {
  // Tagalog (plus linker forms: "isang", "dalawang", ...)
  isa: 1, isang: 1, dalawa: 2, dalawang: 2, tatlo: 3, tatlong: 3, apat: 4, lima: 5, limang: 5,
  anim: 6, pito: 7, pitong: 7, walo: 8, walong: 8, siyam: 9, sampu: 10, sampung: 10,
  labinlima: 15, dalawampu: 20, dalawampung: 20, tatlumpu: 30, tatlumpung: 30,
  apatnapu: 40, limampu: 50, limampung: 50, sandaan: 100, isandaan: 100,
  // Bisaya/Cebuano
  usa: 1, duha: 2, tulo: 3, upat: 4, unom: 6, napulo: 10, kinse: 15, baynte: 20, trenta: 30, traynta: 30,
  kwarenta: 40, singkwenta: 50, gatos: 100,
  // Spanish-derived numbers common in both
  uno: 1, dos: 2, tres: 3, kwatro: 4, singko: 5, sais: 6, siyete: 7, otso: 8, nuwebe: 9, diyes: 10, dose: 12,
  // English
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twenty: 20, thirty: 30, fifty: 50, hundred: 100,
};

const MONTHS = {
  january: 0, jan: 0, enero: 0,
  february: 1, feb: 1, pebrero: 1, febrero: 1,
  march: 2, mar: 2, marso: 2,
  april: 3, apr: 3, abril: 3,
  may: 4, mayo: 4,
  june: 5, jun: 5, hunyo: 5, junio: 5,
  july: 6, jul: 6, hulyo: 6, julio: 6,
  august: 7, aug: 7, agosto: 7,
  september: 8, sept: 8, sep: 8, setyembre: 8, septiyembre: 8,
  october: 9, oct: 9, oktubre: 9,
  november: 10, nov: 10, nobyembre: 10,
  december: 11, dec: 11, disyembre: 11,
};

// Marker words used to guess the message language. Deliberately small and
// high-signal — shared words ("gusto", "lima") are left out.
const LANGUAGE_MARKERS = {
  tagalog: ["po", "ng", "mga", "namin", "kailangan", "bago", "ang", "pwede", "puwede", "magkano", "ilang", "susunod", "linggo", "buwan", "bukas", "ninyo", "meron", "opo", "yung", "bili", "bibili", "para", "pa", "manok", "baboy", "lang", "naman", "ba", "sana", "ho", "nyo", "hanggang"],
  bisaya: ["nako", "namo", "akong", "amo", "palihug", "pila", "unsa", "ugma", "sunod", "kinahanglan", "naa", "humay", "liso", "semana", "bulan", "karon", "dayon", "og", "ug", "palit", "paliton", "nga", "hatod", "karong", "asa", "gyud", "diri", "sab", "ta"],
  english: ["need", "please", "before", "the", "for", "want", "next", "week", "month", "how", "much", "we", "our", "i", "is", "price", "available"],
};

function canonicalProduct(text) {
  if (!text) return null;
  const lower = String(text).toLowerCase();
  for (const product of PRODUCTS) {
    if (product.patterns.some((re) => re.test(lower))) return product;
  }
  return null;
}

function canonicalUnit(text) {
  if (!text) return null;
  const lower = String(text).toLowerCase().trim();
  for (const unit of UNITS) {
    if (unit.patterns.some((re) => re.test(lower))) return unit.name;
  }
  return null;
}

module.exports = { PRODUCTS, UNITS, NUMBER_WORDS, MONTHS, LANGUAGE_MARKERS, canonicalProduct, canonicalUnit };
