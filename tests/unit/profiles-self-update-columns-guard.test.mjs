// Regression guards for 20261010102416_profiles_self_update_columns (tranche 2-0A).
//
// The binding proof is the PGlite runtime test (profiles-self-update-columns-migration-run). These
// source guards exist so the hole cannot be reopened quietly later:
//   1. the migration grants authenticated UPDATE on exactly placement_band and current_band;
//   2. no LATER migration hands API roles UPDATE on profiles again — table-wide, via ALL, or on any
//      column outside that allowlist (teacher_id, role, active_domains, must_reset_password, …);
//   3. every direct browser write to profiles stays inside the allowlist — no exceptions. In
//      particular no browser code writes must_reset_password: the trigger on auth.users is the only
//      thing that clears it (2-0A.1 removed reset-password.js's old client clear);
//   4. the browser never INSERTs or UPSERTs profiles;
//   5. reset-student-password changes the password BEFORE it sets must_reset_password = true. The
//      trigger clears the flag on every real password change, so the reverse order would silently
//      cancel a teacher's forced reset (shown at runtime in the migration-run test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const FILE = "20261010102416_profiles_self_update_columns.sql";

const CLIENT_WRITABLE = ["current_band", "placement_band"];

const code = (sql) => sql.replace(/--.*$/gm, "").replace(/\s+/g, " ");

test("the migration grants authenticated UPDATE on exactly placement_band and current_band", () => {
  const sql = code(readFileSync(join(MIGRATIONS, FILE), "utf8"));
  const m = sql.match(/GRANT UPDATE \(([^)]*)\) ON public\.profiles TO authenticated/);
  assert.ok(m, "the column grant must exist");
  assert.deepEqual(m[1].split(",").map((s) => s.trim()).sort(), CLIENT_WRITABLE);
  assert.match(sql, /REVOKE UPDATE ON public\.profiles FROM anon, authenticated;/);
  assert.equal([...sql.matchAll(/GRANT [^;]*public\.profiles/g)].length, 1, "one grant on profiles, no more");
});

test("no later migration gives API roles UPDATE on profiles back", () => {
  const later = readdirSync(MIGRATIONS).filter((f) => /^\d{14}_.+\.sql$/.test(f) && f > FILE).sort();
  const offenders = [];
  for (const f of later) {
    const sql = code(readFileSync(join(MIGRATIONS, f), "utf8"));
    for (const g of sql.matchAll(/GRANT ([^;]*?) ON (?:TABLE )?public\.profiles TO ([^;]*);/gi)) {
      if (!/\b(anon|authenticated|PUBLIC)\b/i.test(g[2])) continue;
      if (/\bALL\b/i.test(g[1])) offenders.push(`${f}: GRANT ALL`);
      if (/\bUPDATE\b(?!\s*\()/i.test(g[1])) offenders.push(`${f}: table-level UPDATE`);
      const cols = g[1].match(/UPDATE\s*\(([^)]*)\)/i);
      if (cols) {
        for (const c of cols[1].split(",").map((s) => s.trim())) {
          if (!CLIENT_WRITABLE.includes(c)) offenders.push(`${f}: UPDATE(${c})`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], "making a server-owned profile column client-writable needs an owner decision");
});

test("the guard's matcher fires on the shapes that would reopen the hole (negative control)", () => {
  const shapes = [
    "GRANT UPDATE ON public.profiles TO authenticated;",
    "GRANT ALL ON TABLE public.profiles TO anon, authenticated;",
    "GRANT UPDATE (teacher_id) ON public.profiles TO authenticated;",
    "GRANT UPDATE (current_band, must_reset_password) ON public.profiles TO authenticated;",
  ];
  for (const s of shapes) {
    const g = s.match(/GRANT ([^;]*?) ON (?:TABLE )?public\.profiles TO ([^;]*);/i);
    const cols = g[1].match(/UPDATE\s*\(([^)]*)\)/i);
    const bad = /\bALL\b/i.test(g[1]) || /\bUPDATE\b(?!\s*\()/i.test(g[1]) ||
      (cols && cols[1].split(",").map((x) => x.trim()).some((c) => !CLIENT_WRITABLE.includes(c)));
    assert.ok(bad, s);
  }
});

function browserSources() {
  const out = [];
  for (const f of readdirSync(ROOT)) if (/\.(html|js)$/.test(f)) out.push(f);
  for (const f of readdirSync(join(ROOT, "js"), { recursive: true })) {
    if (typeof f === "string" && f.endsWith(".js")) out.push(join("js", f).replace(/\\/g, "/"));
  }
  return out;
}

function writesIn(file, src) {
  const writes = [];
  for (const m of src.matchAll(/\.from\(\s*["'`]profiles["'`]\s*\)([\s\S]{0,200}?)\.(update|upsert|insert)\(\s*(\{[^}]*\})?/g)) {
    const keys = m[3] ? [...m[3].matchAll(/([A-Za-z_]\w*)\s*:/g)].map((k) => k[1]) : null;
    writes.push({ file, op: m[2], keys });
  }
  return writes;
}

function browserWrites() {
  return browserSources().flatMap((f) => writesIn(f, readFileSync(join(ROOT, f), "utf8")));
}

// Why a browser write to profiles is not allowed; null when it is.
function violation(w) {
  if (w.op !== "update") return `${w.file}: the browser must never ${w.op} profiles`;
  if (!w.keys) return `${w.file}: profiles.update must use a literal object so its columns can be checked`;
  const bad = w.keys.filter((k) => !CLIENT_WRITABLE.includes(k));
  return bad.length ? `${w.file}: writes profiles.${bad.join(", ")}, which is not client-writable — use an RPC` : null;
}

test("every direct browser write to profiles stays inside the allowlist", () => {
  const writes = browserWrites();
  assert.ok(writes.length >= 2, "the known band writes must still be found — otherwise this guard is blind");
  assert.deepEqual(writes.map(violation).filter(Boolean), []);
});

test("no browser code writes must_reset_password — the auth.users trigger is the only thing that clears it", () => {
  const offenders = browserWrites().filter((w) => (w.keys ?? []).includes("must_reset_password"));
  assert.deepEqual(offenders.map((w) => w.file), []);
  // A non-literal update object would hide the column from the matcher above; this catches the name itself.
  for (const f of browserSources()) {
    const src = readFileSync(join(ROOT, f), "utf8");
    for (const m of src.matchAll(/\.from\(\s*["'`]profiles["'`]\s*\)[\s\S]{0,200}?\.update\(([\s\S]{0,200}?)\)/g)) {
      assert.equal(/must_reset_password/.test(m[1]), false, `${f}: client write to must_reset_password`);
    }
  }
});

test("the browser-write matcher rejects a reintroduced must_reset_password clear (negative control)", () => {
  const shapes = [
    `await supabase.from("profiles").update({ must_reset_password: false }).eq("id", session.user.id);`,
    `await supabase.from("profiles")\n  .update({ must_reset_password: false })\n  .eq("id", uid);`,
    `supabase.from('profiles').update({ current_band: 2, must_reset_password: false })`,
    `supabase.from("profiles").upsert({ id: uid })`,
    `supabase.from("profiles").update(patch)`,
  ];
  for (const s of shapes) {
    const ws = writesIn("probe.js", s);
    assert.equal(ws.length, 1, s);
    assert.ok(violation(ws[0]), s);
  }
  assert.equal(violation(writesIn("probe.js", `supabase.from("profiles").update({ current_band: 2 })`)[0]), null);
});

test("the allowlist has no column nobody writes", () => {
  const used = new Set(browserWrites().flatMap((w) => w.keys ?? []));
  for (const c of CLIENT_WRITABLE) assert.ok(used.has(c), `${c} is granted but no browser code writes it`);
});

test("reset-password.js changes the password, signs a forced pupil out, and leaves the flag to the server", () => {
  const src = readFileSync(join(ROOT, "js", "reset-password.js"), "utf8");
  assert.match(src, /supabase\.auth\.updateUser\(\{\s*password:\s*newPassword\s*\}\)/);
  assert.match(src, /if \(forced\) \{[\s\S]*?await supabase\.auth\.signOut\(\);[\s\S]*?\}/);
  assert.match(src, /window\.location\.href = "login\.html"/);
  assert.equal(/\.from\(\s*["'`]profiles["'`]\s*\)/.test(src), false, "reset-password.js must not touch profiles");
  assert.equal(/must_reset_password\s*:/.test(src), false, "reset-password.js must not write must_reset_password");
});

test("reset-student-password changes the password BEFORE it sets must_reset_password = true", () => {
  const src = readFileSync(join(ROOT, "supabase", "functions", "reset-student-password", "index.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const pw = src.indexOf("auth.admin.updateUserById(");
  const flag = src.search(/\.update\(\s*\{\s*must_reset_password:\s*true\s*\}\s*\)/);
  assert.ok(pw > 0, "the password change must still be there");
  assert.ok(flag > 0, "setting the flag must still be there");
  assert.ok(pw < flag, "flag-then-password would let the trigger clear the teacher's forced reset");
  assert.equal(src.split("updateUserById(").length - 1, 1, "exactly one password change in the function");
});

test("create-student creates the auth user BEFORE writing must_reset_password = true", () => {
  const src = readFileSync(join(ROOT, "supabase", "functions", "create-student", "index.ts"), "utf8");
  const create = src.indexOf("auth.admin.createUser(");
  const flag = src.search(/must_reset_password:\s*true/);
  assert.ok(create > 0 && flag > 0 && create < flag);
});
