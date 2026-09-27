const { getDb } = require("../db/connection");
const { samePhone } = require("../utils/phone");
const { badRequest, notFound } = require("../utils/errors");
const { listSupplierProducts } = require("./catalog.service");

const SUPPLIER_STATS = `
  (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE supplier_id = s.id) AS rating,
  (SELECT COUNT(*) FROM reviews WHERE supplier_id = s.id) AS review_count,
  (SELECT COUNT(*) FROM supplier_products WHERE supplier_id = s.id) AS product_count,
  (SELECT GROUP_CONCAT(DISTINCT p.category) FROM supplier_products sp JOIN products p ON p.id = sp.product_id
     WHERE sp.supplier_id = s.id) AS categories,
  (SELECT COUNT(*) FROM orders o WHERE o.supplier_id = s.id AND o.status = 'completed') AS completed_orders`;

function withCategories(row) {
  return row ? { ...row, categories: row.categories ? row.categories.split(",") : [], verified: Boolean(row.verified) } : row;
}

function getSupplier(id) {
  const supplier = getDb().prepare(`SELECT s.*, ${SUPPLIER_STATS} FROM suppliers s WHERE s.id = ?`).get(id);
  if (!supplier) throw notFound("Supplier not found");
  return withCategories(supplier);
}

function findSupplierByPhone(phone) {
  if (!phone) return null;
  return (
    getDb()
      .prepare("SELECT * FROM suppliers WHERE phone IS NOT NULL ORDER BY id")
      .all()
      .find((s) => samePhone(s.phone, phone)) || null
  );
}

function clean(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function findOrCreateSupplier({ name, contact_person, phone, coverage_barangays, barangay, municipality }) {
  const existing = findSupplierByPhone(phone);
  if (existing) return getSupplier(existing.id);

  const result = getDb()
    .prepare(
      `INSERT INTO suppliers (name, contact_person, phone, coverage_barangays, barangay, municipality)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(name.trim(), clean(contact_person), clean(phone), clean(coverage_barangays), clean(barangay), clean(municipality));
  return getSupplier(result.lastInsertRowid);
}

// Edits a store profile in place, so the supplier keeps their offers and chats.
function updateSupplier(id, { name, contact_person, phone, coverage_barangays, barangay, municipality }) {
  const supplier = getSupplier(id);
  if (phone) {
    const owner = findSupplierByPhone(phone);
    if (owner && owner.id !== supplier.id) {
      throw badRequest("That phone number is already registered to another supplier");
    }
  }
  getDb()
    .prepare(
      `UPDATE suppliers SET name = ?, contact_person = ?, phone = ?, coverage_barangays = ?, barangay = ?, municipality = ?
       WHERE id = ?`
    )
    .run(name.trim(), clean(contact_person), clean(phone), clean(coverage_barangays), clean(barangay), clean(municipality), id);
  return getSupplier(id);
}

/** Supplier directory. Farmers only see verified suppliers; staff can list all. */
function listSuppliers({ q, category, include_unverified = false } = {}) {
  const clauses = [];
  const params = [];
  if (!include_unverified) clauses.push("s.verified = 1");
  if (q && q.trim()) {
    clauses.push("(s.name LIKE ? OR s.barangay LIKE ? OR s.municipality LIKE ? OR s.coverage_barangays LIKE ?)");
    params.push(...Array(4).fill(`%${q.trim()}%`));
  }
  if (category && category !== "all") {
    clauses.push(
      "EXISTS (SELECT 1 FROM supplier_products sp JOIN products p ON p.id = sp.product_id WHERE sp.supplier_id = s.id AND p.category = ?)"
    );
    params.push(category);
  }
  return getDb()
    .prepare(
      `SELECT s.*, ${SUPPLIER_STATS} FROM suppliers s
       ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
       ORDER BY s.verified DESC, rating DESC NULLS LAST, s.name`
    )
    .all(...params)
    .map(withCategories);
}

function getSupplierProfile(id) {
  const supplier = getSupplier(id);
  const reviews = getDb()
    .prepare(
      `SELECT rv.*, f.name AS farmer_name, o.product_name
       FROM reviews rv JOIN farmers f ON f.id = rv.farmer_id JOIN orders o ON o.id = rv.order_id
       WHERE rv.supplier_id = ? ORDER BY rv.id DESC LIMIT 10`
    )
    .all(id);
  return { ...supplier, listings: listSupplierProducts(id), reviews };
}

function setSupplierVerified(id, verified) {
  getSupplier(id);
  getDb().prepare("UPDATE suppliers SET verified = ? WHERE id = ?").run(verified ? 1 : 0, id);
  return getSupplier(id);
}

module.exports = {
  getSupplier,
  findOrCreateSupplier,
  updateSupplier,
  listSuppliers,
  getSupplierProfile,
  setSupplierVerified,
};
