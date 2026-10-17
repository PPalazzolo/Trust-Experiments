/**
 * Express server for the AI trust study platform.
 *
 * Hosts two independent studies on one (cheap) server:
 *   - Job Quest  (HR tech)    → page /         API /api         data DB_PATH
 *   - Care Quest (healthcare) → page /health   API /api/health  data HEALTH_DB_PATH
 *
 * Each study has its own conditions, content, AI script, surveys, game and
 * data files; they share only the server and the scoring engine.
 */

const path = require("path");
const fs = require("fs");
const express = require("express");

// Minimal .env loader (avoids an extra dependency). Only sets vars not already
// present in the environment, so real AWS env vars always win. Must run before
// the stores are created.
(function loadDotEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
})();

const db = require("./db");
const { createStudyRouter } = require("./studyApi");

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "change-me-admin-token";
const PUBLIC_DIR = path.join(__dirname, "..", "public");

// --- Job Quest (HR tech) ---------------------------------------------------
const hr = {
  key: "job-quest",
  store: db,
  ...require("./conditions"),
  ...require("./survey"),
  content: require("./content"),
  ...require("./aiEngine"),
  game: require("./game"),
  adminToken: ADMIN_TOKEN,
};

// --- Care Quest (healthcare) -----------------------------------------------
const healthDbPath = process.env.HEALTH_DB_PATH || path.join(path.dirname(db.DB_PATH), "care-study.json");
const health = {
  key: "care-quest",
  store: db.createStore({ dbPath: healthDbPath, eventsPath: path.join(path.dirname(healthDbPath), "care-events.jsonl") }),
  ...require("./health/conditions"),
  ...require("./health/survey"),
  content: require("./health/content"),
  ...require("./health/aiEngine"),
  game: require("./health/game"),
  adminToken: ADMIN_TOKEN,
};

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(express.static(PUBLIC_DIR));

app.use("/api/health", createStudyRouter(health));
app.use("/api", createStudyRouter(hr));

app.get("/healthz", (req, res) => res.json({ ok: true }));

// Pages (clean paths + SPA fallbacks)
app.get("/health/admin", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "health", "admin.html")));
app.get(["/health", "/health/*"], (req, res) => res.sendFile(path.join(PUBLIC_DIR, "health", "index.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "admin.html")));
app.get("*", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

app.listen(PORT, () => {
  console.log(`\n  AI trust study platform`);
  console.log(`  ▸ Job Quest  (HR):         http://localhost:${PORT}/`);
  console.log(`  ▸ Care Quest (healthcare): http://localhost:${PORT}/health`);
  console.log(`  ▸ Admin dashboards:        http://localhost:${PORT}/admin  ·  http://localhost:${PORT}/health/admin  (token: ${ADMIN_TOKEN})`);
  console.log(`  ▸ Data files:              ${db.DB_PATH}  ·  ${health.store.DB_PATH}\n`);
});
