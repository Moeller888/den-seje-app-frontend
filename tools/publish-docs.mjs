// ---------------------------------------------------------------------------------------------
// publish-docs — publishes the allowlisted internal documents to the PRIVATE `docs` bucket.
//
// The bucket is not public and has no INSERT/UPDATE/DELETE policy, so this runs with the SERVICE
// ROLE, which bypasses RLS. Reading is a separate matter: `docs_read_super_admin` lets a signed-in
// super_admin SELECT, and nobody else — see supabase/migrations/20260823000000_docs_private_bucket.sql.
//
// WHY AN ALLOWLIST AND NOT docs/*.md. This is the security-relevant decision in the whole feature,
// so it is a literal list rather than a glob: adding a document to the internal folder must never
// publish it by accident. Everything not named here stays on disk only.
//
// WHY CONTENT-ADDRESSED OBJECTS. Documents are stored as `o/<sha256>.md`, never under their source
// filename. That makes every object IMMUTABLE: a changed document is a NEW key, so no reader ever
// sees a name whose bytes changed underneath them. The consequence is the ordering below, which is
// the whole point of this tool:
//
//   1. upload the new objects        — invisible; nothing references them yet
//   2. upload manifest.json          — THE SWITCH, and the only visible transition
//   3. delete unreferenced objects   — garbage, by definition, once the switch has landed
//
// Before step 2 a reader sees the entire OLD set; after it, the entire NEW set. There is no window
// in which the manifest describes one version while the bytes are another, and a failure at any
// step leaves the last complete publish intact. Deleting first — the obvious order — would be
// wrong: it can strand the still-live manifest pointing at an object that no longer exists.
//
//   node tools/publish-docs.mjs           # verify: report the plan, touch nothing
//   node tools/publish-docs.mjs --write   # publish
//
// Writes nothing to the repository in either mode.
// ---------------------------------------------------------------------------------------------

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// @supabase/supabase-js and dotenv are imported LAZILY, inside the publish path only: verify mode
// and the unit tests are pure file reads and must not need node_modules to run.

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "..");

export const TOOL = "publish-docs";
export const BUCKET = "docs";
export const MANIFEST_NAME = "manifest.json";
export const OBJECT_PREFIX = "o/";

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

// The object key IS the content hash. That is what makes objects immutable.
export const objectKey = (sha) => OBJECT_PREFIX + sha + ".md";

export function collect() {
  const out = [];
  for (const [slug, entry] of Object.entries(PUBLISHED)) {
    const path = join(REPO, "docs", entry.file);
    if (!existsSync(path)) throw new Error(`allowlisted document is missing: docs/${entry.file}`);
    const bytes = readFileSync(path);
    const sha = sha256(bytes);
    out.push({ slug, ...entry, path, bytes, sha256: sha, key: objectKey(sha) });
  }
  return out;
}

// The manifest docs.html reads first, so the page never guesses what exists — and it is the only
// thing mapping a slug to an object key, which is what makes it the switch.
// DETERMINISTIC BY CONSTRUCTION: no wall-clock stamp, so identical documents give identical bytes
// and a re-publish that changes nothing is visibly a no-op.
export function manifest(items) {
  return {
    bucket: BUCKET,
    docs: items.map((i) => ({
      slug: i.slug,
      file: i.file,       // display name only — never used as an object key
      title: i.title,
      bytes: i.bytes.length,
      sha256: i.sha256,   // the viewer verifies this after download
      key: i.key,
    })),
  };
}

// Pure: what a publish would do, given what the bucket already holds. No IO, so it is testable
// without a bucket and without credentials.
export function plan(items, existingNames = []) {
  const have = new Set(existingNames);
  const referenced = new Set(items.map((i) => i.key));
  return {
    // Content-addressed: a key that already exists holds exactly these bytes, so re-uploading it
    // would be a no-op. Skipping keeps a re-publish cheap and provably non-mutating.
    uploads: items.filter((i) => !have.has(i.key)),
    // Garbage only AFTER the switch: whatever the NEW manifest does not reference. The manifest
    // itself is never garbage.
    gc: existingNames.filter((n) => n !== MANIFEST_NAME && !referenced.has(n)),
  };
}

async function main() {
  const write = process.argv.includes("--write");
  console.log(`${TOOL} — ${write ? "--write (publishing)" : "verify only (touches nothing)"}`);

  const items = collect();
  let total = 0;
  for (const i of items) {
    total += i.bytes.length;
    console.log(`  ${i.slug.padEnd(34)} ${String(i.bytes.length).padStart(7)} B  ${i.key}`);
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
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env) to publish");
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const listed = await supabase.storage.from(BUCKET).list(OBJECT_PREFIX.replace(/\/$/, ""), { limit: 1000 });
  if (listed.error) throw new Error(`could not list the bucket: ${listed.error.message}`);
  const existing = (listed.data || []).map((o) => OBJECT_PREFIX + o.name);
  const { uploads, gc } = plan(items, existing);

  // STEP 1 — the new objects. Invisible: the live manifest does not reference them yet, so a
  // failure here leaves the previous publish intact and readable.
  for (const i of uploads) {
    const { error } = await supabase.storage.from(BUCKET).upload(i.key, i.bytes, {
      contentType: "text/markdown; charset=utf-8",
      upsert: true, // the key is the content hash, so this can only ever rewrite identical bytes
    });
    if (error) throw new Error(`upload failed for ${i.key}: ${error.message}`);
    console.log(`  ✓ uploaded ${i.key}  (${i.slug})`);
  }
  if (!uploads.length) console.log("  ✓ every document is already published, byte for byte");

  // STEP 2 — THE SWITCH. Until this lands, readers see the previous set in full.
  const m = Buffer.from(JSON.stringify(manifest(items), null, 2) + "\n", "utf8");
  const { error: mErr } = await supabase.storage.from(BUCKET).upload(MANIFEST_NAME, m, {
    contentType: "application/json; charset=utf-8",
    upsert: true,
  });
  if (mErr) throw new Error(`upload failed for ${MANIFEST_NAME}: ${mErr.message}`);
  console.log(`  ✓ switched ${MANIFEST_NAME}`);

  // STEP 3 — garbage collection, only now. Nothing the live manifest references can be deleted,
  // because the live manifest is the one just written.
  if (gc.length) {
    const removed = await supabase.storage.from(BUCKET).remove(gc);
    if (removed.error) {
      // Not fatal: the switch already landed, so the published state is correct and complete.
      console.warn(`  ! could not remove ${gc.length} unreferenced object(s): ${removed.error.message}`);
      console.warn("    the publish itself is live and consistent; re-run to collect them");
    } else {
      for (const n of gc) console.log(`  ✓ collected ${n}`);
    }
  } else {
    console.log("  ✓ no unreferenced objects to collect");
  }

  console.log("\n✓ PUBLISHED to the private bucket. Readable by super_admin only.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error("✖ " + e.message); process.exit(1); });
}
