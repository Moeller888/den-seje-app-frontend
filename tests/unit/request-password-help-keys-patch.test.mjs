// SEC-KEY-01.2 — request-password-help on the shared key resolver, as a SURGICAL patch of the
// deployed v10 source (offline, source-only: no network, no Supabase, no deploy).
//
// main's supabase/functions/request-password-help is a later rewrite that calls the RPC
// reserve_password_help (D-243), which is not applied in production, so it cannot be deployed.
// The deploy payload therefore lives in tools/production/edge-patches/request-password-help/:
//   deployed-v10/ — the byte-exact deployed bundle (rollback source)
//   patched/      — the same bundle with ONLY the key resolution moved to _shared/supabase-keys.ts
// These tests pin exactly that:
//   (a) patched index.ts differs from deployed-v10 only in the allow-listed key-resolution lines;
//   (b) no legacy key variable is read and no `?? ""` key fallback survives anywhere in patched/;
//   (c) patched _shared/supabase-keys.ts is byte-identical to the repo resolver;
//   (d) every relative import in patched/ resolves to a file inside patched/.
// Plus: deployed-v10 stays byte-exact (SHA-256 pins) and the untouched files stay untouched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative, sep } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = join(REPO, "tools", "production", "edge-patches", "request-password-help");
const DEPLOYED = join(BASE, "deployed-v10");
const PATCHED = join(BASE, "patched");
const INDEX = join("functions", "request-password-help", "index.ts");
const MONITORING = join("functions", "_shared", "monitoring.ts");
const RESOLVER = join("functions", "_shared", "supabase-keys.ts");

const bytes = (p) => readFileSync(p);
const text = (p) => readFileSync(p, "utf8");
const sha256 = (p) => createHash("sha256").update(bytes(p)).digest("hex");

function filesUnder(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) out.push(relative(dir, p).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

// Line-level LCS diff. Returns the removed and added lines in order. The files are a few hundred
// lines, so the quadratic table is small.
function lineDiff(a, b) {
  const n = a.length, m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const removed = [], added = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) removed.push(a[i++]);
    else added.push(b[j++]);
  }
  while (i < n) removed.push(a[i++]);
  while (j < m) added.push(b[j++]);
  return { removed, added };
}

// The complete, exact change set. Anything else in the diff fails the test.
const ALLOWED_REMOVED = [
  'const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;',
  'const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY") ?? "";',
  "    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {",
  "      if (SUPABASE_ANON_KEY) {",
  "        const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {",
  '        ctx.captureMessage("staff recovery skipped: SUPABASE_ANON_KEY unset", "warning", { role });',
];

const ALLOWED_ADDED = [
  'import { serviceKey, publishableKey } from "../_shared/supabase-keys.ts";',
  "// SEC-KEY-01.2: both Supabase keys come from the shared resolver (SUPABASE_SECRET_KEYS /",
  "// SUPABASE_PUBLISHABLE_KEYS first, legacy variables only as fallback), resolved inside",
  "// processHelpRequest so a missing or broken key is logged there instead of crashing the boot.",
  "    let privilegedKey: string;",
  "    try {",
  "      privilegedKey = serviceKey();",
  "    } catch (keyError) {",
  "      // The resolver's message names only variables and the key name, never a value.",
  '      console.error(`[request-password-help] request not processed: ${keyError instanceof Error ? keyError.message : "no privileged Supabase key"}`);',
  '      ctx.captureException(keyError, { stage: "service_key" });',
  "      return;",
  "    }",
  "",
  "    const admin = createClient(SUPABASE_URL, privilegedKey, {",
  '      let publicKey = "";',
  "      try {",
  "        publicKey = publishableKey();",
  "      } catch (keyError) {",
  '        // Was a silent `?? ""` skip in v10; now an explicit error line in the function logs.',
  '        console.error(`[request-password-help] staff recovery not sent: ${keyError instanceof Error ? keyError.message : "no public Supabase key"}`);',
  "      }",
  "      if (publicKey) {",
  "        const publicClient = createClient(SUPABASE_URL, publicKey, {",
  '        ctx.captureMessage("staff recovery skipped: no usable public Supabase key", "warning", { role });',
];

test("deployed-v10 is the byte-exact deployed bundle (version 10) and holds nothing else", () => {
  assert.deepEqual(filesUnder(DEPLOYED), ["functions/_shared/monitoring.ts", "functions/request-password-help/index.ts"]);
  assert.equal(sha256(join(DEPLOYED, INDEX)), "9ae86188f58e69a1e67d47eb5f92200cabc6a2b6072cd4a1b4a7e0a52f2501cf");
  assert.equal(sha256(join(DEPLOYED, MONITORING)), "40dc2f15fe048c37676d879ee0176e386ad5941d6d4ae2f92e1cff0b476bd4c3");
  // The deployed monitoring.ts is CRLF. A checkout that normalised it would break the rollback copy.
  assert.ok(bytes(join(DEPLOYED, MONITORING)).includes(Buffer.from("\r\n")), "monitoring.ts must keep its CRLF bytes");
});

test("patched/ is exactly the deployed bundle plus the resolver", () => {
  assert.deepEqual(filesUnder(PATCHED), [
    "functions/_shared/monitoring.ts",
    "functions/_shared/supabase-keys.ts",
    "functions/request-password-help/index.ts",
  ]);
  assert.ok(bytes(join(PATCHED, MONITORING)).equals(bytes(join(DEPLOYED, MONITORING))), "monitoring.ts must be untouched");
});

test("(a) patched index.ts differs from deployed-v10 only in the allow-listed key-resolution lines", () => {
  const before = text(join(DEPLOYED, INDEX)).split("\n");
  const after = text(join(PATCHED, INDEX)).split("\n");
  const { removed, added } = lineDiff(before, after);
  assert.deepEqual(removed, ALLOWED_REMOVED, "only the legacy key lines may be removed");
  assert.deepEqual(added, ALLOWED_ADDED, "only the resolver lines may be added");
  // Same line-ending convention as the deployed file (LF, no CR introduced).
  assert.equal(text(join(PATCHED, INDEX)).includes("\r"), false);
});

test("negative control: the line diff catches a business-logic change", () => {
  const before = text(join(DEPLOYED, INDEX)).split("\n");
  const tampered = text(join(PATCHED, INDEX)).replace("const DAILY_CAP        = 5;", "const DAILY_CAP        = 50;").split("\n");
  const { removed, added } = lineDiff(before, tampered);
  assert.notDeepEqual(removed, ALLOWED_REMOVED);
  assert.notDeepEqual(added, ALLOWED_ADDED);
});

test("(b) no legacy key variable read and no empty-string key fallback remain in patched/", () => {
  const LEGACY_READ = /Deno\.env\.get\(\s*["'](SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY)["']\s*\)/;
  const offenders = [];
  for (const rel of filesUnder(PATCHED)) {
    if (rel === "functions/_shared/supabase-keys.ts") continue; // the ONE place the legacy fallback may live
    const src = text(join(PATCHED, rel));
    if (LEGACY_READ.test(src)) offenders.push(`${rel}: reads a legacy key variable`);
    for (const line of src.split(/\r?\n/)) {
      if (/^\s*\/\//.test(line)) continue; // comments may describe the old fallback
      if (/SUPABASE_[A-Z_]*KEY|privilegedKey|publicKey/.test(line) && /\?\?\s*["']{2}/.test(line)) {
        offenders.push(`${rel}: Supabase key with ?? "" fallback`);
      }
      if (/Deno\.env\.get\(\s*["']SUPABASE_[A-Z_]*KEYS?["']/.test(line)) offenders.push(`${rel}: reads a Supabase key variable outside the resolver`);
    }
  }
  assert.deepEqual(offenders, []);
  const index = text(join(PATCHED, INDEX));
  assert.match(index, /import \{ serviceKey, publishableKey \} from "\.\.\/_shared\/supabase-keys\.ts";/);
  assert.match(index, /privilegedKey = serviceKey\(\);/);
  assert.match(index, /publicKey = publishableKey\(\);/);
  // The silent skip is gone: a missing public key now produces an explicit error log line.
  assert.match(index, /console\.error\(`\[request-password-help\] staff recovery not sent:/);
  assert.match(index, /console\.error\(`\[request-password-help\] request not processed:/);
});

test("negative control: the legacy-read matcher fires on the v10 source", () => {
  const v10 = text(join(DEPLOYED, INDEX));
  assert.match(v10, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.match(v10, /Deno\.env\.get\("SUPABASE_ANON_KEY"\) \?\? ""/);
});

test("(c) patched _shared/supabase-keys.ts is byte-identical to the repo resolver", () => {
  const repoResolver = join(REPO, "supabase", "functions", "_shared", "supabase-keys.ts");
  assert.ok(existsSync(repoResolver));
  assert.ok(bytes(join(PATCHED, RESOLVER)).equals(bytes(repoResolver)),
    "re-copy the resolver from supabase/functions/_shared/supabase-keys.ts if it changed on main");
});

test("(d) every relative import in patched/ resolves to a file inside patched/", () => {
  const IMPORT = /(?:import|export)\s[^"';]*?from\s*["'](\.{1,2}\/[^"']+)["']|import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;
  const problems = [];
  let count = 0;
  for (const rel of filesUnder(PATCHED).filter((f) => f.endsWith(".ts"))) {
    const abs = join(PATCHED, rel);
    for (const m of text(abs).matchAll(IMPORT)) {
      const spec = m[1] ?? m[2];
      count++;
      const target = resolve(dirname(abs), spec);
      const inside = relative(PATCHED, target);
      if (inside.startsWith("..") || !existsSync(target)) problems.push(`${rel}: ${spec}`);
    }
  }
  assert.deepEqual(problems, []);
  assert.equal(count, 2, "index.ts imports exactly monitoring.ts and supabase-keys.ts");
});

test("the README states the patch is not deployed and pins what it was based on", () => {
  const readme = text(join(BASE, "README.md"));
  assert.match(readme, /IKKE deployet/);
  assert.match(readme, /d5c06a16b06e11f5f9a7aaa3e6ed6f101b72f8fc4e6a841148f1baaceece9afa/);
  assert.match(readme, /functions\/request-password-help\/index\.ts/);
  assert.equal(readme.includes("�"), false);
  assert.equal(/Ã[¦¸¥†˜…]/.test(readme), false, "no mojibake");
});
