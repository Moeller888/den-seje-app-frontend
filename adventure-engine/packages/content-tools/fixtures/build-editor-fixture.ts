/**
 * The synthetic editor fixture "lantern-demo" (phase 6), built only through the
 * editor API: a new project, renames with reference updates, asset imports,
 * graph nodes and edges, the mirror helper and the translation matrix.
 * Everything (names, texts, pictures, the sound) is invented for the project.
 *
 * Content: two scenes (cellar, attic), a portal pair, the player Mira and Bo,
 * the objects lamp and wick, a dialog with a choice, the combination
 * wick → lamp (plus its explicit mirror rule), a trigger zone, an animation,
 * a looping sound, a timeline cutscene, Danish and English.
 */

import type { NodeDef, Value } from "@adventure-engine/content";
import { importAsset } from "../src/assets.ts";
import { addGraph, addNode, connect, mirrorCombination } from "../src/graph.ts";
import { setText } from "../src/i18n.ts";
import { newProject, withAssets, type Project } from "../src/project.ts";
import { rename } from "../src/refs.ts";

const enc = new TextEncoder();
type Pt = [number, number];
const rect = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const is = (v: string, c: Value) => ({ eq: [{ var: v }, { const: c }] }) as const;

/** A flat SVG picture (no scripts). */
function svg(w: number, h: number, body: string): Uint8Array {
  return enc.encode(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>\n`);
}

/** A short 8-bit mono WAV (8000 Hz) of a falling square-wave "drip"; deterministic. */
function drip(): Uint8Array {
  const n = 1600;
  const out = new Uint8Array(44 + n);
  const v = new DataView(out.buffer);
  const tag = (at: number, s: string): void => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  tag(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  tag(36, "data");
  v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) {
    const period = 8 + Math.floor(i / 80);
    const amp = Math.max(0, 60 - Math.floor(i / 30));
    out[44 + i] = 128 + (Math.floor(i / period) % 2 === 0 ? amp : -amp);
  }
  return out;
}

const must = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(`fixture step failed: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};

export function buildEditorFixture(): { readonly project: Project; readonly files: Map<string, Uint8Array> } {
  let p = newProject("lantern-demo", ["da", "en"]);
  let files = new Map<string, Uint8Array>();

  // The new project's scene and player are renamed; every reference follows.
  p = must(rename(p, { kind: "scene", id: "start" }, "cellar")).project;
  p = must(rename(p, { kind: "entity", id: "player" }, "mira")).project;
  p = must(rename(p, { kind: "spot", id: "begin", scope: "cellar" }, "start")).project;

  // Assets: pictures, an atlas, a sound.
  const add = (name: string, bytes: Uint8Array, extra: Partial<Parameters<typeof importAsset>[2]> = {}): void => {
    const r = must(importAsset(p, files, { name, bytes, license: "CC0-1.0", author: "adventure-engine project", source: "drawn for the editor fixture", ...extra }));
    p = r.project;
    files = r.files;
  };
  add("cellar.svg", svg(1280, 720, '<rect width="1280" height="720" fill="#2b2a33"/><rect y="560" width="1280" height="160" fill="#4a4036"/>'), { id: "bg.cellar" });
  add("attic.svg", svg(1280, 720, '<rect width="1280" height="720" fill="#3d3a4d"/><polygon points="0,200 640,20 1280,200" fill="#5b5068"/>'), { id: "bg.attic" });
  add("lamp.svg", svg(48, 64, '<rect x="14" y="10" width="20" height="44" rx="6" fill="#c9b27c"/>'), { id: "lamp" });
  add("lamp-lit.svg", svg(48, 64, '<circle cx="24" cy="24" r="22" fill="#ffd96a"/><rect x="14" y="10" width="20" height="44" rx="6" fill="#c9b27c"/>'), { id: "lamp.lit" });
  add("wick.svg", svg(48, 48, '<path d="M8 40 Q24 4 40 40" stroke="#e8e0d0" stroke-width="5" fill="none"/>'), { id: "icon.wick" });
  add("bo-atlas.svg", svg(128, 96, '<rect width="64" height="96" fill="#7aa3c4"/><rect x="64" width="64" height="96" fill="#8bb4d5"/>'), {
    id: "atlas.bo",
    kind: "atlas",
    atlas: { frameWidth: 64, frameHeight: 96, frames: 2, columns: 2 },
  });
  add("dawn.svg", svg(1280, 720, '<rect width="1280" height="720" fill="#f2b880"/><circle cx="640" cy="560" r="160" fill="#ffe2a8"/>'), { id: "img.dawn" });
  add("drip.wav", drip(), { id: "snd.drip" });

  // Scenes.
  const cellar = p.scenes[0];
  if (cellar === undefined) throw new Error("no scene");
  p = {
    ...p,
    scenes: [
      {
        ...cellar,
        nameKey: "s.cellar",
        entry: "cellar#enter",
        spots: { start: { x: 300, y: 640 }, shelf: { x: 900, y: 630, facing: "up" }, lamp: { x: 900, y: 470 }, stairs: { x: 1180, y: 640, facing: "right" }, arrive: { x: 1080, y: 650, facing: "left" } },
        walkable: [rect(0, 560, 1280, 160)],
        blockers: [rect(560, 560, 120, 40)],
        objectZones: [{ entity: "lamp", polygon: rect(870, 420, 60, 70) }],
        triggerZones: [{ id: "draft", entry: "cellar#draft", polygon: rect(1000, 560, 120, 160) }],
        sounds: { drip: "s.drip" },
        layers: [{ id: "back", depth: 0, assets: { default: "bg.cellar" } }],
        speechRegions: { mira: { x: 160, y: 300, width: 400, height: 120 } },
      },
      {
        id: "attic",
        nameKey: "s.attic",
        entry: "attic#enter",
        size: { width: 1280, height: 720 },
        spots: { hatch: { x: 200, y: 650, facing: "right" }, bo: { x: 900, y: 640 }, talk: { x: 760, y: 650, facing: "right" } },
        defaultSpot: "hatch",
        walkable: [rect(0, 590, 1280, 130)],
        actorZones: [{ actor: "bo", talkSpot: "talk", polygon: rect(860, 450, 80, 200) }],
        layers: [{ id: "back", depth: 0, assets: { default: "bg.attic" } }],
        cutscenes: { dawn: { variants: { da: { timeline: [{ atMs: 0, asset: "img.dawn", textKey: "cut.dawn" }], durationMs: 2000 }, default: { timeline: [{ atMs: 0, asset: "img.dawn" }], durationMs: 2000 } }, skippable: true } },
      },
    ],
    portals: [
      { id: "up", from: "cellar", to: "attic", nameKey: "p.up", entry: null, exitSpot: "stairs", arrivalSpot: "hatch", polygon: rect(1150, 300, 110, 260) },
      { id: "down", from: "attic", to: "cellar", nameKey: "p.down", entry: null, exitSpot: "hatch", arrivalSpot: "arrive", polygon: rect(120, 380, 120, 210) },
    ],
    actors: [
      { ...(p.actors[0] as Project["actors"][number]), nameKey: "a.mira", sounds: { drip: "s.drip" } },
      { id: "bo", nameKey: "a.bo", scene: "attic", spot: "bo", entry: null, dialog: "bo_talk#hello", variants: { default: { animations: { wave: "anim.bo.wave" } } } },
    ],
    objects: [
      { id: "lamp", nameKey: "o.lamp", container: { kind: "scene", id: "cellar" }, spot: "lamp", entry: "lamp#main", icon: "lamp", variants: { default: { sprite: "lamp" }, lit: { sprite: "lamp.lit" } } },
      { id: "wick", nameKey: "o.wick", container: { kind: "actor", id: "mira" }, entry: "wick#main", icon: "icon.wick", variants: { default: {} } },
    ],
    animations: [{ id: "anim.bo.wave", atlas: "atlas.bo", instructions: [{ op: "fps", n: 4 }, { op: "play", from: 0, to: 1 }, { op: "frame", n: 0 }] }],
    sounds: [{ id: "s.drip", asset: "snd.drip", channel: "ambient", volume: 0.5, durationMs: 200 }],
    game: { ...p.game, entry: "game#start", globals: { lamp_lit: false } },
  };

  // Graphs, node by node.
  const graph = (id: string, kind: "logic" | "dialog", nodes: readonly NodeDef[], edges: ReadonlyArray<readonly [string, string, number?]>): void => {
    p = addGraph(p, id, kind);
    nodes.forEach((n, i) => {
      p = addNode(p, id, n, { x: 40 + (i % 4) * 220, y: 40 + Math.floor(i / 4) * 140 });
    });
    for (const [from, to, order] of edges) p = connect(p, from, to, order ?? 0);
  };
  graph(
    "game",
    "logic",
    [
      { id: "gs0", type: "entry", name: "start", modal: true },
      { id: "gs1", type: "guard", expr: is("$action", "game.start") },
      { id: "gs2", type: "say", speaker: "mira", textKey: "line.intro" },
    ],
    [["gs0", "gs1"], ["gs1", "gs2"]],
  );
  graph(
    "cellar",
    "logic",
    [
      { id: "ce0", type: "entry", name: "enter" },
      { id: "ce1", type: "guard", expr: is("$action", "scene.enter") },
      { id: "ce2", type: "sound_play", entity: "cellar", sound: "drip", times: "loop", volume: 1 },
      { id: "cd0", type: "entry", name: "draft" },
      { id: "cd1", type: "guard", expr: is("$action", "zone.enter") },
      { id: "cd2", type: "say", speaker: "mira", textKey: "line.draft" },
    ],
    [["ce0", "ce1"], ["ce1", "ce2"], ["cd0", "cd1"], ["cd1", "cd2"]],
  );
  graph(
    "lamp",
    "logic",
    [
      { id: "la0", type: "entry", name: "main" },
      { id: "la1", type: "guard", expr: is("$action", "interact") },
      { id: "la2", type: "walk_to", actor: "mira", spot: "shelf" },
      { id: "la3", type: "move_object", object: "lamp", to: { kind: "actor", id: "mira" } },
      { id: "la4", type: "say", speaker: "mira", textKey: "line.lamp_taken" },
    ],
    [["la0", "la1"], ["la1", "la2"], ["la2", "la3"], ["la3", "la4"]],
  );
  graph(
    "wick",
    "logic",
    [
      { id: "wi0", type: "entry", name: "main" },
      { id: "wi1", type: "guard", expr: { and: [is("$action", "use.inventory"), is("$target", "lamp")] } },
      { id: "wi2", type: "set_variant", entity: "lamp", variant: "lit" },
      { id: "wi3", type: "move_object", object: "wick", to: { kind: "none" } },
      { id: "wi4", type: "set", var: "lamp_lit", value: true },
      { id: "wi5", type: "say", speaker: "mira", textKey: "line.lamp_lit" },
    ],
    [["wi0", "wi1"], ["wi1", "wi2"], ["wi1", "wi3", 1], ["wi1", "wi4", 2], ["wi4", "wi5"]],
  );
  graph(
    "attic",
    "logic",
    [
      { id: "at0", type: "entry", name: "enter" },
      { id: "at1", type: "guard", expr: is("$action", "scene.enter") },
      { id: "at2", type: "play_animation", entity: "bo", animation: "wave" },
      { id: "at3", type: "guard", expr: is("seen_dawn", false) },
      { id: "at4", type: "set", var: "seen_dawn", value: true },
      { id: "at5", type: "cutscene", name: "dawn" },
    ],
    [["at0", "at1"], ["at1", "at2"], ["at1", "at3", 1], ["at3", "at4"], ["at3", "at5", 1]],
  );
  graph(
    "bo_talk",
    "dialog",
    [
      { id: "bo0", type: "entry", name: "hello", modal: true },
      { id: "bo1", type: "say", speaker: "bo", textKey: "bo.hello" },
      { id: "bo2", type: "choice" },
      { id: "bo3", type: "say", speaker: "mira", textKey: "bo.ask_light" },
      { id: "bo4", type: "say", speaker: "bo", textKey: "bo.light" },
      { id: "bo5", type: "say", speaker: "mira", textKey: "bo.bye" },
      { id: "bo6", type: "end_dialog" },
    ],
    [["bo0", "bo1"], ["bo1", "bo2"], ["bo2", "bo3"], ["bo2", "bo5", 1], ["bo3", "bo4"], ["bo4", "bo2"], ["bo5", "bo6"]],
  );
  // The combination is written for one direction (wick on lamp); the helper adds the mirror rule explicitly.
  p = mirrorCombination(p, "wick", "lamp").project;

  // Texts (Danish and English, invented for the fixture).
  const texts: Record<string, [string, string]> = {
    "s.cellar": ["Kælderen", "The cellar"],
    "s.attic": ["Loftet", "The attic"],
    "p.up": ["Op ad trappen", "Up the stairs"],
    "p.down": ["Ned i kælderen", "Down to the cellar"],
    "a.mira": ["Mira", "Mira"],
    "a.bo": ["Bo", "Bo"],
    "o.lamp": ["Lampe", "Lamp"],
    "o.wick": ["Væge", "Wick"],
    "line.intro": ["Her er mørkt. Jeg må finde lys.", "It is dark here. I need some light."],
    "line.draft": ["Der trækker fra trappen.", "There is a draught from the stairs."],
    "line.lamp_taken": ["En gammel lampe uden væge.", "An old lamp without a wick."],
    "line.lamp_lit": ["Så er der lys!", "Now there is light!"],
    "bo.hello": ["Godmorgen, Mira.", "Good morning, Mira."],
    "bo.ask_light": ["Har du set noget lys?", "Have you seen any light?"],
    "bo.light": ["Solen står op om lidt.", "The sun rises soon."],
    "bo.bye": ["Vi ses.", "See you."],
    "cut.dawn": ["Solen står op over taget.", "The sun rises over the roof."],
  };
  for (const [key, [da, en]] of Object.entries(texts)) {
    p = setText(p, "da", key, da);
    p = setText(p, "en", key, en);
  }
  return { project: p, files: withAssets(p, files) };
}
