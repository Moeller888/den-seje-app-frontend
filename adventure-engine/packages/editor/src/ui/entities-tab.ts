/**
 * Entity editor (phase 6, §6): actors, objects and portals with ids checked at
 * once, rename with reference update, guarded delete, the references of the
 * selected element, variants (the "default" variant of actors and objects
 * cannot be removed or renamed), inventory/containers, dialog start, sounds,
 * explicit order, and portal pairs shown together.
 */

import type { ActorDef, ContainerRef, ObjectDef, PortalDef, VariantDef } from "@adventure-engine/content";
import { mirrorCombination, rename, type Project } from "@adventure-engine/content-tools";
import { announce, button, checkbox, el, field, heading, numberInput, select, textInput } from "../dom.ts";
import type { EntityRef } from "../store.ts";
import { actorIds, animationIds, assetIds, deleteView, entryRefs, moved, picker, problemList, referencesView, renameView, sceneIds, soundIds, spotsOf, textKeys, type Ctx } from "./ctx.ts";
import { clean } from "./scene-tab.ts";

const ID = /^[a-z0-9][a-z0-9_.-]*$/;

type Kind = "actor" | "object" | "portal";
const LISTS: ReadonlyArray<readonly [Kind, string, "actors" | "objects" | "portals"]> = [
  ["actor", "Aktører", "actors"],
  ["object", "Objekter", "objects"],
  ["portal", "Portaler", "portals"],
];

export function renderEntities(ctx: Ctx): HTMLElement {
  const p = ctx.store.project;
  const cur = ctx.store.selection.entity;
  const side = el("nav", { class: "side", "aria-label": "Entiteter" });
  for (const [kind, title, key] of LISTS) {
    const items = p[key] as ReadonlyArray<{ id: string }>;
    side.append(
      heading(2, title),
      el(
        "ol",
        { class: "pick-list order", "data-list": key },
        items.map((x, i) =>
          el("li", {}, [
            button(x.id, () => ctx.select({ entity: { kind, id: x.id } }), { "aria-current": cur?.kind === kind && cur.id === x.id ? "true" : undefined, "data-key": `ent-${kind}-${x.id}`, "data-entity": `${kind}:${x.id}` }),
            button("↑", () => void ctx.apply(`Flyt ${x.id}`, (q) => ({ ...q, [key]: moved(q[key] as readonly unknown[], i, -1) })), { "aria-label": `Flyt ${x.id} op`, "data-key": `up-${kind}-${x.id}`, disabled: i === 0 ? "" : undefined }),
            button("↓", () => void ctx.apply(`Flyt ${x.id}`, (q) => ({ ...q, [key]: moved(q[key] as readonly unknown[], i, 1) })), { "aria-label": `Flyt ${x.id} ned`, "data-key": `down-${kind}-${x.id}`, disabled: i === items.length - 1 ? "" : undefined }),
          ]),
        ),
      ),
      newForm(ctx, kind),
    );
  }
  return el("div", { class: "tab entities-tab" }, [side, el("section", { class: "detail" }, [detail(ctx, cur)])]);
}

function newForm(ctx: Ctx, kind: Kind): HTMLElement {
  const label = kind === "actor" ? "aktør" : kind === "object" ? "objekt" : "portal";
  const input = textInput("", () => {}, { name: `new-${kind}`, "data-key": `new-${kind}`, placeholder: `ny-${label}`, "aria-label": `Id for ny ${label}` });
  const msg = el("span", { class: "inline-error", role: "alert", "data-error": `new-${kind}` });
  // Ids are checked while typing (not only on create).
  input.addEventListener("input", () => {
    const id = input.value.trim();
    msg.textContent = id === "" ? "" : !ID.test(id) ? "Ugyldigt id: brug små bogstaver, tal, punktum, - og _." : taken(ctx.store.project, kind, id) ? `"${id}" er allerede brugt.` : "";
  });
  return el("div", { class: "new-form" }, [
    field(`Ny ${label}`, input),
    button(
      `Opret ${label}`,
      () => {
        const id = input.value.trim();
        if (!ID.test(id) || taken(ctx.store.project, kind, id)) {
          msg.textContent = !ID.test(id) ? "Ugyldigt id." : `"${id}" er allerede brugt.`;
          return;
        }
        const err = ctx.apply(`Opret ${label} ${id}`, (q) => create(q, kind, id), { entity: { kind, id } });
        if (err !== null) msg.textContent = err;
      },
      { "data-action": `new-${kind}`, "data-key": `create-${kind}` },
    ),
    msg,
  ]);
}

const taken = (p: Project, kind: Kind, id: string): boolean =>
  kind === "portal" ? p.portals.some((x) => x.id === id) : p.actors.some((a) => a.id === id) || p.objects.some((o) => o.id === id);

function create(p: Project, kind: Kind, id: string): Project {
  const scene = p.scenes[0]?.id ?? null;
  if (kind === "actor") return { ...p, actors: [...p.actors, { id, scene, ...(scene !== null ? { spot: Object.keys(p.scenes[0]?.spots ?? {})[0] } : {}), entry: null, variants: { default: {} } } as ActorDef] };
  if (kind === "object") return { ...p, objects: [...p.objects, { id, container: scene === null ? { kind: "none" } : { kind: "scene", id: scene }, entry: null, variants: { default: {} } }] };
  const from = p.scenes[0]?.id;
  const to = p.scenes[1]?.id;
  if (from === undefined || to === undefined) throw new RangeError("en portal kræver mindst to scener");
  return { ...p, portals: [...p.portals, { id, from, to, entry: null }] };
}

function detail(ctx: Ctx, cur: EntityRef | null): HTMLElement {
  const p = ctx.store.project;
  if (cur === null) return el("p", { class: "muted", text: "Vælg en aktør, et objekt eller en portal." });
  if (cur.kind === "actor") {
    const a = p.actors.find((x) => x.id === cur.id);
    return a === undefined ? el("p", { text: "Findes ikke længere." }) : actorForm(ctx, a);
  }
  if (cur.kind === "object") {
    const o = p.objects.find((x) => x.id === cur.id);
    return o === undefined ? el("p", { text: "Findes ikke længere." }) : objectForm(ctx, o);
  }
  if (cur.kind === "portal") {
    const pt = p.portals.find((x) => x.id === cur.id);
    return pt === undefined ? el("p", { text: "Findes ikke længere." }) : portalForm(ctx, pt);
  }
  return el("p", { text: "Lyde og animationer redigeres under Medier." });
}

const index = <T extends { id: string }>(list: readonly T[], id: string): number => list.findIndex((x) => x.id === id);

function actorForm(ctx: Ctx, a: ActorDef): HTMLElement {
  const p = ctx.store.project;
  const i = index(p.actors, a.id);
  const set = (label: string, change: Partial<Record<keyof ActorDef, unknown>>): void =>
    void ctx.apply(label, (q) => ({ ...q, actors: q.actors.map((x, k) => (k === i ? (clean({ ...x, ...change }) as ActorDef) : x)) }));
  const inventory = p.objects.filter((o) => o.container.kind === "actor" && o.container.id === a.id);
  const addable = p.objects.filter((o) => !(o.container.kind === "actor" && o.container.id === a.id));
  const addSel = el("select", { "aria-label": "Genstand til inventar", "data-key": "inv-add-select" }, addable.map((o) => el("option", { value: o.id, text: o.id })));
  return el("div", { class: "card", "data-form": `actor:${a.id}` }, [
    heading(2, `Aktør ${a.id}`),
    problemList(ctx, "actors.json", `[${i}]`),
    renameView(ctx, { kind: "entity", id: a.id }, (to) => ({ entity: { kind: "actor", id: to } })),
    el("div", { class: "grid" }, [
      picker("Navnenøgle", textKeys(p), a.nameKey, (v) => set("Ret navnenøgle", { nameKey: v }), "actor-name"),
      picker("Scene", sceneIds(p), a.scene ?? undefined, (v) => set("Ret scene", { scene: v ?? null, spot: undefined }), "actor-scene"),
      picker("Spot", spotsOf(p, a.scene), a.spot, (v) => set("Ret spot", { spot: v }), "actor-spot"),
      picker("Logik-entry", entryRefs(p), a.entry ?? undefined, (v) => set("Ret entry", { entry: v ?? null }), "actor-entry"),
      picker("Dialogstart", entryRefs(p), a.dialog, (v) => set("Ret dialogstart", { dialog: v }), "actor-dialog"),
      field("Referencehøjde", numberInput(a.referenceHeight, (v) => set("Ret højde", { referenceHeight: v }), { "data-key": "actor-height" })),
      el("label", {}, [checkbox(a.grounded !== false, (v) => set("Ret grounded", { grounded: v ? undefined : false }), { "data-key": "actor-grounded" }), " står på gulvet"]),
      el("label", {}, [checkbox(a.triggersZones !== false, (v) => set("Ret triggerzoner", { triggersZones: v ? undefined : false }), { "data-key": "actor-zones" }), " udløser triggerzoner"]),
    ]),
    variantsEditor(ctx, "actors", i, a.id, a.variants, true),
    soundsEditor(ctx, "actors", i, a.sounds),
    heading(3, "Inventar"),
    el(
      "ul",
      { class: "inventory-list", "data-inventory": a.id },
      inventory.map((o) =>
        el("li", {}, [
          el("span", { text: o.id }),
          button("Fjern fra inventar", () => void ctx.apply(`Fjern ${o.id} fra inventar`, (q) => setContainer(q, o.id, { kind: "none" })), { "data-key": `inv-remove-${o.id}` }),
        ]),
      ),
    ),
    addable.length === 0 ? null : el("div", { class: "row" }, [field("Genstand", addSel), button("Læg i inventar", () => void ctx.apply(`Læg ${addSel.value} i inventar`, (q) => setContainer(q, addSel.value, { kind: "actor", id: a.id })), { "data-key": "inv-add" })]),
    referencesView(ctx, { kind: "entity", id: a.id }),
    deleteView(ctx, { kind: "entity", id: a.id }, { entity: null }),
  ]);
}

function setContainer(p: Project, id: string, c: ContainerRef): Project {
  return { ...p, objects: p.objects.map((o) => (o.id === id ? (clean({ ...o, container: c, spot: c.kind === "scene" ? o.spot : undefined }) as ObjectDef) : o)) };
}

function objectForm(ctx: Ctx, o: ObjectDef): HTMLElement {
  const p = ctx.store.project;
  const i = index(p.objects, o.id);
  const set = (label: string, change: Partial<Record<keyof ObjectDef, unknown>>): void =>
    void ctx.apply(label, (q) => ({ ...q, objects: q.objects.map((x, k) => (k === i ? (clean({ ...x, ...change }) as ObjectDef) : x)) }));
  const c = o.container;
  const owner = c.kind === "none" ? "" : c.id;
  const others = p.objects.filter((x) => x.id !== o.id).map((x) => x.id);
  const mirrorSel = el("select", { "aria-label": "Genstand A (brug A på dette objekt)", "data-key": "mirror-item" }, others.map((x) => el("option", { value: x, text: x })));
  const mirrorMsg = el("span", { class: "inline-error", role: "alert" });
  return el("div", { class: "card", "data-form": `object:${o.id}` }, [
    heading(2, `Objekt ${o.id}`),
    problemList(ctx, "objects.json", `[${i}]`),
    renameView(ctx, { kind: "entity", id: o.id }, (to) => ({ entity: { kind: "object", id: to } })),
    el("div", { class: "grid" }, [
      picker("Navnenøgle", textKeys(p), o.nameKey, (v) => set("Ret navnenøgle", { nameKey: v }), "object-name"),
      field(
        "Container",
        select(
          [
            ["scene", "scene"],
            ["actor", "aktør (inventar)"],
            ["none", "ingen"],
          ],
          c.kind,
          (v) => set("Ret container", { container: v === "none" ? { kind: "none" } : { kind: v, id: (v === "scene" ? sceneIds(p) : actorIds(p))[0] ?? "" }, spot: undefined }),
          { "data-key": "object-container" },
        ),
      ),
      c.kind === "none" ? null : picker(c.kind === "scene" ? "Scene" : "Aktør", c.kind === "scene" ? sceneIds(p) : actorIds(p), owner, (v) => (v === undefined ? announce("Vælg en container") : set("Ret container", { container: { kind: c.kind, id: v } })), "object-owner", false),
      c.kind === "scene" ? picker("Spot", spotsOf(p, c.id), o.spot, (v) => set("Ret spot", { spot: v }), "object-spot") : null,
      picker("Logik-entry", entryRefs(p), o.entry ?? undefined, (v) => set("Ret entry", { entry: v ?? null }), "object-entry"),
      picker("Inventarikon", assetIds(p, ["image"]), o.icon, (v) => set("Ret ikon", { icon: v }), "object-icon"),
    ]),
    variantsEditor(ctx, "objects", i, o.id, o.variants, true),
    soundsEditor(ctx, "objects", i, o.sounds),
    heading(3, "Inventarkombination: spejlregel"),
    el("p", { class: "muted", text: `Hvis "brug A på ${o.id}" kun er skrevet i A's logik, kan du få spejlreglen ("brug ${o.id} på A") skrevet eksplicit i ${o.id}s logik. Runtime forbliver asymmetrisk; intet ændres automatisk.` }),
    others.length === 0
      ? null
      : el("div", { class: "row" }, [
          field("Genstand A", mirrorSel),
          button(
            "Opret spejlregel",
            () => {
              try {
                const r = mirrorCombination(ctx.store.project, mirrorSel.value, o.id);
                ctx.apply(`Opret spejlregel ${mirrorSel.value} ↔ ${o.id}`, () => r.project);
                mirrorMsg.textContent = "";
              } catch (err) {
                mirrorMsg.textContent = (err as Error).message;
              }
            },
            { "data-action": "mirror", "data-key": "mirror" },
          ),
          mirrorMsg,
        ]),
    referencesView(ctx, { kind: "entity", id: o.id }),
    deleteView(ctx, { kind: "entity", id: o.id }, { entity: null }),
  ]);
}

/** Variants of an actor or object; `default` is required and cannot be removed or renamed. */
function variantsEditor(ctx: Ctx, list: "actors" | "objects", i: number, owner: string, variants: Readonly<Record<string, VariantDef>>, needsDefault: boolean): HTMLElement {
  const p = ctx.store.project;
  const setVariants = (label: string, f: (v: Record<string, VariantDef>) => Record<string, VariantDef>): void =>
    void ctx.apply(label, (q) => ({ ...q, [list]: (q[list] as ReadonlyArray<{ variants: Record<string, VariantDef> }>).map((x, k) => (k === i ? { ...x, variants: f({ ...x.variants }) } : x)) }));
  const newName = textInput("", () => {}, { "data-key": `variant-new-${owner}`, "aria-label": "Navn på ny variant", name: "new-variant" });
  const rows = Object.entries(variants).map(([name, v]) => {
    const isDefault = name === "default" && needsDefault;
    return el("fieldset", { class: "variant", "data-variant": name }, [
      el("legend", { text: name }),
      el("div", { class: "grid" }, [
        picker("Sprite", assetIds(p, ["image", "atlas"]), v.sprite, (x) => setVariants("Ret sprite", (m) => ({ ...m, [name]: clean({ ...v, sprite: x }) })), `variant-sprite-${name}`),
        picker("Portræt", assetIds(p, ["image"]), v.portrait, (x) => setVariants("Ret portræt", (m) => ({ ...m, [name]: clean({ ...v, portrait: x }) })), `variant-portrait-${name}`),
      ]),
      el("div", {}, [
        heading(4, "Animationer (navn → animation)"),
        ...Object.entries(v.animations ?? {}).map(([an, id]) =>
          el("div", { class: "row" }, [
            el("span", { text: an }),
            picker("Animation", animationIds(p), id, (x) => setVariants("Ret animation", (m) => ({ ...m, [name]: { ...v, animations: { ...(v.animations ?? {}), ...(x === undefined ? {} : { [an]: x }) } } })), `variant-anim-${name}-${an}`, false),
            button("Fjern", () => setVariants("Fjern animation", (m) => ({ ...m, [name]: clean({ ...v, animations: dropKey(v.animations, an) }) })), { "data-key": `variant-anim-del-${name}-${an}` }),
          ]),
        ),
        animationIds(p).length === 0
          ? null
          : button("Tilføj animation", () => setVariants("Tilføj animation", (m) => ({ ...m, [name]: { ...v, animations: { ...(v.animations ?? {}), [`anim_${Object.keys(v.animations ?? {}).length + 1}`]: animationIds(p)[0] as string } } })), { "data-key": `variant-anim-add-${name}` }),
      ]),
      isDefault
        ? el("p", { class: "muted", text: "Standardvarianten kræves og kan ikke fjernes eller omdøbes." })
        : el("div", { class: "row" }, [
            renameView(ctx, { kind: "variant", id: name, scope: owner }, () => ({}), "Omdøb variant"),
            button(
              "Fjern variant",
              () => {
                const r = rename(ctx.store.project, { kind: "variant", id: name, scope: owner }, `${name}__x`);
                const refs = r.ok ? r.changed - 1 : 0;
                if (refs > 0) announce(`Varianten "${name}" bruges stadig ${refs} steder og blev ikke fjernet`);
                else setVariants(`Fjern variant ${name}`, (m) => dropKey(m, name) ?? {});
              },
              { "data-key": `variant-del-${name}` },
            ),
          ]),
    ]);
  });
  return el("section", {}, [
    heading(3, "Varianter"),
    needsDefault && variants["default"] === undefined ? el("p", { class: "inline-error", role: "alert", text: 'Varianten "default" mangler og kræves.' }) : null,
    ...rows,
    el("div", { class: "row" }, [
      field("Ny variant", newName),
      button(
        "Tilføj variant",
        () => {
          const n = newName.value.trim();
          if (!ID.test(n) || variants[n] !== undefined) return announce(`Ugyldigt eller brugt variantnavn "${n}"`);
          setVariants(`Tilføj variant ${n}`, (m) => ({ ...m, [n]: {} }));
        },
        { "data-key": `variant-add-${owner}` },
      ),
    ]),
  ]);
}

function dropKey<T>(m: Readonly<Record<string, T>> | undefined, key: string): Record<string, T> | undefined {
  const out = Object.fromEntries(Object.entries(m ?? {}).filter(([k]) => k !== key));
  return Object.keys(out).length === 0 ? undefined : out;
}

function soundsEditor(ctx: Ctx, list: "actors" | "objects", i: number, sounds: Readonly<Record<string, string>> | undefined): HTMLElement {
  const p = ctx.store.project;
  const set = (label: string, next: Record<string, string> | undefined): void =>
    void ctx.apply(label, (q) => ({ ...q, [list]: (q[list] as readonly object[]).map((x, k) => (k === i ? clean({ ...x, sounds: next }) : x)) }));
  return el("section", {}, [
    heading(3, "Lyde (lokalt navn → lyd)"),
    ...Object.entries(sounds ?? {}).map(([name, id]) =>
      el("div", { class: "row" }, [
        el("span", { text: name }),
        picker("Lyd", soundIds(p), id, (v) => set("Ret lyd", v === undefined ? dropKey(sounds, name) : { ...sounds, [name]: v }), `sound-${list}-${name}`, false),
        button("Fjern", () => set("Fjern lyd", dropKey(sounds, name)), { "data-key": `sound-del-${list}-${name}` }),
      ]),
    ),
    soundIds(p).length === 0 ? null : button("Tilføj lyd", () => set("Tilføj lyd", { ...(sounds ?? {}), [`lyd_${Object.keys(sounds ?? {}).length + 1}`]: soundIds(p)[0] as string }), { "data-key": `sound-add-${list}` }),
  ]);
}

/** A portal and its reverse portal (to → from) are edited together. */
function portalForm(ctx: Ctx, pt: PortalDef): HTMLElement {
  const p = ctx.store.project;
  const reverse = p.portals.find((x) => x.from === pt.to && x.to === pt.from && x.id !== pt.id) ?? null;
  const one = (x: PortalDef): HTMLElement => {
    const i = index(p.portals, x.id);
    const set = (label: string, change: Partial<Record<keyof PortalDef, unknown>>): void =>
      void ctx.apply(label, (q) => ({ ...q, portals: q.portals.map((y, k) => (k === i ? (clean({ ...y, ...change }) as PortalDef) : y)) }));
    return el("fieldset", { class: "portal", "data-portal": x.id }, [
      el("legend", { text: `${x.id}: ${x.from} → ${x.to}` }),
      problemList(ctx, "portals.json", `[${i}]`),
      el("div", { class: "grid" }, [
        picker("Fra scene", sceneIds(p), x.from, (v) => v !== undefined && set("Ret fra-scene", { from: v, exitSpot: undefined }), `portal-from-${x.id}`, false),
        picker("Til scene", sceneIds(p), x.to, (v) => v !== undefined && set("Ret til-scene", { to: v, entrySpot: undefined, arrivalSpot: undefined }), `portal-to-${x.id}`, false),
        picker("Udgangsspot (fra-scene)", spotsOf(p, x.from), x.exitSpot, (v) => set("Ret udgangsspot", { exitSpot: v }), `portal-exit-${x.id}`),
        picker("Ankomstspot (til-scene)", spotsOf(p, x.to), x.arrivalSpot ?? undefined, (v) => set("Ret ankomstspot", { arrivalSpot: v }), `portal-arrival-${x.id}`),
        picker("Indgangsspot (til-scene)", spotsOf(p, x.to), x.entrySpot, (v) => set("Ret indgangsspot", { entrySpot: v }), `portal-entry-spot-${x.id}`),
        picker("Navnenøgle", textKeys(p), x.nameKey, (v) => set("Ret navnenøgle", { nameKey: v }), `portal-name-${x.id}`),
        picker("Låst-tekst", textKeys(p), x.lockedKey, (v) => set("Ret låst-tekst", { lockedKey: v }), `portal-locked-key-${x.id}`),
        el("label", {}, [checkbox(x.locked === true, (v) => set("Ret lås", { locked: v ? true : undefined }), { "data-key": `portal-locked-${x.id}` }), " låst fra start"]),
        picker("Logik-entry", entryRefs(p), x.entry ?? undefined, (v) => set("Ret entry", { entry: v ?? null }), `portal-entry-${x.id}`),
        field("Indeks", numberInput(x.index, (v) => set("Ret indeks", { index: v }), { "data-key": `portal-index-${x.id}` })),
      ]),
      el("p", { class: "muted", text: x.polygon === undefined ? "Ingen zone: tegn den under Scener (lag Portalzoner)." : `Zone med ${x.polygon.length} punkter (redigeres under Scener).` }),
    ]);
  };
  const makeReverse = (): void => {
    const id = `${pt.id}_back`;
    if (p.portals.some((x) => x.id === id)) return announce(`"${id}" findes allerede`);
    ctx.apply(`Opret returportal ${id}`, (q) => ({ ...q, portals: [...q.portals, clean({ id, from: pt.to, to: pt.from, entry: null, exitSpot: pt.arrivalSpot ?? undefined, arrivalSpot: pt.exitSpot }) as PortalDef] }), { entity: { kind: "portal", id: pt.id } });
  };
  return el("div", { class: "card", "data-form": `portal:${pt.id}` }, [
    heading(2, `Portalpar ${pt.id}${reverse !== null ? ` / ${reverse.id}` : ""}`),
    renameView(ctx, { kind: "portal", id: pt.id }, (to) => ({ entity: { kind: "portal", id: to } })),
    one(pt),
    reverse !== null ? one(reverse) : el("div", { class: "row" }, [el("p", { class: "muted", text: "Ingen returportal." }), button("Opret returportal", makeReverse, { "data-key": "make-reverse" })]),
    referencesView(ctx, { kind: "portal", id: pt.id }),
    deleteView(ctx, { kind: "portal", id: pt.id }, { entity: null }),
  ]);
}
