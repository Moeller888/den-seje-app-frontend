// SEC-KEY-01 — the key-migration runbook and the get-reviewed-answers surgical patch
// (offline, source-only: no network, no Supabase, no deploy).
//
// Pins:
//   (1) docs/operations/sec-key-01-key-migration-runbook.md lists every deployed function that read
//       a legacy key variable (8) plus question-context, each with its pinned deployed version, and
//       keeps the irreversible step and the "risk stays open" warning explicit;
//   (2) neither the runbook nor the patch package contains anything key-shaped (JWT, sb_secret_…,
//       sb_publishable_… with a body);
//   (3) the get-reviewed-answers package: deployed-v18 is byte-exact, patched/ differs ONLY in the
//       key lookup, no legacy read survives, and the resolver copy is byte-identical to the repo's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNBOOK = join(REPO, "docs", "operations", "sec-key-01-key-migration-runbook.md");
const GRA = join(REPO, "tools", "production", "edge-patches", "get-reviewed-answers");
const DEPLOYED = join(GRA, "deployed-v18");
const PATCHED = join(GRA, "patched");
const INDEX = join("functions", "get-reviewed-answers", "index.ts");
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

// Key-shaped material. Built so this file itself never contains a matching literal.
function keyShapedFindings(src) {
  const found = [];
  if (/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(src)) found.push("JWT");
  if (/\bsb_secret_[A-Za-z0-9_-]{4,}/.test(src)) found.push("sb_secret_ key");
  if (/\bsb_publishable_[A-Za-z0-9_-]{4,}/.test(src)) found.push("sb_publishable_ key");
  if (/\bsb_temp_[A-Za-z0-9_-]{2,}/.test(src)) found.push("sb_temp_ key");
  return found;
}

// [step, function, deployed version, ezbr_sha256 of that version]
const FUNCTIONS = [
  ["Q-01", "equip-avatar", 14, "8e8f557345f25dd00820696ad29bdd5e1ee644f4991aea8ba838345a6cf98342"],
  ["Q-02", "reset-student", 17, "83ce406f57cc743bd10e11109bcd3b744e28721333bbf755e3d4d028a8d76020"],
  ["Q-03", "get-reviewed-answers", 18, "7ad1811c76bae00d397484a5635f17898f355dac9664271b3363887c02a31b36"],
  ["Q-04", "buy-item", 39, "5652ff58796070cb74cbd0c122b8f980629cbf454afd472e10d623c4eb0763ac"],
  ["Q-05", "reset-student-password", 12, "66657345170309068176d211ec55f7e9d9152b9d9e197a3bd13e11e6083e78aa"],
  ["Q-06", "create-teacher", 19, "211d183467f7cddc109241d0ed48e4793560ed6c70f079bc749c0db93cecbe57"],
  ["Q-07", "avatar-generation", 22, "71d65a7c4da46dbf8bd986aa0cee3b6298f633bcb0839a84754df8f2750e13a5"],
  ["Q-08", "request-password-help", 10, "d5c06a16b06e11f5f9a7aaa3e6ed6f101b72f8fc4e6a841148f1baaceece9afa"],
];

test("(1) the runbook has one row per legacy-dependent function, with its pinned version and ezbr", () => {
  const rb = text(RUNBOOK);
  for (const [step, fn, version, ezbr] of FUNCTIONS) {
    const row = rb.split("\n").find((l) => l.startsWith(`| ${step} | \`${fn}\` |`));
    assert.ok(row, `missing table row for ${step} ${fn}`);
    assert.match(row, new RegExp(`\\bv${version}\\b`), `${fn}: deployed version`);
    assert.ok(row.includes(ezbr), `${fn}: ezbr_sha256`);
  }
  assert.match(rb, /## Q-09 — `question-context` \(UKENDT\)/);
});

test("(1) the runbook keeps the open-risk warning, the irreversible step and the forbidden redeploys explicit", () => {
  const rb = text(RUNBOOK);
  assert.match(rb, /KRITISK RISIKO: ÅBEN/);
  assert.match(rb, /uanset\*\* hvor mange tests der er grønne/);
  assert.match(rb, /## R-04 — tilbagekald legacy-JWT-secret \(IRREVERSIBELT\)/);
  assert.match(rb, /## R-01 — deaktivér legacy API-nøgler \(genaktivering forbudt\)/);
  for (const fn of ["get-next-question", "process-event"]) {
    assert.ok(rb.split("\n").some((l) => l.startsWith(`| \`${fn}\``) && l.includes("**Rør ikke.**")), `${fn} must be marked hands-off`);
  }
  // The observation query is read-only and present.
  assert.match(rb, /\*\*O-01a — legacy-JWT-trafik/);
  assert.match(rb, /log_attributes\['request\.sb\.jwt\.apikey\.payload\.role'\] in \('service_role', 'anon'\)/);
  assert.match(rb, /\*\*O-01b — resolverens kildevalg/);
  const sqlBlocks = [...rb.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.ok(sqlBlocks.length >= 4);
  for (const sql of sqlBlocks) {
    assert.match(sql.trimStart(), /^select\b/i, "every query is a SELECT");
    assert.equal(/\b(insert|update|delete|drop|alter|truncate|grant|revoke)\b/i.test(sql), false, "no write keyword");
  }
});

test("(2) runbook and patch package contain nothing key-shaped, and the Danish text is clean", () => {
  const targets = [RUNBOOK, ...filesUnder(GRA).map((f) => join(GRA, f))];
  const offenders = [];
  for (const p of targets) {
    const found = keyShapedFindings(text(p));
    if (found.length) offenders.push(`${relative(REPO, p)}: ${found.join(", ")}`);
  }
  assert.deepEqual(offenders, []);
  for (const p of [RUNBOOK, join(GRA, "README.md")]) {
    const src = text(p);
    assert.equal(src.includes("�"), false, "no replacement characters");
    assert.equal(/Ã[¦¸¥†˜…]/.test(src), false, "no mojibake");
    assert.match(src, /[æøå]/, "Danish prose keeps æøå");
  }
});

test("negative control: the key-shape matcher fires on each key form", () => {
  const seg = "A".repeat(12);
  assert.deepEqual(keyShapedFindings(`${"eyJ"}${seg}.${"eyJ"}${seg}.${seg}`), ["JWT"]);
  assert.deepEqual(keyShapedFindings(["sb", "secret", "Ab12Cd"].join("_")), ["sb_secret_ key"]);
  assert.deepEqual(keyShapedFindings(["sb", "publishable", "Ab12Cd"].join("_")), ["sb_publishable_ key"]);
  // A bare prefix in prose (e.g. "`sb_secret_`-nøgle") is not a key.
  assert.deepEqual(keyShapedFindings("en `sb_secret_`-nøgle"), []);
});

test("(3) deployed-v18 is the byte-exact deployed bundle and holds nothing else", () => {
  assert.deepEqual(filesUnder(DEPLOYED), ["functions/get-reviewed-answers/index.ts"]);
  assert.equal(sha256(join(DEPLOYED, INDEX)), "ee0568e8fb214a48fce634d921fd64223fcaf2ff1979b32915b79ab5ee6897f4");
});

test("(3) patched/ is the deployed bundle plus the resolver, and differs only in the key lookup", () => {
  assert.deepEqual(filesUnder(PATCHED), ["functions/_shared/supabase-keys.ts", "functions/get-reviewed-answers/index.ts"]);
  assert.equal(sha256(join(PATCHED, INDEX)), "82704cf9be7b44ab20f35b225d11e83a063273017dc7e16816080b43c4c57c33");
  const before = text(join(DEPLOYED, INDEX));
  const after = text(join(PATCHED, INDEX));
  // Reverse the exact patch and require the deployed bytes back.
  const reverted = after
    .replace('import { publishableKey } from "../_shared/supabase-keys.ts";\n', "")
    .replace(
      [
        "      // SEC-KEY-01: public key from the shared resolver (SUPABASE_PUBLISHABLE_KEYS first, legacy",
        "      // SUPABASE_ANON_KEY only as fallback). A missing or broken key throws inside this try, so the",
        "      // catch below logs it and answers 500 instead of running without a key.",
        "      publishableKey(),",
      ].join("\n"),
      '      Deno.env.get("SUPABASE_ANON_KEY")!,',
    );
  assert.equal(reverted, before, "patched index.ts must equal deployed-v18 apart from the key lookup");
  assert.equal(after.includes("\r"), false, "same LF convention as the deployed file");
});

test("(3) no legacy key read survives in patched/, and the resolver is byte-identical to the repo's", () => {
  const LEGACY_READ = /Deno\.env\.get\(\s*["'](SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY)["']\s*\)/;
  assert.equal(LEGACY_READ.test(text(join(PATCHED, INDEX))), false);
  assert.equal(LEGACY_READ.test(text(join(DEPLOYED, INDEX))), true, "negative control: v18 does read it");
  const repoResolver = join(REPO, "supabase", "functions", "_shared", "supabase-keys.ts");
  assert.ok(bytes(join(PATCHED, RESOLVER)).equals(bytes(repoResolver)),
    "re-copy the resolver from supabase/functions/_shared/supabase-keys.ts if it changed on main");
  // Every relative import resolves inside patched/.
  const src = text(join(PATCHED, INDEX));
  const specs = [...src.matchAll(/from\s*["'](\.{1,2}\/[^"']+)["']/g)].map((m) => m[1]);
  assert.deepEqual(specs, ["../_shared/supabase-keys.ts"]);
  const target = resolve(dirname(join(PATCHED, INDEX)), specs[0]);
  assert.ok(existsSync(target) && !relative(PATCHED, target).startsWith(".."));
});

test("the patch README states it is not deployed and pins its base", () => {
  const readme = text(join(GRA, "README.md"));
  assert.match(readme, /IKKE deployet/);
  assert.match(readme, /7ad1811c76bae00d397484a5635f17898f355dac9664271b3363887c02a31b36/);
  assert.match(readme, /`verify_jwt`: \*\*`false`\*\*/);
});
