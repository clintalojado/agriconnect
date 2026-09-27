const express = require("express");
const { listPosts, createPost, listComments, addComment } = require("../services/community.service");
const { handle } = require("../utils/route");

const router = express.Router();

router.get("/posts", handle((req) => listPosts({ barangay: req.query.barangay })));
// Body { author_type, author_id, body }
router.post("/posts", handle((req) => createPost(req.body || {}), 201));
router.get("/posts/:id/comments", handle((req) => listComments(req.params.id)));
router.post("/posts/:id/comments", handle((req) => addComment(req.params.id, req.body || {}), 201));

module.exports = router;
