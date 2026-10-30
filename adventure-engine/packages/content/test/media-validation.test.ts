import { describe, expect, it } from "vitest";
import { ContentValidationError, loadContent, programInfo, validateAssets, type ContentPackage, type MediaManifest } from "../src/index.ts";

function pkg(extra: Partial<ContentPackage> = {}): ContentPackage {
  return {
    game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", player: { actor: "hero" }, entry: null },
    scenes: [{ id: "room", entry: null, spots: { a: { x: 1, y: 1 } }, defaultSpot: "a", sounds: { hum: "s.hum" } }],
    actors: [{ id: "hero", scene: "room", entry: null, variants: { default: { sprite: "img.hero", animations: { walk: "a.walk" } } } }],
    objects: [{ id: "cup", container: { kind: "scene", id: "room" }, spot: "a", entry: null, icon: "img.cup", variants: { default: { sprite: "atlas.hero" } } }],
    animations: [{ id: "a.walk", atlas: "atlas.hero", instructions: [{ op: "fps", n: 8 }, { op: "loopRange", from: 0, to: 3 }] }],
    sounds: [{ id: "s.hum", asset: "snd.hum", channel: "ambient", volume: 0.5, durationMs: 1000 }],
    i18n: { da: {} },
    ...extra,
  };
}

function diag(p: unknown): string[] {
  try {
    return loadContent(p, { mode: "lenient" }).diagnostics.map((d) => `${d.code} ${d.path}`);
  } catch (e) {
    if (e instanceof ContentValidationError) return e.diagnostics.map((d) => `${d.code} ${d.path}`);
    throw e;
  }
}

describe("media validation (phase 4)", () => {
  it("a valid media package has no diagnostics; programInfo measures programs", () => {
    expect(diag(pkg())).toEqual([]);
    expect(programInfo({ instructions: [{ op: "fps", n: 10 }, { op: "play", from: 3, to: 0 }, { op: "wait", frames: 2 }, { op: "frame", n: 7 }] })).toEqual({ infinite: false, durationMs: 600, maxFrame: 7 });
    expect(programInfo({ instructions: [{ op: "loopRange", from: 1, to: 9 }] })).toMatchObject({ infinite: true, durationMs: 0, maxFrame: 9 });
  });

  it("animations: empty programs, bad instructions, fps, intervals, layers, signals, durations", () => {
    const bad = pkg({
      animations: [
        { id: "e", atlas: "x", instructions: [] },
        { id: "i", atlas: "x", instructions: [{ op: "frame", n: -1 }, { op: "play", from: 0, to: 1.5 }, { op: "wait", frames: 0 }, { op: "fps", n: 0 }, { op: "layer", name: "" }, { op: "signal", entity: "ghost", name: "x" }, { op: "jump" } as never, 5 as never] },
        { id: "l", atlas: "x", instructions: [{ op: "frame", n: 0 }, { op: "layerPop" }] },
        { id: "o", atlas: "x", instructions: [{ op: "layer", name: "face" }, { op: "frame", n: 0 }] },
        { id: "u", atlas: "x", instructions: [{ op: "loopRange", from: 0, to: 1 }, { op: "frame", n: 0 }], loop: true },
        { id: "z", atlas: "x", instructions: [{ op: "frame", n: 0 }], loop: true },
        { id: "n", atlas: "x", instructions: [{ op: "fps", n: 5 }] },
        { id: "long", atlas: "x", instructions: [{ op: "fps", n: 1 }, { op: "wait", frames: 40 }] },
        { id: "opts", atlas: "", instructions: [{ op: "frame", n: 0 }], defaultFps: 999, maxDuration: -1, loop: "yes" as never },
        { id: "e", atlas: "x", instructions: [{ op: "signal", entity: "hero", name: "ok" }, { op: "frame", n: 0 }] },
        null as never,
      ],
    });
    const d = diag(bad);
    expect(d).toEqual(
      expect.arrayContaining([
        "E-ANIM animations[0].instructions",
        "E-ANIM animations[1].instructions[0]",
        "E-ANIM animations[1].instructions[1]",
        "E-ANIM animations[1].instructions[2]",
        "E-ANIM animations[1].instructions[3]",
        "E-ANIM animations[1].instructions[4]",
        "E-REF animations[1].instructions[5].entity",
        "E-ANIM animations[1].instructions[6]",
        "E-ANIM animations[1].instructions[7]",
        "E-ANIM-LAYER animations[2].instructions[1]",
        "W-ANIM-LAYER-OPEN animations[3].instructions",
        "W-ANIM-UNREACHABLE animations[4].instructions[1]",
        "W-ANIM-UNREACHABLE animations[4].loop",
        "E-ANIM animations[5].instructions",
        "E-ANIM animations[6].instructions",
        "W-ANIM-DURATION animations[7].maxDuration",
        "E-NUMBER animations[8].defaultFps",
        "E-NUMBER animations[8].maxDuration",
        "E-SCHEMA animations[8].loop",
        "E-SCHEMA animations[8].atlas",
        "E-DUP-ID animations[9].id",
        "E-SCHEMA animations[10]",
      ]),
    );
    expect(d.filter((x) => x.includes("animations[9]") && !x.startsWith("E-DUP-ID"))).toEqual([]);
  });

  it("sounds, entity maps, volumes, times and cutscenes", () => {
    const d = diag(
      pkg({
        scenes: [
          {
            id: "room",
            entry: null,
            spots: { a: { x: 1, y: 1 } },
            defaultSpot: "a",
            sounds: { hum: "s.nope" },
            cutscenes: {
              none: { variants: {} },
              both: { variants: { da: { video: "v", timeline: [{ atMs: 0 }] } } },
              neither: { variants: { da: {} } },
              tl: { variants: { da: { timeline: [{ atMs: 50 }, { atMs: 10 }, { atMs: 900 }], durationMs: 500 } }, skippable: "y" as never, hold: 1 as never, skipAfterMs: -2 },
              empty: { variants: { default: { timeline: [] } } },
              vid: { variants: { default: { video: "v", durationMs: -3 } } },
              bad: 7 as never,
            },
          },
        ],
        sounds: [
          { id: "s.a", asset: "", channel: "radio" as never, volume: 2, durationMs: 0, persistAcrossScenes: "x" as never },
          { id: "s.b", asset: "b", channel: "sfx", durationMs: 100, loopStartMs: 50, loopEndMs: 40 },
          { id: "s.c", asset: "c", channel: "sfx", durationMs: 100, loopEndMs: 200 },
          { id: "s.d", asset: "d", channel: "music", loopStartMs: 0 },
          { id: "s.a", asset: "a", channel: "sfx" },
          null as never,
        ],
        graphs: [
          {
            id: "g",
            kind: "logic",
            nodes: [
              { id: "e", type: "entry", name: "e", next: ["p", "s", "t", "c", "v", "ok"] },
              { id: "p", type: "play_animation", entity: "hero", animation: "dance" },
              { id: "s", type: "sound_play", entity: "hero", sound: "nope", times: "loop" },
              { id: "t", type: "sound_stop", entity: "room", sound: "nope" },
              { id: "c", type: "cutscene", name: "missing" },
              { id: "v", type: "sound_play", entity: "room", sound: "s.a", volume: 3 },
              { id: "ok", type: "cutscene_clear" },
            ],
          },
        ],
      }),
    );
    expect(d).toEqual(
      expect.arrayContaining([
        "W-MEDIA-REF scenes[0].sounds.hum",
        "E-CUTSCENE scenes[0].cutscenes.none.variants",
        "E-CUTSCENE scenes[0].cutscenes.both.variants.da",
        "E-CUTSCENE scenes[0].cutscenes.neither.variants.da",
        "E-CUTSCENE scenes[0].cutscenes.tl.variants.da.timeline[1].atMs",
        "E-CUTSCENE scenes[0].cutscenes.tl.variants.da.timeline[2].atMs",
        "E-SCHEMA scenes[0].cutscenes.tl.skippable",
        "E-SCHEMA scenes[0].cutscenes.tl.hold",
        "E-NUMBER scenes[0].cutscenes.tl.skipAfterMs",
        "E-CUTSCENE scenes[0].cutscenes.empty.variants.default",
        "E-NUMBER scenes[0].cutscenes.vid.variants.default.durationMs",
        "E-CUTSCENE scenes[0].cutscenes.bad",
        "E-SCHEMA sounds[0].asset",
        "E-SOUND sounds[0].channel",
        "E-NUMBER sounds[0].volume",
        "E-NUMBER sounds[0].durationMs",
        "E-SCHEMA sounds[0].persistAcrossScenes",
        "E-SOUND sounds[1].loopStartMs",
        "E-SOUND sounds[2].loopStartMs",
        "E-DUP-ID sounds[4].id",
        "E-SCHEMA sounds[5]",
        "W-MEDIA-REF graphs[0].nodes[1].animation",
        "W-MEDIA-REF graphs[0].nodes[2].sound",
        "W-MEDIA-REF graphs[0].nodes[3].sound",
        "W-MEDIA-REF graphs[0].nodes[4].name",
        "E-NUMBER graphs[0].nodes[5].volume",
      ]),
    );
    expect(d.some((x) => x.includes("sounds[3]"))).toBe(false);
    expect(d.some((x) => x.includes("nodes[6]"))).toBe(false);
    expect(diag(pkg({ actors: [{ id: "hero", scene: "room", entry: null, variants: { default: { animations: { x: "a.nope" } } } }] }))).toContain("W-MEDIA-REF actors[0].variants.default.animations.x");
  });

  it("the manifest cross-check: unknown or wrongly typed assets, frames and layers outside atlases, malformed entries", () => {
    const manifest: MediaManifest = {
      "img.hero": { url: "/h.svg" },
      "atlas.hero": { kind: "atlas", url: "/a.svg", atlas: { frameWidth: 10, frameHeight: 10, frames: 4, layers: { face: { dx: 0, dy: 0 } } } },
      "snd.hum": { kind: "audio", formats: [{ url: "/h.ogg", type: "audio/ogg" }, { url: "/h.wav" }] },
      "img.bad": { formats: [] },
      "atlas.bad": { kind: "atlas", url: "/b.svg" },
      "vid.x": { kind: "video", url: "/x.mp4" },
    };
    expect(validateAssets(pkg(), manifest)).toEqual([
      { code: "E-ASSET-REF", level: "error", path: "manifest.img.bad", message: "an asset needs a url or formats with urls" },
      { code: "E-ASSET-REF", level: "error", path: "manifest.atlas.bad.atlas", message: "an atlas needs frameWidth, frameHeight, frames > 0 and optional columns > 0" },
      { code: "E-ASSET-REF", level: "error", path: "objects[0].icon", message: 'unknown asset "img.cup"' },
    ]);
    const p = pkg({
      animations: [
        { id: "a.walk", atlas: "atlas.hero", instructions: [{ op: "layer", name: "face" }, { op: "layer", name: "hat" }, { op: "frame", n: 4 }, { op: "play", from: 0, to: 9 }] },
        { id: "a.other", atlas: "img.hero", instructions: [{ op: "frame", n: 0 }] },
      ],
      sounds: [{ id: "s.hum", asset: "img.hero", channel: "sfx" }],
      scenes: [
        {
          id: "room",
          entry: null,
          spots: { a: { x: 1, y: 1 } },
          defaultSpot: "a",
          layers: [{ id: "bg", depth: 0, assets: { default: "vid.x" } }],
          cutscenes: { c: { variants: { default: { video: "img.hero" }, da: { timeline: [{ atMs: 0, asset: "nope" }], durationMs: 10 } } } },
        },
      ],
      actors: [{ id: "hero", scene: "room", entry: null, variants: { default: { sprite: "snd.hum", portrait: "atlas.hero" } } }],
    });
    expect(validateAssets(p, manifest).map((d) => `${d.code} ${d.path}`)).toEqual([
      "E-ASSET-REF manifest.img.bad",
      "E-ASSET-REF manifest.atlas.bad.atlas",
      "E-ANIM-FRAME animations[0].instructions[1]",
      "E-ANIM-FRAME animations[0].instructions[2]",
      "E-ANIM-FRAME animations[0].instructions[3]",
      "E-ASSET-REF animations[1].atlas",
      "E-ASSET-REF sounds[0].asset",
      "E-ASSET-REF actors[0].variants.default.sprite",
      "E-ASSET-REF actors[0].variants.default.portrait",
      "E-ASSET-REF objects[0].icon",
      "E-ASSET-REF scenes[0].layers[0].assets.default",
      "E-ASSET-REF scenes[0].cutscenes.c.variants.default.video",
      "E-ASSET-REF scenes[0].cutscenes.c.variants.da.timeline[0].asset",
    ]);
  });
});
