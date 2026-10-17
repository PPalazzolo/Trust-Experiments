# TalentBridge AI — HR-Tech Trust Study Platform

A self-contained web app for running a controlled user study on **trust in a high-risk HR-tech AI**. Participants play a job applicant being screened by a simulated AI hiring assistant ("TalentBridge AI") for a **Customer Service Associate** role, then complete a trust questionnaire.

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

The screening **outcome is randomized** (`advanced` vs `not_advanced`) so you can measure whether receiving the *preferred* result changes trust in the AI (H14). If a participant opts out of AI screening, they're routed to a human and no AI pass/fail is shown.

---

## 2. Run it locally

Requirements: **Node.js 18+**.

```bash
npm install
cp .env.example .env        # then edit ADMIN_TOKEN
npm start
```

- Participant app: <http://localhost:3000/>
- Admin dashboard: <http://localhost:3000/admin> (enter your `ADMIN_TOKEN`)

### Forcing conditions (for moderated sessions / testing)
Append factor values as query params, e.g. to force the "worst" trust condition:

```
http://localhost:3000/?reliability=low&transparency=off&reputation=poor&accountability=off&support=off&hitl=off&usefulness=low&outcome=not_advanced
```

Anything you don't specify is randomized as normal.

---

## 3. Data & analysis

- All data is stored in a single JSON file (`DB_PATH`, default `./data/study.json`), with an append-only `events.jsonl` log beside it. No database server, no native dependencies.
- The admin dashboard shows live counts, mean trust, and a per-factor trust breakdown.
- **Download CSV** gives one row per participant with every condition flag, demographic, survey item, and computed trust score — ready for Excel / R / SPSS / Python.

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
  server.js      Express app: API, admin, CSV export, static hosting
  db.js          File-based data layer (participants + event log)
  conditions.js  Factor definitions + randomized assignment
  content.js     All condition copy (reputation/transparency/HITL/etc.)
  aiEngine.js    Simulated AI assessment + controlled reliability manipulation
  survey.js      Pre-survey + post-survey items mapped to hypotheses
public/
  index.html     Participant SPA shell + support widget
  admin.html     Admin dashboard
  css/styles.css
  js/app.js      Full participant flow
  js/admin.js    Dashboard logic
Dockerfile       Container for any AWS target
```

## 6. Swapping the simulated AI for a real LLM (optional, later)
`src/aiEngine.js` exposes `generateAssessment(condition, answers)`. Replace its body with an LLM call (keeping the same return shape) if you ever want live text — but note that scripted responses are what make the reliability (H7) manipulation controlled and comparable across participants, and they keep hosting cost at $0 for inference.
