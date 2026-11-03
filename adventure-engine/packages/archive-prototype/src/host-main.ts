import "./host.css";
import { BridgeHost, assessObjectives, type ObjectiveAssessment, type RejectReason } from "@adventure-engine/learning-bridge";
import { FakeTaskService } from "@adventure-engine/learning-bridge/test-service";
import { GAME_ORIGIN, randomId } from "./config.ts";
import { ARCHIVE_ITEMS } from "./host-items.ts";

/**
 * Host page of the Arkivskabet prototype (D-307 Trin A). It stands in for the Lærlig page that holds the
 * pupil's session: it embeds the game from ANOTHER origin and is the only party that talks to the
 * "backend" — here the TEST ADAPTER (FakeTaskService), not Lærlig's server.
 *
 * The fake session token below exists only to prove the isolation: the game, on its own origin, cannot
 * read it. It is not a real token and authorises nothing.
 */

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`#${id} is missing`);
  return node as T;
}

try {
  localStorage.setItem("sb-test-auth-token", "TEST-ONLY-NOT-A-REAL-SESSION");
} catch {
  /* storage blocked: the isolation check in the e2e suite then has nothing to find either */
}

const service = new FakeTaskService(ARCHIVE_ITEMS);
const frame = byId<HTMLIFrameElement>("lv-game");
const rejects: string[] = [];

const host = new BridgeHost({
  gameOrigin: GAME_ORIGIN,
  // The WindowProxy of the iframe stays the same object across the frame's own navigations (reloads).
  gameWindow: frame.contentWindow,
  post: (m) => frame.contentWindow?.postMessage(m, GAME_ORIGIN),
  service,
  randomId,
  store: sessionStorage,
  // Short waits keep the prototype responsive; production would use the defaults.
  callTimeoutMs: 4000,
  retryDelaysMs: [300, 600, 1200],
  onReject: (reason: RejectReason, detail: string) => {
    rejects.push(`${reason}: ${detail}`);
    render();
  },
  onServiceError: (err) => console.warn("[host] backend error", err),
});

window.addEventListener("message", (e: MessageEvent) => {
  void host.onMessage({ origin: e.origin, source: e.source, data: e.data }).finally(render);
});

const q = new URLSearchParams(window.location.search);
frame.src = `${GAME_ORIGIN}/game.html${q.get("motion") === "off" ? "?motion=off" : ""}`;

byId("inject-network").addEventListener("click", () => {
  // Four transient failures: more than the host's three retries, so the game sees "aborted, retryable".
  service.injectFailures("network", "network", "network", "network");
  render();
});
// D-330: the revisit rule (FORSLAG ≥ 20 h) needs time to pass. Only the TEST ADAPTER's clock moves; nothing real.
let clockOffset = 0;
service.clock = () => Date.now() + clockOffset;
byId("advance-clock").addEventListener("click", () => {
  clockOffset += 20 * 3_600_000;
  render();
});
let reloads = 0;
byId("reload-game").addEventListener("click", () => {
  // A new URL always navigates (re-assigning the same src is not reliably a reload in every browser).
  const url = new URL(frame.src);
  url.searchParams.set("reload", String(++reloads));
  frame.src = url.toString();
});

function render(): void {
  byId("ledger-xp").textContent = String(service.xp);
  byId("ledger-coins").textContent = String(service.coins);
  byId("ledger-graded").textContent = String(service.gradedCount);
  byId("ledger-entries").textContent = String(service.ledger.length);
  const log = byId("ledger-rejects");
  log.replaceChildren(...rejects.slice(-8).map((r) => Object.assign(document.createElement("li"), { textContent: r })));
  byId("host-session").textContent = host.sessionNonce === null ? "ingen" : "aktiv";
  renderEvidence(assessObjectives(service.observations()));
}

// D-330: the evidence chain's classification of what the test adapter observed. A view, never a record.
const STATE_LABEL: ReadonlyArray<[keyof ObjectiveAssessment["states"], string]> = [
  ["introduced", "Introduceret"],
  ["practised", "Øvet"],
  ["supported", "Støttet præstation"],
  ["independent", "Selvstændig præstation"],
  ["applied", "Anvendelse i ny situation"],
  ["revisited", "Genbesøg"],
  ["documentedProgression", "Dokumenteret progression"],
];
const STATUS_LABEL = { observed: "observeret", not_observed: "ikke observeret", unknown: "ukendt" } as const;
let lastEvidence = "";
function renderEvidence(assessments: ObjectiveAssessment[]): void {
  const key = JSON.stringify(assessments);
  if (key === lastEvidence) return;
  lastEvidence = key;
  const box = byId("evidence-body");
  box.replaceChildren();
  if (assessments.length === 0) {
    box.append(Object.assign(document.createElement("p"), { textContent: "Endnu ingen besvarede opgaver." }));
    return;
  }
  for (const a of assessments) {
    const table = document.createElement("table");
    table.dataset["objective"] = a.objective;
    table.append(Object.assign(document.createElement("caption"), { textContent: `Mål (prototype-id): ${a.objective}` }));
    const tbody = document.createElement("tbody");
    for (const [state, label] of STATE_LABEL) {
      const v = a.states[state];
      const tr = document.createElement("tr");
      tr.dataset["state"] = state;
      const td = Object.assign(document.createElement("td"), { textContent: `${STATUS_LABEL[v.status]}: ${v.why.join(" ")}` });
      td.dataset["status"] = v.status;
      tr.append(Object.assign(document.createElement("th"), { scope: "row", textContent: label }), td);
      tbody.append(tr);
    }
    const eligible = a.evidence.filter((e) => e.eligible).length;
    const tr = document.createElement("tr");
    tr.dataset["state"] = "evidence";
    const td = Object.assign(document.createElement("td"), { textContent: `${eligible} af ${a.evidence.length} svar` });
    td.dataset["eligible"] = String(eligible);
    tr.append(Object.assign(document.createElement("th"), { scope: "row", textContent: "Kan bruges som evidens (K4)" }), td);
    tbody.append(tr);
    table.append(tbody);
    box.append(table);
  }
}
render();
setInterval(render, 250);
