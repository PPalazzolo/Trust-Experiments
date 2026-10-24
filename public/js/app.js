/* Job Quest — the gamified participant flow for the TalentBridge AI trust study.
 *
 * Flow: title → choose avatar → player profile (pre-survey) → quest levels on a
 * map: Tower → Data Gate → Workshop → Confidence Check → Screening Chamber →
 * Crossroads (only when human-in-the-loop is on) → Next Steps → Research
 * Lounge (questionnaire) → Trust Profile.
 *
 * Trust decisions are sent to the server as they happen. The Trust Score is
 * never shown during play and is only revealed after the questionnaire.
 * The questionnaire is hosted by a neutral research host (not Bridge), to avoid
 * people rating the AI more kindly because the AI itself is asking.
 */
(function () {
  "use strict";

  const App = document.getElementById("app");
  const REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const TOUCH = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

  const state = {
    config: null,
    participantId: null,
    condition: null,
    avatar: null,
    application: {},
    assessment: null,
    levels: [],
    currentLevel: null,
    infoFlips: 0,
  };

  const AVATARS = ["🦊", "🐼", "🦉", "🐙", "🐯", "🐨", "🦄", "🐸", "🧑‍🚀", "🧑‍🎨", "🧑‍💻", "🧑‍🍳"];

  const LEVELS = [
    { key: "tower", icon: "🏢", name: "TalentBridge Tower", art: ["🏙️", "🏢", "🌳"] },
    { key: "gate", icon: "🚪", name: "The Data Gate", art: ["🔐", "🚪", "📜"] },
    { key: "workshop", icon: "🛠️", name: "The Workshop", art: ["📋", "🛠️", "✏️"] },
    { key: "tokens", icon: "🪙", name: "The Confidence Check", art: ["🪙", "🤔", "🪙"] },
    { key: "chamber", icon: "🔮", name: "The Screening Chamber", art: ["✨", "🔮", "✨"] },
    { key: "crossroads", icon: "🛤️", name: "The Crossroads", art: ["🪧", "🛤️", "🌲"], requires: { hitl: "on" } },
    { key: "next", icon: "🧭", name: "Next Steps", art: ["🗺️", "🧭", "⛰️"] },
    { key: "lounge", icon: "☕", name: "The Research Lounge", art: ["🛋️", "☕", "🪴"] },
    { key: "finale", icon: "🏆", name: "Your Trust Profile", art: ["🎈", "🏆", "🎈"] },
  ];

  const DATA_ICONS = { Collected: "📥", Stored: "🗄️", Shared: "🤝", Retained: "⏳" };
  const COMMON_SKILLS = ["Communication", "Patience", "Problem-solving", "Teamwork", "Empathy", "Staying calm", "Listening", "Multitasking"];

  // Questionnaire "packs" (pages). Any section not listed lands on the last page.
  const PAGE_GROUPS = [["trust"], ["usefulness"], ["hitl", "transparency"], ["reputation", "accountability"], ["reliability", "support"], ["outcome"], ["intention", "open"]];

  // ---- utilities --------------------------------------------------------
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, REDUCED ? 0 : ms));

  async function api(path, opts) {
    const res = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts));
    if (!res.ok) throw new Error("API " + res.status);
    return res.json();
  }
  function post(path, body) {
    return api(path, { method: "POST", body: JSON.stringify(body || {}) });
  }
  function pPath(suffix) {
    return `/api/participants/${state.participantId}/${suffix}`;
  }
  function logEvent(type, data) {
    if (!state.participantId) return;
    post(pPath("event"), { type, data: data || {} }).catch(() => {});
  }
  function recordDecision(key, value, trustSide) {
    const body = { key, value, trustSide };
    return post(pPath("decision"), body).catch(() => sleep(1500).then(() => post(pPath("decision"), body)).catch(() => {}));
  }
  function readOverridesFromURL() {
    const params = new URLSearchParams(window.location.search);
    const overrides = {};
    Object.keys(state.config.factors).forEach((f) => {
      if (params.get(f)) overrides[f] = params.get(f);
    });
    return overrides;
  }
  function content(name) {
    return state.config.content[name][state.condition[name]];
  }

  // ---- characters ---------------------------------------------------------
  function bridgeSVG() {
    return `<svg class="bridge" viewBox="0 0 100 100" aria-hidden="true">
      <line x1="50" y1="14" x2="50" y2="26" stroke="#ff7a59" stroke-width="4" stroke-linecap="round"/>
      <circle cx="50" cy="11" r="6" fill="#ff7a59"/>
      <rect x="18" y="26" width="64" height="50" rx="18" fill="#5b4bff"/>
      <rect x="26" y="35" width="48" height="28" rx="12" fill="#eef0ff"/>
      <ellipse class="eye" cx="40" cy="47" rx="5" ry="6" fill="#3a2bd1"/>
      <ellipse class="eye" cx="60" cy="47" rx="5" ry="6" fill="#3a2bd1"/>
      <rect class="mouth" x="43" y="56" width="14" height="4" rx="2" fill="#ff7a59"/>
      <rect x="8" y="42" width="10" height="20" rx="5" fill="#3a2bd1"/>
      <rect x="82" y="42" width="10" height="20" rx="5" fill="#3a2bd1"/>
      <rect x="34" y="78" width="32" height="10" rx="5" fill="#3a2bd1"/>
    </svg>`;
  }

  // Append a speech row to the stream and type the line out.
  function speak(stream, text, who) {
    const isHost = who === "host";
    const row = el(`<div class="bridge-row reveal">
      ${isHost ? '<div class="host-avatar" aria-hidden="true">🧑‍🔬</div>' : bridgeSVG()}
      <div class="speech ${isHost ? "host" : ""}" title="Click to skip">
        <span class="who">${isHost ? "Sam · Research team" : "Bridge · TalentBridge AI"}</span><span class="txt"></span><span class="caret"></span>
      </div>
    </div>`);
    stream.appendChild(row);
    scrollTo(row);
    return typeText(row.querySelector(".txt"), row.querySelector(".speech"), row.querySelector(".bridge"), text);
  }

  function typeText(target, bubble, bot, text) {
    return new Promise((resolve) => {
      const caret = bubble.querySelector(".caret");
      let done = false;
      let timer = null;
      const finish = () => {
        if (done) return;
        done = true;
        clearInterval(timer);
        target.textContent = text;
        if (caret) caret.remove();
        if (bot) bot.classList.remove("talking");
        resolve();
      };
      if (REDUCED) return finish();
      let i = 0;
      if (bot) bot.classList.add("talking");
      timer = setInterval(() => {
        i += 2;
        target.textContent = text.slice(0, i);
        if (i >= text.length) finish();
      }, 26);
      bubble.addEventListener("click", finish, { once: true });
    });
  }

  // ---- scene scaffolding ----------------------------------------------
  function scene(key, opts = {}) {
    const lvl = LEVELS.find((l) => l.key === key);
    const art = opts.art || (lvl ? lvl.art : ["✨", "⭐", "✨"]);
    const artClass = lvl ? `art-${key}` : "art-start";
    let ribbon = opts.ribbon || "";
    if (lvl) ribbon = `Level ${state.levels.findIndex((l) => l.key === key) + 1} · ${lvl.name}`;
    const node = el(`<section class="scene fade-in">
      <div class="scene-art ${artClass}">${art.map((a) => `<span>${a}</span>`).join("")}
        ${ribbon ? `<div class="level-ribbon">${esc(ribbon)}</div>` : ""}
      </div>
      <div class="scene-body"><div class="stream"></div></div>
    </section>`);
    App.innerHTML = "";
    App.appendChild(node);
    window.scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" });
    return node.querySelector(".stream");
  }

  function show(stream, html) {
    const n = el(`<div class="reveal">${html}</div>`);
    stream.appendChild(n);
    scrollTo(n);
    return n;
  }

  function scrollTo(node, block) {
    requestAnimationFrame(() => {
      const top = node.getBoundingClientRect().top + window.scrollY - 100;
      const bottom = node.getBoundingClientRect().bottom + window.scrollY;
      const viewBottom = window.scrollY + window.innerHeight;
      if (block === "start" || bottom > viewBottom) {
        const target = block === "start" ? top : Math.min(top, bottom - window.innerHeight + 30);
        window.scrollTo({ top: Math.max(0, target), behavior: REDUCED ? "auto" : "smooth" });
      }
    });
  }

  function nextButton(stream, label, cls) {
    return new Promise((resolve) => {
      const wrap = show(stream, `<div class="actions"><button class="btn-game ${cls || ""}">${label || "Continue ▶"}</button></div>`);
      const b = wrap.querySelector("button");
      b.addEventListener(
        "click",
        () => {
          b.disabled = true;
          resolve(wrap);
        },
        { once: true }
      );
    });
  }

  // ---- human-in-the-loop affordances (H2) ------------------------------
  // An explicit "opt out of the AI" button, shown before the AI screens the
  // applicant. Resolves to true if they opt out. Only appears when hitl is on.
  function offerOptOut(stream, hitl) {
    return new Promise((resolve) => {
      if (!hitl || !hitl.allowOptOut || !hitl.optOutLabel) return resolve(false);
      const wrap = show(
        stream,
        `<div class="optout-box">
          <div class="notice info">🧑‍💼 It's your choice who handles your first screening — you can opt out of the AI.</div>
          <div class="actions">
            <button class="btn-ghost" data-act="optout">${esc(hitl.optOutLabel)}</button>
            <button class="btn-game mint" data-act="stay">Continue with the AI ▶</button>
          </div>
        </div>`
      );
      wrap.querySelectorAll("button").forEach((b) =>
        b.addEventListener("click", () => {
          wrap.querySelectorAll("button").forEach((x) => (x.disabled = true));
          const opted = b.dataset.act === "optout";
          logEvent("first_screening_optout", { opted });
          resolve(opted);
        })
      );
    });
  }

  // A collaborative "work with you" confirmation: the AI asks the applicant to
  // confirm before it proceeds. Only used when hitl is on.
  async function collabConfirm(stream, text, label) {
    await speak(stream, text);
    await nextButton(stream, label || "Yes, let's do it together ▶");
  }

  // ---- the swipe choice card -------------------------------------------
  // Trust and hold-back options are randomly assigned to left/right on every
  // card (counterbalancing), and the side is recorded for analysis.
  function choose(stream, key, overrides) {
    const def = Object.assign({}, state.config.game.decisions[key], overrides || {});
    return new Promise((resolve) => {
      const trustSide = Math.random() < 0.5 ? "left" : "right";
      const leftLabel = trustSide === "left" ? def.trustLabel : def.distrustLabel;
      const rightLabel = trustSide === "left" ? def.distrustLabel : def.trustLabel;
      const wrap = show(
        stream,
        `<div class="choice-wrap">
          <div class="choice-stage">
            <div class="choice-card" tabindex="0" role="group" aria-label="${esc(def.cardTitle)}">
              <div class="stamp left">${esc(leftLabel)}</div>
              <div class="stamp right">${esc(rightLabel)}</div>
              <div class="ce">${def.cardEmoji || "🤖"}</div>
              <div class="ct">${esc(def.cardTitle)}</div>
            </div>
          </div>
          <div class="choice-hint">${TOUCH ? "Swipe the card or tap a button" : "Swipe the card, use ← → keys, or click a button"}</div>
          <div class="choice-buttons">
            <button class="opt-btn left"><span class="arrow">←</span>${esc(leftLabel)}</button>
            <button class="opt-btn right"><span class="arrow">→</span>${esc(rightLabel)}</button>
          </div>
        </div>`
      );
      const card = wrap.querySelector(".choice-card");
      const stampL = wrap.querySelector(".stamp.left");
      const stampR = wrap.querySelector(".stamp.right");
      const btnL = wrap.querySelector(".opt-btn.left");
      const btnR = wrap.querySelector(".opt-btn.right");
      let decided = false;
      let startX = null;
      let dx = 0;

      function decide(side) {
        if (decided) return;
        decided = true;
        document.removeEventListener("keydown", onKey);
        btnL.disabled = btnR.disabled = true;
        (side === "left" ? stampL : stampR).style.opacity = 1;
        card.classList.remove("dragging");
        card.classList.add(side === "left" ? "fly-left" : "fly-right");
        const value = side === trustSide ? "trust" : "distrust";
        const label = side === "left" ? leftLabel : rightLabel;
        recordDecision(key, value, trustSide);
        setTimeout(
          () => {
            wrap.innerHTML = `<div class="notice info small">✓ You chose: <strong>${esc(label)}</strong></div>`;
            resolve({ value, label });
          },
          REDUCED ? 0 : 450
        );
      }
      function onKey(e) {
        const tag = (e.target && e.target.tagName) || "";
        if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
        if (!document.getElementById("support-modal").classList.contains("hidden")) return;
        if (e.key === "ArrowLeft") decide("left");
        if (e.key === "ArrowRight") decide("right");
      }
      document.addEventListener("keydown", onKey);
      btnL.addEventListener("click", () => decide("left"));
      btnR.addEventListener("click", () => decide("right"));

      card.addEventListener("pointerdown", (e) => {
        if (decided) return;
        startX = e.clientX;
        dx = 0;
        card.classList.add("dragging");
        card.setPointerCapture(e.pointerId);
      });
      card.addEventListener("pointermove", (e) => {
        if (startX === null) return;
        dx = e.clientX - startX;
        card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
        const p = Math.min(Math.abs(dx) / 100, 1);
        stampL.style.opacity = dx < 0 ? p : 0;
        stampR.style.opacity = dx > 0 ? p : 0;
      });
      const end = () => {
        if (startX === null) return;
        startX = null;
        card.classList.remove("dragging");
        if (Math.abs(dx) > 100) decide(dx < 0 ? "left" : "right");
        else {
          card.style.transform = "";
          stampL.style.opacity = 0;
          stampR.style.opacity = 0;
        }
      };
      card.addEventListener("pointerup", end);
      card.addEventListener("pointercancel", end);
    });
  }

  // ---- quest map ----------------------------------------------------------
  function buildMap() {
    const track = document.getElementById("map-track");
    const nodes = [{ key: "start", icon: "🏠", name: "Start" }].concat(state.levels);
    track.innerHTML = nodes.map((n) => `<div class="map-node" data-key="${n.key}" title="${esc(n.name)}">${n.icon}</div>`).join("");
    document.getElementById("map-avatar").textContent = state.avatar;
    document.getElementById("quest-map").classList.remove("hidden");
    placeAvatar("start", false);
    window.addEventListener("resize", () => placeAvatar(state.currentLevel || "start", false));
  }

  function placeAvatar(key, animate) {
    const nodes = Array.from(document.querySelectorAll(".map-node"));
    const node = nodes.find((n) => n.dataset.key === key);
    const av = document.getElementById("map-avatar");
    if (!node || !av) return;
    const idx = nodes.indexOf(node);
    nodes.forEach((n, i) => {
      n.classList.toggle("done", i < idx);
      n.classList.toggle("active", i === idx);
    });
    const inner = av.parentElement.getBoundingClientRect();
    const left = node.getBoundingClientRect().left - inner.left - av.parentElement.clientLeft + node.offsetWidth / 2 - av.offsetWidth / 2;
    if (!animate || REDUCED) {
      av.style.transition = "none";
      av.style.left = left + "px";
      void av.offsetWidth;
      av.style.transition = "";
      return;
    }
    av.classList.remove("walking");
    void av.offsetWidth;
    av.classList.add("walking");
    av.style.left = left + "px";
  }

  const LEVEL_FN = {};

  async function goLevel(key) {
    state.currentLevel = key;
    placeAvatar(key, true);
    logEvent("level_entered", { level: key });
    await sleep(700);
    LEVEL_FN[key]();
  }

  function advance(fromKey) {
    const i = state.levels.findIndex((l) => l.key === fromKey);
    const next = state.levels[i + 1];
    if (next) goLevel(next.key);
  }

  // ---- boot ---------------------------------------------------------------
  async function boot() {
    try {
      state.config = await api("/api/config");
    } catch (e) {
      App.innerHTML = '<div class="card center"><h2>Something went wrong</h2><p class="muted">Could not load the study. Please refresh the page.</p></div>';
      return;
    }
    renderTitle();
  }

  // ---- Title / welcome -----------------------------------------------------
  function renderTitle() {
    const node = el(`<section class="scene title-screen fade-in">
      <div class="scene-art art-start"><span>💼</span><span>🚀</span><span>⭐</span></div>
      <div class="title-logo">Job Quest</div>
      <div class="title-sub">Can you land the job with an AI by your side?</div>
      <div class="title-body">
        <h1>Welcome, job seeker! 👋</h1>
        <p class="welcome-lead">More and more companies now use AI to help decide who gets hired. In this short game, you'll apply for a <strong>${esc(state.config.role)}</strong> role guided by <strong>Bridge</strong>, an AI hiring assistant — making choices along the way and seeing what the AI decides.</p>
        <p>Afterwards, you'll tell us how it felt. Your experience helps researchers understand what makes AI in hiring fair and trustworthy.</p>
        <div class="fine-print">🔬 <strong>This is a research study.</strong> The company, the job and the AI are simulated — no real application or hiring decision is involved. It takes about <strong>10 minutes</strong>. Your answers are anonymous, used only for research, and you can stop at any time.</div>
        <label class="option"><input type="checkbox" id="consent" /> I am 18 or older and I agree to take part in this study.</label>
        <div class="actions center"><button class="btn-game big" id="start" disabled>▶ Start the quest</button></div>
      </div>
    </section>`);
    const check = node.querySelector("#consent");
    const btn = node.querySelector("#start");
    check.addEventListener("change", () => (btn.disabled = !check.checked));
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const resp = await post("/api/participants", { overrides: readOverridesFromURL() });
        state.participantId = resp.id;
        state.condition = resp.condition;
        state.levels = LEVELS.filter((l) => !l.requires || Object.entries(l.requires).every(([k, v]) => state.condition[k] === v));
        setupSupportWidget();
        logEvent("consent_given", {});
        renderAvatar();
      } catch (e) {
        btn.disabled = false;
        alert("Could not start the study. Please refresh and try again.");
      }
    });
    App.innerHTML = "";
    App.appendChild(node);
  }

  // ---- Choose your character ---------------------------------------------
  async function renderAvatar() {
    const stream = scene("avatar", { art: ["🎮", "🧑‍🔬", "🎲"], ribbon: "Getting ready" });
    await speak(stream, "Hi, I'm Sam from the research team! First things first — pick a character to play as.", "host");
    const box = show(
      stream,
      `<div class="avatar-grid">${AVATARS.map((a) => `<button class="avatar-opt" data-a="${a}" aria-label="Choose ${a}">${a}</button>`).join("")}</div>`
    );
    const go = show(stream, `<div class="actions"><button class="btn-game" disabled>That's me! ▶</button></div>`).querySelector("button");
    box.querySelectorAll(".avatar-opt").forEach((b) =>
      b.addEventListener("click", () => {
        box.querySelectorAll(".avatar-opt").forEach((x) => x.classList.remove("selected"));
        b.classList.add("selected");
        state.avatar = b.dataset.a;
        go.disabled = false;
      })
    );
    go.addEventListener("click", () => {
      go.disabled = true;
      post(pPath("game-meta"), { avatar: state.avatar }).catch(() => {});
      renderProfile();
    });
  }

  // ---- Player profile (pre-survey) ----------------------------------------
  async function renderProfile() {
    const s = state.config.preSurvey;
    const stream = scene("profile", { art: ["📝", state.avatar, "🔒"], ribbon: "Player profile" });
    await speak(stream, `Nice choice, ${state.avatar}! Now a few quick questions about the real you. They're anonymous and take about a minute.`, "host");
    const wrap = show(
      stream,
      `<form id="pre-form">${s.items.map(renderItem).join("")}</form>
       <div class="error-text hidden" id="pre-error">Please answer the highlighted question.</div>
       <div class="actions"><button class="btn-game" id="pre-next">Begin the quest ▶</button></div>`
    );
    const btn = wrap.querySelector("#pre-next");
    wrap.querySelector("#pre-form").addEventListener("change", () => wrap.querySelector("#pre-error").classList.add("hidden"));
    btn.addEventListener("click", async () => {
      const form = wrap.querySelector("#pre-form");
      const result = collectAnswers(form, s.items);
      if (result.firstMissing) {
        wrap.querySelector("#pre-error").classList.remove("hidden");
        focusMissing(form, result.firstMissing);
        return;
      }
      btn.disabled = true;
      try {
        await post(pPath("pre"), { answers: result.answers });
      } catch (e) {
        /* non-fatal */
      }
      startQuest();
    });
  }

  function startQuest() {
    buildMap();
    goLevel(state.levels[0].key);
  }

  // ---- Level: TalentBridge Tower (reputation) ------------------------------
  LEVEL_FN.tower = async function () {
    const stream = scene("tower");
    const rep = content("reputation");
    const sup = content("support");
    logEvent("intro_viewed", { reputation: state.condition.reputation });

    await speak(stream, `Hi ${state.avatar}! I'm Bridge, the AI hiring assistant from TalentBridge AI. Today I'll be screening your application for Northwind Retail Group. First, meet the company behind me.`);

    const toneMap = { trusted: "ok", disclosed: "info", poor: "warn" };
    const badgeClass = rep.tone === "poor" ? "warn" : rep.tone === "trusted" ? "ok" : "";
    const disclosure = rep.disclosureBullets ? `<ul>${rep.disclosureBullets.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : "";
    show(
      stream,
      `<div class="company-card">
        <div class="co-head"><div class="co-emoji">${rep.emoji || "🏢"}</div>
          <div><div style="font-weight:900;font-size:20px;">${esc(state.config.company)}</div><div class="muted small">${esc(rep.tagline)}</div></div>
        </div>
        <div class="badges">${rep.badges.map((b) => `<span class="badge ${badgeClass}">${esc(b)}</span>`).join("")}</div>
        <div class="notice ${toneMap[rep.tone] || "info"}">${esc(rep.blurb)}${disclosure}</div>
        <p class="small muted" style="margin:0">${esc(rep.employer)} uses ${esc(state.config.company)} to screen applications for the <strong>${esc(state.config.role)}</strong> role.</p>
      </div>`
    );
    if (sup.showWidget) {
      const n = show(
        stream,
        `<div class="notice ok support-notice"><div>💬 ${esc(sup.instruction)}</div><button class="btn-ghost">Open ${esc(sup.buttonText)}</button></div>`
      );
      n.querySelector("button").addEventListener("click", () => openSupport("tower_notice"));
      introduceSupport();
    }
    await nextButton(stream, "Enter the tower ▶");
    advance("tower");
  };

  // ---- Level: The Data Gate (transparency + data sharing) ----------------
  LEVEL_FN.gate = async function () {
    const stream = scene("gate");
    const t = content("transparency");
    const hitl = content("hitl");
    logEvent("transparency_viewed", { transparency: state.condition.transparency });

    if (t.showGoal) {
      await speak(stream, "Welcome to the Data Gate! Before we go through, here's exactly what I'm going to do — and what happens to your data.");
      const info = show(
        stream,
        `<h3>🎯 The goal</h3><p>${esc(t.goal)}</p>
         <h3>👣 How it works</h3>
         <div class="stones">${t.steps.map((st, i) => `<div class="stone"><div class="n">${i + 1}</div>${esc(st)}</div>`).join("")}</div>
         <h3>🔐 Your data, at a glance</h3>
         <p class="small muted">Tap a card to flip it.</p>
         <div class="flip-grid">${t.dataLifecycle
           .map(
             (d, i) => `<button class="flip" data-i="${i}" aria-label="${esc(d.stage)}: ${esc(d.text)}">
               <div class="flip-inner">
                 <div class="flip-face flip-front"><div class="ic">${DATA_ICONS[d.stage] || "📄"}</div><div class="st">${esc(d.stage)}</div><div class="tap">tap to flip</div></div>
                 <div class="flip-face flip-back"><div class="st">${esc(d.stage)}</div>${esc(d.text)}</div>
               </div>
             </button>`
           )
           .join("")}</div>`
      );
      const flipped = new Set();
      info.querySelectorAll(".flip").forEach((f) =>
        f.addEventListener("click", () => {
          f.classList.toggle("flipped");
          flipped.add(f.dataset.i);
          state.infoFlips = flipped.size;
        })
      );
      if (hitl.oversightNotice) show(stream, `<div class="notice info">👩‍💼 ${esc(hitl.oversightNotice)}</div>`);
      await nextButton(stream, "Got it ▶");
      post(pPath("game-meta"), { infoFlips: state.infoFlips }).catch(() => {});
    } else {
      await speak(stream, "Welcome to the Data Gate! Let's get you through.");
      if (hitl.oversightNotice) show(stream, `<div class="notice info">👩‍💼 ${esc(hitl.oversightNotice)}</div>`);
    }

    const optedOut = await offerOptOut(stream, hitl);
    if (optedOut) {
      await speak(stream, "No problem — I'll note that you'd like a human recruiter to do your first screening. For this study, let's keep going together so you can see how I work.");
    }

    const def = state.config.game.decisions.share_data;
    await speak(stream, def.prompt);
    show(
      stream,
      `<div class="li-explain">
        <div class="li-head"><span class="li-logo" aria-hidden="true">in</span> How LinkedIn scanning works</div>
        <ol>
          <li>A LinkedIn sign-in window opens and you log in to your account.</li>
          <li>You allow TalentBridge AI to read your profile.</li>
          <li>Bridge reads your <strong>work history, education and skills</strong> and adds them to your application.</li>
        </ol>
        <p class="li-note">🎭 This step is simulated: you won't really be asked to sign in and nothing is connected. Please choose as you would in real life.</p>
      </div>`
    );
    const r = await choose(stream, "share_data");
    if (r.value === "trust") {
      await linkedInMock(stream);
      await speak(stream, "All connected! ✅ I'll combine your LinkedIn profile with what you type in the Workshop.");
    } else {
      await speak(stream, "No problem — I'll only use what you type.");
    }
    await nextButton(stream, "Through the gate ▶");
    advance("gate");
  };

  async function linkedInMock(stream) {
    const win = show(
      stream,
      `<div class="oauth-mock" aria-label="Simulated LinkedIn sign-in">
        <div class="oauth-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="url">🔒 linkedin.com · Sign in</span></div>
        <div class="oauth-body">
          <div class="oauth-logos"><span class="li-logo big" aria-hidden="true">in</span><span class="oauth-link">⇄</span><span class="tb-logo" aria-hidden="true">TB</span></div>
          <div><strong>TalentBridge AI</strong> would like to read your:</div>
          <ul class="oauth-scopes"><li>Work history</li><li>Education</li><li>Skills</li></ul>
          <div class="oauth-status">Signing in…</div>
        </div>
        <div class="oauth-foot">Simulation: no real LinkedIn account is accessed</div>
      </div>`
    );
    const status = win.querySelector(".oauth-status");
    for (const step of ["Signing in…", "Permission granted ✓", "Reading your work history, education and skills…", "Connected ✓"]) {
      status.textContent = step;
      await sleep(750);
    }
  }

  // ---- Level: The Workshop (application, polish, submit) -----------------
  LEVEL_FN.workshop = async function () {
    const stream = scene("workshop");
    const use = content("usefulness");
    const friction = use.friction;
    logEvent("application_started", { usefulness: state.condition.usefulness });

    await speak(stream, "Welcome to the Workshop! Fill in your details and I'll turn them into an application.");

    const L = friction
      ? { name: "Name", exp: "Experience", skills: "Skills", start: "Start date", days: "Days per week", why: "Why you're a good fit" }
      : { name: "Your first name", exp: "Your relevant experience", skills: "Your top strengths / skills", start: "Start date: when could you begin?", days: "How many days per week can you work?", why: "Why would you be a good fit?" };
    const P = friction
      ? { name: "", exp: "", skills: "", start: "", why: "" }
      : { name: "e.g. Alex", exp: "e.g. 2 years in retail customer service", skills: "e.g. communication, patience", start: "e.g. immediately, or 1 June", why: "A sentence or two in your own words" };

    const playerCard = friction
      ? ""
      : `<div class="player-card" id="pc">
          <div class="pc-avatar">${state.avatar}</div>
          <div><div class="pc-name" id="pc-name">Your name</div>
            <div class="pc-line" id="pc-exp">Experience: —</div>
            <div id="pc-skills"></div>
            <div class="pc-line" id="pc-avail"></div>
          </div>
        </div>`;
    const chips = friction ? "" : `<div class="chips">${COMMON_SKILLS.map((s) => `<button type="button" class="chip" data-s="${s}">+ ${s}</button>`).join("")}</div>`;

    const formWrap = show(
      stream,
      `<div class="quest-badge">🎯 Quest: ${esc(state.config.role)} at Northwind</div>
       <p class="muted small">${esc(use.stepHint)}</p>
       ${playerCard}
       <form id="app-form" autocomplete="off">
         <div class="field"><label class="q">${L.name}</label><input type="text" name="name" placeholder="${P.name}" /></div>
         <div class="field"><label class="q">${L.exp} <span class="required-star">*</span></label><input type="text" name="experience" placeholder="${P.exp}" /></div>
         <div class="field"><label class="q">${L.skills} <span class="required-star">*</span></label><input type="text" name="skills" placeholder="${P.skills}" />${chips}</div>
         <div class="field"><label class="q">${L.start} <span class="required-star">*</span></label><input type="text" name="start_date" placeholder="${P.start}" /></div>
         <div class="field"><label class="q">${L.days} <span class="required-star">*</span></label>
           <select name="days_per_week">
             <option value="">Select…</option>
             <option value="1-2 days">1–2 days</option>
             <option value="3-4 days">3–4 days</option>
             <option value="5 days (full-time)">5 days (full-time)</option>
             <option value="Flexible / any">Flexible / any</option>
           </select></div>
         <div class="field"><label class="q">${L.why} <span class="required-star">*</span></label><textarea name="why" rows="3" placeholder="${P.why}"></textarea></div>
       </form>
       <div class="error-text hidden" id="app-error">Please fill in all required fields.</div>
       <div class="actions"><button class="btn-game" id="app-next">${friction ? "Next" : "Build my application ▶"}</button></div>`
    );
    const form = formWrap.querySelector("#app-form");
    form.addEventListener("input", () => formWrap.querySelector("#app-error").classList.add("hidden"));

    if (!friction) {
      const skillsInput = form.querySelector('[name="skills"]');
      const refresh = () => {
        const d = Object.fromEntries(new FormData(form).entries());
        formWrap.querySelector("#pc-name").textContent = d.name ? d.name : "Your name";
        formWrap.querySelector("#pc-exp").textContent = "Experience: " + (d.experience || "—");
        const tags = String(d.skills || "").split(",").map((x) => x.trim()).filter(Boolean);
        formWrap.querySelector("#pc-skills").innerHTML = tags.map((t) => `<span class="pc-tag">${esc(t)}</span>`).join("");
        const avail = [d.start_date ? "Start date: " + d.start_date : "", d.days_per_week || ""].filter(Boolean).join(" · ");
        formWrap.querySelector("#pc-avail").textContent = avail;
        formWrap.querySelectorAll(".chip").forEach((c) => c.classList.toggle("added", tags.map((t) => t.toLowerCase()).includes(c.dataset.s.toLowerCase())));
      };
      form.addEventListener("input", refresh);
      form.addEventListener("change", refresh);
      formWrap.querySelectorAll(".chip").forEach((c) =>
        c.addEventListener("click", () => {
          const tags = skillsInput.value.split(",").map((x) => x.trim()).filter(Boolean);
          const i = tags.map((t) => t.toLowerCase()).indexOf(c.dataset.s.toLowerCase());
          if (i >= 0) tags.splice(i, 1);
          else tags.push(c.dataset.s);
          skillsInput.value = tags.join(", ");
          refresh();
        })
      );
    }

    // Wait for a valid form.
    const data = await new Promise((resolve) => {
      const btn = formWrap.querySelector("#app-next");
      btn.addEventListener("click", () => {
        const d = Object.fromEntries(new FormData(form).entries());
        const required = ["experience", "skills", "start_date", "days_per_week", "why"];
        const missing = required.find((k) => !String(d[k] || "").trim());
        if (missing) {
          formWrap.querySelector("#app-error").classList.remove("hidden");
          const f = form.querySelector(`[name="${missing}"]`);
          if (f) f.focus();
          return;
        }
        btn.disabled = true;
        formWrap.querySelector("#app-error").classList.add("hidden");
        form.querySelectorAll("input, select, textarea").forEach((x) => (x.disabled = true));
        formWrap.querySelectorAll(".chip").forEach((x) => (x.disabled = true));
        resolve(d);
      });
    });
    state.application = Object.assign({}, data);
    logEvent("application_submitted", {});

    // Bridge offers to polish the "why" answer (reliability shows up here too).
    let polished = "";
    try {
      polished = (await post(pPath("polish"), { answers: data })).text;
    } catch (e) {
      polished = "";
    }
    if (polished) {
      await speak(stream, state.config.game.decisions.use_polish.prompt);
      show(
        stream,
        `<div class="compare">
          <div class="ver mine"><span class="lbl">✍️ Your version</span>${esc(data.why)}</div>
          <div class="ver ai"><span class="lbl">✨ Bridge's version</span>${esc(polished)}</div>
        </div>`
      );
      const r = await choose(stream, "use_polish");
      if (r.value === "trust") {
        state.application.why = polished;
        await speak(stream, "Done — I've swapped in my version.");
      } else {
        await speak(stream, "Sure thing — your own words it is.");
      }
    }

    // Let Bridge send it, or review first.
    await speak(stream, state.config.game.decisions.auto_submit.prompt);
    const sub = await choose(stream, "auto_submit");
    if (sub.value === "distrust") {
      const a = state.application;
      show(
        stream,
        `<div class="review-sheet">
          <div><b>Name:</b> ${esc(a.name || "—")}</div>
          <div><b>Experience:</b> ${esc(a.experience)}</div>
          <div><b>Skills:</b> ${esc(a.skills)}</div>
          <div><b>Start date:</b> ${esc(a.start_date)} · <b>Days per week:</b> ${esc(a.days_per_week)}</div>
          <div><b>Why:</b> ${esc(a.why)}</div>
        </div>`
      );
      await nextButton(stream, "Looks good — send it ▶", "mint");
    }

    // Usefulness LOW adds friction: a clunky confirmation dialog.
    if (friction) {
      let ok = window.confirm("Please confirm your details are correct. Incomplete or incorrect forms must be re-entered.");
      while (!ok) {
        await nextButton(stream, "Submit application");
        ok = window.confirm("Please confirm your details are correct. Incomplete or incorrect forms must be re-entered.");
      }
    }
    await speak(stream, "Application sent! 🚀 Next stop: a quick confidence check.");
    await nextButton(stream, "Onward ▶");
    advance("workshop");
  };

  // ---- Level: Confidence Check (tokens) ------------------------------------
  LEVEL_FN.tokens = async function () {
    const stream = scene("tokens");
    const def = state.config.game.decisions.confidence_tokens;
    await speak(stream, def.prompt);
    const wrap = show(
      stream,
      `<div class="token-question">${esc(def.question)}</div>
       <div class="tokens-row">${Array.from({ length: def.max }, (_, i) => `<button class="coin" data-n="${i + 1}" aria-label="${i + 1} out of ${def.max}">${i + 1}</button>`).join("")}</div>
       <div class="token-scale"><span>◀ Fewer tokens = ${esc(def.minLabel.toLowerCase())}</span><span>More tokens = ${esc(def.maxLabel.toLowerCase())} ▶</span></div>
       <div class="token-count" id="tc">Tap a coin to choose 1–${def.max}</div>
       <button class="btn-ghost zero-btn" id="zero">Give 0 tokens (${esc(def.minLabel.toLowerCase())})</button>
       <div class="actions center"><button class="btn-game coral" id="lock" disabled>Lock it in ▶</button></div>`
    );
    let n = null;
    const coins = Array.from(wrap.querySelectorAll(".coin"));
    const word = (v) => (v === 0 ? def.minLabel : v === def.max ? def.maxLabel : v <= 3 ? "Not very confident" : v <= 6 ? "Somewhat confident" : "Very confident");
    const set = (v) => {
      n = v;
      coins.forEach((c, i) => c.classList.toggle("on", i < v));
      wrap.querySelector("#tc").textContent = `${v} / ${def.max} tokens: ${word(v)}`;
      wrap.querySelector("#lock").disabled = false;
    };
    coins.forEach((c) => c.addEventListener("click", () => set(Number(c.dataset.n))));
    wrap.querySelector("#zero").addEventListener("click", () => set(0));
    await new Promise((resolve) => wrap.querySelector("#lock").addEventListener("click", resolve, { once: true }));
    wrap.querySelectorAll("button").forEach((b) => (b.disabled = true));
    recordDecision("confidence_tokens", n, null);
    await speak(stream, "Thank you! Now… the moment of truth. 🔮");
    await nextButton(stream, "Enter the Screening Chamber ▶");
    advance("tokens");
  };

  // ---- Level: Screening Chamber (result reveal) ----------------------------
  LEVEL_FN.chamber = async function () {
    const stream = scene("chamber");
    const use = content("usefulness");
    const acc = content("accountability");
    const hitl = content("hitl");
    if (hitl.collaborativePrompts) {
      await collabConfirm(
        stream,
        "Welcome to the Screening Chamber. Before I run your screening, let's do this together — I'll only go ahead when you're happy. Ready?",
        "Yes, let's do it together ▶"
      );
      await speak(stream, "Great — reviewing your application now…");
    } else {
      await speak(stream, "Welcome to the Screening Chamber. Hold tight — I'm reviewing your application now…");
    }

    const anim = show(stream, `<div class="analysing"><div class="orb">🔮</div><div class="phase" id="phase">Reading your experience…</div></div>`);
    const phases = ["Reading your experience…", "Matching your skills to the role…", "Checking your availability…", "Making a decision…"];
    const duration = use.friction ? 4800 : 2600;
    let pi = 0;
    const phaseTimer = setInterval(() => {
      pi = Math.min(pi + 1, phases.length - 1);
      const ph = anim.querySelector("#phase");
      if (ph) ph.textContent = phases[pi];
    }, duration / phases.length);

    let assessment = null;
    for (let attempt = 0; attempt < 3 && !assessment; attempt++) {
      try {
        const [resp] = await Promise.all([post(pPath("interaction"), { answers: state.application }), sleep(attempt === 0 ? duration : 800)]);
        assessment = resp.assessment;
      } catch (e) {
        await sleep(800);
      }
    }
    clearInterval(phaseTimer);
    anim.remove();
    if (!assessment) {
      show(stream, `<div class="notice warn">Something went wrong while reviewing your application. Please refresh the page to try again.</div>`);
      return;
    }
    state.assessment = assessment;
    logEvent("assessment_viewed", { reliability: state.condition.reliability, outcome: assessment.decision, hallucinated: assessment.hallucinated });

    const ring = assessment.advanced ? "var(--ok)" : "var(--warn)";
    const hero = show(
      stream,
      `<div class="result-hero">
        <div class="re">${assessment.decisionEmoji}</div>
        <h2>${esc(assessment.decisionLabel)}</h2>
        <p class="muted" style="margin:0">${esc(assessment.decisionSub)}</p>
        <div class="score-ring">
          <div class="score-badge" style="--pct:0; --ring:${ring}"><div class="inner">0</div></div>
          <div class="score-caption" style="text-align:left">AI match score<br/>out of 100</div>
        </div>
      </div>`
    );
    countUp(hero.querySelector(".score-badge"), hero.querySelector(".inner"), assessment.score, 1000);
    if (assessment.advanced) launchConfetti();

    await sleep(500);
    await speak(stream, assessment.message);
    show(
      stream,
      `<h3>Highlights</h3>
       <ul class="highlights">${assessment.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
       <p class="small muted">${esc(assessment.rationale)}</p>
       ${hitl.oversightNotice ? `<div class="notice info">👩‍💼 ${esc(hitl.oversightNotice)}</div>` : ""}
       ${acc.statement ? `<div class="notice info">⚖️ ${esc(acc.statement)}${acc.showAppeal ? `<br/><span class="small">${esc(acc.appealText)}</span>` : ""}</div>` : ""}
       ${content("support").showWidget ? '<button class="support-inline" data-support="result">💬 Something not right with this result? Tell us</button>' : ""}`
    );
    const inline = stream.querySelector('[data-support="result"]');
    if (inline) inline.addEventListener("click", () => openSupport("result"));
    await nextButton(stream, "Continue ▶");
    advance("chamber");
  };

  function countUp(badge, label, target, ms) {
    if (REDUCED) {
      badge.style.setProperty("--pct", target);
      label.textContent = target;
      return;
    }
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min((t - t0) / ms, 1);
      const v = Math.round(target * (1 - Math.pow(1 - p, 3)));
      badge.style.setProperty("--pct", v);
      label.textContent = v;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---- Level: The Crossroads (human review, HITL on only) ------------------
  LEVEL_FN.crossroads = async function () {
    const stream = scene("crossroads");
    await speak(stream, state.config.game.decisions.accept_result.prompt);
    const r = await choose(stream, "accept_result");
    if (r.value === "distrust") {
      await speak(stream, "No problem! A human recruiter at Northwind will review your application too. 👩‍💼");
    } else {
      await speak(stream, state.assessment && state.assessment.advanced ? "Brilliant — on to the next stage!" : "Understood — thanks for hearing me out.");
    }
    await nextButton(stream, "Continue ▶");
    advance("crossroads");
  };

  // ---- Level: Next Steps (follow advice + keep profile) --------------------
  LEVEL_FN.next = async function () {
    const stream = scene("next");
    const a = state.assessment || { decision: "advanced", nextSteps: [] };
    const def = state.config.game.decisions.follow_plan;
    const v = def.byOutcome[a.decision] || def.byOutcome.advanced;

    await speak(stream, v.prompt);
    const r = await choose(stream, "follow_plan", { cardTitle: v.cardTitle, trustLabel: v.trustLabel, distrustLabel: v.distrustLabel });
    if (r.value === "trust") {
      show(
        stream,
        `<div class="plan-scroll">
          <h3>${a.decision === "advanced" ? "📜 Your interview prep plan" : "📜 Tips for next time"}</h3>
          <ol>${(a.nextSteps || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
        </div>`
      );
      await sleep(600);
    } else {
      await speak(stream, "No problem — you know yourself best!");
    }

    await speak(stream, state.config.game.decisions.keep_profile.prompt);
    const k = await choose(stream, "keep_profile");
    await speak(stream, k.value === "trust" ? "Thanks! I'll keep it safe for future roles." : "Done — I'll delete it after this.");
    await speak(stream, "That's the end of your job quest with me. Sam from the research team is waiting in the Research Lounge to hear how it went. Bye for now! 👋");
    await nextButton(stream, "To the Research Lounge ▶");
    advance("next");
  };

  // ---- Level: Research Lounge (questionnaire) ------------------------------
  LEVEL_FN.lounge = async function () {
    const stream = scene("lounge");
    await speak(stream, `Welcome to the Research Lounge, ${state.avatar}! ☕ Bridge isn't here, so please be completely honest. There are no right or wrong answers, just a few short packs of questions.`, "host");

    const survey = state.config.postSurvey;
    const byId = Object.fromEntries(survey.sections.map((s) => [s.id, s]));
    const listed = new Set(PAGE_GROUPS.flat());
    const pages = PAGE_GROUPS.map((g) => g.map((id) => byId[id]).filter(Boolean)).filter((p) => p.length);
    const leftovers = survey.sections.filter((s) => !listed.has(s.id));
    if (leftovers.length) pages[pages.length - 1] = pages[pages.length - 1].concat(leftovers);

    const answers = {};
    const holder = show(stream, `<div id="pack"></div>`);
    let pageIndex = 0;

    const renderPage = () => {
      const secs = pages[pageIndex];
      const last = pageIndex === pages.length - 1;
      holder.innerHTML = `
        <div class="pack-progress">${pages.map((_, i) => `<span class="${i < pageIndex ? "done" : i === pageIndex ? "active" : ""}"></span>`).join("")}</div>
        <p class="small muted" style="margin-top:-8px">Question pack ${pageIndex + 1} of ${pages.length}</p>
        <form id="pack-form">${secs.map((sec) => `<div class="section-block"><div class="section-title">${esc(sec.title)}</div>${sec.items.map(renderItem).join("")}</div>`).join("")}</form>
        <div class="error-text hidden" id="pack-error">Please answer the highlighted question.</div>
        <div class="actions">
          ${pageIndex > 0 ? '<button class="btn-ghost" id="pack-back">◀ Back</button>' : ""}
          <button class="btn-game ${last ? "coral" : ""}" id="pack-next">${last ? "Finish & see my Trust Profile 🏆" : "Next pack ▶"}</button>
        </div>`;
      const form = holder.querySelector("#pack-form");
      prefill(form, answers);
      form.addEventListener("change", () => holder.querySelector("#pack-error").classList.add("hidden"));
      scrollTo(holder, "start");
      const back = holder.querySelector("#pack-back");
      if (back)
        back.addEventListener("click", () => {
          Object.assign(answers, collectAnswers(form, secs.flatMap((s) => s.items), true).answers);
          pageIndex--;
          renderPage();
        });
      const nextBtn = holder.querySelector("#pack-next");
      nextBtn.addEventListener("click", async () => {
        const items = secs.flatMap((s) => s.items);
        const res = collectAnswers(form, items);
        if (res.firstMissing) {
          holder.querySelector("#pack-error").classList.remove("hidden");
          focusMissing(form, res.firstMissing);
          return;
        }
        items.forEach((it) => delete answers[it.id]);
        Object.assign(answers, res.answers);
        if (!last) {
          pageIndex++;
          renderPage();
          return;
        }
        nextBtn.disabled = true;
        nextBtn.textContent = "Saving…";
        try {
          await post(pPath("post"), { answers });
        } catch (e) {
          try {
            localStorage.setItem("pending_post_" + state.participantId, JSON.stringify(answers));
          } catch (_) {}
        }
        advance("lounge");
      });
    };
    renderPage();
  };

  function prefill(form, answers) {
    Object.entries(answers).forEach(([id, val]) => {
      const radio = form.querySelector(`input[name="${id}"][value="${CSS.escape(String(val))}"]`);
      if (radio) radio.checked = true;
      const ta = form.querySelector(`textarea[name="${id}"]`);
      if (ta) ta.value = val;
    });
  }

  // ---- Finale: Trust Profile + debrief -------------------------------------
  LEVEL_FN.finale = async function () {
    const stream = scene("finale");
    hideSupportWidget();
    await speak(stream, "Thank you! Now a little surprise: every choice you made in the game said something about how you trust AI. Here's your Trust Profile!", "host");

    let result = null;
    try {
      result = await api(pPath("game-result"));
    } catch (e) {
      result = null;
    }

    if (result && result.score != null) {
      const C = 2 * Math.PI * 52;
      const card = show(
        stream,
        `<div class="finale">
          <div class="big-gauge">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b4bff"/><stop offset="1" stop-color="#ff5ca8"/></linearGradient></defs>
              <circle cx="60" cy="60" r="52" fill="none" stroke="#ebe9f7" stroke-width="12"/>
              <circle class="arc" cx="60" cy="60" r="52" fill="none" stroke="url(#gg)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}"/>
            </svg>
            <div class="val"><div><div class="num">0</div><div class="lbl">Trust score</div></div></div>
          </div>
          ${
            result.archetype
              ? `<div class="archetype"><div class="ae">${result.archetype.emoji}</div><div class="at">${esc(result.archetype.title)}</div><div>${esc(result.archetype.text)}</div></div>`
              : ""
          }
          <h3>How your score was made</h3>
          <ul class="breakdown">${result.breakdown
            .map((b) => {
              const cls = b.points > 0 ? "up" : b.points < 0 ? "down" : "zero";
              const icon = b.points > 0 ? "✅" : b.points < 0 ? "✋" : "➖";
              const pts = b.points > 0 ? `+${b.points}` : b.points < 0 ? `−${Math.abs(b.points)}` : "0";
              return `<li><span>${icon} ${esc(b.summary)}</span><span class="pts ${cls}">${pts}</span></li>`;
            })
            .join("")}</ul>
          <p class="small muted">There's no right or wrong score — people trust AI in very different ways.</p>
        </div>`
      );
      animateGauge(card.querySelector(".arc"), card.querySelector(".num"), result.score, C);
      launchConfetti();
    }

    show(
      stream,
      `<div class="notice info debrief">
        <strong>What was this study about?</strong><br/>
        We're studying what makes people trust — or not trust — AI in hiring. The company, the job and Bridge were all simulated.
        <strong>Your screening result was assigned at random</strong>, so it says nothing about you or your answers.
        Some versions of Bridge were deliberately designed to make mistakes, so we can see how that affects trust.
        During the game, some of your choices (like sharing data or accepting Bridge's suggestions) were used to calculate your Trust Score.
        <br/><br/>Thank you so much for taking part! 💜 You can now close this window.
      </div>`
    );
    logEvent("study_completed", {});
  };

  function animateGauge(arc, num, score, C) {
    if (REDUCED) {
      arc.style.strokeDashoffset = C * (1 - score / 100);
      num.textContent = score;
      return;
    }
    const t0 = performance.now();
    const ms = 1600;
    const step = (t) => {
      const p = Math.min((t - t0) / ms, 1);
      const v = score * (1 - Math.pow(1 - p, 3));
      arc.style.strokeDashoffset = C * (1 - v / 100);
      num.textContent = Math.round(v);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function launchConfetti() {
    if (REDUCED) return;
    const colors = ["#5b4bff", "#ff7a59", "#16c088", "#ffc93c", "#ff5ca8", "#3db8ff"];
    const layer = document.createElement("div");
    layer.className = "confetti-layer";
    document.body.appendChild(layer);
    for (let i = 0; i < 110; i++) {
      const c = document.createElement("div");
      c.className = "confetti";
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = Math.random() * 0.7 + "s";
      c.style.animationDuration = 2.2 + Math.random() * 1.6 + "s";
      layer.appendChild(c);
    }
    setTimeout(() => layer.remove(), 4800);
  }

  // ---- survey items ---------------------------------------------------------
  function renderItem(item) {
    if (item.type === "likert7") {
      const scale = item.scale || { min: 1, max: 7, minLabel: "Strongly disagree", maxLabel: "Strongly agree" };
      let opts = "";
      for (let v = scale.min; v <= scale.max; v++) {
        opts += `<label class="likert-opt"><input type="radio" name="${item.id}" value="${v}" /><span class="num">${v}</span></label>`;
      }
      return `<div class="q-item" data-item="${item.id}">
        <label class="q">${esc(item.label)}</label>
        <div class="likert"><div class="likert-scale">${opts}</div>
        <div class="likert-ends"><span>${esc(scale.minLabel)}</span><span>${esc(scale.maxLabel)}</span></div></div>
      </div>`;
    }
    if (item.type === "single") {
      const opts = item.options.map((o) => `<label class="option"><input type="radio" name="${item.id}" value="${esc(o.value)}" /> ${esc(o.label)}</label>`).join("");
      return `<div class="q-item field" data-item="${item.id}">
        <label class="q">${esc(item.label)}${item.required ? ' <span class="required-star">*</span>' : ""}</label>
        <div class="options">${opts}</div>
      </div>`;
    }
    if (item.type === "text") {
      return `<div class="q-item field" data-item="${item.id}">
        <label class="q">${esc(item.label)}${item.required ? ' <span class="required-star">*</span>' : ""}</label>
        <textarea name="${item.id}" rows="${item.required ? 1 : 3}" placeholder="${esc(item.placeholder || "")}"></textarea>
      </div>`;
    }
    return "";
  }

  // Likert items are always required; single/text only when required:true, so
  // optional free-text boxes never block submission.
  function collectAnswers(form, items, lenient) {
    const answers = {};
    let firstMissing = null;
    items.forEach((item) => {
      const isRequired = item.type === "likert7" || item.required === true;
      let val;
      if (item.type === "text") {
        const t = form.querySelector(`[name="${item.id}"]`);
        val = t ? t.value.trim() : "";
      } else {
        const checked = form.querySelector(`[name="${item.id}"]:checked`);
        val = checked ? checked.value : "";
      }
      if (!lenient && isRequired && !val && firstMissing === null) firstMissing = item.id;
      if (val !== "") answers[item.id] = val;
    });
    return firstMissing ? { firstMissing } : { answers };
  }

  function focusMissing(form, itemId) {
    const q = form.querySelector(`.q-item[data-item="${itemId}"]`);
    if (!q) return;
    q.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "center" });
    q.classList.remove("missing");
    void q.offsetWidth;
    q.classList.add("missing");
    setTimeout(() => q.classList.remove("missing"), 2600);
  }

  // ---- support widget (H8) -------------------------------------------------
  let supportCategory = null;
  let tipTimer = null;

  function setupSupportWidget() {
    const sup = content("support");
    const btn = document.getElementById("support-btn");
    const modal = document.getElementById("support-modal");
    const text = document.getElementById("support-text");
    const hint = document.getElementById("support-hint");
    const cats = Array.from(document.querySelectorAll("#support-cats .chip"));
    if (!sup.showWidget) return;
    btn.classList.remove("hidden");
    btn.innerHTML = `<span>${esc(sup.buttonText)}</span>`;
    btn.addEventListener("click", () => openSupport("floating_button"));
    document.getElementById("support-tip-close").addEventListener("click", hideTip);

    cats.forEach((c) =>
      c.addEventListener("click", () => {
        supportCategory = c.dataset.cat;
        cats.forEach((x) => x.classList.toggle("added", x === c));
        hint.classList.add("hidden");
      })
    );
    const close = () => modal.classList.add("hidden");
    document.getElementById("support-cancel").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.classList.contains("hidden")) close(); });

    document.getElementById("support-send").addEventListener("click", () => {
      const txt = text.value.trim();
      if (!txt && !supportCategory) {
        hint.classList.remove("hidden");
        return;
      }
      const ticket = Math.floor(1000 + Math.random() * 9000);
      const confirmEl = document.getElementById("support-confirm");
      confirmEl.textContent = sup.confirmation.replace("{{ticket}}", ticket);
      confirmEl.classList.remove("hidden");
      logEvent("support_submitted", { category: supportCategory, message: txt.slice(0, 2000), length: txt.length, ticket, level: state.currentLevel });
      setTimeout(() => {
        close();
        confirmEl.classList.add("hidden");
        text.value = "";
        supportCategory = null;
        cats.forEach((x) => x.classList.remove("added"));
      }, 2400);
    });
  }

  function openSupport(source) {
    hideTip();
    document.getElementById("support-modal").classList.remove("hidden");
    document.getElementById("support-hint").classList.add("hidden");
    logEvent("support_opened", { level: state.currentLevel, source });
    setTimeout(() => document.getElementById("support-text").focus(), 50);
  }

  // Draws attention to the help button the first time it matters (Tower level).
  function introduceSupport() {
    const btn = document.getElementById("support-btn");
    btn.classList.remove("attention");
    void btn.offsetWidth;
    btn.classList.add("attention");
    document.getElementById("support-tip").classList.remove("hidden");
    clearTimeout(tipTimer);
    tipTimer = setTimeout(hideTip, 10000);
  }
  function hideTip() {
    clearTimeout(tipTimer);
    document.getElementById("support-tip").classList.add("hidden");
  }

  function hideSupportWidget() {
    hideTip();
    document.getElementById("support-btn").classList.add("hidden");
    document.getElementById("support-modal").classList.add("hidden");
  }

  boot();
})();
