/**
 * Arkivskabet (D-307): the smallest playable Lærligverse scene. One room, one temporary figure marker,
 * one interactive object. GAME-SIDE ONLY: it holds world state and texts, never a question, an answer
 * key or a learning field. The academic task comes from the host through the learning bridge (D-306).
 *
 * The figure is a neutral placeholder (`marker.svg`), deliberately not the Lærlig avatar: the R3 avatar is
 * developed in its own track and is not touched here.
 */
import type { ContentPackage, Expr, ManifestEntry, MediaManifest } from "@adventure-engine/content";

type Pt = [number, number];
const rect = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const is = (v: string, c: string | boolean): Expr => ({ eq: [{ var: v }, { const: c }] });
const all = (...e: Expr[]): Expr => ({ and: e });

/** The world's decision point. The bridge asks for a task with this context key. */
export const CONTEXT_KEY = "arkivskab";
/** Global the scene sets when it wants a task; the game loop reads and clears it. */
export const TASK_REQUEST_GLOBAL = "task_request";
/** Event the game loop sends to the cabinet with `$outcome` = the server's verdict. */
export const RESULT_ACTION = "bridge.result";
/** D-310 phase 6: the drawer behind the opened cabinet asks for a NEW application task. */
export const DRAWER_KEY = "skuffe";
export const DRAWER_RESULT_ACTION = "bridge.result.skuffe";

export const archiveContent: ContentPackage = {
  game: {
    id: "arkivskabet",
    version: "0.1.0",
    formatVersion: 1,
    languages: ["da"],
    defaultLanguage: "da",
    player: { actor: "marker" },
    entry: "game#start",
    // World state only. Nothing here is learning data: mastery, XP and evidence live on the server.
    globals: { cabinet_open: false, transfer_done: false, intro_seen: false, [TASK_REQUEST_GLOBAL]: "" },
    viewport: { width: 1280, height: 720 },
    ui: { inventorySlots: 4, inventoryHeight: 96, reactWhenNothingHappens: false, fadeMs: 300, clickFeedbackMs: 200 },
  },
  scenes: [
    {
      id: "arkiv",
      nameKey: "s.arkiv",
      size: { width: 1280, height: 720 },
      entry: null,
      walkSpeed: 280,
      spots: {
        start: { x: 260, y: 660, facing: "right" },
        cabinet_spot: { x: 800, y: 660, facing: "right" },
        cabinet: { x: 950, y: 600 },
      },
      defaultSpot: "start",
      walkable: [rect(0, 610, 1280, 110)],
      layers: [{ id: "back", depth: 0, assets: { default: "bg.arkiv" } }],
      objectZones: [{ entity: "cabinet", polygon: rect(880, 340, 140, 260) }],
      speechRegions: {},
    },
  ],
  portals: [],
  actors: [
    {
      id: "marker",
      nameKey: "a.marker",
      scene: "arkiv",
      spot: "start",
      entry: null,
      hitBox: { width: 60, height: 170 },
      variants: { default: { sprite: "marker" } },
    },
  ],
  objects: [
    {
      id: "cabinet",
      nameKey: "o.cabinet",
      container: { kind: "scene", id: "arkiv" },
      spot: "cabinet",
      entry: "cabinet#main",
      variants: { default: { sprite: "cabinet.locked" }, open: { sprite: "cabinet.open" } },
    },
  ],
  graphs: [
    {
      id: "game",
      kind: "logic",
      nodes: [
        { id: "g0", type: "entry", name: "start", modal: true, next: ["g1"] },
        { id: "g1", type: "guard", expr: is("$action", "game.start"), next: ["g2"] },
        { id: "g2", type: "say", speaker: "marker", textKey: "line.intro", next: [] },
      ],
    },
    {
      id: "cabinet",
      kind: "logic",
      nodes: [
        { id: "c0", type: "entry", name: "main", next: ["c1", "r1", "r2", "r3", "d1", "d2", "d3"] },
        // Exploring is free and never a task (F0 11 §2.2 rule 6). Only the locked cabinet asks for one.
        { id: "c1", type: "guard", expr: is("$action", "interact"), next: ["c2"] },
        { id: "c2", type: "walk_to", actor: "marker", spot: "cabinet_spot", next: ["c3", "c5", "c6g"] },
        { id: "c3", type: "guard", expr: is("cabinet_open", false), next: ["c4"] },
        { id: "c4", type: "say", speaker: "marker", textKey: "line.cabinet_locked", next: ["c4b"] },
        { id: "c4b", type: "set", var: TASK_REQUEST_GLOBAL, value: CONTEXT_KEY, next: [] },
        // Phase 6 (D-310): behind the opened cabinet a drawer holds a new problem — the same method, a new claim.
        { id: "c5", type: "guard", expr: all(is("cabinet_open", true), is("transfer_done", false)), next: ["c5a"] },
        { id: "c5a", type: "say", speaker: "marker", textKey: "line.drawer", next: ["c5b"] },
        { id: "c5b", type: "set", var: TASK_REQUEST_GLOBAL, value: DRAWER_KEY, next: [] },
        { id: "c6g", type: "guard", expr: all(is("cabinet_open", true), is("transfer_done", true)), next: ["c6"] },
        { id: "c6", type: "say", speaker: "marker", textKey: "line.cabinet_is_open", next: [] },
        // The world reacts to the server's verdict; it never computes one.
        { id: "r1", type: "guard", expr: all(is("$action", RESULT_ACTION), is("$outcome", "correct")), next: ["r1a"] },
        { id: "r1a", type: "set_variant", entity: "cabinet", variant: "open", next: ["r1b", "r1c"] },
        { id: "r1b", type: "set", var: "cabinet_open", value: true, next: [] },
        { id: "r1c", type: "say", speaker: "marker", textKey: "line.unlocked", next: [] },
        { id: "r2", type: "guard", expr: all(is("$action", RESULT_ACTION), is("$outcome", "incorrect")), next: ["r2a"] },
        { id: "r2a", type: "say", speaker: "marker", textKey: "line.still_locked", next: [] },
        { id: "r3", type: "guard", expr: all(is("$action", RESULT_ACTION), is("$outcome", "aborted")), next: ["r3a"] },
        { id: "r3a", type: "say", speaker: "marker", textKey: "line.connection", next: [] },
        { id: "d1", type: "guard", expr: all(is("$action", DRAWER_RESULT_ACTION), is("$outcome", "correct")), next: ["d1a", "d1b"] },
        { id: "d1a", type: "set", var: "transfer_done", value: true, next: [] },
        { id: "d1b", type: "say", speaker: "marker", textKey: "line.drawer_done", next: [] },
        { id: "d2", type: "guard", expr: all(is("$action", DRAWER_RESULT_ACTION), is("$outcome", "incorrect")), next: ["d2a"] },
        { id: "d2a", type: "say", speaker: "marker", textKey: "line.drawer_wrong", next: [] },
        { id: "d3", type: "guard", expr: all(is("$action", DRAWER_RESULT_ACTION), is("$outcome", "aborted")), next: ["d3a"] },
        { id: "d3a", type: "say", speaker: "marker", textKey: "line.connection", next: [] },
      ],
    },
  ],
  animations: [],
  sounds: [],
  i18n: {
    da: {
      "s.arkiv": "Arkivet",
      "a.marker": "Dig",
      "o.cabinet": "Arkivskab",
      "line.intro": "Et arkiv, april 1940. Arkivaren samler kilder om den 9. april. Det låste skab åbner kun for den, der bruger kilderne rigtigt.",
      "line.cabinet_locked": "Skabet er låst. På hylden ligger fire kilder. Jeg skal finde den, der bedst kan undersøge en påstand.",
      "line.cabinet_is_open": "Skabet står åbent, og skuffen er tom. Kilderne er sat på plads.",
      "line.drawer": "I skuffen ligger en ny påstand og fire nye kilder. Samme metode, ny situation.",
      "line.drawer_done": "Skuffen glider i. Jeg brugte de samme tre spørgsmål på en ny påstand.",
      "line.drawer_wrong": "Den kilde passer ikke til den nye påstand. Hvem har lavet den, og hvad kunne de vide?",
      "line.unlocked": "Klik! Låsen giver efter, og skabet glider op.",
      "line.still_locked": "Låsen rører sig ikke. Jeg kan prøve igen med en ny opgave.",
      "line.connection": "Forbindelsen svigtede. Mit svar er gemt, så jeg kan sende det igen.",
      "ui.cannot.1": "Det går ikke.",
      "ui.title": "Arkivskabet",
      "ui.subtitle": "Lærligverse · lokal prototype med testadapter",
      "ui.start": "Nyt spil",
      "ui.language": "Sprog",
      "ui.lang.da": "Dansk",
      "ui.inventory": "Inventar",
      "ui.scroll_back": "Vis forrige genstande",
      "ui.scroll_forward": "Vis næste genstande",
      "ui.hotspots": "Ting i scenen",
      "ui.selected": "valgt",
      "ui.use_on": "Brug {item} på {target}",
      "ui.use_item": "Brug {item} på …",
      "ui.loading": "Indlæser …",
      "ui.continue": "Fortsæt",
      "ui.choose": "Vælg et svar",
      "ui.graphics_failed": "Grafikken kunne ikke startes. Spillet kan stadig spilles med listen over ting i scenen.",
      "ui.help_keys": "Tab: ting i scenen · Enter: vælg",
      "ui.sound": "Lyd",
      "ui.sound_off": "Lyd fra",
      "ui.skip": "Klik, Enter, mellemrum eller Esc springer over",
      "ui.menu": "Menu",
      "ui.resume": "Fortsæt spillet",
      "ui.save_game": "Gem spil",
      "ui.load_game": "Indlæs spil",
      "ui.export": "Eksportér gemt spil",
      "ui.import": "Importér gemt spil",
      "ui.to_title": "Til titelskærmen",
      "ui.back": "Tilbage",
      "ui.empty": "tom",
      "ui.corrupt": "beskadiget",
      "ui.unloadable": "kan ikke indlæses",
      "ui.backup_available": "sikkerhedskopi kan gendannes",
      "ui.restore_backup": "Gendan sikkerhedskopi",
      "ui.slot.auto": "Autogem",
      "ui.slot": "Plads {n}",
      "ui.playtime": "spilletid {time}",
      "ui.continue_game": "Fortsæt",
      "ui.continue_backup": "Fortsæt fra sikkerhedskopi",
      "ui.saved": "Spillet er gemt.",
      "ui.save_blocked": "Der kan kun gemmes, når der ikke sker noget i spillet.",
      "ui.save_failed": "Spillet kunne ikke gemmes: {reason}",
      "ui.loaded": "Spillet er indlæst.",
      "ui.loaded_repaired": "Spillet er indlæst. Nogle dele af det gemte spil blev rettet ({count}).",
      "ui.load_failed": "Det gemte spil kunne ikke indlæses ({code}).",
      "ui.backup_restored": "Sikkerhedskopien er gendannet.",
    },
  },
};

export function archiveManifest(base: string): MediaManifest {
  const files: Record<string, string> = {
    "bg.arkiv": "bg-arkiv.svg",
    marker: "marker.svg",
    "cabinet.locked": "cabinet-locked.svg",
    "cabinet.open": "cabinet-open.svg",
  };
  const out: Record<string, ManifestEntry> = {};
  for (const [id, file] of Object.entries(files)) out[id] = { kind: "image", url: `${base}assets/${file}` };
  return out;
}
