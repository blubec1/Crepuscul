const express = require("express");
const cors = require("cors");
const path = require("path");

const checkinsRouter = require("./routes/checkins");
const exercisesRouter = require("./routes/exercises");
const supportRouter = require("./routes/support");

const app = express();
const PORT = process.env.PORT || 5500;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/checkins", checkinsRouter);
app.use("/api/exercises", exercisesRouter);
app.use("/api/support", supportRouter);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Crepuscul is running" });
});

const server = app.listen(PORT, () => {
  console.log(`Crepuscul running at http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Trying port ${PORT + 1}...`);
    server.listen(PORT + 1, () => {
      console.log(`Crepuscul running at http://localhost:${PORT + 1}`);
    });
  } else {
    console.error("Server error:", err.message);
  }
});
