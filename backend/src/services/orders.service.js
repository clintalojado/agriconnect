// Orders (BPMN phases 4–5): confirmed → for_delivery → delivered → completed.
// Suppliers move the delivery forward; the farmer confirms receipt, rates the
// supplier, and earns AgriPoints.

const { getDb } = require("../db/connection");
const { notify } = require("./notifications.service");
const { award } = require("./points.service");
const { badRequest, forbidden, notFound } = require("../utils/errors");

// Who may make which move. Staff can make any listed move (assisted mode).
const TRANSITIONS = {
  supplier: { confirmed: ["for_delivery", "cancelled"], for_delivery: ["delivered"] },
  farmer: { confirmed: ["cancelled"], for_delivery: ["completed"], delivered: ["completed"] },
};

const STATUS_TEXT = {
  for_delivery: "is on the way",
  delivered: "was delivered — please confirm you received it",
  completed: "is completed",
  cancelled: "was cancelled",
};

// The same updates as texted to farmers, in their language: [tl, bis, hil, ilo].
const FARMER_STATUS_TEXT = {
  for_delivery: ["papunta na", "padulong na", "padulong na", "addan iti dalan"],
  delivered: [
    "na-deliver na — paki-confirm kung natanggap ninyo",
    "nahatod na — palihug i-confirm kung nadawat nimo",
    "nahatod na — palihog i-confirm kon nabaton ninyo",
    "naitulodon — pangngaasiyo ta i-confirm no naawatyo",
  ],
  completed: ["tapos na", "nahuman na", "natapos na", "nalpasen"],
  cancelled: ["kinansela", "gikansela", "ginkansela", "nakansela"],
};

const ORDER_SELECT = `
  SELECT o.*, f.name AS farmer_name, f.phone_number AS farmer_phone, f.barangay AS farmer_barangay,
         s.name AS supplier_name, s.phone AS supplier_phone, s.barangay AS supplier_barangay, s.municipality AS supplier_municipality,
         p.category AS product_category, rv.rating AS my_rating, rv.comment AS my_review
  FROM orders o
  JOIN farmers f ON f.id = o.farmer_id
  JOIN suppliers s ON s.id = o.supplier_id
  LEFT JOIN farm_input_requests r ON r.id = o.request_id
  LEFT JOIN products p ON p.id = r.product_id
  LEFT JOIN reviews rv ON rv.order_id = o.id`;

function listOrders({ farmer_id, supplier_id, status } = {}) {
  const clauses = [];
  const params = [];
  if (farmer_id) {
    clauses.push("o.farmer_id = ?");
    params.push(farmer_id);
  }
  if (supplier_id) {
    clauses.push("o.supplier_id = ?");
    params.push(supplier_id);
  }
  if (status) {
    clauses.push("o.status = ?");
    params.push(status);
  }
  return getDb()
    .prepare(`${ORDER_SELECT} ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY o.id DESC LIMIT 300`)
    .all(...params);
}

function getOrderRow(id) {
  const order = getDb().prepare(`${ORDER_SELECT} WHERE o.id = ?`).get(id);
  if (!order) throw notFound("Order not found");
  return order;
}

/** Order with the tracking timeline shown on the Order Tracking screen. */
function getOrder(id) {
  const order = getOrderRow(id);
  const db = getDb();
  const request = db.prepare("SELECT * FROM farm_input_requests WHERE id = ?").get(order.request_id);
  const quotes = db.prepare("SELECT COUNT(*) AS n, MIN(created_at) AS first_at FROM quotes WHERE request_id = ?").get(order.request_id);

  const timeline = [
    { key: "request_created", label: "Request created", at: request?.created_at, done: true },
    {
      key: "quotations_received",
      label: "Quotations received",
      detail: `${quotes.n} supplier${quotes.n === 1 ? "" : "s"}`,
      at: quotes.first_at,
      done: quotes.n > 0,
    },
    { key: "supplier_confirmed", label: "Supplier confirmed", detail: order.supplier_name, at: order.created_at, done: true },
    {
      key: "for_delivery",
      label: order.delivery_option === "pickup" ? "Ready for pickup" : "For delivery",
      detail: order.delivery_date ? `Estimated ${order.delivery_date}` : null,
      at: order.for_delivery_at,
      done: Boolean(order.for_delivery_at),
    },
    { key: "delivered", label: order.delivery_option === "pickup" ? "Picked up" : "Delivered", at: order.delivered_at, done: Boolean(order.delivered_at) },
    { key: "completed", label: "Completed", at: order.completed_at, done: Boolean(order.completed_at) },
  ];
  if (order.status === "cancelled") {
    timeline.push({ key: "cancelled", label: "Cancelled", at: order.cancelled_at, done: true });
  }
  return { ...order, raw_message: request?.raw_message, request_created_at: request?.created_at, timeline };
}

/**
 * Move an order forward. actor_type is farmer | supplier | staff; farmers and
 * suppliers may only move their own orders, and only in their allowed steps.
 */
async function updateOrderStatus({ order_id, actor_type, actor_id, status, delivery_date }) {
  const order = getOrderRow(order_id);
  if (actor_type === "farmer" && Number(order.farmer_id) !== Number(actor_id)) throw forbidden("This isn't your order");
  if (actor_type === "supplier" && Number(order.supplier_id) !== Number(actor_id)) throw forbidden("This isn't your order");

  const allowed =
    actor_type === "staff"
      ? [...new Set([...(TRANSITIONS.supplier[order.status] || []), ...(TRANSITIONS.farmer[order.status] || [])])]
      : TRANSITIONS[actor_type]?.[order.status] || [];
  if (order.status === status) return getOrder(order.id); // repeated click
  if (!allowed.includes(status)) throw badRequest(`Can't move a ${order.status.replace("_", " ")} order to ${status.replace("_", " ")}`);

  const db = getDb();
  const stamp = { for_delivery: "for_delivery_at", delivered: "delivered_at", completed: "completed_at", cancelled: "cancelled_at" }[status];
  db.prepare(`UPDATE orders SET status = ?, ${stamp} = datetime('now'), delivery_date = COALESCE(?, delivery_date) WHERE id = ?`).run(
    status,
    delivery_date || null,
    order.id
  );
  if (status === "completed" && !order.delivered_at) {
    db.prepare("UPDATE orders SET delivered_at = datetime('now') WHERE id = ?").run(order.id);
  }
  if (status === "cancelled") {
    // The request goes back to "for quotation"; suppliers may quote again.
    db.prepare("UPDATE quotes SET status = 'declined', updated_at = datetime('now') WHERE id = ?").run(order.quote_id);
  }
  if (status === "completed") award(order.farmer_id, "order_completed", order.id);

  // Tell the other side (both, when staff acted).
  const what = `Order ${order.code} (${order.quantity} ${order.unit || ""} ${order.product_name})`;
  const message = `${what} ${STATUS_TEXT[status]}.`;
  const [tl, bis, hil, ilo] = FARMER_STATUS_TEXT[status].map((s) => `[AgriConnect] ${what}: ${s}.`);
  if (actor_type !== "farmer") {
    await notify({
      recipient_type: "farmer",
      recipient_id: order.farmer_id,
      kind: "order_update",
      title: `Order ${order.code}: ${status.replace("_", " ")}`,
      body: message,
      link: `#/orders/${order.id}`,
      text: { tl, bis, hil, ilo, en: `[AgriConnect] ${message}` },
    });
  }
  if (actor_type !== "supplier") {
    await notify({
      recipient_type: "supplier",
      recipient_id: order.supplier_id,
      kind: "order_update",
      title: `Order ${order.code}: ${status.replace("_", " ")}`,
      body: message,
      link: `#/orders/${order.id}`,
    });
  }
  return getOrder(order.id);
}

/** Farmer rates the supplier on a completed order (BPMN: rate supplier & earn AgriPoints). */
async function reviewOrder({ order_id, farmer_id, rating, comment }) {
  const order = getOrderRow(order_id);
  if (Number(order.farmer_id) !== Number(farmer_id)) throw forbidden("This isn't your order");
  if (order.status !== "completed") throw badRequest("You can rate the supplier once the order is completed");
  const stars = Number(rating);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw badRequest("rating must be a whole number from 1 to 5");

  getDb()
    .prepare(
      `INSERT INTO reviews (order_id, supplier_id, farmer_id, rating, comment) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (order_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment`
    )
    .run(order.id, order.supplier_id, farmer_id, stars, comment ? String(comment).trim().slice(0, 1000) : null);
  const points = award(farmer_id, "review_posted", order.id);
  await notify({
    recipient_type: "supplier",
    recipient_id: order.supplier_id,
    kind: "review",
    title: `New ${stars}-star rating`,
    body: `${order.farmer_name} rated order ${order.code}${comment ? `: “${String(comment).slice(0, 80)}”` : ""}`,
    link: `#/orders/${order.id}`,
  });
  return { order: getOrder(order.id), points_awarded: points || 0 };
}

module.exports = { listOrders, getOrder, updateOrderStatus, reviewOrder };
