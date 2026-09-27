const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const openapiSpec = require("./docs/openapi");

const farmersRoutes = require("./routes/farmers.routes");
const requestsRoutes = require("./routes/requests.routes");
const nlpRoutes = require("./routes/nlp.routes");
const demandRoutes = require("./routes/demand.routes");
const suppliersRoutes = require("./routes/suppliers.routes");
const offersRoutes = require("./routes/offers.routes");
const confirmationsRoutes = require("./routes/confirmations.routes");
const deliveriesRoutes = require("./routes/deliveries.routes");
const impactRoutes = require("./routes/impact.routes");
const conversationsRoutes = require("./routes/conversations.routes");
const callsRoutes = require("./routes/calls.routes");
const smsRoutes = require("./routes/sms.routes");
const realtimeRoutes = require("./routes/realtime.routes");
const productsRoutes = require("./routes/products.routes");
const quotesRoutes = require("./routes/quotes.routes");
const ordersRoutes = require("./routes/orders.routes");
const inboundRoutes = require("./routes/inbound.routes");
const messengerRoutes = require("./routes/messenger.routes");
const notificationsRoutes = require("./routes/notifications.routes");
const communityRoutes = require("./routes/community.routes");
const adminRoutes = require("./routes/admin.routes");
const locationsRoutes = require("./routes/locations.routes");
const { errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(cors());
// Keep the raw bytes too: the Messenger webhook signature is computed over them.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: false })); // SMS gateway webhooks post form data

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/farmers", farmersRoutes);
app.use("/api/requests", requestsRoutes);
app.use("/api/nlp", nlpRoutes);
app.use("/api/demand", demandRoutes);
app.use("/api/suppliers", suppliersRoutes);
app.use("/api/offers", offersRoutes);
app.use("/api/confirmations", confirmationsRoutes);
app.use("/api/deliveries", deliveriesRoutes);
app.use("/api/impact", impactRoutes);
app.use("/api/conversations", conversationsRoutes);
app.use("/api/calls", callsRoutes);
app.use("/api/sms", smsRoutes);
app.use("/api/realtime", realtimeRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/quotes", quotesRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/inbound", inboundRoutes);
app.use("/api/messenger", messengerRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/locations", locationsRoutes);

// Interactive API docs ("Try it out") for testing the live API.
app.get("/api/openapi.json", (req, res) => res.json(openapiSpec));
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec, { customSiteTitle: "AgriConnect API" }));

// Production: serve the built frontend (frontend/dist) from the same origin.
const frontendDist = path.join(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api(\/|$)).*/, (req, res) => res.sendFile(path.join(frontendDist, "index.html")));
}

app.use((req, res) => {
  res.status(404).json({ message: `Not found: ${req.method} ${req.originalUrl}` });
});

app.use(errorHandler);

module.exports = app;
