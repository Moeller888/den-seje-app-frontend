/**
 * E2E servers (phase 6): builds the game, the game with DEV_TOOLS=true and the
 * editor, then serves them with `vite preview` in this one process
 * (editor 4318, devtools game 4319, game 4317 last: Playwright waits for it).
 * Stopping this process stops all three servers.
 */

import { fileURLToPath } from "node:url";
import { build, preview } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const app = `${root}packages/app`;
const editor = `${root}packages/editor`;
const quiet = { logLevel: "warn" };

delete process.env.DEV_TOOLS;
await build({ root: app, ...quiet });
process.env.DEV_TOOLS = "true";
await build({ root: app, ...quiet });
delete process.env.DEV_TOOLS;
await build({ root: editor, ...quiet });

const servers = [];
servers.push(await preview({ root: editor, preview: { host: "127.0.0.1" } }));
process.env.DEV_TOOLS = "true";
servers.push(await preview({ root: app, preview: { host: "127.0.0.1" } }));
delete process.env.DEV_TOOLS;
servers.push(await preview({ root: app, preview: { host: "127.0.0.1" } }));
for (const s of servers) console.log(`[e2e] serving ${s.resolvedUrls?.local?.[0] ?? "?"}`);

const stop = async () => {
  await Promise.all(servers.map((s) => s.close()));
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
