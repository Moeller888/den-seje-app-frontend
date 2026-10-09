// Security regression: reset-pending is retired and must not come back.
//
// It let any signed-in caller — pupils included — run a global, unscoped update of
// question_instances (teacher_score IS NULL) through the backend key. It had no caller since its
// teacher button was removed on 2026-04-22. Live it is a fail-closed 410 stub (v5, 2026-10-09)
// pending separate deletion; the repository no longer carries the function at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NAMES = /reset-pending|resetPending|reset_pending/;

test("supabase/functions/reset-pending/ does not exist", () => {
  assert.equal(existsSync(join(REPO, "supabase", "functions", "reset-pending")), false);
});

test("supabase/config.toml does not register the function", () => {
  const config = readFileSync(join(REPO, "supabase", "config.toml"), "utf8");
  assert.equal(/\[functions\.reset-pending\]/.test(config), false);
  assert.equal(NAMES.test(config), false);
});

test("no frontend, Edge Function or root page/script refers to the endpoint", () => {
  const hits = [];
  const scan = (p) => { if (NAMES.test(readFileSync(p, "utf8"))) hits.push(relative(REPO, p).split("\\").join("/")); };
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|js|mjs|html|json|toml)$/.test(name)) scan(p);
    }
  };
  walk(join(REPO, "supabase", "functions"));
  walk(join(REPO, "js"));
  for (const name of readdirSync(REPO)) {
    const p = join(REPO, name);
    if (statSync(p).isFile() && /\.(js|mjs|html|json)$/.test(name)) scan(p);
  }
  assert.deepEqual(hits, []);
});

test("the architecture doc records the retirement instead of listing it as a live function", () => {
  const doc = readFileSync(join(REPO, "docs", "ARCHITECTURE.md"), "utf8");
  assert.match(doc, /`reset-pending` retired 2026-10-09; live endpoint temporarily returns 410 pending separate\s+deletion\./);
  const table = doc.split("\n").filter((l) => l.startsWith("|") && NAMES.test(l));
  assert.deepEqual(table, [], "no Edge Function table row for reset-pending");
});
