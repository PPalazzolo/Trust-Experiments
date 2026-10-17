/**
 * Dependency-free persistence layer.
 *
 * Why not SQLite? A file-based store needs no native compilation, runs on any
 * Node version, and deploys as a tiny image — ideal for a low-cost personal AWS
 * box and a study of a few hundred participants. If you ever outgrow it, the
 * exported API below mirrors a typical SQL data layer so it's easy to swap.
 *
 *   - Participants  -> a single JSON file, rewritten atomically on each stage
 *                      update (infrequent, so cheap).
 *   - Events        -> an append-only JSONL log (fast, never rewrites).
 *
 * DB_PATH points at the participants file; the events log sits beside it.
 * In Docker/AWS, put DB_PATH on a persistent volume so data survives restarts.
 */

const path = require("path");
const fs = require("fs");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "study.json");
const DATA_DIR = path.dirname(DB_PATH);
const EVENTS_PATH = path.join(DATA_DIR, "events.jsonl");

fs.mkdirSync(DATA_DIR, { recursive: true });

const now = () => new Date().toISOString();

// In-memory index of participants, keyed by id. Loaded once at startup.
const participants = new Map();

(function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
      if (Array.isArray(raw)) {
        for (const p of raw) participants.set(p.id, p);
      }
    }
  } catch (e) {
    console.error("Warning: could not read existing data file:", e.message);
  }
})();

let writeQueued = false;
function persist() {
  // Debounce multiple synchronous updates into a single atomic write.
  if (writeQueued) return;
  writeQueued = true;
  setImmediate(() => {
    writeQueued = false;
    const tmp = DB_PATH + ".tmp";
    const arr = Array.from(participants.values());
    try {
      fs.writeFileSync(tmp, JSON.stringify(arr), "utf8");
      fs.renameSync(tmp, DB_PATH); // atomic on same filesystem
    } catch (e) {
      console.error("Failed to persist participants:", e.message);
    }
  });
}

function createParticipant({ id, condition, userAgent, assignSource }) {
  const p = {
    id,
    created_at: now(),
    updated_at: now(),
    status: "started",
    condition,
    demographics: null,
    interaction: null,
    post_survey: null,
    user_agent: userAgent || "",
    assign_source: assignSource || "random",
  };
  participants.set(id, p);
  persist();
  return p;
}

function getParticipant(id) {
  return participants.get(id) || null;
}

function updateStage(id, { status, demographics, interaction, post_survey }) {
  const p = participants.get(id);
  if (!p) return null;
  if (status !== undefined) p.status = status;
  if (demographics !== undefined && demographics !== null) p.demographics = demographics;
  if (interaction !== undefined && interaction !== null) p.interaction = interaction;
  if (post_survey !== undefined && post_survey !== null) p.post_survey = post_survey;
  p.updated_at = now();
  persist();
  return p;
}

function logEvent(participantId, type, data) {
  const line = JSON.stringify({ participant_id: participantId, ts: now(), type, data: data || null });
  try {
    fs.appendFileSync(EVENTS_PATH, line + "\n", "utf8");
  } catch (e) {
    console.error("Failed to log event:", e.message);
  }
}

function allParticipants() {
  return Array.from(participants.values()).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

function eventsFor(id) {
  try {
    if (!fs.existsSync(EVENTS_PATH)) return [];
    return fs
      .readFileSync(EVENTS_PATH, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter((e) => e && e.participant_id === id);
  } catch {
    return [];
  }
}

module.exports = {
  createParticipant,
  getParticipant,
  updateStage,
  logEvent,
  allParticipants,
  eventsFor,
  DB_PATH,
};
