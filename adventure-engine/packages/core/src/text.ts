/**
 * Text lookup with a language fallback chain (spec 06 F7).
 *
 * Chain: current language → `game.fallbackLanguage` (when set and different).
 * An empty or whitespace-only translation counts as missing. When no language
 * in the chain has a text, dev builds show the key itself and production shows
 * an empty string. Every key that needed a fallback or failed is reported once
 * per language with W-I18N-EMPTY.
 */

import type { LoadedContent } from "@adventure-engine/content";
import { EngineError, EngineErrorCode } from "./errors.ts";

export interface TextResult {
  readonly text: string;
  /** Language the text came from; null when no language had it. */
  readonly language: string | null;
  /** True when the current language had no usable text. */
  readonly fallback: boolean;
}

export interface TextServiceOptions {
  readonly language?: string;
  /** Dev build: show missing keys as the key itself (default false). */
  readonly dev?: boolean;
  readonly warn: (message: string) => void;
}

export class TextService {
  private readonly content: LoadedContent;
  private readonly dev: boolean;
  private readonly warn: (message: string) => void;
  private readonly reported = new Set<string>();
  private language_: string;

  constructor(content: LoadedContent, options: TextServiceOptions) {
    this.content = content;
    this.dev = options.dev ?? false;
    this.warn = options.warn;
    this.language_ = content.pkg.game.defaultLanguage;
    if (options.language !== undefined) this.setLanguage(options.language);
  }

  get language(): string {
    return this.language_;
  }

  get languages(): readonly string[] {
    return this.content.pkg.game.languages;
  }

  setLanguage(language: string): void {
    if (!this.content.pkg.game.languages.includes(language)) {
      throw new EngineError(EngineErrorCode.BadArgument, `unknown language "${language}"`);
    }
    this.language_ = language;
  }

  /** Languages tried in order for the current language. */
  chain(): readonly string[] {
    const fb = this.content.pkg.game.fallbackLanguage;
    return fb === undefined || fb === this.language_ ? [this.language_] : [this.language_, fb];
  }

  resolve(key: string): TextResult {
    const tables = this.content.pkg.i18n ?? {};
    const chain = this.chain();
    for (const [i, lang] of chain.entries()) {
      // Own keys only (a key like "constructor" must not resolve to an inherited member).
      const table = tables[lang];
      const text = table !== undefined && Object.hasOwn(table, key) ? table[key] : undefined;
      if (text !== undefined && text.trim() !== "") {
        if (i > 0) this.report(key, `no text for "${key}" in "${this.language_}"; using "${lang}"`);
        return { text, language: lang, fallback: i > 0 };
      }
    }
    this.report(key, `no text for "${key}" in ${chain.map((l) => `"${l}"`).join(" → ")}`);
    return { text: this.dev ? key : "", language: null, fallback: true };
  }

  t(key: string): string {
    return this.resolve(key).text;
  }

  private report(key: string, message: string): void {
    const id = `${this.language_}\u0000${key}`;
    if (this.reported.has(id)) return;
    this.reported.add(id);
    this.warn(message);
  }
}
