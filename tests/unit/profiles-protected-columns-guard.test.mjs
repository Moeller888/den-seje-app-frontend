// Regression guards for tranche 2-0A (20261010120000_profiles_protected_columns).
//
// The binding proof is the PGlite runtime test (profiles-protected-columns-migration-run). These
// source guards exist so the hole cannot be reopened quietly later:
//   1. no LATER migration may hand API roles UPDATE on profiles again — table-wide, via ALL, or on
//      teacher_id / role / active_domains;
//   2. every direct browser write to profiles stays inside the client allowlist — a new client
//      write to another column would fail at runtime, and the fix is an RPC, not a wider grant;
//   3. the browser never INSERTs or UPSERTs profiles (account creation is backend-only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const FILE = "20261010120000_profiles_protected_columns.sql";

const CLIENT_WRITABLE = ["current_band", "must_reset_password", "placement_band"];
const PROTECTED = ["teacher_id", "role", "active_domains"];

const code = (sql) => sql.replace(/--.*$/gm, "").replace(/\s+/g, " ");

test("the migration's column grant is exactly the client allowlist", () => {
  const sql = code(readFileSync(join(MIGRATIONS, FILE), "utf8"));
  const m = sql.match(/GRANT UPDATE \(([^)]*)\) ON TABLE public\.profiles TO authenticated/);
  assert.ok(m, "the column grant must exist");
  assert.deepEqual(m[1].split(",").map((s) => s.trim()).sort(), CLIENT_WRITABLE);
  assert.match(sql, /REVOKE UPDATE ON TABLE public\.profiles FROM authenticated;/);
  assert.match(sql, /REVOKE UPDATE ON TABLE public\.profiles FROM anon;/);
  for (const c of PROTECTED) assert.ok(!new RegExp(`\\b${c}\\b`).test(m[1]), `${c} must not be granted`);
  // Privileges only: no policy, function, table or data change.
  assert.equal(/\b(CREATE|ALTER|DROP)\s+(POLICY|FUNCTION|TABLE|TRIGGER|VIEW)\b|\b(INSERT INTO|DELETE FROM|TRUNCATE)\b|\bUPDATE public\.profiles SET\b/i.test(sql), false);
});

test("no later migration gives API roles UPDATE on profiles back", () => {
  const later = readdirSync(MIGRATIONS).filter((f) => /^\d{14}_.+\.sql$/.test(f) && f > FILE).sort();
  const offenders = [];
  for (const f of later) {
    const sql = code(readFileSync(join(MIGRATIONS, f), "utf8"));
    for (const g of sql.matchAll(/GRANT ([^;]*?) ON (?:TABLE )?public\.profiles TO ([^;]*);/gi)) {
      const privs = g[1];
      const grantees = g[2];
      if (!/\b(anon|authenticated|PUBLIC)\b/i.test(grantees)) continue;
      if (/\bALL\b/i.test(privs)) offenders.push(`${f}: GRANT ALL`);
      if (/\bUPDATE\b(?!\s*\()/i.test(privs)) offenders.push(`${f}: table-level UPDATE`);
      const cols = privs.match(/UPDATE\s*\(([^)]*)\)/i);
      if (cols) for (const c of PROTECTED) if (new RegExp(`\\b${c}\\b`).test(cols[1])) offenders.push(`${f}: UPDATE(${c})`);
    }
  }
  assert.deepEqual(offenders, [], "re-opening profiles writes needs an owner decision, not a grant");
});

// Every file the browser loads that could talk to Supabase.
function browserSources() {
  const out = [];
  for (const f of readdirSync(ROOT)) if (/\.(html|js)$/.test(f)) out.push(f);
  for (const f of readdirSync(join(ROOT, "js"), { recursive: true })) {
    if (typeof f === "string" && f.endsWith(".js")) out.push(join("js", f).replace(/\\/g, "/"));
  }
  return out;
}

test("every direct browser write to profiles stays inside the allowlist", () => {
  const writes = [];
  for (const f of browserSources()) {
    const src = readFileSync(join(ROOT, f), "utf8");
    for (const m of src.matchAll(/\.from\(\s*["'`]profiles["'`]\s*\)([\s\S]{0,200}?)\.(update|upsert|insert)\(\s*(\{[^}]*\})?/g)) {
      writes.push({ file: f, op: m[2], body: m[3] ?? null });
    }
  }
  assert.ok(writes.length >= 3, "the three known writes must still be found — otherwise this guard is blind");
  for (const w of writes) {
    assert.equal(w.op, "update", `${w.file}: the browser must never ${w.op} profiles`);
    assert.ok(w.body, `${w.file}: profiles.update must use a literal object so its columns can be checked`);
    const keys = [...w.body.matchAll(/([A-Za-z_]\w*)\s*:/g)].map((k) => k[1]);
    for (const k of keys) {
      assert.ok(CLIENT_WRITABLE.includes(k), `${w.file}: writes profiles.${k}, which is not client-writable — use an RPC`);
    }
  }
  const covered = new Set(writes.flatMap((w) => [...w.body.matchAll(/([A-Za-z_]\w*)\s*:/g)].map((k) => k[1])));
  assert.deepEqual([...covered].sort(), CLIENT_WRITABLE, "an allowlisted column nobody writes is a grant without a need");
});
