/**
 * Translation matrix (phase 6, §7): one row per text key, one column per
 * language, with missing/empty texts, unused keys, references and the
 * fallback the runtime would show. Import/export uses the engine format
 * (one JSON object key → text per language).
 */

import type { LoadedContent } from "@adventure-engine/content";
import { TextService } from "@adventure-engine/core";
import type { Project } from "./project.ts";
import { references, slots, type Slot } from "./refs.ts";

export interface MatrixRow {
  readonly key: string;
  /** Language → text; missing languages are absent. */
  readonly texts: Readonly<Record<string, string>>;
  readonly missing: readonly string[];
  /** Present but empty or only whitespace (W-I18N-EMPTY). */
  readonly empty: readonly string[];
  readonly refs: readonly Slot[];
  readonly unused: boolean;
}

export function languages(p: Project): readonly string[] {
  return p.game.languages;
}

/** Every key used anywhere (tables or content), sorted. */
export function allKeys(p: Project): string[] {
  const keys = new Set<string>();
  for (const table of Object.values(p.i18n)) for (const k of Object.keys(table)) keys.add(k);
  for (const s of slots(p)) if (s.kind === "textKey" && s.path[0] !== "i18n") keys.add(s.value);
  return [...keys].sort();
}

export function matrix(p: Project): MatrixRow[] {
  const langs = languages(p);
  return allKeys(p).map((key) => {
    const texts: Record<string, string> = {};
    for (const l of langs) {
      const t = p.i18n[l]?.[key];
      if (t !== undefined) texts[l] = t;
    }
    const refs = references(p, { kind: "textKey", id: key });
    return {
      key,
      texts,
      missing: langs.filter((l) => texts[l] === undefined),
      empty: langs.filter((l) => texts[l] !== undefined && (texts[l] as string).trim() === ""),
      refs,
      unused: refs.length === 0,
    };
  });
}

export type RowFilter = "all" | "missing" | "empty" | "unused" | "problems";

/** Search in keys and texts (case-insensitive) and filter by state. */
export function filterRows(rows: readonly MatrixRow[], query: string, filter: RowFilter): MatrixRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (filter === "missing" && r.missing.length === 0) return false;
    if (filter === "empty" && r.empty.length === 0) return false;
    if (filter === "unused" && !r.unused) return false;
    if (filter === "problems" && r.missing.length + r.empty.length === 0 && !r.unused) return false;
    return q === "" || r.key.toLowerCase().includes(q) || Object.values(r.texts).some((t) => t.toLowerCase().includes(q));
  });
}

/**
 * The text the runtime shows for a key in a language, computed by the engine's
 * own TextService (language → fallback language; empty texts count as
 * missing, spec 06 F7). Null when no language in the chain has it.
 */
export function fallbackText(p: Project, key: string, lang: string): { readonly text: string; readonly from: string } | null {
  const content = { pkg: { game: p.game, i18n: p.i18n } } as unknown as LoadedContent;
  const service = new TextService(content, { language: lang, warn: () => {} });
  const r = service.resolve(key);
  return r.language === null ? null : { text: r.text, from: r.language };
}

export function setText(p: Project, lang: string, key: string, text: string): Project {
  if (!p.game.languages.includes(lang)) throw new RangeError(`unknown language "${lang}"`);
  if (key === "") throw new RangeError("a text key cannot be empty");
  return { ...p, i18n: { ...p.i18n, [lang]: { ...(p.i18n[lang] ?? {}), [key]: text } } };
}

/** Add a key with empty texts in every language (shown as W-I18N-EMPTY until filled). */
export function addKey(p: Project, key: string): Project {
  if (allKeys(p).includes(key)) throw new RangeError(`text key "${key}" exists`);
  let out = p;
  for (const l of p.game.languages) out = setText(out, l, key, "");
  return out;
}

/** The engine-format table of one language (sorted keys), ready to export. */
export function exportLanguage(p: Project, lang: string): Record<string, string> {
  const table = p.i18n[lang] ?? {};
  return Object.fromEntries(Object.keys(table).sort().map((k) => [k, table[k] as string]));
}

/**
 * Import one language table (engine format). Existing texts are replaced key
 * by key; keys not in the file stay. Malformed files are refused.
 */
export function importLanguage(p: Project, lang: string, json: string): Project {
  let d: unknown;
  try {
    d = JSON.parse(json);
  } catch (err) {
    throw new RangeError(`not valid JSON: ${(err as Error).message}`);
  }
  if (typeof d !== "object" || d === null || Array.isArray(d) || !Object.values(d).every((v) => typeof v === "string")) {
    throw new RangeError("a translation file maps text keys to strings");
  }
  let out = p;
  for (const [k, v] of Object.entries(d as Record<string, string>)) out = setText(out, lang, k, v);
  return out;
}
