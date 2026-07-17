const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", (req, res) => {
  const checkins = db.prepare(
    "SELECT id, mood, note, created_at FROM checkins ORDER BY created_at DESC LIMIT 50"
  ).all();
  res.json(checkins);
});

router.post("/", (req, res) => {
  const { mood, note } = req.body;

  if (!mood || mood < 1 || mood > 5) {
    return res.status(400).json({ error: "Mood must be between 1 and 5" });
  }

  const result = db.prepare(
    "INSERT INTO checkins (mood, note) VALUES (?, ?)"
  ).run(mood, note || "");

  const exercise = db.prepare(
    "SELECT * FROM exercises WHERE mood_type = 'any' ORDER BY RANDOM() LIMIT 1"
  ).get();

  res.status(201).json({
    id: result.lastInsertRowid,
    mood,
    note: note || "",
    exercise: exercise || null,
  });
});

module.exports = router;
