// D-315 TEST GAME — the adventure engine's REAL core running the Arkivskabet scene (unchanged content
// from adventure-engine/packages/archive-prototype/src/content.ts) with the bridge's game end. A
// minimal DOM view replaces the PixiJS renderer, so no build is needed; the world logic, the decision
// point (task_request) and the reaction to the verdict (bridge.result → set_variant) are the engine's own.
//
// The game never sees a session, an instance id or an answer key. World state is mirrored into DOM
// attributes so the test can observe it: data-cabinet (the cabinet's variant), data-cabinet-open.
import { loadContent } from "@adventure-engine/content";
import { Engine } from "@adventure-engine/core";
import { BridgeClient } from "/pkg/learning-bridge/src/client.ts";
import { CONTEXT_KEY, DRAWER_KEY, DRAWER_RESULT_ACTION, RESULT_ACTION, TASK_REQUEST_GLOBAL, archiveContent } from "/pkg/archive-prototype/src/content.ts";

const HOST_ORIGIN = "http://127.0.0.1:4330";
const RESULT_FOR = { [CONTEXT_KEY]: RESULT_ACTION, [DRAWER_KEY]: DRAWER_RESULT_ACTION };
const body = document.body;
const $ = (id) => document.getElementById(id);

// Presentation: every command completes at once; speech is listed (once per command) so the test can read it.
const said = new Set();
const engine = new Engine(loadContent(archiveContent), {
  seed: "harness",
  adapter: {
    onCommand(c) {
      if (c.type === "Say" && !said.has(c.cmdId)) {
        said.add(c.cmdId);
        const li = document.createElement("li");
        li.dataset.key = c.textKey;
        li.textContent = c.textKey;
        $("lines").append(li);
      }
      return { kind: "await" };
    },
  },
});

const client = new BridgeClient({
  hostOrigin: HOST_ORIGIN,
  hostWindow: window.parent,
  post: (m) => window.parent.postMessage(m, HOST_ORIGIN),
  randomId: () => crypto.randomUUID(),
  kinds: ["choice", "short_text"],
  contentId: "arkivskabet",
  contentVersion: "harness",
  onStatus: (s) => (body.dataset.bridge = s),
  onReject: (reason) => (body.dataset.lastReject = reason),
});
// Test evidence: everything the game ever receives, as text, so a test can prove no token reaches it.
const received = [];
window.__lvReceived = () => received.slice();
window.addEventListener("message", (e) => {
  try { received.push(JSON.stringify(e.data)); } catch { received.push("<unserialisable>"); }
  client.onMessage({ origin: e.origin, source: e.source, data: e.data });
});

let current = null;
let context = CONTEXT_KEY;
let selected = null;
let busy = false;
const reacted = new Set();

function mirror() {
  body.dataset.cabinet = engine.world.objects.get("cabinet")?.variant ?? "missing";
  body.dataset.cabinetOpen = String(engine.globals.get("cabinet_open"));
}

function show(task) {
  current = task;
  context = task.contextKey;
  selected = null;
  body.dataset.task = "open";
  body.dataset.kind = task.kind;
  $("task").hidden = false;
  $("prompt").textContent = task.stimulus.prompt;
  $("verdict").textContent = "";
  const opts = $("options");
  opts.replaceChildren();
  for (const o of task.stimulus.options ?? []) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.option = o.id;
    b.textContent = o.label;
    b.addEventListener("click", () => {
      selected = o.id;
      $("commit").disabled = false;
    });
    opts.append(b);
  }
  $("text").hidden = task.kind !== "short_text";
  $("text").value = "";
  $("text").oninput = () => ($("commit").disabled = $("text").value.trim() === "");
  $("commit").disabled = true;
}

async function commit() {
  if (current === null) return;
  const action = current.kind === "choice" ? { kind: "choice", payload: { optionId: selected } } : { kind: "short_text", payload: { text: $("text").value } };
  body.dataset.task = "waiting";
  try {
    const r = await client.act(current.instanceToken, action);
    body.dataset.task = r.outcome;
    body.dataset.retryable = String(r.retryable);
    $("verdict").textContent = r.feedback.text ?? r.outcome;
    // The world reacts to the server's verdict — once per instance, however many commits a double
    // click produced (the bridge already turned them into ONE server call). It never computes a verdict.
    if (r.outcome !== "pending" && r.outcome !== "aborted" && !reacted.has(r.instanceToken)) {
      reacted.add(r.instanceToken);
      engine.event("cabinet", RESULT_FOR[context] ?? RESULT_ACTION, { $outcome: r.outcome });
    }
    current = null;
    busy = false;
  } catch (err) {
    body.dataset.task = "error";
    body.dataset.error = err?.code ?? "unknown";
    busy = false;
  }
}
// Each click is a commit attempt, as a real double click would be; the bridge must cope.
$("commit").addEventListener("click", () => void commit());
$("use-cabinet").addEventListener("click", () => engine.click({ objectZone: "cabinet" }));

engine.newGame(); // newGame() itself delivers game.start

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  engine.advance(Math.max(0, Math.min(100, now - last)));
  last = now;
  for (const c of engine.pendingCommands()) engine.reply(c.cmdId, { kind: "done" });
  mirror();
  if (busy || body.dataset.bridge === "connecting") return;
  const req = engine.globals.get(TASK_REQUEST_GLOBAL);
  if (req !== CONTEXT_KEY && req !== DRAWER_KEY) return;
  engine.setGlobal(TASK_REQUEST_GLOBAL, "");
  busy = true;
  client
    .requestTask({ objectiveId: "hist.besaettelsen.h4", purpose: "check", surface: "world", contextKey: req })
    .then(show)
    .catch((err) => {
      body.dataset.task = "error";
      body.dataset.error = err?.code ?? "unknown";
      busy = false;
    });
}
requestAnimationFrame(frame);

client
  .connect()
  .then((open) => {
    body.dataset.bridge = "ready";
    if (open !== null) {
      busy = true;
      show(open); // resumption: the server's open instance comes back with the handshake
      body.dataset.resumed = "true";
    }
  })
  .catch((err) => (body.dataset.bridge = `failed:${err?.code ?? "unknown"}`));
