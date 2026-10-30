import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * The content editor (phase 6): a separate app with two pages, the editor and
 * the preview page that runs the game. Nothing of it is part of the game build.
 */
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
    rollupOptions: { input: { editor: resolve(import.meta.dirname, "index.html"), preview: resolve(import.meta.dirname, "preview.html") } },
  },
  server: { port: 5174, strictPort: true },
  preview: { port: 4318, strictPort: true },
});
