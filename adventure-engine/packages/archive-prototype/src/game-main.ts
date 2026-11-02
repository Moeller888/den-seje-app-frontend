import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@adventure-engine/app/style.css";
import "./game.css";
import { Game, type SaveServices } from "@adventure-engine/app/game";
import { gameReady } from "@adventure-engine/app/ready";
import { BridgeClient, BridgeError, type Action, type ClientStatus, type PresentBody } from "@adventure-engine/learning-bridge";
import { MemoryStorage } from "@adventure-engine/save";
import { HOST_ORIGIN, randomId } from "./config.ts";
import { CONTEXT_KEY, DRAWER_KEY, DRAWER_RESULT_ACTION, RESULT_ACTION, TASK_REQUEST_GLOBAL, archiveContent, archiveManifest } from "./content.ts";
import { IntroView } from "./intro-view.ts";
import { TaskView } from "./task-view.ts";

/**
 * D-310: the world's two decision points and what they ask the host for. The cabinet is guided practice
 * (hints allowed, never evidence); the drawer is a new application without hints. The server — here the
 * test adapter — decides what an answer counts as; the game only says which kind of situation it is.
 */
const DECISION_POINTS: Readonly<Record<string, { purpose: "practice" | "check"; resultAction: string }>> = {
  [CONTEXT_KEY]: { purpose: "practice", resultAction: RESULT_ACTION },
  [DRAWER_KEY]: { purpose: "check", resultAction: DRAWER_RESULT_ACTION },
};

/**
 * Game page of the Arkivskabet prototype (D-307), loaded in an iframe on its own origin.
 *
 * It has no Supabase client, no session and no answer key. It reaches the learning system only through
 * the bridge (D-306): it asks for a task at the world's decision point, draws it as archive objects,
 * sends the pupil's committed action and lets the world react to the verdict. The engine's core is used
 * unchanged: the scene asks for a task by setting a global, and the verdict comes back as an event.
 */

const KINDS = ["choice", "short_text"] as const;

const STATUS_TEXT: Readonly<Record<ClientStatus, string>> = {
  connecting: "Forbinder til Lærlig …",
  ready: "Forbundet",
  waiting: "Arkivaren ser på dit valg …",
  retrying: "Forbindelsen hakker – prøver igen …",
  offline: "Ingen forbindelse til Lærlig",
  unsupported: "Spillet skal opdateres",
};

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`#${id} is missing`);
  return node;
}

async function boot(): Promise<void> {
  const statusBadge = byId("lv-connection");
  const root = byId("game");
  const titleScreen = byId("title-screen");

  const client = new BridgeClient({
    hostOrigin: HOST_ORIGIN,
    hostWindow: window.parent,
    // Never "*": the message goes only to the configured host origin.
    post: (m) => window.parent.postMessage(m, HOST_ORIGIN),
    randomId,
    kinds: [...KINDS],
    contentId: archiveContent.game.id,
    contentVersion: archiveContent.game.version.replace(/[^A-Za-z0-9_-]/g, "_"),
    onStatus: (s) => {
      statusBadge.textContent = STATUS_TEXT[s];
      document.body.dataset["bridge"] = s;
      if (view.isOpen && (s === "waiting" || s === "retrying")) view.connection(STATUS_TEXT[s]);
    },
    onReject: (reason, detail) => console.warn(`[bridge] dropped a message (${reason}): ${detail}`),
  });
  window.addEventListener("message", (e: MessageEvent) => client.onMessage({ origin: e.origin, source: e.source, data: e.data }));

  // Saves hold world state only (the cabinet's variant and globals); learning data never enters them.
  const store: SaveServices = { storage: new MemoryStorage(), kind: "memory", flush: () => Promise.resolve(true) };
  const q = new URLSearchParams(window.location.search);
  const game = new Game(
    archiveContent,
    archiveManifest(import.meta.env.BASE_URL),
    { language: "da", reducedMotion: q.get("motion") === "off", dev: false, devBuild: false, zones: false, seed: "arkiv" },
    store,
  );

  let current: PresentBody | null = null;
  let context: string = CONTEXT_KEY;
  let lastAction: Action | null = null;
  let busy = false;

  const finish = (outcome: string): void => {
    view.hide();
    root.inert = false;
    current = null;
    lastAction = null;
    busy = false;
    // The world reacts to the verdict; it never computes one.
    const point = DECISION_POINTS[context] ?? DECISION_POINTS[CONTEXT_KEY];
    if ((outcome === "correct" || outcome === "incorrect" || outcome === "aborted") && point !== undefined) game.engine.event("cabinet", point.resultAction, { $outcome: outcome });
  };

  const send = async (action: Action): Promise<void> => {
    if (current === null) return;
    lastAction = action;
    view.waiting(STATUS_TEXT.waiting);
    try {
      view.result(await client.act(current.instanceToken, action));
    } catch (err) {
      if (err instanceof BridgeError && err.code === "session_expired") view.error("Du er blevet logget ud af Lærlig. Log ind igen, og åbn arkivet på ny.");
      else view.error(err instanceof BridgeError ? `Svaret kunne ikke afleveres (${err.code}). Prøv igen om lidt.` : String(err));
    }
  };

  const view = new TaskView(document.body, {
    commit: (action) => void send(action),
    hint: async (level) => {
      if (current === null) return;
      try {
        const h = await client.hint(current.instanceToken, level);
        view.showHint(h.level, h.text, h.hintsRemaining);
      } catch {
        view.hintFailed();
      }
    },
    // "Send again" resends through the same token; the host resends the stored, original answer.
    retry: () => {
      if (lastAction !== null) void send(lastAction);
    },
    close: (outcome) => finish(outcome),
  });

  const intro = new IntroView(document.body);
  const open = (task: PresentBody): void => {
    current = task;
    context = task.contextKey;
    root.inert = true;
    view.show(task);
  };

  game.setLanguage("da", false);
  await game.mount();
  gameReady(game);

  // Resumption: the server's open instance (one per pupil) comes with the handshake.
  let resume: PresentBody | null = null;
  client
    .connect()
    .then((openTask) => {
      if (openTask !== null && DECISION_POINTS[openTask.contextKey] !== undefined) resume = openTask;
    })
    .catch((err: unknown) => console.error("[bridge] handshake failed", err));

  const tick = (): void => {
    requestAnimationFrame(tick);
    if (busy || !titleScreen.hidden || !game.engine.idleReport().idle) return;
    if (resume !== null) {
      const task = resume;
      resume = null;
      busy = true;
      open(task);
      return;
    }
    const req = game.engine.globals.get(TASK_REQUEST_GLOBAL);
    const point = typeof req === "string" ? DECISION_POINTS[req] : undefined;
    if (point === undefined || typeof req !== "string") return;
    game.engine.setGlobal(TASK_REQUEST_GLOBAL, "");
    busy = true;
    context = req;
    // Phase 1: the pupil is introduced before the first task, never tested on what was not introduced.
    let introduced: Promise<void> = Promise.resolve();
    if (req === CONTEXT_KEY && game.engine.globals.get("intro_seen") !== true) {
      root.inert = true;
      introduced = intro.show().then(() => {
        game.engine.setGlobal("intro_seen", true);
      });
    }
    introduced
      .then(() => client.requestTask({ objectiveId: "hist.besaettelsen.h4", purpose: point.purpose, surface: "world", contextKey: req }))
      .then(open)
      .catch((err: unknown) => {
        root.inert = true;
        view.show({ instanceToken: "none", kind: "choice", stimulus: { prompt: "Arkivaren kunne ikke finde en opgave.", options: null }, mode: "practice", hintsAvailable: 0, contextKey: context });
        view.error(err instanceof BridgeError ? `Ingen opgave lige nu (${err.code}).` : String(err));
      });
  };
  requestAnimationFrame(tick);
}

boot().catch((err: unknown) => {
  const box = document.getElementById("notice");
  if (box !== null) {
    box.hidden = false;
    box.textContent = err instanceof Error ? err.message : String(err);
  }
  console.error(err);
});
