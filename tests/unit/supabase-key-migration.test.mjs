// Guards for the move off the legacy Supabase keys (runs in CI, offline, source-only).
//
// The legacy `service_role` key was exposed and will be deactivated; the legacy `anon` key is
// deactivated together with it unless the dashboard offers separate switches. These tests keep the
// codebase in the state that makes that deactivation survivable:
//   1. no Edge Function reads the legacy service-role variable directly — they all go through the
//      shared resolver, which prefers the new key and falls back to the legacy one;
//   2. the resolver keeps that preference order, so the migration stays reversible;
//   3. no browser-served file and no spec carries a legacy anon key any more;
//   4. no secret key may ever appear in client code, a spec, a workflow or the build output.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");
const RESOLVER = "supabase/functions/_shared/supabase-keys.ts";

const functionSources = () =>
  execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "supabase/functions"], { cwd: REPO, encoding: "utf8" })
    .split("\0").filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== RESOLVER);

const browserServed = () =>
  execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: REPO, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((f) => !f.startsWith("node_modules/") && !f.includes("/node_modules/"))
    .filter((f) => /^(js\/.+\.js|[^/]+\.html|app\.js|supabaseClient\.js)$/.test(f));

const LEGACY_JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const decodeRole = (t) => {
  try { return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString("utf8")).role ?? null; } catch { return null; }
};

test("every Edge Function takes its privileged key from the shared resolver", () => {
  const offenders = [];
  for (const file of functionSources()) {
    const src = read(file);
    if (/Deno\.env\.get\(\s*["']SUPABASE_SERVICE_ROLE_KEY["']\s*\)/.test(src)) {
      offenders.push(`${file}: reads the legacy variable directly`);
    }
    if (/\b(serviceKey|optionalServiceKey)\s*\(/.test(src) && !/from\s+["'][^"']*_shared\/supabase-keys\.ts["']/.test(src)) {
      offenders.push(`${file}: uses the resolver without importing it`);
    }
  }
  assert.deepEqual(offenders, [], "a function still bound to the legacy key would break when it is deactivated");
});

test("the resolver prefers the new key and falls back, so the migration is reversible", () => {
  assert.ok(existsSync(join(REPO, RESOLVER)), "the resolver must exist");
  const src = read(RESOLVER);
  const newAt = src.indexOf("SUPABASE_SECRET_KEYS");
  const legacyAt = src.indexOf("SUPABASE_SERVICE_ROLE_KEY");
  assert.ok(newAt !== -1 && legacyAt !== -1, "both sources must be handled");
  assert.ok(newAt < legacyAt, "the new key must be consulted before the legacy one");
  assert.match(src, /export function selectSecretKey/, "the selection logic must stay separately testable");
});

test("a present but broken key bundle is refused instead of falling back to the retired key", () => {
  const src = read(RESOLVER);
  const selection = src.slice(src.indexOf("export function selectSecretKey"), src.indexOf("let sourceLogged"));
  assert.match(selection, /not valid JSON/, "an unparseable bundle must throw");
  assert.match(selection, /no usable key named/, "a missing key name must throw");
  // The legacy fallback must live OUTSIDE the branch that handles a present bundle, so a broken
  // bundle can never reach it. Compare the two regions rather than the first textual occurrence:
  // the union type at the top of the function also mentions both source names.
  const branchStart = selection.indexOf("if (bundlePresent)");
  const branchEnd = selection.indexOf("// No bundle at all");
  assert.ok(branchStart !== -1 && branchEnd > branchStart, "the two regions must be identifiable");
  const bundleBranch = selection.slice(branchStart, branchEnd);
  assert.ok(!/source:\s*"legacy-service-role"/.test(bundleBranch), "a present bundle must never yield the legacy key");
  assert.match(selection.slice(branchEnd), /source:\s*"legacy-service-role"/, "the fallback belongs to the no-bundle case");
});

test("the resolver logs which source it chose, and never the key itself", () => {
  const src = read(RESOLVER);
  const logs = [...src.matchAll(/console\.\w+\(([^)]*)\)/g)].map((m) => m[1]);
  assert.equal(logs.length, 1, "exactly one log line, so the diagnostic stays predictable");
  assert.match(logs[0], /source=\$\{source\}/, "the line must report the source");
  assert.ok(!/key|secret|token/i.test(logs[0].replace("supabase-keys", "")), "no key material may be logged");
  assert.match(src, /\[supabase-keys\] source=/, "the log line must be greppable in the function logs");
  assert.match(src, /let sourceLogged = false/, "it must log once per isolate, not per request");
  // The diagnostic helper must never throw: it is used to inspect a broken deployment.
  const diagnostic = src.slice(src.indexOf("export function serviceKeySource"));
  assert.match(diagnostic, /try \{/, "serviceKeySource must swallow the configuration error");
  assert.match(diagnostic, /invalid-configuration/, "and report it as a state instead");
});

test("no browser-served file carries a legacy anon or service_role key", () => {
  const offenders = [];
  for (const file of browserServed()) {
    for (const token of read(file).match(LEGACY_JWT) ?? []) {
      const role = decodeRole(token);
      if (role === "anon" || role === "service_role") offenders.push(`${file}: legacy ${role} key`);
    }
  }
  assert.deepEqual(offenders, [], "browser files must use the publishable key, which survives the deactivation");
});

test("specs share one public API key instead of eleven literals", () => {
  const helpers = read("tests/helpers.ts");
  assert.match(helpers, /export const PUBLIC_API_KEY/, "helpers must export the shared key");
  assert.match(helpers, /SUPABASE_PUBLISHABLE_KEY/, "an environment override keeps the switch reversible");
  const specs = execFileSync("git", ["ls-files", "-z", "tests"], { cwd: REPO, encoding: "utf8" })
    .split("\0").filter((f) => f.endsWith(".spec.ts"));
  const offenders = [];
  for (const file of specs) {
    for (const token of read(file).match(LEGACY_JWT) ?? []) {
      if (decodeRole(token) === "anon") offenders.push(`${file}: hardcoded legacy anon key`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("no secret key may appear in client code, specs, workflows or build output", () => {
  const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: REPO, encoding: "utf8" })
    .split("\0").filter(Boolean)
    .filter((f) => !f.startsWith("node_modules/") && !f.includes("/node_modules/"))
    .filter((f) => /\.(js|mjs|cjs|ts|tsx|html|yml|yaml|json|toml)$/.test(f));
  const offenders = files.filter((f) => /\bsb_secret_[A-Za-z0-9_-]{6,}/.test(read(f)));
  assert.deepEqual(offenders, [], "a secret key belongs in an environment variable, never in a tracked file");
  // The build output is generated, so it is checked when present rather than required to exist.
  // Walked with fs rather than `git grep`, which exits non-zero when it finds NOTHING — the very
  // case this assertion wants, and one that would otherwise throw instead of passing.
  const dist = join(REPO, "dist-cloudflare");
  if (existsSync(dist)) {
    const hits = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) { walk(path); continue; }
        if (!entry.isFile() || !/\.(js|mjs|cjs|html|json|css|map|txt)$/.test(entry.name)) continue;
        if (/\bsb_secret_[A-Za-z0-9_-]{6,}/.test(readFileSync(path, "utf8"))) hits.push(path);
      }
    };
    walk(dist);
    assert.deepEqual(hits, [], "the published bundle must never contain a secret key");
  }
});
