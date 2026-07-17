const express = require("express");
const db = require("../db");

const router = express.Router();

const MOOD_MAP = {
  1: ["anxiety", "any"],
  2: ["anxiety", "any"],
  3: ["low", "any"],
  4: ["loneliness", "any"],
  5: ["insomnia", "any"],
};

router.get("/:mood", (req, res) => {
  const mood = parseInt(req.params.mood);

  if (mood < 1 || mood > 5) {
    return res.status(400).json({ error: "Mood must be between 1 and 5" });
  }

  const types = MOOD_MAP[mood];
  const placeholders = types.map(() => "?").join(",");

  const exercises = db.prepare(
    `SELECT * FROM exercises WHERE mood_type IN (${placeholders}) ORDER BY RANDOM() LIMIT 3`
  ).all(...types);

  res.json(exercises);
});

module.exports = router;
