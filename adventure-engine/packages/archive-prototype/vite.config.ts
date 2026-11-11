import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * Arkivskabet (D-307): two pages from one build. The SAME dist is served on two ports so host and game
 * run on two different origins, as in production: host.html on 4320, game.html on 4321
 * (tools/e2e-serve.mjs). Each page is its own entry, so the game bundle never contains host code.
 */
const page = (name: string): string => fileURLToPath(new URL(`./${name}.html`, import.meta.url));

export default defineConfig({
  base: "./",
  build: { outDir: "dist", emptyOutDir: true, target: "es2022", sourcemap: true, rollupOptions: { input: { host: page("host"), game: page("game") } } },
  preview: { port: 4320, strictPort: true },
});
