import { loadContent } from "@adventure-engine/content";
import { Engine, parseSave, saveChecksum, saveIntegrity, type Command, type Disposition, type SaveData, type SaveOutcome } from "@adventure-engine/core";
import { describe, expect, it } from "vitest";
import {
  Autosaver,
  DEFAULT_SETTINGS,
  IDB_STORE,
  IndexedDbMirror,
  MemoryStorage,
  SettingsStore,
  SlotManager,
  WebStorage,
  type IdbDatabaseLike,
  type IdbFactoryLike,
  type IdbRequestLike,
  type IdbStoreLike,
  type IdbTransactionLike,
  type IdbWriteRequestLike,
  type WebStorageLike,
  type WriteResult,
} from "../src/index.ts";

const rect = (x: number, y: number, w: number, h: number): Array<[number, number]> => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

const content = loadContent({
  game: { id: "harbour", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", player: { actor: "hero" }, entry: null },
  scenes: [
    { id: "a", entry: null, spots: { s: { x: 10, y: 650 } }, defaultSpot: "s", walkable: [rect(0, 600, 1280, 120)] },
    { id: "b", entry: null, spots: { s: { x: 10, y: 650 } }, defaultSpot: "s", walkable: [rect(0, 600, 1280, 120)] },
  ],
  portals: [
    { id: "ab", from: "a", to: "b", entry: null, arrivalSpot: "s" },
    { id: "ba", from: "b", to: "a", entry: null, arrivalSpot: "s" },
  ],
  actors: [{ id: "hero", scene: "a", spot: "s", entry: null, variants: { default: {} } }],
  graphs: [
    {
      id: "g",
      kind: "logic",
      nodes: [
        { id: "go", type: "entry", name: "go", modal: true, next: ["p"] },
        { id: "p", type: "portal_use", portal: "ab" },
        { id: "talk", type: "entry", name: "talk", modal: true, next: ["s"] },
        { id: "s", type: "say", speaker: "hero", textKey: "t" },
      ],
    },
  ],
  i18n: { da: { t: "x" } },
});

function engine(awaitSay = false) {
  const adapter = { onCommand: (c: Command): Disposition => (awaitSay && c.type === "Say" ? { kind: "await" } : { kind: "auto", afterMs: 0 }) };
  const e = new Engine(content, { seed: "s", adapter });
  e.newGame();
  return e;
}

function saveText(e: Engine, global?: number): string {
  if (global !== undefined) e.setGlobal("n", global);
  let out: SaveOutcome | null = null;
  e.requestSave((o) => {
    out = o;
  });
  const o = out as unknown as SaveOutcome;
  if (!o.ok) throw new Error("not idle");
  return o.json;
}

describe("slots: atomic writes and backups (spec 05 E5, TS-E09)", () => {
  it("first write mirrors to .bak; later writes keep the previous version as .bak; reads verify", async () => {
    const store = new MemoryStorage();
    const slots = new SlotManager(store, "harbour");
    const e = engine();
    const v1 = saveText(e, 1);
    const v2 = saveText(e, 2);
    expect(slots.read("slot1")).toEqual({ state: "empty" });
    const first = slots.write("slot1", v1);
    expect(first).toEqual({ ok: true, committed: expect.any(Promise) });
    // A synchronous store has committed already.
    await expect(first.ok && first.committed).resolves.toBe(true);
    expect(store.keys("engine:harbour:")).toEqual(["engine:harbour:slot1", "engine:harbour:slot1.bak"]);
    expect(store.get("engine:harbour:slot1.bak")).toBe(v1);
    slots.write("slot1", v2);
    expect(slots.read("slot1")).toEqual({ state: "ok", raw: v2 });
    expect(store.get("engine:harbour:slot1.bak")).toBe(v1);
    expect(slots.write("slot1", "{ not a save")).toEqual({ ok: false, message: "refusing to store a save that does not verify" });
    expect(slots.rawMain("slot1")).toBe(v2);
    expect(() => slots.read("../x")).toThrow(RangeError);
  });

  it("an interrupted write at any step leaves a loadable save; a damaged main file offers .bak", () => {
    const e = engine();
    const old = saveText(e, 1);
    const next = saveText(e, 2);
    for (let failAt = 0; failAt < 4; failAt++) {
      const store = new MemoryStorage();
      const slots = new SlotManager(store, "harbour");
      slots.write("slot1", old);
      slots.write("slot1", old);
      store.failAfterWrites(failAt);
      const r = slots.write("slot1", next);
      const s = slots.read("slot1");
      if (r.ok) expect(s).toEqual({ state: "ok", raw: next });
      else {
        expect(r.message).toMatch(/simulated interruption/);
        expect(s).toEqual({ state: "ok", raw: old });
      }
    }
    const store = new MemoryStorage();
    const slots = new SlotManager(store, "harbour");
    slots.write("slot2", old);
    slots.damage("slot2", old.slice(0, 40));
    expect(slots.read("slot2")).toEqual({ state: "corrupt", backup: old, reason: "damaged" });
    expect(slots.offersBackup("slot2")).toBe(true);
    expect(slots.restoreBackup("slot2")).toEqual({ ok: true, committed: expect.any(Promise) });
    expect(slots.read("slot2")).toEqual({ state: "ok", raw: old });
    expect(slots.restoreBackup("slot2")).toEqual({ ok: false, message: "no backup to restore" });
    store.set("engine:harbour:slot2.bak", "garbage");
    slots.damage("slot2", "x");
    expect([slots.read("slot2"), slots.offersBackup("slot2")]).toEqual([{ state: "corrupt", backup: null, reason: "damaged" }, false]);
    slots.write("slot3", old);
    store.remove("engine:harbour:slot3");
    // A missing main file next to its .bak counts as damaged.
    expect(slots.read("slot3")).toEqual({ state: "corrupt", backup: old, reason: "damaged" });
    store.failAfterWrites(0);
    expect(slots.restoreBackup("slot3").ok).toBe(false);
    expect(slots.used()).toEqual(["slot2", "slot3"]);
    slots.write("auto", old);
    slots.write("zzz", old);
    store.set("engine:harbour:settings", "{}");
    expect(slots.used()).toEqual(["auto", "slot2", "slot3", "zzz"]);
    slots.remove("slot2");
    expect(slots.read("slot2")).toEqual({ state: "empty" });
  });
});

describe("slot status: intact is not enough (follow-up)", () => {
  it("an intact save the content cannot load is not ok; a loadable .bak is offered; verdicts are cached", () => {
    const e = engine();
    const good = saveText(e, 1);
    const stale = saveText(e, 2);
    const checked: string[] = [];
    const store = new MemoryStorage();
    const slots = new SlotManager(store, "harbour", {
      loadable: (raw) => {
        checked.push(raw);
        return raw !== stale;
      },
    });
    slots.write("slot1", good);
    // The checksum matches, but this content can no longer load it (e.g. after a content update).
    store.set("engine:harbour:slot1", stale);
    expect(slots.read("slot1")).toEqual({ state: "corrupt", backup: good, reason: "unloadable" });
    expect(slots.offersBackup("slot1")).toBe(true);
    // Listing again parses nothing again.
    const before = checked.length;
    for (let i = 0; i < 5; i++) slots.read("slot1");
    expect(checked.length).toBe(before);
    expect(checked.filter((r) => r === stale)).toHaveLength(1);
    // A new save never moves an unloadable main file into .bak over a loadable one; it is kept in .held.
    const next = saveText(e, 3);
    expect(slots.write("slot1", next).ok).toBe(true);
    expect(store.get("engine:harbour:slot1.bak")).toBe(good);
    expect(slots.held("slot1")).toBe(stale);
    // Both unloadable: no backup is offered.
    store.set("engine:harbour:slot2", stale);
    store.set("engine:harbour:slot2.bak", stale);
    expect(slots.read("slot2")).toEqual({ state: "corrupt", backup: null, reason: "unloadable" });
    // Damaged bytes are reported as damaged, without asking the content.
    const asked = checked.length;
    store.set("engine:harbour:slot3", "{");
    expect(slots.read("slot3")).toEqual({ state: "corrupt", backup: null, reason: "damaged" });
    expect(checked.length).toBe(asked);
  });

  it("review: a loadable check that throws counts as unloadable and never breaks the listing or a new save", () => {
    const store = new MemoryStorage();
    const e = engine();
    const bad = saveText(e, 1);
    const slots = new SlotManager(store, "harbour", {
      loadable: (raw) => {
        if (raw === bad) throw new Error("migration bug");
        return true;
      },
    });
    store.set("engine:harbour:slot1", bad);
    expect(slots.read("slot1")).toEqual({ state: "corrupt", backup: null, reason: "unloadable" });
    const next = saveText(e, 2);
    expect(slots.write("slot1", next).ok).toBe(true);
    expect(slots.read("slot1")).toEqual({ state: "ok", raw: next });
  });

  it("the verdict cache stays bounded", () => {
    let calls = 0;
    const store = new MemoryStorage();
    const slots = new SlotManager(store, "harbour", {
      loadable: () => {
        calls++;
        return true;
      },
    });
    const e = engine();
    const texts = Array.from({ length: 40 }, (_, i) => saveText(e, i + 1));
    for (const t of texts) {
      store.set("engine:harbour:slot1", t);
      expect(slots.read("slot1").state).toBe("ok");
    }
    expect(calls).toBe(40);
    // The first texts were dropped when the cache filled up and are checked again; the last ones are not.
    store.set("engine:harbour:slot1", texts[0] as string);
    slots.read("slot1");
    expect(calls).toBe(41);
    store.set("engine:harbour:slot1", texts[39] as string);
    slots.read("slot1");
    expect(calls).toBe(41);
  });
});

describe("browser stores with fakes", () => {
  it("WebStorage wraps localStorage", () => {
    const data = new Map<string, string>();
    const ls: WebStorageLike = {
      get length() {
        return data.size;
      },
      key: (i) => [...data.keys()][i] ?? null,
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    };
    const s = new WebStorage(ls);
    s.set("engine:x:b", "2");
    s.set("engine:x:a", "1");
    s.set("other", "3");
    expect([s.get("engine:x:a"), s.keys("engine:x:")]).toEqual(["1", ["engine:x:a", "engine:x:b"]]);
    s.remove("engine:x:a");
    expect(s.get("engine:x:a")).toBeNull();
    const slots = new SlotManager(s, "harbour");
    expect(slots.write("slot1", saveText(engine(), 1)).ok).toBe(true);
  });

  /** A tiny in-memory IndexedDB: requests and transactions complete in microtasks. */
  function fakeIdb(
    options: {
      failOpen?: boolean;
      failTx?: boolean;
      failRead?: boolean;
      throwTxOnce?: boolean;
      preset?: Record<string, unknown>;
      /** Fail matching transactions as browsers do: `error` and then `abort` are both fired. */
      failWhen?: (ops: readonly string[]) => boolean;
      /** Which events a failure fires: a request error (then the transaction's error and abort), or only one of them. */
      failWith?: "request" | "error" | "abort";
      /** `put` of a key containing this throws synchronously (an uncloneable value); `abortThrows`: abort() throws too. */
      throwOnPut?: string;
      abortThrows?: boolean;
    } = {},
  ) {
    let throwNext = options.throwTxOnce === true;
    const records = new Map<string, unknown>(Object.entries(options.preset ?? {}));
    const commits: string[][] = [];
    let closed = false;
    let hasStore = false;
    const req = <T>(fn: () => T, fail = false): IdbRequestLike<T> => {
      const r: IdbRequestLike<T> = { result: undefined as T, error: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        if (fail) {
          r.error = new Error("blocked");
          r.onerror?.();
        } else {
          r.result = fn();
          r.onsuccess?.();
        }
      });
      return r;
    };
    const db: IdbDatabaseLike = {
      objectStoreNames: { contains: (n) => n === IDB_STORE && hasStore },
      createObjectStore: () => {
        hasStore = true;
        return {};
      },
      transaction: (_store, mode): IdbTransactionLike => {
        if (mode === "readwrite" && throwNext) {
          // A closed connection throws synchronously (InvalidStateError in browsers).
          throwNext = false;
          throw new Error("connection lost");
        }
        const ops: string[] = [];
        const requests: IdbWriteRequestLike[] = [];
        let aborted = false;
        const write = (op: string): IdbWriteRequestLike => {
          if (options.throwOnPut !== undefined && op.startsWith("put ") && op.includes(options.throwOnPut)) throw new Error("DataCloneError");
          ops.push(op);
          const r: IdbWriteRequestLike = { onerror: null };
          requests.push(r);
          return r;
        };
        const tx: IdbTransactionLike = {
          oncomplete: null,
          onerror: null,
          onabort: null,
          abort: () => {
            aborted = true;
            if (options.abortThrows === true) throw new Error("InvalidStateError");
          },
          objectStore: (): IdbStoreLike => ({
            put: (v, k) => write(`put ${k}=${v}`),
            delete: (k) => write(`delete ${k}`),
            getAllKeys: () => req(() => [...records.keys()]),
            getAll: () => req(() => [...records.values()], options.failRead === true),
          }),
        };
        if (mode === "readwrite") {
          queueMicrotask(() => {
            if (aborted) return;
            if (options.failTx === true) return tx.onerror?.();
            if (options.failWhen?.(ops) === true) {
              if (options.failWith === "request") requests[requests.length - 1]?.onerror?.();
              if (options.failWith !== "abort") tx.onerror?.();
              if (options.failWith !== "error") tx.onabort?.();
              return;
            }
            for (const op of ops) {
              const [verb, rest] = op.split(" ") as [string, string];
              if (verb === "put") records.set(rest.split("=")[0] as string, rest.slice(rest.indexOf("=") + 1));
              else records.delete(rest);
            }
            commits.push(ops);
            tx.oncomplete?.();
          });
        }
        return tx;
      },
      close: () => {
        closed = true;
      },
    };
    const factory: IdbFactoryLike = {
      open: () => {
        const r = req(() => db, options.failOpen === true) as IdbRequestLike<IdbDatabaseLike> & { onupgradeneeded: (() => void) | null };
        r.onupgradeneeded = null;
        r.result = db;
        queueMicrotask(() => r.onupgradeneeded?.());
        return r;
      },
    };
    return { factory, records, commits, isClosed: () => closed };
  }

  it("IndexedDbMirror: reads everything once, commits each slot write as one transaction", async () => {
    const idb = fakeIdb({ preset: { "engine:harbour:old": "1", "engine:harbour:bad": 7 } });
    const store = await IndexedDbMirror.open(idb.factory);
    expect([store.get("engine:harbour:old"), store.get("engine:harbour:bad"), store.keys("engine:")]).toEqual(["1", null, ["engine:harbour:old"]]);
    const slots = new SlotManager(store, "harbour");
    const raw = saveText(engine(), 1);
    expect(slots.write("slot1", raw).ok).toBe(true);
    store.set("engine:harbour:settings", "{}");
    store.remove("engine:harbour:old");
    store.transaction(() => {});
    await store.flush();
    expect(idb.commits.map((c) => c.map((op) => op.split("=")[0]))).toEqual([
      ["put engine:harbour:slot1.tmp", "put engine:harbour:slot1.bak", "put engine:harbour:slot1", "delete engine:harbour:slot1.tmp"],
      ["put engine:harbour:settings"],
      ["delete engine:harbour:old"],
    ]);
    expect(idb.records.get("engine:harbour:slot1")).toBe(raw);
    store.close();
    expect(idb.isClosed()).toBe(true);
  });

  it("IndexedDbMirror: a commit that throws synchronously is reported, flush says false once, later commits still reach the store", async () => {
    const idb = fakeIdb({ throwTxOnce: true });
    const store = await IndexedDbMirror.open(idb.factory);
    const errors: unknown[] = [];
    store.onError = (e) => errors.push(e);
    store.set("a", "1");
    expect(await store.flush()).toBe(false);
    expect(errors.map((e) => (e as Error).message)).toEqual(["connection lost"]);
    store.set("b", "2");
    expect(await store.flush()).toBe(true);
    expect(idb.records.get("b")).toBe("2");
    expect(idb.records.has("a")).toBe(false);
  });

  it("F4: a transaction that fires both error and abort is reported once", async () => {
    const store = await IndexedDbMirror.open(fakeIdb({ failWhen: () => true }).factory);
    const errors: unknown[] = [];
    store.onError = (e) => errors.push(e);
    store.set("engine:harbour:settings", "{}");
    expect(await store.flush()).toBe(false);
    expect(errors).toHaveLength(1);
    // A batch reports to its caller only, once, and never through onError as well.
    expect(await store.transaction(() => store.set("x", "1"))).toBe(false);
    expect(errors).toHaveLength(1);
  });

  it("F4: a failed settings write does not make the next successful save look failed", async () => {
    const store = await IndexedDbMirror.open(fakeIdb({ failWhen: (ops) => ops.some((op) => op.includes(":settings=")) }).factory);
    const errors: unknown[] = [];
    store.onError = (e) => errors.push(e);
    new SettingsStore(store, "harbour").update({ muted: true });
    const w = new SlotManager(store, "harbour").write("slot1", saveText(engine(), 1));
    expect(w.ok).toBe(true);
    expect(w.ok && (await w.committed)).toBe(true);
    // The settings failure is reported once, on its own.
    expect(errors).toHaveLength(1);
  });

  it("F4: a flush whose result is ignored neither hides nor moves a failure", async () => {
    const idb = fakeIdb({ failWhen: (ops) => ops.some((op) => op.includes("slot1")) });
    const store = await IndexedDbMirror.open(idb.factory);
    const errors: unknown[] = [];
    store.onError = (e) => errors.push(e);
    const slots = new SlotManager(store, "harbour");
    const failed = slots.write("slot1", saveText(engine(), 1));
    // A flush nobody looks at (restoreBackup or an import used to do this) …
    void store.flush();
    // … and a later, successful write of another slot.
    const good = slots.write("slot2", saveText(engine(), 1));
    expect(failed.ok && (await failed.committed)).toBe(false);
    expect(good.ok && (await good.committed)).toBe(true);
    // The slot write was tracked by its caller, so onError stays silent; flush itself keeps no state.
    expect(errors).toEqual([]);
    expect(await store.flush()).toBe(true);
    expect(idb.records.has("engine:harbour:slot2")).toBe(true);
    expect(idb.records.has("engine:harbour:slot1")).toBe(false);
  });

  it("F4: flush covers exactly the commits still pending when it is called", async () => {
    let failNext = true;
    const store = await IndexedDbMirror.open(
      fakeIdb({
        failWhen: () => {
          const f = failNext;
          failNext = false;
          return f;
        },
      }).factory,
    );
    store.set("a", "1");
    const first = store.flush();
    store.set("b", "2");
    const second = store.flush();
    expect(await first).toBe(false);
    // The second flush also waits for "a" (still pending when it was called) and therefore sees its failure …
    expect(await second).toBe(false);
    // … but a flush after everything settled starts clean.
    expect(await store.flush()).toBe(true);
    // A nested transaction joins its outer batch and shares its result.
    let inner: Promise<boolean> | null = null;
    const outer = store.transaction(() => {
      store.set("c", "3");
      inner = store.transaction(() => store.set("d", "4"));
    });
    expect(await outer).toBe(true);
    expect(await (inner as unknown as Promise<boolean>)).toBe(true);
    expect(await store.transaction(() => {})).toBe(true);
  });

  /** Fails the first `n` read-write transactions. */
  const failFirst = (n: number) => () => n-- > 0;

  it("review 2: after a failed slot commit the mirror is rolled back, and the next save keeps the newer save in .held in IndexedDB", async () => {
    const e = engine();
    const older = saveText(e, 1);
    const newer = newerFormat(saveText(e, 2));
    const K = "engine:harbour:auto";
    const idb = fakeIdb({ preset: { [K]: newer, [`${K}.bak`]: older }, failWhen: failFirst(1) });
    const store = await IndexedDbMirror.open(idb.factory);
    const slots = new SlotManager(store, "harbour", { loadable: (raw) => parseSave(raw, content).ok });
    const first = slots.write("auto", saveText(e, 3));
    expect(first.ok && (await first.committed)).toBe(false);
    // The mirror shows what IndexedDB really holds again.
    expect([store.get(K), store.get(`${K}.bak`), store.get(`${K}.held`), store.get(`${K}.tmp`)]).toEqual([newer, older, null, null]);
    expect(slots.read("auto")).toEqual({ state: "corrupt", backup: older, reason: "unloadable" });
    const fresh = saveText(e, 4);
    const second = slots.write("auto", fresh);
    expect(second.ok && (await second.committed)).toBe(true);
    expect(Object.fromEntries(idb.records)).toEqual({ [K]: fresh, [`${K}.bak`]: older, [`${K}.held`]: newer });
  });

  it("review 2: a batch whose callback throws rolls back created, changed and deleted keys", async () => {
    const idb = fakeIdb({ preset: { a: "1", b: "2" } });
    const store = await IndexedDbMirror.open(idb.factory);
    expect(() =>
      store.transaction(() => {
        store.set("new", "x");
        store.set("a", "9");
        store.remove("b");
        store.set("a", "10");
        store.set("b", "3");
        throw new Error("bug");
      }),
    ).toThrow("bug");
    expect([store.get("new"), store.get("a"), store.get("b"), store.keys("")]).toEqual([null, "1", "2", ["a", "b"]]);
    expect(await store.flush()).toBe(true);
    expect(idb.commits).toEqual([]);
  });

  it("review 2: a request error, a transaction error or an abort alone each roll back once and are reported once", async () => {
    for (const failWith of ["request", "error", "abort"] as const) {
      const idb = fakeIdb({ preset: { a: "1", b: "2" }, failWhen: failFirst(2), failWith });
      const store = await IndexedDbMirror.open(idb.factory);
      const errors: unknown[] = [];
      store.onError = (err) => errors.push(err);
      const batch = store.transaction(() => {
        store.set("new", "x");
        store.set("a", "9");
        store.remove("b");
      });
      store.remove("a");
      expect(await batch, failWith).toBe(false);
      expect(await store.flush(), failWith).toBe(false);
      expect([store.get("new"), store.get("a"), store.get("b")], failWith).toEqual([null, "1", "2"]);
      // The batch reported to its caller only; the single write once, through onError.
      expect(errors, failWith).toHaveLength(1);
      expect(Object.fromEntries(idb.records), failWith).toEqual({ a: "1", b: "2" });
    }
  });

  it("review 2: a nested batch shares the outer batch's values from before its first write", async () => {
    const store = await IndexedDbMirror.open(fakeIdb({ preset: { a: "1", b: "2" }, failWhen: failFirst(1) }).factory);
    const outer = store.transaction(() => {
      store.set("a", "outer");
      void store.transaction(() => {
        store.set("a", "inner");
        store.remove("b");
        store.set("c", "3");
      });
    });
    expect(await outer).toBe(false);
    expect([store.get("a"), store.get("b"), store.get("c")]).toEqual(["1", "2", null]);
  });

  it("review 2: a failed commit never undoes a later write; a later failure goes back to what the store holds", async () => {
    // First fails, second succeeds: the later value stays.
    const idb = fakeIdb({ preset: { k: "0" }, failWhen: failFirst(1) });
    const store = await IndexedDbMirror.open(idb.factory);
    store.set("k", "1");
    store.set("k", "2");
    store.set("other", "x");
    expect(await store.flush()).toBe(false);
    expect([store.get("k"), idb.records.get("k"), store.get("other")]).toEqual(["2", "2", "x"]);
    // Both fail: the mirror returns to the stored value, not to the first failed write.
    const idb2 = fakeIdb({ preset: { k: "0" }, failWhen: failFirst(2) });
    const store2 = await IndexedDbMirror.open(idb2.factory);
    store2.set("k", "1");
    const later = store2.transaction(() => store2.set("k", "2"));
    store2.set("k2", "y");
    expect(await later).toBe(false);
    expect(await store2.flush()).toBe(true);
    expect([store2.get("k"), store2.get("k2"), Object.fromEntries(idb2.records)]).toEqual(["0", "y", { k: "0", k2: "y" }]);
    // A key created by a failed write and deleted by a later successful one stays deleted.
    const idb3 = fakeIdb({ failWhen: failFirst(1) });
    const store3 = await IndexedDbMirror.open(idb3.factory);
    store3.set("n", "1");
    store3.remove("n");
    await store3.flush();
    expect([store3.get("n"), idb3.records.has("n")]).toEqual([null, false]);
  });

  it("review 2: a write that throws while the batch is queued aborts it: nothing of the batch is stored, the mirror is rolled back", async () => {
    for (const abortThrows of [false, true]) {
      const idb = fakeIdb({ preset: { a: "1" }, throwOnPut: "bad", abortThrows });
      const store = await IndexedDbMirror.open(idb.factory);
      const batch = store.transaction(() => {
        store.set("a", "2");
        store.set("bad", "x");
      });
      expect(await batch).toBe(false);
      await Promise.resolve();
      expect([store.get("a"), store.get("bad"), Object.fromEntries(idb.records)]).toEqual(["1", null, { a: "1" }]);
      expect(await store.transaction(() => store.set("a", "3"))).toBe(true);
      expect(idb.records.get("a")).toBe("3");
    }
  });

  /** Fails exactly the read-write transactions whose number (1-based) is listed. */
  const failNumbers = (...which: number[]) => {
    let n = 0;
    return () => which.includes(++n);
  };
  /** The mirror's whole content, to compare with what IndexedDB holds. */
  const mirrorOf = (store: IndexedDbMirror): Record<string, string> => Object.fromEntries(store.keys("").map((k) => [k, store.get(k) as string]));
  const committedOf = async (r: WriteResult): Promise<boolean | string> => (r.ok ? r.committed : r.message);

  describe("review 3: operations on one slot run one after another", () => {
    const K = "engine:harbour:auto";
    const loads = (raw: string): boolean => parseSave(raw, content).ok;

    it("two overlapping writes, the first fails: the newer save is held, and .bak never gets the failed write's data", async () => {
      const e = engine();
      const older = saveText(e, 1);
      const newer = newerFormat(saveText(e, 2));
      const idb = fakeIdb({ preset: { [K]: newer, [`${K}.bak`]: older }, failWhen: failNumbers(1) });
      const store = await IndexedDbMirror.open(idb.factory);
      const slots = new SlotManager(store, "harbour", { loadable: loads });
      const c1 = saveText(e, 3);
      const c2 = saveText(e, 4);
      const w1 = slots.write("auto", c1);
      const w2 = slots.write("auto", c2);
      expect([await committedOf(w1), await committedOf(w2)]).toEqual([false, true]);
      expect(Object.fromEntries(idb.records)).toEqual({ [K]: c2, [`${K}.bak`]: older, [`${K}.held`]: newer });
      expect(mirrorOf(store)).toEqual(Object.fromEntries(idb.records));
    });

    it("two overlapping writes that both succeed rotate in order", async () => {
      const e = engine();
      const idb = fakeIdb();
      const store = await IndexedDbMirror.open(idb.factory);
      const slots = new SlotManager(store, "harbour", { loadable: loads });
      const [c1, c2] = [saveText(e, 1), saveText(e, 2)];
      const results = await Promise.all([committedOf(slots.write("auto", c1)), committedOf(slots.write("auto", c2))]);
      expect(results).toEqual([true, true]);
      expect(Object.fromEntries(idb.records)).toEqual({ [K]: c2, [`${K}.bak`]: c1 });
      expect(idb.commits).toHaveLength(2);
    });

    it("three writes with a failure in the middle: the third plans from what the first stored", async () => {
      const e = engine();
      const idb = fakeIdb({ failWhen: failNumbers(2) });
      const store = await IndexedDbMirror.open(idb.factory);
      const slots = new SlotManager(store, "harbour", { loadable: loads });
      const [c1, c2, c3] = [saveText(e, 1), saveText(e, 2), saveText(e, 3)];
      const results = await Promise.all([c1, c2, c3].map((c) => committedOf(slots.write("auto", c))));
      expect(results).toEqual([true, false, true]);
      expect(Object.fromEntries(idb.records)).toEqual({ [K]: c3, [`${K}.bak`]: c1 });
      expect(mirrorOf(store)).toEqual(Object.fromEntries(idb.records));
    });

    it("a write overlapping a restore waits for it, and a restore overlapping a write plans from the written state", async () => {
      const e = engine();
      const good = saveText(e, 1);
      const idb = fakeIdb();
      const store = await IndexedDbMirror.open(idb.factory);
      const slots = new SlotManager(store, "harbour", { loadable: loads });
      expect(await committedOf(slots.write("slot1", good))).toBe(true);
      store.set("engine:harbour:slot1", "{");
      await store.flush();
      const next = saveText(e, 2);
      const restore = slots.restoreBackup("slot1");
      const write = slots.write("slot1", next);
      expect([await committedOf(restore), await committedOf(write)]).toEqual([true, true]);
      // The write saw the restored, loadable main and rotated it into .bak.
      expect(Object.fromEntries(idb.records)).toEqual({ "engine:harbour:slot1": next, "engine:harbour:slot1.bak": good });
      // Now the other way round: after the queued write the slot is fine, so the queued restore is refused.
      store.set("engine:harbour:slot1", "{");
      await store.flush();
      const write2 = slots.write("slot1", saveText(e, 3));
      const restore2 = slots.restoreBackup("slot1");
      expect(restore2.ok).toBe(true);
      expect([await committedOf(write2), await committedOf(restore2)]).toEqual([true, false]);
      expect(slots.read("slot1").state).toBe("ok");
    });

    it("operations on different slots do not wait for each other", async () => {
      const e = engine();
      const idb = fakeIdb({ failWhen: (ops) => ops.some((op) => op.includes("slot1")) });
      const store = await IndexedDbMirror.open(idb.factory);
      const slots = new SlotManager(store, "harbour", { loadable: loads });
      const s1 = saveText(e, 1);
      const s2 = saveText(e, 2);
      const w1 = slots.write("slot1", s1);
      const w2 = slots.write("slot2", s2);
      // slot2 ran at once (it is in the mirror already) although slot1 has not settled.
      expect(store.get("engine:harbour:slot2")).toBe(s2);
      expect([await committedOf(w1), await committedOf(w2)]).toEqual([false, true]);
      expect(Object.keys(Object.fromEntries(idb.records)).sort()).toEqual(["engine:harbour:slot2", "engine:harbour:slot2.bak"]);
    });

    it("a queued write that throws while planning, or a store whose commit rejects, counts as failed and the queue goes on", async () => {
      const e = engine();
      const store = new MemoryStorage();
      let reject = true;
      let gate!: () => void;
      const tx = Object.assign(Object.create(store) as MemoryStorage, {
        transaction: (fn: () => void): Promise<boolean> => {
          fn();
          if (reject) {
            reject = false;
            return new Promise((_, no) => (gate = () => no(new Error("lost"))));
          }
          return Promise.resolve(true);
        },
      });
      const slots = new SlotManager(tx, "harbour");
      const w1 = slots.write("auto", saveText(e, 1));
      // A store that throws for the queued write: refused when it runs.
      const throwing = slots.write("auto", saveText(e, 2));
      store.failAfterWrites(0);
      const w3 = slots.write("auto", saveText(e, 3));
      gate();
      expect([await committedOf(w1), await committedOf(throwing), await committedOf(w3)]).toEqual([false, false, true]);
    });
  });

  describe("review 5: remove() runs in the same per-slot queue", () => {
    const K = "engine:harbour:slot1";
    const loads = (raw: string): boolean => parseSave(raw, content).ok;
    const open = async (options: Parameters<typeof fakeIdb>[0] = {}) => {
      const idb = fakeIdb(options);
      const store = await IndexedDbMirror.open(idb.factory);
      return { idb, store, slots: new SlotManager(store, "harbour", { loadable: loads }) };
    };

    it("1. two pending writes and then remove: the slot ends deleted, and no queued write brings it back", async () => {
      const e = engine();
      const { idb, store, slots } = await open();
      const w1 = slots.write("slot1", saveText(e, 1));
      const w2 = slots.write("slot1", saveText(e, 2));
      const rm = slots.remove("slot1");
      expect([await committedOf(w1), await committedOf(w2), await committedOf(rm)]).toEqual([true, true, true]);
      expect(Object.fromEntries(idb.records)).toEqual({});
      expect(mirrorOf(store)).toEqual({});
      expect(slots.read("slot1")).toEqual({ state: "empty" });
      expect(await slots.flush()).toBe(true);
      expect(Object.fromEntries(idb.records)).toEqual({});
    });

    it("2. write, remove, write: the last write wins", async () => {
      const e = engine();
      const { idb, store, slots } = await open();
      const [c1, c3] = [saveText(e, 1), saveText(e, 3)];
      const results = [slots.write("slot1", c1), slots.remove("slot1"), slots.write("slot1", c3)];
      expect(await Promise.all(results.map(committedOf))).toEqual([true, true, true]);
      // The last write found an empty slot: .bak is a copy of it, nothing of c1 is left.
      expect(Object.fromEntries(idb.records)).toEqual({ [K]: c3, [`${K}.bak`]: c3 });
      expect(mirrorOf(store)).toEqual(Object.fromEntries(idb.records));
    });

    it("3. remove overlapping a restore runs in call order, both ways round", async () => {
      const e = engine();
      const good = saveText(e, 1);
      const { idb, store, slots } = await open();
      expect(await committedOf(slots.write("slot1", good))).toBe(true);
      store.set(K, "{");
      await store.flush();
      // Restore, then remove: the restore commits, the remove deletes everything after it.
      const restore = slots.restoreBackup("slot1");
      const rm = slots.remove("slot1");
      expect([await committedOf(restore), await committedOf(rm)]).toEqual([true, true]);
      expect(Object.fromEntries(idb.records)).toEqual({});
      // Remove, then restore: the queued restore plans from the empty slot and is refused.
      expect(await committedOf(slots.write("slot1", good))).toBe(true);
      store.set(K, "{");
      await store.flush();
      const rm2 = slots.remove("slot1");
      const restore2 = slots.restoreBackup("slot1");
      expect(restore2.ok).toBe(true);
      expect([await committedOf(rm2), await committedOf(restore2)]).toEqual([true, false]);
      expect(Object.fromEntries(idb.records)).toEqual({});
      expect(mirrorOf(store)).toEqual({});
    });

    it("4. a failed write followed by remove: the remove deletes what the store really holds", async () => {
      const e = engine();
      const [c0, c1] = [saveText(e, 0), saveText(e, 1)];
      const { idb, store, slots } = await open({ preset: { [K]: c1, [`${K}.bak`]: c0 }, failWhen: failNumbers(1) });
      const w = slots.write("slot1", saveText(e, 2));
      const rm = slots.remove("slot1");
      expect([await committedOf(w), await committedOf(rm)]).toEqual([false, true]);
      expect(Object.fromEntries(idb.records)).toEqual({});
      expect(mirrorOf(store)).toEqual({});
    });

    it("5. a failed remove is rolled back in the mirror and the store, and the next write goes on from there", async () => {
      const e = engine();
      const [c0, c1, c2] = [saveText(e, 0), saveText(e, 1), saveText(e, 2)];
      const newer = newerFormat(saveText(e, 9));
      const preset = { [K]: c1, [`${K}.bak`]: c0, [`${K}.held`]: newer };
      const { idb, store, slots } = await open({ preset, failWhen: failNumbers(1) });
      const rm = slots.remove("slot1");
      // The mirror shows the deletion at once …
      expect(store.get(K)).toBeNull();
      const w = slots.write("slot1", c2);
      expect([await committedOf(rm), await committedOf(w)]).toEqual([false, true]);
      // … and after the failure the queued write saw the slot as the store kept it: c1 rotated into .bak, .held untouched.
      expect(Object.fromEntries(idb.records)).toEqual({ [K]: c2, [`${K}.bak`]: c1, [`${K}.held`]: newer });
      expect(mirrorOf(store)).toEqual(Object.fromEntries(idb.records));
    });

    it("6. a remove on one slot neither waits for nor blocks another slot", async () => {
      const e = engine();
      const s2 = saveText(e, 2);
      const { idb, store, slots } = await open({ preset: { [K]: saveText(e, 1) }, failWhen: (ops) => ops.some((op) => op.includes("slot1")) });
      const w1 = slots.write("slot1", saveText(e, 3));
      const rm = slots.remove("slot1");
      const w2 = slots.write("slot2", s2);
      // slot2 ran at once although slot1 has two operations pending.
      expect(store.get("engine:harbour:slot2")).toBe(s2);
      expect([await committedOf(w1), await committedOf(rm), await committedOf(w2)]).toEqual([false, false, true]);
      expect(slots.read("slot1").state).toBe("ok");
      expect(Object.keys(Object.fromEntries(idb.records)).sort()).toEqual([K, "engine:harbour:slot2", "engine:harbour:slot2.bak"]);
      expect(mirrorOf(store)).toEqual(Object.fromEntries(idb.records));
    });

    it("7. main, .tmp, .bak and .held are deleted in one transaction", async () => {
      const e = engine();
      const preset = { [K]: saveText(e, 1), [`${K}.tmp`]: saveText(e, 2), [`${K}.bak`]: saveText(e, 0), [`${K}.held`]: newerFormat(saveText(e, 9)), "engine:harbour:slot2": saveText(e, 5) };
      const { idb, store, slots } = await open({ preset });
      expect(await committedOf(slots.remove("slot1"))).toBe(true);
      expect(idb.commits).toHaveLength(1);
      expect([...(idb.commits[0] as string[])].sort()).toEqual([K, `${K}.bak`, `${K}.held`, `${K}.tmp`].map((k) => `delete ${k}`));
      expect(Object.keys(Object.fromEntries(idb.records))).toEqual(["engine:harbour:slot2"]);
      expect(mirrorOf(store)).toEqual(Object.fromEntries(idb.records));
      expect(slots.used()).toEqual(["slot2"]);
    });

    it("8. flush() waits for queued slot operations and their commits; the store's own flush is narrower", async () => {
      const e = engine();
      const { idb, store, slots } = await open({ failWhen: failNumbers(2) });
      const settled: string[] = [];
      const w1 = slots.write("slot1", saveText(e, 1));
      const w2 = slots.write("slot1", saveText(e, 2));
      const rm = slots.remove("slot1");
      for (const [name, r] of [["w1", w1], ["w2", w2], ["rm", rm]] as const) void committedOf(r).then(() => settled.push(name));
      const flushed = slots.flush();
      // The store has only w1's commit so far; w2 and the remove wait in the slot queue.
      expect(await store.flush()).toBe(true);
      expect(await flushed).toBe(false); // w2 failed
      expect(settled.sort()).toEqual(["rm", "w1", "w2"]);
      expect(Object.fromEntries(idb.records)).toEqual({});
      // Nothing pending: true at once; a later operation is not part of an earlier flush.
      expect(await slots.flush()).toBe(true);
      const w3 = slots.write("slot1", saveText(e, 3));
      expect(await slots.flush()).toBe(true);
      expect(await committedOf(w3)).toBe(true);
      // A synchronous store has nothing to wait for.
      const sync = new SlotManager(new MemoryStorage(), "harbour");
      expect(await committedOf(sync.remove("slot1"))).toBe(true);
      expect(await sync.flush()).toBe(true);
    });

    it("an invalid slot name throws for remove as for write, before anything is queued", () => {
      const slots = new SlotManager(new MemoryStorage(), "harbour");
      expect(() => slots.remove("../x")).toThrow('invalid slot name "../x"');
      expect(() => slots.write("../x", saveText(engine(), 1))).toThrow('invalid slot name "../x"');
    });
  });

  describe("review 3: a nested transaction that throws fails the whole outer batch", () => {
    it("caught outside: nothing of the outer batch is committed, and the mirror matches IndexedDB", async () => {
      const idb = fakeIdb({ preset: { a: "1", c: "3" } });
      const store = await IndexedDbMirror.open(idb.factory);
      const outer = store.transaction(() => {
        store.set("a", "2");
        try {
          void store.transaction(() => {
            store.set("b", "new");
            store.remove("c");
            throw new Error("inner");
          });
        } catch {
          // The outer callback carries on …
        }
        store.set("d", "4");
      });
      // … but the batch fails and is rolled back as a whole.
      expect(await outer).toBe(false);
      expect(idb.commits).toEqual([]);
      expect(mirrorOf(store)).toEqual({ a: "1", c: "3" });
      expect(mirrorOf(store)).toEqual(Object.fromEntries(idb.records));
    });

    it("succeeding nested callbacks commit together; several levels behave the same", async () => {
      const idb = fakeIdb({ preset: { a: "1", c: "3" } });
      const store = await IndexedDbMirror.open(idb.factory);
      const ok = store.transaction(() => {
        store.set("a", "2");
        void store.transaction(() => {
          store.remove("c");
          void store.transaction(() => store.set("e", "5"));
        });
      });
      expect(await ok).toBe(true);
      expect(idb.commits).toHaveLength(1);
      expect(mirrorOf(store)).toEqual({ a: "2", e: "5" });
      expect(mirrorOf(store)).toEqual(Object.fromEntries(idb.records));
      // Three levels, the innermost throws, the middle one catches: the outermost still fails.
      const failed = store.transaction(() => {
        store.set("x", "1");
        void store.transaction(() => {
          store.remove("a");
          try {
            void store.transaction(() => {
              store.set("e", "changed");
              throw new Error("deep");
            });
          } catch {
            // caught in the middle
          }
        });
      });
      expect(await failed).toBe(false);
      expect(mirrorOf(store)).toEqual({ a: "2", e: "5" });
      expect(mirrorOf(store)).toEqual(Object.fromEntries(idb.records));
    });
  });

  it("IndexedDbMirror: failed open rejects (the app falls back to localStorage); failed commits are reported", async () => {
    await expect(IndexedDbMirror.open(fakeIdb({ failOpen: true }).factory)).rejects.toThrow("blocked");
    await expect(IndexedDbMirror.open(fakeIdb({ failRead: true }).factory)).rejects.toThrow("blocked");
    // Without an error handler a failed commit is still contained.
    const quiet = await IndexedDbMirror.open(fakeIdb({ failTx: true }).factory);
    quiet.set("k", "v");
    await quiet.flush();
    const failing = fakeIdb({ failTx: true });
    const store = await IndexedDbMirror.open(failing.factory);
    const errors: unknown[] = [];
    store.onError = (e) => errors.push(e);
    store.set("k", "v");
    await store.flush();
    expect(errors).toHaveLength(1);
    // Review 2: the failed write is rolled back, so the mirror shows what the store holds.
    expect(store.get("k")).toBeNull();
    let threw = false;
    try {
      store.transaction(() => {
        store.set("x", "1");
        throw new Error("boom");
      });
    } catch {
      threw = true;
    }
    await store.flush();
    expect(threw).toBe(true);
  });
});

describe("settings (stored apart from saves)", () => {
  it("defaults, field-wise validation and best-effort writes", () => {
    const store = new MemoryStorage();
    const s = new SettingsStore(store, "harbour");
    expect(s.load()).toEqual(DEFAULT_SETTINGS);
    expect(s.update({ muted: true, language: "en" })).toEqual({ muted: true, master: 1, language: "en" });
    expect(s.load()).toEqual({ muted: true, master: 1, language: "en" });
    store.set("engine:harbour:settings", '{"muted":"yes","master":7,"language":3}');
    expect(s.load()).toEqual(DEFAULT_SETTINGS);
    store.set("engine:harbour:settings", "not json");
    expect(s.load()).toEqual(DEFAULT_SETTINGS);
    store.set("engine:harbour:settings", "null");
    expect(s.load()).toEqual(DEFAULT_SETTINGS);
    store.failAfterWrites(0);
    expect(s.update({ master: 0.5 })).toEqual({ ...DEFAULT_SETTINGS, master: 0.5 });
  });
});

describe("autosave (spec 05 E3.2, TS-E03)", () => {
  it("saves after a finished transition, waits for idle, and retries a request made while busy", () => {
    const e = engine(true);
    const slots = new SlotManager(new MemoryStorage(), "harbour");
    const auto = new Autosaver(e, slots);
    const saved: string[] = [];
    auto.onSaved = (reason, r) => saved.push(`${reason}:${String(r.ok)}`);
    // With instant replies the whole transition starts and finishes inside one call, between two
    // frames: the autosaver must still notice it (it counts finished transitions instead of polling).
    e.run("g#go");
    expect(e.transitions()).toEqual([]);
    expect(e.completedTransitions).toBe(1);
    auto.tick();
    expect(saved).toEqual(["transition:true"]);
    expect(slots.read("auto").state).toBe("ok");
    e.run("g#talk");
    auto.request("hidden");
    expect(auto.pending).toBe("hidden");
    auto.tick();
    expect(saved).toHaveLength(1);
    const say = e.pendingCommands()[0] as Command;
    e.reply(say.cmdId, { kind: "done" });
    auto.tick();
    expect(saved).toEqual(["transition:true", "hidden:true"]);
    expect(auto.pending).toBeNull();
  });

  it("a save that cannot complete (logic started meanwhile) stays pending", () => {
    const e = engine();
    const slots = new SlotManager(new MemoryStorage(), "harbour");
    const auto = new Autosaver(e, slots);
    const original = e.requestSave.bind(e);
    e.requestSave = (done) => done({ ok: false, reason: "not-idle", blockers: ["running"] });
    auto.request("title");
    expect(auto.pending).toBe("title");
    e.requestSave = original;
    auto.tick();
    expect(auto.pending).toBeNull();
    expect(slots.read("auto").state).toBe("ok");
  });
});

/** A save written by a newer build: intact (checksum resealed), but this engine cannot load it. */
function newerFormat(raw: string): string {
  const d = JSON.parse(raw) as Record<string, unknown>;
  d["formatVersion"] = (d["formatVersion"] as number) + 1;
  d["checksum"] = saveChecksum(d as unknown as SaveData);
  return JSON.stringify(d);
}

describe("rotation: an intact save is never thrown away (review follow-up)", () => {
  const loads = (raw: string): boolean => parseSave(raw, content).ok;
  const K = "engine:harbour:auto";

  it("an autosave from an older build keeps a newer, unloadable save byte for byte; the new main loads", () => {
    const e = engine();
    const older = saveText(e, 1);
    const newer = newerFormat(saveText(e, 2));
    expect([saveIntegrity(newer), loads(newer)]).toEqual(["ok", false]);
    const store = new MemoryStorage();
    const slots = new SlotManager(store, "harbour", { loadable: loads });
    slots.write("auto", older);
    // A newer build saved over it (its rotation moved the older save to .bak).
    store.set(K, newer);
    expect(slots.read("auto")).toEqual({ state: "corrupt", backup: older, reason: "unloadable" });
    const fresh = saveText(e, 3);
    expect(slots.write("auto", fresh).ok).toBe(true);
    expect(slots.held("auto")).toBe(newer);
    expect(store.get(`${K}.bak`)).toBe(older);
    expect(slots.read("auto")).toEqual({ state: "ok", raw: fresh });
    expect(loads(slots.rawMain("auto") as string)).toBe(true);
    // Later saves rotate .bak as before and leave the held save alone.
    const fresher = saveText(e, 4);
    slots.write("auto", fresher);
    expect([store.get(K), store.get(`${K}.bak`), slots.held("auto")]).toEqual([fresher, fresh, newer]);
    // The slot is listed once; removing it removes the held save too.
    expect(slots.used()).toEqual(["auto"]);
    slots.remove("auto");
    expect(store.keys("engine:harbour:")).toEqual([]);
    expect(slots.held("auto")).toBeNull();
  });

  it("restoring the backup (also Fortsæt from a backup) keeps the replaced intact save; a damaged one is not kept", () => {
    const e = engine();
    const good = saveText(e, 1);
    const newer = newerFormat(saveText(e, 2));
    const store = new MemoryStorage();
    const slots = new SlotManager(store, "harbour", { loadable: loads });
    slots.write("slot1", good);
    store.set("engine:harbour:slot1", newer);
    expect(slots.restoreBackup("slot1").ok).toBe(true);
    expect(slots.read("slot1")).toEqual({ state: "ok", raw: good });
    expect(slots.held("slot1")).toBe(newer);
    // A later, different unloadable save replaces the held one (the most recent is kept).
    const newest = newerFormat(saveText(e, 3));
    store.set("engine:harbour:slot1", newest);
    expect(slots.restoreBackup("slot1").ok).toBe(true);
    expect(slots.held("slot1")).toBe(newest);
    // Damaged bytes are no save: restoring over them keeps nothing.
    slots.write("slot2", good);
    slots.damage("slot2", "{");
    expect(slots.restoreBackup("slot2").ok).toBe(true);
    expect(slots.held("slot2")).toBeNull();
  });

  it("retention is bounded on purpose: .bak is one generation, .held keeps only the most recent displaced save", () => {
    const e = engine();
    const n1 = newerFormat(saveText(e, 1));
    const n2 = newerFormat(saveText(e, 2));
    const store = new MemoryStorage();
    const slots = new SlotManager(store, "harbour", { loadable: loads });
    // A newer build saved twice: main = n2, .bak = n1 (both intact, neither loadable here).
    store.set(K, n2);
    store.set(`${K}.bak`, n1);
    const o1 = saveText(e, 3);
    const o2 = saveText(e, 4);
    // The older build's first save displaces n2 into .held and leaves .bak alone …
    slots.write("auto", o1);
    expect([store.get(K), store.get(`${K}.bak`), slots.held("auto")]).toEqual([o1, n1, n2]);
    // … its second save rotates .bak as usual: n1, an older generation, goes; n2 stays held.
    slots.write("auto", o2);
    expect([store.get(K), store.get(`${K}.bak`), slots.held("auto")]).toEqual([o2, o1, n2]);
    // A later displaced intact save replaces the held one.
    const n3 = newerFormat(saveText(e, 5));
    store.set(K, n3);
    slots.write("auto", saveText(e, 6));
    expect(slots.held("auto")).toBe(n3);
  });

  it("an interruption at any step of the rotation leaves the displaced save intact in main or .held", () => {
    const e = engine();
    const older = saveText(e, 1);
    const newer = newerFormat(saveText(e, 2));
    const fresh = saveText(e, 3);
    const outcomes = new Set<string>();
    for (let failAt = 0; failAt < 4; failAt++) {
      const store = new MemoryStorage();
      const slots = new SlotManager(store, "harbour", { loadable: loads });
      slots.write("auto", older);
      store.set(K, newer);
      store.failAfterWrites(failAt);
      const r = slots.write("auto", fresh);
      expect([store.get(K), slots.held("auto")]).toContain(newer);
      expect(store.get(`${K}.bak`)).toBe(older);
      if (r.ok) expect(store.get(K)).toBe(fresh);
      else expect(store.get(K)).toBe(newer);
      outcomes.add(r.ok ? "ok" : "failed");
    }
    expect([...outcomes].sort()).toEqual(["failed", "ok"]);
    // Retrying after the held copy was written but the main file was not: the copy is already there.
    const retry = new MemoryStorage();
    const again = new SlotManager(retry, "harbour", { loadable: loads });
    again.write("auto", older);
    retry.set(K, newer);
    retry.failAfterWrites(2);
    expect(again.write("auto", fresh).ok).toBe(false);
    expect([retry.get(K), again.held("auto")]).toEqual([newer, newer]);
    expect(again.write("auto", fresh).ok).toBe(true);
    expect([retry.get(K), again.held("auto"), retry.get(`${K}.bak`)]).toEqual([fresh, newer, older]);
    for (let failAt = 0; failAt < 3; failAt++) {
      const store = new MemoryStorage();
      const slots = new SlotManager(store, "harbour", { loadable: loads });
      slots.write("auto", older);
      store.set(K, newer);
      store.failAfterWrites(failAt);
      const r = slots.restoreBackup("auto");
      expect([store.get(K), slots.held("auto")]).toContain(newer);
      expect(r.ok).toBe(failAt > 1);
    }
    // A held copy that does not read back stops the write before the main file is touched.
    const store = new MemoryStorage();
    const liar = { get: (k: string) => (k.endsWith(".held") ? "different" : store.get(k)), set: (k: string, v: string) => store.set(k, v), remove: (k: string) => store.remove(k), keys: (p: string) => store.keys(p) };
    const slots = new SlotManager(liar, "harbour", { loadable: loads });
    slots.write("auto", older);
    store.set(K, newer);
    expect(slots.write("auto", fresh)).toEqual({ ok: false, message: "read-back of the held save differs" });
    expect(store.get(K)).toBe(newer);
  });
});

describe("slot and store edge cases", () => {
  it("a read-back mismatch and non-Error failures keep the old save; ties in slot order sort by name", () => {
    const raw = saveText(engine(), 1);
    const store = new MemoryStorage();
    const liar = { ...store, get: (k: string) => (k.endsWith(".tmp") ? "different" : store.get(k)), set: (k: string, v: string) => store.set(k, v), remove: (k: string) => store.remove(k), keys: (p: string) => store.keys(p) };
    expect(new SlotManager(liar, "harbour").write("slot1", raw)).toEqual({ ok: false, message: "read-back of the temporary file differs" });
    const thrower = { get: () => null, set: () => {
      throw "disk full";
    }, remove: () => {}, keys: () => [] };
    expect(new SlotManager(thrower, "harbour").write("slot1", raw)).toEqual({ ok: false, message: "disk full" });
    const ok = new MemoryStorage();
    const slots = new SlotManager(ok, "harbour");
    slots.write("slot1", raw);
    slots.damage("slot1", "x");
    const throwingSet = { get: (k: string) => ok.get(k), set: () => {
      throw "read only";
    }, remove: () => {}, keys: (p: string) => ok.keys(p) };
    expect(new SlotManager(throwingSet, "harbour").restoreBackup("slot1")).toEqual({ ok: false, message: "read only" });
    slots.write("gamma", raw);
    slots.write("alpha", raw);
    slots.write("beta", raw);
    expect(slots.used()).toEqual(["slot1", "alpha", "beta", "gamma"]);
  });

  it("restoreBackup runs as one transaction where the store has them", async () => {
    const store = new MemoryStorage();
    const calls: string[] = [];
    const tx = Object.assign(Object.create(store) as MemoryStorage, { transaction: (fn: () => void) => (calls.push("tx"), fn()) });
    const slots = new SlotManager(tx, "harbour");
    slots.write("slot1", saveText(engine(), 1));
    slots.damage("slot1", "x");
    const r = slots.restoreBackup("slot1");
    expect(r).toEqual({ ok: true, committed: expect.any(Promise) });
    // A store whose transaction returns nothing has committed synchronously.
    await expect(r.ok && r.committed).resolves.toBe(true);
    expect(calls).toEqual(["tx", "tx"]);
  });
});
