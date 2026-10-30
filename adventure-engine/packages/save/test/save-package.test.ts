import { loadContent } from "@adventure-engine/content";
import { Engine, type Command, type Disposition, type SaveOutcome } from "@adventure-engine/core";
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
  type WebStorageLike,
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
    // A new save never moves an unloadable main file into .bak over a loadable one.
    const next = saveText(e, 3);
    expect(slots.write("slot1", next).ok).toBe(true);
    expect(store.get("engine:harbour:slot1.bak")).toBe(good);
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
        const tx: IdbTransactionLike = {
          oncomplete: null,
          onerror: null,
          onabort: null,
          objectStore: (): IdbStoreLike => ({
            put: (v, k) => void ops.push(`put ${k}=${v}`),
            delete: (k) => void ops.push(`delete ${k}`),
            getAllKeys: () => req(() => [...records.keys()]),
            getAll: () => req(() => [...records.values()], options.failRead === true),
          }),
        };
        if (mode === "readwrite") {
          queueMicrotask(() => {
            if (options.failTx === true) return tx.onerror?.();
            if (options.failWhen?.(ops) === true) {
              tx.onerror?.();
              tx.onabort?.();
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
    expect(store.get("k")).toBe("v");
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
