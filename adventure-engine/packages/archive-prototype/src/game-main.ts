import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@adventure-engine/app/style.css";
import "./game.css";
import { Game, type SaveServices } from "@adventure-engine/app/game";
import { gameReady } from "@adventure-engine/app/ready";
import { BridgeClient, BridgeError, type Action, type ClientStatus, type PresentBody } from "@adventure-engine/learning-bridge";
import { MemoryStorage } from "@adventure-engine/save";
import { HOST_ORIGIN, randomId } from "./config.ts";
import { CONTEXT_KEY, DRAWER_KEY, TASK_REQUEST_GLOBAL, archiveContent, archiveManifest } from "./content.ts";
import { IntroView } from "./intro-view.ts";
import { DECISION_POINTS, REVISION_KEY, REVISIT_KEY, type DecisionPoint } from "./sequence.ts";
import { ArchiveCardView, ReflectionView, RevisitView } from "./sequence-views.ts";
import { TaskView } from "./task-view.ts";

/**
 * Game page of the Arkivskabet prototype (D-307, v2 = D-322), loaded in an iframe on its own origin.
 *
 * It has no Supabase client, no session and no answer key. It reaches the learning system only through
 * the bridge (D-306): it asks for a task at the world's decision point, draws it as archive objects,
 * sends the pupil's committed action and lets the world react to the verdict. The engine's core is used
 * unchanged: the scene asks for a task by setting a global, and the verdict comes back as an event.
 *
 * D-322 learning sequence: 1 intro → (archive card, local practice) → 2 explore (turn the documents) →
 * 3 hypothesis with a reason → 4 feedback pointing at the relevant information → 5 revision on a NEW task →
 * 6 new application (drawer) → 7 reflection (local) → 8 revisit (LOCAL PROTOTYPE, no mastery).
 * Which situation it is lives in sequence.ts; what an answer COUNTS as is decided only by the server side.
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
  // Steps 7–8 start only once the world has said its line about the transfer verdict (idle world).
  let afterTransferPending = false;

  const intro = new IntroView(document.body);
  const archiveCard = new ArchiveCardView(document.body);
  const reflection = new ReflectionView(document.body);
  const revisit = new RevisitView(document.body);

  const pointFor = (key: string): DecisionPoint => DECISION_POINTS[key] ?? (DECISION_POINTS[CONTEXT_KEY] as DecisionPoint);

  /** Asks the host for a task at a decision point and shows it; a failure is shown, never swallowed. */
  const request = (key: string): Promise<void> => {
    const point = pointFor(key);
    busy = true;
    context = key;
    root.inert = true;
    return client
      .requestTask({ objectiveId: point.objectiveId, purpose: point.purpose, surface: "world", contextKey: key })
      .then(open)
      .catch((err: unknown) => {
        root.inert = true;
        view.show({ instanceToken: "none", kind: "choice", stimulus: { prompt: "Arkivaren kunne ikke finde en opgave.", options: null }, mode: "practice", hintsAvailable: 0, contextKey: key });
        view.error(err instanceof BridgeError ? `Ingen opgave lige nu (${err.code}).` : String(err));
      });
  };

  /** Steps 7 and 8 after the new application: reflection, then the (prototype) revisit task. */
  const afterTransfer = async (): Promise<void> => {
    busy = true;
    root.inert = true;
    await reflection.show();
    await revisit.show();
    await request(REVISIT_KEY);
  };

  const finish = (outcome: string): void => {
    view.hide();
    root.inert = false;
    current = null;
    lastAction = null;
    busy = false;
    // The world reacts to the verdict; it never computes one.
    const point = pointFor(context);
    if (outcome === "correct" || outcome === "incorrect" || outcome === "aborted") game.engine.event("cabinet", point.resultAction, { $outcome: outcome });
    if (context === DRAWER_KEY && (outcome === "correct" || outcome === "incorrect")) afterTransferPending = true;
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
    // Step 5: after an incorrect assessment, a NEW instance of the same objective — never the same task again.
    revise: () => {
      view.hide();
      current = null;
      lastAction = null;
      void request(REVISION_KEY);
    },
  });

  const open = (task: PresentBody): void => {
    current = task;
    context = task.contextKey;
    root.inert = true;
    const point = pointFor(task.contextKey);
    // Revision is offered only on the source assessment (practice), never on the transfer or the revisit.
    const allowRevision = task.contextKey === CONTEXT_KEY || task.contextKey === REVISION_KEY;
    view.show(task, { activity: { cls: point.activity.cls, label: point.activity.label }, allowRevision });
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
    if (afterTransferPending) {
      afterTransferPending = false;
      afterTransfer().catch((err: unknown) => console.error("[sequence] after transfer", err));
      return;
    }
    if (resume !== null) {
      const task = resume;
      resume = null;
      busy = true;
      open(task);
      return;
    }
    const req = game.engine.globals.get(TASK_REQUEST_GLOBAL);
    if (typeof req !== "string" || DECISION_POINTS[req] === undefined) return;
    game.engine.setGlobal(TASK_REQUEST_GLOBAL, "");
    busy = true;
    context = req;
    // Step 1: the pupil is introduced before the first task, never tested on what was not introduced;
    // the archive card then practises the four questions locally (never evidence).
    let introduced: Promise<void> = Promise.resolve();
    if (req === CONTEXT_KEY && game.engine.globals.get("intro_seen") !== true) {
      root.inert = true;
      introduced = intro
        .show()
        .then(() => archiveCard.show())
        .then(() => {
          game.engine.setGlobal("intro_seen", true);
        });
    }
    void introduced.then(() => request(req));
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
