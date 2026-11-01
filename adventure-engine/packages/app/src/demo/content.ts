/**
 * Synthetic demo written for this project: "Urmagerens eftermiddag" /
 * "The Clockmaker's Afternoon". Two scenes, one small combination puzzle
 * (oil can + feather → oiled feather → use on the stopped clock) and a
 * dialog with choices. All names, texts and pictures are original.
 *
 * Phase 4 media: Tove stands and walks with spritesheet animations in two
 * directions and shakes her head on "cannot"; the crow flaps when the yard is
 * entered and its animation signals core; the repaired clock chimes (signal)
 * and swings (loop). Sounds: a pick-up effect, the workroom's ambient hum and
 * a persistent theme. Cutscenes: "story" in the yard (Danish captions, a
 * caption-less default for other languages, skippable) and "finale" when the
 * clock runs again (held until the clock is used next). All media is made by
 * tools/media/gen-demo-media.py.
 *
 * Intended validation warnings:
 * - `o.feather` is empty in English to demonstrate the language fallback
 *   (spec 06 F7): the Danish text is shown and W-I18N-EMPTY is reported.
 * - The crow perches on a branch (`grounded: false`), outside the walk area
 *   (W-SPOT-UNWALKABLE).
 */

import type { ContentPackage, Expr, NodeDef } from "@adventure-engine/content";

type Pt = [number, number];
const rect = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const is = (v: string, c: string | boolean): Expr => ({ eq: [{ var: v }, { const: c }] });
const all = (...e: Expr[]): Expr => ({ and: e });

/** Animation names for every facing: the four leftward facings use the left animation. */
function facings(prefix: string, right: string, left: string): Record<string, string> {
  const out: Record<string, string> = { [prefix]: right };
  for (const f of ["right", "down_right", "up_right", "down", "up"]) out[`${prefix}.${f}`] = right;
  for (const f of ["left", "down_left", "up_left"]) out[`${prefix}.${f}`] = left;
  return out;
}

/** `use.inventory` rule for one combination direction; the content handles symmetry itself (spec 04 D4). */
function combine(prefix: string, other: string): NodeDef[] {
  return [
    { id: `${prefix}_c`, type: "guard", expr: all(is("$action", "use.inventory"), is("$target", other)), next: [`${prefix}_c1`, `${prefix}_c2`] },
    { id: `${prefix}_c1`, type: "move_object", object: "feather", to: { kind: "none" }, next: [] },
    { id: `${prefix}_c2`, type: "move_object", object: "oiled_feather", to: { kind: "actor", id: "tove" }, next: [`${prefix}_c3`] },
    { id: `${prefix}_c3`, type: "say", speaker: "tove", textKey: "line.feather_oiled", next: [] },
  ];
}

export const demoContent: ContentPackage = {
  game: {
    id: "clockmaker-demo",
    version: "0.3.0",
    formatVersion: 1,
    languages: ["da", "en"],
    defaultLanguage: "da",
    fallbackLanguage: "da",
    player: { actor: "tove" },
    entry: "game#start",
    globals: { clock_fixed: false, asked_who: false, asked_help: false, seen_story: false, chimed: false, crow_landed: false },
    viewport: { width: 1280, height: 720 },
    ui: { inventorySlots: 4, inventoryHeight: 96, reactWhenNothingHappens: true, cannotTextKeys: ["ui.cannot.1", "ui.cannot.2"], fadeMs: 500, clickFeedbackMs: 200 },
  },
  scenes: [
    {
      id: "workroom",
      nameKey: "s.workroom",
      size: { width: 1600, height: 720 },
      entry: "workroom#enter",
      sounds: { hum: "s.hum", theme: "s.theme" },
      cutscenes: {
        finale: { variants: { default: { timeline: [{ atMs: 0, asset: "img.finale", textKey: "cut.finale" }], durationMs: 2000 } }, hold: true },
      },
      walkSpeed: 260,
      spots: {
        start: { x: 300, y: 650 },
        clock_spot: { x: 600, y: 650, facing: "left" },
        shelf: { x: 1100, y: 640, facing: "up" },
        door: { x: 1500, y: 650, facing: "right" },
        arrive: { x: 1380, y: 660, facing: "left" },
        clock: { x: 520, y: 600 },
        oilcan: { x: 1100, y: 470 },
      },
      defaultSpot: "start",
      walkable: [rect(0, 600, 1600, 120)],
      blockers: [rect(760, 600, 160, 40)],
      layers: [
        { id: "back", depth: 0, assets: { default: "bg.workroom" } },
        { id: "front", depth: -100000, assets: { default: "fg.workroom" } },
      ],
      objectZones: [
        { entity: "clock", polygon: rect(470, 300, 100, 300) },
        { entity: "oilcan", polygon: rect(1070, 420, 60, 55) },
      ],
      speechRegions: {},
    },
    {
      id: "yard",
      nameKey: "s.yard",
      size: { width: 1280, height: 720 },
      entry: "yard#enter",
      cutscenes: {
        story: {
          variants: {
            da: {
              timeline: [
                { atMs: 0, asset: "img.story1", textKey: "cut.story1" },
                { atMs: 1500, asset: "img.story2", textKey: "cut.story2" },
              ],
              durationMs: 3000,
            },
            // Language-neutral fallback: the same pictures without captions.
            default: { timeline: [{ atMs: 0, asset: "img.story1" }, { atMs: 1500, asset: "img.story2" }], durationMs: 3000 },
          },
          skippable: true,
          skipAfterMs: 1000,
        },
      },
      walkSpeed: 260,
      spots: {
        gate: { x: 170, y: 660, facing: "right" },
        tree: { x: 820, y: 650, facing: "right" },
        crow: { x: 980, y: 560 },
        feather: { x: 560, y: 670 },
        feather_pick: { x: 520, y: 660, facing: "right" },
      },
      defaultSpot: "gate",
      walkable: [rect(0, 610, 1280, 110)],
      layers: [{ id: "back", depth: 0, assets: { default: "bg.yard" } }],
      objectZones: [{ entity: "feather", polygon: rect(530, 640, 60, 40) }],
      actorZones: [{ actor: "crow", talkSpot: "tree", polygon: rect(930, 470, 100, 95) }],
    },
  ],
  portals: [
    { id: "to_yard", from: "workroom", to: "yard", nameKey: "p.to_yard", entry: null, exitSpot: "door", arrivalSpot: "gate", polygon: rect(1460, 330, 110, 270) },
    { id: "to_workroom", from: "yard", to: "workroom", nameKey: "p.to_workroom", entry: null, exitSpot: "gate", arrivalSpot: "arrive", polygon: rect(70, 360, 120, 250) },
  ],
  actors: [
    {
      id: "tove",
      nameKey: "a.tove",
      scene: "workroom",
      spot: "start",
      entry: null,
      hitBox: { width: 60, height: 170 },
      sounds: { pickup: "s.pickup" },
      variants: {
        default: {
          sprite: "tove",
          animations: { ...facings("stand", "a.tove.stand.right", "a.tove.stand.left"), ...facings("walk", "a.tove.walk.right", "a.tove.walk.left"), cannot: "a.tove.cannot" },
        },
      },
    },
    {
      id: "crow",
      nameKey: "a.crow",
      scene: "yard",
      spot: "crow",
      entry: "crow#main",
      dialog: "crow_talk#first",
      grounded: false,
      hitBox: { width: 80, height: 90 },
      variants: { default: { sprite: "crow", animations: { stand: "a.crow.stand", flap: "a.crow.flap" } } },
    },
  ],
  objects: [
    { id: "clock", nameKey: "o.clock", container: { kind: "scene", id: "workroom" }, spot: "clock", entry: "clock#main", variants: { default: { sprite: "clock.stopped" }, running: { sprite: "clock.running", animations: { swing: "a.clock.swing", chime: "a.clock.chime" } } } },
    { id: "oilcan", nameKey: "o.oilcan", container: { kind: "scene", id: "workroom" }, spot: "oilcan", entry: "oilcan#main", icon: "icon.oilcan", variants: { default: { sprite: "oilcan" } } },
    { id: "feather", nameKey: "o.feather", container: { kind: "scene", id: "yard" }, spot: "feather", entry: "feather#main", icon: "icon.feather", variants: { default: { sprite: "feather" } } },
    { id: "oiled_feather", nameKey: "o.oiled_feather", container: { kind: "none" }, entry: "oiled_feather#main", icon: "icon.oiled_feather", variants: { default: {} } },
  ],
  graphs: [
    {
      id: "game",
      kind: "logic",
      nodes: [
        { id: "g0", type: "entry", name: "start", modal: true, next: ["g1"] },
        { id: "g1", type: "guard", expr: is("$action", "game.start"), next: ["g1m"] },
        // The theme persists across scenes; it waits for the audio unlock (first user gesture).
        { id: "g1m", type: "sound_play", entity: "workroom", sound: "theme", times: "loop", volume: 1, next: ["g2"] },
        { id: "g2", type: "say", speaker: "tove", textKey: "line.intro", next: [] },
      ],
    },
    {
      id: "workroom",
      kind: "logic",
      nodes: [
        { id: "w0", type: "entry", name: "enter", next: ["w1"] },
        { id: "w1", type: "guard", expr: is("$action", "scene.enter"), next: ["w2"] },
        // Ambient: stops (fades out) when the workroom is left (spec 06 F4).
        { id: "w2", type: "sound_play", entity: "workroom", sound: "hum", times: "loop", volume: 1, next: [] },
      ],
    },
    {
      id: "yard",
      kind: "logic",
      nodes: [
        { id: "y0", type: "entry", name: "enter", next: ["y1"] },
        { id: "y1", type: "guard", expr: is("$action", "scene.enter"), next: ["y2", "y3"] },
        { id: "y2", type: "play_animation", entity: "crow", animation: "flap", next: [] },
        { id: "y3", type: "guard", expr: is("seen_story", false), next: ["y4", "y5"] },
        { id: "y4", type: "set", var: "seen_story", value: true, next: [] },
        { id: "y5", type: "cutscene", name: "story", next: [] },
      ],
    },
    {
      id: "crow",
      kind: "logic",
      nodes: [
        { id: "cr0", type: "entry", name: "main", next: ["cr1"] },
        { id: "cr1", type: "guard", expr: all(is("$action", "signal"), is("$signal", "landed")), next: ["cr2"] },
        { id: "cr2", type: "set", var: "crow_landed", value: true, next: [] },
      ],
    },
    {
      id: "clock",
      kind: "logic",
      nodes: [
        { id: "k0", type: "entry", name: "main", next: ["k1", "ks"] },
        { id: "ks", type: "guard", expr: all(is("$action", "signal"), is("$signal", "chimed")), next: ["ks1"] },
        { id: "ks1", type: "set", var: "chimed", value: true, next: [] },
        // Using the clock removes the held finale picture first.
        { id: "k1", type: "guard", expr: is("$action", "interact"), next: ["kc"] },
        { id: "kc", type: "cutscene_clear", next: ["k2"] },
        { id: "k2", type: "walk_to", actor: "tove", spot: "clock_spot", next: ["k3", "k5"] },
        { id: "k3", type: "guard", expr: is("clock_fixed", false), next: ["k4"] },
        { id: "k4", type: "say", speaker: "tove", textKey: "line.clock_stopped", next: [] },
        { id: "k5", type: "guard", expr: is("clock_fixed", true), next: ["k6"] },
        { id: "k6", type: "say", speaker: "tove", textKey: "line.clock_ticks", next: [] },
      ],
    },
    {
      id: "oilcan",
      kind: "logic",
      nodes: [
        { id: "o0", type: "entry", name: "main", next: ["o1", "fe_c"] },
        { id: "o1", type: "guard", expr: is("$action", "interact"), next: ["o2"] },
        { id: "o2", type: "walk_to", actor: "tove", spot: "shelf", next: ["o3"] },
        { id: "o3", type: "move_object", object: "oilcan", to: { kind: "actor", id: "tove" }, next: ["o3s"] },
        { id: "o3s", type: "sound_play", entity: "tove", sound: "pickup", next: ["o4"] },
        { id: "o4", type: "say", speaker: "tove", textKey: "line.oilcan_taken", next: [] },
        ...combine("fe", "feather"),
      ],
    },
    {
      id: "feather",
      kind: "logic",
      nodes: [
        { id: "f0", type: "entry", name: "main", next: ["f1", "oc_c"] },
        { id: "f1", type: "guard", expr: is("$action", "interact"), next: ["f2"] },
        { id: "f2", type: "walk_to", actor: "tove", spot: "feather_pick", next: ["f3"] },
        { id: "f3", type: "move_object", object: "feather", to: { kind: "actor", id: "tove" }, next: ["f3s"] },
        { id: "f3s", type: "sound_play", entity: "tove", sound: "pickup", next: ["f4"] },
        { id: "f4", type: "say", speaker: "tove", textKey: "line.feather_taken", next: [] },
        ...combine("oc", "oilcan"),
      ],
    },
    {
      id: "oiled_feather",
      kind: "logic",
      nodes: [
        { id: "of0", type: "entry", name: "main", next: ["of1"] },
        { id: "of1", type: "guard", expr: all(is("$action", "use.object"), is("$target", "clock")), next: ["of2"] },
        { id: "of2", type: "walk_to", actor: "tove", spot: "clock_spot", next: ["of3"] },
        { id: "of3", type: "set_variant", entity: "clock", variant: "running", next: ["of4", "of5", "of6"] },
        { id: "of4", type: "set", var: "clock_fixed", value: true, next: [] },
        { id: "of5", type: "move_object", object: "oiled_feather", to: { kind: "none" }, next: [] },
        { id: "of6", type: "cutscene", name: "finale", next: ["of7"] },
        { id: "of7", type: "say", speaker: "tove", textKey: "line.clock_fixed", next: ["of8"] },
        { id: "of8", type: "play_animation", entity: "clock", animation: "chime", next: ["of9"] },
        { id: "of9", type: "play_animation", entity: "clock", animation: "swing", next: [] },
      ],
    },
    {
      id: "crow_talk",
      kind: "dialog",
      actors: ["tove", "crow"],
      nodes: [
        { id: "c0", type: "entry", name: "first", modal: true, next: ["c1"] },
        { id: "c1", type: "say", speaker: "crow", textKey: "crow.hello", next: ["menu"] },
        // Each question is offered until it has been asked (the content hides repeated options itself).
        { id: "menu", type: "choice", next: ["gate_who", "gate_help", "bye"] },
        { id: "gate_who", type: "guard", expr: is("asked_who", false), next: ["ask_who"] },
        { id: "ask_who", type: "say", speaker: "tove", textKey: "crow.ask_who", next: ["asked_who", "who"] },
        { id: "asked_who", type: "set", var: "asked_who", value: true, next: [] },
        { id: "who", type: "say", speaker: "crow", textKey: "crow.who", next: ["menu"] },
        { id: "gate_help", type: "guard", expr: all(is("clock_fixed", false), is("asked_help", false)), next: ["ask_help"] },
        { id: "ask_help", type: "say", speaker: "tove", textKey: "crow.ask_help", next: ["asked_help", "hint"] },
        { id: "asked_help", type: "set", var: "asked_help", value: true, next: [] },
        { id: "hint", type: "say", speaker: "crow", textKey: "crow.hint", next: ["menu"] },
        { id: "bye", type: "say", speaker: "tove", textKey: "crow.bye", next: ["end1"] },
        { id: "end1", type: "end_dialog", next: ["again"] },
        { id: "again", type: "entry", name: "again", modal: true, next: ["a1"] },
        { id: "a1", type: "say", speaker: "crow", textKey: "crow.again", next: ["menu"] },
      ],
    },
  ],
  animations: [
    { id: "a.tove.stand.right", atlas: "atlas.tove", instructions: [{ op: "frame", n: 0 }, { op: "wait", frames: 1 }], loop: true },
    { id: "a.tove.stand.left", atlas: "atlas.tove", instructions: [{ op: "frame", n: 5 }, { op: "wait", frames: 1 }], loop: true },
    { id: "a.tove.walk.right", atlas: "atlas.tove", instructions: [{ op: "fps", n: 8 }, { op: "loopRange", from: 1, to: 4 }] },
    { id: "a.tove.walk.left", atlas: "atlas.tove", instructions: [{ op: "fps", n: 8 }, { op: "loopRange", from: 6, to: 9 }] },
    { id: "a.tove.cannot", atlas: "atlas.tove", instructions: [{ op: "fps", n: 12 }, { op: "frame", n: 10 }, { op: "wait", frames: 2 }, { op: "frame", n: 11 }, { op: "wait", frames: 2 }, { op: "frame", n: 10 }, { op: "wait", frames: 2 }] },
    { id: "a.crow.stand", atlas: "atlas.crow", instructions: [{ op: "frame", n: 0 }, { op: "wait", frames: 1 }], loop: true },
    {
      id: "a.crow.flap",
      atlas: "atlas.crow",
      instructions: [{ op: "fps", n: 10 }, { op: "play", from: 1, to: 3 }, { op: "play", from: 1, to: 3 }, { op: "signal", entity: "crow", name: "landed" }, { op: "frame", n: 0 }, { op: "wait", frames: 1 }],
    },
    { id: "a.clock.swing", atlas: "atlas.clock", instructions: [{ op: "fps", n: 4 }, { op: "loopRange", from: 0, to: 3 }] },
    { id: "a.clock.chime", atlas: "atlas.clock", instructions: [{ op: "fps", n: 6 }, { op: "play", from: 4, to: 5 }, { op: "play", from: 4, to: 5 }, { op: "signal", entity: "clock", name: "chimed" }] },
  ],
  sounds: [
    { id: "s.hum", asset: "snd.hum", channel: "ambient", volume: 0.6, durationMs: 2000 },
    { id: "s.theme", asset: "snd.theme", channel: "music", volume: 0.5, durationMs: 4000, persistAcrossScenes: true },
    { id: "s.pickup", asset: "snd.pickup", channel: "sfx", durationMs: 200 },
  ],
  i18n: {
    da: {
      "s.workroom": "Værkstedet",
      "s.yard": "Gården",
      "a.tove": "Tove",
      "a.crow": "Kragen Kaj",
      "o.clock": "Standur",
      "o.oilcan": "Oliekande",
      "o.feather": "Fjer",
      "o.oiled_feather": "Olieret fjer",
      "p.to_yard": "Ud i gården",
      "p.to_workroom": "Ind i værkstedet",
      "line.intro": "Standuret i værkstedet er gået i stå. Det må jeg kunne ordne.",
      "line.clock_stopped": "Pendulet hænger helt stille. Mekanismen lyder tør.",
      "line.clock_ticks": "Tik, tak. Sådan skal det lyde.",
      "line.oilcan_taken": "En lille kande med fin symaskineolie.",
      "line.feather_taken": "En blød, sort fjer. Kragen har vist tabt den.",
      "line.feather_oiled": "Nu er fjeren dyppet i olie. Den er en fin pensel.",
      "line.clock_fixed": "Jeg smører tandhjulene … og uret går igen!",
      "crow.hello": "Kra! Hvem forstyrrer min eftermiddagslur?",
      "crow.ask_who": "Hvem er du?",
      "crow.who": "Jeg er Kaj. Jeg samler på blanke ting og gode råd.",
      "crow.ask_help": "Ved du, hvordan man får et gammelt ur til at gå?",
      "crow.hint": "Tørre tandhjul kan lide olie. Og en fjer er en god pensel.",
      "crow.bye": "Farvel, Kaj.",
      "crow.again": "Kra. Er du her igen?",
      "ui.cannot.1": "Det går ikke.",
      "ui.cannot.2": "Det giver ingen mening.",
      "ui.title": "Urmagerens eftermiddag",
      "ui.subtitle": "En lille demo af eventyrmotoren",
      "ui.start": "Nyt spil",
      "ui.language": "Sprog",
      "ui.lang.da": "Dansk",
      "ui.lang.en": "English",
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
      "ui.help_keys": "Tab: ting i scenen og inventar · Enter: vælg · Esc: slip genstand",
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
      "cut.story1": "Engang tikkede uret i værkstedet hver eneste time.",
      "cut.story2": "Kragen Kaj kom altid forbi, når det slog.",
      "cut.finale": "Tik, tak – værkstedet lever igen.",
    },
    en: {
      "s.workroom": "The Workroom",
      "s.yard": "The Yard",
      "a.tove": "Tove",
      "a.crow": "Kaj the Crow",
      "o.clock": "Grandfather clock",
      "o.oilcan": "Oil can",
      "o.feather": "",
      "o.oiled_feather": "Oiled feather",
      "p.to_yard": "Out to the yard",
      "p.to_workroom": "Into the workroom",
      "line.intro": "The grandfather clock in the workroom has stopped. I should be able to fix it.",
      "line.clock_stopped": "The pendulum hangs completely still. The mechanism sounds dry.",
      "line.clock_ticks": "Tick, tock. That is how it should sound.",
      "line.oilcan_taken": "A small can of fine sewing machine oil.",
      "line.feather_taken": "A soft black feather. The crow must have dropped it.",
      "line.feather_oiled": "Now the feather is dipped in oil. It makes a fine brush.",
      "line.clock_fixed": "I oil the gears … and the clock runs again!",
      "crow.hello": "Caw! Who disturbs my afternoon nap?",
      "crow.ask_who": "Who are you?",
      "crow.who": "I am Kaj. I collect shiny things and good advice.",
      "crow.ask_help": "Do you know how to get an old clock running?",
      "crow.hint": "Dry gears like oil. And a feather makes a good brush.",
      "crow.bye": "Goodbye, Kaj.",
      "crow.again": "Caw. You again?",
      "ui.cannot.1": "That won't work.",
      "ui.cannot.2": "That makes no sense.",
      "ui.title": "The Clockmaker's Afternoon",
      "ui.subtitle": "A small demo of the adventure engine",
      "ui.start": "New game",
      "ui.language": "Language",
      "ui.lang.da": "Dansk",
      "ui.lang.en": "English",
      "ui.inventory": "Inventory",
      "ui.scroll_back": "Show previous items",
      "ui.scroll_forward": "Show next items",
      "ui.hotspots": "Things in the scene",
      "ui.selected": "selected",
      "ui.use_on": "Use {item} on {target}",
      "ui.use_item": "Use {item} on …",
      "ui.loading": "Loading …",
      "ui.continue": "Continue",
      "ui.choose": "Choose a reply",
      "ui.graphics_failed": "The graphics could not be started. The game can still be played with the list of things in the scene.",
      "ui.help_keys": "Tab: things in the scene and inventory · Enter: choose · Esc: drop item",
      "ui.sound": "Sound",
      "ui.sound_off": "Sound off",
      "ui.skip": "Click, Enter, Space or Esc to skip",
      "ui.menu": "Menu",
      "ui.resume": "Resume",
      "ui.save_game": "Save game",
      "ui.load_game": "Load game",
      "ui.export": "Export saved game",
      "ui.import": "Import saved game",
      "ui.to_title": "Back to title",
      "ui.back": "Back",
      "ui.empty": "empty",
      "ui.corrupt": "damaged",
      "ui.unloadable": "cannot be loaded",
      "ui.backup_available": "backup can be restored",
      "ui.restore_backup": "Restore backup",
      "ui.slot.auto": "Autosave",
      "ui.slot": "Slot {n}",
      "ui.playtime": "play time {time}",
      "ui.continue_game": "Continue",
      "ui.continue_backup": "Continue from backup",
      "ui.saved": "Game saved.",
      "ui.save_blocked": "You can only save while nothing is happening in the game.",
      "ui.save_failed": "The game could not be saved: {reason}",
      "ui.loaded": "Game loaded.",
      "ui.loaded_repaired": "Game loaded. Some parts of the saved game were repaired ({count}).",
      "ui.load_failed": "The saved game could not be loaded ({code}).",
      "ui.backup_restored": "The backup has been restored.",
      "cut.story1": "Once the workroom clock ticked every single hour.",
      "cut.story2": "Kaj the crow always came by when it struck.",
      "cut.finale": "Tick, tock – the workroom is alive again.",
    },
  },
};
