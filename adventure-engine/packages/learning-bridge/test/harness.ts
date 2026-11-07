import { BridgeClient, type BridgeClientOptions, type ClientStatus } from "../src/client.ts";
import { BridgeHost, type BridgeHostOptions, type KeyValueStore } from "../src/host.ts";
import type { GameMessage, HostMessage, RejectReason } from "../src/protocol.ts";
import { FakeTaskService, type FakeItem } from "../src/test-service.ts";

export const HOST_ORIGIN = "https://xn--lrlig-sra.dk";
export const GAME_ORIGIN = "https://verden.xn--lrlig-sra.dk";

export const ITEMS: readonly FakeItem[] = [
  {
    id: "h4-kilde",
    objectiveId: "hist.besaettelsen.h4",
    kind: "choice",
    prompt: "Hvilken kilde viser bedst, hvad regeringen ønskede, at befolkningen skulle gøre 9. april 1940?",
    options: [
      { id: "opt_a", label: "Proklamationen fra kongen og regeringen" },
      { id: "opt_b", label: "En erindring skrevet i 1985" },
      { id: "opt_c", label: "En tysk soldats dagbog" },
      { id: "opt_d", label: "Et illegalt blad fra 1944" },
    ],
    answer: "opt_a",
    correctLabel: "Proklamationen fra kongen og regeringen",
    feedbackCorrect: "Ja. Proklamationen er regeringens egen meddelelse fra selve dagen.",
    feedbackIncorrect: "Ikke helt. Spørg: hvem skrev kilden, hvornår og til hvem?",
    hints: ["Hvem bestemte, hvad befolkningen skulle gøre?", "Kig efter en kilde fra 9. april selv.", "Det er regeringens egen tekst."],
  },
  {
    id: "h2-aar",
    objectiveId: "hist.besaettelsen.h2",
    kind: "short_text",
    prompt: "I hvilken by lå Rigsdagen?",
    options: null,
    answer: ["København"],
    correctLabel: "København",
    feedbackCorrect: "Rigtigt.",
    feedbackIncorrect: "Rigsdagen lå i København.",
    hints: [],
  },
  {
    id: "h2-orden",
    objectiveId: "hist.besaettelsen.h2.orden",
    kind: "order",
    prompt: "Læg begivenhederne i rækkefølge.",
    options: [
      { id: "ev_1", label: "9. april 1940" },
      { id: "ev_2", label: "29. august 1943" },
      { id: "ev_3", label: "5. maj 1945" },
    ],
    answer: ["ev_1", "ev_2", "ev_3"],
    correctLabel: "9. april 1940 → 29. august 1943 → 5. maj 1945",
    feedbackCorrect: "Rigtig rækkefølge.",
    feedbackIncorrect: "Tjek årstallene.",
    hints: ["Begynd med besættelsen."],
  },
];

export class MemoryStore implements KeyValueStore {
  readonly map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

/**
 * A host and a game wired like two windows: every message is structured-cloned and delivered as a
 * microtask, with the real origin and source checks. `dropToGame` / `dropToHost` lose messages.
 */
export function pair(over: {
  service?: FakeTaskService;
  store?: MemoryStore;
  host?: Partial<BridgeHostOptions>;
  client?: Partial<BridgeClientOptions>;
} = {}) {
  const hostWin = { window: "host" };
  const gameWin = { window: "game" };
  const service = over.service ?? new FakeTaskService(ITEMS);
  const store = over.store ?? new MemoryStore();
  let n = 0;
  // Deterministic ids keep the tests reproducible; the browser wiring uses crypto.randomUUID().
  const randomId = (): string => `r${(++n).toString(36)}`;
  const toGame: HostMessage[] = [];
  const toHost: GameMessage[] = [];
  const hostRejects: RejectReason[] = [];
  const clientRejects: RejectReason[] = [];
  const statuses: ClientStatus[] = [];
  const net = { dropToGame: 0, dropToHost: 0, hostUp: true };
  const ctx: { client: BridgeClient | null; host: BridgeHost | null } = { client: null, host: null };

  const makeHost = (): BridgeHost =>
    new BridgeHost({
      gameOrigin: GAME_ORIGIN,
      gameWindow: gameWin,
      service,
      store,
      randomId,
      post: (m) => {
        toGame.push(m);
        if (net.dropToGame > 0) {
          net.dropToGame--;
          return;
        }
        const data = structuredClone(m);
        queueMicrotask(() => ctx.client?.onMessage({ origin: HOST_ORIGIN, source: hostWin, data }));
      },
      onReject: (r) => hostRejects.push(r),
      ...over.host,
    });

  ctx.host = makeHost();
  ctx.client = new BridgeClient({
    hostOrigin: HOST_ORIGIN,
    hostWindow: hostWin,
    randomId,
    kinds: ["choice", "short_text", "order"],
    contentId: "arkivskabet",
    contentVersion: "1",
    post: (m) => {
      toHost.push(m);
      if (net.dropToHost > 0 || !net.hostUp) {
        if (net.dropToHost > 0) net.dropToHost--;
        return;
      }
      const data = structuredClone(m);
      queueMicrotask(() => void ctx.host?.onMessage({ origin: GAME_ORIGIN, source: gameWin, data }));
    },
    onStatus: (s) => statuses.push(s),
    onReject: (r) => clientRejects.push(r),
    ...over.client,
  });

  /** Deliver a raw message to the host as if the game (or an attacker) sent it. */
  const rawToHost = (data: unknown, origin = GAME_ORIGIN, source: unknown = gameWin) => ctx.host?.onMessage({ origin, source, data: structuredClone(data) });
  const rawToGame = (data: unknown, origin = HOST_ORIGIN, source: unknown = hostWin) => ctx.client?.onMessage({ origin, source, data: structuredClone(data) });

  return {
    ctx,
    get host() {
      return ctx.host as BridgeHost;
    },
    get client() {
      return ctx.client as BridgeClient;
    },
    /** Replace the host page (reload): same store and backend, new host object and new nonce on the next hello. */
    reloadHost() {
      ctx.host = makeHost();
    },
    service,
    store,
    toGame,
    toHost,
    hostRejects,
    clientRejects,
    statuses,
    net,
    gameWin,
    hostWin,
    rawToHost,
    rawToGame,
  };
}

/** Let queued microtasks and promise chains run. */
export async function flush(times = 20): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}
