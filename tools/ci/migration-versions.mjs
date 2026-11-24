#!/usr/bin/env node
// Migration VERSIONS are unique — in this tree, and against every other branch on origin.
//
// WHY. supabase_migrations.schema_migrations is keyed by the 14-digit version, not the file name. Two files with one
// version cannot both be recorded, and the replay plan keys files by NAME, so neither the accounting test nor the
// isolated replay notices a collision. It happened on 2026-11-24: #747 (D-386, merged) and #745 (F8, open) both used
// 20261124120000. A pull request's CI only sees main as it was when CI ran (the ruleset is not strict), so two open
// branches can each pass and then collide on main.
//
// TWO CHECKS, one rule:
//   * tests/unit/migration-versions-unique.test.mjs — this tree (main, and every PR's merge with main in CI);
//   * this CLI, before a push (docs/operations/agent-coordination.md, the claim protocol's push step): the migrations
//     this branch ADDS against every origin/* branch already fetched. Read-only: git ls-tree / merge-base / for-each-ref.
//     It fetches nothing itself — run `git fetch origin` first, as the claim protocol already does.
//
//   node tools/ci/migration-versions.mjs [--base origin/main] [--head HEAD]   exit 0 = unique · 1 = collision · 2 = usage/git error
//
// A collision is SAME version, DIFFERENT name. The same file on two branches (one merged into the other) is not one.
// prestige.sql (no version) is outside the rule; the CLI skips names without a version.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const MIGRATIONS_DIR = "supabase/migrations";
const NAME = /^(\d{14})_[^/]+\.sql$/;

/** The 14-digit version of a migration file name, or null (prestige.sql and anything without one). */
export function versionOf(name) {
  const m = NAME.exec(String(name).split("/").pop());
  return m ? m[1] : null;
}

/** Versions used by more than one name: [{ version, names }]. */
export function duplicateVersions(names) {
  const byVersion = new Map();
  for (const n of names) {
    const v = versionOf(n);
    if (!v) continue;
    const file = String(n).split("/").pop();
    if (!byVersion.has(v)) byVersion.set(v, new Set());
    byVersion.get(v).add(file);
  }
  return [...byVersion].filter(([, s]) => s.size > 1).map(([version, s]) => ({ version, names: [...s].sort() }));
}

/** This branch's added files against every other ref: [{ version, mine, theirs, ref }]. */
export function collisions(added, refs) {
  const out = [];
  for (const file of added) {
    const v = versionOf(file);
    if (!v) continue;
    for (const { ref, names } of refs) {
      for (const other of names) {
        if (versionOf(other) === v && other !== file) out.push({ version: v, mine: file, theirs: other, ref });
      }
    }
  }
  return out;
}

const git = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const lsMigrations = (ref) => git(["ls-tree", "--name-only", `${ref}:${MIGRATIONS_DIR}`]).split("\n").map((s) => s.trim()).filter(Boolean);

function main(argv) {
  const opt = (name, dflt) => { const i = argv.indexOf(name); return i < 0 ? dflt : argv[i + 1]; };
  const base = opt("--base", "origin/main");
  const head = opt("--head", "HEAD");
  if (!base || !head) { console.error("usage: node tools/ci/migration-versions.mjs [--base origin/main] [--head HEAD]"); return 2; }
  const here = lsMigrations(head);
  const dup = duplicateVersions(here);
  for (const d of dup) console.error(`COLLISION in this tree: version ${d.version} is used by ${d.names.join(" and ")}`);
  const fork = git(["merge-base", head, base]).trim();
  const before = new Set(lsMigrations(fork));
  const added = here.filter((n) => !before.has(n));
  const self = head === "HEAD" ? git(["rev-parse", "--abbrev-ref", "HEAD"]).trim() : null;
  const refs = git(["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"]).split("\n").map((s) => s.trim())
    .filter((r) => r && r !== "origin/HEAD" && r !== "origin" && r !== `origin/${self}`);
  const trees = [];
  for (const ref of refs) {
    try { trees.push({ ref, names: lsMigrations(ref) }); } catch { /* a ref without the directory */ }
  }
  const hits = collisions(added, trees);
  for (const h of hits) console.error(`COLLISION: this branch adds ${h.mine}; ${h.ref} has ${h.theirs} (version ${h.version})`);
  if (dup.length || hits.length) {
    console.error("Pick a version that no branch uses (later than every migration this one requires), rename the file and every reference.");
    return 1;
  }
  console.log(`migration versions: ok — ${added.length} added on this branch, unique against ${trees.length} origin branches (fetched state)`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`migration versions: ${e.message.split("\n")[0]}`); process.exitCode = 2; }
}
