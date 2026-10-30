/**
 * Preview (phase 6, §10): build the current document in memory, validate it
 * strictly, stop at errors, otherwise start the game in an isolated page
 * (fresh engine, memory-only saves). Stop and restart are explicit; runtime
 * warnings of the preview are listed here. The preview receives a copy of the
 * bundle, so it can never change the editor's document.
 */

import { buildBundle, validateProject, type Project } from "@adventure-engine/content-tools";
import { announce, button, el, heading } from "../dom.ts";
import type { FromPreview, ToPreview } from "../preview/protocol.ts";
import { targetOf } from "./problems-tab.ts";
import type { Ctx } from "./ctx.ts";

/** Stop of the preview that is currently shown (the shell calls it when the tab is left). */
let current: (() => void) | null = null;

export function stopPreview(): void {
  current?.();
  current = null;
}

export function renderPreview(ctx: Ctx): HTMLElement {
  const frameBox = el("div", { class: "preview-frame" });
  const state = el("p", { id: "preview-state", "data-state": "stopped", role: "status", text: "Preview er stoppet." });
  const errors = el("ul", { class: "problems-inline", id: "preview-errors" });
  const warnings = el("ul", { class: "problems-inline", id: "preview-warnings", "aria-label": "Runtime-advarsler" });
  let frame: HTMLIFrameElement | null = null;
  let urls: string[] = [];
  let listener: ((ev: MessageEvent<FromPreview>) => void) | null = null;

  const setState = (s: string, text: string): void => {
    state.dataset["state"] = s;
    state.textContent = text;
  };

  const stop = (): void => {
    if (listener !== null) window.removeEventListener("message", listener);
    listener = null;
    frame?.remove();
    frame = null;
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
    setState("stopped", "Preview er stoppet.");
  };
  current = stop;

  const start = (): void => {
    stop();
    errors.replaceChildren();
    warnings.replaceChildren();
    // 1–3: build in memory, strict validation, stop at errors.
    const v = validateProject(ctx.store.allFiles(), { strict: true });
    if (!v.ok || v.project === null) {
      setState("invalid", "Preview kan ikke starte: projektet har fejl.");
      for (const p of v.problems.filter((x) => x.level === "error")) {
        errors.append(el("li", { class: "error", "data-code": p.code }, [`${p.code} ${p.file} ${p.path}: ${p.message} `, button("Gå til", () => ctx.select(targetOf(ctx, p)))]));
      }
      announce("Preview stoppet af valideringsfejl");
      return;
    }
    const project: Project = v.project;
    const { bundle } = buildBundle(project);
    const map: Record<string, string> = {};
    for (const a of Object.values(project.assets)) {
      for (const f of [{ file: a.file, type: a.type }, ...(a.alternatives ?? [])]) {
        const bytes = ctx.store.files.get(`assets/${f.file}`);
        if (bytes === undefined) continue;
        const u = URL.createObjectURL(new Blob([bytes as BlobPart], { type: f.type }));
        urls.push(u);
        map[`assets/${f.file}`] = u;
      }
    }
    // 4–5: a fresh runtime in its own page, with the production render/media/audio/save packages.
    const message: ToPreview = { type: "load", bundle: JSON.parse(JSON.stringify({ content: bundle.content, manifest: bundle.manifest })) as ToPreview["bundle"], urls: map };
    frame = el("iframe", { src: "./preview.html", title: "Preview af spillet", class: "preview", id: "preview-iframe" });
    listener = (ev: MessageEvent<FromPreview>) => {
      if (ev.origin !== window.location.origin || ev.source !== frame?.contentWindow) return;
      const m = ev.data;
      if (m.type === "ready") frame?.contentWindow?.postMessage(message, window.location.origin);
      else if (m.type === "started") setState("running", "Preview kører (gemte spil kun i hukommelsen).");
      else if (m.type === "error") setState("error", `Preview fejlede: ${m.message}`);
      else if (m.type === "warnings") warnings.replaceChildren(...m.list.map((w) => el("li", { class: "warning", "data-code": w.code, text: `${w.code}: ${w.message}` })));
    };
    window.addEventListener("message", listener);
    frameBox.replaceChildren(frame);
    setState("starting", "Preview starter …");
  };

  return el("div", { class: "tab preview-tab" }, [
    el("section", { class: "card" }, [
      heading(2, "Preview"),
      el("p", { class: "muted", text: "Starter projektet i den rigtige motor med et frisk runtime. Previewets gemte spil og indstillinger ligger kun i hukommelsen og rører aldrig spillerens normale saves." }),
      el("div", { class: "row" }, [
        button("Start preview", start, { "data-action": "preview-start", "data-key": "preview-start" }),
        button("Genstart", start, { "data-action": "preview-restart", "data-key": "preview-restart" }),
        button("Stop", stop, { "data-action": "preview-stop", "data-key": "preview-stop" }),
      ]),
      state,
      errors,
      frameBox,
      heading(3, "Runtime-advarsler"),
      warnings,
    ]),
  ]);
}
