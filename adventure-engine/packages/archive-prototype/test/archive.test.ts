import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent } from "@adventure-engine/content";
import { Engine } from "@adventure-engine/core";
import { HeadlessAdapter } from "@adventure-engine/scenario-runner";
import { describe, expect, it } from "vitest";
import { CONTEXT_KEY, DRAWER_KEY, DRAWER_RESULT_ACTION, RESULT_ACTION, TASK_REQUEST_GLOBAL, archiveContent } from "../src/content.ts";
import { ARCHIVE_ITEMS } from "../src/host-items.ts";
import { INTRO_CARDS, INTRO_CHECK, wordCount } from "../src/intro-content.ts";
import { ACTIVITIES, ARCHIVE_CARD_EXERCISE, DECISION_POINTS, REFLECTION, REVISION_KEY, REVISIT_KEY, REVISIT_RESULT_ACTION, SOURCE_FIELDS, checkArchiveCard, parseSourceBack } from "../src/sequence.ts";

/** Headless run of the Arkivskabet scene (D-307): speech is confirmed, time runs until the world is idle. */
function world() {
  const engine = new Engine(loadContent(archiveContent), { seed: "arkiv", adapter: new HeadlessAdapter() });
  const settle = (): string[] => {
    const said: string[] = [];
    for (let i = 0; i < 2000; i++) {
      for (const c of engine.pendingCommands()) {
        if (c.type === "Say") said.push(c.textKey);
        engine.reply(c.cmdId, { kind: "done" });
      }
      if (engine.idleReport().idle) return said;
      engine.advanceTicks(1);
    }
    throw new Error("the scene did not become idle");
  };
  engine.newGame();
  engine.event("$game", "game.start");
  settle();
  return { engine, settle };
}

describe("Arkivskabet scene (D-307) — headless", () => {
  it("the content loads without errors", () => {
    expect(() => loadContent(archiveContent)).not.toThrow();
  });

  it("using the locked cabinet asks for a task at the decision point, and nothing else does", () => {
    const { engine, settle } = world();
    expect(engine.globals.get(TASK_REQUEST_GLOBAL)).toBe("");
    engine.event("cabinet", "interact");
    expect(settle()).toEqual(["line.cabinet_locked"]);
    expect(engine.globals.get(TASK_REQUEST_GLOBAL)).toBe(CONTEXT_KEY);
  });

  it("the server's 'correct' opens the cabinet; the drawer then asks for a NEW application task (phase 6)", () => {
    const { engine, settle } = world();
    engine.event("cabinet", RESULT_ACTION, { $outcome: "correct" });
    expect(settle()).toEqual(["line.unlocked"]);
    expect(engine.world.objects.get("cabinet")?.variant).toBe("open");
    expect(engine.globals.get("cabinet_open")).toBe(true);
    engine.event("cabinet", "interact");
    expect(settle()).toEqual(["line.drawer"]);
    expect(engine.globals.get(TASK_REQUEST_GLOBAL)).toBe(DRAWER_KEY);
  });

  it("the drawer's verdict: 'incorrect' keeps it open for another try, 'correct' closes the sequence", () => {
    const { engine, settle } = world();
    engine.event("cabinet", RESULT_ACTION, { $outcome: "correct" });
    settle();
    engine.event("cabinet", DRAWER_RESULT_ACTION, { $outcome: "incorrect" });
    expect(settle()).toEqual(["line.drawer_wrong"]);
    expect(engine.globals.get("transfer_done")).toBe(false);
    engine.event("cabinet", DRAWER_RESULT_ACTION, { $outcome: "correct" });
    expect(settle()).toEqual(["line.drawer_done"]);
    expect(engine.globals.get("transfer_done")).toBe(true);
    engine.setGlobal(TASK_REQUEST_GLOBAL, "");
    engine.event("cabinet", "interact");
    expect(settle()).toEqual(["line.cabinet_is_open"]);
    expect(engine.globals.get(TASK_REQUEST_GLOBAL)).toBe("");
  });

  it("the drawer's verdict does not touch the cabinet, and the cabinet's does not touch the drawer", () => {
    const { engine, settle } = world();
    engine.event("cabinet", DRAWER_RESULT_ACTION, { $outcome: "correct" });
    settle();
    expect(engine.globals.get("cabinet_open")).toBe(false);
    expect(engine.world.objects.get("cabinet")?.variant).toBe("default");
  });

  it("'incorrect' and 'aborted' leave the cabinet locked, each with its own line", () => {
    for (const [outcome, line] of [["incorrect", "line.still_locked"], ["aborted", "line.connection"]] as const) {
      const { engine, settle } = world();
      engine.event("cabinet", RESULT_ACTION, { $outcome: outcome });
      expect(settle()).toEqual([line]);
      expect(engine.world.objects.get("cabinet")?.variant).toBe("default");
      expect(engine.globals.get("cabinet_open")).toBe(false);
    }
  });

  it("the game's world state has no learning field (mastery, XP and evidence live on the server)", () => {
    const keys = Object.keys(archiveContent.game.globals ?? {});
    expect(keys.sort()).toEqual(["cabinet_open", "intro_seen", TASK_REQUEST_GLOBAL, "transfer_done"].sort());
    // No answer key (option ids live on the host) and no learning or reward field anywhere in the content.
    expect(JSON.stringify(archiveContent)).not.toMatch(/kilde_|"xp"|"coins"|mastery|evidence|correct_?answer|hints_?used/i);
  });
});

describe("Arkivskabet — introduction (D-310, LPD §5.1 stage 1)", () => {
  it("each content card has at most 80 words, and there are 1–3 of them", () => {
    expect(INTRO_CARDS.length).toBeGreaterThanOrEqual(1);
    expect(INTRO_CARDS.length).toBeLessThanOrEqual(3);
    for (const c of INTRO_CARDS) expect(wordCount(c.text), c.title).toBeLessThanOrEqual(80);
  });

  it("the comprehension check judges nothing: one explanation for every choice, no right/wrong words", () => {
    expect(INTRO_CHECK.options).toHaveLength(2);
    expect(INTRO_CHECK.explanation).not.toMatch(/(rigtigt|forkert|korrekt)/i);
  });

  it("the introduction teaches the method the tasks use: who, when, to whom", () => {
    const text = INTRO_CARDS.map((c) => c.text).join(" ");
    for (const q of ["Hvem har lavet den?", "Hvornår?", "Til hvem?", "Og hvorfor?"]) expect(text).toContain(q);
  });
});

describe("Arkivskabet v2 — the learning sequence as data (D-322)", () => {
  it("every activity says what it is and what it may count for; only server-judged, unassisted steps may ever become evidence", () => {
    for (const a of Object.values(ACTIVITIES)) {
      expect(a.label.length, a.id).toBeGreaterThan(0);
      if (a.mayBecomeEvidence) expect(a.judgedBy, a.id).toBe("server");
    }
    expect(Object.values(ACTIVITIES).filter((a) => a.mayBecomeEvidence).map((a) => a.id).sort()).toEqual(["revisit", "transfer"]);
    for (const id of ["intro", "introCheck", "archiveCard", "flip", "hypothesis", "revision", "reflection", "worldReaction"]) expect(ACTIVITIES[id]?.mayBecomeEvidence, id).toBe(false);
  });

  it("decision points: revision asks for the SAME objective as the hypothesis; transfer and revisit ask for their own", () => {
    expect(DECISION_POINTS[REVISION_KEY]?.objectiveId).toBe(DECISION_POINTS[CONTEXT_KEY]?.objectiveId);
    expect(DECISION_POINTS[DRAWER_KEY]?.purpose).toBe("check");
    expect(DECISION_POINTS[REVISIT_KEY]?.purpose).toBe("review");
    expect(DECISION_POINTS[REVISIT_KEY]?.resultAction).toBe(REVISIT_RESULT_ACTION);
    const ids = new Set(Object.values(DECISION_POINTS).map((p) => p.objectiveId));
    expect(ids.size).toBe(3);
  });

  it("the test adapter has a task for every decision point, and the revision is a NEW instance (other option ids)", () => {
    for (const p of Object.values(DECISION_POINTS)) expect(ARCHIVE_ITEMS.some((i) => i.objectiveId === p.objectiveId), p.objectiveId).toBe(true);
    const kilde = ARCHIVE_ITEMS.filter((i) => i.objectiveId === DECISION_POINTS[CONTEXT_KEY]?.objectiveId);
    expect(kilde).toHaveLength(2);
    const [first, revision] = kilde.map((i) => new Set((i.options ?? []).map((o) => o.id)));
    expect([...(revision ?? [])].some((id) => first?.has(id))).toBe(false);
  });

  it("every source description has the five archive fields, and they parse as a document back", () => {
    for (const item of ARCHIVE_ITEMS) {
      for (const o of item.options ?? []) {
        const back = parseSourceBack(o.detail ?? "");
        expect(back?.map((f) => f.field), `${item.id}/${o.id}`).toEqual(["Afsender", "Tid", "Modtager", "Formål", "Kontekst"]);
      }
    }
    expect(parseSourceBack("bare en almindelig sætning")).toBeNull();
  });

  it("every wrong option has its own refutation that names a field to look at", () => {
    for (const item of ARCHIVE_ITEMS) {
      for (const o of item.options ?? []) {
        if (o.id === item.answer) continue;
        expect(item.optionFeedback?.[o.id], `${item.id}/${o.id}`).toMatch(/afsender|tid|formål|modtager/i);
      }
    }
  });

  it("the archive card: all four questions used once; a wrong placement gets its own explanation", () => {
    expect(new Set(ARCHIVE_CARD_EXERCISE.facts.map((f) => f.field))).toEqual(new Set(SOURCE_FIELDS.map((f) => f.key)));
    const right = Object.fromEntries(ARCHIVE_CARD_EXERCISE.facts.map((f) => [f.id, f.field]));
    expect(checkArchiveCard(right)).toEqual({ allRight: true, wrong: [] });
    const swapped = { ...right, f1: "tid" as const, f2: "afsender" as const };
    const r = checkArchiveCard(swapped);
    expect(r.allRight).toBe(false);
    expect(r.wrong.map((w) => w.id)).toEqual(["f1", "f2"]);
    expect(checkArchiveCard({}).wrong).toHaveLength(4);
  });

  it("reflection and revisit are local: a minimum length, a model answer, and an explicit 'no mastery' label", () => {
    expect(REFLECTION.minChars).toBeGreaterThan(0);
    expect(REFLECTION.model.length).toBeGreaterThan(REFLECTION.minChars);
    expect(REFLECTION.selfCheck.length).toBeGreaterThanOrEqual(3);
  });

  it("the world comments on the revisit verdict and changes nothing else", () => {
    for (const [outcome, line] of [["correct", "line.revisit_done"], ["incorrect", "line.revisit_wrong"]] as const) {
      const { engine, settle } = world();
      const before = JSON.stringify([...engine.globals.entries()]);
      engine.event("cabinet", REVISIT_RESULT_ACTION, { $outcome: outcome });
      expect(settle()).toEqual([line]);
      expect(JSON.stringify([...engine.globals.entries()])).toBe(before);
    }
  });
});

describe("Arkivskabet — the game's import graph never reaches answer keys or the test adapter", () => {
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

  function reachable(entry: string): Map<string, string[]> {
    const seen = new Map<string, string[]>();
    const go = (file: string): void => {
      if (seen.has(file)) return;
      const text = readFileSync(file, "utf8");
      const specs = [...text.matchAll(/^\s*import\s[^"']*["']([^"']+)["']/gm)].map((m) => m[1] as string);
      seen.set(file, specs);
      for (const s of specs) if (s.startsWith("./")) go(join(dirname(file), s));
    };
    go(join(SRC, entry));
    return seen;
  }

  it("game-main.ts reaches no host file, no item list and no test adapter", () => {
    const graph = reachable("game-main.ts");
    const files = [...graph.keys()].map((f) => f.replace(SRC, "").replace(/\\/g, "/"));
    expect(files).toContain("/task-view.ts");
    expect(files.some((f) => /host/.test(f))).toBe(false);
    const specs = [...graph.values()].flat();
    expect(specs.some((s) => s.includes("test-service"))).toBe(false);
    expect(specs.some((s) => s.includes("supabase"))).toBe(false);
  });

  it("the host does use the test adapter (so the check above is meaningful)", () => {
    const specs = [...reachable("host-main.ts").values()].flat();
    expect(specs).toContain("@adventure-engine/learning-bridge/test-service");
    expect(specs).toContain("./host-items.ts");
  });
});
