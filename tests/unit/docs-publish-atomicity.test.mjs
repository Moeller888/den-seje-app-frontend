// The publish is atomic because of two properties, and these tests pin both.
//
//   1. objects are CONTENT-ADDRESSED, so no key's bytes ever change
//   2. the manifest is the ONLY thing that maps a slug to a key, and it is written between the
//      uploads and the garbage collection
//
// Together they mean a reader sees either the whole previous publish or the whole new one. The
// ordering is the part that is easy to get wrong — deleting before the switch can strand the live
// manifest pointing at a deleted object — so it is asserted here rather than left to a comment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  PUBLISHED, SLUGS, BUCKET, MANIFEST_NAME, OBJECT_PREFIX,
  objectKey, collect, manifest, plan,
} from "../../tools/publish-docs.mjs";

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tools", "publish-docs.mjs"),
  "utf8",
);

const doc = (slug, sha, extra = {}) => ({
  slug, sha256: sha, key: objectKey(sha), file: slug + ".md", title: slug,
  bytes: Buffer.from(""), ...extra,
});

// ── content addressing ───────────────────────────────────────────────────────────────────────

test("the object key is derived from the content hash, never from the filename", () => {
  const items = collect();
  for (const i of items) {
    assert.equal(i.key, OBJECT_PREFIX + i.sha256 + ".md");
    assert.ok(!i.key.includes(i.file), `${i.slug}: the source filename leaked into the object key`);
  }
});

test("every allowlisted document resolves to a distinct key", () => {
  const items = collect();
  assert.equal(items.length, SLUGS.length);
  assert.equal(new Set(items.map((i) => i.key)).size, items.length);
});

// ── the plan ─────────────────────────────────────────────────────────────────────────────────

test("a first publish uploads everything and collects nothing", () => {
  const items = [doc("a", "aa"), doc("b", "bb")];
  const p = plan(items, []);
  assert.deepEqual(p.uploads.map((i) => i.slug), ["a", "b"]);
  assert.deepEqual(p.gc, []);
});

test("re-publishing unchanged documents is a no-op", () => {
  const items = [doc("a", "aa"), doc("b", "bb")];
  const existing = items.map((i) => i.key).concat(MANIFEST_NAME);
  const p = plan(items, existing);
  assert.deepEqual(p.uploads, [], "an unchanged document was uploaded again");
  assert.deepEqual(p.gc, [], "an object still referenced was collected");
});

test("a changed document uploads a new key and collects the old one", () => {
  const before = [doc("a", "aa"), doc("b", "bb")];
  const after = [doc("a", "aa"), doc("b", "cc")];        // b changed
  const p = plan(after, before.map((i) => i.key).concat(MANIFEST_NAME));
  assert.deepEqual(p.uploads.map((i) => i.key), [objectKey("cc")]);
  assert.deepEqual(p.gc, [objectKey("bb")]);
});

test("a document dropped from the allowlist stops being readable", () => {
  const before = [doc("a", "aa"), doc("b", "bb")];
  const after = [doc("a", "aa")];                        // b removed from the allowlist
  const p = plan(after, before.map((i) => i.key).concat(MANIFEST_NAME));
  assert.deepEqual(p.gc, [objectKey("bb")], "the dropped document was left readable in the bucket");
});

test("garbage collection can never delete the manifest", () => {
  const p = plan([], [MANIFEST_NAME, objectKey("zz")]);
  assert.ok(!p.gc.includes(MANIFEST_NAME), "the switch itself was scheduled for deletion");
  assert.deepEqual(p.gc, [objectKey("zz")]);
});

test("garbage collection never touches a key the new manifest references", () => {
  const items = [doc("a", "aa")];
  const p = plan(items, [objectKey("aa"), objectKey("old"), MANIFEST_NAME]);
  assert.ok(!p.gc.includes(objectKey("aa")), "a referenced object was collected");
  assert.deepEqual(p.gc, [objectKey("old")]);
});

// ── the manifest is the switch ───────────────────────────────────────────────────────────────

test("the manifest maps every slug to its key and states the hash", () => {
  const m = manifest(collect());
  assert.equal(m.bucket, BUCKET);
  assert.equal(m.docs.length, SLUGS.length);
  for (const d of m.docs) {
    assert.ok(d.slug && d.key && d.sha256, "an entry is missing slug, key or hash");
    assert.equal(d.key, objectKey(d.sha256), "the key does not match the stated hash");
  }
});

test("the manifest is deterministic — same documents, same bytes", () => {
  const items = collect();
  assert.equal(JSON.stringify(manifest(items)), JSON.stringify(manifest(items)));
  assert.ok(!JSON.stringify(manifest(items)).includes("generated"), "a wall-clock stamp is back");
});

// ── the ordering, which is what makes it atomic ──────────────────────────────────────────────

test("uploads happen before the switch, and collection only after it", () => {
  // Source order, because the alternative is a live bucket. The three steps are labelled in the
  // tool precisely so this can be asserted.
  const upload = SRC.indexOf("STEP 1");
  const swap = SRC.indexOf("STEP 2");
  const gc = SRC.indexOf("STEP 3");
  assert.ok(upload > 0 && swap > 0 && gc > 0, "the publish steps are no longer labelled");
  assert.ok(upload < swap, "the manifest is switched before the objects it names are uploaded");
  assert.ok(swap < gc, "objects are collected before the switch — this can strand the live manifest");

  const removeAt = SRC.indexOf(".remove(");
  const manifestUploadAt = SRC.indexOf(`upload(MANIFEST_NAME`);
  assert.ok(manifestUploadAt < removeAt, "the delete call runs before the manifest upload");
});

test("a failed collection is reported but does not fail the publish", () => {
  // By the time GC runs the switch has landed, so the published state is already correct.
  const tail = SRC.slice(SRC.indexOf("STEP 3"));
  assert.match(tail, /console\.warn/, "a failed collection is silent");
  assert.ok(!/throw new Error\(`could not remove/.test(tail), "a failed collection fails the publish");
});

// ── the viewer holds up its end ──────────────────────────────────────────────────────────────

test("the viewer downloads by key and verifies the hash", () => {
  const page = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs.html"), "utf8");
  assert.match(page, /download\(entry\.key\)/, "the viewer still downloads by filename");
  assert.match(page, /crypto\.subtle\.digest\("SHA-256"/, "the viewer does not verify the hash");
  assert.match(page, /matcher ikke sin kontrolsum/, "a hash mismatch is not surfaced");
});

test("the allowlist is still literal", () => {
  assert.deepEqual(Object.keys(PUBLISHED), [...SLUGS]);
  for (const e of Object.values(PUBLISHED)) {
    assert.ok(!/\.\.|^[\\/]|^[A-Za-z]:/.test(e.file), `${e.file} escapes docs/`);
  }
});
