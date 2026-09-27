// Official barangays of M'lang, Cotabato. Used to spell barangays the same way
// everywhere (so demand pools by barangay group correctly), to recognise them
// in farmers' texts, and for the form suggestions (GET /api/locations).

const MUNICIPALITY = "M'lang";

const MLANG_BARANGAYS = [
  "Poblacion A", "Poblacion B", "Bagontapay", "Bialong", "Buayan", "Calunasan", "Dalipe", "Dugong",
  "Dungo-an", "Gaunan", "Inas", "Katipunan", "La Fortuna", "La Suerte", "Langkong", "Lepaga", "Liboo",
  "Lika", "Luz Village", "Magallon", "Malayan", "New Antique", "New Barbaza", "New Kalibo",
  "New Consolacion", "New Esperanza", "New Janiuay", "New Lawa-an", "New Rizal", "Nueva Vida", "Pag-asa",
  "Pulang-lupa", "Sangat", "Tawantawan", "Tibao", "Ugpay", "Palma-Perez",
];

// Names that are also everyday words ("lika na" = come on, "pag-asa" = hope),
// so in free text they only count after "brgy"/"barangay".
const COMMON_WORDS = new Set(["Lika", "Pag-asa", "Inas"]);

// "pulang lupa", "Pulang-Lupa" and "PULANGLUPA" all compare equal.
const key = (name) => String(name).toLowerCase().replace(/^(brgy\.?|bgy\.?|barangay)\s+/, "").replace(/[\s.'-]+/g, "");

const BY_KEY = new Map(MLANG_BARANGAYS.map((name) => [key(name), name]));

// Longest first, so "Poblacion A" wins over a bare "Poblacion".
const PATTERNS = MLANG_BARANGAYS.filter((name) => !COMMON_WORDS.has(name))
  .sort((a, b) => b.length - a.length)
  .map((name) => ({ name, re: new RegExp(`\\b${name.split(/[\s-]+/).join("[\\s-]?")}\\b`, "i") }));

/** The official spelling of a M'lang barangay, or the input trimmed if it isn't one. */
function canonicalBarangay(name) {
  if (name == null) return name;
  const trimmed = String(name).trim();
  return BY_KEY.get(key(trimmed)) || trimmed;
}

/** "katipunan, new rizal" → "Katipunan, New Rizal" (a supplier's delivery coverage). */
function canonicalBarangayList(list) {
  if (list == null) return list;
  return String(list).split(",").map(canonicalBarangay).filter(Boolean).join(", ");
}

function isMlangBarangay(name) {
  return name != null && BY_KEY.has(key(name));
}

/** A M'lang barangay mentioned anywhere in a message, e.g. "hatod sa new rizal" → "New Rizal". */
function findBarangayInText(text) {
  for (const { name, re } of PATTERNS) if (re.test(text)) return name;
  return null;
}

module.exports = {
  MUNICIPALITY,
  MLANG_BARANGAYS,
  canonicalBarangay,
  canonicalBarangayList,
  isMlangBarangay,
  findBarangayInText,
};
