// Reserves the next free D-number by creating the annotated tag `d-number/D-NNN` on origin.
//
// ATOMIC: GitHub refuses to create a tag that already exists (a push without --force), so two
// terminals racing for the same number cannot both win — the loser fetches again and tries the next
// number. Nothing is ever overwritten, force-pushed or deleted on the remote.
//
// The candidate is one above the highest number known from: the remote reservation tags, the legacy
// table and the decision files on origin/main.
//
//   node tools/decisions/reserve.mjs --owner <terminal> --task "<short task>" [--dry-run]
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLegacyRows, fmt, LEGACY_FILE, DECISIONS_DIR } from "./register.mjs";

export const TAG_PREFIX = "d-number/";
const TAG = /^refs\/tags\/d-number\/D-(\d{3,})$/;

export function defaultGit(args) {
  const r = spawnSync("git", args, { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

// `git ls-remote --tags origin 'd-number/*'` output → highest number (peeled ^{} lines ignored).
export function highestTag(lsRemoteOutput) {
  let max = 0;
  for (const line of String(lsRemoteOutput).split("\n")) {
    const ref = line.split("\t")[1];
    const m = ref && TAG.exec(ref.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

export function highestOnMain(git) {
  let max = 0;
  const ps = git(["show", `origin/main:${LEGACY_FILE}`]);
  if (ps.status !== 0) throw new Error(`cannot read ${LEGACY_FILE} on origin/main`);
  for (const r of parseLegacyRows(ps.stdout)) max = Math.max(max, r.n);
  const ls = git(["ls-tree", "--name-only", `origin/main:${DECISIONS_DIR}`]);
  if (ls.status === 0) {
    for (const f of ls.stdout.split("\n")) {
      const m = /^D-(\d{3,})\.md$/.exec(f.trim());
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return max;
}

export function tagMessage({ d, owner, task, date }) {
  return `${d} reserved\n\nowner: ${owner}\ntask: ${task}\nreserved-by: ${owner} via tools/decisions/reserve.mjs\nreserved-at: ${date} (UTC)\n`;
}

// Returns { d, attempts } or throws. `git` is injectable for tests.
export function reserve({ owner, task, git = defaultGit, maxAttempts = 5, dryRun = false, now = new Date() }) {
  if (!owner || !/^[\w.-]{1,64}$/.test(owner)) throw new Error("--owner must be a short terminal name ([A-Za-z0-9_.-])");
  if (!task || task.length > 300 || /[\r\n]/.test(task)) throw new Error("--task must be one line, at most 300 characters");
  const date = now.toISOString().slice(0, 10);
  let floor = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const f = git(["fetch", "--quiet", "origin", "main"]);
    if (f.status !== 0) throw new Error("git fetch origin main failed: " + f.stderr.trim());
    const ls = git(["ls-remote", "--tags", "origin", `${TAG_PREFIX}*`]);
    if (ls.status !== 0) throw new Error("git ls-remote failed: " + ls.stderr.trim());
    const candidate = Math.max(highestTag(ls.stdout), highestOnMain(git), floor) + 1;
    const d = fmt(candidate);
    const tag = `${TAG_PREFIX}${d}`;
    if (dryRun) return { d, attempts: attempt, dryRun: true };
    const t = git(["tag", "-a", tag, "origin/main", "-m", tagMessage({ d, owner, task, date })]);
    if (t.status !== 0) throw new Error(`git tag ${tag} failed: ${t.stderr.trim()}`);
    const p = git(["push", "origin", `refs/tags/${tag}`]);
    if (p.status === 0) {
      const v = git(["ls-remote", "--tags", "origin", tag]);
      if (v.status !== 0 || !v.stdout.includes(`refs/tags/${tag}`)) throw new Error(`pushed ${tag} but cannot see it on origin — check before using it`);
      return { d, attempts: attempt };
    }
    // Someone else won this number: drop OUR local tag only, then try the next one.
    git(["tag", "-d", tag]);
    floor = candidate;
  }
  throw new Error(`no D-number reserved after ${maxAttempts} attempts`);
}

const invoked = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invoked) {
  const args = process.argv.slice(2);
  const at = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  try {
    const r = reserve({ owner: at("--owner"), task: at("--task"), dryRun: args.includes("--dry-run") });
    console.log(r.dryRun ? `next free: ${r.d} (dry run, nothing reserved)` : `reserved ${r.d} (tag ${TAG_PREFIX}${r.d}) — write docs/decisions/${r.d}.md`);
  } catch (e) {
    console.error("reserve: " + e.message);
    process.exit(1);
  }
}
