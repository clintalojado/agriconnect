-- AgriConnect schema (SQLite for the prototype; kept simple enough to port
-- to PostgreSQL later — swap AUTOINCREMENT/TEXT-timestamp bits for
-- SERIAL/TIMESTAMPTZ and this maps over 1:1).

PRAGMA foreign_keys = ON;

-- 1. Farmers
CREATE TABLE IF NOT EXISTS farmers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    phone_number  TEXT,
    barangay      TEXT NOT NULL,
    municipality  TEXT NOT NULL
);

-- 2. Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT NOT NULL,
    contact_person      TEXT,
    phone               TEXT,
    coverage_barangays  TEXT -- comma-separated barangay names (prototype simplification)
);

-- 3. Farm input requests — raw farmer messages + AI-extracted fields
CREATE TABLE IF NOT EXISTS farm_input_requests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    farmer_id       INTEGER NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    raw_message     TEXT NOT NULL,
    product_name    TEXT,
    quantity        REAL,
    unit            TEXT,
    barangay        TEXT,
    preferred_date  TEXT,
    status          TEXT NOT NULL DEFAULT 'pending_validation'
                        CHECK (status IN ('pending_validation', 'validated', 'aggregated', 'rejected')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_requests_farmer_id ON farm_input_requests(farmer_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON farm_input_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_barangay_product ON farm_input_requests(barangay, product_name);

-- 4. Aggregated demand — validated requests grouped by product/barangay/period
CREATE TABLE IF NOT EXISTS aggregated_demand (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name    TEXT NOT NULL,
    total_quantity  REAL NOT NULL DEFAULT 0,
    unit            TEXT NOT NULL,
    barangay        TEXT NOT NULL,
    time_period     TEXT NOT NULL, -- e.g. '2026-09' for monthly aggregation
    status          TEXT NOT NULL DEFAULT 'collecting'
                        CHECK (status IN ('collecting', 'market_viable', 'offered', 'closed')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (product_name, barangay, time_period)
);

CREATE INDEX IF NOT EXISTS idx_aggregated_barangay_product ON aggregated_demand(barangay, product_name);
CREATE INDEX IF NOT EXISTS idx_aggregated_status ON aggregated_demand(status);

-- 5. Supplier offers against an aggregated demand entry
CREATE TABLE IF NOT EXISTS supplier_offers (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    aggregated_demand_id     INTEGER NOT NULL REFERENCES aggregated_demand(id) ON DELETE CASCADE,
    supplier_id              INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    price_per_unit           REAL NOT NULL,
    min_order_quantity       REAL,
    available_quantity       REAL NOT NULL,
    proposed_delivery_date   TEXT,
    delivery_point           TEXT,
    offer_validity           TEXT, -- date the offer expires
    status                   TEXT NOT NULL DEFAULT 'submitted'
                                 CHECK (status IN ('submitted', 'accepted', 'declined', 'expired')),
    created_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_offers_aggregated_demand_id ON supplier_offers(aggregated_demand_id);
CREATE INDEX IF NOT EXISTS idx_offers_supplier_id ON supplier_offers(supplier_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON supplier_offers(status);

-- 6. Farmer confirmations against a supplier offer
CREATE TABLE IF NOT EXISTS farmer_confirmations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id    INTEGER NOT NULL REFERENCES farm_input_requests(id) ON DELETE CASCADE,
    offer_id      INTEGER NOT NULL REFERENCES supplier_offers(id) ON DELETE CASCADE,
    farmer_id     INTEGER NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'accepted', 'declined', 'revision_requested')),
    confirmed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_confirmations_request_id ON farmer_confirmations(request_id);
CREATE INDEX IF NOT EXISTS idx_confirmations_offer_id ON farmer_confirmations(offer_id);
CREATE INDEX IF NOT EXISTS idx_confirmations_farmer_id ON farmer_confirmations(farmer_id);

-- 7. Deliveries scheduled against an accepted supplier offer
CREATE TABLE IF NOT EXISTS deliveries (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_offer_id   INTEGER NOT NULL REFERENCES supplier_offers(id) ON DELETE CASCADE,
    scheduled_date      TEXT,
    delivery_point      TEXT,
    status              TEXT NOT NULL DEFAULT 'scheduled'
                            CHECK (status IN ('scheduled', 'in_transit', 'completed', 'cancelled')),
    completed_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_deliveries_supplier_offer_id ON deliveries(supplier_offer_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);

-- 8. Impact records — outcomes recorded per completed delivery
CREATE TABLE IF NOT EXISTS impact_records (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_id        INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    farmers_served     INTEGER NOT NULL DEFAULT 0,
    trips_avoided      INTEGER NOT NULL DEFAULT 0,
    estimated_savings  REAL NOT NULL DEFAULT 0,
    notes              TEXT
);

CREATE INDEX IF NOT EXISTS idx_impact_delivery_id ON impact_records(delivery_id);

-- 9. Conversations — one in-app messenger thread per farmer/supplier pair
CREATE TABLE IF NOT EXISTS conversations (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    farmer_id        INTEGER NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    supplier_id      INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    offer_id         INTEGER REFERENCES supplier_offers(id) ON DELETE SET NULL, -- offer that started the thread, if any
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    last_message_at  TEXT,
    UNIQUE (farmer_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_farmer_id ON conversations(farmer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_supplier_id ON conversations(supplier_id);

-- 10. Messages inside a conversation
CREATE TABLE IF NOT EXISTS messages (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_type      TEXT NOT NULL CHECK (sender_type IN ('farmer', 'supplier', 'system')),
    body             TEXT NOT NULL,
    channel          TEXT NOT NULL DEFAULT 'app' CHECK (channel IN ('app', 'sms')),
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    read_at          TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

-- 11. SMS log — every inbound and outbound text, whatever the gateway
CREATE TABLE IF NOT EXISTS sms_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    direction   TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    phone       TEXT NOT NULL,
    body        TEXT NOT NULL,
    provider    TEXT NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('received', 'sent', 'failed')),
    error       TEXT,
    farmer_id   INTEGER REFERENCES farmers(id) ON DELETE SET NULL,
    request_id  INTEGER REFERENCES farm_input_requests(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sms_phone ON sms_messages(phone);

-- 12. Voice calls (in-browser WebRTC) between the two sides of a conversation
CREATE TABLE IF NOT EXISTS calls (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    caller_type      TEXT NOT NULL CHECK (caller_type IN ('farmer', 'supplier')),
    status           TEXT NOT NULL DEFAULT 'ringing'
                         CHECK (status IN ('ringing', 'answered', 'declined', 'missed', 'ended', 'failed')),
    started_at       TEXT NOT NULL DEFAULT (datetime('now')),
    answered_at      TEXT,
    ended_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_calls_conversation_id ON calls(conversation_id);

-- 13. Product catalog (reference data, seeded by migrate.js)
CREATE TABLE IF NOT EXISTS products (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL UNIQUE, -- canonical name, same as the NLP layer produces
    category     TEXT NOT NULL CHECK (category IN ('seeds', 'fertilizer', 'pesticide', 'feeds', 'tools')),
    variant      TEXT,                 -- e.g. '46-0-0', 'PSB Rc82'
    unit         TEXT NOT NULL,        -- default unit farmers order in
    description  TEXT
);

-- 14. What each supplier sells, at what price (the marketplace)
CREATE TABLE IF NOT EXISTS supplier_products (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id  INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    price        REAL NOT NULL,
    unit         TEXT NOT NULL,
    in_stock     INTEGER NOT NULL DEFAULT 1,
    brand        TEXT,
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (supplier_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_products_product ON supplier_products(product_id);

-- 15. Supplier quotations on an individual farmer request
CREATE TABLE IF NOT EXISTS quotes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id      INTEGER NOT NULL REFERENCES farm_input_requests(id) ON DELETE CASCADE,
    supplier_id     INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    price_per_unit  REAL NOT NULL,
    quantity        REAL NOT NULL,
    delivery_fee    REAL NOT NULL DEFAULT 0,
    delivery_date   TEXT,
    delivery_option TEXT NOT NULL DEFAULT 'delivery' CHECK (delivery_option IN ('delivery', 'pickup')),
    note            TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (request_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_quotes_supplier ON quotes(supplier_id);

-- 16. Orders — created when a farmer accepts a quote
CREATE TABLE IF NOT EXISTS orders (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    code               TEXT UNIQUE,     -- e.g. AC-2026-0015
    request_id         INTEGER NOT NULL REFERENCES farm_input_requests(id) ON DELETE CASCADE,
    quote_id           INTEGER NOT NULL UNIQUE REFERENCES quotes(id) ON DELETE CASCADE,
    farmer_id          INTEGER NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    supplier_id        INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    product_name       TEXT NOT NULL,
    quantity           REAL NOT NULL,
    unit               TEXT,
    price_per_unit     REAL NOT NULL,
    delivery_fee       REAL NOT NULL DEFAULT 0,
    total              REAL NOT NULL,
    delivery_date      TEXT,
    delivery_option    TEXT NOT NULL DEFAULT 'delivery',
    delivery_location  TEXT,
    status             TEXT NOT NULL DEFAULT 'confirmed'
                           CHECK (status IN ('confirmed', 'for_delivery', 'delivered', 'completed', 'cancelled')),
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    for_delivery_at    TEXT,
    delivered_at       TEXT,
    completed_at       TEXT,
    cancelled_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_farmer ON orders(farmer_id);
CREATE INDEX IF NOT EXISTS idx_orders_supplier ON orders(supplier_id);

-- 17. Farmer ratings of suppliers, one per completed order
CREATE TABLE IF NOT EXISTS reviews (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id     INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    supplier_id  INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    farmer_id    INTEGER NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 18. Staff inbox — every text that arrives by SMS, Messenger, or the website chat
CREATE TABLE IF NOT EXISTS inbound_messages (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    channel       TEXT NOT NULL CHECK (channel IN ('sms', 'messenger', 'web')),
    sender        TEXT NOT NULL,   -- phone number (sms) or page-scoped id (messenger)
    farmer_id     INTEGER REFERENCES farmers(id) ON DELETE SET NULL,
    body          TEXT NOT NULL,   -- follow-up texts are appended while the message is open
    extraction    TEXT,            -- JSON from the NLP service (structured request + confidence)
    status        TEXT NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new', 'needs_info', 'awaiting_confirmation', 'answered', 'published', 'dismissed')),
    confirmed_by  TEXT,            -- 'farmer' (replied OO/YES) or 'staff' (assisted)
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    published_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_inbound_status ON inbound_messages(status);

-- 18b. Registration by SMS/Messenger, one question at a time (BPMN phase 1)
CREATE TABLE IF NOT EXISTS registration_sessions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    channel           TEXT NOT NULL CHECK (channel IN ('sms', 'messenger', 'web')),
    sender            TEXT NOT NULL,
    step              TEXT NOT NULL,  -- name | barangay | municipality | phone | otp | confirm
    data              TEXT NOT NULL DEFAULT '{}',
    pending_message   TEXT,           -- the first text (often an order), processed once registered
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (channel, sender)
);

-- The language each texter last wrote in, so replies to short messages
-- ("OO", "5 sako", a name) stay in that language.
CREATE TABLE IF NOT EXISTS chat_languages (
    channel     TEXT NOT NULL,
    sender      TEXT NOT NULL,
    language    TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (channel, sender)
);

-- 18c. One-time codes proving a farmer owns a phone number
CREATE TABLE IF NOT EXISTS otp_codes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    farmer_id    INTEGER NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    phone        TEXT NOT NULL,
    code_hash    TEXT NOT NULL,
    attempts     INTEGER NOT NULL DEFAULT 0,
    expires_at   TEXT NOT NULL,
    consumed_at  TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 18d. Barangay / LGU / cooperative decisions on farmer profiles
CREATE TABLE IF NOT EXISTS verification_records (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    farmer_id      INTEGER NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    verifier_name  TEXT NOT NULL,
    decision       TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'more_info')),
    note           TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 19. In-app notifications (bell icon)
CREATE TABLE IF NOT EXISTS notifications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_type  TEXT NOT NULL CHECK (recipient_type IN ('farmer', 'supplier')),
    recipient_id    INTEGER NOT NULL,
    kind            TEXT NOT NULL,
    title           TEXT NOT NULL,
    body            TEXT,
    link            TEXT,          -- in-app route, e.g. '#/requests/12'
    read_at         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_type, recipient_id);

-- 20. AgriPoints ledger — one row per award; `ref` makes each award happen once
CREATE TABLE IF NOT EXISTS agripoints (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    farmer_id   INTEGER NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    points      INTEGER NOT NULL,
    reason      TEXT NOT NULL,
    ref         TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (farmer_id, ref)
);

-- 21. Community board
CREATE TABLE IF NOT EXISTS community_posts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    author_type  TEXT NOT NULL CHECK (author_type IN ('farmer', 'supplier')),
    author_id    INTEGER NOT NULL,
    barangay     TEXT,
    body         TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS community_comments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id      INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    author_type  TEXT NOT NULL CHECK (author_type IN ('farmer', 'supplier')),
    author_id    INTEGER NOT NULL,
    body         TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_community_comments_post ON community_comments(post_id);
