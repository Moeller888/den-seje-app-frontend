/**
 * Asset pipeline (phase 6, §8): import of pictures, atlases, sound, video and
 * fonts with kind, type, size and SHA-256; de-duplication by hash; previews
 * through <img>/<audio>/<video> only (no script ever runs); provenance and
 * licence metadata; the frame grid of sprite atlases with numbered frames.
 */

import { importAsset, type AssetKind, type ProjectAsset } from "@adventure-engine/content-tools";
import { announce, button, el, field, heading, numberInput, select, textInput } from "../dom.ts";
import { deleteView, referencesView, type Ctx } from "./ctx.ts";
import { clean } from "./scene-tab.ts";

let lastReport = "";

export function renderAssets(ctx: Ctx): HTMLElement {
  const p = ctx.store.project;
  const input = el("input", { type: "file", multiple: "", class: "file-input", id: "asset-import", "data-key": "asset-import", accept: "image/*,audio/*,video/*,.woff,.woff2,.ttf,.otf,.svg" });
  const asKind = select(
    [
      ["", "automatisk"],
      ["image", "billede"],
      ["atlas", "sprite-atlas"],
      ["audio", "lyd"],
      ["video", "video"],
      ["font", "font"],
    ],
    "",
    () => {},
    { "data-key": "asset-kind", name: "asset-kind" },
  );
  const license = textInput("", () => {}, { "data-key": "asset-license", name: "asset-license", placeholder: "fx CC0-1.0" });
  const source = textInput("", () => {}, { "data-key": "asset-source", name: "asset-source", placeholder: "hvor kommer filen fra" });
  // The import report survives the re-rendering the import itself causes.
  const msg = el("div", { class: "import-report", role: "status", id: "asset-message", text: lastReport });
  input.addEventListener("change", () => {
    const files = [...(input.files ?? [])];
    input.value = "";
    void (async () => {
      const notes: string[] = [];
      for (const f of files) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const kind = asKind.value === "" ? undefined : (asKind.value as AssetKind);
        const r = importAsset(ctx.store.project, ctx.store.files, {
          name: f.name,
          bytes,
          ...(kind !== undefined ? { kind } : {}),
          ...(kind === "atlas" ? { atlas: { frameWidth: 32, frameHeight: 32, frames: 1 } } : {}),
          ...(license.value.trim() !== "" ? { license: license.value.trim() } : {}),
          ...(source.value.trim() !== "" ? { source: source.value.trim() } : {}),
        });
        if (!r.ok) {
          notes.push(`${f.name}: ${r.code} ${r.message}`);
          continue;
        }
        if (r.duplicateOf !== null) {
          notes.push(`${f.name}: samme indhold som "${r.duplicateOf}" – ikke importeret igen`);
          continue;
        }
        ctx.store.setFiles(r.files);
        ctx.apply(`Importér ${f.name}`, () => r.project, { asset: r.id });
        notes.push(`${f.name}: importeret som "${r.id}"`);
      }
      lastReport = notes.join("\n");
      const live = document.getElementById("asset-message");
      if (live !== null) live.textContent = lastReport;
      announce(notes.join("; "));
    })();
  });
  const ids = Object.keys(p.assets).sort();
  const sel = ctx.store.selection.asset;
  const root = el("div", { class: "tab assets-tab" }, [
    el("section", { class: "card" }, [
      heading(2, "Assets"),
      el("p", { class: "muted", text: "Billeder (PNG, JPEG, WebP, SVG uden scripts), lyd (WAV, Ogg, MP3), video (WebM, MP4) og fonte. Flash, XML, gemte spil og scripts importeres aldrig." }),
      el("div", { class: "row" }, [field("Importér filer", input), field("Brug som", asKind), field("Licens", license), field("Kilde", source)]),
      msg,
      el(
        "ul",
        { class: "asset-grid" },
        ids.map((id) => {
          const a = p.assets[id] as ProjectAsset;
          return el("li", { "data-asset": id }, [
            button("", () => ctx.select({ asset: id }), { class: `asset-card${sel === id ? " selected" : ""}`, "data-key": `asset-${id}`, "aria-label": `${id} (${a.kind})` }),
          ]);
        }),
      ),
    ]),
    sel === null || p.assets[sel] === undefined ? el("aside", { class: "side props" }, [el("p", { class: "muted", text: "Vælg et asset." })]) : assetPanel(ctx, sel),
  ]);
  fillCards(ctx, root);
  return root;
}

/** Card contents (preview + name) are filled after creation, so the button keeps one accessible label. */
function fillCards(ctx: Ctx, root: HTMLElement): void {
  for (const card of root.querySelectorAll<HTMLButtonElement>(".asset-card")) {
    const id = card.closest("li")?.getAttribute("data-asset") ?? "";
    const a = ctx.store.project.assets[id];
    if (a === undefined) continue;
    card.append(preview(ctx, id, a, true), el("span", { class: "asset-name", text: id }), el("span", { class: "muted", text: `${a.kind} · ${a.type} · ${a.bytes} B` }));
  }
}

function preview(ctx: Ctx, id: string, a: ProjectAsset, small: boolean): HTMLElement {
  const url = ctx.urls.forAsset(ctx.store, id);
  if (url === null) return el("span", { class: "inline-error", text: "fil mangler" });
  if (a.kind === "image" || a.kind === "atlas") return el("img", { src: url, alt: small ? "" : id, class: small ? "thumb" : "asset-preview", draggable: "false" });
  if (a.kind === "audio") return small ? el("span", { class: "thumb icon", text: "♪" }) : el("audio", { src: url, controls: "", preload: "none" });
  if (a.kind === "video") return small ? el("span", { class: "thumb icon", text: "▶" }) : el("video", { src: url, controls: "", preload: "metadata", class: "asset-preview" });
  return el("span", { class: "thumb icon", text: "Aa" });
}

function assetPanel(ctx: Ctx, id: string): HTMLElement {
  const p = ctx.store.project;
  const a = p.assets[id] as ProjectAsset;
  const set = (label: string, change: Partial<Record<keyof ProjectAsset, unknown>>): void =>
    void ctx.apply(label, (q) => ({ ...q, assets: { ...q.assets, [id]: clean({ ...(q.assets[id] as ProjectAsset), ...change }) as ProjectAsset } }));
  const atlas = a.atlas;
  const grid = atlas === undefined ? null : atlasGrid(ctx, id, a);
  return el("aside", { class: "side props", "aria-label": `Asset ${id}` }, [
    heading(3, id),
    preview(ctx, id, a, false),
    el("dl", { class: "facts" }, [
      el("dt", { text: "Art" }),
      el("dd", { text: a.kind }),
      el("dt", { text: "Type" }),
      el("dd", { text: a.type }),
      el("dt", { text: "Fil" }),
      el("dd", { text: `assets/${a.file}` }),
      el("dt", { text: "Størrelse" }),
      el("dd", { text: `${a.bytes} bytes` }),
      el("dt", { text: "SHA-256" }),
      el("dd", { class: "hash", "data-sha": a.sha256, text: a.sha256 }),
    ]),
    heading(4, "Proveniens og licens"),
    el("div", { class: "grid" }, [
      field("Kilde", textInput(a.source ?? "", (v) => set("Ret kilde", { source: v === "" ? undefined : v }), { "data-key": "asset-meta-source" })),
      field("Licens", textInput(a.license ?? "", (v) => set("Ret licens", { license: v === "" ? undefined : v }), { "data-key": "asset-meta-license" })),
      field("Ophav", textInput(a.author ?? "", (v) => set("Ret ophav", { author: v === "" ? undefined : v }), { "data-key": "asset-meta-author" })),
      field("Sprog (valgfrit)", textInput(a.language ?? "", (v) => set("Ret sprog", { language: v === "" ? undefined : v }), { "data-key": "asset-meta-language" })),
    ]),
    a.kind === "image" ? button("Brug som sprite-atlas", () => set("Gør til atlas", { kind: "atlas", atlas: { frameWidth: 32, frameHeight: 32, frames: 1 } }), { "data-key": "to-atlas" }) : null,
    atlas === undefined
      ? null
      : el("section", {}, [
          heading(4, "Spritesheet: rammer"),
          el(
            "div",
            { class: "grid" },
            (["frameWidth", "frameHeight", "frames", "columns"] as const).map((k) =>
              field(k, numberInput(atlas[k], (v) => (v !== undefined && v > 0 ? set("Ret atlas", { atlas: clean({ ...atlas, [k]: k === "frames" || k === "columns" ? Math.round(v) : v }) }) : k === "columns" ? set("Ret atlas", { atlas: clean({ ...atlas, columns: undefined }) }) : announce(`${k} skal være større end 0`)), { "data-key": `atlas-${k}`, min: "1" })),
            ),
          ),
          grid,
          el("p", { class: "muted", text: "Rammenumrene bruges af animationerne under Medier (frame, play, loopRange)." }),
        ]),
    referencesView(ctx, { kind: "asset", id }),
    deleteView(ctx, { kind: "asset", id }, { asset: null }),
  ]);
}

function atlasGrid(ctx: Ctx, id: string, a: ProjectAsset): HTMLElement {
  const atlas = a.atlas as NonNullable<ProjectAsset["atlas"]>;
  const cols = atlas.columns ?? atlas.frames;
  const url = ctx.urls.forAsset(ctx.store, id);
  const box = el("div", { class: "atlas", style: `width:${Math.min(cols, 8) * 72}px` });
  for (let f = 0; f < atlas.frames; f++) {
    const cx = (f % cols) * atlas.frameWidth;
    const cy = Math.floor(f / cols) * atlas.frameHeight;
    const scale = 64 / Math.max(atlas.frameWidth, atlas.frameHeight);
    box.append(
      el("figure", { class: "frame", "data-frame": String(f) }, [
        el("div", {
          class: "frame-pic",
          style: url === null ? "" : `width:${atlas.frameWidth * scale}px;height:${atlas.frameHeight * scale}px;background-image:url("${url}");background-position:${-cx * scale}px ${-cy * scale}px;background-size:${cols * atlas.frameWidth * scale}px auto`,
        }),
        el("figcaption", { text: String(f) }),
      ]),
    );
  }
  return box;
}
