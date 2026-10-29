// The per-file D-register (tools/decisions/*, docs/decisions/README.md).
//
//   1. the real register is valid: legacy table frozen at LEGACY_LAST, files well-formed, no number twice
//   2. validation rules, one by one
//   3. lookup and the generated overview reach both sources; the overview is never committed
//   4. reservation is atomic: two racing terminals never get the same number; nothing is forced
//   5. ACCEPTANCE: two PRs that each add a decision merge in either order without a conflict
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  LEGACY_LAST, LEGACY_FILE, DECISIONS_DIR, fmt, parseLegacyRows, parseDecisionFile, validateDecisionFile,
  validateRegister, loadRegister, readDecision, highestInTree,
} from "../../tools/decisions/register.mjs";
import { buildIndex, legacySummary } from "../../tools/decisions/index.mjs";
import { reserve, highestTag, tagMessage } from "../../tools/decisions/reserve.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");

const good = (d, extra = "") => `---
d: ${d}
title: Et eksempel
owner: den-seje-app-47
status: RECORDED
date: 2026-10-26
relates: D-220, D-209
---

## Beskrivelse

Tekst med æøå.

## Resultater

Ingen.
${extra}`;

// ── 1. the real register ─────────────────────────────────────────────────────────────────────
test("the repository's register is valid", () => {
  const reg = loadRegister(ROOT);
  assert.deepEqual(validateRegister(reg), []);
  assert.ok(reg.legacy.length >= 218, "legacy rows kept");
  assert.ok(reg.legacy.some((r) => r.n === 1) && reg.legacy.some((r) => r.n === 222));
});

test("docs/decisions holds only README.md and D-NNN.md files (no committed overview)", () => {
  for (const f of readdirSync(join(ROOT, DECISIONS_DIR))) {
    assert.ok(f === "README.md" || /^D-\d{3,}\.md$/.test(f), `unexpected ${f}`);
  }
});

test("CLAUDE.md and the workflow doc name the new register", () => {
  for (const f of ["CLAUDE.md", "docs/CLAUDE_WORKFLOW.md", "docs/decisions/README.md"]) {
    const s = read(f);
    assert.match(s, /docs\/decisions\/D-NNN\.md/, f);
    assert.match(s, /tools\/decisions\/reserve\.mjs/, f);
  }
  assert.match(read(LEGACY_FILE).split("\n").slice(0, 20).join("\n"), new RegExp(`frozen at ${fmt(LEGACY_LAST)}`));
});

// ── 2. validation ────────────────────────────────────────────────────────────────────────────
test("a well-formed decision file passes", () => {
  assert.deepEqual(validateDecisionFile("D-901.md", good("D-901")), []);
  assert.deepEqual(validateDecisionFile("D-901.md", good("D-901").replace(/\n/g, "\r\n")), []);
  const doc = parseDecisionFile(good("D-901"));
  assert.equal(doc.fields.title, "Et eksempel");
});

test("each rule rejects on its own", () => {
  const cases = {
    "bad name": ["D-9a.md", good("D-901"), /file name/],
    "frozen number": [`${fmt(LEGACY_LAST)}.md`, good(fmt(LEGACY_LAST)), /frozen table/],
    "no front matter": ["D-901.md", "# D-901\n", /front matter/],
    "missing owner": ["D-901.md", good("D-901").replace(/^owner:.*\n/m, ""), /"owner"/],
    "missing status": ["D-901.md", good("D-901").replace(/^status:.*\n/m, ""), /"status"/],
    "missing relates": ["D-901.md", good("D-901").replace(/^relates:.*\n/m, ""), /"relates"/],
    "d mismatch": ["D-901.md", good("D-902"), /field d is D-902/],
    "bad date": ["D-901.md", good("D-901").replace("2026-10-26", "26-10-2026"), /YYYY-MM-DD/],
    "bad relates": ["D-901.md", good("D-901").replace("D-220, D-209", "D-220, nogle"), /not a D-number/],
    "self relates": ["D-901.md", good("D-901").replace("D-220, D-209", "D-901"), /itself/],
    "no Beskrivelse": ["D-901.md", good("D-901").replace("## Beskrivelse", "## Om"), /Beskrivelse/],
    "no Resultater": ["D-901.md", good("D-901").replace("## Resultater", "## Udfald"), /Resultater/],
    "mojibake": ["D-901.md", good("D-901", "Ã¦"), /mojibake/],
  };
  for (const [name, [file, text, re]] of Object.entries(cases)) {
    const errs = validateDecisionFile(file, text);
    assert.ok(errs.some((e) => re.test(e)), `${name}: ${JSON.stringify(errs)}`);
  }
  assert.deepEqual(validateDecisionFile("D-901.md", good("D-901").replace("D-220, D-209", "none")), []);
});

test("register: a legacy row above the freeze, a duplicate, or a collision is an error", () => {
  const legacy = parseLegacyRows(`| D-001 | a |\n| **D-002** | **b** |\n| **D-${LEGACY_LAST + 1}** | **c** |\n| D-002 | dup |`);
  const errs = validateRegister({ legacy, files: [] });
  assert.ok(errs.some((e) => /above the freeze/.test(e)));
  assert.ok(errs.some((e) => /D-002 appears twice/.test(e)));
  const n = LEGACY_LAST + 5;
  const clash = validateRegister({
    legacy: [],
    files: [{ name: `${fmt(n)}.md`, n, text: good(fmt(n)) }, { name: `${fmt(n)}.md`, n, text: good(fmt(n)) }],
  });
  assert.ok(clash.some((e) => /already exists/.test(e)));
});

// ── 3. lookup and overview ───────────────────────────────────────────────────────────────────
function tempRepo(extraFiles = {}) {
  const root = mkdtempSync(join(tmpdir(), "dreg-"));
  mkdirSync(join(root, "docs", "decisions"), { recursive: true });
  writeFileSync(join(root, LEGACY_FILE), "| D-001 | Første |\n| **D-002** | **ANDEN BESLUTNING** Status **`DONE`** |\n");
  for (const [p, t] of Object.entries(extraFiles)) writeFileSync(join(root, p), t);
  return root;
}

test("readDecision finds legacy rows and decision files", () => {
  const n = fmt(LEGACY_LAST + 1);
  const root = tempRepo({ [`${DECISIONS_DIR}/${n}.md`]: good(n) });
  assert.equal(readDecision(root, "D-002").source, LEGACY_FILE);
  assert.match(readDecision(root, "D-002").text, /ANDEN BESLUTNING/);
  assert.equal(readDecision(root, n).source, `${DECISIONS_DIR}/${n}.md`);
  assert.equal(readDecision(root, "D-777"), null);
  assert.equal(readDecision(root, "nonsense"), null);
  assert.equal(highestInTree(loadRegister(root)), LEGACY_LAST + 1);
});

test("the generated overview lists both sources in number order", () => {
  const n = fmt(LEGACY_LAST + 1);
  const root = tempRepo({ [`${DECISIONS_DIR}/${n}.md`]: good(n) });
  const out = buildIndex(loadRegister(root));
  const lines = out.trim().split("\n");
  assert.equal(lines.length, 2 + 3);
  assert.match(lines[2], /^\| D-001 \| Første/);
  assert.match(lines[3], /^\| D-002 \| ANDEN BESLUTNING \| DONE \|/);
  assert.match(lines[4], new RegExp(`^\\| ${n} \\| Et eksempel \\| RECORDED \\| D-220, D-209 \\| docs/decisions/${n}.md \\|$`));
  assert.equal(legacySummary("| **D-009** | **A \\| B** rest |").title, "A \\| B");
  // CLI prints the same, writes nothing
  const r = spawnSync(process.execPath, [join(ROOT, "tools/decisions/index.mjs"), "--root", root, "--from", n], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim().split("\n").length, 3);
});

// ── 4. reservation ───────────────────────────────────────────────────────────────────────────
// A fake origin shared by any number of terminals, each with its own local tags.
function fakeOrigin({ tags = [], legacyMax = 223, files = [] } = {}) {
  const remote = new Set(tags.map((n) => `d-number/${fmt(n)}`));
  const calls = [];
  const legacy = Array.from({ length: 3 }, (_, i) => `| **${fmt(legacyMax - i)}** | x |`).join("\n");
  const terminal = (hooks = {}) => {
    const local = new Set();
    return (args) => {
      calls.push(args);
      const [cmd] = args;
      if (cmd === "fetch") return { status: 0, stdout: "", stderr: "" };
      if (cmd === "ls-remote") {
        const pat = args[3];
        const list = [...remote].filter((t) => (pat.endsWith("*") ? t.startsWith(pat.slice(0, -1)) : t === pat));
        return { status: 0, stdout: list.map((t) => `abc\trefs/tags/${t}\nabd\trefs/tags/${t}^{}`).join("\n"), stderr: "" };
      }
      if (cmd === "show") return { status: 0, stdout: legacy, stderr: "" };
      if (cmd === "ls-tree") return { status: 0, stdout: files.map((n) => `${fmt(n)}.md`).join("\n"), stderr: "" };
      if (cmd === "tag" && args[1] === "-a") { local.add(args[2]); return { status: 0, stdout: "", stderr: "" }; }
      if (cmd === "tag" && args[1] === "-d") { local.delete(args[2]); return { status: 0, stdout: "", stderr: "" }; }
      if (cmd === "push") {
        const tag = args[2].replace("refs/tags/", "");
        if (hooks.beforePush) { const h = hooks.beforePush; hooks.beforePush = null; h(); }
        if (remote.has(tag)) return { status: 1, stdout: "", stderr: "! [rejected] (already exists)" };
        if (!local.has(tag)) return { status: 1, stdout: "", stderr: "no such local tag" };
        remote.add(tag);
        return { status: 0, stdout: "", stderr: "" };
      }
      return { status: 1, stdout: "", stderr: "unexpected " + args.join(" ") };
    };
  };
  return { remote, calls, terminal };
}

test("next number is one above tags, legacy table and decision files", () => {
  assert.equal(reserve({ owner: "t1", task: "x", git: fakeOrigin({ tags: [220, 225] }).terminal(), dryRun: true }).d, "D-226");
  assert.equal(reserve({ owner: "t1", task: "x", git: fakeOrigin({ tags: [], legacyMax: 223 }).terminal(), dryRun: true }).d, "D-224");
  assert.equal(reserve({ owner: "t1", task: "x", git: fakeOrigin({ tags: [224], files: [230] }).terminal(), dryRun: true }).d, "D-231");
  assert.equal(highestTag("a\trefs/tags/d-number/D-219\nb\trefs/tags/d-number/D-219^{}\nc\trefs/tags/other/D-999\n"), 219);
});

test("two terminals racing for the same number get different numbers", () => {
  const o = fakeOrigin({ tags: [223] });
  let b = null;
  const gitA = o.terminal({ beforePush: () => { b = reserve({ owner: "termB", task: "b", git: o.terminal() }); } });
  const a = reserve({ owner: "termA", task: "a", git: gitA });
  assert.equal(b.d, "D-224", "B pushed first and won D-224");
  assert.equal(a.d, "D-225", "A was rejected on D-224 and took the next");
  assert.equal(a.attempts, 2);
  assert.deepEqual([...o.remote].sort(), ["d-number/D-223", "d-number/D-224", "d-number/D-225"]);
});

test("a rejected number is never retried, even when the tag listing lags behind", () => {
  const o = fakeOrigin({ tags: [223] });
  const base = o.terminal();
  let rejected = 0;
  // origin already holds D-224 but ls-remote does not show it yet (listing lag): push of D-224 fails
  const git = (args) => {
    if (args[0] === "push" && args[2] === "refs/tags/d-number/D-224") { rejected++; return { status: 1, stdout: "", stderr: "! [rejected] (already exists)" }; }
    return base(args);
  };
  const r = reserve({ owner: "t", task: "x", git });
  assert.equal(rejected, 1);
  assert.equal(r.d, "D-225");
});

test("reservation never forces, deletes on the remote, or retries forever", () => {
  const o = fakeOrigin({ tags: [223] });
  reserve({ owner: "t", task: "x", git: o.terminal() });
  for (const args of o.calls) {
    assert.ok(!args.some((a) => /^--force$|^-f$|^--delete$|^:refs\//.test(a)), args.join(" "));
    if (args[0] === "push") assert.deepEqual(args.slice(0, 2), ["push", "origin"]);
  }
  // always rejected → gives up after maxAttempts
  const stuck = fakeOrigin({ tags: [223] });
  const git = stuck.terminal();
  const always = (args) => (args[0] === "push" ? { status: 1, stdout: "", stderr: "rejected" } : git(args));
  assert.throws(() => reserve({ owner: "t", task: "x", git: always, maxAttempts: 3 }), /after 3 attempts/);
  const src = read("tools/decisions/reserve.mjs").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(src, /--force|"-f"|--delete|push --mirror/);
});

test("reservation input is validated; the tag message carries owner and task", () => {
  const git = fakeOrigin().terminal();
  assert.throws(() => reserve({ owner: "", task: "x", git }), /--owner/);
  assert.throws(() => reserve({ owner: "bad name;", task: "x", git }), /--owner/);
  assert.throws(() => reserve({ owner: "t", task: "line\nbreak", git }), /--task/);
  const m = tagMessage({ d: "D-224", owner: "t", task: "x", date: "2026-10-26" });
  assert.match(m, /^D-224 reserved\n\nowner: t\ntask: x\n/);
});

// ── 5. acceptance: parallel PRs ──────────────────────────────────────────────────────────────
function git(cwd, ...args) {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], { cwd, encoding: "utf8" });
  return r;
}

test("ACCEPTANCE: two PRs adding one decision each merge in either order without a conflict", () => {
  const n1 = fmt(LEGACY_LAST + 1), n2 = fmt(LEGACY_LAST + 2);
  for (const order of [["a", "b"], ["b", "a"]]) {
    const repo = mkdtempSync(join(tmpdir(), "dreg-merge-"));
    assert.equal(git(repo, "init", "-q", "-b", "main").status, 0);
    mkdirSync(join(repo, "docs", "decisions"), { recursive: true });
    writeFileSync(join(repo, "docs", "decisions", "README.md"), "# D-register\n");
    writeFileSync(join(repo, LEGACY_FILE), "| **D-222** | **x** |\n");
    git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "base");
    for (const [br, d] of [["a", n1], ["b", n2]]) {
      git(repo, "checkout", "-q", "-b", br, "main");
      writeFileSync(join(repo, DECISIONS_DIR, `${d}.md`), good(d));
      git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", d);
    }
    git(repo, "checkout", "-q", "main");
    for (const br of order) {
      const m = git(repo, "merge", "--no-ff", "-q", "-m", `merge ${br}`, br);
      assert.equal(m.status, 0, `${order.join("→")}: ${m.stdout}${m.stderr}`);
    }
    const reg = loadRegister(repo);
    assert.deepEqual(reg.files.map((f) => f.n), [LEGACY_LAST + 1, LEGACY_LAST + 2]);
    assert.deepEqual(validateRegister(reg).filter((e) => !/frozen|appears twice/.test(e)), []);
  }
});

test("contrast: the old way (a row each at the end of the shared table) conflicts", () => {
  const repo = mkdtempSync(join(tmpdir(), "dreg-old-"));
  git(repo, "init", "-q", "-b", "main");
  mkdirSync(join(repo, "docs"), { recursive: true });
  writeFileSync(join(repo, LEGACY_FILE), "| **D-221** | **x** |\n| **D-222** | **y** |\n\n### After the table\n");
  git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "base");
  for (const [br, d] of [["a", "D-901"], ["b", "D-902"]]) {
    git(repo, "checkout", "-q", "-b", br, "main");
    const s = readFileSync(join(repo, LEGACY_FILE), "utf8").replace("| **D-222** | **y** |\n", `| **D-222** | **y** |\n| **${d}** | **new** |\n`);
    writeFileSync(join(repo, LEGACY_FILE), s);
    git(repo, "commit", "-q", "-am", d);
  }
  git(repo, "checkout", "-q", "main");
  assert.equal(git(repo, "merge", "--no-ff", "-q", "-m", "a", "a").status, 0);
  assert.notEqual(git(repo, "merge", "--no-ff", "-q", "-m", "b", "b").status, 0, "the shared-table approach conflicts");
});
