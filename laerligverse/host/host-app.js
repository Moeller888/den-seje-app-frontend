// D-321: the Lærligverse host page's DOM wiring (plain JavaScript, no build). All logic that can be
// tested without a browser lives in ./host-core.js.
//
// This page is NOT deployed: laerligverse/ is not in the deploy allowlist (tools/cloudflare-build-static.mjs).
// It runs under tools/laerligverse/serve-local.mjs (local preview) and the isolated test harness, which
// fill in the configuration and the Content-Security-Policy. In Lærlig it would use the existing
// supabase-js session (supabaseSessionProvider) instead of the local password sign-in shown here.
import { assertOrigin, createLaerligverseHost, passwordSessionProvider } from "./host-core.js";
import { BridgeHost, assessObjectives } from "./bridge/index.js";

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const body = document.body;

function say(text) {
  $("lv-live").textContent = text;
}

/** The game has completed the handshake: show it, and announce it once (not on every message). */
function linked() {
  // Signed out: the game frame may still be talking, but the link to Lærlig is not active.
  if (body.dataset.session === "signed-out") return;
  if ($("lv-link").textContent === "forbundet") return;
  $("lv-link").textContent = "forbundet";
  say("Spillet er klar.");
}

function fail(text) {
  body.dataset.state = "refused";
  $("lv-mode").hidden = false;
  $("lv-mode").textContent = text;
}

/** Reads and validates the server-provided configuration. Anything unexpected stops the page. */
function readConfig() {
  const raw = $("lv-config").textContent ?? "";
  let c;
  try {
    c = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!c || typeof c !== "object") return null;
  if (c.mode !== "local-preview" && c.mode !== "isolated-test") return null; // the real page will add a production mode
  if (c.backend !== "local-supabase" && c.backend !== "test-adapter") return null;
  if (c.backend === "test-adapter" && c.mode !== "local-preview") return null;
  try {
    assertOrigin(c.gameOrigin);
    if (typeof c.gameUrl !== "string" || new URL(c.gameUrl).origin !== c.gameOrigin) return null;
    if (c.backend === "local-supabase") {
      assertOrigin(new URL(c.supabaseUrl).origin);
      if (typeof c.anonKey !== "string" || c.anonKey.length === 0) return null;
    }
    // D-330: optional, non-production only. A malformed value refuses the page rather than being ignored.
    if (c.objectiveMap !== undefined && c.objectiveMap !== null) {
      if (typeof c.objectiveMap !== "object" || Array.isArray(c.objectiveMap)) return null;
      for (const [k, v] of Object.entries(c.objectiveMap)) {
        if (typeof k !== "string" || k.length === 0 || typeof v !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(v)) return null;
      }
    }
    if (c.h5 !== undefined && typeof c.h5 !== "boolean") return null;
    // D-338: a server-directed sequence needs a step → activity map (string → string), and an objective map.
    if (c.sequence !== undefined && typeof c.sequence !== "boolean") return null;
    if (c.sequence === true && c.backend === "local-supabase") {
      if (!c.objectiveMap || !c.stepContexts || typeof c.stepContexts !== "object" || Array.isArray(c.stepContexts)) return null;
      for (const [k, v] of Object.entries(c.stepContexts)) if (typeof k !== "string" || typeof v !== "string" || v.length === 0) return null;
    }
  } catch {
    return null;
  }
  return c;
}

const config = readConfig();
if (config === null) {
  fail("Konfigurationen mangler eller er ugyldig. Siden starter ikke.");
} else if (config.backend === "test-adapter") {
  void startDidacticDemo(config);
} else {
  start(config);
}

/**
 * LOCAL DIDACTIC DEMO: Arkivskabet's curated sources through the TEST ADAPTER, because the real backend
 * cannot yet target the learning objective (H4). Nothing is graded or recorded by Lærlig's server.
 */
async function startDidacticDemo(c) {
  $("lv-mode").hidden = false;
  $("lv-mode").textContent = "Didaktisk demo med testadapter — ikke Lærligs server, intet registreres";
  $("lv-session").textContent = "ingen (testadapter)";
  body.dataset.session = "test-adapter";
  const { FakeTaskService, ARCHIVE_ITEMS, CONTEXT_OF_STEP, OBJECTIVE, STEP_OF_CONTEXT } = await import("./dev/test-adapter.js");
  // D-338: with a sequence, the test adapter runs the SERVER's own step policy (bridge/learning-sequence.js is
  // generated from supabase/functions/_shared/learning-sequence.ts). The world only asks for "next".
  const policy = c.sequence === true ? await import("./bridge/learning-sequence.js") : null;
  const service = new FakeTaskService(ARCHIVE_ITEMS, policy ? { sequence: { nextStep: policy.nextStep, stepOfContext: STEP_OF_CONTEXT, contextOfStep: CONTEXT_OF_STEP } } : {});
  // The revisit needs time to pass: only the TEST ADAPTER's clock moves (a simulation, never retention evidence).
  let clockOffset = 0;
  service.clock = () => Date.now() + clockOffset;
  const refreshDev = () => renderDevPanel({ objective: OBJECTIVE, policy, service });
  $("lv-dev-clock").addEventListener("click", () => {
    clockOffset += 20 * 3_600_000;
    $("lv-dev-clock-state").textContent = `Simuleret tid: +${clockOffset / 3_600_000} timer`;
    refreshDev();
  });
  $("lv-dev-panel").hidden = false;
  const frame = /** @type {HTMLIFrameElement} */ ($("lv-game"));
  const host = new BridgeHost({
    gameOrigin: assertOrigin(c.gameOrigin),
    gameWindow: frame.contentWindow,
    post: (m) => frame.contentWindow?.postMessage(m, c.gameOrigin),
    service,
    randomId: () => crypto.randomUUID(),
    store: sessionStorage,
    onReject: (reason) => (body.dataset.lastReject = reason),
  });
  window.addEventListener("message", (e) => {
    void host.onMessage({ origin: e.origin, source: e.source, data: e.data }).then(() => {
      if (host.sessionNonce !== null) linked();
      renderEvidence(assessObjectives(service.observations()));
      refreshDev();
    });
  });
  refreshDev();
  $("lv-evidence-panel").hidden = false;
  renderEvidence([]);
  $("lv-game-region").hidden = false;
  frame.src = c.gameUrl;
  body.dataset.state = "running";
  say("Spillet indlæses.");
}

const STEP_LABEL = {
  guided_practice: "3 · Støttet øvelse",
  revision: "5 · Revision",
  independent_application: "6 · Selvstændig anvendelse",
  transfer: "7 · Overførsel",
  revisit: "8 · Genbesøg",
};

/**
 * D-338 DEVELOPER VIEW (local demo only, separate from the pupil's view): what the "server" — here the test
 * adapter running the server's own policy — decided and observed. No token, no key, nothing secret.
 */
function renderDevPanel({ objective, policy, service }) {
  // The server's NEXT decision now (a side-effect-free preview), not the step of the task already served.
  const d = service.previewSequence(objective.id);
  const obs = service.observations();
  const last = obs.at(-1);
  const rows = [
    ["Læringsmål (prototype)", `${objective.id}`],
    ["Politik", policy ? `${policy.POLICY_ID} (foreløbig testpolitik, LP-13)` : "ingen: spillet bestemmer rækkefølgen (F5)"],
    ["Serverens næste trin", d === null ? "ingen sekvens" : d.state === "step" ? `${STEP_LABEL[d.step] ?? d.step} (mode ${d.mode})` : d.state === "waiting" ? `venter på genbesøg til ${d.dueAt}` : "forløbet er gennemført"],
    ["Hvorfor", d === null ? "—" : d.state === "step" ? whyStep(d.step, obs) : d.state === "waiting" ? `genbesøget kommer tidligst ${policy?.REVISIT_AFTER_HOURS ?? 20} timer efter overførslen` : "alle trin har et registreret svar"],
    ["Seneste opgaveinstans · runde", last ? `${last.instanceId} · ${last.roundNo}` : "—"],
    ["Seneste serverresultat", last ? (last.wasCorrect ? "rigtigt" : "forkert") : "—"],
    ["Registreret hjælp", last ? `${last.hintsUsed} hints (testadapteren kender hjælpen; Lærligs server gør ikke før L1 K1)` : "—"],
    ["Evidensstatus", last ? "ikke evidens: kilden er testadapteren, K5 er ikke fastslået, og introduktionen er ikke registreret" : "—"],
  ];
  const dl = $("lv-dev-body");
  dl.replaceChildren();
  for (const [k, v] of rows) dl.append(Object.assign(document.createElement("dt"), { textContent: k }), Object.assign(document.createElement("dd"), { textContent: v }));
}

function whyStep(step, obs) {
  if (step === "guided_practice") return "intet svar i støttet øvelse endnu";
  if (step === "revision") return "det seneste svar i støttet øvelse var forkert: politikken indsætter én revision";
  if (step === "independent_application") return obs.length > 0 && obs[0].wasCorrect ? "støttet øvelse besvaret rigtigt: ingen revision" : "revisionen er besvaret (én revision, ingen sløjfe)";
  if (step === "transfer") return "selvstændig anvendelse er besvaret";
  return "overførslen er besvaret, og genbesøget er forfaldent";
}

const STATE_LABEL = {
  introduced: "Introduceret",
  practised: "Øvet",
  supported: "Støttet præstation",
  independent: "Selvstændig præstation",
  applied: "Anvendelse i ny situation",
  revisited: "Genbesøg",
  documentedProgression: "Dokumenteret progression",
};
const STATUS_LABEL = { observed: "observeret", not_observed: "ikke observeret", unknown: "ukendt" };

/** D-330: the evidence chain's classification of what the TEST ADAPTER observed — never server evidence. */
function renderEvidence(assessments) {
  const box = $("lv-evidence-body");
  box.replaceChildren();
  if (assessments.length === 0) {
    box.append(Object.assign(document.createElement("p"), { textContent: "Endnu ingen besvarede opgaver." }));
    return;
  }
  for (const a of assessments) {
    const table = document.createElement("table");
    table.dataset.objective = a.objective;
    const cap = document.createElement("caption");
    cap.textContent = `Mål (prototype-id): ${a.objective}`;
    table.append(cap);
    const tbody = document.createElement("tbody");
    for (const [key, label] of Object.entries(STATE_LABEL)) {
      const v = a.states[key];
      const tr = document.createElement("tr");
      tr.dataset.state = key;
      const th = Object.assign(document.createElement("th"), { scope: "row", textContent: label });
      const td = Object.assign(document.createElement("td"), { textContent: `${STATUS_LABEL[v.status]} — ${v.why.join(" ")}` });
      td.dataset.status = v.status;
      tr.append(th, td);
      tbody.append(tr);
    }
    const eligible = a.evidence.filter((e) => e.eligible).length;
    const tr = document.createElement("tr");
    tr.dataset.state = "evidence";
    tr.append(
      Object.assign(document.createElement("th"), { scope: "row", textContent: "Kan bruges som evidens (K4)" }),
      Object.assign(document.createElement("td"), { textContent: `${eligible} af ${a.evidence.length} svar. ${a.evidence[0] ? "Fx: " + (a.evidence[0].reasons.join("; ") || "opfylder K4") : ""}` }),
    );
    tbody.append(tr);
    table.append(tbody);
    box.append(table);
  }
}

function start(c) {
  $("lv-mode").hidden = false;
  $("lv-mode").textContent = c.mode === "isolated-test" ? "Isoleret testmiljø — syntetiske elever" : "Lokal udvikling — ikke Lærligs produktion";
  const session = passwordSessionProvider({ supabaseUrl: c.supabaseUrl, anonKey: c.anonKey });
  const frame = /** @type {HTMLIFrameElement} */ ($("lv-game"));
  let host = null;
  let signIns = 0;
  const reportedFlag = { laerligverseBackend: true }; // explicit, in this non-production page only

  session.onChange((s) => {
    if (s === "signed-out") {
      $("lv-session").textContent = "logget ud";
      body.dataset.session = "signed-out";
      $("lv-logout").hidden = true;
      $("lv-link").textContent = "afbrudt (logget ud)";
      // No dead end: the pupil can sign in again on the same page (an expired session lands here too).
      $("lv-login").hidden = false;
      body.dataset.state = "login";
      say("Du er logget ud. Nye afleveringer bliver ikke sendt, før du logger ind igen.");
    }
  });

  $("lv-login").hidden = false;
  body.dataset.state = "login";
  $("lv-login-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    $("lv-login-error").hidden = true;
    const ok = await session.signIn(/** @type {HTMLInputElement} */ ($("lv-email")).value, /** @type {HTMLInputElement} */ ($("lv-password")).value);
    // The password field is cleared at once; nothing about the credentials is kept.
    /** @type {HTMLInputElement} */ ($("lv-password")).value = "";
    if (!ok) {
      $("lv-login-error").hidden = false;
      $("lv-login-error").textContent = "Login mislykkedes.";
      return;
    }
    $("lv-login").hidden = true;
    $("lv-session").textContent = "aktiv";
    body.dataset.session = "active";
    $("lv-logout").hidden = false;
    $("lv-game-region").hidden = false;
    host?.destroy();
    host = createLaerligverseHost({
      gameOrigin: c.gameOrigin,
      gameWindow: frame.contentWindow,
      postToGame: (m) => frame.contentWindow?.postMessage(m, c.gameOrigin),
      session,
      supabaseUrl: c.supabaseUrl,
      anonKey: c.anonKey,
      subject: c.subject ?? "historie",
      flags: reportedFlag,
      objectiveMap: c.objectiveMap ?? null,
      h5Submissions: c.h5 === true,
      sequence: c.sequence === true ? { contextOfStep: c.stepContexts } : null,
      randomId: () => crypto.randomUUID(),
      store: sessionStorage,
      onEvent: (e) => {
        if (e.type === "reject") body.dataset.lastReject = e.reason ?? "";
        if (e.type === "service-error") body.dataset.lastServiceError = e.code ?? "";
      },
    });
    // A new sign-in always loads a FRESH game document (a new bridge session). Re-assigning the same src is not
    // a reliable reload in every browser, so each sign-in gets its own URL.
    const url = new URL(c.gameUrl);
    url.searchParams.set("signin", String(++signIns));
    frame.src = url.toString();
    body.dataset.state = "running";
    $("lv-link").textContent = "forbinder";
    say("Spillet indlæses.");
  });

  window.addEventListener("message", (e) => {
    if (host === null) return;
    void host.handleMessage(e).then(() => {
      if (host.sessionNonce !== null) linked();
    });
  });

  $("lv-logout").addEventListener("click", () => void session.signOut());
  window.addEventListener("pagehide", () => host?.destroy());
}
