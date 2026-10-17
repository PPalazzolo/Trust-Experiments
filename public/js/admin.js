/* Admin dashboard: participants, survey trust, game Trust Score, CSV export. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  const FACTORS = ["usefulness", "hitl", "transparency", "reputation", "accountability", "reliability", "support", "outcome"];
  const ARCHETYPE_BANDS = [
    { min: 80, label: "🤝 AI Ally (80–100)" },
    { min: 60, label: "🧭 Open-Minded Explorer (60–79)" },
    { min: 40, label: "⚖️ Balanced Judge (40–59)" },
    { min: 20, label: "🔍 Careful Skeptic (20–39)" },
    { min: 0, label: "🛡️ Guardian (0–19)" },
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const fmt = (v, d) => (v == null ? "—" : v.toFixed(d));

  function pearson(xs, ys) {
    const n = xs.length;
    if (n < 3) return null;
    const mx = mean(xs);
    const my = mean(ys);
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      dx += (xs[i] - mx) ** 2;
      dy += (ys[i] - my) ** 2;
    }
    return dx && dy ? num / Math.sqrt(dx * dy) : null;
  }

  function saveToken(t) {
    try { localStorage.setItem("admin_token", t); } catch (e) {}
  }
  function loadToken() {
    try { return localStorage.getItem("admin_token") || ""; } catch (e) { return ""; }
  }

  $("token").value = loadToken();
  $("load").addEventListener("click", load);
  $("token").addEventListener("keydown", (e) => { if (e.key === "Enter") load(); });

  async function load() {
    const token = $("token").value.trim();
    if (!token) return;
    saveToken(token);
    $("export").href = `/api/admin/export.csv?token=${encodeURIComponent(token)}`;
    $("status").textContent = "Loading…";
    try {
      const res = await fetch(`/api/admin/participants?token=${encodeURIComponent(token)}`);
      if (res.status === 401) { $("status").textContent = "Invalid token."; return; }
      const data = await res.json();
      $("status").textContent = "";
      renderStats(data);
      renderGame(data);
      renderBreakdown(data.participants);
      renderTable(data.participants);
    } catch (e) {
      $("status").textContent = "Error loading data.";
    }
  }

  const surveyTrust = (p) => (p.post_survey && p.post_survey.scores ? p.post_survey.scores.trustMean : null);
  const gameScore = (p) => (p.game_result && typeof p.game_result.score === "number" ? p.game_result.score : null);

  function renderStats(data) {
    const ps = data.participants;
    const trustVals = ps.map(surveyTrust).filter((v) => typeof v === "number");
    const scores = ps.map(gameScore).filter((v) => v != null);
    $("stats").innerHTML = `<div class="stat-grid">
      <div class="stat"><div class="n">${data.count}</div><div class="l">Participants started</div></div>
      <div class="stat"><div class="n">${data.completed}</div><div class="l">Completed</div></div>
      <div class="stat"><div class="n">${fmt(mean(trustVals), 2)}</div><div class="l">Avg survey trust (1–7)</div></div>
      <div class="stat hi"><div class="n">${fmt(mean(scores), 0)}</div><div class="l">Avg game Trust Score (0–100, n=${scores.length})</div></div>
    </div>`;
  }

  function renderGame(data) {
    const ps = data.participants;
    const withScore = ps.filter((p) => gameScore(p) != null);

    // Distribution across the archetype bands.
    const counts = ARCHETYPE_BANDS.map(() => 0);
    withScore.forEach((p) => {
      const s = gameScore(p);
      const i = ARCHETYPE_BANDS.findIndex((b) => s >= b.min);
      counts[i >= 0 ? i : counts.length - 1]++;
    });
    const maxCount = Math.max(1, ...counts);
    const hist = ARCHETYPE_BANDS.map(
      (b, i) => `<div class="bar-row"><span>${b.label}</span><div class="bar"><span style="width:${(counts[i] / maxCount) * 100}%"></span></div><span class="v">${counts[i]}</span></div>`
    ).join("");

    // Per-decision trust rate (tokens: average given).
    const defs = data.decisions || {};
    const decRows = Object.keys(defs)
      .map((key) => {
        const def = defs[key];
        const made = ps.map((p) => p.game && p.game.decisions && p.game.decisions[key]).filter(Boolean);
        if (def.type === "tokens") {
          const avg = mean(made.map((d) => Number(d.value)).filter((v) => !Number.isNaN(v)));
          const pct = avg == null ? 0 : (avg / def.max) * 100;
          return `<div class="bar-row"><span>🪙 Confidence tokens (avg)</span><div class="bar"><span style="width:${pct}%"></span></div><span class="v">${avg == null ? "—" : avg.toFixed(1) + "/" + def.max}</span></div>`;
        }
        const trusted = made.filter((d) => d.value === "trust").length;
        const pct = made.length ? (trusted / made.length) * 100 : 0;
        return `<div class="bar-row"><span>${def.cardEmoji || ""} ${esc(def.cardTitle || key)}</span><div class="bar"><span style="width:${pct}%"></span></div><span class="v">${made.length ? Math.round(pct) + "% (n=" + made.length + ")" : "—"}</span></div>`;
      })
      .join("");

    // Convergent validity: game score vs survey trust.
    const pairs = ps.filter((p) => gameScore(p) != null && typeof surveyTrust(p) === "number");
    const r = pearson(pairs.map(gameScore), pairs.map(surveyTrust));

    $("game").innerHTML = `
      <h3>🎮 Game Trust Score</h3>
      <p class="small muted" style="margin:0">Behavioural trust from in-game choices. Correlation with survey trust: <strong>r = ${r == null ? "—" : r.toFixed(2)}</strong> (n=${pairs.length}).</p>
      <div class="two-col">
        <div><h3 style="font-size:15px">Distribution</h3><div class="bars">${hist}</div></div>
        <div><h3 style="font-size:15px">% who trusted Bridge at each decision</h3><div class="bars">${decRows}</div></div>
      </div>`;
  }

  function renderBreakdown(ps) {
    let html = '<h3>Mean trust by condition (quick look)</h3><p class="small muted" style="margin:0">Survey trust (1–7) · game Trust Score (0–100)</p><div class="stat-grid">';
    FACTORS.forEach((f) => {
      const groups = {};
      ps.forEach((p) => {
        const lvl = p.condition && p.condition[f];
        if (!lvl) return;
        const g = (groups[lvl] = groups[lvl] || { survey: [], game: [] });
        if (p.status === "completed" && typeof surveyTrust(p) === "number") g.survey.push(surveyTrust(p));
        if (gameScore(p) != null) g.game.push(gameScore(p));
      });
      const parts = Object.keys(groups)
        .sort()
        .map((lvl) => {
          const g = groups[lvl];
          return `<div style="margin:3px 0"><span class="pill">${esc(lvl)}</span> ${fmt(mean(g.survey), 2)} · <strong>${fmt(mean(g.game), 0)}</strong> <span class="muted small">(n=${g.survey.length}/${g.game.length})</span></div>`;
        })
        .join("");
      html += `<div class="stat"><div class="l" style="color:var(--ink);margin-bottom:6px;">${f}</div>${parts || '<span class="muted">—</span>'}</div>`;
    });
    html += "</div>";
    $("breakdown").innerHTML = html;
  }

  function renderTable(ps) {
    const cols = ["created_at", "status", "avatar", "trust score", "archetype", "survey trust", ...FACTORS, "age", "country"];
    let html = "<thead><tr>" + cols.map((c) => `<th>${c}</th>`).join("") + "</tr></thead><tbody>";
    ps.slice()
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .forEach((p) => {
        const demo = p.demographics || {};
        const gr = p.game_result || {};
        const st = surveyTrust(p);
        const cells = [
          esc(new Date(p.created_at).toLocaleString()),
          esc(p.status),
          esc((p.game && p.game.meta && p.game.meta.avatar) || ""),
          gr.score == null ? "" : `<span class="score-chip">${gr.score}</span>`,
          gr.archetype ? esc(gr.archetype.emoji + " " + gr.archetype.title) : "",
          st == null ? "" : esc(st),
          ...FACTORS.map((f) => esc((p.condition && p.condition[f]) || "")),
          esc(demo.age_band || ""),
          esc(demo.country || ""),
        ];
        html += "<tr>" + cells.map((c) => `<td>${c}</td>`).join("") + "</tr>";
      });
    html += "</tbody>";
    $("tbl").innerHTML = html;
  }

  if (loadToken()) load();
})();
