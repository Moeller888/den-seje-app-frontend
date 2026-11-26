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
//     It fetches nothing itself — run `git fetch --prune origin` first. Without --prune a remote-tracking ref of a
//     branch deleted on GitHub stays and can report a collision that no longer exists (the safe direction); a branch
//     not fetched yet is invisible (the unsafe direction). A ref whose tree cannot be read is reported and fails the
//     run (exit 2) instead of being skipped — a ref merely without supabase/migrations is not an error.
//
// NOT A RESERVATION. This is a snapshot of fetched refs. Two sessions that pick one version before either has pushed
// do not see each other; the tree test then catches it in CI at the latest. Avoid round hours.
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

const defaultGit = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const isGitError = (e) => typeof e?.status === "number"; // a git exit code — not a bug in this script

/**
 * The whole check, shared by this CLI and tools/agents/claim.mjs push-check (one rule, one implementation).
 *   base, head  refs (default origin/main, HEAD);  self  this branch's name, whose own origin ref is not "another
 *   branch";  run(args) → git stdout (throws on a git error; claim.mjs passes its own runner with the cwd).
 *   skipWithoutMigrations  a tree WITHOUT supabase/migrations is "nothing to check" (claim.mjs: every branch passes
 *   push-check, most never touch migrations) instead of a usage error (the CLI is run on purpose).
 * Returns { code: 0 ok · 1 collision · 2 git error / unreadable ref / missing base, added, errors[], collisions[],
 * checkedRefs, summary }. Nothing added → no ref is read at all (no extra cost for ordinary branches).
 */
export function checkBranch({ base = "origin/main", head = "HEAD", self = null, run = defaultGit, skipWithoutMigrations = false } = {}) {
  const errors = [];
  const out = (code, extra) => ({ code, added: [], errors, collisions: [], checkedRefs: 0, ...extra });
  const ls = (ref) => run(["ls-tree", "--name-only", `${ref}:${MIGRATIONS_DIR}`]).split("\n").map((s) => s.trim()).filter(Boolean);
  const hasDir = (ref) => run(["ls-tree", "-d", "--name-only", ref, MIGRATIONS_DIR]).trim() === MIGRATIONS_DIR;
  let here, added;
  try {
    if (!hasDir(head)) {
      if (skipWithoutMigrations) return out(0, { summary: `no ${MIGRATIONS_DIR} in ${head} — nothing to check` });
      errors.push(`${head} has no ${MIGRATIONS_DIR}`);
      return out(2, { summary: "nothing to compare" });
    }
    here = ls(head);
    const fork = run(["merge-base", head, base]).trim();
    const before = new Set(hasDir(fork) ? ls(fork) : []);
    added = here.filter((n) => !before.has(n));
  } catch (e) {
    if (!isGitError(e)) throw e;
    errors.push(`git: ${String(e.stderr || e.message).split("\n")[0].trim()} (is ${base} fetched?)`);
    return out(2, { summary: "git error" });
  }
  const dup = duplicateVersions(here).map((d) => ({ version: d.version, mine: d.names[0], theirs: d.names[1], ref: "this tree" }));
  if (added.length === 0) {
    return { code: dup.length ? 1 : 0, added, errors, collisions: dup, checkedRefs: 0,
      summary: dup.length ? "duplicate version in this tree" : "0 added on this branch — no ref read" };
  }
  let refs;
  try {
    refs = run(["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"]).split("\n").map((s) => s.trim())
      .filter((r) => r && r !== "origin/HEAD" && r !== "origin" && r !== `origin/${self}`);
  } catch (e) {
    if (!isGitError(e)) throw e;
    errors.push(`git: cannot list origin refs`);
    return out(2, { added, summary: "git error" });
  }
  const trees = [];
  for (const ref of refs) {
    try { trees.push({ ref, names: hasDir(ref) ? ls(ref) : [] }); } catch (e) {
      if (!isGitError(e)) throw e;
      errors.push(`cannot read the tree of ${ref}`);
    }
  }
  const hits = [...dup, ...collisions(added, trees)];
  if (hits.length) return { code: 1, added, errors, collisions: hits, checkedRefs: trees.length, summary: `${hits.length} collision(s)` };
  if (errors.length) return { code: 2, added, errors, collisions: [], checkedRefs: trees.length, summary: `${errors.length} ref(s) unreadable — git fetch --prune origin and run again` };
  return { code: 0, added, errors, collisions: [], checkedRefs: trees.length,
    summary: `${added.length} added on this branch, unique against ${trees.length} origin branches (fetched state)` };
}

/** One line per finding, for both the CLI and claim.mjs. */
export function describeCheck(r) {
  const lines = [];
  for (const e of r.errors) lines.push(`ERROR: ${e}`);
  for (const h of r.collisions) {
    lines.push(h.ref === "this tree"
      ? `COLLISION in this tree: version ${h.version} is used by ${h.mine} and ${h.theirs}`
      : `COLLISION: this branch adds ${h.mine}; ${h.ref} has ${h.theirs} (version ${h.version})`);
  }
  if (r.code === 1) lines.push("Pick a version that no branch uses (later than every migration this one requires), rename the file and every reference.");
  return lines;
}

function main(argv) {
  const opt = (name, dflt) => { const i = argv.indexOf(name); return i < 0 ? dflt : argv[i + 1]; };
  const base = opt("--base", "origin/main");
  const head = opt("--head", "HEAD");
  if (!base || !head) { console.error("usage: node tools/ci/migration-versions.mjs [--base origin/main] [--head HEAD]"); return 2; }
  let self = null;
  if (head === "HEAD") {
    try { self = defaultGit(["rev-parse", "--abbrev-ref", "HEAD"]).trim(); } catch (e) {
      if (!isGitError(e)) throw e;
      console.error("migration versions: not a git repository"); return 2;
    }
  }
  const r = checkBranch({ base, head, self });
  for (const l of describeCheck(r)) console.error(l);
  if (r.code === 0) console.log(`migration versions: ok — ${r.summary}`);
  else console.error(`migration versions: ${r.summary}`);
  return r.code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`migration versions: ${e.message.split("\n")[0]}`); process.exitCode = 2; }
}
