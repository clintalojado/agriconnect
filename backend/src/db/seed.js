// Demo data for the marketplace: four verified suppliers around M'lang,
// Cotabato with listings. Safe to run more than once (matches by phone).
//   npm run db:seed

require("dotenv").config();

const { migrate } = require("./migrate");
const { getDb } = require("./connection");
const { findOrCreateSupplier, setSupplierVerified } = require("../services/suppliers.service");
const { upsertListing } = require("../services/catalog.service");

const SUPPLIERS = [
  {
    name: "GreenFields Agri Supply",
    contact_person: "Rosa Villanueva",
    phone: "09170000101",
    barangay: "Poblacion A",
    municipality: "M'lang",
    coverage_barangays: "Katipunan, Poblacion A, Poblacion B, Dalipe, New Esperanza",
    listings: {
      "Urea (46-0-0)": 1150,
      "Complete fertilizer (14-14-14)": 1080,
      "Rice seeds": 1250,
      "Hybrid corn seeds": 980,
      "Insecticide": 680,
      "Hog grower feed": 950,
    },
  },
  {
    name: "Katipunan Farmers Coop",
    contact_person: "Ben Dalisay",
    phone: "09170000102",
    barangay: "Katipunan",
    municipality: "M'lang",
    coverage_barangays: "Katipunan, Dalipe, New Rizal",
    listings: { "Urea (46-0-0)": 1100, "Rice seeds": 1200, "Chicken feed": 1020, "Organic fertilizer": 450 },
  },
  {
    name: "Mindanao AgriHub",
    contact_person: "Aida Mangudadatu",
    phone: "09170000103",
    barangay: "Poblacion",
    municipality: "Kidapawan",
    coverage_barangays: "Katipunan, Poblacion B, New Esperanza",
    listings: {
      "Urea (46-0-0)": 1180,
      "Complete fertilizer (14-14-14)": 1060,
      "Ammonium sulfate (21-0-0)": 780,
      "Muriate of potash (0-0-60)": 1350,
      "Herbicide": 520,
      "Fungicide": 610,
    },
  },
  {
    name: "Datu Agri Supply",
    contact_person: "Tomas Datu",
    phone: "09170000104",
    barangay: "Dalipe",
    municipality: "M'lang",
    coverage_barangays: "Dalipe, Katipunan, Tibao",
    listings: { "Complete fertilizer (14-14-14)": 1095, "Insecticide": 650, "Herbicide": 540, "Ammophos (16-20-0)": 1250 },
  },
];

function seed() {
  migrate({ quiet: true });
  const db = getDb();
  for (const { listings, ...profile } of SUPPLIERS) {
    const supplier = findOrCreateSupplier(profile);
    setSupplierVerified(supplier.id, true);
    for (const [productName, price] of Object.entries(listings)) {
      const product = db.prepare("SELECT * FROM products WHERE name = ?").get(productName);
      if (product) upsertListing(supplier.id, { product_id: product.id, price, unit: product.unit, in_stock: true });
    }
  }
  console.log(`Seeded ${SUPPLIERS.length} verified suppliers with listings.`);
}

if (require.main === module) seed();

module.exports = { seed };
