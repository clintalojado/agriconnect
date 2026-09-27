const express = require("express");
const { participantKey, subscribe } = require("../realtime/hub");
const { STAFF_KEY } = require("../services/notifications.service");

const router = express.Router();

const HEARTBEAT_MS = 25000;

// GET /realtime/stream?farmer=3 | ?supplier=1 | ?staff=1 — one SSE stream for
// every participant this browser tab is acting as.
router.get("/stream", (req, res) => {
  const keys = [];
  for (const type of ["farmer", "supplier"]) {
    const id = Number(req.query[type]);
    if (Number.isInteger(id) && id > 0) keys.push(participantKey(type, id));
  }
  if (req.query.staff) keys.push(STAFF_KEY);
  if (keys.length === 0) {
    return res.status(400).json({ message: "Pass farmer or supplier as a numeric id, or staff=1" });
  }

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(`event: ready\ndata: ${JSON.stringify({ subscribed: keys })}\n\n`);

  const unsubscribe = subscribe(keys, res);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

module.exports = router;
