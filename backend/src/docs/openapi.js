// OpenAPI 3 spec served at /api/openapi.json and rendered by Swagger UI at /api/docs.
// Mirrors docs/api.md. Example bodies use the demo data (seed.js), so "Try it out"
// works on a fresh database.

const examples = {
  farmerId: 1,
  supplierId: 1,
  productId: 1,
};

// op("Tag", "Summary", { query: ["name", ...], body: {...example}, description, status })
function op(tag, summary, { query = [], body, description, status = 200 } = {}, path = "") {
  const pathParams = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const operation = {
    tags: [tag],
    summary,
    parameters: [
      ...pathParams.map((name) => ({
        name,
        in: "path",
        required: true,
        schema: { type: /id$/i.test(name) ? "integer" : "string" },
        example: /supplier/i.test(name) ? examples.supplierId : /id$/i.test(name) ? 1 : "Katipunan",
      })),
      ...query.map((q) => {
        const [name, example] = Array.isArray(q) ? q : [q];
        return { name, in: "query", required: false, schema: { type: "string" }, ...(example !== undefined && { example }) };
      }),
    ],
    responses: {
      [status]: { description: "Success", content: { "application/json": {} } },
      400: { description: "Bad input" },
      404: { description: "Not found" },
    },
  };
  if (description) operation.description = description;
  if (body) {
    operation.requestBody = {
      required: true,
      content: { "application/json": { schema: { type: "object" }, example: body } },
    };
  }
  return operation;
}

// [method, path, tag, summary, options]
const routes = [
  ["get", "/health", "Health", "Server health check"],
  ["get", "/locations", "Health", "Barangays of M'lang (for forms)"],

  ["get", "/products", "Products", "Marketplace products with lowest price", { query: [["category", ""], ["q", ""]] }],
  ["get", "/products/categories", "Products", "Product categories"],
  ["get", "/products/popular", "Products", "Most requested products", { query: [["limit", "5"]] }],
  ["get", "/products/search", "Products", "Top-bar search (2+ characters)", { query: [["q", "urea"]] }],
  ["get", "/products/{id}", "Products", "Product with supplier listings"],

  ["get", "/suppliers", "Suppliers", "Supplier directory", { query: [["q", ""], ["category", ""], ["all", ""]] }],
  ["post", "/suppliers/register", "Suppliers", "Register a supplier", {
    status: 201,
    body: { name: "Test Agri Store", contact_person: "Juan Cruz", phone: "09171112222", barangay: "Poblacion", municipality: "M'lang", coverage_barangays: "Poblacion, Katipunan" },
  }],
  ["get", "/suppliers/{id}", "Suppliers", "Supplier profile with listings and reviews"],
  ["patch", "/suppliers/{id}", "Suppliers", "Edit a supplier", { body: { name: "GreenFields Agri Supply", barangay: "Poblacion", municipality: "M'lang" } }],
  ["post", "/suppliers/{id}/verification", "Suppliers", "Staff: verify or unverify a supplier", { body: { verified: true } }],
  ["get", "/suppliers/{id}/products", "Suppliers", "Supplier's listings"],
  ["put", "/suppliers/{id}/products/{productId}", "Suppliers", "Add or update a listing", { body: { price: 1150, unit: "sacks", in_stock: true } }],
  ["delete", "/suppliers/{id}/products/{productId}", "Suppliers", "Remove a listing"],

  ["get", "/farmers", "Farmers", "Staff list of farmers", { query: [["status", ""], ["q", ""]] }],
  ["post", "/farmers/register", "Farmers", "Register a farmer (idempotent by phone)", {
    status: 201,
    body: { name: "Maria Santos", phone_number: "09181234567", barangay: "Katipunan", municipality: "M'lang" },
  }],
  ["get", "/farmers/{id}", "Farmers", "Farmer profile"],
  ["patch", "/farmers/{id}", "Farmers", "Edit a farmer", { body: { name: "Maria Santos", phone_number: "09181234567", barangay: "Katipunan", municipality: "M'lang" } }],
  ["post", "/farmers/{id}/otp", "Farmers", "Send a phone OTP (dev_code returned in demo mode)"],
  ["post", "/farmers/{id}/otp/verify", "Farmers", "Confirm the phone OTP", { body: { code: "123456" } }],
  ["post", "/farmers/{id}/verification", "Farmers", "Verifier decision", { body: { decision: "approved", verifier_name: "Brgy. Captain", note: "" } }],
  ["get", "/farmers/{id}/verification", "Farmers", "Verification history"],
  ["get", "/farmers/{id}/points", "Farmers", "AgriPoints balance and history"],

  ["post", "/inbound/simulate", "SMS & Messenger intake", "Simulate a farmer's text (the AI/NLP workflow)", {
    description:
      "Acts as a farmer texting in. An unknown sender starts registration first (reply with name, barangay, town, then OO). " +
      "Or register in one text: `REG Maria Santos, Katipunan, M'lang`, then send an order like `10 sako urea sa Katipunan bago mag May`, then `OO` to confirm.",
    body: { channel: "sms", sender: "09181234567", message: "REG Maria Santos, Katipunan, M'lang" },
  }],
  ["post", "/chat/message", "SMS & Messenger intake", "Website chat: send a message to the bot", {
    description:
      "The public chat on the homepage — the same bot as SMS/Messenger. `session_id` is a random 16–64 character id " +
      "the browser keeps; reuse it to continue the conversation. Rate-limited (20 messages/minute per session).",
    body: { session_id: "demoSession1234567890", message: "paano mag order?" },
  }],
  ["get", "/chat/history", "SMS & Messenger intake", "Website chat: this session's messages", { query: [["session_id", "demoSession1234567890"], ["after_id", "0"]] }],
  ["get", "/inbound", "SMS & Messenger intake", "Staff inbox of incoming messages", { query: [["channel", ""], ["status", ""]] }],
  ["get", "/inbound/{id}", "SMS & Messenger intake", "One inbox item"],
  ["post", "/inbound/{id}/process", "SMS & Messenger intake", "Re-read a message with the NLP service"],
  ["post", "/inbound/{id}/publish", "SMS & Messenger intake", "Staff publishes the request for the farmer", { body: {} }],
  ["post", "/inbound/{id}/dismiss", "SMS & Messenger intake", "Dismiss an inbox item"],
  ["post", "/sms/inbound", "SMS & Messenger intake", "SMS gateway webhook", { body: { from: "09181234567", message: "STATUS" } }],
  ["get", "/sms/log", "SMS & Messenger intake", "Outgoing/incoming text log", { query: [["limit", "20"], ["phone", ""], ["channel", ""]] }],
  ["get", "/sms/status", "SMS & Messenger intake", "Active SMS / Messenger providers"],

  ["post", "/nlp/extract", "NLP", "Extract a structured request from free text", {
    body: { raw_message: "Pabili po 10 sako urea, Katipunan, bago mag May", barangay: "Katipunan" },
  }],
  ["get", "/nlp/status", "NLP", "Which NLP engine is active"],
  ["post", "/nlp/intent", "NLP", "ML intent classifier: what is this message about?", {
    description:
      "Machine-learning model (logistic regression on word + character n-grams) trained on ~700 farmer messages " +
      "in Tagalog, Bisaya, Hiligaynon, Ilocano, English, and other Philippine languages. Returns the intent, its confidence, and the top 3 guesses. " +
      'Try: "may delivery ba kayo sa dalipe?", "tagpila ang urea subong", "adda kadi abonoyo", "kulang ang dumating".',
    body: { message: "may delivery ba kayo sa dalipe?" },
  }],
  ["get", "/nlp/intent/model", "NLP", "ML model details (algorithm, intents, training size)"],
  ["post", "/nlp/language", "NLP", "ML language identifier: which Philippine language is this?", {
    description:
      "Naive Bayes model on character n-grams, trained on farmer messages in Tagalog, Bisaya (Cebuano), Hiligaynon, " +
      "Ilocano, Bikol, Waray, Kapampangan, Pangasinan, Maguindanaon, and English. `confident` is false for texts with no " +
      "language-specific words (\"OO\", \"5 sako urea\"); the bot then keeps the sender's last language. `reply_language` " +
      "is the language the bot answers in. " +
      'Try: "mabakal ako sang lima ka sako nga urea", "gumatangak ti tallo a sako", "dios mabalos po", "saliwan ku ing urea".',
    body: { message: "mabakal ako sang lima ka sako nga urea buwas" },
  }],
  ["get", "/nlp/language/model", "NLP", "Language model details (languages, training size, reply languages)"],

  ["post", "/requests/create", "Requests", "Create a structured request", {
    status: 201,
    body: { farmer_id: examples.farmerId, product_name: "Urea (46-0-0)", quantity: 10, unit: "sacks", delivery_location: "Katipunan", notes: "" },
  }],
  ["post", "/requests/submit", "Requests", "AI flow step 1: submit raw message", { status: 201, body: { farmer_id: examples.farmerId, raw_message: "10 sako urea para sa Katipunan" } }],
  ["post", "/requests/validate", "Requests", "AI flow step 2: farmer confirms draft", {
    body: { id: 1, product_name: "Urea (46-0-0)", quantity: 10, unit: "sacks", barangay: "Katipunan" },
  }],
  ["get", "/requests", "Requests", "Staff list of all requests", { query: [["status", ""]] }],
  ["get", "/requests/open/{supplierId}", "Requests", "Supplier's open request feed", { query: [["filter", "all"]] }],
  ["get", "/requests/detail/{id}", "Requests", "Request with its quotations"],
  ["post", "/requests/{id}/reject", "Requests", "Staff: reject a request", { body: { reason: "Duplicate" } }],
  ["get", "/requests/{farmerId}", "Requests", "A farmer's requests"],

  ["post", "/quotes", "Quotations & orders", "Supplier sends a quotation", {
    status: 201,
    body: { request_id: 1, supplier_id: examples.supplierId, price_per_unit: 1150, delivery_fee: 100, delivery_option: "delivery", delivery_date: "2026-10-15", note: "" },
  }],
  ["get", "/quotes/supplier/{supplierId}", "Quotations & orders", "A supplier's quotations"],
  ["post", "/quotes/{id}/accept", "Quotations & orders", "Farmer accepts a quotation (creates an order)", { status: 201, body: { farmer_id: examples.farmerId } }],
  ["post", "/quotes/{id}/decline", "Quotations & orders", "Farmer declines a quotation", { body: { farmer_id: examples.farmerId } }],
  ["post", "/quotes/{id}/negotiate", "Quotations & orders", "Open a chat about a quotation", { body: { farmer_id: examples.farmerId } }],
  ["post", "/quotes/{id}/withdraw", "Quotations & orders", "Supplier withdraws a pending quotation", { body: { supplier_id: examples.supplierId } }],
  ["get", "/orders", "Quotations & orders", "Orders", { query: [["farmer_id", ""], ["supplier_id", ""], ["status", ""]] }],
  ["get", "/orders/{id}", "Quotations & orders", "Order with timeline"],
  ["post", "/orders/{id}/status", "Quotations & orders", "Move an order along", { body: { actor_type: "staff", actor_id: 1, status: "for_delivery" } }],
  ["post", "/orders/{id}/review", "Quotations & orders", "Farmer rates the supplier", { body: { farmer_id: examples.farmerId, rating: 5, comment: "Fast delivery" } }],

  ["get", "/demand/aggregated", "Demand pooling", "All pooled demand"],
  ["get", "/demand/aggregated/{barangay}", "Demand pooling", "Pooled demand in one barangay"],
  ["post", "/demand/aggregate", "Demand pooling", "Run aggregation now", { body: { periodType: "monthly", viabilityThreshold: 20 } }],
  ["post", "/offers/submit", "Demand pooling", "Supplier offer on pooled demand", {
    status: 201,
    body: { aggregated_demand_id: 1, supplier_id: examples.supplierId, price_per_unit: 1100, available_quantity: 100 },
  }],
  ["get", "/offers/my-offers/{supplierId}", "Demand pooling", "A supplier's offers"],
  ["get", "/offers/{offerId}/farmers", "Demand pooling", "Farmers who responded to an offer"],
  ["get", "/confirmations/offers/{requestId}", "Demand pooling", "Offers matching a request"],
  ["post", "/confirmations/accept", "Demand pooling", "Farmer accepts an offer", { body: { request_id: 1, offer_id: 1, farmer_id: examples.farmerId } }],
  ["post", "/confirmations/decline", "Demand pooling", "Farmer declines an offer", { body: { request_id: 1, offer_id: 1, farmer_id: examples.farmerId } }],
  ["post", "/confirmations/revise", "Demand pooling", "Farmer revises a response", { body: { request_id: 1, offer_id: 1, farmer_id: examples.farmerId } }],
  ["post", "/deliveries/schedule", "Demand pooling", "Schedule a delivery for an offer", { status: 201, body: { supplier_offer_id: 1, scheduled_date: "2026-10-20", delivery_point: "Katipunan barangay hall" } }],
  ["patch", "/deliveries/{id}/complete", "Demand pooling", "Complete a delivery (records impact)"],

  ["get", "/conversations", "Messaging", "A participant's conversations", { query: [["participant_type", "farmer"], ["participant_id", "1"]] }],
  ["post", "/conversations", "Messaging", "Find or create a farmer–supplier chat", { status: 201, body: { farmer_id: examples.farmerId, supplier_id: examples.supplierId } }],
  ["get", "/conversations/{id}", "Messaging", "One conversation"],
  ["get", "/conversations/{id}/messages", "Messaging", "Messages, oldest first", { query: [["after_id", ""]] }],
  ["post", "/conversations/{id}/messages", "Messaging", "Send a message", { status: 201, body: { sender_type: "farmer", body: "Hello po, available pa ba?", send_sms: false } }],
  ["post", "/conversations/{id}/read", "Messaging", "Mark messages read", { body: { reader_type: "farmer" } }],
  ["get", "/conversations/{id}/calls", "Messaging", "Call log"],

  ["get", "/notifications", "Notifications & community", "Notifications", { query: [["recipient_type", "farmer"], ["recipient_id", "1"]] }],
  ["post", "/notifications/read", "Notifications & community", "Mark notifications read", { body: { recipient_type: "farmer", recipient_id: 1 } }],
  ["get", "/community/posts", "Notifications & community", "Community posts", { query: [["barangay", ""]] }],
  ["post", "/community/posts", "Notifications & community", "Create a post", { status: 201, body: { author_type: "farmer", author_id: examples.farmerId, body: "Kumusta ang ani ninyo?" } }],
  ["get", "/community/posts/{id}/comments", "Notifications & community", "Comments on a post"],
  ["post", "/community/posts/{id}/comments", "Notifications & community", "Comment on a post", { status: 201, body: { author_type: "farmer", author_id: examples.farmerId, body: "Maganda po!" } }],

  ["get", "/impact/summary", "Reports", "Impact summary", { query: [["barangay", ""], ["start_date", ""], ["end_date", ""]] }],
  ["get", "/impact/barangay/{barangay}", "Reports", "Impact for one barangay", { query: [["start_date", ""], ["end_date", ""]] }],
  ["get", "/admin/overview", "Reports", "Staff dashboard counters"],
];

const paths = {};
for (const [method, path, tag, summary, options] of routes) {
  paths[path] = paths[path] || {};
  paths[path][method] = op(tag, summary, options, path);
}

module.exports = {
  openapi: "3.0.3",
  info: {
    title: "AgriConnect API",
    version: "0.1.0",
    description:
      "Connects small-scale farmers with verified agri-input suppliers. No login is required (prototype).\n\n" +
      "**Quick test:** 1) `GET /products` 2) `POST /inbound/simulate` with the example (registers a farmer by SMS) " +
      "3) `POST /inbound/simulate` again with message `10 sako urea sa Katipunan` 4) once more with `OO` to confirm " +
      "5) `GET /requests` to see the structured request 6) `GET /impact/summary`.\n\n" +
      "Demo data resets when the server restarts. Realtime (SSE), WebRTC call signaling and the Facebook webhook are not listed here.",
  },
  servers: [{ url: "/api" }],
  tags: [
    "Health",
    "Products",
    "Suppliers",
    "Farmers",
    "SMS & Messenger intake",
    "NLP",
    "Requests",
    "Quotations & orders",
    "Demand pooling",
    "Messaging",
    "Notifications & community",
    "Reports",
  ].map((name) => ({ name })),
  paths,
};
