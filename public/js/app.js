/* TalentBridge AI — participant study flow (vanilla JS SPA). */
(function () {
  "use strict";

  const App = document.getElementById("app");
  const progressFill = document.getElementById("progress-fill");

  const state = {
    config: null,
    participantId: null,
    condition: null,
    demographics: {},
    application: {},
    assessment: null,
    humanReviewRequested: null,
    post: {},
    stageIndex: 0,
  };

  // Stage order. "humanreview" sits AFTER the AI result (shown only when the
  // human-in-the-loop condition is on).
  const STAGES = ["consent", "pre", "intro", "transparency", "application", "assessment", "humanreview", "post", "debrief"];

  // Visual "journey map" groups raw stages into friendly steps with icons.
  const JOURNEY = [
    { key: "start", icon: "👋", label: "Start", stages: ["consent"] },
    { key: "you", icon: "🙌", label: "About you", stages: ["pre"] },
    { key: "company", icon: "🏢", label: "Company", stages: ["intro", "transparency"] },
    { key: "apply", icon: "📝", label: "Apply", stages: ["application"] },
    { key: "result", icon: "🤖", label: "Result", stages: ["assessment", "humanreview"] },
    { key: "questions", icon: "💬", label: "Questions", stages: ["post"] },
    { key: "done", icon: "🎉", label: "Done", stages: ["debrief"] },
  ];

  // Friendly guidance from the mascot ("Bridge") per stage.
  const MASCOT_LINES = {
    consent: "Hi! I'm Bridge 🤖 I'll guide you through a quick job application. Ready?",
    pre: "First, a couple of quick things about you. Totally anonymous!",
    intro: "Here's the employer you're applying to. Take a look!",
    transparency: "Here's what's going to happen. No surprises, promise!",
    application: "Now the fun part — tell me about yourself and I'll review it.",
    assessment: "All done analysing! Here's your result 🎉",
    humanreview: "One more choice for you…",
    post: "Last step! Tell me how that felt. Be honest — it really helps.",
    debrief: "You're a star. Thanks so much for playing along! 🌟",
  };

  // ---- utilities --------------------------------------------------------
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function journeyIndex(stage) {
    return JOURNEY.findIndex((j) => j.stages.includes(stage));
  }

  function buildJourney() {
    const host = document.getElementById("journey");
    if (!host) return;
    host.innerHTML = JOURNEY.map(
      (j) => `<div class="j-step" data-key="${j.key}">
        <div class="j-dot">${j.icon}</div>
        <div class="j-label">${j.label}</div>
      </div>`
    ).join('<div class="j-line"></div>');
  }

  function setProgress(stage) {
    const idx = journeyIndex(stage);
    const pct = Math.round(((idx + 1) / JOURNEY.length) * 100);
    if (progressFill) progressFill.style.width = pct + "%";
    document.querySelectorAll("#journey .j-step").forEach((el, i) => {
      el.classList.toggle("done", i < idx);
      el.classList.toggle("active", i === idx);
    });
    setMascot(MASCOT_LINES[stage] || "");
  }

  function setMascot(message) {
    const bubble = document.getElementById("mascot-bubble");
    if (!bubble || !message) return;
    bubble.textContent = message;
    const mascot = document.getElementById("mascot");
    if (mascot) {
      mascot.classList.remove("pop");
      void mascot.offsetWidth; // restart animation
      mascot.classList.add("pop");
    }
  }

  function launchConfetti() {
    const colors = ["#5b4bff", "#ff7a59", "#18b981", "#ffd54a", "#ff5ca8"];
    const layer = document.createElement("div");
    layer.className = "confetti-layer";
    document.body.appendChild(layer);
    for (let i = 0; i < 90; i++) {
      const c = document.createElement("div");
      c.className = "confetti";
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = Math.random() * 0.6 + "s";
      c.style.animationDuration = 2 + Math.random() * 1.5 + "s";
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      layer.appendChild(c);
    }
    setTimeout(() => layer.remove(), 4200);
  }
  function render(node) {
    App.innerHTML = "";
    node.classList.add("fade-in");
    App.appendChild(node);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function api(path, opts) {
    const res = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts));
    if (!res.ok) throw new Error("API " + res.status);
    return res.json();
  }
  function logEvent(type, data) {
    if (!state.participantId) return;
    fetch(`/api/participants/${state.participantId}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, data: data || {} }),
    }).catch(() => {});
  }
  function readOverridesFromURL() {
    const params = new URLSearchParams(window.location.search);
    const overrides = {};
    Object.keys(state.config.factors).forEach((f) => {
      if (params.get(f)) overrides[f] = params.get(f);
    });
    return overrides;
  }

  // ---- boot -------------------------------------------------------------
  async function boot() {
    try {
      state.config = await api("/api/config");
    } catch (e) {
      App.innerHTML = '<div class="card center"><h2>Something went wrong</h2><p class="muted">Could not load the study. Please refresh.</p></div>';
      return;
    }
    buildJourney();
    const mascot = document.getElementById("mascot");
    if (mascot) mascot.classList.remove("hidden");
    renderConsent();
  }

  function brandbar() {
    const c = state.config;
    return `<div class="brandbar"><div class="logo">TB</div><div><div class="name">${esc(c.company)}</div><div class="tag">Hiring, reimagined</div></div></div>`;
  }

  // ---- 1. Consent -------------------------------------------------------
  function renderConsent() {
    setProgress("consent");
    const node = el(`<div class="card">
      ${brandbar()}
      <div class="hero-emoji">👋</div>
      <h1>Welcome to this research study</h1>
      <p>You are about to try a demo of an AI-powered hiring assistant. You will apply for a sample <strong>${esc(state.config.role)}</strong> position and then answer a short questionnaire about your experience.</p>
      <p class="muted small">This is a <strong>research demo</strong>. No real job, no real company, and no real hiring decision is involved. The "AI" is simulated for research purposes. It takes about <strong>7–10 minutes</strong>. Your responses are anonymous and used only for research. You may stop at any time.</p>
      <div class="field" style="margin-top:18px;">
        <label class="option"><input type="checkbox" id="consent-check" /> I am 18 or older and I agree to take part in this study.</label>
      </div>
      <div class="actions">
        <button class="btn-primary" id="consent-next" disabled>Start</button>
      </div>
    </div>`);
    const check = node.querySelector("#consent-check");
    const btn = node.querySelector("#consent-next");
    check.addEventListener("change", () => (btn.disabled = !check.checked));
    btn.addEventListener("click", startParticipant);
    render(node);
  }

  async function startParticipant() {
    try {
      const overrides = readOverridesFromURL();
      const resp = await api("/api/participants", { method: "POST", body: JSON.stringify({ overrides }) });
      state.participantId = resp.id;
      state.condition = resp.condition;
      setupSupportWidget();
      logEvent("consent_given", {});
      renderPre();
    } catch (e) {
      alert("Could not start the study. Please refresh and try again.");
    }
  }

  // ---- 2. Pre-survey ----------------------------------------------------
  function renderPre() {
    setProgress("pre");
    const s = state.config.preSurvey;
    const node = el(`<div class="card">
      ${brandbar()}
      <div class="hero-emoji">🙌</div>
      <h1>${esc(s.title)}</h1>
      <p class="muted">${esc(s.intro)}</p>
      <form id="pre-form">${s.items.map(renderItem).join("")}</form>
      <div id="pre-error" class="error-text hidden">Please answer all required questions.</div>
      <div class="actions"><button class="btn-primary" id="pre-next">Continue</button></div>
    </div>`);
    node.querySelector("#pre-next").addEventListener("click", async () => {
      const form = node.querySelector("#pre-form");
      const result = collectAnswers(form, s.items);
      if (result.firstMissing) {
        node.querySelector("#pre-error").classList.remove("hidden");
        focusMissing(form, result.firstMissing);
        return;
      }
      state.demographics = result.answers;
      try {
        await api(`/api/participants/${state.participantId}/pre`, { method: "POST", body: JSON.stringify({ answers: result.answers }) });
      } catch (e) { /* non-fatal: continue the study even if this save hiccups */ }
      renderIntro();
    });
    render(node);
  }

  // ---- 3. Company intro (reputation H4/H12) -----------------------------
  function renderIntro() {
    setProgress("intro");
    const rep = state.config.content.reputation[state.condition.reputation];
    const toneMap = { trusted: "ok", disclosed: "info", poor: "warn" };
    const noticeClass = toneMap[rep.tone] || "info";
    const badgeClass = rep.tone === "poor" ? "warn" : rep.tone === "trusted" ? "ok" : "";
    logEvent("intro_viewed", { reputation: state.condition.reputation });

    const disclosure = rep.disclosureBullets
      ? `<ul class="steps">${rep.disclosureBullets.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>`
      : "";

    const node = el(`<div class="card">
      ${brandbar()}
      <div class="hero-emoji">${esc(rep.emoji || "🏢")}</div>
      <h1>You're applying to ${esc(rep.employer)}</h1>
      <p class="muted">${esc(rep.tagline)}</p>
      <div class="badges">${rep.badges.map((b) => `<span class="badge ${badgeClass}">${esc(b)}</span>`).join("")}</div>
      <div class="notice ${noticeClass}">${esc(rep.blurb)}${disclosure}</div>
      <p>Northwind Retail Group uses <strong>${esc(state.config.company)}</strong> to review applications for the <strong>${esc(state.config.role)}</strong> role.</p>
      <div class="actions"><button class="btn-primary" id="intro-next">Continue</button></div>
    </div>`);
    node.querySelector("#intro-next").addEventListener("click", renderTransparency);
    render(node);
  }

  // ---- 4. Transparency panel (H3/H5) -----------------------------------
  function renderTransparency() {
    setProgress("transparency");
    const t = state.config.content.transparency[state.condition.transparency];
    const hitl = state.config.content.hitl[state.condition.hitl];
    logEvent("transparency_viewed", { transparency: state.condition.transparency });

    let inner;
    if (t.showGoal) {
      inner = `
        <h1>Before we start</h1>
        <h3>What we're doing</h3>
        <p>${esc(t.goal)}</p>
        <h3>How it works</h3>
        <ol class="steps">${t.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
        <h3 style="margin-top:18px;">Your data, at a glance</h3>
        <div class="bytes">${t.dataLifecycle.map((d) => `<div class="byte"><div class="stage">${esc(d.stage)}</div><div class="txt">${esc(d.text)}</div></div>`).join("")}</div>`;
    } else {
      // Transparency OFF: minimal framing, no goal/steps/data explanation.
      inner = `
        <h1>Let's get started</h1>
        <p class="muted">Click continue to begin your application.</p>`;
    }

    // The human-in-the-loop oversight note still appears here (if on); the
    // human-review *choice* now happens AFTER the result, not here.
    let hitlBlock = "";
    if (hitl.oversightNotice) {
      hitlBlock += `<div class="notice info">👩‍💼 ${esc(hitl.oversightNotice)}</div>`;
    }

    const node = el(`<div class="card">${brandbar()}${inner}${hitlBlock}
      <div class="actions"><button class="btn-primary" id="trans-next">Continue</button></div>
    </div>`);
    node.querySelector("#trans-next").addEventListener("click", renderApplication);
    render(node);
  }

  // ---- 5. Application form (H1 usefulness, H2 HITL) ---------------------
  function renderApplication() {
    setProgress("application");
    const use = state.config.content.usefulness[state.condition.usefulness];
    const hitl = state.config.content.hitl[state.condition.hitl];
    logEvent("application_started", { usefulness: state.condition.usefulness });

    // Usefulness manipulation: LOW adds terse labels + a nag; HIGH is friendly.
    const roleLabel = use.friction ? "Role" : `The role you're applying for`;

    const sup = state.config.content.support[state.condition.support];
    const supBanner = sup.instruction ? `<div class="notice ok">${esc(sup.instruction)}</div>` : "";

    const node = el(`<div class="card">
      ${brandbar()}
      <div class="hero-emoji">📝</div>
      <h1>Your application</h1>
      <p class="muted">${esc(use.stepHint)}</p>
      ${supBanner}
      <form id="app-form">
        <div class="field">
          <label class="q">Your first name</label>
          <input type="text" name="name" placeholder="${use.friction ? "Name" : "e.g. Alex"}" />
        </div>
        <div class="field">
          <label class="q">${esc(roleLabel)}</label>
          <input type="text" name="role" value="${esc(state.config.role)}" readonly />
        </div>
        <div class="field">
          <label class="q">Your relevant experience <span class="required-star">*</span></label>
          <input type="text" name="experience" placeholder="${use.friction ? "Experience" : "e.g. 2 years in retail customer service"}" />
        </div>
        <div class="field">
          <label class="q">Your top strengths / skills <span class="required-star">*</span></label>
          <input type="text" name="skills" placeholder="${use.friction ? "Skills" : "e.g. communication, patience, problem-solving"}" />
        </div>
        <div class="field">
          <label class="q">When could you start? <span class="required-star">*</span></label>
          <input type="text" name="start_date" placeholder="${use.friction ? "Start date" : "e.g. immediately, or 1 June"}" />
        </div>
        <div class="field">
          <label class="q">How many days per week can you work? <span class="required-star">*</span></label>
          <select name="days_per_week">
            <option value="">Select…</option>
            <option value="1-2 days">1–2 days</option>
            <option value="3-4 days">3–4 days</option>
            <option value="5 days (full-time)">5 days (full-time)</option>
            <option value="Flexible / any">Flexible / any</option>
          </select>
        </div>
        <div class="field">
          <label class="q">Why would you be a good fit? <span class="required-star">*</span></label>
          <textarea name="why" rows="3" placeholder="${use.friction ? "Reason" : "A sentence or two in your own words"}"></textarea>
        </div>
      </form>
      <div id="app-error" class="error-text hidden">Please fill in all required fields.</div>
      <div class="actions"><button class="btn-primary" id="app-next">${use.friction ? "Submit application" : "Submit to TalentBridge AI"}</button></div>
    </div>`);

    node.querySelector("#app-next").addEventListener("click", () => submitApplication(node, use));
    render(node);
  }

  async function submitApplication(node, use) {
    const form = node.querySelector("#app-form");
    const data = Object.fromEntries(new FormData(form).entries());
    const required = ["experience", "skills", "start_date", "days_per_week", "why"];
    if (required.some((k) => !String(data[k] || "").trim())) {
      node.querySelector("#app-error").classList.remove("hidden");
      return;
    }
    state.application = data;
    logEvent("application_submitted", {});

    // Usefulness LOW = add friction: a confirmation step + artificial delay.
    if (use.friction) {
      const ok = window.confirm("Please confirm your details are correct. Incomplete or incorrect forms must be re-entered.");
      if (!ok) return;
    }

    renderAnalyzing(use.friction ? 2600 : 900);
    try {
      const resp = await api(`/api/participants/${state.participantId}/interaction`, {
        method: "POST",
        body: JSON.stringify({ answers: data }),
      });
      state.assessment = resp.assessment;
      setTimeout(() => renderAssessment(), use.friction ? 2600 : 900);
    } catch (e) {
      alert("Could not submit. Please try again.");
    }
  }

  function renderAnalyzing(ms) {
    const node = el(`<div class="card center">
      ${brandbar()}
      <h2>Analysing your application…</h2>
      <div class="spinner"></div>
      <p class="muted small">TalentBridge AI is reviewing your answers.</p>
    </div>`);
    render(node);
  }

  // ---- 6. Assessment (H7 reliability, H6 accountability, H2 HITL) -------
  function renderAssessment() {
    setProgress("assessment");
    const a = state.assessment;
    const acc = state.config.content.accountability[state.condition.accountability];
    const hitl = state.config.content.hitl[state.condition.hitl];
    logEvent("assessment_viewed", { reliability: state.condition.reliability, hallucinated: a.hallucinated });

    let accBlock = "";
    if (acc.statement) {
      accBlock += `<div class="notice info">${esc(acc.statement)}</div>`;
      if (acc.showAppeal) accBlock += `<p class="small muted">${esc(acc.appealText)}</p>`;
    }

    // A human oversees the AI's recommendation (distinct from "advancing").
    let hitlBlock = "";
    if (hitl.oversightNotice) {
      hitlBlock = `<div class="notice info">👩‍💼 ${esc(hitl.oversightNotice)}</div>`;
    }

    const ringColor = a.advanced ? "var(--ok)" : "var(--warn)";

    const node = el(`<div class="card">
      ${brandbar()}
      <div class="hero-emoji">${esc(a.decisionEmoji)}</div>
      <h1>Your screening result</h1>
      <div class="score-ring">
        <div class="score-badge" style="--pct:${a.score}; --ring:${ringColor}"><div class="inner">${a.score}</div></div>
        <div>
          <div style="font-weight:700;font-size:17px;">${esc(a.decisionLabel)}</div>
          <div class="muted small">${esc(a.decisionSub)}</div>
        </div>
      </div>
      <div class="ai-message">${esc(a.message)}</div>
      <h3>Highlights</h3>
      <ul class="highlights">${a.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
      <p class="small muted">${esc(a.rationale)}</p>
      ${hitlBlock}
      ${accBlock}
      <div class="actions"><button class="btn-primary" id="assess-next">Continue</button></div>
    </div>`);
    node.querySelector("#assess-next").addEventListener("click", () => {
      // Human-review choice is offered after the result, only when HITL is on.
      if (hitl.allowOptOut) renderHumanReview();
      else renderPost();
    });
    if (a.advanced) setTimeout(launchConfetti, 250);
    render(node);
  }

  // ---- 6b. Human-review choice (AFTER the result) ----------------------
  function renderHumanReview() {
    setProgress("humanreview");
    const hitl = state.config.content.hitl[state.condition.hitl];
    const a = state.assessment || {};
    logEvent("human_review_prompt_shown", {});

    const node = el(`<div class="card">
      ${brandbar()}
      <div class="hero-emoji">👤</div>
      <h1>Would you like a human to review your application?</h1>
      <p class="muted">You've just received your AI screening result. You can also ask a <strong>human recruiter</strong> to review your application${a.advanced ? "" : " and take another look"}. It's completely your choice.</p>
      <div class="options">
        <label class="option"><input type="radio" name="hr" value="yes" /> Yes, I'd like a human recruiter to review my application</label>
        <label class="option"><input type="radio" name="hr" value="no" /> No thanks, I'm fine with the AI result</label>
      </div>
      <div id="hr-error" class="error-text hidden">Please choose an option.</div>
      <div class="actions"><button class="btn-primary" id="hr-next">Continue</button></div>
    </div>`);
    node.querySelector("#hr-next").addEventListener("click", async () => {
      const choice = node.querySelector('input[name="hr"]:checked');
      if (!choice) {
        node.querySelector("#hr-error").classList.remove("hidden");
        return;
      }
      const requested = choice.value === "yes";
      state.humanReviewRequested = requested;
      try {
        await api(`/api/participants/${state.participantId}/human-review`, { method: "POST", body: JSON.stringify({ requested }) });
      } catch (e) { /* non-fatal */ }
      renderPost();
    });
    render(node);
  }

  // ---- 7. Post-survey ---------------------------------------------------
  function renderPost() {
    setProgress("post");
    const s = state.config.postSurvey;
    const sectionsHtml = s.sections
      .map((sec) => {
        const items = sec.items.map(renderItem).join("");
        return `<div class="section-block"><div class="section-title">${esc(sec.title)}</div>${items}</div>`;
      })
      .join("");
    const node = el(`<div class="card">
      ${brandbar()}
      <div class="hero-emoji">💬</div>
      <h1>${esc(s.title)}</h1>
      <p class="muted">${esc(s.intro)}</p>
      <form id="post-form">${sectionsHtml}</form>
      <div id="post-error" class="error-text hidden">Please answer all rating questions before finishing.</div>
      <div class="actions"><button class="btn-primary" id="post-next">Finish</button></div>
    </div>`);
    node.querySelector("#post-next").addEventListener("click", async () => {
      const form = node.querySelector("#post-form");
      const btn = node.querySelector("#post-next");
      const allItems = s.sections.flatMap((sec) => sec.items);
      const result = collectAnswers(form, allItems);
      if (result.firstMissing) {
        node.querySelector("#post-error").classList.remove("hidden");
        focusMissing(form, result.firstMissing);
        return;
      }
      node.querySelector("#post-error").classList.add("hidden");
      state.post = result.answers;
      btn.disabled = true;
      btn.textContent = "Saving…";
      // Save the responses, but NEVER trap the participant: whatever happens with
      // the network, they always reach the thank-you page.
      try {
        await api(`/api/participants/${state.participantId}/post`, { method: "POST", body: JSON.stringify({ answers: result.answers }) });
      } catch (e) {
        try { localStorage.setItem("pending_post_" + state.participantId, JSON.stringify(result.answers)); } catch (_) {}
      }
      renderDebrief();
    });
    render(node);
  }

  // ---- 8. Debrief -------------------------------------------------------
  function renderDebrief() {
    setProgress("debrief");
    hideSupportWidget();
    const node = el(`<div class="card center">
      ${brandbar()}
      <h1>Thank you! 🎉</h1>
      <p>Your responses have been recorded. We really appreciate your time.</p>
      <div class="notice info" style="text-align:left;">
        <strong>A quick debrief:</strong> This was a research demo. The company, the job, and the AI were all simulated — there was no real application or hiring decision, and the assessment you saw was generated for the study. Nothing you entered affects any real opportunity.
      </div>
      <p class="muted small">You can now close this window.</p>
    </div>`);
    render(node);
    launchConfetti();
    logEvent("study_completed", {});
  }

  // ---- shared: render a survey item ------------------------------------
  function renderItem(item) {
    if (item.type === "likert7") {
      const scale = item.scale || { min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" };
      let opts = "";
      for (let v = scale.min; v <= scale.max; v++) {
        opts += `<label class="likert-opt"><input type="radio" name="${item.id}" value="${v}" /><span class="num">${v}</span></label>`;
      }
      return `<div class="q-item" data-item="${item.id}" data-required="1" data-type="likert7">
        <label class="q">${esc(item.label)}</label>
        <div class="likert"><div class="likert-scale">${opts}</div>
        <div class="likert-ends"><span>${esc(scale.minLabel)}</span><span>${esc(scale.maxLabel)}</span></div></div>
      </div>`;
    }
    if (item.type === "single") {
      const opts = item.options
        .map((o) => `<label class="option"><input type="radio" name="${item.id}" value="${esc(o.value)}" /> ${esc(o.label)}</label>`)
        .join("");
      return `<div class="q-item field" data-item="${item.id}" data-required="${item.required ? 1 : 0}" data-type="single">
        <label class="q">${esc(item.label)}${item.required ? ' <span class="required-star">*</span>' : ""}</label>
        <div class="options">${opts}</div>
      </div>`;
    }
    if (item.type === "text") {
      return `<div class="q-item field" data-item="${item.id}" data-required="${item.required ? 1 : 0}" data-type="text">
        <label class="q">${esc(item.label)}</label>
        <textarea name="${item.id}" rows="3" placeholder="${esc(item.placeholder || "")}"></textarea>
      </div>`;
    }
    return "";
  }

  // Returns { answers } on success, or { firstMissing: <itemId> } if a required
  // question is unanswered. Text questions are ONLY required when explicitly
  // flagged required:true — so optional free-text boxes never block submission.
  function collectAnswers(form, items) {
    const answers = {};
    let firstMissing = null;
    items.forEach((item) => {
      // Likert items are always required; single/text only when required:true.
      const isRequired = item.type === "likert7" || item.required === true;
      let val;
      if (item.type === "text") {
        const t = form.querySelector(`[name="${item.id}"]`);
        val = t ? t.value.trim() : "";
      } else {
        const checked = form.querySelector(`[name="${item.id}"]:checked`);
        val = checked ? checked.value : "";
      }
      if (isRequired && !val && firstMissing === null) firstMissing = item.id;
      if (val !== "") answers[item.id] = val;
    });
    return firstMissing ? { firstMissing } : { answers };
  }

  // Scroll to + briefly highlight the first unanswered required question so the
  // participant knows exactly what's missing (not just a generic error).
  function focusMissing(form, itemId) {
    const q = form.querySelector(`.q-item[data-item="${itemId}"]`);
    if (!q) return;
    q.scrollIntoView({ behavior: "smooth", block: "center" });
    q.classList.add("missing");
    setTimeout(() => q.classList.remove("missing"), 2500);
  }

  // ---- Support widget (H8) ---------------------------------------------
  function setupSupportWidget() {
    const sup = state.config.content.support[state.condition.support];
    const btn = document.getElementById("support-btn");
    const modal = document.getElementById("support-modal");
    if (!sup.showWidget) return;

    btn.classList.remove("hidden");
    btn.innerHTML = `<span>${sup.buttonText || "Help"}</span>`;
    document.getElementById("support-title").textContent = sup.label;
    btn.addEventListener("click", () => {
      modal.classList.remove("hidden");
      logEvent("support_opened", {});
    });
    document.getElementById("support-cancel").addEventListener("click", () => modal.classList.add("hidden"));
    document.getElementById("support-send").addEventListener("click", () => {
      const txt = document.getElementById("support-text").value.trim();
      const ticket = Math.floor(1000 + Math.random() * 9000);
      const confirmEl = document.getElementById("support-confirm");
      confirmEl.textContent = sup.confirmation.replace("{{ticket}}", ticket);
      confirmEl.classList.remove("hidden");
      logEvent("support_submitted", { length: txt.length, ticket });
      setTimeout(() => {
        modal.classList.add("hidden");
        confirmEl.classList.add("hidden");
        document.getElementById("support-text").value = "";
      }, 2200);
    });
  }
  function hideSupportWidget() {
    document.getElementById("support-btn").classList.add("hidden");
    document.getElementById("support-modal").classList.add("hidden");
  }

  boot();
})();
