/**
 * Animation, sound and cutscene configuration (phase 6, §8; formats of phase 4).
 * Animations are instruction lists over an atlas' numbered frames; sounds name
 * an audio asset and a channel; cutscenes belong to a scene and have one
 * variant per language plus "default" (a timeline of pictures or a video).
 */

import type { AnimInstr, AnimationDef, CutsceneDef, CutsceneVariantDef, SoundDef } from "@adventure-engine/content";
import { SOUND_CHANNELS } from "@adventure-engine/content";
import { announce, button, checkbox, el, field, heading, numberInput, select, textInput } from "../dom.ts";
import { assetIds, deleteView, entityIds, picker, referencesView, renameView, sceneIds, textKeys, type Ctx } from "./ctx.ts";
import { clean } from "./scene-tab.ts";
import { withScene } from "./scene-model.ts";

const OPS: readonly AnimInstr["op"][] = ["frame", "play", "loopRange", "wait", "fps", "layer", "layerPop", "signal"];

const fresh = (op: AnimInstr["op"]): AnimInstr =>
  op === "frame" ? { op, n: 0 } : op === "play" || op === "loopRange" ? { op, from: 0, to: 1 } : op === "wait" ? { op, frames: 1 } : op === "fps" ? { op, n: 12 } : op === "layer" ? { op, name: "layer" } : op === "signal" ? { op, entity: "", name: "signal" } : { op: "layerPop" };

export function renderMedia(ctx: Ctx): HTMLElement {
  return el("div", { class: "tab media-tab" }, [animations(ctx), sounds(ctx), cutscenes(ctx)]);
}

function uniqueId(taken: readonly string[], base: string): string {
  let n = taken.length + 1;
  while (taken.includes(`${base}${n}`)) n++;
  return `${base}${n}`;
}

function animations(ctx: Ctx): HTMLElement {
  const p = ctx.store.project;
  const atlases = assetIds(p, ["atlas"]);
  const box = el("section", { class: "card" }, [heading(2, "Animationer")]);
  p.animations.forEach((a, i) => {
    const set = (label: string, change: Partial<Record<keyof AnimationDef, unknown>>): void =>
      void ctx.apply(label, (q) => ({ ...q, animations: q.animations.map((x, k) => (k === i ? (clean({ ...x, ...change }) as AnimationDef) : x)) }));
    const setIns = (list: AnimInstr[]): void => set("Ret instruktioner", { instructions: list });
    const rows = a.instructions.map((ins, k) => {
      const r = ins as unknown as Record<string, unknown>;
      const num = (name: string): HTMLElement =>
        field(name, numberInput(r[name] as number, (v) => setIns(a.instructions.map((x, j) => (j === k ? ({ ...x, [name]: Math.max(0, Math.round(v ?? 0)) } as AnimInstr) : x))), { "data-key": `anim-${a.id}-${k}-${name}`, min: "0" }));
      const txt = (name: string): HTMLElement => field(name, textInput(String(r[name] ?? ""), (v) => setIns(a.instructions.map((x, j) => (j === k ? ({ ...x, [name]: v } as AnimInstr) : x))), { "data-key": `anim-${a.id}-${k}-${name}` }));
      return el("li", { class: "row" }, [
        select(OPS, ins.op, (v) => setIns(a.instructions.map((x, j) => (j === k ? fresh(v as AnimInstr["op"]) : x))), { "data-key": `anim-${a.id}-${k}-op`, "aria-label": `Instruktion ${k + 1}` }),
        ...(ins.op === "frame" || ins.op === "fps" ? [num("n")] : []),
        ...(ins.op === "play" || ins.op === "loopRange" ? [num("from"), num("to")] : []),
        ...(ins.op === "wait" ? [num("frames")] : []),
        ...(ins.op === "layer" ? [txt("name")] : []),
        ...(ins.op === "signal" ? [picker("entity", entityIds(p), ins.entity, (v) => setIns(a.instructions.map((x, j) => (j === k ? ({ ...x, entity: v ?? "" } as AnimInstr) : x))), `anim-${a.id}-${k}-entity`, false), txt("name")] : []),
        button("↑", () => setIns(swap(a.instructions, k, -1)), { "aria-label": "Flyt op", "data-key": `anim-${a.id}-${k}-up`, disabled: k === 0 ? "" : undefined }),
        button("Fjern", () => setIns(a.instructions.filter((_, j) => j !== k)), { "data-key": `anim-${a.id}-${k}-del` }),
      ]);
    });
    box.append(
      el("fieldset", { "data-animation": a.id }, [
        el("legend", { text: a.id }),
        renameView(ctx, { kind: "animation", id: a.id }, () => ({})),
        el("div", { class: "grid" }, [
          picker("Atlas", atlases, a.atlas, (v) => v !== undefined && set("Ret atlas", { atlas: v }), `anim-${a.id}-atlas`, false),
          field("Standard-fps", numberInput(a.defaultFps, (v) => set("Ret fps", { defaultFps: v }), { "data-key": `anim-${a.id}-fps` })),
          field("Maks. varighed (ms)", numberInput(a.maxDuration, (v) => set("Ret varighed", { maxDuration: v }), { "data-key": `anim-${a.id}-max` })),
          el("label", {}, [checkbox(a.loop === true, (v) => set("Ret gentagelse", { loop: v ? true : undefined }), { "data-key": `anim-${a.id}-loop` }), " gentages"]),
        ]),
        el("ol", { class: "instructions" }, rows),
        button("Tilføj instruktion", () => setIns([...a.instructions, { op: "frame", n: 0 }]), { "data-key": `anim-${a.id}-add` }),
        referencesView(ctx, { kind: "animation", id: a.id }),
        deleteView(ctx, { kind: "animation", id: a.id }, {}),
      ]),
    );
  });
  box.append(
    button(
      "Ny animation",
      () => {
        if (atlases.length === 0) return announce("Importér først et sprite-atlas under Assets");
        const id = uniqueId(p.animations.map((x) => x.id), "anim.");
        ctx.apply(`Opret animation ${id}`, (q) => ({ ...q, animations: [...q.animations, { id, atlas: atlases[0] as string, instructions: [{ op: "frame", n: 0 }] }] }));
      },
      { "data-key": "new-animation", "data-action": "new-animation" },
    ),
  );
  return box;
}

function swap<T>(list: readonly T[], i: number, d: -1 | 1): T[] {
  const out = [...list];
  const j = i + d;
  if (j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j] as T, out[i] as T];
  return out;
}

function sounds(ctx: Ctx): HTMLElement {
  const p = ctx.store.project;
  const audio = assetIds(p, ["audio"]);
  const box = el("section", { class: "card" }, [heading(2, "Lyde")]);
  p.sounds.forEach((s, i) => {
    const set = (label: string, change: Partial<Record<keyof SoundDef, unknown>>): void =>
      void ctx.apply(label, (q) => ({ ...q, sounds: q.sounds.map((x, k) => (k === i ? (clean({ ...x, ...change }) as SoundDef) : x)) }));
    box.append(
      el("fieldset", { "data-sound": s.id }, [
        el("legend", { text: s.id }),
        renameView(ctx, { kind: "sound", id: s.id }, () => ({})),
        el("div", { class: "grid" }, [
          picker("Lydfil", audio, s.asset, (v) => v !== undefined && set("Ret lydfil", { asset: v }), `sound-${s.id}-asset`, false),
          field("Kanal", select(SOUND_CHANNELS, s.channel, (v) => set("Ret kanal", { channel: v }), { "data-key": `sound-${s.id}-channel` })),
          field("Volumen (0–1)", numberInput(s.volume, (v) => (v === undefined || (v >= 0 && v <= 1) ? set("Ret volumen", { volume: v }) : announce("Volumen skal ligge mellem 0 og 1")), { "data-key": `sound-${s.id}-volume`, min: "0", max: "1", step: "0.05" })),
          field("Varighed (ms)", numberInput(s.durationMs, (v) => set("Ret varighed", { durationMs: v }), { "data-key": `sound-${s.id}-duration` })),
          field("Loop-start (ms)", numberInput(s.loopStartMs, (v) => set("Ret loop", { loopStartMs: v }), { "data-key": `sound-${s.id}-ls` })),
          field("Loop-slut (ms)", numberInput(s.loopEndMs, (v) => set("Ret loop", { loopEndMs: v }), { "data-key": `sound-${s.id}-le` })),
          el("label", {}, [checkbox(s.persistAcrossScenes === true, (v) => set("Ret scenevedvarende", { persistAcrossScenes: v ? true : undefined }), { "data-key": `sound-${s.id}-persist` }), " fortsætter på tværs af scener"]),
        ]),
        referencesView(ctx, { kind: "sound", id: s.id }),
        deleteView(ctx, { kind: "sound", id: s.id }, {}),
      ]),
    );
  });
  box.append(
    button(
      "Ny lyd",
      () => {
        if (audio.length === 0) return announce("Importér først en lydfil under Assets");
        const id = uniqueId(p.sounds.map((x) => x.id), "s.");
        ctx.apply(`Opret lyd ${id}`, (q) => ({ ...q, sounds: [...q.sounds, { id, asset: audio[0] as string, channel: "sfx" }] }));
      },
      { "data-key": "new-sound", "data-action": "new-sound" },
    ),
  );
  return box;
}

function cutscenes(ctx: Ctx): HTMLElement {
  const p = ctx.store.project;
  const box = el("section", { class: "card" }, [heading(2, "Cutscenes (pr. scene)")]);
  const images = assetIds(p, ["image"]);
  const videos = assetIds(p, ["video"]);
  for (const s of p.scenes) {
    for (const [name, c] of Object.entries(s.cutscenes ?? {})) {
      const setC = (label: string, next: CutsceneDef | null): void =>
        void ctx.apply(label, (q) => withScene(q, s.id, (x) => clean({ ...x, cutscenes: next === null ? dropKey(x.cutscenes, name) : { ...(x.cutscenes ?? {}), [name]: next } })));
      const variants = Object.entries(c.variants).map(([lang, v]) => {
        const setV = (label: string, nv: CutsceneVariantDef | null): void => setC(label, { ...c, variants: nv === null ? (dropKey(c.variants, lang) ?? {}) : { ...c.variants, [lang]: nv } });
        const timeline = v.timeline ?? [];
        return el("fieldset", { "data-cutscene-variant": `${s.id}/${name}/${lang}` }, [
          el("legend", { text: lang === "default" ? "default (sprogneutral)" : lang }),
          picker("Video", videos, v.video, (x) => setV("Ret video", clean({ ...v, video: x })), `cut-${s.id}-${name}-${lang}-video`),
          field("Varighed (ms)", numberInput(v.durationMs, (x) => setV("Ret varighed", clean({ ...v, durationMs: x })), { "data-key": `cut-${s.id}-${name}-${lang}-dur` })),
          el(
            "ol",
            {},
            timeline.map((f, k) =>
              el("li", { class: "row" }, [
                field("ms", numberInput(f.atMs, (x) => setV("Ret billede", { ...v, timeline: timeline.map((y, j) => (j === k ? { ...y, atMs: x ?? 0 } : y)) }), { "data-key": `cut-${s.id}-${name}-${lang}-${k}-at` })),
                picker("Billede", images, f.asset, (x) => setV("Ret billede", { ...v, timeline: timeline.map((y, j) => (j === k ? clean({ ...y, asset: x }) : y)) }), `cut-${s.id}-${name}-${lang}-${k}-asset`),
                picker("Tekst", textKeys(p), f.textKey, (x) => setV("Ret tekst", { ...v, timeline: timeline.map((y, j) => (j === k ? clean({ ...y, textKey: x }) : y)) }), `cut-${s.id}-${name}-${lang}-${k}-text`),
                button("Fjern", () => setV("Fjern billede", { ...v, timeline: timeline.filter((_, j) => j !== k) }), { "data-key": `cut-${s.id}-${name}-${lang}-${k}-del` }),
              ]),
            ),
          ),
          button("Tilføj billede", () => setV("Tilføj billede", { ...v, timeline: [...timeline, { atMs: (timeline[timeline.length - 1]?.atMs ?? -1000) + 1000 }] }), { "data-key": `cut-${s.id}-${name}-${lang}-add` }),
          button("Fjern variant", () => setV("Fjern variant", null), { "data-key": `cut-${s.id}-${name}-${lang}-remove` }),
        ]);
      });
      const langSel = select(["default", ...p.game.languages].filter((l) => c.variants[l] === undefined), "default", () => {}, { "data-key": `cut-${s.id}-${name}-newlang`, "aria-label": "Sprog for ny variant" });
      box.append(
        el("fieldset", { "data-cutscene": `${s.id}/${name}` }, [
          el("legend", { text: `${s.id}: ${name}` }),
          el("div", { class: "grid" }, [
            el("label", {}, [checkbox(c.skippable === true, (v) => setC("Ret overspring", clean({ ...c, skippable: v ? true : undefined })), { "data-key": `cut-${s.id}-${name}-skip` }), " kan springes over"]),
            field("Skip tidligst (ms)", numberInput(c.skipAfterMs, (v) => setC("Ret skipgrænse", clean({ ...c, skipAfterMs: v })), { "data-key": `cut-${s.id}-${name}-after` })),
            el("label", {}, [checkbox(c.hold === true, (v) => setC("Ret hold", clean({ ...c, hold: v ? true : undefined })), { "data-key": `cut-${s.id}-${name}-hold` }), " bliver stående (hold)"]),
          ]),
          ...variants,
          el("div", { class: "row" }, [field("Ny variant", langSel), button("Tilføj variant", () => langSel.value !== "" && setC("Tilføj variant", { ...c, variants: { ...c.variants, [langSel.value]: { timeline: [], durationMs: 1000 } } }), { "data-key": `cut-${s.id}-${name}-addvar` })]),
          button("Slet cutscene", () => setC(`Slet cutscene ${name}`, null), { class: "danger", "data-key": `cut-${s.id}-${name}-delete` }),
        ]),
      );
    }
  }
  const sceneSel = select(sceneIds(p), sceneIds(p)[0] ?? "", () => {}, { "data-key": "new-cut-scene", "aria-label": "Scene" });
  const nameIn = textInput("", () => {}, { "data-key": "new-cut-name", "aria-label": "Navn", placeholder: "navn" });
  box.append(
    el("div", { class: "row" }, [
      field("Scene", sceneSel),
      field("Navn", nameIn),
      button(
        "Ny cutscene",
        () => {
          const n = nameIn.value.trim();
          if (!/^[a-z0-9_]+$/.test(n)) return announce("Ugyldigt navn");
          ctx.apply(`Opret cutscene ${n}`, (q) => withScene(q, sceneSel.value, (x) => ({ ...x, cutscenes: { ...(x.cutscenes ?? {}), [n]: { variants: { default: { timeline: [], durationMs: 1000 } }, skippable: true } } })));
        },
        { "data-key": "new-cutscene" },
      ),
    ]),
  );
  return box;
}

function dropKey<T>(m: Readonly<Record<string, T>> | undefined, key: string): Record<string, T> | undefined {
  const out = Object.fromEntries(Object.entries(m ?? {}).filter(([k]) => k !== key));
  return Object.keys(out).length === 0 ? undefined : out;
}
