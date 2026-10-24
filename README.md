# AI Trust Study Platform — Job Quest (HR) & Care Quest (healthcare)

A self-contained web app for running controlled user studies on **trust in high-risk AI**. It hosts two studies built on the same engine, so results can be compared across domains:

- **Job Quest** (HR tech, at `/`): participants apply for a **Customer Service Associate** role guided by *Bridge*, a simulated AI hiring assistant from "TalentBridge AI".
- **Care Quest** (healthcare, at `/health`): participants play a patient with headaches and use *Remi*, a simulated AI symptom checker from "CareCompass AI", to decide whether to see a doctor today or look after themselves at home. See [Care Quest](#care-quest-healthcare) below.

In both, participants make choices that reveal how much they trust the AI, see the AI's result, and then complete a trust questionnaire.

It is designed to **measure all 13 trust hypotheses** (AI-system, dispositional, and contextual) and to run **cheaply on your personal AWS account** (flat ~$5/mo Lightsail, or ~$0 on an EC2 free-tier box). No live LLM, no managed database — so there are no per-use or per-token costs.

---

## 1. What it tests

**Manipulated by the system** (randomized independently per participant, so each is cleanly analysable):

| Factor | Levels | Hypotheses |
|--------|--------|-----------|
| `usefulness` | high / low | H1 (UX, ease, convenience, real problem) |
| `hitl` | on / off | H2 (part of decision, works-with-you, opt-out) |
| `transparency` | on / off | H3 + H5 (goal, steps, data lifecycle, privacy) |
| `reputation` | trusted / disclosed / poor | H4 + H12 (reputable vs discloses-past-breaches vs poor) |
| `accountability` | on / off | H6 (who's responsible for errors + appeal) |
| `reliability` | high / low | H7 (accuracy, no hallucination, personalization) |
| `support` | on / off | H8 (report-a-problem / feedback mechanism) |
| `outcome` | advanced / not_advanced | H14 (does receiving the preferred result change trust) |

**Measured about the participant** (pre-survey): age band (18–45 / 46+) → H9, gender → H10, AI background → H11, and **country** as free text → H13 (the server buckets it into US / UK / EU / Other for analysis via `regionFromCountry`). *Risk tolerance is intentionally out of scope (future work) but there is a clean hook in `src/survey.js` to add it later.*

The screening **outcome is randomized** (`advanced` vs `not_advanced`) so you can measure whether receiving the *preferred* result changes trust in the AI (H14). When `hitl` is on, participants reach the **Crossroads** *after* seeing the result and can choose to have a human recruiter review their application.

### The game and the behavioural Trust Score

The levels are: TalentBridge Tower (reputation) → Data Gate (transparency) → Workshop (application) → Confidence Check → Screening Chamber (result) → Crossroads (only when `hitl=on`) → Next Steps → Research Lounge (questionnaire) → Trust Profile.

At each decision point the player swipes a card to either rely on Bridge or hold back. Relying adds points and holding back subtracts them (`src/game.js`):

| Decision | Trusting choice | Points |
|---|---|---|
| `share_data` | Let Bridge scan their LinkedIn | ±10 |
| `use_polish` | Use Bridge's rewrite of their answer (in `reliability=low`, the rewrite contains a made-up claim) | ±10 |
| `auto_submit` | Let Bridge send the application without reviewing it | ±10 |
| `confidence_tokens` | 0–10 tokens for "how confident are you I'll judge you fairly" | −10 … +10 |
| `accept_result` | Accept the AI's result instead of asking for a human (only when `hitl=on`) | ±10 |
| `follow_plan` | Follow Bridge's interview-prep plan / improvement tips | ±10 |
| `keep_profile` | Let Bridge keep their profile for future jobs | ±10 |

**Trust Score** = `round((raw + max) / (2 × max) × 100)`, i.e. 0–100 over the decisions the person actually saw, so it stays comparable whether or not the Crossroads appeared. It maps to five non-judgemental profiles (Guardian, Careful Skeptic, Balanced Judge, Open-Minded Explorer, AI Ally).

Design safeguards:
- The score is **hidden during play** and revealed only **after** the questionnaire, so it can't anchor the survey answers.
- The questionnaire is hosted by a neutral research host ("Sam"), not by Bridge, to avoid people rating the AI more kindly because the AI is asking.
- Whether the trusting option appears on the left or right is **randomized per card** and recorded (`g_<key>_trust_side`), so position bias can be checked.
- Visuals are identical across conditions; only the manipulated content changes.

### Care Quest (healthcare)

Same factors, decisions, weights, scoring, archetypes and questionnaire item IDs as Job Quest, so the Trust Score and survey scales mean the same thing in both studies. What changes:

- **Scenario:** everyone gets the same scenario card (a dull headache on most days for two weeks, painkillers help a little, no warning signs) and describes it **in their own words**. No real health information is collected, and a "Simulation · not medical advice" badge is shown on every screen.
- **Outcome / advice:** `outcome` = `see_doctor` / `self_care`. Neither is styled as good or bad news; the advice is randomized only so Remi always has something to recommend. **Outcome favourability (the old "what are you hoping I'll say?" question and its `interaction_hope` / `interaction_outcome_matches_hope` columns) has been removed from Care Quest**, so this study does not test H14.
- **Decisions:** connect health records & fitness tracker (simulated patient-portal sign-in), use Remi's summary for the doctor's notes, let Remi send it to the clinic, confidence tokens ("safe and accurate advice"), nurse callback instead of accepting the advice (`hitl=on`), book the appointment / follow the self-care plan, keep health data.
- **Reliability (H7):** high = Remi echoes exactly what the person said; low = generic "Hello Patient" advice plus one made-up fact about their history (e.g. "your history of migraines"). The made-up facts are never warning signs, so self-care advice never looks dangerous, and they're never something the person actually mentioned.
- **Safety:** "When to get urgent help" (emergency numbers and red-flag symptoms) is always shown, whatever the advice; the debrief repeats that the advice was random and not medical advice.
- **Extra items:** pre-survey `health_lookup` (how often they look up health symptoms online); post-survey `int_follow` (would follow this AI's advice).

Force conditions the same way, e.g. `http://localhost:3000/health?reliability=low&outcome=self_care`. Admin: `/health/admin` (same token). Data goes to its own files (`HEALTH_DB_PATH`, default `care-study.json` beside `DB_PATH`, plus `care-events.jsonl`).

### Versions
Each version lives on its own git branch so you can go back at any time: `main` = v1 (form-based), `v2-game` = v2 (light gamification), `v3-quest` = v3 (Job Quest game + Trust Score), `care-quest` = Job Quest + Care Quest (healthcare). Switch with `git checkout <branch>`.

---

## 2. Run it locally

Requirements: **Node.js 18+**.

```bash
npm install
cp .env.example .env        # then edit ADMIN_TOKEN
npm start
```

- Job Quest: <http://localhost:3000/> · admin <http://localhost:3000/admin> (enter your `ADMIN_TOKEN`)
- Care Quest: <http://localhost:3000/health> · admin <http://localhost:3000/health/admin>

### Forcing conditions (for moderated sessions / testing)
Append factor values as query params, e.g. to force the "worst" trust condition:

```
http://localhost:3000/?reliability=low&transparency=off&reputation=poor&accountability=off&support=off&hitl=off&usefulness=low&outcome=not_advanced
```

Anything you don't specify is randomized as normal.

---

## 3. Data & analysis

- All data is stored in a single JSON file (`DB_PATH`, default `./data/study.json`), with an append-only `events.jsonl` log beside it. No database server, no native dependencies.
- The admin dashboard shows live counts, mean survey trust, the average game Trust Score, its distribution across profiles, the % who trusted Bridge at each decision, the correlation between game score and survey trust, and a per-factor breakdown of both.
- **Download CSV** gives one row per participant with every condition flag, demographic, survey item, and computed trust score — ready for Excel / R / SPSS / Python. Game columns: `game_trust_score`, `game_trust_raw`, `game_trust_max`, `game_archetype`, `game_avatar`, `game_info_flips` (how many data cards they flipped), and per decision `g_<key>` (trust/distrust or tokens), `g_<key>_points`, `g_<key>_trust_side`, plus `g_use_polish_hallucinated`.

---

## 4. Deploy on AWS (personal account, lowest cost)

Two options. **Both avoid load balancers, NAT gateways, and managed databases** — the usual sources of surprise AWS bills. Set an **AWS Budget alert** (Billing → Budgets) for peace of mind.

> Before deploying: set a strong `ADMIN_TOKEN`, and make sure the data file lives on a path that persists (see notes below). Back it up by copying `study.json` periodically.

### Option A — AWS Lightsail (recommended: flat ~$5/mo, simplest)

Lightsail gives a fixed monthly price with bundled data transfer — ideal for a personal, few-month study.

1. **Lightsail → Create instance → Linux/Unix → "Node.js" blueprint** (or OS-only Ubuntu), pick the **$5/mo** plan.
2. SSH in (the Lightsail console has a browser SSH button).
3. Install and run:
   ```bash
   # if you used the OS-only image:
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs git
   git clone <your-repo-url> app && cd app     # or scp the folder up
   npm install --omit=dev
   export ADMIN_TOKEN="<long-random-string>"
   export PORT=3000
   # keep it running after you log out:
   sudo npm install -g pm2
   pm2 start src/server.js --name study && pm2 save
   ```
4. **Networking tab → add a firewall rule** for TCP **3000** (or run behind port 80 — see below).
5. Open `http://<your-lightsail-ip>:3000/`.
6. (Optional) Attach a **static IP** (free while in use) and point a domain at it. For HTTPS, the easiest path is to put Caddy or Nginx in front, or use a Lightsail load balancer only if you need managed TLS (adds cost).

To serve on port 80 without a load balancer:
```bash
sudo setcap 'cap_net_bind_service=+ep' $(which node)   # allow binding :80
PORT=80 pm2 restart study --update-env
```

**Docker alternative on Lightsail:** `sudo apt-get install -y docker.io`, then
```bash
docker build -t study .
docker run -d --restart unless-stopped -p 80:3000 \
  -e ADMIN_TOKEN="<long-random-string>" \
  -v /home/ubuntu/study-data:/app/data study
```
The `-v` volume keeps your data safe across container restarts.

### Option B — EC2 t4g.micro (potentially $0 on free tier)

A new AWS account gets 750 hours/month of a free micro instance for 12 months. You can **stop the instance between recruitment waves to pay $0 while idle**.

1. **EC2 → Launch instance** → Ubuntu, **t4g.micro** (Arm, cheapest) or t3.micro.
2. Security group: allow inbound **TCP 22** (your IP only) and **TCP 80** (and/or 3000) from anywhere.
3. SSH in and follow the same install steps as Lightsail Option A (Node + pm2, or Docker).
4. Storage: the default 8 GB EBS volume is plenty; your data file lives on it. **Snapshot the volume** occasionally for backups.
5. Access via the instance's public IP. Allocate an **Elastic IP** if you want it to stay constant.

### Cost guardrails (do these once)
- **Billing → Budgets →** create a $5–10 monthly budget with an email alert.
- Don't add an Application Load Balancer (~$16+/mo) unless you specifically need managed HTTPS.
- Don't use RDS — this app uses a local file store on purpose.
- There is **no LLM API**, so inference cost is $0.

---

## 5. Project structure

```
src/
  server.js      Express app: mounts both studies, pages, static hosting
  studyApi.js    Per-study API router: participants, decisions, admin, CSV export
  db.js          File-based data layer (participants + event log), one store per study
  conditions.js  Factor definitions + randomized assignment
  content.js     All condition copy (reputation/transparency/HITL/etc.)
  aiEngine.js    Simulated AI assessment, answer polish + reliability manipulation
  game.js        Trust decisions, scoring and Trust Profile archetypes
  survey.js      Pre-survey + post-survey items mapped to hypotheses
  health/        Care Quest versions of conditions, content, aiEngine, game, survey
public/
  index.html     Job Quest SPA shell + support widget
  admin.html     Job Quest admin dashboard
  css/styles.css Shared game styles
  js/app.js      Job Quest game (levels, swipe cards, questionnaire, finale)
  js/admin.js    Dashboard logic (shared; health/admin.html points it at /api/health)
  health/        Care Quest page, teal theme (css/health.css), game (js/app.js), admin
Dockerfile       Container for any AWS target
```

## 6. Swapping the simulated AI for a real LLM (optional, later)
`src/aiEngine.js` exposes `generateAssessment(condition, answers)`. Replace its body with an LLM call (keeping the same return shape) if you ever want live text — but note that scripted responses are what make the reliability (H7) manipulation controlled and comparable across participants, and they keep hosting cost at $0 for inference.
