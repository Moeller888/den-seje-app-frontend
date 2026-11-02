// D-321: the Lærligverse host page's DOM wiring (plain JavaScript, no build). All logic that can be
// tested without a browser lives in ./host-core.js.
//
// This page is NOT deployed: laerligverse/ is not in the deploy allowlist (tools/cloudflare-build-static.mjs).
// It runs under tools/laerligverse/serve-local.mjs (local preview) and the isolated test harness, which
// fill in the configuration and the Content-Security-Policy. In Lærlig it would use the existing
// supabase-js session (supabaseSessionProvider) instead of the local password sign-in shown here.
import { assertOrigin, createLaerligverseHost, passwordSessionProvider } from "./host-core.js";
import { BridgeHost } from "./bridge/index.js";

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const body = document.body;

function say(text) {
  $("lv-live").textContent = text;
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
  const { FakeTaskService, ARCHIVE_ITEMS } = await import("./dev/test-adapter.js");
  const frame = /** @type {HTMLIFrameElement} */ ($("lv-game"));
  const host = new BridgeHost({
    gameOrigin: assertOrigin(c.gameOrigin),
    gameWindow: frame.contentWindow,
    post: (m) => frame.contentWindow?.postMessage(m, c.gameOrigin),
    service: new FakeTaskService(ARCHIVE_ITEMS),
    randomId: () => crypto.randomUUID(),
    store: sessionStorage,
    onReject: (reason) => (body.dataset.lastReject = reason),
  });
  window.addEventListener("message", (e) => {
    void host.onMessage({ origin: e.origin, source: e.source, data: e.data }).then(() => {
      if (host.sessionNonce !== null) $("lv-link").textContent = "forbundet";
    });
  });
  $("lv-game-region").hidden = false;
  frame.src = c.gameUrl;
  body.dataset.state = "running";
  say("Spillet indlæses.");
}

function start(c) {
  $("lv-mode").hidden = false;
  $("lv-mode").textContent = c.mode === "isolated-test" ? "Isoleret testmiljø — syntetiske elever" : "Lokal udvikling — ikke Lærligs produktion";
  const session = passwordSessionProvider({ supabaseUrl: c.supabaseUrl, anonKey: c.anonKey });
  const frame = /** @type {HTMLIFrameElement} */ ($("lv-game"));
  let host = null;
  const reportedFlag = { laerligverseBackend: true }; // explicit, in this non-production page only

  session.onChange((s) => {
    if (s === "signed-out") {
      $("lv-session").textContent = "logget ud";
      body.dataset.session = "signed-out";
      $("lv-logout").hidden = true;
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
      randomId: () => crypto.randomUUID(),
      store: sessionStorage,
      onEvent: (e) => {
        if (e.type === "reject") body.dataset.lastReject = e.reason ?? "";
        if (e.type === "service-error") body.dataset.lastServiceError = e.code ?? "";
      },
    });
    frame.src = c.gameUrl;
    body.dataset.state = "running";
    $("lv-link").textContent = "forbinder";
    say("Spillet indlæses.");
  });

  window.addEventListener("message", (e) => {
    if (host === null) return;
    void host.handleMessage(e).then(() => {
      if (host.sessionNonce !== null) $("lv-link").textContent = "forbundet";
    });
  });

  $("lv-logout").addEventListener("click", () => void session.signOut());
  window.addEventListener("pagehide", () => host?.destroy());
}
