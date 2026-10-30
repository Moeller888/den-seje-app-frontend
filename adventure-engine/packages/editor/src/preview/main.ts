/**
 * The preview page: runs the project in the game's own Game class (renderer,
 * media, audio and save packages exactly as in production), with a fresh
 * engine per start and memory-only saves. It talks to the editor only through
 * postMessage (protocol.ts).
 */

import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@adventure-engine/app/style.css";
import { Game } from "@adventure-engine/app/game";
import { localManifest, previewServices, type FromPreview, type ToPreview } from "./protocol.ts";

const post = (m: FromPreview): void => window.parent.postMessage(m, window.location.origin);
let started = false;

window.addEventListener("message", (ev: MessageEvent<ToPreview>) => {
  if (ev.origin !== window.location.origin || ev.data?.type !== "load" || started) return;
  started = true;
  try {
    const { bundle, urls } = ev.data;
    const game = new Game(bundle.content, localManifest(bundle.manifest, urls), { language: null, reducedMotion: false, dev: true, devBuild: false, zones: false, seed: "preview" }, previewServices());
    game.setLanguage(game.engine.text.language, false);
    void game.mount().then(() => {
      document.documentElement.dataset["preview"] = "running";
      post({ type: "started" });
    });
    let seen = 0;
    window.setInterval(() => {
      const list = game.engine.warnings;
      if (list.length === seen) return;
      seen = list.length;
      post({ type: "warnings", list: list.map((w) => ({ code: w.code, message: w.message })) });
    }, 300);
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
});
post({ type: "ready" });
