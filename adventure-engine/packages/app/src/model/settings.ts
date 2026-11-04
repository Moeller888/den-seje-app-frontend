/**
 * App settings from the URL and the environment (pure, so they can be unit-tested).
 *
 *   ?lang=da|en     initial language (unknown values fall back to the default)
 *   ?motion=off     no animations (same as prefers-reduced-motion)
 *   ?dev=1          dev behaviour in a production build: visible placeholders, keys for missing texts
 *   ?zones=1        draw walk areas and zones (needs dev)
 *   ?seed=<text>    rng seed (default "demo")
 */

export interface AppSettings {
  readonly language: string | null;
  readonly reducedMotion: boolean;
  readonly dev: boolean;
  /** A development build (not a URL flag): only then may saves with a wrong checksum load. */
  readonly devBuild: boolean;
  readonly zones: boolean;
  readonly seed: string;
}

export function readSettings(search: string, env: { readonly dev: boolean; readonly prefersReducedMotion: boolean }, languages: readonly string[]): AppSettings {
  const q = new URLSearchParams(search);
  const lang = q.get("lang");
  const dev = env.dev || q.get("dev") === "1";
  const seed = q.get("seed");
  return {
    language: lang !== null && languages.includes(lang) ? lang : null,
    reducedMotion: env.prefersReducedMotion || q.get("motion") === "off",
    dev,
    devBuild: env.dev,
    zones: dev && q.get("zones") === "1",
    seed: seed !== null && seed.length > 0 ? seed : "demo",
  };
}

/**
 * The engine options that follow from the settings (review M4, follow-up F5):
 * ?dev=1 gives dev behaviour, but only a development build may load saves
 * with a wrong checksum.
 */
export function engineDevOptions(settings: AppSettings): { readonly devMode: boolean; readonly allowSaveChecksumMismatch: boolean } {
  return { devMode: settings.dev, allowSaveChecksumMismatch: settings.devBuild };
}

/** Replace `{name}` placeholders; unknown names stay visible so that mistakes are noticed. */
export function format(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{([a-z]+)\}/g, (m, name: string) => values[name] ?? m);
}
