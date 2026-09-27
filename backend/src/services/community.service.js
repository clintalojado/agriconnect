const { getDb } = require("../db/connection");
const { badRequest, notFound } = require("../utils/errors");
const { award } = require("./points.service");

const AUTHOR_TYPES = ["farmer", "supplier"];

const AUTHOR_NAME = `
  CASE %s.author_type
    WHEN 'farmer' THEN (SELECT name FROM farmers WHERE id = %s.author_id)
    ELSE (SELECT name FROM suppliers WHERE id = %s.author_id)
  END`;

function authorName(alias) {
  return AUTHOR_NAME.replaceAll("%s", alias);
}

function validateAuthor({ author_type, author_id }) {
  if (!AUTHOR_TYPES.includes(author_type)) throw badRequest("author_type must be farmer or supplier");
  const table = author_type === "farmer" ? "farmers" : "suppliers";
  if (!getDb().prepare(`SELECT id FROM ${table} WHERE id = ?`).get(author_id)) throw badRequest(`Unknown ${author_type}`);
}

function cleanBody(body) {
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) throw badRequest("body is required");
  if (text.length > 2000) throw badRequest("body must be at most 2000 characters");
  return text;
}

function listPosts({ barangay, limit = 30 } = {}) {
  const params = [];
  let where = "";
  if (barangay) {
    where = "WHERE p.barangay = ?";
    params.push(barangay);
  }
  return getDb()
    .prepare(
      `SELECT p.*, ${authorName("p")} AS author_name,
              (SELECT COUNT(*) FROM community_comments c WHERE c.post_id = p.id) AS comment_count
       FROM community_posts p ${where}
       ORDER BY p.id DESC LIMIT ?`
    )
    .all(...params, Math.min(Number(limit) || 30, 100));
}

function createPost({ author_type, author_id, body }) {
  validateAuthor({ author_type, author_id });
  const text = cleanBody(body);
  const db = getDb();
  const table = author_type === "farmer" ? "farmers" : "suppliers";
  const barangay = db.prepare(`SELECT barangay FROM ${table} WHERE id = ?`).get(author_id)?.barangay || null;
  const result = db
    .prepare("INSERT INTO community_posts (author_type, author_id, barangay, body) VALUES (?, ?, ?, ?)")
    .run(author_type, author_id, barangay, text);
  if (author_type === "farmer") award(author_id, "community_post", result.lastInsertRowid);
  return db
    .prepare(`SELECT p.*, ${authorName("p")} AS author_name, 0 AS comment_count FROM community_posts p WHERE p.id = ?`)
    .get(result.lastInsertRowid);
}

function listComments(postId) {
  const db = getDb();
  if (!db.prepare("SELECT id FROM community_posts WHERE id = ?").get(postId)) throw notFound("Post not found");
  return db
    .prepare(`SELECT c.*, ${authorName("c")} AS author_name FROM community_comments c WHERE c.post_id = ? ORDER BY c.id`)
    .all(postId);
}

function addComment(postId, { author_type, author_id, body }) {
  validateAuthor({ author_type, author_id });
  const text = cleanBody(body);
  const db = getDb();
  if (!db.prepare("SELECT id FROM community_posts WHERE id = ?").get(postId)) throw notFound("Post not found");
  const result = db
    .prepare("INSERT INTO community_comments (post_id, author_type, author_id, body) VALUES (?, ?, ?, ?)")
    .run(postId, author_type, author_id, text);
  return db
    .prepare(`SELECT c.*, ${authorName("c")} AS author_name FROM community_comments c WHERE c.id = ?`)
    .get(result.lastInsertRowid);
}

module.exports = { listPosts, createPost, listComments, addComment };
