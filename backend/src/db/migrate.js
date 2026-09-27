require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { getDb } = require("./connection");

// Columns added after the first release. SQLite has no "ADD COLUMN IF NOT
// EXISTS", so each is added only when PRAGMA table_info says it's missing.
const ADDED_COLUMNS = [
  ["farmers", "messenger_psid", "TEXT"],
  // BPMN phase 1: new profiles wait for a barangay/LGU/cooperative verifier.
  ["farmers", "verification_status", "TEXT NOT NULL DEFAULT 'pending'"], // pending | verified | rejected | more_info
  ["farmers", "phone_verified", "INTEGER NOT NULL DEFAULT 0"],
  ["farmers", "verified_at", "TEXT"],
  ["farmers", "created_at", "TEXT"],
  ["suppliers", "barangay", "TEXT"],
  ["suppliers", "municipality", "TEXT"],
  ["suppliers", "verified", "INTEGER NOT NULL DEFAULT 0"],
  ["farm_input_requests", "product_id", "INTEGER REFERENCES products(id)"],
  ["farm_input_requests", "channel", "TEXT NOT NULL DEFAULT 'app'"],
  ["farm_input_requests", "needed_by", "TEXT"], // ISO date
  ["farm_input_requests", "delivery_location", "TEXT"],
  ["farm_input_requests", "notes", "TEXT"],
  ["farm_input_requests", "preferred_supplier_id", "INTEGER REFERENCES suppliers(id)"],
  ["farm_input_requests", "inbound_message_id", "INTEGER REFERENCES inbound_messages(id)"],
  ["sms_messages", "channel", "TEXT NOT NULL DEFAULT 'sms'"], // the log also holds Messenger texts
];

// Indexes on added columns can only be created after the columns exist.
const ADDED_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_farmers_messenger_psid ON farmers(messenger_psid)",
  "CREATE INDEX IF NOT EXISTS idx_requests_product_id ON farm_input_requests(product_id)",
];

// Canonical names must match what the NLP layer produces (services/nlp/lexicon.js).
const PRODUCTS = [
  ["Urea (46-0-0)", "fertilizer", "46-0-0", "sacks", "High-nitrogen fertilizer for faster crop growth and higher yields. Suitable for rice, corn, and vegetables."],
  ["Complete fertilizer (14-14-14)", "fertilizer", "14-14-14", "sacks", "Balanced nitrogen, phosphorus, and potassium for basal application at planting."],
  ["Ammonium sulfate (21-0-0)", "fertilizer", "21-0-0", "sacks", "Nitrogen and sulfur for top-dressing; good for alkaline soils."],
  ["Ammophos (16-20-0)", "fertilizer", "16-20-0", "sacks", "Nitrogen and phosphorus for strong root development."],
  ["Muriate of potash (0-0-60)", "fertilizer", "0-0-60", "sacks", "Potassium for grain filling, disease resistance, and fruit quality."],
  ["Organic fertilizer", "fertilizer", null, "sacks", "Compost/vermicast soil conditioner that improves soil health."],
  ["Rice seeds", "seeds", "PSB Rc82 / hybrid", "bags", "Certified and hybrid rice seeds for irrigated and rainfed lowland."],
  ["Hybrid corn seeds", "seeds", null, "bags", "High-yielding hybrid yellow and white corn seeds."],
  ["Insecticide", "pesticide", "e.g. Abamectin", "bottles", "Controls leaf folders, stem borers, and other insect pests."],
  ["Herbicide", "pesticide", null, "bottles", "Pre- and post-emergence weed control."],
  ["Fungicide", "pesticide", null, "bottles", "Prevents and controls blast, blight, and other fungal diseases."],
  ["Hog grower feed", "feeds", null, "sacks", "Complete feed for growing pigs."],
  ["Chicken feed", "feeds", null, "sacks", "Complete feed for broilers and layers."],
];

// Returns true when the column was just added.
function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((c) => c.name === column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

function migrate({ quiet = false } = {}) {
  const db = getDb();
  db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

  const added = new Set();
  for (const [table, column, definition] of ADDED_COLUMNS) {
    if (ensureColumn(db, table, column, definition)) added.add(`${table}.${column}`);
  }
  for (const sql of ADDED_INDEXES) db.exec(sql);

  // Accounts that existed before verification was introduced were already
  // trading, so they're grandfathered in as verified.
  if (added.has("farmers.verification_status")) {
    db.exec("UPDATE farmers SET verification_status = 'verified', verified_at = datetime('now')");
  }
  if (added.has("suppliers.verified")) {
    db.exec("UPDATE suppliers SET verified = 1");
  }

  const insertProduct = db.prepare(
    "INSERT OR IGNORE INTO products (name, category, variant, unit, description) VALUES (?, ?, ?, ?, ?)"
  );
  for (const product of PRODUCTS) insertProduct.run(...product);

  // Link older requests to the catalog by their canonical product name.
  db.exec(
    `UPDATE farm_input_requests
     SET product_id = (SELECT p.id FROM products p WHERE p.name = farm_input_requests.product_name)
     WHERE product_id IS NULL AND product_name IS NOT NULL`
  );

  if (!quiet) console.log("Schema applied.");
}

module.exports = { migrate };

if (require.main === module) {
  migrate();
}
