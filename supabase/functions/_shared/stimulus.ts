// Stimulus (F-07) — the material a pupil reads, sees or hears BEFORE answering: a source excerpt
// ("Kilde + spørgsmål"), an image ("Billede + svar") or an audio clip ("Lytteopgave").
// docs/ARCHITECTURE.md → Question Interaction model, rule 1: a stimulus is separate from the answer form.
// It is stored as `questions.content.stimulus` next to an ordinary question of ANY existing format
// (mc, number, text, …); it never changes grading, the evaluator or the reward path — process-event
// grades against question_instances.correct_answer exactly as without a stimulus.
//
// THE CONTRACT (content.stimulus)
//   { kind: "source", text, title?, credit }               a written source; text is plain text, blank
//                                                         lines separate paragraphs
//   { kind: "image",  file, alt, caption?, credit }        an image; alt is REQUIRED (screen readers)
//   { kind: "audio",  file, transcript, title?, credit }   a clip; transcript is REQUIRED (deaf and
//                                                         hard-of-hearing pupils, and anyone who
//                                                         cannot play sound in class)
//   credit = { source, creator?, year?, license? }        where the material comes from; source is
//                                                         REQUIRED for every kind
//
// SAFETY
//   * Built from a whitelist: only the fields above leave the server, so a grading field put inside a
//     stimulus by mistake (correct, accepted_answers, review_text, …) never reaches the browser.
//   * Plain text only. The browser renders every field with textContent, never as HTML.
//   * Media are FILE NAMES, not URLs: [a-z0-9-] plus one allowed extension, no slash, no scheme. The
//     browser loads them from this site's own assets/stimulus/ folder, so a stimulus can never point at
//     another host, a data: URL or a script.
//   * A stimulus that breaks the contract makes toPublicQuestion throw, so get-next-question skips the
//     row rather than serving a question whose material is missing or half-built.
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite tests exactly what the Edge
// Functions run (tests/unit/stimulus.test.mjs).

export const STIMULUS_KINDS = Object.freeze(["source", "image", "audio"] as const);
export type StimulusKind = typeof STIMULUS_KINDS[number];

// Extensions the frontend deploy copies from assets/ (tools/cloudflare-build-static.mjs ASSET_DIRS).
export const STIMULUS_IMAGE_EXTENSIONS = Object.freeze([".svg", ".png", ".webp"] as const);
export const STIMULUS_AUDIO_EXTENSIONS = Object.freeze([".wav"] as const);

export const STIMULUS_LIMITS = Object.freeze({
  text: 1500,
  transcript: 1500,
  alt: 300,
  caption: 300,
  title: 120,
  credit: 200,
  file: 80,
});

export type StimulusCredit = { source: string; creator?: string; year?: string; license?: string };
export type PublicStimulus =
  | { kind: "source"; text: string; title?: string; credit: StimulusCredit }
  | { kind: "image"; file: string; alt: string; caption?: string; credit: StimulusCredit }
  | { kind: "audio"; file: string; transcript: string; title?: string; credit: StimulusCredit };

const FILE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+$/;
// Control characters other than tab and newline have no place in a text a pupil reads.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(raw: Record<string, unknown>, key: string, max: number, required: boolean, where: string): string | undefined {
  const value = raw[key];
  if (value === undefined) {
    if (required) throw new Error(`${where}: ${key} is required`);
    return undefined;
  }
  if (typeof value !== "string") throw new Error(`${where}: ${key} must be text`);
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    if (required) throw new Error(`${where}: ${key} is empty`);
    return undefined;
  }
  if (trimmed.length > max) throw new Error(`${where}: ${key} is longer than ${max} characters`);
  if (CONTROL.test(trimmed)) throw new Error(`${where}: ${key} contains a control character`);
  return trimmed;
}

function file(raw: Record<string, unknown>, extensions: readonly string[], where: string): string {
  const value = raw.file;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${where}: file is required`);
  if (value.length > STIMULUS_LIMITS.file || !FILE_NAME.test(value)) {
    throw new Error(`${where}: file must be a plain file name (a-z, 0-9, -) without a path or URL`);
  }
  if (!extensions.some((ext) => value.endsWith(ext))) {
    throw new Error(`${where}: file must end in ${extensions.join(", ")}`);
  }
  return value;
}

function credit(raw: Record<string, unknown>, where: string): StimulusCredit {
  const c = raw.credit;
  if (!isPlainObject(c)) throw new Error(`${where}: credit is required (where the material comes from)`);
  const out: StimulusCredit = { source: text(c, "source", STIMULUS_LIMITS.credit, true, `${where}.credit`)! };
  for (const key of ["creator", "year", "license"] as const) {
    const v = text(c, key, STIMULUS_LIMITS.credit, false, `${where}.credit`);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

// The browser-facing stimulus, built field by field from the whitelist. Throws with a reason when the
// stored stimulus breaks the contract.
export function publicStimulus(raw: unknown): PublicStimulus {
  const where = "stimulus";
  if (!isPlainObject(raw)) throw new Error(`${where}: must be an object`);
  const kind = raw.kind;
  if (kind === "source") {
    const out: PublicStimulus = {
      kind,
      text: text(raw, "text", STIMULUS_LIMITS.text, true, where)!,
      credit: credit(raw, where),
    };
    const title = text(raw, "title", STIMULUS_LIMITS.title, false, where);
    if (title !== undefined) out.title = title;
    return out;
  }
  if (kind === "image") {
    const out: PublicStimulus = {
      kind,
      file: file(raw, STIMULUS_IMAGE_EXTENSIONS, where),
      alt: text(raw, "alt", STIMULUS_LIMITS.alt, true, where)!,
      credit: credit(raw, where),
    };
    const caption = text(raw, "caption", STIMULUS_LIMITS.caption, false, where);
    if (caption !== undefined) out.caption = caption;
    return out;
  }
  if (kind === "audio") {
    const out: PublicStimulus = {
      kind,
      file: file(raw, STIMULUS_AUDIO_EXTENSIONS, where),
      transcript: text(raw, "transcript", STIMULUS_LIMITS.transcript, true, where)!,
      credit: credit(raw, where),
    };
    const title = text(raw, "title", STIMULUS_LIMITS.title, false, where);
    if (title !== undefined) out.title = title;
    return out;
  }
  throw new Error(`${where}: kind must be one of ${STIMULUS_KINDS.join(", ")}`);
}

// Authoring check for content migrations and review tools: never throws. Errors are contract breaks
// (the row would be skipped); warnings are fields that would be silently dropped. (An image's alt text
// SHOULD carry what the image shows — that is equal access for a pupil who cannot see it, not a leak.)
export function checkStimulus(raw: unknown): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  try {
    publicStimulus(raw);
  } catch (e) {
    errors.push((e as Error).message);
  }
  if (isPlainObject(raw)) {
    const allowed: Record<string, string[]> = {
      source: ["kind", "text", "title", "credit"],
      image: ["kind", "file", "alt", "caption", "credit"],
      audio: ["kind", "file", "transcript", "title", "credit"],
    };
    const keys = allowed[String(raw.kind)] ?? [];
    for (const k of Object.keys(raw)) if (keys.length > 0 && !keys.includes(k)) warnings.push(`stimulus.${k} is not part of the contract and is never sent`);
    if (isPlainObject(raw.credit)) {
      for (const k of Object.keys(raw.credit)) if (!["source", "creator", "year", "license"].includes(k)) warnings.push(`stimulus.credit.${k} is not part of the contract and is never sent`);
    }
  }
  return { errors, warnings };
}
