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
  ["farmers", "web_chat_id", "TEXT"], // browser id of a farmer who registered in the website chat
  ["farmers", "language", "TEXT"], // language they text in (nlp/i18n.js); alerts are sent in it
];

// Indexes on added columns can only be created after the columns exist.
const ADDED_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_farmers_messenger_psid ON farmers(messenger_psid)",
  "CREATE INDEX IF NOT EXISTS idx_farmers_web_chat_id ON farmers(web_chat_id)",
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

// Tables whose channel CHECK predates the website chat ("web" channel).
// SQLite can't alter a CHECK, so these are rebuilt once (same columns and
// rows) using SQLite's documented create-copy-drop-rename procedure.
const WEB_CHANNEL_TABLES = ["inbound_messages", "registration_sessions"];

function allowWebChannel(db) {
  for (const table of WEB_CHANNEL_TABLES) {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    if (!row || !row.sql.includes("('sms', 'messenger')")) continue;
    const temp = `${table}_web_rebuild`;
    const createTemp = row.sql
      .replace(/CREATE TABLE\s+(IF NOT EXISTS\s+)?("?)\w+\2/i, `CREATE TABLE ${temp}`)
      .replace("('sms', 'messenger')", "('sms', 'messenger', 'web')");
    db.exec("PRAGMA foreign_keys = OFF");
    try {
      db.exec("BEGIN");
      db.exec(`DROP TABLE IF EXISTS ${temp}`);
      db.exec(createTemp);
      db.exec(`INSERT INTO ${temp} SELECT * FROM ${table}`);
      db.exec(`DROP TABLE ${table}`);
      db.exec(`ALTER TABLE ${temp} RENAME TO ${table}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      db.exec("PRAGMA foreign_keys = ON");
    }
  }
}

function migrate({ quiet = false } = {}) {
  const db = getDb();
  db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  allowWebChannel(db);
  // Rebuilt tables lose their indexes; the schema's CREATE INDEX IF NOT EXISTS restores them.
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
