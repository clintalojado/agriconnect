const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

let db = null;

function getDb() {
  if (!db) {
    const dbPath = process.env.DB_PATH || path.join(__dirname, "../data/agriconnect.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new DatabaseSync(dbPath);
    db.exec("PRAGMA foreign_keys = ON");
  }
  return db;
}

module.exports = { getDb };
