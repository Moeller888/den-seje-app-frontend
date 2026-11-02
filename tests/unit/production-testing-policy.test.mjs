// D-313 — production tests are production writes, and every production action is logged.
// Pins CLAUDE.md rule 49, docs/migration-workflow-policy.md §6 and the shape of every entry in
// docs/operations/production-actions/. Documentation protection only: it cannot stop a script from
// reaching production, and does not claim to.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const LOG_DIR = "docs/operations/production-actions";
const ENTRY_RE = /^\d{4}-\d{2}-\d{2}T\d{4}Z-[a-z0-9-]+\.md$/;

const CLAUDE = read("CLAUDE.md");
const POLICY = read("docs/migration-workflow-policy.md");
const entries = readdirSync(join(ROOT, LOG_DIR)).filter((f) => f !== "README.md");

test("CLAUDE.md carries rule 49: production tests are production writes", () => {
  assert.match(CLAUDE, /49\. PRODUKTIONSTESTS ER PRODUKTIONSSKRIVNINGER/);
  assert.match(CLAUDE, /ligger i en fil, som guarden ikke inspicerer/);
  assert.match(CLAUDE, /"Kør smoke" uden disse oplysninger\s+er ikke nok/);
  assert.match(CLAUDE, /docs\/operations\/production-actions\//);
  assert.match(CLAUDE, /Flyt aldrig koden\s+til en fil for at komme uden om den/);
});

test("the migration policy carries §6 and grants no standing permission for production tests", () => {
  assert.match(POLICY, /## 6\. Production tests and every other production action \(D-313\)/);
  assert.match(POLICY, /is a\s+production write/);
  assert.match(POLICY, /There is no standing permission/);
  assert.match(POLICY, /operations\/production-actions\/README\.md/);
});

test("the log folder holds only README.md and well-named entries", () => {
  assert.ok(entries.length > 0, "the production log has no entries");
  for (const f of entries) assert.match(f, ENTRY_RE, `unexpected file ${f}`);
});

test("every log entry has its fields, both headings, and a time matching its file name", () => {
  for (const f of entries) {
    const s = read(`${LOG_DIR}/${f}`);
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(s);
    assert.ok(fm, `${f}: no front matter`);
    for (const key of ["time", "session", "action", "go"]) {
      assert.match(fm[1], new RegExp(`^${key}: \\S`, "m"), `${f}: missing "${key}"`);
    }
    const time = /^time: (\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):\d{2}Z$/m.exec(fm[1]);
    assert.ok(time, `${f}: time is not YYYY-MM-DDTHH:MM:SSZ`);
    assert.ok(f.startsWith(`${time[1]}T${time[2]}${time[3]}Z-`), `${f}: file name does not match its time`);
    assert.match(s, /^## Skrivninger$/m, `${f}: missing "## Skrivninger"`);
    assert.match(s, /^## Kontrol$/m, `${f}: missing "## Kontrol"`);
  }
});

test("no log entry contains an e-mail address, a key or a token", () => {
  const forbidden = [
    [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, "an e-mail address"],
    [/eyJ[A-Za-z0-9_-]{10,}/, "a JWT"],
    [/\bsbp_[A-Za-z0-9]{6,}/, "a Supabase access token"],
    [/\bsb_(secret|publishable)_[A-Za-z0-9_-]{6,}/, "a Supabase API key"],
  ];
  for (const f of ["README.md", ...entries]) {
    const s = read(`${LOG_DIR}/${f}`);
    for (const [re, what] of forbidden) assert.ok(!re.test(s), `${f} contains ${what}`);
  }
});
