// Marketplace: the product catalog and what each supplier sells at what price.

const { getDb } = require("../db/connection");
const { badRequest, notFound } = require("../utils/errors");

const CATEGORIES = ["seeds", "fertilizer", "pesticide", "feeds", "tools"];

// Price and location come from verified suppliers' in-stock listings only.
const PRODUCT_SELECT = `
  SELECT p.*,
    (SELECT MIN(sp.price) FROM supplier_products sp JOIN suppliers s ON s.id = sp.supplier_id
       WHERE sp.product_id = p.id AND sp.in_stock = 1 AND s.verified = 1) AS min_price,
    (SELECT sp.unit FROM supplier_products sp JOIN suppliers s ON s.id = sp.supplier_id
       WHERE sp.product_id = p.id AND sp.in_stock = 1 AND s.verified = 1 ORDER BY sp.price LIMIT 1) AS price_unit,
    (SELECT COALESCE(s.municipality, s.barangay) FROM supplier_products sp JOIN suppliers s ON s.id = sp.supplier_id
       WHERE sp.product_id = p.id AND sp.in_stock = 1 AND s.verified = 1 ORDER BY sp.price LIMIT 1) AS location,
    (SELECT COUNT(*) FROM supplier_products sp JOIN suppliers s ON s.id = sp.supplier_id
       WHERE sp.product_id = p.id AND s.verified = 1) AS supplier_count,
    (SELECT ROUND(AVG(rv.rating), 1) FROM reviews rv JOIN orders o ON o.id = rv.order_id
       WHERE o.product_name = p.name) AS rating,
    (SELECT COUNT(*) FROM reviews rv JOIN orders o ON o.id = rv.order_id
       WHERE o.product_name = p.name) AS review_count,
    (SELECT COUNT(*) FROM farm_input_requests r WHERE r.product_id = p.id) AS request_count
  FROM products p`;

function listProducts({ category, q } = {}) {
  const clauses = [];
  const params = [];
  if (category && category !== "all") {
    if (!CATEGORIES.includes(category)) throw badRequest(`category must be one of ${CATEGORIES.join(", ")}`);
    clauses.push("p.category = ?");
    params.push(category);
  }
  if (q && q.trim()) {
    clauses.push("(p.name LIKE ? OR p.variant LIKE ? OR p.category LIKE ?)");
    params.push(...Array(3).fill(`%${q.trim()}%`));
  }
  return getDb()
    .prepare(`${PRODUCT_SELECT} ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY p.category, p.name`)
    .all(...params);
}

function listPopularProducts(limit = 8) {
  return getDb()
    .prepare(`${PRODUCT_SELECT} ORDER BY request_count DESC, supplier_count DESC, p.id LIMIT ?`)
    .all(Math.min(Number(limit) || 8, 30));
}

function getProduct(id) {
  const db = getDb();
  const product = db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(id);
  if (!product) throw notFound("Product not found");
  const listings = db
    .prepare(
      `SELECT sp.*, s.name AS supplier_name, s.barangay, s.municipality, s.phone AS supplier_phone, s.verified,
              (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE supplier_id = s.id) AS supplier_rating,
              (SELECT COUNT(*) FROM reviews WHERE supplier_id = s.id) AS supplier_review_count
       FROM supplier_products sp
       JOIN suppliers s ON s.id = sp.supplier_id
       WHERE sp.product_id = ? AND s.verified = 1
       ORDER BY sp.in_stock DESC, sp.price ASC`
    )
    .all(id);
  return { ...product, listings };
}

function findProductByName(name) {
  if (!name) return null;
  return getDb().prepare("SELECT * FROM products WHERE name = ? COLLATE NOCASE").get(String(name).trim()) || null;
}

// ---------- Supplier listings ("My Products") ----------

function listSupplierProducts(supplierId) {
  return getDb()
    .prepare(
      `SELECT sp.*, p.name AS product_name, p.category, p.variant
       FROM supplier_products sp JOIN products p ON p.id = sp.product_id
       WHERE sp.supplier_id = ?
       ORDER BY p.category, p.name`
    )
    .all(supplierId);
}

function upsertListing(supplierId, { product_id, price, unit, in_stock = true, brand = null }) {
  const db = getDb();
  if (!db.prepare("SELECT id FROM suppliers WHERE id = ?").get(supplierId)) throw notFound("Supplier not found");
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(product_id);
  if (!product) throw badRequest("Unknown product_id");
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest("price must be a positive number");

  db.prepare(
    `INSERT INTO supplier_products (supplier_id, product_id, price, unit, in_stock, brand, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (supplier_id, product_id) DO UPDATE SET
       price = excluded.price, unit = excluded.unit, in_stock = excluded.in_stock,
       brand = excluded.brand, updated_at = excluded.updated_at`
  ).run(supplierId, product_id, amount, (unit || product.unit).trim(), in_stock ? 1 : 0, brand ? String(brand).trim() : null);

  return listSupplierProducts(supplierId).find((l) => l.product_id === Number(product_id));
}

function deleteListing(supplierId, productId) {
  const result = getDb()
    .prepare("DELETE FROM supplier_products WHERE supplier_id = ? AND product_id = ?")
    .run(supplierId, productId);
  if (result.changes === 0) throw notFound("Listing not found");
  return { deleted: true };
}

// ---------- Global search (top bar) ----------

function search(q) {
  const text = String(q || "").trim();
  if (text.length < 2) return { products: [], suppliers: [], barangays: [] };
  const like = `%${text}%`;
  const db = getDb();
  return {
    products: db
      .prepare("SELECT id, name, category, variant FROM products WHERE name LIKE ? OR variant LIKE ? OR category LIKE ? LIMIT 6")
      .all(like, like, like),
    suppliers: db
      .prepare(
        `SELECT id, name, barangay, municipality, verified FROM suppliers
         WHERE name LIKE ? OR barangay LIKE ? OR municipality LIKE ? OR coverage_barangays LIKE ?
         ORDER BY verified DESC LIMIT 6`
      )
      .all(like, like, like, like),
    barangays: db
      .prepare(
        `SELECT barangay, COUNT(*) AS request_count FROM farm_input_requests
         WHERE barangay LIKE ? GROUP BY barangay ORDER BY request_count DESC LIMIT 5`
      )
      .all(like),
  };
}

module.exports = {
  CATEGORIES,
  listProducts,
  listPopularProducts,
  getProduct,
  findProductByName,
  listSupplierProducts,
  upsertListing,
  deleteListing,
  search,
};
