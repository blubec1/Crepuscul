const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "crepuscul.db"));

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mood INTEGER NOT NULL CHECK(mood BETWEEN 1 AND 5),
    note TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mood_type TEXT NOT NULL,
    title TEXT NOT NULL,
    instructions TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL
  );
`);

const exerciseCount = db.prepare("SELECT COUNT(*) as count FROM exercises").get();

if (exerciseCount.count === 0) {
  const insert = db.prepare(
    "INSERT INTO exercises (mood_type, title, instructions, duration_seconds) VALUES (?, ?, ?, ?)"
  );

  const seed = db.transaction(() => {
    insert.run("anxiety", "4-7-8 Breathing", "Breathe in through your nose for 4 seconds. Hold your breath for 7 seconds. Exhale slowly through your mouth for 8 seconds. Repeat 4 times.", 60);
    insert.run("anxiety", "5-4-3-2-1 Grounding", "Name 5 things you can see. Name 4 things you can touch. Name 3 things you can hear. Name 2 things you can smell. Name 1 thing you can taste.", 90);
    insert.run("anxiety", "Box Breathing", "Breathe in for 4 seconds. Hold for 4 seconds. Breathe out for 4 seconds. Hold for 4 seconds. Repeat 4 times.", 64);

    insert.run("insomnia", "Progressive Muscle Relaxation", "Starting from your toes, tense each muscle group for 5 seconds, then release. Work upward: feet, calves, thighs, stomach, chest, hands, arms, shoulders, face.", 180);
    insert.run("insomnia", "Calm Visualization", "Close your eyes. Imagine a quiet, safe place - a beach at night, a warm cabin. Focus on the details: the sounds, the temperature, the smells. Stay there for 2 minutes.", 120);

    insert.run("loneliness", "Letter to Yourself", "Imagine a close friend feeling exactly what you feel right now. Write or think about what you would tell them. Now read those words back to yourself. They apply to you too.", 120);
    insert.run("loneliness", "Connection Reminder", "Right now, thousands of people are awake feeling the same way. You are not alone in this. Type a message below to let someone else know they are not alone either.", 60);

    insert.run("low", "Gratitude Three", "Think of 3 small things from today that were okay or good. They can be tiny: a warm drink, a song you heard, a breath that felt easy. Hold each one for a moment.", 90);
    insert.run("low", "Gentle Stretch", "Stand up slowly. Reach your arms above your head. Roll your shoulders back 5 times. Tilt your head gently side to side. Sit back down. You did something kind for your body.", 60);

    insert.run("any", "Name It to Tame It", "Say to yourself: 'Right now I am feeling _____.' Fill in the word. Naming the emotion reduces its power. You are not your emotion - you are the one observing it.", 30);
    insert.run("any", "One Thing at a Time", "You do not need to solve everything right now. Pick one small thing you can do in the next 5 minutes. Do only that. Everything else can wait.", 30);
  });

  seed();
}

module.exports = db;
