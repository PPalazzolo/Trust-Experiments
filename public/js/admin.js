/* Admin dashboard: list participants, show quick stats, export CSV. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  const FACTORS = ["usefulness", "hitl", "transparency", "reputation", "accountability", "reliability", "support", "outcome"];

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
      renderBreakdown(data.participants);
      renderTable(data.participants);
    } catch (e) {
      $("status").textContent = "Error loading data.";
    }
  }

  function renderStats(data) {
    const ps = data.participants;
    const trustVals = ps.map((p) => p.post_survey && p.post_survey.scores && p.post_survey.scores.trustMean).filter((v) => typeof v === "number");
    const avgTrust = trustVals.length ? (trustVals.reduce((a, b) => a + b, 0) / trustVals.length).toFixed(2) : "—";
    $("stats").innerHTML = `<div class="stat-grid">
      <div class="stat"><div class="n">${data.count}</div><div class="l">Participants started</div></div>
      <div class="stat"><div class="n">${data.completed}</div><div class="l">Completed</div></div>
      <div class="stat"><div class="n">${avgTrust}</div><div class="l">Avg trust (1–7)</div></div>
    </div>`;
  }

  function renderBreakdown(ps) {
    // Mean trust per factor-level — a quick eyeball of each hypothesis.
    const completed = ps.filter((p) => p.status === "completed" && p.post_survey && p.post_survey.scores);
    let html = '<h3 style="margin-top:10px;">Mean trust by condition (quick look)</h3>';
    html += '<div class="stat-grid">';
    FACTORS.forEach((f) => {
      const groups = {};
      completed.forEach((p) => {
        const lvl = p.condition[f];
        const t = p.post_survey.scores.trustMean;
        if (typeof t !== "number") return;
        (groups[lvl] = groups[lvl] || []).push(t);
      });
      const parts = Object.keys(groups).sort().map((lvl) => {
        const arr = groups[lvl];
        const m = (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2);
        return `<div><span class="pill">${lvl}</span> ${m} <span class="muted">(n=${arr.length})</span></div>`;
      }).join("");
      html += `<div class="stat"><div class="l" style="font-weight:600;color:var(--ink);margin-bottom:6px;">${f}</div>${parts || '<span class="muted">—</span>'}</div>`;
    });
    html += "</div>";
    $("breakdown").innerHTML = html;
  }

  function renderTable(ps) {
    const cols = ["created_at", "status", ...FACTORS, "age", "country", "trust"];
    let html = "<thead><tr>" + cols.map((c) => `<th>${c}</th>`).join("") + "</tr></thead><tbody>";
    ps.forEach((p) => {
      const demo = p.demographics || {};
      const trust = p.post_survey && p.post_survey.scores ? p.post_survey.scores.trustMean : "";
      const cells = [
        new Date(p.created_at).toLocaleString(),
        p.status,
        ...FACTORS.map((f) => p.condition[f] || ""),
        demo.age_band || "",
        demo.country || "",
        trust == null ? "" : trust,
      ];
      html += "<tr>" + cells.map((c) => `<td>${c}</td>`).join("") + "</tr>";
    });
    html += "</tbody>";
    $("tbl").innerHTML = html;
  }

  if (loadToken()) load();
})();
