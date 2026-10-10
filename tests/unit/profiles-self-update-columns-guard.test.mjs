// Regression guards for 20261010102416_profiles_self_update_columns (tranche 2-0A).
//
// The binding proof is the PGlite runtime test (profiles-self-update-columns-migration-run). These
// source guards exist so the hole cannot be reopened quietly later:
//   1. the migration grants authenticated UPDATE on exactly placement_band and current_band;
//   2. no LATER migration hands API roles UPDATE on profiles again — table-wide, via ALL, or on any
//      column outside that allowlist (teacher_id, role, active_domains, must_reset_password, …);
//   3. every direct browser write to profiles stays inside the allowlist. The one named exception is
//      js/reset-password.js's now-redundant must_reset_password clear, kept for rollout
//      compatibility until follow-up 2-0A.1 removes it;
//   4. the browser never INSERTs or UPSERTs profiles;
//   5. reset-student-password changes the password BEFORE it sets must_reset_password = true. The
//      trigger clears the flag on every real password change, so the reverse order would silently
//      cancel a teacher's forced reset (shown at runtime in the migration-run test);
//   6. after the whole migration chain no role but the owner may EXECUTE the trigger function:
//      20261010102416 leaves service_role with EXECUTE through Supabase's default function
//      privilege, and 20261010160000 removes it. No migration may grant EXECUTE on it again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const FILE = "20261010102416_profiles_self_update_columns.sql";

const CLIENT_WRITABLE = ["current_band", "placement_band"];

// The ONLY tolerated browser write outside the allowlist. After the migration it is refused by
// privileges (and ignored by the page); the trigger has already cleared the flag. Remove the entry
// together with the write in 2-0A.1 — the stale-exception test below fails if it outlives the code.
const KNOWN_REDUNDANT_WRITES = { "js/reset-password.js": ["must_reset_password"] };

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

function browserWrites() {
  const writes = [];
  for (const f of browserSources()) {
    const src = readFileSync(join(ROOT, f), "utf8");
    for (const m of src.matchAll(/\.from\(\s*["'`]profiles["'`]\s*\)([\s\S]{0,200}?)\.(update|upsert|insert)\(\s*(\{[^}]*\})?/g)) {
      const keys = m[3] ? [...m[3].matchAll(/([A-Za-z_]\w*)\s*:/g)].map((k) => k[1]) : null;
      writes.push({ file: f, op: m[2], keys });
    }
  }
  return writes;
}

test("every direct browser write to profiles stays inside the allowlist (plus the one named 2-0A.1 exception)", () => {
  const writes = browserWrites();
  assert.ok(writes.length >= 3, "the known writes must still be found — otherwise this guard is blind");
  for (const w of writes) {
    assert.equal(w.op, "update", `${w.file}: the browser must never ${w.op} profiles`);
    assert.ok(w.keys, `${w.file}: profiles.update must use a literal object so its columns can be checked`);
    const allowed = [...CLIENT_WRITABLE, ...(KNOWN_REDUNDANT_WRITES[w.file] ?? [])];
    for (const k of w.keys) {
      assert.ok(allowed.includes(k), `${w.file}: writes profiles.${k}, which is not client-writable — use an RPC`);
    }
  }
});

test("the 2-0A.1 exception is not stale, and the allowlist has no column nobody writes", () => {
  const writes = browserWrites();
  for (const [file, cols] of Object.entries(KNOWN_REDUNDANT_WRITES)) {
    const found = writes.filter((w) => w.file === file).flatMap((w) => w.keys ?? []);
    for (const c of cols) assert.ok(found.includes(c), `${file} no longer writes ${c} — remove the exception (2-0A.1 done)`);
  }
  const used = new Set(writes.flatMap((w) => w.keys ?? []));
  for (const c of CLIENT_WRITABLE) assert.ok(used.has(c), `${c} is granted but no browser code writes it`);
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

// ── 6. EXECUTE on the trigger function after the whole chain ─────────────────────────────────────
const FOLLOW_UP = "20261010160000_profiles_trigger_execute_lockdown.sql";
const TRIGGER_FN = "public.clear_must_reset_password_on_password_change()";

test("the follow-up exists, sorts after 20261010102416 and is exactly one REVOKE FROM service_role", () => {
  const files = readdirSync(MIGRATIONS).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  assert.ok(files.includes(FOLLOW_UP), "the hardening migration must be in the chain");
  assert.ok(files.indexOf(FOLLOW_UP) > files.indexOf(FILE), "it must apply after the migration that creates the function");
  const stmts = code(readFileSync(join(MIGRATIONS, FOLLOW_UP), "utf8")).split(";").map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(stmts, [`REVOKE EXECUTE ON FUNCTION ${TRIGGER_FN} FROM service_role`]);
});

test("20261010102416 alone does NOT revoke service_role — which is why the follow-up exists", () => {
  const sql = code(readFileSync(join(MIGRATIONS, FILE), "utf8"));
  const revokes = [...sql.matchAll(/REVOKE EXECUTE ON FUNCTION public\.clear_must_reset_password_on_password_change\(\) FROM ([^;]*);/g)]
    .flatMap((m) => m[1].split(",").map((s) => s.trim()));
  assert.deepEqual(revokes.sort(), ["PUBLIC", "anon", "authenticated"]);
});

test("after the whole chain every non-owner role is revoked, and no migration ever grants EXECUTE on it", () => {
  const files = readdirSync(MIGRATIONS).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  const revoked = new Set();
  const grants = [];
  for (const f of files) {
    const sql = code(readFileSync(join(MIGRATIONS, f), "utf8"));
    for (const m of sql.matchAll(/REVOKE EXECUTE ON FUNCTION public\.clear_must_reset_password_on_password_change\(\) FROM ([^;]*);/g)) {
      for (const r of m[1].split(",").map((s) => s.trim())) revoked.add(r);
    }
    if (/GRANT [^;]*clear_must_reset_password_on_password_change/i.test(sql)) grants.push(f);
  }
  for (const r of ["PUBLIC", "anon", "authenticated", "service_role"]) assert.ok(revoked.has(r), `${r} must be revoked`);
  assert.deepEqual(grants, [], "the trigger function is not an API surface for any role");
});
