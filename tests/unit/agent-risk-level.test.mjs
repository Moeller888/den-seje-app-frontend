// tools/agents/risk-level.mjs — deterministisk risikoniveau (AURA T1, docs/operations/autonomy-levels.md).
// Rene funktioner og en CLI-kørsel med --stdin; intet netværk, ingen git-skrivninger.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  classifyChange, classifyPath, parseUnifiedDiff, loadCodeowners, patternToRegExp, LEVEL3_PATHS, main, EXIT,
  unquotePath, parseNameStatusZ, codeOf,
} from "../../tools/agents/risk-level.mjs";

const rules = loadCodeowners();
const SCRIPT = fileURLToPath(new URL("../../tools/agents/risk-level.mjs", import.meta.url));
const lvl = (files, declared) => classifyChange({ files, declared, codeownersRules: rules }).level;
const f = (path, added = [], extra = {}) => ({ path, added, removed: [], isNew: false, deleted: false, renamed: false, ...extra });

const diff = (path, added, { newFile = false } = {}) => [
  `diff --git a/${path} b/${path}`,
  ...(newFile ? ["new file mode 100644", "--- /dev/null"] : [`--- a/${path}`]),
  `+++ b/${path}`,
  `@@ -0,0 +1,${added.length} @@`,
  ...added.map((l) => "+" + l),
  "",
].join("\n");

test("1: almindelig frontend, dokumentation og avatar-værktøj er niveau 1", () => {
  assert.equal(lvl([f("js/avatar-layers.js", ["const x = 1;"])]), 1);
  assert.equal(lvl([f("hub.html", ["<p>Hej</p>"]), f("css/hub.css", ["a{color:red}"])]), 1);
  assert.equal(lvl([f("docs/decisions/D-999.md", ["tekst"]), f("tools/avatar/build-x.mjs", ["export const a = 1;"])]), 1);
  assert.equal(lvl([f("tests/avatar-x.spec.ts", ["test('x', () => {});"]), f("tests/unit/avatar-x.test.mjs", ["ok"])]), 1);
});

test("2: sikkerhedskritiske stier er niveau 3, uanset indhold", () => {
  for (const p of [".github/workflows/x.yml", ".github/CODEOWNERS", ".claude/settings.json", "CLAUDE.md",
    "tools/agents/claim.mjs", "tools/e2e/provision-accounts.mjs", "tests/e2e-accounts.mjs", "worker/index.js",
    "js/supabase.js", "docs/operations/e2e-prod-provisioning.md", "docs/operations/autonomy-levels.md",
    "tests/unit/ci-e2e-prod-provision.test.mjs", "tests/unit/codeowners.test.mjs", "tests/isolated/isolation-guard.mjs",
    "tests/isolated/seed/seed-guard.mjs", "supabase/config.toml", ".gitignore"]) {
    assert.equal(lvl([f(p, ["# kun en kommentar"])]), 3, p);
  }
});

test("3: backend, belønning, login, elevdata og ukendte stier er niveau 2 (fail closed)", () => {
  for (const p of ["supabase/functions/process-event/index.ts", "supabase/migrations/20990101000000_x.sql", "app.js",
    "js/progression.js", "js/login.js", "js/student-detail.js", "tests/isolated/schema/replay-plan.mjs",
    "noget-helt-nyt/fil.mjs", "tools/avatar-batch/send.mjs"]) {
    assert.equal(lvl([f(p, ["x"])]), 2, p);
  }
  assert.equal(lvl([]), 2, "ingen filer → 2");
});

test("4: agentens eget skøn kan kun hæve niveauet, aldrig sænke det", () => {
  assert.equal(lvl([f(".github/workflows/x.yml")], 1), 3);
  assert.equal(lvl([f("js/hub.js", ["x"])], 3), 3);
  assert.equal(lvl([f("js/hub.js", ["x"])], 2), 2);
  for (const bad of [0, 4, -1, "1; rm", null, NaN]) assert.equal(lvl([f("js/hub.js", ["x"])], bad), 3, String(bad));
});

test("5: ugyldige stier giver niveau 3", () => {
  for (const p of ["../.github/workflows/x.yml", "/etc/passwd", "js/../.github/x", "", "js/a\nb"]) {
    assert.equal(classifyPath(p, rules).level, 3, JSON.stringify(p));
  }
});

test("6: indholdssignaler i kode hæver niveauet", () => {
  assert.equal(lvl([f("js/hub.js", ["const k = process.env.SUPABASE_SERVICE_ROLE_KEY;"])]), 3);
  assert.equal(lvl([f("js/hub.js", ["await sb.auth.admin.createUser({})"])]), 3);
  assert.equal(lvl([f("js/hub.js", ["await supabase.from('profiles').update({ role: 'x' })"])]), 2);
  assert.equal(lvl([f("js/hub.js", ["await supabase.rpc('award_xp', {})"])]), 2);
  assert.equal(lvl([f("js/hub.js", ["fetch('https://evil.example.net/x')"])]), 2);
  assert.equal(lvl([f("js/hub.js", ["fetch('https://lærlig.dk/x')"])]), 1);
  assert.equal(lvl([f("js/hub.js", ["fetch('https://xn--lrlig-sra.dk/x')"])]), 1);
  // Domænelisten gælder kun værten — ikke en forespørgselsstreng eller et underdomæne af en fremmed vært.
  assert.equal(lvl([f("js/hub.js", ["fetch('https://evil.example.net/?ref=lærlig.dk')"])]), 2);
  assert.equal(lvl([f("js/hub.js", ["fetch('https://lærlig.dk.evil.net/x')"])]), 2);
  assert.equal(lvl([f("js/hub.js", ["fetch('https://localhost.evil.net/x')"])]), 2);
  assert.equal(lvl([f("js/hub.js", ["fetch('https://ondæ.dk/x')"])]), 2, "værter med æøå tæller også");
  assert.equal(lvl([f("js/hub.js", ["fetch('https://api.openai.com/v1/images')"])]), 2, "betalt eksternt kald");
  // XML-namespaces i SVG er ikke netværkskald
  assert.equal(lvl([f("assets/x.svg", ['<svg xmlns="http://www.w3.org/2000/svg">'])]), 1);
  // createHash().update er ikke en databaseskrivning
  assert.equal(lvl([f("js/hub.js", ["createHash('sha256').update(b).digest('hex')"])]), 1);
});

test("7: et aktiveringsflag (true/false) i kode er niveau 2 — #729-mønstret", () => {
  assert.equal(lvl([f("js/avatar-layers.js", ["export const NORTHSTAR_HAIR_NH5C = true;"])]), 2);
  assert.equal(lvl([f("js/flags-x.js", ["  QUESTION_MIX_ENGINE: false,"])]), 2);
  assert.equal(lvl([f("js/avatar-layers.js", ["const count = 86;"])]), 1);
  // i dokumentation er det kun tekst
  assert.equal(lvl([f("docs/AVATAR_SYSTEM.md", ["`NORTHSTAR_HAIR_NH5C = true`"])]), 1);
});

test("8: SQL — destruktivt og rettigheder er 3, kommentarer tæller ikke", () => {
  const m = "supabase/migrations/20990101000000_x.sql";
  assert.equal(lvl([f(m, ["DROP TABLE public.x;"])]), 3);
  assert.equal(lvl([f(m, ["REVOKE EXECUTE ON FUNCTION public.f() FROM anon;"])]), 3);
  assert.equal(lvl([f(m, ["SECURITY DEFINER"])]), 3);
  assert.equal(lvl([f(m, ["DELETE FROM public.profiles WHERE true;"])]), 3);
  assert.equal(lvl([f(m, ["-- rollback: DROP TABLE public.x;"])]), 2, "kommentar → kun stiens niveau");
  assert.equal(lvl([f(m, ["UPDATE public.questions SET is_active = true WHERE id = 1;"])]), 2);
});

test("9: test og dokumentation uden ejer: kun rigtige hemmeligheder og guard-omgåelse tæller", () => {
  assert.equal(lvl([f("tests/unit/x-migration-run.test.mjs", ["CREATE ROLE service_role BYPASSRLS;", "DROP TABLE x;"])]), 1);
  assert.equal(lvl([f("docs/x.md", ["sb_secret_" + "a".repeat(30)])]), 3);
  assert.equal(lvl([f("tests/unit/x.test.mjs", ["// " + "eyJ" + "a".repeat(30) + "." + "b".repeat(30) + "." + "c".repeat(20)])]), 3);
  assert.equal(lvl([f("docs/x.md", ["git commit --no-verify"])]), 3);
  assert.equal(lvl([f("js/x.js", ["// [skip ci]"])]), 3);
});

test("10: append-only — ny produktionspost er 1, ændring af en eksisterende er 2", () => {
  const p = "docs/operations/production-actions/2099-01-01T0000Z-x.md";
  assert.equal(lvl([f(p, ["tekst"], { isNew: true })]), 1);
  assert.equal(lvl([f(p, ["tekst"])]), 2);
  assert.equal(lvl([f(p, [], { deleted: true })]), 2);
  assert.equal(lvl([f(p, ["tekst"], { isNew: true, renamed: true })]), 2);
});

test("11: diff-parseren — ny fil, omdøbning til en beskyttet sti og SQL-kommentarer", () => {
  const files = parseUnifiedDiff(diff("docs/operations/production-actions/a.md", ["x"], { newFile: true }));
  assert.equal(files.length, 1);
  assert.equal(files[0].isNew, true);

  const ren = parseUnifiedDiff([
    "diff --git a/js/x.js b/.github/workflows/x.yml", "similarity index 100%",
    "rename from js/x.js", "rename to .github/workflows/x.yml", "",
  ].join("\n"));
  assert.deepEqual(ren.map((x) => x.path).sort(), [".github/workflows/x.yml", "js/x.js"]);
  assert.equal(lvl(ren), 3, "omdøbning ind i .github → 3");

  // En fjernet linje "-- x" bliver "--- x" i diffen; den må ikke læses som et filhoved.
  const sql = parseUnifiedDiff([
    "diff --git a/js/a.js b/js/a.js", "--- a/js/a.js", "+++ b/js/a.js", "@@ -1,2 +1,2 @@",
    "--- .github/workflows/evil.yml", "+const a = 1;", "",
  ].join("\n"));
  assert.deepEqual(sql.map((x) => x.path), ["js/a.js"]);
  assert.deepEqual(sql[0].added, ["const a = 1;"]);
});

test("12: hvert niveau 3-mønster er også ejet i CODEOWNERS (niveau 3 ⊆ ejerskab)", () => {
  const files = execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n").filter(Boolean);
  const l3 = LEVEL3_PATHS.map(patternToRegExp);
  const notOwned = files.filter((p) => l3.some((re) => re.test(p)) && !rules.some((r) => r.re.test(p)));
  assert.deepEqual(notOwned, []);
});

test("13: CLI — exitkoden er 10 + niveauet; forkert brug er 64", () => {
  const run = (args, input) => spawnSync(process.execPath, [SCRIPT, ...args], { input, encoding: "utf8" });
  assert.equal(run(["--stdin"], diff("js/hub.js", ["const a = 1;"])).status, 11);
  assert.equal(run(["--stdin"], diff(".github/workflows/x.yml", ["on: push"])).status, 13);
  assert.equal(run(["--stdin", "--declared", "2"], diff("js/hub.js", ["const a = 1;"])).status, 12);
  assert.equal(run(["--stdin", "--json"], diff("app.js", ["x"])).status, 12);
  assert.equal(run(["--declared", "0"], "").status, 64);
  assert.equal(run(["--base", "main;rm -rf /"], "").status, 64);
  assert.equal(run(["--base=-p"], "").status, 64, "en --base, der ligner et flag, afvises");
  assert.equal(run(["--ukendt"], "").status, 64);
  const out = [];
  assert.equal(main(["--stdin"], { stdin: () => "", out: (s) => out.push(s), err: () => {} }), EXIT[2], "tom diff → 2");
  assert.deepEqual({ ...EXIT }, { 1: 11, 2: 12, 3: 13, usage: 64 });
});

// ---------------------------------------------------------------------------------------------
// AURA-03: fejl, der tidligere gav niveau 1 (uafhængigt review af #737 og den blinde test)
// ---------------------------------------------------------------------------------------------
const quiet = { out: () => {}, err: () => {} };
const fakeGit = (over = {}) => (args) => {
  const k = args.includes("--name-status") ? "names"
    : args[0] === "show" ? (args[1].endsWith("CODEOWNERS") ? "co" : "self")
    : args[0] === "log" ? "log" : "diff";
  const v = over[k];
  if (v instanceof Error) throw v;
  return v;
};
const selfText = () => readFileSync(SCRIPT, "utf8");
const CO_TEXT = readFileSync(new URL("../../.github/CODEOWNERS", import.meta.url), "utf8");

test("14: K1 — enhver fejl i CLI'en giver 3, aldrig niveau 1", () => {
  assert.equal(main(["--stdin"], { ...quiet, stdin: () => { throw new Error("stdin fejlede"); } }), EXIT[3]);
  assert.equal(main([], { ...quiet, git: () => { throw new Error("git findes ikke"); } }), EXIT[3]);
  assert.equal(main(["--base", "doesnotexist"], { ...quiet, git: fakeGit({ diff: new Error("unknown revision") }) }), EXIT[3]);
});

test("15: K4 — CLI'en bruger base-versionen af reglerne og giver 3, når klassifikatoren er ændret", () => {
  const d = diff("js/hub.js", ["const a = 1;"]);
  const base = { diff: d, names: "M\0js/hub.js\0", co: CO_TEXT, log: "fix: x\n", self: selfText() };
  const io = (over) => ({ ...quiet, git: fakeGit({ ...base, ...over }), self: selfText });
  assert.equal(main([], io({})), EXIT[1], "uændret klassifikator → 1");
  assert.equal(main([], io({ self: "// gammel version" })), EXIT[3], "ændret klassifikator → 3");
  assert.equal(main([], io({ self: new Error("findes ikke på base") })), EXIT[3]);
  assert.equal(main([], io({ names: "M\0js/hub.js\0A\0.github/workflows/x.yml\0" })), EXIT[3], "fil, parseren ikke så");
  assert.equal(main([], io({ log: "chore: x [skip ci]\n" })), EXIT[3], "[skip ci] i en commit-besked");
  // Base-CODEOWNERS tæller: en sti, der er ejet på base, er mindst 2, selv om branchen fjerner ejerskabet.
  const d2 = diff("tools/question-cli/x.mjs", ["const a = 1;"]);
  assert.equal(main([], io({ diff: d2, names: "M\0tools/question-cli/x.mjs\0", co: "/tools/question-cli/ @Moeller888\n" })), EXIT[2]);
});

test("16: K2 — citerede stier (core.quotePath) afkodes", () => {
  assert.equal(unquotePath('"b/ni/r\\303\\246kkef\\303\\270lge.yml"'), "b/ni/rækkefølge.yml");
  const q = [
    "diff --git a/js/hub.js b/js/hub.js", "--- a/js/hub.js", "+++ b/js/hub.js", "@@ -1,0 +1,1 @@", "+const a = 1;",
    'diff --git "a/.github/workflows/\\303\\270.yml" "b/.github/workflows/\\303\\270.yml"', "new file mode 100644",
    "--- /dev/null", '+++ "b/.github/workflows/\\303\\270.yml"', "@@ -0,0 +1,1 @@", "+on: push", "",
  ].join("\n");
  const files = parseUnifiedDiff(q);
  assert.deepEqual(files.map((x) => x.path).sort(), [".github/workflows/ø.yml", "js/hub.js"]);
  assert.equal(lvl(files), 3);
  const ren = parseUnifiedDiff([
    'diff --git a/js/x.js "b/.claude/\\303\\270.json"', "similarity index 100%", "rename from js/x.js",
    'rename to ".claude/\\303\\270.json"', "",
  ].join("\n"));
  assert.equal(lvl(ren), 3);
  // Uciterede stier med mellemrum
  const sp = parseUnifiedDiff(["diff --git a/docs/a b.md b/docs/a b.md", "--- a/docs/a b.md", "+++ b/docs/a b.md", "@@ -1 +1 @@", "-x", "+y", ""].join("\n"));
  assert.deepEqual(sp.map((x) => x.path), ["docs/a b.md"]);
});

test("17: K3 — linjer, der ikke kan parses, og ufuldstændige diffs giver 3", () => {
  const js = diff("js/hub.js", ["const a = 1;"]);
  const cases = {
    "---/+++ uden diff --git": js + "--- a/.github/w.yml\n+++ b/.github/w.yml\n@@ -0,0 +1 @@\n+x\n",
    "diff --cc": js + "diff --cc .github/w.yml\n",
    "uden præfiks": js + "diff --git js/x.js js/x.js\n",
    "mnemonic-præfiks": js + "diff --git c/js/x.js w/js/x.js\n",
    "afkortet hunk": ["diff --git a/js/x.js b/js/x.js", "--- a/js/x.js", "+++ b/js/x.js", "@@ -1,3 +1,4 @@", "+a"].join("\n"),
    "tekst før første filhoved": "Subject: hej\n" + js,
    "afkortet filhoved": js + "diff --git a/.git",
  };
  for (const [name, text] of Object.entries(cases)) assert.equal(lvl(parseUnifiedDiff(text)), 3, name);
  assert.equal(parseUnifiedDiff(js).some((x) => x.anomaly), false, "en gyldig diff har ingen anomali");
});

test("18: binære filer, symlinks, submodules og sletninger", () => {
  const bin = (p) => parseUnifiedDiff([`diff --git a/${p} b/${p}`, "new file mode 100644", "index 0000000..1234567",
    `Binary files /dev/null and b/${p} differ`, ""].join("\n"));
  assert.equal(lvl(bin("assets/x.png")), 1);
  assert.equal(lvl(bin("js/x.js")), 2, "binær js-fil");
  const patch = parseUnifiedDiff(["diff --git a/assets/y.png b/assets/y.png", "new file mode 100644", "index 0000000..1234567",
    "GIT binary patch", "literal 5", "McmZQzWMXCj0002N00961", "", "literal 0", "HcmV?d00001", "", ""].join("\n"));
  assert.equal(lvl(patch), 1);
  const link = parseUnifiedDiff(["diff --git a/js/link.js b/js/link.js", "new file mode 120000", "index 0000000..1234567",
    "--- /dev/null", "+++ b/js/link.js", "@@ -0,0 +1 @@", "+../hub.html", "\\ No newline at end of file", ""].join("\n"));
  assert.equal(lvl(link), 3, "symlink");
  const sub = parseUnifiedDiff(["diff --git a/js/sub b/js/sub", "new file mode 160000", "index 0000000..1234567",
    "--- /dev/null", "+++ b/js/sub", "@@ -0,0 +1 @@", "+Subproject commit 1234567", ""].join("\n"));
  assert.equal(lvl(sub), 3, "submodule");
  assert.equal(lvl([f("js/hub.js", [], { deleted: true })]), 2, "sletning af kode");
  assert.equal(lvl([f("tests/avatar-x.spec.ts", [], { deleted: true })]), 2, "sletning af en test");
  assert.equal(lvl([f("docs/old.md", [], { deleted: true })]), 1);
});

test("19: H3 — en ændring, der fjerner asserts eller springer test over, er mindst 2", () => {
  assert.equal(lvl([f("tests/unit/review-answer-ownership.test.mjs", ["// ok"], { removed: ["  assert.equal(a, b);", "  assert.ok(c);"] })]), 2);
  assert.equal(lvl([f("tests/unit/x.test.mjs", ["  assert.equal(a, 2);"], { removed: ["  assert.equal(a, 1);"] })]), 1, "lige mange → 1");
  assert.equal(lvl([f("tests/avatar-x.spec.ts", ["test.skip('x', async () => {});"])]), 2);
  assert.equal(lvl([f("tests/unit/x.test.mjs", ["test('x', { skip: true }, () => {});"])]), 2);
});

test("20: H4/H5 — navnemønstre og kommentarer skjuler ikke kode", () => {
  assert.equal(lvl([f("js/fixtures/x.js", ["const k = process.env.SUPABASE_SERVICE_ROLE_KEY;"])]), 3);
  assert.equal(lvl([f("js/test/x.js", ["await sb.from('profiles').update({ a: 1 })"])]), 2);
  assert.equal(lvl([f("js/x.spec.js", ["await sb.from('profiles').update({ a: 1 })"])]), 2);
  assert.equal(lvl([f("js/x-snapshots/a.js", ["const s = 'sb_secret_" + "a".repeat(30) + "';"])]), 3);
  for (const l of ["/* x */ await sb.from('profiles').delete()", "--i; fetch('https://evil.com/x')",
    "* 2; fetch('https://evil.com/x')", "#p = supabase.rpc('award_xp')", 'const s = " // "; await sb.rpc("award_xp")']) {
    assert.equal(lvl([f("js/hub.js", [l])]), 2, l);
  }
  assert.equal(lvl([f("hub.html", ['<!-- --><script src="https://evil.com/x.js"></script>'])]), 2);
  assert.equal(codeOf("-- rollback: DROP TABLE x;", "a.sql"), "");
  assert.equal(codeOf("// kun en kommentar", "a.js"), "");
});

test("21: flere måder at skrive til databasen, kalde ud og slå flag til", () => {
  for (const l of [".update({ role: 'x' })", "await sb.from(TABLE).insert(row)", "await sb.from('x')['delete']()",
    "await sb.rpc(fn)", "fetch(`${SUPABASE_URL}/rest/v1/profiles`, { method: 'PATCH' })", "new WebSocket('wss://evil.com/s')",
    "fetch('//evil.com/x')", "fetch('https://203.0.113.5/x')", "fetch('https://x@evil.com/')",
    "fetch('https://lærlig.dk:x@evil.com/')", "eval(code)", "new Function(src)()", "await import(u)",
    "const QUESTION_MIX_ENGINE_ON = !0;", "init({ QUESTION_MIX_ENGINE: true })", "FLAGS.NEW_FEATURE = true;",
    "document.body.appendChild(document.createElement('script'))"]) {
    assert.ok(lvl([f("js/hub.js", [l])]) >= 2, l);
  }
});

test("22: stier — agentinstruktioner, mapper med filnavne, append-only og produktion", () => {
  for (const p of ["docs/CLAUDE.md", "js/CLAUDE.md", "js/AGENTS.md", "docs/.claude/settings.json",
    "docs/operations/production-actions/CLAUDE.md", "tools/edge/gnq-release.mjs", "tools/cloudflare-build-static.mjs",
    "tests/isolated/scope.mjs", "tests/isolated/require-complete-run.mjs", "tests/support/mail-guard.ts",
    "tests/support/unit-timing.mjs", "tools/ci/run-triage.mjs", "node_modules/x/index.js"]) {
    assert.equal(classifyPath(p, rules).level, 3, p);
  }
  for (const p of ["x.html/package.json", "tests/a.spec.ts/run.sh", "style.css/evil.js", "tests/support/x.ts",
    "adventure-engine/pnpm-lock.yaml", "adventure-engine/packages/x/package.json", "teacher.html"]) {
    assert.equal(classifyPath(p, rules).level, 2, p);
  }
  assert.equal(lvl([f("docs/operations/production-actions/x.sql", ["select 1;"], { isNew: true })]), 2, "append-only: kun Markdown");
  assert.equal(lvl([f("docs/operations/production-actions/run.mjs", ["x"], { isNew: true })]), 2);
});

test("23: specs mod produktionen — admin-klient er 3, skrivning er 2 (blind test #316)", () => {
  assert.equal(lvl([f("tests/avatar-x.spec.ts", ["  const { data } = await adminClient"])]), 3);
  assert.equal(lvl([f("tests/avatar-x.spec.ts", ["const c = createClient(u, process.env.SUPABASE_SERVICE_ROLE_KEY);"])]), 3);
  assert.equal(lvl([f("tests/avatar-x.spec.ts", ["    .update({ avatar_gender: target })"])]), 2);
  assert.equal(lvl([f("tests/isolated/x.isolated.spec.mjs", ["    .update({ a: 1 })"])]), 1, "den isolerede stak er ikke produktion");
});

test("24: name-status -z læses strengt", () => {
  assert.deepEqual(parseNameStatusZ("M\0a.js\0R100\0b.js\0c.js\0D\0d.js\0"), ["a.js", "b.js", "c.js", "d.js"]);
  assert.throws(() => parseNameStatusZ("Q\0a.js\0"));
  assert.throws(() => parseNameStatusZ("R100\0b.js\0"));
});
