// D-315 TEST HOST — the role the Lærlig page will play: it holds the pupil's session and is the only
// party that calls the backend. Here the backend is the REAL local stack (Edge Functions + PostgreSQL)
// through the REAL adapter (LaerligTaskService); nothing is mocked in this chain.
//
// The session is handed in by the test with window.__lvStart(...) and kept in this module's memory:
// never in the URL, never in storage, never posted to the game. Only the publishable anon key (public)
// and the pupil's own access token are used — never a service key.
import { BridgeHost, createLaerligTaskService } from "@adventure-engine/learning-bridge";

const GAME_ORIGIN = "http://127.0.0.1:4331";
const frame = document.getElementById("game");
const callsList = document.getElementById("calls");
const rejectsList = document.getElementById("rejects");

/** Test-only fault injection for process-event: "before" (never sent) or "after" (processed, response lost). */
const faults = [];
let session = null;
let host = null;

function li(list, text, data = {}) {
  const item = document.createElement("li");
  item.textContent = text;
  for (const [k, v] of Object.entries(data)) item.dataset[k] = String(v);
  list.append(item);
}

async function call(fn, body) {
  const fault = fn === "process-event" ? faults.shift() : undefined;
  if (fault === "before") {
    li(callsList, `${fn} (ikke sendt)`, { fn, sent: "false" });
    throw new TypeError("network down before the request");
  }
  const res = await fetch(`${session.supabaseUrl}/functions/v1/${fn}`, {
    method: "POST",
    headers: { apikey: session.anonKey, authorization: `Bearer ${session.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await res.json().catch(() => null);
  li(callsList, `${fn} → ${res.status}`, { fn, sent: "true", status: res.status });
  if (fault === "after") throw new TypeError("connection lost after the server answered");
  return { status: res.status, body: parsed };
}

window.__lvStart = ({ supabaseUrl, anonKey, accessToken }) => {
  session = { supabaseUrl, anonKey, accessToken };
  // The flag is OFF by default; this TEST host turns it on explicitly — the shipped frontend never does.
  const service = createLaerligTaskService({ laerligverseBackend: true }, { call, subject: "historie" });
  host = new BridgeHost({
    gameOrigin: GAME_ORIGIN,
    gameWindow: frame.contentWindow,
    post: (m) => frame.contentWindow?.postMessage(m, GAME_ORIGIN),
    service,
    randomId: () => crypto.randomUUID(),
    store: sessionStorage,
    retryDelaysMs: [200, 400, 800],
    callTimeoutMs: 15_000,
    onReject: (reason, detail) => li(rejectsList, `${reason}: ${detail}`, { reason }),
  });
  document.body.dataset.session = "active";
  frame.src = `${GAME_ORIGIN}/game.html`;
};

window.addEventListener("message", (e) => {
  void host?.onMessage({ origin: e.origin, source: e.source, data: e.data });
});

/** Test hooks (this page is never shipped). */
window.__lvFault = (kind) => faults.push(kind);
window.__lvExpireSession = () => {
  session = { ...session, accessToken: "expired.session.token" };
  document.body.dataset.session = "expired";
};
window.__lvReloadGame = () => {
  frame.src = `${GAME_ORIGIN}/game.html?reload=${Date.now()}`;
};
