import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./style.css";
import { IndexedDbMirror, MemoryStorage, SettingsStore, WebStorage, type IdbFactoryLike } from "@adventure-engine/save";
import { demoContent } from "./demo/content.ts";
import { demoManifest } from "./demo/manifest.ts";
import { Game, type SaveServices } from "./game.ts";
import { readSettings } from "./model/settings.ts";
import { gameReady } from "./ready.ts";

/**
 * Save storage (spec 05 E5): IndexedDB first, then localStorage, then memory
 * only (saves last for this page). A store that cannot be used is reported.
 */
async function openStorage(): Promise<SaveServices> {
  try {
    // The save package types IndexedDB structurally (no DOM typings); DOM handlers declare `this`/event parameters it never uses.
    const idb = await IndexedDbMirror.open(indexedDB as unknown as IdbFactoryLike);
    return { storage: idb, kind: "indexeddb", flush: () => idb.flush() };
  } catch (err) {
    console.warn("[save] IndexedDB is not available, falling back to localStorage", err);
  }
  try {
    const probe = "engine:probe";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return { storage: new WebStorage(localStorage), kind: "localstorage", flush: () => Promise.resolve(true) };
  } catch (err) {
    console.warn("[save] localStorage is not available; saves last only for this page", err);
  }
  return { storage: new MemoryStorage(), kind: "memory", flush: () => Promise.resolve(true) };
}

async function boot(): Promise<void> {
  const languages = demoContent.game.languages;
  const fromUrl = readSettings(
    window.location.search,
    { dev: import.meta.env.DEV, prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches },
    languages,
  );
  const store = await openStorage();
  // ?lang= wins over the stored language choice; an unknown stored language is ignored.
  const storedLanguage = new SettingsStore(store.storage, demoContent.game.id).load().language;
  const language = fromUrl.language ?? (storedLanguage !== null && languages.includes(storedLanguage) ? storedLanguage : null);
  const game = new Game(demoContent, demoManifest(import.meta.env.BASE_URL), { ...fromUrl, language }, store);
  game.setLanguage(game.engine.text.language, false);
  await game.mount();
  gameReady(game);
}

boot().catch((err: unknown) => {
  // Content or setup errors are shown, never swallowed.
  const box = document.getElementById("notice");
  if (box !== null) {
    box.hidden = false;
    box.textContent = err instanceof Error ? err.message : String(err);
  }
  console.error(err);
});
