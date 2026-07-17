const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/messages", (req, res) => {
  const messages = db.prepare(
    "SELECT id, content, created_at FROM messages ORDER BY created_at DESC LIMIT 50"
  ).all();
  res.json(messages);
});

router.post("/messages", (req, res) => {
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: "Message cannot be empty" });
  }

  if (content.length > 500) {
    return res.status(400).json({ error: "Message must be 500 characters or less" });
  }

  const result = db.prepare(
    "INSERT INTO messages (content) VALUES (?)"
  ).run(content.trim());

  res.status(201).json({
    id: result.lastInsertRowid,
    content: content.trim(),
  });
});

module.exports = router;
