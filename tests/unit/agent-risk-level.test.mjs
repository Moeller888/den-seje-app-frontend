// tools/agents/risk-level.mjs — deterministisk risikoniveau (AURA T1, docs/operations/autonomy-levels.md).
// Rene funktioner og en CLI-kørsel med --stdin; intet netværk, ingen git-skrivninger.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  classifyChange, classifyPath, parseUnifiedDiff, loadCodeowners, patternToRegExp, LEVEL3_PATHS, main,
} from "../../tools/agents/risk-level.mjs";

const rules = loadCodeowners();
const SCRIPT = fileURLToPath(new URL("../../tools/agents/risk-level.mjs", import.meta.url));
const lvl = (files, declared) => classifyChange({ files, declared, codeownersRules: rules }).level;
const f = (path, added = [], extra = {}) => ({ path, added, isNew: false, deleted: false, renamed: false, ...extra });

const diff = (path, added, { newFile = false } = {}) => [
  `diff --git a/${path} b/${path}`,
  ...(newFile ? ["new file mode 100644", "--- /dev/null"] : [`--- a/${path}`]),
  `+++ b/${path}`,
  "@@ -1,1 +1,2 @@",
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

test("13: CLI — exitkoden er niveauet; forkert brug er 64", () => {
  const run = (args, input) => spawnSync(process.execPath, [SCRIPT, ...args], { input, encoding: "utf8" });
  assert.equal(run(["--stdin"], diff("js/hub.js", ["const a = 1;"])).status, 1);
  assert.equal(run(["--stdin"], diff(".github/workflows/x.yml", ["on: push"])).status, 3);
  assert.equal(run(["--stdin", "--declared", "2"], diff("js/hub.js", ["const a = 1;"])).status, 2);
  assert.equal(run(["--stdin", "--json"], diff("app.js", ["x"])).status, 2);
  assert.equal(run(["--declared", "0"], "").status, 64);
  assert.equal(run(["--base", "main;rm -rf /"], "").status, 64);
  assert.equal(run(["--ukendt"], "").status, 64);
  const out = [];
  assert.equal(main(["--stdin"], { stdin: () => "", out: (s) => out.push(s), err: () => {} }), 2, "tom diff → 2");
});
