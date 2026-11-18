// Mutation test for the E2E account-safety guards (A1–A3, A5 and the teacher_id repair):
//   tests/e2e-guard.mjs     the guarded service-role client
//   tests/e2e-accounts.mjs  the account registry and the read-only verification
//   tests/e2e-admin.mjs     the only entry points that turn the service-role key into a client
//
// For every mutant ONE textual change is applied and the guard unit tests are run; at least one test
// must FAIL (the mutant is "killed"). A surviving mutant means a safety rule no test pins.
//
// NO FILE IS EVER WRITTEN — no copy, no temporary directory, nothing to restore. The mutant exists only
// in memory: the test processes are started with NODE_OPTIONS=--import=mutant-preload.mjs, which
// serves the mutated source to `import` (a module-loader hook) and to fs.readFileSync of that one file
// (so the static contract tests see the same mutant). An interrupted run therefore cannot leave a
// mutated source behind; the script still hashes every file under tests/ and tools/e2e-safety/ before
// and after, and fails if anything changed. No network: the tests use in-memory fakes and loopback.
//
//   node tools/e2e-safety/mutate-guards.mjs            all mutants
//   node tools/e2e-safety/mutate-guards.mjs G03 A13    only these
//
// Exit 0 only when the baseline is green, every mutant applies exactly once and is killed, and the
// repository is unchanged. tests/unit/e2e-guard-mutants.test.mjs pins that every mutant still applies.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const TESTS = Object.freeze([
  "tests/unit/e2e-guard.test.mjs",
  "tests/unit/e2e-accounts.test.mjs",
  "tests/unit/e2e-admin.test.mjs",
  "tests/unit/e2e-account-safety-contract.test.mjs",
  "tests/unit/isolated-suite-runner.test.mjs",
  "tests/unit/e2e-slot-accounts.test.mjs",
]);

const G = "tests/e2e-guard.mjs";
const A = "tests/e2e-accounts.mjs";
const M = "tests/e2e-admin.mjs";

// [file, name, from, to]: `from` must occur EXACTLY once in `file`.
export const MUTANTS = Object.freeze([
  // ── guard ──
  [G, "G01 no owner-filter requirement", "if (ownerFilters === 0) refuse(", "if (false) refuse("],
  [G, "G02 unknown id accepted", "if (!ids.has(t)) refuse(", "if (false) refuse("],
  [G, "G03 invalid UUID accepted", "if (!isUuid(t)) refuse(", "if (false) refuse("],
  [G, "G04 empty in() accepted", "if (!Array.isArray(args[1]) || args[1].length === 0) refuse(", "if (!Array.isArray(args[1])) refuse("],
  [G, "G05 profiles insert/delete allowed", 'if (method !== "update" && UPDATE_ONLY_TABLES.includes(table))', "if (false)"],
  [G, "G06 role change allowed", "if (values.role !== roleOf(id)) refuse(", "if (false) refuse("],
  [G, "G07 teacher_id to a pupil allowed", 'if (col === "teacher_id" && roleOf(v) !== "teacher") refuse(', "if (false) refuse("],
  [G, "G08 id-like value to a stranger allowed", "if (!isVerified(v)) refuse(`${table}.${col}", "if (false) refuse(`${table}.${col}"],
  [G, "G09 insert row for a stranger allowed", "if (!isVerified(row[owner])) refuse(", "if (false) refuse("],
  [G, "G10 upsert without owner conflict allowed", "if (!conflict.includes(owner)) refuse(", "if (false) refuse("],
  [G, "G11 writes sent without confirm()", "p = confirmed().then(() => send(chain));", "p = Promise.resolve().then(() => send(chain));"],
  [G, "G12 password write without confirm()", "return confirmed().then(() => raw.auth.admin.updateUserById(id, { password }));", "return raw.auth.admin.updateUserById(id, { password });"],
  [G, "G13 owner password writable", "if (!PASSWORD_KINDS.includes(kindOf(id))) return", "if (false) return"],
  [G, "G14 other auth attributes writable", 'Object.keys(attributes).join(",") !== "password"', "false"],
  [G, "G15 unknown auth.admin method passes through", "refuse(`auth.admin.${String(prop)} er ikke tilladt", "return raw.auth.admin[prop]; refuse(`auth.admin.${String(prop)} er ikke tilladt"],
  [G, "G16 unknown client property passes through", "refuse(`.${String(prop)} er ikke tilladt på service-role-klienten (kun", "return raw[prop]; refuse(`.${String(prop)} er ikke tilladt på service-role-klienten (kun"],
  [G, "G17 unreviewed table writable", "if (typeof table !== \"string\" || !has(OWNER_COLUMN, table)) {", "if (false) {"],
  [G, "G18 broad chain method accepted", "refuse(`${label}: .${String(prop)}() er ikke tilladt", "return () => proxy; refuse(`${label}: .${String(prop)}() er ikke tilladt"],
  [G, "G19 owner column changeable", "if (!isInsert && has(values, owner)) refuse(", "if (false) refuse("],
  [G, "G20 duplicate verified ids accepted", "if (new Set(ACCOUNT_KINDS.map((k) => verified.ids[k])).size !== ACCOUNT_KINDS.length) refuse(\"verificerede", "if (false) refuse(\"verificerede"],
  [G, "G21 confirm() optional", 'if (typeof confirm !== "function") refuse(', "if (false) refuse("],
  [G, "G22 ids read live (not snapshotted)", "const ids = new Set(ACCOUNT_KINDS.map((k) => verified.ids[k]));", "const ids = { has: (t) => Object.values(verified.ids).includes(t) };"],
  [G, "G23 match() owner value unchecked", "if (has(args[0], owner)) { ownerFilters++; targets.push(args[0][owner]); }", "if (has(args[0], owner)) { ownerFilters++; }"],
  [G, "G24 role writable on other tables", 'if (table !== "profiles") refuse(`${table}: kolonnen role', "if (false) refuse(`${table}: kolonnen role"],
  [G, "G25 auth.* (non-admin) passes through", "refuse(`auth.${String(prop)} er ikke tilladt", "return raw.auth[prop]; refuse(`auth.${String(prop)} er ikke tilladt"],
  // ── registry / verification ──
  [A, "A01 extra marker keys accepted", 'if (keys.join(",") !== "kind,slot,v") return false;', ""],
  [A, "A02 marker slot ignored", "marker.v === MARKER_VERSION && marker.slot === slot && marker.kind === kind", "marker.v === MARKER_VERSION && marker.kind === kind"],
  [A, "A03 any domain accepted", "if (host === null || host !== domain)", "if (host === null)"],
  [A, "A04 isolated domain without loopback", "if (!isLoopbackUrl(env.SUPABASE_URL)) {", "if (false) {"],
  [A, "A05 slot 0 may use slot addresses", "if (slot === 0 && local.includes(SLOT_TAG))", "if (false)"],
  [A, "A06 slot N may use foreign addresses", "if (slot > 0 && !local.endsWith(`${SLOT_TAG}${slot}`))", "if (false)"],
  [A, "A07 owner env unchecked", "lower(configured) !== lower(derived)", "false"],
  [A, "A08 duplicate addresses accepted", "if (seen.has(k)) problems.push", "if (false) problems.push"],
  [A, "A09 pagination stops at a short page", "if (users.length === 0) { complete = true; break; }", "if (users.length < PAGE_SIZE) { complete = true; break; }"],
  [A, "A10 duplicate accounts accepted", "if (found[kind]) problems.push(`${kind}: adressen", "if (false) problems.push(`${kind}: adressen"],
  [A, "A11 marker not required", "if (!hasExactMarker(u, slot, kind)) {", "if (false) {"],
  [A, "A12 role unchecked", "if (p.role !== EXPECTED_ROLE[kind]) problems.push", "if (false) problems.push"],
  [A, "A13 relation unchecked", "if (!p || p.teacher_id === ids[teacherKind]) continue;", "continue;"],
  [A, "A14 teacher with a teacher accepted", "if (p && p.teacher_id !== null && p.teacher_id !== undefined) { problems.push", "if (false) { problems.push"],
  [A, "A15 teacher with extra pupils accepted", "if (mine.length !== 1 || mine[0] !== ids[pupil]) {", "if (!mine.includes(ids[pupil])) {"],
  [A, "A16 listUsers error ignored", 'if (error) throw new E2EAccountError(["listUsers fejlede', 'if (false) throw new E2EAccountError(["listUsers fejlede'],
  [A, "A17 record for another slot accepted", "if (rec?.slot !== slot) problems.push", "if (false) problems.push"],
  [A, "A18 record with duplicate ids accepted", "if (new Set(ACCOUNT_KINDS.map((k) => ids[k])).size !== ACCOUNT_KINDS.length) problems.push", "if (false) problems.push"],
  [A, "A19 user_metadata accepted as marker", "const meta = user && typeof user === \"object\" ? user.app_metadata : null;", "const meta = user && typeof user === \"object\" ? (user.app_metadata?.[MARKER_KEY] ? user.app_metadata : user.user_metadata) : null;"],
  [A, "A20 requiredAddress falls back to a default", "if (typeof value !== \"string\" || value.trim() === \"\") throw new E2EAccountError([`${name}: mangler (ingen standardværdi)`]);", "if (typeof value !== \"string\" || value.trim() === \"\") return \"teacher-test@\" + \"hotmail.com\";"],
  [A, "A21 incomplete listing accepted", "if (!complete) throw", "if (false) throw"],
  [A, "A22 missing address accepted", "if (typeof value !== \"string\" || value === \"\") return [`${name}: mangler (ingen standardværdi)`];", "if (typeof value !== \"string\" || value === \"\") return [];"],
  [A, "A23 record version unchecked", "rec.v !== MARKER_VERSION) problems.push", "false) problems.push"],
  [A, "A24 missing account skipped", "if (!u) { problems.push(`${kind}: kontoen findes ikke", "if (!u) { continue; problems.push(`${kind}: kontoen findes ikke"],
  // ── teacher_id repair (an interrupted password-help run) ──
  [A, "R01 repair offered despite hard problems", "if (hard === 0 && detached.length > 0) {", "if (detached.length > 0) {"],
  [A, "R02 a pupil of ANOTHER teacher counts as detached", "if (p.teacher_id === null && p.role === EXPECTED_ROLE[pupil]) detached.push(pupil);", "if (true) detached.push(pupil);"],
  [A, "R03 a teacher with a stranger pupil is repairable", "if (!(mine.length === 0 && detached.includes(pupil))) hard++;", "if (false) hard++;"],
  [A, "R04 a teacher that has a teacher is repairable", "{ problems.push(`${kind} (${ids[kind]}): har selv en lærer`); hard++; }", "{ problems.push(`${kind} (${ids[kind]}): har selv en lærer`); }"],
  [M, "R05 no re-verification after the repair", "    verified = await verifyAccounts(registry, readDeps(raw));\n  }", "    verified = err.repair;\n  }"],
  [M, "R06 failed repair write ignored", "if (error) throw new E2EAccountError([`${kind} (${id}): teacher_id kunne ikke gendannes`]);", ""],
  [M, "R07 repair writes through the raw client", "await guarded.from(\"profiles\")", "await raw.from(\"profiles\")"],
  [M, "R08 any error triggers a repair attempt", "if (!(err instanceof E2EAccountError) || !err.repair) throw err;", "if (!err.repair) { verified = null; }"],
  // ── admin entry points ──
  [M, "M01 spec client skips re-verification", "const fresh = await verifyAccounts(registry, readDeps(raw));", "const fresh = verified;"],
  [M, "M02 drift between record and accounts ignored", "if (drift.length > 0) throw", "if (false) throw"],
  [M, "M03 spec client without a record", "const verified = readVerified(env);\n  const registry", "const verified = (() => { try { return readVerified(env); } catch { return JSON.parse(env.X ?? \"null\"); } })();\n  const registry"],
  [M, "M04 setup publishes before verifying", "verified = await verifyAccounts(registry, readDeps(raw)); // A2", "publishVerified(env, { v: 1, slot: registry.slot, ids: {} }); verified = await verifyAccounts(registry, readDeps(raw)); // A2"],
  [M, "M05 registry not checked before the network", "const registry = resolveAccountRegistry(env); // A1", "const raw0 = rawClient(env); const registry = resolveAccountRegistry(env); // A1"],
]);

export function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}


const PRELOAD = pathToFileURL(join(REPO, "tools", "e2e-safety", "mutant-preload.mjs")).href;

// Every source file the tests can read, with its hash, so the run can prove it changed nothing.
function snapshot() {
  const r = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z", "--", "tests", "tools/e2e-safety"], { cwd: REPO, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ls-files failed: ${r.stderr}`);
  const files = r.stdout.split("\0").filter((f) => f !== "" && existsSync(join(REPO, f)));
  return new Map(files.map((f) => [f, createHash("sha256").update(readFileSync(join(REPO, f))).digest("hex")]));
}

function runTests(mutant) {
  const env = { ...process.env };
  delete env.LAERLIG_MUTANT;
  if (mutant) {
    const [file, , from, to] = mutant;
    env.LAERLIG_MUTANT = Buffer.from(JSON.stringify({ file: join(REPO, file), from, to }), "utf8").toString("base64");
    env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --import=${PRELOAD}`.trim();
  }
  const r = spawnSync(process.execPath, ["--test", ...TESTS], { cwd: REPO, env, encoding: "utf8", timeout: 300000 });
  const out = r.stdout ?? "";
  const fail = Number((out.match(/^ℹ fail (\d+)/m) ?? [])[1] ?? NaN);
  const pass = Number((out.match(/^ℹ pass (\d+)/m) ?? [])[1] ?? NaN);
  return { status: r.status, fail, pass };
}

function main(argv) {
  const only = new Set(argv);
  const mutants = only.size === 0 ? MUTANTS : MUTANTS.filter(([, name]) => only.has(name.split(" ")[0]));
  if (mutants.length === 0) { console.error("no mutant selected"); return 2; }
  const before = snapshot();

  const baseline = runTests(null);
  if (baseline.status !== 0 || baseline.fail !== 0) {
    console.error(`baseline is not green: ${JSON.stringify(baseline)}`);
    return 2;
  }
  console.log(`baseline: ${baseline.pass} pass, 0 fail`);

  const results = [];
  for (const mutant of mutants) {
    const [file, name, from] = mutant;
    const n = countOccurrences(readFileSync(join(REPO, file), "utf8"), from);
    if (n !== 1) { results.push({ name, ok: false, outcome: `NOT APPLIED (${n} matches)` }); continue; }
    const r = runTests(mutant);
    const killed = r.fail > 0 || r.status !== 0;
    results.push({ name, ok: killed, outcome: killed ? `killed (${Number.isNaN(r.fail) ? "load error" : `${r.fail} failing`})` : "SURVIVED" });
  }
  for (const r of results) console.log(`${r.ok ? "✔" : "✖"} ${r.name}: ${r.outcome}`);
  const killed = results.filter((r) => r.ok).length;
  console.log(`\n${killed}/${results.length} mutants killed`);

  const after = runTests(null);
  console.log(`after the run, unmutated: ${after.pass} pass, ${after.fail} fail`);
  const now = snapshot();
  const changed = [...new Set([...before.keys(), ...now.keys()])].filter((f) => before.get(f) !== now.get(f));
  if (changed.length > 0) {
    console.error(`REPOSITORY CHANGED during the run: ${changed.join(", ")}`);
    return 3;
  }
  console.log(`repository unchanged: ${before.size} files under tests/ and tools/e2e-safety/ have the same hash as before`);
  return killed === results.length && after.status === 0 && after.fail === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
