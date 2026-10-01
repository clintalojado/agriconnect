// Shared vocabulary for the NLP layer: canonical product/unit names and the
// words farmers use for them in Tagalog, Bisaya, Hiligaynon, Ilocano, Bikol,
// Waray, Kapampangan, Pangasinan, Maguindanaon, and English. Used by the rule-based
// parser directly, and to normalize the AI extraction so both paths store the
// same product names (which is what demand aggregation groups on).

// Word lists shared by several product patterns.
const SEED = "seeds?|binhi|liso|similya|bukel|bini";
const RICE = "rice|palay|humay|pagay|pale|paroy|pagey";
const WEEDS = "damo|sagbot|hilamon|ruot|dikut|duot";
const PESTS = "insekto|peste|ulod|uod|igges";
const KILLER = "pamatay|pangpatay|pangpapatay|panggadan|hilo|agas|bulong|tambal|gamot";
// "of"/"for" linkers: ng, sa, sang, ti, iti, nin, han, ha, king, ning, ed, na
const OF = String.raw`(?:(?:ng|sa|sang|ti|iti|nin|han|ha|king|ning|ed|na)\s+)?`;
const words = (list) => `(?:${list})`;
const re = (source) => new RegExp(source);

// Order matters: more specific products must come before generic ones
// ("organic fertilizer" before "fertilizer").
const PRODUCTS = [
  { name: "Urea (46-0-0)", patterns: [/\b46-0-0\b/, /\bu+r+[ie]+y?a\b/, /\byurya\b/, /\buria\b/] },
  { name: "Complete fertilizer (14-14-14)", patterns: [/\b14-14-14\b/, /\btriple\s*14\b/, /\bcomplete\b/, /\bkomplit\b/] },
  { name: "Ammonium sulfate (21-0-0)", patterns: [/\b21-0-0\b/, /\bammonium\b/, /\bamsul\b/, /\bamonyum\b/] },
  { name: "Ammophos (16-20-0)", patterns: [/\b16-20-0\b/, /\bammophos\b/, /\bamophos\b/] },
  { name: "Muriate of potash (0-0-60)", patterns: [/\b0-0-60\b/, /\bpotash\b/, /\bmuriate\b/] },
  { name: "Organic fertilizer", patterns: [/\borganic\b/, /\borganiko\b/, /\bvermicast\b/, /\bcompost\b/] },
  {
    name: "Hybrid corn seeds",
    patterns: [
      re(String.raw`\b(hybrid\s+)?(corn|mais)\s*${words(SEED)}\b`),
      re(String.raw`\b${words(SEED)}\s*${OF}(corn|mais)\b`),
    ],
  },
  {
    name: "Rice seeds",
    patterns: [
      re(String.raw`\b${words(RICE)}\s*${words(SEED)}\b`),
      re(String.raw`\b${words(SEED)}\s*${OF}${words(RICE)}\b`),
      /\bcertified\s+seeds?\b/,
    ],
  },
  { name: "Herbicide", patterns: [/\bherbicides?\b/, re(String.raw`\b${words(KILLER)}\s*${OF}${words(WEEDS)}\b`)] },
  { name: "Insecticide", patterns: [/\binsecticides?\b/, /\bpesticides?\b/, re(String.raw`\b${words(KILLER)}\s*${OF}${words(PESTS)}\b`)] },
  { name: "Fungicide", patterns: [/\bfungicides?\b/] },
  {
    name: "Hog grower feed",
    patterns: [
      /\b(hog|pig|swine)\s*(grower\s*)?feeds?\b/,
      /\bfeeds?\s*(para\s*)?(sa\s+|iti\s+|king\s+|han\s+|d\s+)?(baboy|babi|hog|pig|swine)s?\b/,
      /\b(pakain|pagkaon|pakaon|taraon)\s*(sa\s+|ng\s+|ti\s+|sang\s+)?(baboy|babi)\b/,
    ],
  },
  {
    name: "Chicken feed",
    patterns: [
      /\b(chicken|poultry|layer|broiler)\s*feeds?\b/,
      /\bfeeds?\s*(para\s*)?(sa\s+|iti\s+|king\s+|han\s+|d\s+)?(manok|manuk|chicken|poultry)\b/,
      /\b(pakain|pagkaon|pakaon|taraon)\s*(sa\s+|ng\s+|ti\s+|sang\s+)?(manok|manuk)\b/,
      /\bpatuka\b/,
    ],
  },
  // Plain "abono"/"fertilizer" usually means complete fertilizer; it's marked
  // generic so its confidence stays low and the farmer is asked to check it.
  { name: "Complete fertilizer (14-14-14)", generic: true, patterns: [/\bfertili[sz]er\b/, /\babon[ou]\b/, /\bpataba\b/] },
];

const UNITS = [
  { name: "sacks", patterns: [/^sa+k[ou](ng|s)?$/, /^sacks?$/, /^bags?$/, /^baks?$/, /^kaban$/] },
  { name: "kg", patterns: [/^kilos?$/, /^kgs?$/, /^kls?$/, /^kilograms?$/, /^kilo(ng|gramo)$/] },
  { name: "liters", patterns: [/^lit(ro|er|re)s?(ng)?$/, /^ltrs?$/, /^l$/] },
  { name: "bottles", patterns: [/^bot(e|ol|tles?|elya)(ng)?$/] },
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
  // Hiligaynon / Waray (other forms are shared with Tagalog or Bisaya above)
  anom: 6,
  // Ilocano ("lima a sako")
  maysa: 1, dua: 2, tallo: 3, uppat: 4, innem: 6, siam: 9, sangapulo: 10, duapulo: 20,
  // Bikol, with linker forms ("tolong sako")
  saro: 1, sarong: 1, duwa: 2, duwang: 2, tolo: 3, tolong: 3, sampulo: 10, sampulong: 10,
  // Kapampangan, with linker forms ("atlung sakung urea")
  metung: 1, adwa: 2, adwang: 2, atlu: 3, atlung: 3, anam: 6, pitu: 7, walu: 8, apulu: 10, apulung: 10,
  // Pangasinan counting forms ("taloran sako")
  sakey: 1, duara: 2, duaran: 2, talora: 3, taloran: 3, apatira: 4, apatiran: 4, limara: 5, limaran: 5, samplo: 10, samplora: 10,
  // Maguindanaon
  telu: 3, sapulu: 10,
  // Spanish-derived numbers common in both
  uno: 1, dos: 2, tres: 3, kwatro: 4, singko: 5, sais: 6, siyete: 7, otso: 8, nuwebe: 9, diyes: 10, dose: 12,
  // English
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twenty: 20, thirty: 30, fifty: 50, hundred: 100,
};

// Day names → Date#getDay() index. "Linggo" is left out: it also means "week".
const WEEKDAYS = {
  lunes: 1, monday: 1, martes: 2, tuesday: 2, miyerkules: 3, miyerkoles: 3, myerkules: 3, wednesday: 3,
  huwebes: 4, thursday: 4, biyernes: 5, byernes: 5, friday: 5, sabado: 6, saturday: 6, domingo: 0, dominggo: 0, sunday: 0,
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

module.exports = { PRODUCTS, UNITS, NUMBER_WORDS, MONTHS, WEEKDAYS, canonicalProduct, canonicalUnit };
