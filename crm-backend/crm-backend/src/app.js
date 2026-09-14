const express = require("express");
const cors = require("cors");
const path = require("path");
const authRoutes = require("./routes/authRoutes");

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || "*",
  })
);
app.use(express.json());

// Serve uploaded profile photos back to the frontend
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);

// Multer errors (e.g. file too large) land here instead of the generic 500 handler
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ errors: { photo: "File must be under 5MB." } });
  }
  if (err.message === "Only image files are allowed.") {
    return res.status(400).json({ errors: { photo: err.message } });
  }
  console.error(err);
  res.status(500).json({ error: "Unexpected server error." });
});

module.exports = app;
