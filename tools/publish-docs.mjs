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
// THE SHAPE OF A PUBLISH
//
//   1. list `o/` COMPLETELY (paginated, or fail — a partial listing is never treated as the truth)
//   2. for every document: create `o/<sha256>.md` if absent, else VERIFY the existing bytes
//   3. overwrite manifest.json — THE SWITCH, and the only mutable object in the bucket
//
//   There is no step 4. Publishing NEVER deletes anything.
//
// WHY NOTHING IS DELETED. Objects are content-addressed, so an old generation costs only storage —
// but deleting it costs correctness. A viewer tab loaded before the switch, a browser cache (default
// TTL ~1 hour) and the CDN (up to 60 s to invalidate) all keep pointing at the previous manifest for
// a while, and a concurrent publisher may be mid-publish with objects only its own manifest names.
// Deleting during a publish can strand any of them. Cleanup is therefore deliberate, separate debt —
// see docs/167a-docs-delivery.md — not something `--write` does behind your back.
//
// A document dropped from the allowlist disappears from the manifest, and with it from the viewer,
// immediately. Its object stays in the bucket, still private and still behind super_admin RLS.
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

// The manifest is the current-pointer and lives at a fixed path, so it must never be cached: the
// Supabase default browser TTL is about an hour and CDN invalidation takes up to a minute, which is
// exactly long enough to hand a reader a stale generation. The objects are the opposite case — the
// key IS the content hash, so they can be cached effectively forever.
export const MANIFEST_CACHE_CONTROL = "0";
export const OBJECT_CACHE_CONTROL = "31536000";

// list() defaults to 100 and caps well below the object count a long-lived bucket can reach, so
// every listing pages to the end. A listing that cannot be completed is an error, never a shrug.
export const LIST_PAGE_SIZE = 100;
export const LIST_MAX_PAGES = 1000;

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

export const sha256 = (b) => createHash("sha256").update(b).digest("hex");

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

// The manifest is the ONLY thing mapping a slug to an object key, which is what makes it the
// switch. DETERMINISTIC BY CONSTRUCTION: no wall-clock stamp, so identical documents give identical
// bytes and a re-publish that changes nothing is visibly a no-op.
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
//
// `unreferenced` is REPORTED, never acted on. It is what a future, separate cleanup would consider,
// and naming it here keeps the debt visible instead of silent.
export function plan(items, existingNames = []) {
  const have = new Set(existingNames);
  const referenced = new Set(items.map((i) => i.key));
  return {
    uploads: items.filter((i) => !have.has(i.key)),
    verify: items.filter((i) => have.has(i.key)),
    unreferenced: existingNames.filter((n) => n !== MANIFEST_NAME && !referenced.has(n)),
  };
}

// Pages to the end of a prefix, or throws. A short page means the last page; anything else keeps
// going. The page cap exists so a misbehaving endpoint cannot spin forever — hitting it is an
// error, because a listing we cannot finish must not be mistaken for a complete one.
export async function listAll(bucketApi, prefix, pageSize = LIST_PAGE_SIZE) {
  const names = [];
  for (let page = 0; page < LIST_MAX_PAGES; page++) {
    const res = await bucketApi.list(prefix, { limit: pageSize, offset: page * pageSize });
    if (res.error) throw new Error(`could not list ${prefix || "/"}: ${res.error.message}`);
    const rows = res.data || [];
    for (const r of rows) if (r && r.name) names.push(r.name);
    if (rows.length < pageSize) return names;
  }
  throw new Error(`listing ${prefix || "/"} did not terminate within ${LIST_MAX_PAGES} pages`);
}

// True when Storage refused an upload because the key already exists — the race between listing
// and creating. Matched on the documented status/name rather than on message text alone.
export function isAlreadyExists(error) {
  if (!error) return false;
  const status = Number(error.statusCode || error.status || 0);
  const text = `${error.error || ""} ${error.message || ""}`.toLowerCase();
  return status === 409 || text.includes("already exists") || text.includes("duplicate");
}

async function main() {
  const write = process.argv.includes("--write");
  if (process.argv.includes("--gc")) {
    throw new Error(
      "there is no --gc: publishing never deletes, and cleanup is deliberate separate work.\n" +
      "  See docs/167a-docs-delivery.md — old generations are cheap, and deleting one while a\n" +
      "  cached manifest or a concurrent publisher still points at it is not.",
    );
  }
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
  const store = supabase.storage.from(BUCKET);

  // STEP 1 — a COMPLETE listing, or nothing at all.
  const existing = (await listAll(store, OBJECT_PREFIX.replace(/\/$/, ""))).map((n) => OBJECT_PREFIX + n);
  const { uploads, verify, unreferenced } = plan(items, existing);

  // STEP 2 — create the missing objects; prove the present ones. Never overwrite.
  for (const i of verify) console.log(`  ✓ ${await ensureObject(store, i, true)} ${i.key}  (${i.slug})`);
  for (const i of uploads) console.log(`  ✓ ${await ensureObject(store, i, false)} ${i.key}  (${i.slug})`);

  // STEP 3 — THE SWITCH. Until this lands, readers see the previous generation in full.
  const m = Buffer.from(JSON.stringify(manifest(items), null, 2) + "\n", "utf8");
  const { error: mErr } = await store.upload(MANIFEST_NAME, m, {
    contentType: "application/json; charset=utf-8",
    cacheControl: MANIFEST_CACHE_CONTROL,
    upsert: true, // the manifest is the one mutable object by design
  });
  if (mErr) throw new Error(`upload failed for ${MANIFEST_NAME}: ${mErr.message}`);
  console.log(`  ✓ switched ${MANIFEST_NAME}`);

  if (unreferenced.length) {
    console.log(`\n  note: ${unreferenced.length} object(s) from earlier generations remain in the bucket.`);
    console.log("  They are unreachable from the viewer, still private, still super_admin-only, and");
    console.log("  are NOT deleted — see docs/167a-docs-delivery.md.");
  }
  console.log("\n✓ PUBLISHED to the private bucket. Readable by super_admin only. Nothing was deleted.");
}

// Puts ONE document in the bucket and returns how. The three outcomes are the whole contract:
//   "verified"       the key was already there and its bytes hash to it
//   "uploaded"       the key was absent and was created
//   "raced, verified" another writer created it in between, and its bytes hash to it
// Anything else throws. There is no outcome in which this overwrites a key or accepts one on its
// name alone.
export async function ensureObject(store, item, alreadyPresent) {
  if (alreadyPresent) {
    await assertMatches(store, item);
    return "verified";
  }
  const { error } = await store.upload(item.key, item.bytes, {
    contentType: "text/markdown; charset=utf-8",
    cacheControl: OBJECT_CACHE_CONTROL,
    upsert: false, // server-enforced create-only: immutability is not left to this tool's word
  });
  if (!error) return "uploaded";
  if (!isAlreadyExists(error)) throw new Error(`upload failed for ${item.key}: ${error.message}`);
  // Someone created it between the listing and now. Accept it ONLY if the bytes are right.
  await assertMatches(store, item);
  return "raced, verified";
}

// A key that already exists is trusted only after its bytes hash to the key. Anything else is a
// hard stop: silently continuing would publish a manifest pointing at content nobody verified.
export async function assertMatches(store, item) {
  const got = await store.download(item.key);
  if (got.error || !got.data) {
    throw new Error(`${item.key} exists but could not be read back: ${got.error ? got.error.message : "empty"}`);
  }
  const actual = sha256(Buffer.from(await got.data.arrayBuffer()));
  if (actual !== item.sha256) {
    throw new Error(
      `${item.key} holds the wrong content.\n` +
      `  expected ${item.sha256}\n  found    ${actual}\n` +
      "  Refusing to overwrite or to publish a manifest that points at it.",
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error("✖ " + e.message); process.exit(1); });
}
