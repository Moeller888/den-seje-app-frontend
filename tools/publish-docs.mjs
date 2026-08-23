// ---------------------------------------------------------------------------------------------
// publish-docs — uploads the allowlisted internal documents to the PRIVATE `docs` bucket.
//
// The bucket is not public and has no INSERT/UPDATE/DELETE policy, so this runs with the SERVICE
// ROLE, which bypasses RLS. Reading is a separate matter: `docs_read_super_admin` lets a signed-in
// super_admin SELECT, and nobody else — see supabase/migrations/20260823000000_docs_private_bucket.sql.
//
// WHY AN ALLOWLIST AND NOT docs/*.md. This is the security-relevant decision in the whole feature,
// so it is a literal list rather than a glob: adding a document to the internal folder must never
// publish it by accident. Everything not named here stays on disk only.
//
//   node tools/publish-docs.mjs           # verify: report what WOULD be uploaded, upload nothing
//   node tools/publish-docs.mjs --write   # upload
//
// Writes nothing to the repository in either mode.
// ---------------------------------------------------------------------------------------------

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// @supabase/supabase-js and dotenv are imported LAZILY, inside the upload path only: verify mode
// and the unit tests are pure file reads and must not need node_modules to run.

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "..");

export const TOOL = "publish-docs";
export const BUCKET = "docs";

// ── the allowlist ────────────────────────────────────────────────────────────────────────────
// slug -> { file, title }. The slug is the URL fragment docs.html uses; the file is relative to
// docs/. Keep this list SHORT and deliberate: every entry is readable by every super_admin.
export const PUBLISHED = Object.freeze({
  "project-state": {
    file: "project-state.md",
    title: "Beslutningsregister (D-001…)",
  },
  "167a-r2-hair-a-production-spec": {
    file: "167a-r2-hair-a-production-spec.md",
    title: "167A — Option A: de syv frisurer",
  },
  "167a-r2-hair-identity-audit": {
    file: "167a-r2-hair-identity-audit.md",
    title: "167A — D-102 hår-identitetsaudit",
  },
  "ROADMAP": {
    file: "ROADMAP.md",
    title: "ROADMAP — Den Seje App",
  },
  "157o-read-aloud": {
    file: "157o-read-aloud.md",
    title: "157O — Read-Aloud (TTS)",
  },
});

export const SLUGS = Object.freeze(Object.keys(PUBLISHED));

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

export function collect() {
  const out = [];
  for (const [slug, entry] of Object.entries(PUBLISHED)) {
    const path = join(REPO, "docs", entry.file);
    if (!existsSync(path)) throw new Error(`allowlisted document is missing: docs/${entry.file}`);
    const bytes = readFileSync(path);
    out.push({ slug, ...entry, path, bytes, sha256: sha256(bytes) });
  }
  return out;
}

// The manifest docs.html reads first, so the page never guesses what exists.
export function manifest(items) {
  return {
    generated: new Date().toISOString(),
    bucket: BUCKET,
    docs: items.map((i) => ({ slug: i.slug, file: i.file, title: i.title, bytes: i.bytes.length, sha256: i.sha256 })),
  };
}

async function main() {
  const write = process.argv.includes("--write");
  console.log(`${TOOL} — ${write ? "--write (uploading)" : "verify only (uploads nothing)"}`);

  const items = collect();
  let total = 0;
  for (const i of items) {
    total += i.bytes.length;
    console.log(`  ${i.slug.padEnd(34)} ${String(i.bytes.length).padStart(7)} B  ${i.sha256.slice(0, 16)}…  docs/${i.file}`);
  }
  console.log(`  ${SLUGS.length} document(s), ${total} B total`);

  if (!write) {
    console.log("\n✓ VERIFY ONLY — nothing uploaded. Re-run with --write to publish.");
    return;
  }
  const dotenv = await import("dotenv");
  dotenv.config({ path: join(REPO, ".env") });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env) to upload");
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  for (const i of items) {
    const { error } = await supabase.storage.from(BUCKET).upload(i.file, i.bytes, {
      contentType: "text/markdown; charset=utf-8",
      upsert: true,
    });
    if (error) throw new Error(`upload failed for ${i.file}: ${error.message}`);
    console.log(`  ✓ uploaded ${i.file}`);
  }

  const m = Buffer.from(JSON.stringify(manifest(items), null, 2) + "\n", "utf8");
  const { error: mErr } = await supabase.storage.from(BUCKET).upload("manifest.json", m, {
    contentType: "application/json; charset=utf-8",
    upsert: true,
  });
  if (mErr) throw new Error(`upload failed for manifest.json: ${mErr.message}`);
  console.log("  ✓ uploaded manifest.json");
  console.log("\n✓ PUBLISHED to the private bucket. Readable by super_admin only.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error("✖ " + e.message); process.exit(1); });
}
