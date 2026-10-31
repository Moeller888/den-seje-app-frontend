import { loadContent } from "@adventure-engine/content";
import { ManualClock, SoundMixer } from "@adventure-engine/media";
import { describe, expect, it } from "vitest";
import { WebAudioBackend, browserAudioEnv, type AudioContextLike, type AudioEnv, type GainLike, type SourceLike } from "../src/index.ts";

/** Fake Web Audio: sources end when the test says so; everything is recorded. */
class FakeCtx implements AudioContextLike {
  state = "suspended";
  currentTime = 0;
  readonly destination = { name: "out" };
  readonly sources: FakeSource[] = [];
  readonly gains: FakeGain[] = [];
  resumeResult: "ok" | "refuse" = "ok";
  closed = false;
  decodeFails = false;
  resume(): Promise<void> {
    if (this.resumeResult === "refuse") return Promise.reject(new Error("NotAllowedError"));
    this.state = "running";
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
  decodeAudioData(data: ArrayBuffer): Promise<{ duration: number }> {
    return this.decodeFails ? Promise.reject(new Error("EncodingError")) : Promise.resolve({ duration: data.byteLength });
  }
  createGain(): GainLike {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBufferSource(): SourceLike {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
}

class FakeGain implements GainLike {
  connected = false;
  ramps: Array<[number, number]> = [];
  readonly gain = {
    value: 1,
    cancelScheduledValues: () => {},
    setValueAtTime: (v: number) => {
      this.gain.value = v;
    },
    linearRampToValueAtTime: (v: number, t: number) => {
      this.ramps.push([v, t]);
    },
  };
  connect(): void {
    this.connected = true;
  }
  disconnect(): void {
    this.connected = false;
  }
}

class FakeSource implements SourceLike {
  buffer: { duration: number } | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  connected = false;
  connect(): void {
    this.connected = true;
  }
  disconnect(): void {
    this.connected = false;
  }
  start(): void {
    this.started = true;
  }
  stop(): void {
    if (this.stopped) throw new Error("InvalidStateError");
    this.stopped = true;
  }
  end(): void {
    this.onended?.();
  }
}

function setup(options: { noAudio?: boolean } = {}) {
  const ctx = new FakeCtx();
  const clock = new ManualClock();
  const fetched: string[] = [];
  const env: AudioEnv = {
    createContext: () => (options.noAudio === true ? null : ctx),
    fetchBytes: async (url) => {
      fetched.push(url);
      if (url.includes("missing")) throw new Error("HTTP 404");
      return new ArrayBuffer(8);
    },
    canPlay: (type) => type === "audio/wav",
    setTimeout: (fn, ms) => clock.setTimer(ms, fn),
    clearTimeout: (id) => clock.clearTimer(id),
  };
  const backend = new WebAudioBackend(env, {
    "snd.a": { kind: "audio", formats: [{ url: "/a.ogg", type: "audio/ogg" }, { url: "/a.wav", type: "audio/wav" }] },
    "snd.b": { kind: "audio", url: "/b.wav" },
    "snd.c": { kind: "audio", url: "/c.wav" },
    "snd.gone": { kind: "audio", url: "/missing.wav" },
    "snd.none": { kind: "audio", formats: [{ url: "/n.ogg", type: "audio/ogg" }] },
  });
  return { ctx, clock, backend, fetched };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("Web Audio backend (fake browser media)", () => {
  it("locked until a user gesture; unlock resumes without waiting and notifies; a refused resume never hangs", async () => {
    const { backend, ctx } = setup();
    expect([backend.state, backend.locked]).toEqual(["locked", true]);
    let unlocked = 0;
    backend.unlockListener = () => unlocked++;
    expect(backend.unlock()).toBe("running");
    expect(backend.locked).toBe(false);
    expect(unlocked).toBe(1);
    expect(backend.unlock()).toBe("running");
    await flush();
    expect(ctx.state).toBe("running");
    const r = setup();
    r.ctx.resumeResult = "refuse";
    r.backend.unlock();
    await flush();
    expect(r.backend.state).toBe("refused");
    expect(setup({ noAudio: true }).backend.state).toBe("unavailable");
  });

  it("finite sounds repeat and end once; formats are chosen and buffers shared; fades disconnect the nodes", async () => {
    const { backend, ctx, clock, fetched } = setup();
    backend.unlock();
    const log: string[] = [];
    backend.start({ id: 1, asset: "snd.a", times: 2, volume: 0.5 }, { ended: () => log.push("ended 1"), failed: (m) => log.push(m) });
    backend.start({ id: 2, asset: "snd.a", times: "loop", volume: 0.3, loopStartMs: 100, loopEndMs: 900 }, { ended: () => log.push("ended 2"), failed: (m) => log.push(m) });
    await flush();
    expect(fetched).toEqual(["/a.wav"]);
    expect(ctx.sources.map((s) => [s.loop, s.loopStart, s.loopEnd])).toEqual([[false, 0, 0], [true, 0.1, 0.9]]);
    expect(backend.snapshot()).toEqual([
      { id: 1, asset: "snd.a", loop: false, volume: 0.5 },
      { id: 2, asset: "snd.a", loop: true, volume: 0.3 },
    ]);
    ctx.sources[0]?.end();
    expect(log).toEqual([]);
    expect(ctx.sources).toHaveLength(3);
    ctx.sources[2]?.end();
    expect(log).toEqual(["ended 1"]);
    backend.setVolume(2, 0.1);
    expect(ctx.gains[1]?.gain.value).toBe(0.1);
    backend.stop(2, 500);
    expect(ctx.gains[1]?.ramps).toEqual([[0, 0.5]]);
    expect(ctx.sources[1]?.stopped).toBe(false);
    backend.stop(2, 500);
    backend.setVolume(2, 1);
    clock.advance(500);
    expect(ctx.sources[1]).toMatchObject({ stopped: true, connected: false, onended: null });
    expect(ctx.gains[1]?.connected).toBe(false);
    expect(backend.liveCount).toBe(0);
  });

  it("load and decode failures report failed; no playable format; stop before the buffer arrives", async () => {
    const { backend, ctx } = setup();
    backend.unlock();
    const log: string[] = [];
    const cb = (id: number) => ({ ended: () => log.push(`ended ${id}`), failed: (m: string) => log.push(`failed ${id}: ${m}`) });
    backend.start({ id: 1, asset: "snd.gone", times: 1, volume: 1 }, cb(1));
    backend.start({ id: 2, asset: "snd.none", times: 1, volume: 1 }, cb(2));
    backend.start({ id: 3, asset: "snd.nope", times: 1, volume: 1 }, cb(3));
    backend.start({ id: 4, asset: "snd.b", times: 1, volume: 1 }, cb(4));
    backend.stop(4, 500);
    await flush();
    // Settlement order depends on promise timing; the set of outcomes does not.
    expect([...log].sort()).toEqual(["failed 1: HTTP 404", 'failed 2: no playable format for "snd.none"', 'failed 3: unknown audio asset "snd.nope"']);
    expect(ctx.sources).toHaveLength(0);
    ctx.decodeFails = true;
    // snd.b's buffer is cached from id 4 (decoded once per URL); snd.c is new.
    backend.start({ id: 5, asset: "snd.c", times: 1, volume: 1 }, cb(5));
    await flush();
    expect(log.at(-1)).toBe("failed 5: EncodingError");
    const none = setup({ noAudio: true });
    none.backend.start({ id: 1, asset: "snd.b", times: 1, volume: 1 }, cb(9));
    expect(log.at(-1)).toBe("failed 9: Web Audio is not available");
    expect(none.backend.unlock()).toBe("unavailable");
  });

  it("with the mixer: mute and volumes reach the gain nodes; dispose releases every node and closes the context", async () => {
    const { backend, ctx } = setup();
    const content = loadContent({
      game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", entry: null },
      scenes: [{ id: "s", entry: null, sounds: { hum: "s.hum" } }],
      sounds: [{ id: "s.hum", asset: "snd.a", channel: "ambient", volume: 0.5 }],
    });
    const mixer = new SoundMixer(content, backend, { warn: () => {} });
    backend.unlockListener = () => mixer.unlocked();
    mixer.play({ entity: "s", name: "hum", times: "loop", volume: 1, ownerRun: "r1" }, () => {});
    expect(mixer.playing()[0]?.queued).toBe(true);
    backend.unlock();
    await flush();
    expect(ctx.gains[0]?.gain.value).toBe(0.5);
    mixer.setMuted(true);
    expect(ctx.gains[0]?.gain.value).toBe(0);
    mixer.setMuted(false);
    expect(ctx.gains[0]?.gain.value).toBe(0.5);
    mixer.dispose();
    expect(ctx.sources[0]).toMatchObject({ stopped: true, connected: false });
    expect(ctx.closed).toBe(true);
    expect(backend.state).toBe("unavailable");
    expect(backend.liveCount).toBe(0);
  });
});

describe("Web Audio backend: preload and environment", () => {
  it("preload fetches and decodes once per URL and never rejects", async () => {
    const { backend, fetched } = setup();
    await backend.preload(["snd.a", "snd.b", "snd.gone", "snd.none", "snd.a"]);
    expect(fetched.sort()).toEqual(["/a.wav", "/b.wav", "/missing.wav"]);
    await backend.preload(["snd.b"]);
    expect(fetched).toHaveLength(3);
    await setup({ noAudio: true }).backend.preload(["snd.a"]);
  });

  it("a throwing context factory means no audio", () => {
    const env: AudioEnv = { createContext: () => { throw new Error("blocked"); }, fetchBytes: async () => new ArrayBuffer(0), canPlay: () => true, setTimeout: () => 0, clearTimeout: () => {} };
    expect(new WebAudioBackend(env, {}).state).toBe("unavailable");
  });

  it("browserAudioEnv uses AudioContext, fetch and canPlayType when they exist", async () => {
    const g = globalThis as Record<string, unknown>;
    const saved = { AudioContext: g["AudioContext"], document: g["document"], fetch: g["fetch"] };
    try {
      delete g["AudioContext"];
      delete g["document"];
      const bare = browserAudioEnv();
      expect(bare.createContext()).toBeNull();
      expect(bare.canPlay("audio/wav")).toBe(false);
      g["AudioContext"] = FakeCtx;
      g["document"] = { createElement: () => ({ canPlayType: (t: string) => (t === "audio/wav" ? "maybe" : "") }) };
      g["fetch"] = async (url: string) => (url.endsWith("404") ? { ok: false, status: 404 } : { ok: true, arrayBuffer: async () => new ArrayBuffer(3) });
      const env = browserAudioEnv();
      expect(env.createContext()).toBeInstanceOf(FakeCtx);
      expect([env.canPlay("audio/wav"), env.canPlay("audio/ogg")]).toEqual([true, false]);
      expect((await env.fetchBytes("/ok")).byteLength).toBe(3);
      await expect(env.fetchBytes("/404")).rejects.toThrow("HTTP 404 for /404");
      let fired = false;
      const id = env.setTimeout(() => {
        fired = true;
      }, 1);
      env.clearTimeout(id);
      await new Promise((r) => setTimeout(r, 5));
      expect(fired).toBe(false);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete g[k];
        else g[k] = v;
      }
    }
  });
});

describe("Web Audio backend: remaining paths", () => {
  it("state before the buffer arrives; loop sources ending; failures after stop; non-Error rejections; stop on an already stopped source; dispose with live sounds", async () => {
    const { backend, ctx } = setup();
    backend.unlock();
    const log: string[] = [];
    backend.start({ id: 1, asset: "snd.a", times: "loop", volume: 0.4 }, { ended: () => log.push("ended"), failed: (m) => log.push(m) });
    // No buffer yet: the snapshot reports the requested volume; volume changes wait for the nodes.
    expect(backend.snapshot()).toEqual([{ id: 1, asset: "snd.a", loop: true, volume: 0.4 }]);
    backend.setVolume(1, 0.9);
    await flush();
    ctx.sources[0]?.end();
    expect(log).toEqual([]);
    backend.start({ id: 2, asset: "snd.gone", times: 1, volume: 1 }, { ended: () => log.push("ended 2"), failed: (m) => log.push(`failed 2 ${m}`) });
    backend.stop(2, 0);
    await flush();
    expect(log).toEqual([]);
    const s = setup();
    s.backend.unlock();
    const odd = new WebAudioBackend(
      { createContext: () => s.ctx, fetchBytes: () => Promise.reject("offline"), canPlay: () => true, setTimeout: () => 0, clearTimeout: () => {} },
      { x: { kind: "audio", url: "/x.wav" } },
    );
    odd.unlock();
    odd.start({ id: 1, asset: "x", times: 1, volume: 1 }, { ended: () => {}, failed: (m) => log.push(`odd ${m}`) });
    await flush();
    expect(log).toEqual(["odd offline"]);
    if (ctx.sources[0] !== undefined) ctx.sources[0].stopped = true;
    backend.stop(1, 0);
    expect(backend.liveCount).toBe(0);
    backend.start({ id: 3, asset: "snd.b", times: "loop", volume: 1 }, { ended: () => {}, failed: () => {} });
    await flush();
    backend.dispose();
    expect(ctx.sources.at(-1)).toMatchObject({ stopped: true, connected: false });
    expect(backend.liveCount).toBe(0);
  });
});

describe("Web Audio backend: availability", () => {
  it("unavailable without Web Audio or after a refused resume, not while merely locked", async () => {
    expect(setup({ noAudio: true }).backend.unavailable).toBe(true);
    const s = setup();
    expect(s.backend.unavailable).toBe(false);
    s.ctx.resumeResult = "refuse";
    s.backend.unlock();
    await flush();
    expect(s.backend.unavailable).toBe(true);
  });
});
