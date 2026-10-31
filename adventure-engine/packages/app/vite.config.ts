import { defineConfig, type Plugin } from "vite";

/**
 * DEV_TOOLS=true builds the game with the developer tools (phase 6) into
 * dist-devtools/ (preview on port 4319): the devtools entry script is added to
 * index.html for that build only. A normal build has no reference to it.
 */
const devTools = process.env["DEV_TOOLS"] === "true";

const devtoolsEntry: Plugin = {
  name: "devtools-entry",
  transformIndexHtml: {
    order: "pre",
    handler: (html) => html.replace("</body>", '  <script type="module" src="./src/devtools/boot.ts"></script>\n  </body>'),
  },
};

// Relative base so the production build works from any static path.
export default defineConfig({
  base: "./",
  plugins: devTools ? [devtoolsEntry] : [],
  build: { outDir: devTools ? "dist-devtools" : "dist", emptyOutDir: true, target: "es2022", sourcemap: true },
  server: { port: 5173, strictPort: true },
  preview: { port: devTools ? 4319 : 4317, strictPort: true },
});
