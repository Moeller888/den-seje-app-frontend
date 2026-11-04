import { loadContent } from "@adventure-engine/content";
import { describe, expect, it } from "vitest";
import { demoContent } from "../src/demo/content.ts";

describe("demo content", () => {
  it("loads in strict mode; the only diagnostics are the intended ones", () => {
    const c = loadContent(demoContent);
    // The crow perches on a branch (grounded: false) and o.feather is empty in English on purpose.
    expect(c.diagnostics.map((d) => `${d.code} ${d.path}`).sort()).toEqual(["W-I18N-EMPTY i18n.en.o.feather", "W-SPOT-UNWALKABLE actors[1].spot"]);
  });
});

describe("demo walkthrough (headless)", () => {
  it("the puzzle and the dialog can be completed", async () => {
    const { Engine } = await import("@adventure-engine/core");
    const log: string[] = [];
    const engine = new Engine(loadContent(demoContent), {
      seed: "demo",
      adapter: {
        onCommand: (c) => {
          log.push(c.type === "Say" ? `Say:${c.textKey}` : c.type === "Choose" ? `Choose:${c.options.map((o) => o.textKey).join(",")}` : c.type);
          return c.type === "Say" || c.type === "Choose" ? { kind: "await" } : { kind: "auto", afterMs: 0 };
        },
      },
    });
    const idle = (): void => {
      for (let i = 0; i < 60000 && !engine.idleReport().idle; i++) {
        const say = engine.pendingCommands().find((p) => p.type === "Say");
        if (say !== undefined) engine.reply(say.cmdId, { kind: "done" });
        else if (engine.pendingCommands().some((p) => p.type === "Choose")) return;
        else engine.advanceTicks(1);
      }
    };
    const choose = (textKey: string): void => {
      const menu = engine.pendingCommands().find((p) => p.type === "Choose");
      const opt = menu?.type === "Choose" ? menu.options.find((o) => o.textKey === textKey) : undefined;
      if (menu === undefined || opt === undefined) throw new Error(`no option ${textKey}`);
      engine.reply(menu.cmdId, { kind: "choice", optionId: opt.id });
      idle();
    };
    const tove = () => engine.world.actors.get("tove");
    engine.newGame();
    idle();
    expect(log).toContain("Say:line.intro");
    engine.click({ objectZone: "clock" });
    idle();
    expect(log.at(-1)).toBe("Say:line.clock_stopped");
    engine.click({ objectZone: "oilcan" });
    idle();
    expect(tove()?.inventory).toEqual(["oilcan"]);
    engine.click({ portal: "to_yard" });
    idle();
    expect(tove()?.scene).toBe("yard");
    engine.click({ actorZone: "crow" });
    idle();
    expect(log.at(-1)).toBe("Choose:crow.ask_who,crow.ask_help,crow.bye");
    choose("crow.ask_help");
    expect(log.at(-1)).toBe("Choose:crow.ask_who,crow.bye");
    choose("crow.bye");
    expect(engine.world.actors.get("crow")?.dialogStack).toEqual(["crow_talk#again"]);
    engine.click({ objectZone: "feather" });
    idle();
    engine.clickInventory("feather");
    engine.clickInventory("oilcan");
    idle();
    expect(tove()?.inventory).toEqual(["oilcan", "oiled_feather"]);
    engine.click({ portal: "to_workroom" });
    idle();
    engine.clickInventory("oiled_feather");
    engine.click({ objectZone: "clock" });
    idle();
    expect(engine.globals.get("clock_fixed")).toBe(true);
    expect(engine.world.objects.get("clock")?.variant).toBe("running");
    expect(tove()?.inventory).toEqual(["oilcan"]);
    expect(log.filter((l) => l === "React")).toHaveLength(0);
    expect(engine.warnings).toEqual([]);
  });
});

describe("demo media (phase 4)", () => {
  it("every animation, frame, sound, sprite, icon, layer and cutscene picture exists in the manifest", async () => {
    const { validateAssets } = await import("@adventure-engine/content");
    const { demoManifest } = await import("../src/demo/manifest.ts");
    expect(validateAssets(demoContent, demoManifest("/"))).toEqual([]);
  });
});
