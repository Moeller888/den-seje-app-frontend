import "./host.css";
import { BridgeHost, type RejectReason } from "@adventure-engine/learning-bridge";
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
}
render();
setInterval(render, 250);
