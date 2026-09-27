const express = require("express");
const { listNotifications, markNotificationsRead } = require("../services/notifications.service");
const { handle } = require("../utils/route");

const router = express.Router();

// ?recipient_type=farmer|supplier&recipient_id= → { items, unread }
router.get(
  "/",
  handle((req) => listNotifications({ recipient_type: req.query.recipient_type, recipient_id: Number(req.query.recipient_id) }))
);

// Body { recipient_type, recipient_id, ids? } — without ids, marks all read.
router.post(
  "/read",
  handle((req) => {
    const { recipient_type, recipient_id, ids } = req.body || {};
    return markNotificationsRead({ recipient_type, recipient_id: Number(recipient_id), ids });
  })
);

module.exports = router;
