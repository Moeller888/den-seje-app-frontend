// Every migration VERSION in supabase/migrations is used by exactly one file (tools/ci/migration-versions.mjs explains
// why: schema_migrations is keyed by the version, the replay plan by the name). On main and on every pull request's
// merge with main in CI. The CLI checks the same rule against other open branches before a push.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collisions, duplicateVersions, versionOf } from "../../tools/ci/migration-versions.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILES = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql"));

test("no two migration files share a version", () => {
  assert.deepEqual(duplicateVersions(FILES), []);
});

test("every migration file except prestige.sql has a 14-digit version", () => {
  assert.deepEqual(FILES.filter((f) => versionOf(f) === null), ["prestige.sql"]);
});

test("the rule, with the 2026-11-24 collision as its case (D-386 merged, F8 open on 20261124120000)", () => {
  const d386 = "20261124120000_avatar_northstar_hair_h25g1_d386.sql";
  const f8 = "20261124120000_course_round_parking.sql";
  assert.deepEqual(duplicateVersions([d386, f8, "20261123100000_x.sql"]), [{ version: "20261124120000", names: [d386, f8].sort() }]);
  assert.deepEqual(duplicateVersions([d386, `supabase/migrations/${d386}`]), [], "the same file twice is not a collision");
  assert.deepEqual(duplicateVersions(["prestige.sql", "prestige.sql"]), [], "no version, no rule");
  assert.deepEqual(collisions([f8], [{ ref: "origin/main", names: [d386] }]),
    [{ version: "20261124120000", mine: f8, theirs: d386, ref: "origin/main" }]);
  assert.deepEqual(collisions(["20261124160000_course_round_parking.sql"], [{ ref: "origin/main", names: [d386] }]), [], "the renumbered F8");
  assert.deepEqual(collisions([f8], [{ ref: "origin/other", names: [f8] }]), [], "the same file merged elsewhere is not a collision");
  for (const bad of ["2026112412000_x.sql", "x_20261124120000.sql", "20261124120000.sql", "20261124120000_x.txt"]) assert.equal(versionOf(bad), null, bad);
});

// ── The CLI against real throwaway git repositories (no network) ────────────────────────────────────────────────
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";

const CLI = join(ROOT, "tools", "ci", "migration-versions.mjs");
const G = (cwd, ...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args],
  { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const cli = (cwd, ...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
};
function addMigration(repo, name) {
  mkdirSync(join(repo, "supabase", "migrations"), { recursive: true });
  writeFileSync(join(repo, "supabase", "migrations", name), "select 1;\n");
  G(repo, "add", "-A");
  G(repo, "commit", "-q", "-m", `add ${name}`);
}
// main = A (v…100000). origin/main is a remote-tracking ref; `feature` is checked out.
function fixture() {
  const repo = mkdtempSync(join(tmpdir(), "mig-cli-"));
  G(repo, "init", "-q", "-b", "main");
  addMigration(repo, "20261201100000_a.sql");
  G(repo, "update-ref", "refs/remotes/origin/main", "HEAD");
  G(repo, "checkout", "-q", "-b", "feature");
  return repo;
}
// A remote-tracking ref origin/<name> = main + the given migrations (built on a temporary branch).
function remoteBranch(repo, name, files) {
  const back = G(repo, "rev-parse", "--abbrev-ref", "HEAD");
  G(repo, "checkout", "-q", "-b", `tmp-${name}`, "origin/main");
  for (const f of files) addMigration(repo, f);
  G(repo, "update-ref", `refs/remotes/origin/${name}`, "HEAD");
  G(repo, "checkout", "-q", back);
  G(repo, "branch", "-q", "-D", `tmp-${name}`);
}
function withRepo(fn) {
  const repo = fixture();
  try { fn(repo); } finally { rmSync(repo, { recursive: true, force: true }); }
}

test("CLI: unique → 0; a duplicate version inside this tree → 1", () => withRepo((repo) => {
  addMigration(repo, "20261201110000_b.sql");
  let r = cli(repo);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /ok — 1 added on this branch/);
  addMigration(repo, "20261201110000_b_twin.sql");
  r = cli(repo);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /COLLISION in this tree: version 20261201110000/);
}));

test("CLI: the same version on ANOTHER branch → 1 naming that branch; the same FILE on a stacked branch → 0", () => withRepo((repo) => {
  addMigration(repo, "20261201110000_b.sql");
  remoteBranch(repo, "stacked", ["20261201110000_b.sql"]);
  assert.equal(cli(repo).status, 0, "the same file is not a collision");
  remoteBranch(repo, "other", ["20261201110000_c.sql"]);
  const r = cli(repo);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /this branch adds 20261201110000_b\.sql; origin\/other has 20261201110000_c\.sql/);
}));

test("CLI: renumbering this branch's unmerged migration clears the collision (its own stale origin ref is ignored)", () => withRepo((repo) => {
  addMigration(repo, "20261201120000_f8.sql");
  G(repo, "update-ref", "refs/remotes/origin/feature", "HEAD"); // pushed under the old number
  remoteBranch(repo, "avatar", ["20261201120000_avatar.sql"]); // another track merged/pushed the same number
  assert.equal(cli(repo).status, 1);
  renameSync(join(repo, "supabase/migrations/20261201120000_f8.sql"), join(repo, "supabase/migrations/20261201160000_f8.sql"));
  G(repo, "add", "-A");
  G(repo, "commit", "-q", "-m", "renumber");
  const r = cli(repo);
  assert.equal(r.status, 0, r.out);
}));

test("CLI: a stale remote-tracking ref still counts until pruned (the safe direction); an unfetched branch is invisible", () => withRepo((repo) => {
  addMigration(repo, "20261201110000_b.sql");
  remoteBranch(repo, "deleted-on-github", ["20261201110000_old.sql"]);
  assert.equal(cli(repo).status, 1, "not pruned: still reported");
  G(repo, "update-ref", "-d", "refs/remotes/origin/deleted-on-github"); // what `git fetch --prune` does
  assert.equal(cli(repo).status, 0, "pruned: gone");
}));

test("CLI: an unreadable ref, a missing base or no git repository → 2 (never a silent ok)", () => withRepo((repo) => {
  addMigration(repo, "20261201110000_b.sql");
  const blob = G(repo, "hash-object", "-w", "--stdin");
  G(repo, "update-ref", "refs/remotes/origin/not-a-commit", blob);
  let r = cli(repo);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /cannot read the tree of origin\/not-a-commit/);
  G(repo, "update-ref", "-d", "refs/remotes/origin/not-a-commit");
  r = cli(repo, "--base", "origin/never-fetched");
  assert.equal(r.status, 2, r.out);
  const empty = mkdtempSync(join(tmpdir(), "mig-cli-nogit-"));
  try {
    r = cli(empty);
    assert.equal(r.status, 2, r.out);
  } finally { rmSync(empty, { recursive: true, force: true }); }
}));

test("CLI: a second worktree of the same repository sees the same refs and the same answer", () => withRepo((repo) => {
  addMigration(repo, "20261201110000_b.sql");
  remoteBranch(repo, "other", ["20261201110000_c.sql"]);
  const parent = mkdtempSync(join(tmpdir(), "mig-cli-wt-"));
  const wt = join(parent, "wt").replace(/\\/g, "/");
  try {
    G(repo, "worktree", "add", "-q", "-b", "feature2", wt, "feature");
    const r = cli(wt);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /origin\/other has 20261201110000_c\.sql/);
  } finally {
    rmSync(parent, { recursive: true, force: true }); // the repository (and its worktree metadata) goes with withRepo
  }
}));
