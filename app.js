import { supabase } from "./supabaseClient.js";
import { calculateLevelFromXP, getXPProgressInLevel } from "./js/progression.js";
import { playSound } from "./js/audio.js";
import { ALL_SLOTS, SLOT_Z, baseLayersFor, baseSrcFor, hairSrcFor, isAvatarV2, r2ExpressionOverlayAllowedFor, blinkConfigFor } from "./js/avatar-layers.js";
// D-195: the framing flag is read through a NAMESPACE import. A named import of an export the served
// avatar-layers.js lacks (an older cached copy during a deploy) is a module SyntaxError that would stop
// this whole script; through the namespace a missing export is just undefined → framing stays off.
import * as avatarLayersModule from "./js/avatar-layers.js";
import { mountC2Avatar, c2CosmeticLayers, markAvatarRendered } from "./js/avatar-render-c2.js";
import { ExpressionEngine } from "./js/avatar-expression-engine.js";
import { PresenceEngine } from "./js/avatar-presence-engine.js";
import { BlinkEngine } from "./js/avatar-blink-engine.js";
import { initMonitoring, captureError } from "./js/sentry.js";
import { attachOcrControl } from "./js/ocr/adapters/answer-capture.js";
import { prepareChoiceOptions } from "./js/answer-options.js";
import { ANSWER_RENDERERS, resolveAnswerRenderer, buildShortTextAnswer, shortTextCorrection } from "./js/answer-input.js";
import { initAnalytics, track } from "./js/analytics.js";
import { maybeShowConsentBanner } from "./js/analytics-consent.js";
import { attachReadAloudControl, attachOptionReadAloudControl, stopReadAloud } from "./js/read-aloud/adapters/quiz.js";
import { installFlagDiagnostics } from "./js/flags.js";

window.__sb = supabase;

// Feature-flag diagnostics (157R). Read-only; exposes window.__flags() for ops. Fail-soft.
installFlagDiagnostics();

// Error monitoring (157B). No-op unless ENABLE_SENTRY + a DSN are configured; fail-soft.
initMonitoring({ tags: { avatar_v2: isAvatarV2() } });

// Analytics (157D/157E). No-op unless enabled + consented; banner only when configured. Fail-soft.
initAnalytics();
maybeShowConsentBanner();

const DEBUG = true;
const GRADE_START_BAND = { 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 2, 9: 3 };
let uiState = "IDLE";

function logEvent(event, payload = {}) {
  if (!DEBUG) return;
  console.log("[APP EVENT]", {
    timestamp: new Date().toISOString(),
    state: uiState,
    event,
    ...payload
  });
}

function logError(event, error) {
  console.error("[APP ERROR]", {
    timestamp: new Date().toISOString(),
    state: uiState,
    event,
    error
  });
  // 157B: additively forward to error monitoring. No-op when disabled; never throws.
  captureError(event, error, { state: uiState });
}

const UI_STATES = {
  IDLE: "IDLE",
  LOADING_QUESTION: "LOADING_QUESTION",
  AWAITING_ANSWER: "AWAITING_ANSWER",
  SUBMITTING_ANSWER: "SUBMITTING_ANSWER",
  REFLECTING: "REFLECTING",
  TRANSITIONING: "TRANSITIONING"
};

function setState(newState) {
  const allowed = {
    IDLE: ["LOADING_QUESTION"],
    LOADING_QUESTION: ["AWAITING_ANSWER"],
    AWAITING_ANSWER: ["SUBMITTING_ANSWER"],
    SUBMITTING_ANSWER: ["TRANSITIONING", "AWAITING_ANSWER", "REFLECTING"],
    REFLECTING: ["TRANSITIONING"],
    TRANSITIONING: ["LOADING_QUESTION"]
  };

  if (!allowed[uiState]?.includes(newState)) {
    logError("INVALID_STATE_TRANSITION", { from: uiState, to: newState });
    return;
  }

  uiState = newState;
  logEvent("STATE_CHANGED", { to: newState });
  exprEngine?.onStateChange(newState);
  presenceEngine?.onStateChange(newState);
  blinkEngine?.onStateChange(newState);
}

function setUIState(newState) {
  setState(newState);

  const map = {
    LOADING_QUESTION: "loading",
    AWAITING_ANSWER: "ready",
    TRANSITIONING: "loading",
    SUBMITTING_ANSWER: "loading",
    REFLECTING: "reflecting"
  };

  const domState = map[newState];
  if (domState) {
    const el = document.getElementById("question");
    if (el) el.dataset.state = domState;
  }
}

let exprEngine    = null;
let presenceEngine = null;
let blinkEngine   = null;

let studentId = null;
let currentInstanceId = null;
let questionShownAt = null;
let lastKnownXp = 0;
let lastKnownCoins = 0;

async function checkAuthAndRole() {
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session) {
    window.location.replace("login.html");
    return false;
  }

  studentId = sessionData.session.user.id;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", studentId)
    .maybeSingle();

  if (error || !profile || profile.role !== "student") {
    await supabase.auth.signOut();
    window.location.replace("login.html");
    return false;
  }

  return true;
}

window.addEventListener("pageshow", async (event) => {
  if (event.persisted) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      window.location.replace("login.html");
    }
  }
});

document.addEventListener("DOMContentLoaded", async () => {

  const authorized = await checkAuthAndRole();
  if (!authorized) return;

  const questionElement = document.getElementById("question");
  const optionsContainer = document.getElementById("options");
  const feedback = document.getElementById("feedback");
  const reviewFeedback = document.getElementById("review-feedback");
  const reflectionContinue = document.getElementById("reflection-continue");
  const levelEl = document.getElementById("level");
  const xpEl = document.getElementById("xp");
  const coinsEl = document.getElementById("coins");
  const logoutBtn = document.getElementById("logout-btn");

  logoutBtn.onclick = async () => {
    await supabase.auth.signOut();
    window.location.replace("login.html");
  };

  // Hidden achievement tracking — session-scoped, resets on page load.
  let sessionCorrectStreak = 0;
  let bestSessionStreak    = 0;

  // Challenge-wave state machine — session-scoped, drives adaptive sequencing.
  // Resets on page load. No persistent student state — purely local pacing.
  let sessionWavePhase = 'challenge';
  let sessionConsecutiveCorrect = 0;
  let sessionConsecutiveIncorrect = 0;
  let lastMisconceptionType = null;
  // Renderer of the question on screen — "stav til" feedback names the spelling (see submitAnswer).
  let currentRenderer = null;

  // Session rhythm tracking — Section 55.
  // sessionQuestionCount: total answered this session, passed to get-next-question.
  // sessionConsecutiveReflections: consecutive reflection states entered;
  //   gate fires at >= 2 to prevent reflection fatigue in losing streaks.
  let sessionQuestionCount = 0;
  let sessionConsecutiveReflections = 0;

  // Grade + adaptive difficulty state — Section 70.
  let selectedGrade = null;
  let currentDifficultyBand = 2;
  let placementBand = null;  // one-time assessment result, never overwritten
  let persistedBand = null;  // earned level, updated every 10 questions
  let activeDomains = null;  // teacher-assigned domain filter (null = all domains)

  // Subject (fag) chosen on spil.html via ?fag=historie|engelsk|dansk. Unknown/missing = historie.
  const SUBJECT_LABEL = { engelsk: "Engelsk", dansk: "Dansk" };
  const fagParam = new URLSearchParams(window.location.search).get("fag");
  const currentSubject = fagParam === "engelsk" ? "engelsk"
    : fagParam === "dansk" ? "dansk"
    : "historie";
  let diffConsecutiveCorrect = 0;
  let diffConsecutiveIncorrect = 0;

  function updateWavePhase(wasCorrect) {
    if (wasCorrect) {
      sessionConsecutiveIncorrect = 0;
      sessionConsecutiveCorrect++;
      if (sessionWavePhase === 'recovery' && sessionConsecutiveCorrect >= 3) {
        sessionWavePhase = 'challenge';
        sessionConsecutiveCorrect = 0;
      } else if (sessionWavePhase === 'reinforcement' && sessionConsecutiveCorrect >= 2) {
        sessionWavePhase = 'challenge';
        sessionConsecutiveCorrect = 0;
      } else if (sessionWavePhase === 'challenge' && sessionConsecutiveCorrect >= 4) {
        sessionWavePhase = 'deep_challenge';
      }
    } else {
      sessionConsecutiveCorrect = 0;
      sessionConsecutiveIncorrect++;
      if (sessionConsecutiveIncorrect >= 2) {
        sessionWavePhase = 'recovery';
      } else if (sessionWavePhase === 'deep_challenge' || sessionWavePhase === 'challenge') {
        sessionWavePhase = 'reinforcement';
      }
    }
    logEvent('WAVE_PHASE', { phase: sessionWavePhase, cc: sessionConsecutiveCorrect, ci: sessionConsecutiveIncorrect });
  }

  function adjustDifficultyBand(wasCorrect) {
    if (wasCorrect) {
      diffConsecutiveIncorrect = 0;
      diffConsecutiveCorrect++;
      if (diffConsecutiveCorrect >= 3 && currentDifficultyBand < 5) {
        currentDifficultyBand++;
        diffConsecutiveCorrect = 0;
        logEvent("DIFFICULTY_BAND_UP", { band: currentDifficultyBand });
      }
    } else {
      diffConsecutiveCorrect = 0;
      diffConsecutiveIncorrect++;
      if (diffConsecutiveIncorrect >= 2 && currentDifficultyBand > 1) {
        currentDifficultyBand--;
        diffConsecutiveIncorrect = 0;
        logEvent("DIFFICULTY_BAND_DOWN", { band: currentDifficultyBand });
      }
    }
  }

  // ── Placement assessment system ────────────────────────────────────────
  // Runs once on first login after grade selection: 10 questions across bands 1-4
  // (no XP, no question_instances created) seed the starting difficulty.
  // SERVER-OWNED (answer keys server-side, E1): start_placement() picks the questions and
  // returns display data only — never the answer — and submit_placement() grades the chosen
  // answers once, writes profiles.placement_band and returns only the band. The browser
  // never reads the questions table and never sees or stores a key.

  async function loadAdaptiveBands() {
    const { data } = await supabase
      .from("profiles")
      .select("placement_band, current_band")
      .eq("id", studentId)
      .maybeSingle();
    placementBand = data?.placement_band ?? null;
    persistedBand = data?.current_band ?? null;
  }

  // The placement set for this pupil, chosen server-side (3 band-1, 3 band-2, 2 band-3, 2 band-4;
  // history MC within the pupil's grade). An open session is reused, so a refresh shows the same
  // questions. Each item is { id, question, options, difficulty_band } — display data only.
  async function fetchPlacementQuestions() {
    const { data, error } = await supabase.rpc("start_placement");
    if (error) {
      logError("PLACEMENT_START_ERROR", error);
      return [];
    }
    if (!Array.isArray(data)) return [];
    return data.filter((q) =>
      q && typeof q.id === "string"
      && typeof q.question === "string" && q.question.trim().length > 0
      && Array.isArray(q.options) && q.options.length >= 2);
  }

  // Grades the chosen answers server-side (once per session) and returns the band 1-4, or null.
  // The old browser-side scoring rule (band N correct = N points; >= 18/12/6 → 4/3/2, else 1)
  // lives unchanged in submit_placement, which also writes profiles.placement_band.
  async function submitPlacement(answers) {
    const { data, error } = await supabase.rpc("submit_placement", { p_answers: answers });
    if (error) {
      logError("PLACEMENT_SUBMIT_ERROR", error);
      return null;
    }
    return Number.isInteger(data) && data >= 1 && data <= 4 ? data : null;
  }

  // Persist the adaptive engine's current band to profiles.current_band.
  // Called every 10 answered questions (fire-and-forget — non-blocking).
  // On next login, current_band takes priority over placement_band so the
  // student resumes at their earned level rather than their initial placement.
  function persistCurrentBand() {
    supabase
      .from("profiles")
      .update({ current_band: currentDifficultyBand })
      .eq("id", studentId)
      .then(({ error }) => {
        if (error) logError("PERSIST_BAND_ERROR", error);
        else logEvent("BAND_PERSISTED", { band: currentDifficultyBand, after_q: sessionQuestionCount });
      });
  }

  async function runPlacementFlow() {
    return new Promise(async (resolve) => {
      const overlay    = document.getElementById("placement-overlay");
      const questionEl = document.getElementById("placement-question");
      const optionsEl  = document.getElementById("placement-options");
      const progressBar = document.getElementById("placement-progress-bar");
      const countEl    = document.getElementById("placement-count");

      if (!overlay || !questionEl || !optionsEl || !progressBar || !countEl) {
        resolve();
        return;
      }

      const questions = await fetchPlacementQuestions();

      if (!questions || questions.length < 5) {
        logEvent("PLACEMENT_SKIPPED", { reason: "insufficient_questions", count: questions?.length ?? 0 });
        resolve();
        return;
      }

      overlay.style.display = "flex";

      // Only what the pupil chose — never a verdict; the server grades.
      const answers = [];
      const total = questions.length;

      for (let i = 0; i < total; i++) {
        const q = questions[i];

        const questionText = q.question;

        progressBar.style.width = ((i / total) * 100) + "%";
        countEl.textContent = (i + 1) + " / " + total;
        stopReadAloud();
        questionEl.textContent = questionText;
        attachReadAloudControl(questionEl, questionText);

        const options = [...q.options].sort(() => Math.random() - 0.5);

        optionsEl.innerHTML = "";

        const chosen = await new Promise((resolveAnswer) => {
          options.forEach((opt) => {
            const row = document.createElement("div");
            row.className = "option-row";
            const btn = document.createElement("button");
            btn.className = "placement-option-btn";
            btn.textContent = opt;
            btn.onclick = () => {
              optionsEl.querySelectorAll(".placement-option-btn").forEach((b) => { b.disabled = true; });
              btn.classList.add("placement-selected");
              setTimeout(() => resolveAnswer(opt), 500);
            };
            row.appendChild(btn);
            attachOptionReadAloudControl(row, typeof opt === "string" ? opt : "");
            optionsEl.appendChild(row);
          });
        });

        answers.push({ question_id: q.id, answer: chosen });
      }

      progressBar.style.width = "100%";

      const band = await submitPlacement(answers);
      stopReadAloud();
      optionsEl.innerHTML = "";
      countEl.textContent = "";

      if (band === null) {
        // Fail loud, not stuck: the pupil starts at the grade's default band and placement is
        // offered again on the next login (the open server session is reused).
        logEvent("PLACEMENT_SUBMIT_FAILED", { answered: answers.length });
        questionEl.textContent = "Vi kunne ikke gemme dit udgangspunkt — du starter på dit klassetrin.";
      } else {
        placementBand = band;
        logEvent("PLACEMENT_COMPLETE", { band, answered: answers.length });
        questionEl.textContent = "Klar! Vi starter dig det rigtige sted.";
      }

      await new Promise((r) => setTimeout(r, 1100));
      overlay.style.display = "none";
      resolve();
    });
  }

  // ── End placement system ───────────────────────────────────────────────

  // Load teacher-assigned domain filter and update the domain focus indicator.
  const DOMAIN_LABEL = {
    prehistoric_denmark:   "Forhistorisk Danmark",
    vikings:               "Vikingerne",
    middle_ages:           "Middelalderen",
    reformation_monarchy:  "Reformation & Monarki",
    enlightenment:         "Oplysningstiden",
    revolutions_democracy: "Revolutioner & Demokrati",
    industrialisation:     "Industrialisering",
    world_war_1:           "1. Verdenskrig",
    world_war_2:           "2. Verdenskrig",
    cold_war:              "Den Kolde Krig",
    democracy_power:       "Demokrati & Magt",
    english:               "Engelsk",
    danish:                "Dansk",
  };

  async function loadActiveDomains() {
    const { data } = await supabase
      .from("profiles")
      .select("active_domains")
      .eq("id", studentId)
      .maybeSingle();

    const raw = data?.active_domains ?? null;
    activeDomains = Array.isArray(raw) && raw.length > 0 ? raw : null;

    const bar  = document.getElementById("domain-focus-bar");
    const text = document.getElementById("domain-focus-text");
    if (!bar || !text) return;

    if (currentSubject === "engelsk" || currentSubject === "dansk") {
      // Teacher's history learning journey does not apply to English or Danish.
      text.textContent = "Fag: " + SUBJECT_LABEL[currentSubject];
      bar.style.display = "block";
    } else if (activeDomains !== null) {
      const names = activeDomains.map(d => DOMAIN_LABEL[d] ?? d).join("  ·  ");
      text.textContent = "Læringsrejse: " + names;
      bar.style.display = "block";
    } else {
      bar.style.display = "none";
    }
  }

  async function fetchProgress() {
    const { data } = await supabase
      .from("student_progress")
      .select("*")
      .eq("student_id", studentId)
      .maybeSingle();

    if (data) {
      lastKnownXp = data.xp ?? 0;
      lastKnownCoins = data.coins ?? 0;

      const { level, progress } = getXPProgressInLevel(lastKnownXp);

      xpEl.textContent = lastKnownXp;
      coinsEl.textContent = lastKnownCoins;
      levelEl.textContent = level;

      const xpBar = document.getElementById("xp-bar");
      xpBar.style.width = (progress * 100) + "%";

      logEvent("PROGRESS_FETCHED", { xp: lastKnownXp, level });
    }
  }

  async function fetchAvatar() {
    const avatarDisplay = document.getElementById("avatar-display");
    if (!avatarDisplay) return;

    avatarDisplay.innerHTML = "";

    // Section 155G: C2 render pipeline behind AVATAR_V2 (default OFF). Base + hair
    // via the shared module; cosmetics are deferred to a later C2 section. This
    // function is awaited before the blink engine is created, so the C2 base is
    // present when blink initialises.
    if (isAvatarV2()) {
      const { data: pd } = await supabase
        .from("profiles")
        .select("avatar_identity, equipped_slots")
        .eq("id", studentId)
        .maybeSingle();
      const eqSlots = pd?.equipped_slots ?? {};
      const eqIds = Object.values(eqSlots).filter(Boolean);
      const srcById = {};
      if (eqIds.length > 0) {
        const { data: items } = await supabase
          .from("shop_items")
          .select("id, image_url")
          .in("id", eqIds);
        (items ?? []).forEach(it => { if (it.image_url) srcById[it.id] = it.image_url; });
      }
      const cosmetics = c2CosmeticLayers(eqSlots, id => srcById[id] ?? null);
      // D-195/D-196: shared upper-body framing, only with the flag (default OFF → no class) and only when
      // no wide-slot item (wings, capes) is mounted. Decided from the cosmetics actually mounted, before
      // any layer mounts. Namespace guard: an older avatar-layers.js without the function → no framing.
      if (typeof avatarLayersModule.avatarFramingOnFor === "function") avatarDisplay.classList.toggle(avatarLayersModule.AVATAR_FRAMING_CLASS, avatarLayersModule.avatarFramingOnFor(Object.fromEntries(cosmetics.map((c) => [c.slot, true]))) === true);
      const renderPath = await mountC2Avatar(avatarDisplay, pd?.avatar_identity ?? null, { layerClass: "quiz-avatar-layer", cosmetics, surface: "quiz" });
      if (renderPath === "aborted") return; // a newer render superseded this one
      // PR D: re-apply the full blink profile (mode + tone) so the lids always
      // match the render path this re-render actually took (R2 active vs C2).
      // F1: key off the ACTUAL mounted path, so an R2 asset-load fallback uses C2 lids.
      if (blinkEngine) blinkEngine.setProfile(blinkConfigFor(pd?.avatar_identity ?? null, renderPath === "r2"));
      // On the FIRST load the expression/blink overlays are attached only after this
      // function is awaited (see the life-engine init below), so the first-load signal
      // is set there. On a later re-render the engines already exist, so mark here once
      // the re-rendered composite has decoded.
      if (exprEngine || blinkEngine) await markAvatarRendered(avatarDisplay);
      return;
    }

    // Identity base (body + hair) always visible — render immediately
    // (no network wait). Section 152B: hair is a separate identity layer.
    let base = null;
    let hairImg = null;
    baseLayersFor(null).forEach(layer => {
      const img = document.createElement("img");
      img.className = layer.isBase
        ? "quiz-avatar-layer avatar-slot-base"
        : "quiz-avatar-layer avatar-slot-hair";
      img.src = layer.src;
      img.style.zIndex = String(layer.z);
      img.alt = "";
      avatarDisplay.appendChild(img);
      if (layer.isBase) base = img;
      else hairImg = img;
    });
    if (!base) return;

    // Load equipped slots + identity from profiles
    const { data: profileData } = await supabase
      .from("profiles")
      .select("equipped_slots, avatar_identity")
      .eq("id", studentId)
      .maybeSingle();

    // Section 152A/152B: resolve base + hair per identity once the profile is
    // loaded. Both resolve to the shared files until 152C — no-op today, so
    // the instant render above stays correct.
    base.src = baseSrcFor(profileData?.avatar_identity ?? null);
    if (hairImg) hairImg.src = hairSrcFor(profileData?.avatar_identity ?? null);
    // Section 152E: align the blink eyelid fill with the resolved skin tone
    // (PR D: via the full profile so mode always matches the render path).
    if (blinkEngine) blinkEngine.setProfile(blinkConfigFor(profileData?.avatar_identity ?? null));

    const equippedSlots = profileData?.equipped_slots ?? {};
    const equippedIds = Object.values(equippedSlots).filter(Boolean);

    if (equippedIds.length === 0) return;

    // Load image_url for each equipped item
    const { data: shopItems } = await supabase
      .from("shop_items")
      .select("id, image_url, slot_type")
      .in("id", equippedIds);

    if (!shopItems) return;

    ALL_SLOTS.forEach(slot => {
      const itemId = equippedSlots[slot];
      if (!itemId) return;
      const item = shopItems.find(i => i.id === itemId);
      if (!item || !item.image_url) return;

      const z = SLOT_Z[slot] ?? 1;
      const img = document.createElement("img");
      img.className = `quiz-avatar-layer avatar-slot-${slot}`;
      img.src = item.image_url;
      img.style.zIndex = String(z);
      img.alt = "";
      // Back items (z<0) must appear before body in DOM — paint order determines compositing
      if (z < 0) {
        avatarDisplay.insertBefore(img, base);
      } else {
        avatarDisplay.appendChild(img);
      }
    });
  }

  // ── Identity prompt (Section 152C) ──────────────────────────────────────────
  // Soft prompt: shown to STUDENTS who have never explicitly chosen an avatar
  // identity (chosen_at null/absent). "Vælg senere" dismisses without writing —
  // re-prompts at next login. Choosing calls set_avatar_identity (stamps
  // chosen_at) and never shows again. Teachers/admins never see it.

  async function maybeShowIdentityPrompt() {
    const overlay = document.getElementById("identity-overlay");
    if (!overlay) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, avatar_identity")
      .eq("id", studentId)
      .maybeSingle();

    if (!profile || profile.role !== "student") return;

    const identity = profile.avatar_identity;
    const hasChosen =
      identity && typeof identity === "object" && !!identity.chosen_at;
    if (hasChosen) return;

    await showIdentityPrompt(identity ?? null);
  }

  function showIdentityPrompt(currentIdentity) {
    return new Promise((resolve) => {
      const overlay  = document.getElementById("identity-overlay");
      const statusEl = document.getElementById("identity-status");
      const laterBtn = document.getElementById("identity-later-btn");
      if (!overlay) { resolve(); return; }

      const validBodies = ["male", "female", "neutral"];
      const currentBody =
        (currentIdentity && typeof currentIdentity === "object"
          && validBodies.includes(currentIdentity.body_type))
          ? currentIdentity.body_type
          : "neutral";

      // Mark the student's current body — "Behold" is one tap.
      overlay.querySelectorAll(".identity-card").forEach(card => {
        const isCurrent = card.dataset.bodyType === currentBody;
        card.classList.toggle("identity-card--current", isCurrent);
        const badge = card.querySelector(".identity-card-current-badge");
        if (badge) badge.textContent = isCurrent ? "Nuværende" : "";
      });

      overlay.style.display = "flex";

      const cards = overlay.querySelectorAll(".identity-card");

      const close = () => {
        overlay.style.display = "none";
        resolve();
      };

      // "Vælg senere": no write — chosen_at stays null, re-prompt next login.
      if (laterBtn) {
        laterBtn.disabled = false;
        laterBtn.onclick = close;
      }

      cards.forEach(card => {
        card.disabled = false;
        card.onclick = async () => {
          const bodyType = card.dataset.bodyType;
          if (!bodyType || !validBodies.includes(bodyType)) return;

          cards.forEach(c => c.disabled = true);
          if (laterBtn) laterBtn.disabled = true;
          if (statusEl) { statusEl.textContent = "Gemmer…"; statusEl.style.color = ""; }

          // Race the RPC against an 8-second timeout so a hung network never
          // leaves the student stuck (same pattern as the grade selector).
          const rpcCall     = supabase.rpc("set_avatar_identity", { p_body_type: bodyType });
          const timeoutCall = new Promise(res =>
            setTimeout(() => res({ error: new Error("timeout") }), 8000)
          );

          let rpcError = null;
          try {
            const { error } = await Promise.race([rpcCall, timeoutCall]);
            rpcError = error ?? null;
          } catch (e) {
            rpcError = e;
          }

          if (rpcError) {
            logEvent("IDENTITY_SAVE_FAILED", { bodyType, error: String(rpcError?.message ?? rpcError) });
            if (statusEl) {
              statusEl.textContent = "Kunne ikke gemme – prøv igen";
              statusEl.style.color = "#ef5350";
            }
            cards.forEach(c => c.disabled = false);
            if (laterBtn) laterBtn.disabled = false;
            return;
          }

          logEvent("IDENTITY_CHOSEN", { bodyType });
          // Re-render the identity-strip avatar with the chosen body.
          await fetchAvatar();
          close();
        };
      });
    });
  }

  async function loadGrade() {
    const { data: profile } = await supabase
      .from("profiles")
      .select("selected_grade")
      .eq("id", studentId)
      .maybeSingle();
    const grade = profile?.selected_grade ?? null;
    if (grade !== null) {
      selectedGrade = grade;
      currentDifficultyBand = GRADE_START_BAND[grade] ?? 2;
    }
  }

  async function showGradeSelector() {
    return new Promise((resolve) => {
      const overlay  = document.getElementById("grade-selector-overlay");
      const statusEl = document.getElementById("grade-status");
      if (!overlay) { resolve(); return; }
      overlay.style.display = "flex";
      const buttons = overlay.querySelectorAll(".grade-btn");

      buttons.forEach(btn => {
        btn.onclick = async () => {
          const grade = parseInt(btn.dataset.grade, 10);
          if (!grade) return;

          buttons.forEach(b => b.disabled = true);
          if (statusEl) { statusEl.textContent = "Gemmer…"; statusEl.style.color = ""; }

          // Race the RPC against an 8-second timeout so a hung network
          // never leaves the buttons disabled indefinitely.
          const rpcCall     = supabase.rpc("set_student_grade", { p_grade: grade });
          const timeoutCall = new Promise(res =>
            setTimeout(() => res({ error: new Error("timeout") }), 8000)
          );

          let rpcError = null;
          try {
            const { error } = await Promise.race([rpcCall, timeoutCall]);
            rpcError = error ?? null;
          } catch (e) {
            rpcError = e;
          }

          if (rpcError) {
            logError("SET_GRADE_ERROR", rpcError);
            buttons.forEach(b => b.disabled = false);
            if (statusEl) {
              statusEl.style.color = "#ef4444";
              statusEl.textContent = rpcError.message === "timeout"
                ? "Netværket svarer ikke — prøv igen"
                : "Kunne ikke gemme klassetrin — prøv igen";
            }
            return; // stay on overlay so student can retry
          }

          if (statusEl) statusEl.textContent = "";
          selectedGrade = grade;
          currentDifficultyBand = GRADE_START_BAND[grade] ?? 2;
          overlay.style.display = "none";
          resolve();
        };
      });
    });
  }

  function showCoinPopup(amount) {
    const popup = document.getElementById("xp-popup");
    if (!popup) return;
    popup.textContent = `+${amount} mønter`;
    popup.classList.remove("xp-show");
    void popup.offsetWidth;
    popup.classList.add("xp-show");
    popup.addEventListener("animationend", () => popup.classList.remove("xp-show"), { once: true });
  }

  function showLevelUpOverlay(newLevel) {
    const overlay = document.getElementById("level-up-overlay");
    const text = document.getElementById("level-up-text");
    if (!overlay || !text) return;
    text.textContent = `Niveau ${newLevel} — nyt territorium åbner sig.`;
    overlay.style.display = "flex";
    overlay.style.opacity = "0";
    void overlay.offsetWidth;
    overlay.style.opacity = "1";
    setTimeout(() => {
      overlay.style.opacity = "0";
      setTimeout(() => { overlay.style.display = "none"; overlay.style.opacity = ""; }, 250);
    }, 2250);
  }

  // leadText: a line kept above the explanation (only "stav til": the correct spelling).
  function enterReflectionState(reviewText, leadText = null) {
    setUIState(UI_STATES.REFLECTING);
    feedback.textContent = leadText ?? "";
    feedback.className = leadText ? "feedback-error" : "";
    reviewFeedback.textContent = reviewText;
    reviewFeedback.classList.add("visible");
    optionsContainer.style.display = "none";
    reflectionContinue.style.display = "block";
    setTimeout(() => reflectionContinue.focus(), 200);
  }

  reflectionContinue.onclick = () => {
    if (uiState !== UI_STATES.REFLECTING) return;
    setUIState(UI_STATES.TRANSITIONING);
    loadAndRenderQuestion();
  };

  async function submitAnswer(userAnswer, clickedBtn = null) {

    if (uiState !== UI_STATES.AWAITING_ANSWER) return;

    setUIState(UI_STATES.SUBMITTING_ANSWER);

    const buttons = optionsContainer.querySelectorAll("button");
    buttons.forEach(btn => btn.disabled = true);

    console.log("SUBMIT:", { studentId, currentInstanceId, userAnswer });

    const { data, error } = await supabase.functions.invoke(
      "process-event",
      {
        body: {
          student_id: studentId,
          question_instance_id: currentInstanceId,
          answer: userAnswer,
          question_shown_at: questionShownAt
        }
      }
    );

    if (error) {
      logError("SUBMIT_ERROR", error);

      feedback.textContent = "⚠️ Fejl ved svar – prøv igen";
      feedback.className = "feedback-error";

      buttons.forEach(btn => btn.disabled = false);
      setUIState(UI_STATES.AWAITING_ANSWER);
      return;
    }

    if (!data || !data.status) {
      logError("INVALID_RESPONSE", data);

      feedback.textContent = "⚠️ Ugyldigt svar fra server";
      feedback.className = "feedback-error";

      buttons.forEach(btn => btn.disabled = false);
      setUIState(UI_STATES.AWAITING_ANSWER);
      return;
    }

    const prevXp = lastKnownXp;
    const prevCoins = lastKnownCoins;
    sessionQuestionCount++;
    // 157E: analytics — answer result (status only, no answer text). No-op unless active.
    track("question_answered", { status: data.status });
    // Persist earned band every 10 questions — fire-and-forget, never blocks the quiz.
    if (sessionQuestionCount % 10 === 0) {
      persistCurrentBand();
    }

    if (data.status === "pending") {
      feedback.textContent = "⏳ Afventer lærerens vurdering";
      feedback.className = "feedback-pending";
      sessionCorrectStreak = 0;
      sessionConsecutiveReflections = 0;

      await fetchProgress();
      setUIState(UI_STATES.TRANSITIONING);
      setTimeout(() => { loadAndRenderQuestion(); }, 1000);
      return;
    }

    if (data.status === "correct") {
      feedback.textContent = "Ja! 🎯";
      feedback.className = "feedback-correct";
      playSound("equip");
      exprEngine?.onGameEvent("CORRECT");
      presenceEngine?.onGameEvent("CORRECT");
      if (clickedBtn) {
        clickedBtn.classList.add("correct-flash");
        clickedBtn.addEventListener("animationend", () => clickedBtn.classList.remove("correct-flash"), { once: true });
      }

      // Hidden achievement: perfect_five — track consecutive correct per session
      sessionCorrectStreak++;
      sessionConsecutiveReflections = 0;
      updateWavePhase(true);
      adjustDifficultyBand(true);
      if (sessionCorrectStreak >= 5 && sessionCorrectStreak > bestSessionStreak) {
        bestSessionStreak = sessionCorrectStreak;
        // supabase.rpc() returns a PostgrestFilterBuilder — a thenable WITHOUT .catch().
        // Calling .catch() on it threw a synchronous TypeError that aborted submitAnswer and
        // froze the state machine in SUBMITTING_ANSWER. then(onOk, onErr) both executes the
        // request and swallows failures, which is the fire-and-forget behaviour intended here.
        supabase.rpc("update_best_session_streak", { p_count: bestSessionStreak }).then(() => {}, () => {});
      }

      // Hidden achievement: night_owl — correct answer between 00:00–03:59 local time
      if (new Date().getHours() < 4) {
        // Same PostgrestFilterBuilder caveat as update_best_session_streak above.
        supabase.rpc("set_night_correct").then(() => {}, () => {});
      }

      await fetchProgress();

      const coinDelta = lastKnownCoins - prevCoins;
      if (coinDelta > 0) showCoinPopup(coinDelta);

      const prevLevel = calculateLevelFromXP(prevXp);
      const newLevel = calculateLevelFromXP(lastKnownXp);
      if (newLevel > prevLevel) {
        showLevelUpOverlay(newLevel);
        exprEngine?.onGameEvent("LEVEL_UP");
        presenceEngine?.onGameEvent("LEVEL_UP");
      }

      setUIState(UI_STATES.TRANSITIONING);
      setTimeout(() => { loadAndRenderQuestion(); }, 600);
      return;
    }

    if (data.status === "incorrect") {
      const reviewText = data.review_text ?? null;

      playSound("error");
      exprEngine?.onGameEvent("INCORRECT");
      presenceEngine?.onGameEvent("INCORRECT");
      if (clickedBtn) {
        clickedBtn.classList.add("incorrect-flash");
        clickedBtn.addEventListener("animationend", () => clickedBtn.classList.remove("incorrect-flash"), { once: true });
      }
      sessionCorrectStreak = 0;
      lastMisconceptionType = data.misconception_type ?? null;
      updateWavePhase(false);
      adjustDifficultyBand(false);

      await fetchProgress();

      // Reflection density gate (Section 55):
      // Enter reflection state only for the first 2 consecutive incorrect+reviewText answers.
      // After 2 back-to-back reflections, auto-advance — prevents reflection fatigue in losing streaks.
      if (reviewText && sessionConsecutiveReflections < 2) {
        sessionConsecutiveReflections++;
        feedback.textContent = "Ikke helt —";
        feedback.className = "feedback-error";
        // "Stav til": the explanation alone does not state the spelling, so keep it on screen.
        const correction = currentRenderer === ANSWER_RENDERERS.SHORT_TEXT
          ? shortTextCorrection(data.correct_answer, userAnswer)
          : null;
        setTimeout(() => enterReflectionState(reviewText, correction), 400);
        return;
      }

      if (reviewText) {
        logEvent("REFLECTION_DENSITY_GATE", { sessionConsecutiveReflections, gated: true });
      }

      feedback.textContent = "Svaret er " + (data.correct_answer ?? "ukendt") + " — husk det nu.";
      feedback.className = "feedback-error";
      setUIState(UI_STATES.TRANSITIONING);
      setTimeout(() => { loadAndRenderQuestion(); }, 2000);
      return;
    }

    logError("UNKNOWN_STATUS", data.status);

    feedback.textContent = "⚠️ Ukendt status fra server";
    feedback.className = "feedback-error";

    buttons.forEach(btn => btn.disabled = false);
    setUIState(UI_STATES.AWAITING_ANSWER);
  }

  async function getNextQuestion() {
    setUIState(UI_STATES.LOADING_QUESTION);

    const sessionContext = {
      wave_phase: sessionWavePhase,
      consecutive_incorrect: sessionConsecutiveIncorrect,
      last_misconception_type: lastMisconceptionType,
      session_question_count: sessionQuestionCount,
    };

    let { data, error } = await supabase.functions.invoke(
      "get-next-question",
      { body: { session_context: sessionContext, selected_grade: selectedGrade, current_difficulty_band: currentDifficultyBand, subject: currentSubject } }
    );

    if (error) {
      await new Promise(resolve => setTimeout(resolve, 500));
      ({ data, error } = await supabase.functions.invoke("get-next-question", { body: { subject: currentSubject } }));
    }

    console.log("RAW RESPONSE:", data, error);

    if (error) {
      console.error("GET QUESTION ERROR:", error);
      return null;
    }

    const parsed = typeof data === "string" ? JSON.parse(data) : data;

    console.log("QUESTION RAW:", parsed);

    if (!parsed) return null;

    if (parsed.step === "no_questions") {
      return { step: "no_questions" };
    }

    if (!parsed.content || !parsed.content.question) {
      console.error("INVALID QUESTION:", parsed);
      return null;
    }

    currentInstanceId = parsed.question_instance_id ?? null;

    console.log("INSTANCE ID:", currentInstanceId);

    return parsed;
  }

  // Returns true when an answer control was rendered, false for an interaction type this client
  // cannot show (loadAndRenderQuestion then leaves the question in a visible error state).
  function renderOptions(question) {
    optionsContainer.innerHTML = "";

    const format = (question.answer_format || "").toLowerCase();
    const content = question.content;
    // One renderer per interaction type — see js/answer-input.js for the selection order.
    const renderer = resolveAnswerRenderer(question);
    currentRenderer = renderer;

    // 157E: analytics — question shown (format only, no content). No-op unless active.
    track("question_shown", { format });

    let options = content.options;

    if (!Array.isArray(options)) options = [];

    if (renderer === ANSWER_RENDERERS.FORCE_TEXT) {
      const textarea = document.createElement("textarea");

      const btn = document.createElement("button");
      btn.className = "submit-btn";
      btn.textContent = "Send svar";

      btn.onclick = () => {
        submitAnswer(textarea.value, btn);
      };

      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          btn.onclick();
        }
      });

      optionsContainer.appendChild(textarea);
      optionsContainer.appendChild(btn);
      // 157I: optional OCR "scan text" control — no-op when ENABLE_OCR is off; fail-soft.
      attachOcrControl(textarea, optionsContainer);
      return true;
    }

    if (format.includes("mc")) {
      // Padding to four options applies to answer_format "mc" only — a two-choice format
      // (true/false) must never get random years added. See js/answer-options.js.
      options = prepareChoiceOptions(options, format);
    }

    if (renderer === ANSWER_RENDERERS.NUMBER) {
      const input = document.createElement("input");
      input.type = "text";

      const btn = document.createElement("button");
      btn.className = "submit-btn";
      btn.textContent = "Svar";

      btn.onclick = () => {
        const val = Number(input.value);
        if (!Number.isNaN(val)) {
          submitAnswer(String(val), btn);
        }
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") btn.onclick();
      });

      optionsContainer.appendChild(input);
      optionsContainer.appendChild(btn);
      return true;
    }

    if (renderer === ANSWER_RENDERERS.SHORT_TEXT) {
      // "Stav til": one-line input with spellcheck/autocorrect/autocapitalize/autocomplete off.
      // The raw text goes to submitAnswer unchanged; the server evaluator decides correctness.
      const { input, button, hint } = buildShortTextAnswer(document, {
        onSubmit: submitAnswer,
        describedBy: questionElement.id,
      });
      optionsContainer.appendChild(input);
      optionsContainer.appendChild(hint);
      optionsContainer.appendChild(button);
      input.focus();
      return true;
    }

    if (renderer === ANSWER_RENDERERS.LONG_TEXT) {
      const textarea = document.createElement("textarea");

      const btn = document.createElement("button");
      btn.className = "submit-btn";
      btn.textContent = "Send svar";

      btn.onclick = () => {
        submitAnswer(textarea.value, btn);
      };

      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          btn.onclick();
        }
      });

      optionsContainer.appendChild(textarea);
      optionsContainer.appendChild(btn);
      // 157I: optional OCR "scan text" control — no-op when ENABLE_OCR is off; fail-soft.
      attachOcrControl(textarea, optionsContainer);
      return true;
    }

    if (renderer === ANSWER_RENDERERS.UNSUPPORTED) {
      // An interaction type this client has no renderer for must fail loud — never fall through
      // to option buttons (ARCHITECTURE.md → Question Interaction model, rule 2).
      logError("UNSUPPORTED_ANSWER_FORMAT", { format, answer_type: question.answer_type ?? null });
      const msg = document.createElement("p");
      msg.id = "unsupported-format";
      msg.className = "feedback-error";
      msg.setAttribute("role", "alert");
      msg.textContent = "⚠️ Denne opgavetype kan ikke vises endnu.";
      optionsContainer.appendChild(msg);

      const hubBtn = document.createElement("button");
      hubBtn.id = "go-hub-btn";
      hubBtn.textContent = "Gå til hub";
      hubBtn.className = "submit-btn";
      hubBtn.onclick = () => { window.location.href = "hub.html"; };
      optionsContainer.appendChild(hubBtn);
      return false;
    }

    const isMc = format.includes("mc");
    options.forEach((option) => {
      const btn = document.createElement("button");
      btn.textContent = option;
      btn.onclick = () => submitAnswer(option, btn);

      if (isMc) {
        // 157O: MC options render as a row [answer button][🔊] so the read-aloud
        // control is a SEPARATE sibling — clicking 🔊 never submits the answer.
        // No-op / fail-soft when read-aloud is unavailable (no 🔊 rendered).
        const row = document.createElement("div");
        row.className = "option-row";
        row.appendChild(btn);
        attachOptionReadAloudControl(row, option, { subject: currentSubject, question: content.question, options });
        optionsContainer.appendChild(row);
      } else {
        optionsContainer.appendChild(btn);
      }
    });
    return true;
  }

  async function loadAndRenderQuestion() {
    // Clean up reflection state if active from previous question
    stopReadAloud();
    optionsContainer.style.display = "";
    reviewFeedback.textContent = "";
    reviewFeedback.classList.remove("visible");
    reflectionContinue.style.display = "none";

    const question = await getNextQuestion();

    if (!question) {
      // The state machine is stuck at LOADING_QUESTION with no valid exit.
      // Direct reset to IDLE is the only way to allow a legal retry transition.
      uiState = "IDLE";
      questionElement.textContent = "⚠️ Kunne ikke hente spørgsmål";
      questionElement.dataset.state = "error";
      optionsContainer.innerHTML = "";
      const retryBtn = document.createElement("button");
      retryBtn.id = "retry-question-btn";
      retryBtn.textContent = "Prøv igen";
      retryBtn.className = "submit-btn";
      retryBtn.onclick = () => { loadAndRenderQuestion(); };
      optionsContainer.appendChild(retryBtn);
      return;
    }

    if (question.step === "no_questions") {
      uiState = "IDLE"; // unblock state machine so retry button can re-enter LOADING_QUESTION
      questionElement.dataset.state = "empty";
      feedback.textContent = "";
      feedback.className = "";
      optionsContainer.innerHTML = "";

      if (currentSubject === "engelsk") {
        questionElement.textContent = "🎉 Du har klaret alle engelskopgaverne lige nu";
        const sub = document.createElement("p");
        sub.id = "no-questions-sub";
        sub.textContent = "Prøv historie på Spil-siden, eller kom tilbage senere.";
        optionsContainer.appendChild(sub);
      } else if (currentSubject === "dansk") {
        questionElement.textContent = "🎉 Du har klaret alle danskopgaverne lige nu";
        const sub = document.createElement("p");
        sub.id = "no-questions-sub";
        sub.textContent = "Prøv historie på Spil-siden, eller kom tilbage senere.";
        optionsContainer.appendChild(sub);
      } else if (activeDomains !== null) {
        const domainNames = activeDomains.map(d => DOMAIN_LABEL[d] ?? d).join(", ");
        questionElement.textContent = "Du har ingen flere spørgsmål i det tildelte emne.";
        const sub = document.createElement("p");
        sub.id = "no-questions-sub";
        sub.textContent = "Spørg din lærer om at tildele flere emner.  ·  Tildelt: " + domainNames;
        optionsContainer.appendChild(sub);
      } else {
        questionElement.textContent = "🎉 Du har ingen flere spørgsmål lige nu";
      }

      const hubBtn = document.createElement("button");
      hubBtn.id = "go-hub-btn";
      hubBtn.textContent = "Gå til hub";
      hubBtn.className = "submit-btn";
      hubBtn.onclick = () => { window.location.href = "hub.html"; };
      optionsContainer.appendChild(hubBtn);

      const retryBtn = document.createElement("button");
      retryBtn.id = "retry-question-btn";
      retryBtn.textContent = "Prøv igen";
      retryBtn.className = "submit-btn";
      retryBtn.onclick = () => { loadAndRenderQuestion(); };
      optionsContainer.appendChild(retryBtn);

      return;
    }

    questionElement.textContent = question.content.question;
    // 157O: optional read-aloud control — no-op when ENABLE_READ_ALOUD is off; fail-soft.
    attachReadAloudControl(questionElement, question.content.question, { subject: currentSubject });
    feedback.textContent = "";
    feedback.className = "";
    questionShownAt = Date.now();

    if (!renderOptions(question)) {
      // Unsupported interaction type: same exit as the load-error path above — the state machine
      // is reset to IDLE (no answer control means AWAITING_ANSWER would be a dead state), the
      // question is marked as an error, and the pupil has a visible way out.
      uiState = "IDLE";
      questionElement.dataset.state = "error";
      return;
    }

    setUIState(UI_STATES.AWAITING_ANSWER);
  }

  await fetchProgress();
  await fetchAvatar();
  await maybeShowIdentityPrompt();   // Section 152C — soft prompt, before grade
  await loadGrade();
  if (selectedGrade === null) await showGradeSelector();

  // Load both bands, then resolve starting difficulty.
  // Priority: persistedBand (earned) > placementBand (assessed) > GRADE_START_BAND (default).
  await loadAdaptiveBands();
  if (placementBand === null && selectedGrade !== null) {
    await runPlacementFlow(); // first-time only — sets placementBand
  }
  if (persistedBand !== null) {
    currentDifficultyBand = persistedBand;          // returning student — resume at earned level
  } else if (placementBand !== null) {
    currentDifficultyBand = placementBand;           // post-placement first session
  }
  // else: currentDifficultyBand stays at GRADE_START_BAND[grade] set by loadGrade()

  await loadActiveDomains(); // show domain focus indicator if teacher has assigned domains

  const avatarDisplay = document.getElementById("avatar-display");
  if (avatarDisplay) {
    // 167A Phase-1 guard: when the raster baked base is active for this student, SKIP the
    // expression + blink overlays (the face is baked into the base). Presence/breathing
    // stays. C2/SVG path unchanged (r2 off/absent → engines mount as before). Engines are
    // already optional (try/catch → null) and every consumer null-guards, so skipping is a
    // supported state. Identity fetched here since it isn't known until the avatar renders.
    let quizIdentity = null;
    try {
      const { data } = await supabase.from("profiles").select("avatar_identity").eq("id", studentId).maybeSingle();
      quizIdentity = data?.avatar_identity ?? null;
    } catch (e) { /* non-fatal */ }
    // Granular R2 engine gate (PR C, blink completed by PR D): expression overlay
    // stays OFF on the raster stack (the neutral raster face is in the stack);
    // blink runs on BOTH paths with the profile matching the active render path
    // (Option-A geometry/fill on active R2, unchanged C2 profile otherwise).
    // F1: key the engines off the ACTUAL mounted path (dataset.avatarRenderPath set
    // by mountC2Avatar's atomic gate) so an R2 asset-load fallback follows the C2
    // living contract (expression ON, C2 lids), not the manifest-only guess.
    const r2Active = avatarDisplay.dataset.avatarRenderPath === "r2";
    try { presenceEngine = new PresenceEngine(avatarDisplay);  } catch (e) { /* non-fatal */ }
    // D-069: expression runs on BOTH paths — C2 via its own overlay, R2 via a swap of the
    // decomposed z3 face layer (`{ r2: true }`). Blink/breathing are unaffected.
    try {
      exprEngine = r2Active
        ? new ExpressionEngine(avatarDisplay, { r2: true })
        : new ExpressionEngine(avatarDisplay);
    } catch (e) { /* non-fatal */ }
    const blinkCfg = blinkConfigFor(quizIdentity, r2Active);
    if (blinkCfg.allowed) {
      try { blinkEngine = new BlinkEngine(avatarDisplay, blinkCfg.skinTone, { mode: blinkCfg.mode }); } catch (e) { /* non-fatal */ }
    }
    // First-load render-complete signal: fetchAvatar() (awaited above) painted the
    // base/cosmetics and the expression engine has now attached its neutral overlay,
    // so the composite is final. Deterministic wait point for golden screenshots.
    await markAvatarRendered(avatarDisplay);
  }
  await loadAndRenderQuestion();
});

console.log("APP LOADED DEBUG");
