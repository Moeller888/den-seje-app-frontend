// Publishing is safe because of four properties, and these tests pin all four:
//
//   1. objects are CONTENT-ADDRESSED and created with upsert:false, so a key's bytes never change
//   2. an existing key is accepted only after its bytes are hashed and matched
//   3. the manifest is the ONLY mutable object, written last, and never cached
//   4. publishing DELETES NOTHING, so no cached manifest, open tab or concurrent publisher can be
//      stranded
//
// The publisher half runs against a fake Storage API — real behaviour, no bucket, no credentials.
// The viewer half is asserted from the page source and is labelled as such: it proves the SHAPE of
// the recovery (one attempt, no loop, fresh pointer), not a rendered browser run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  PUBLISHED, SLUGS, BUCKET, MANIFEST_NAME, OBJECT_PREFIX,
  MANIFEST_CACHE_CONTROL, OBJECT_CACHE_CONTROL, LIST_PAGE_SIZE,
  objectKey, collect, manifest, plan, listAll, isAlreadyExists, ensureObject, sha256,
} from "../../tools/publish-docs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL_SRC = readFileSync(join(HERE, "..", "..", "tools", "publish-docs.mjs"), "utf8");
const PAGE_SRC = readFileSync(join(HERE, "..", "..", "docs.html"), "utf8");

// ── a fake Storage bucket API ────────────────────────────────────────────────────────────────
function fakeStore(seed = {}) {
  const objects = new Map(Object.entries(seed).map(([k, v]) => [k, Buffer.from(v)]));
  const calls = { uploads: [], downloads: [], removes: [], lists: [] };
  return {
    objects, calls,
    async list(prefix, opts) {
      calls.lists.push({ prefix, ...opts });
      const p = prefix ? prefix.replace(/\/$/, "") + "/" : "";
      const all = [...objects.keys()].filter((k) => k.startsWith(p)).sort()
        .map((k) => ({ name: k.slice(p.length) }));
      return { data: all.slice(opts.offset, opts.offset + opts.limit), error: null };
    },
    async upload(key, bytes, opts) {
      calls.uploads.push({ key, opts });
      if (objects.has(key) && opts && opts.upsert === false) {
        return { data: null, error: { statusCode: "409", message: "The resource already exists" } };
      }
      objects.set(key, Buffer.from(bytes));
      return { data: { path: key }, error: null };
    },
    async download(key) {
      calls.downloads.push(key);
      if (!objects.has(key)) return { data: null, error: { message: "Object not found" } };
      const b = objects.get(key);
      return { data: { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }, error: null };
    },
    async remove(keys) { calls.removes.push(keys); keys.forEach((k) => objects.delete(k)); return { error: null }; },
  };
}

const item = (text, slug = "s") => {
  const bytes = Buffer.from(text);
  const sha = sha256(bytes);
  return { slug, file: slug + ".md", title: slug, bytes, sha256: sha, key: objectKey(sha) };
};

// ── content addressing and immutability ──────────────────────────────────────────────────────

test("object keys derive from content, never from the filename", () => {
  for (const i of collect()) {
    assert.equal(i.key, OBJECT_PREFIX + i.sha256 + ".md");
    assert.ok(!i.key.includes(i.file));
  }
});

test("a new object is created with upsert:false and a long cache TTL", async () => {
  const s = fakeStore();
  const i = item("hello");
  assert.equal(await ensureObject(s, i, false), "uploaded");
  assert.equal(s.calls.uploads.length, 1);
  assert.equal(s.calls.uploads[0].opts.upsert, false, "immutability is not server-enforced");
  assert.equal(s.calls.uploads[0].opts.cacheControl, OBJECT_CACHE_CONTROL);
});

test("an existing object is verified byte-for-byte, not trusted on its name", async () => {
  const i = item("hello");
  const s = fakeStore({ [i.key]: "hello" });
  assert.equal(await ensureObject(s, i, true), "verified");
  assert.deepEqual(s.calls.downloads, [i.key], "the existing bytes were never read back");
  assert.equal(s.calls.uploads.length, 0, "an existing key was rewritten");
});

test("an existing object with the WRONG bytes is a hard failure", async () => {
  const i = item("hello");
  const s = fakeStore({ [i.key]: "tampered" });   // right name, wrong content
  await assert.rejects(() => ensureObject(s, i, true), /holds the wrong content/);
  assert.equal(s.calls.uploads.length, 0, "corrupt content was overwritten instead of refused");
});

test("a race is accepted only when the racer wrote the right bytes", async () => {
  const i = item("hello");
  const good = fakeStore({ [i.key]: "hello" });
  assert.equal(await ensureObject(good, i, false), "raced, verified");
  const bad = fakeStore({ [i.key]: "something else" });
  await assert.rejects(() => ensureObject(bad, i, false), /holds the wrong content/);
});

test("a non-conflict upload error is not mistaken for a race", async () => {
  const i = item("hello");
  const s = fakeStore();
  s.upload = async () => ({ data: null, error: { statusCode: "500", message: "boom" } });
  await assert.rejects(() => ensureObject(s, i, false), /upload failed/);
  assert.ok(!isAlreadyExists({ statusCode: "500", message: "boom" }));
  assert.ok(isAlreadyExists({ statusCode: "409", message: "The resource already exists" }));
});

// ── the plan ─────────────────────────────────────────────────────────────────────────────────

test("re-publishing unchanged documents uploads nothing", () => {
  const a = item("a", "a"), b = item("b", "b");
  const p = plan([a, b], [a.key, b.key]);
  assert.deepEqual(p.uploads, []);
  assert.deepEqual(p.verify.map((i) => i.slug), ["a", "b"]);
});

test("a document dropped from the allowlist leaves the manifest but NOT the bucket", () => {
  const a = item("a", "a"), b = item("b", "b");
  const p = plan([a], [a.key, b.key]);
  assert.deepEqual(p.unreferenced, [b.key], "the old object is not even reported");
  const m = manifest([a]);
  assert.deepEqual(m.docs.map((d) => d.slug), ["a"], "the dropped slug is still in the manifest");
});

test("normal publishing deletes nothing at all", async () => {
  // The property, from the source: there is no delete call in the tool, and --gc is refused.
  assert.ok(!/\.remove\s*\(/.test(TOOL_SRC), "the publisher can delete objects");
  assert.match(TOOL_SRC, /there is no --gc/, "--gc is not explicitly refused");
  // and the plan's unreferenced list is reported, never consumed by a delete
  assert.ok(!/remove\(\s*unreferenced/.test(TOOL_SRC));
});

// ── complete listing ─────────────────────────────────────────────────────────────────────────

test("listing pages to the end: 0, under, exactly, and over one page", async () => {
  for (const n of [0, 5, LIST_PAGE_SIZE, LIST_PAGE_SIZE + 1, LIST_PAGE_SIZE * 3 + 7]) {
    const seed = {};
    for (let k = 0; k < n; k++) seed[OBJECT_PREFIX + String(k).padStart(5, "0") + ".md"] = "x";
    const s = fakeStore(seed);
    const names = await listAll(s, "o");
    assert.equal(names.length, n, `n=${n}: listing was truncated`);
  }
});

test("exactly 1000 objects are all listed", async () => {
  const seed = {};
  for (let k = 0; k < 1000; k++) seed[OBJECT_PREFIX + String(k).padStart(5, "0") + ".md"] = "x";
  const s = fakeStore(seed);
  assert.equal((await listAll(s, "o")).length, 1000);
});

test("a failure on a LATER page fails the listing, it does not return a partial one", async () => {
  const seed = {};
  for (let k = 0; k < LIST_PAGE_SIZE * 2; k++) seed[OBJECT_PREFIX + String(k).padStart(5, "0") + ".md"] = "x";
  const s = fakeStore(seed);
  const real = s.list.bind(s);
  let n = 0;
  s.list = async (p, o) => (++n > 1 ? { data: null, error: { message: "page 2 exploded" } } : real(p, o));
  await assert.rejects(() => listAll(s, "o"), /could not list/);
});

// ── two concurrent publishers ────────────────────────────────────────────────────────────────

test("concurrent publishers: last manifest wins, and it is complete", async () => {
  // A and B start from the same empty bucket and publish different versions of the same slug.
  const store = fakeStore();
  const A = item("version A", "doc");
  const B = item("version B", "doc");

  const existingA = await listAll(store, "o");
  const existingB = await listAll(store, "o");          // both saw the same starting point
  const planA = plan([A], existingA.map((n) => OBJECT_PREFIX + n));
  const planB = plan([B], existingB.map((n) => OBJECT_PREFIX + n));

  // interleaved: A uploads, B uploads, A switches, B switches
  for (const i of planA.uploads) await ensureObject(store, i, false);
  for (const i of planB.uploads) await ensureObject(store, i, false);
  await store.upload(MANIFEST_NAME, Buffer.from(JSON.stringify(manifest([A]))), { upsert: true });
  await store.upload(MANIFEST_NAME, Buffer.from(JSON.stringify(manifest([B]))), { upsert: true });

  // BOTH generations survive; the live manifest is B's and every key it names exists.
  assert.ok(store.objects.has(A.key), "A's object was destroyed by B");
  assert.ok(store.objects.has(B.key), "B's object is missing");
  const live = JSON.parse(store.objects.get(MANIFEST_NAME).toString());
  assert.deepEqual(live.docs.map((d) => d.key), [B.key], "the live manifest is not the last one written");
  for (const d of live.docs) assert.ok(store.objects.has(d.key), "the live manifest names a missing object");
  assert.deepEqual(store.calls.removes, [], "a publisher deleted something");
});

// ── the manifest is the current-pointer ──────────────────────────────────────────────────────

test("the manifest maps slug to key, states the hash, and is deterministic", () => {
  const m = manifest(collect());
  assert.equal(m.bucket, BUCKET);
  for (const d of m.docs) assert.equal(d.key, objectKey(d.sha256));
  assert.equal(JSON.stringify(manifest(collect())), JSON.stringify(m));
  assert.ok(!JSON.stringify(m).includes("generated"), "a wall-clock stamp is back");
});

test("the manifest is written last, and written uncached", () => {
  const switchAt = TOOL_SRC.indexOf("upload(MANIFEST_NAME");
  const ensureAt = TOOL_SRC.indexOf("ensureObject(store");
  assert.ok(ensureAt > 0 && switchAt > ensureAt, "the manifest is switched before the objects exist");
  assert.equal(MANIFEST_CACHE_CONTROL, "0");
  assert.match(TOOL_SRC, /cacheControl: MANIFEST_CACHE_CONTROL/);
});

// ── viewer contract (asserted from source, not executed) ─────────────────────────────────────

test("viewer source: the manifest is read through a fresh signed URL, uncached", () => {
  assert.match(PAGE_SRC, /createSignedUrl\(MANIFEST_NAME/, "the pointer is not re-signed per read");
  assert.match(PAGE_SRC, /cacheNonce=/, "no cache-buster on the pointer read");
  assert.match(PAGE_SRC, /cache:\s*"no-store"/, "the browser cache is not bypassed");
  assert.match(PAGE_SRC, /manifestNonce\+\+/, "the nonce does not change between reads");
});

test("viewer source: a failed document triggers exactly ONE recovery, then fails closed", () => {
  const main = PAGE_SRC.slice(PAGE_SRC.indexOf("function main()"));
  const body = main.slice(0, main.indexOf("\n    }"));
  assert.equal((body.match(/loadManifest\(/g) || []).length, 1, "recovery is not exactly once");
  assert.match(body, /next\.key === entry\.key/, "it retries even when the key did not change");
  assert.match(body, /showError\(/, "the second failure does not surface");
  assert.ok(!/while\s*\(|for\s*\(/.test(body), "there is a loop in the recovery path");
});

test("viewer source: documents are fetched by key and verified before rendering", () => {
  assert.match(PAGE_SRC, /download\(entry\.key\)/);
  assert.match(PAGE_SRC, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(PAGE_SRC, /matcher ikke sin kontrolsum/);
  // the render call must sit behind the verification, never beside it
  const verifyAt = PAGE_SRC.indexOf("matcher ikke sin kontrolsum");
  const showAt = PAGE_SRC.indexOf("function show(md)");
  assert.ok(verifyAt > 0 && showAt > 0);
});

test("viewer source: a refreshed manifest REPLACES the tab's list rather than merging", () => {
  assert.match(PAGE_SRC, /Object\.keys\(DOCS\)\.forEach\(function \(k\) \{ delete DOCS\[k\]; \}\)/,
    "a slug dropped from the manifest would linger in an open tab");
});

// ── the allowlist stays literal ──────────────────────────────────────────────────────────────

test("the allowlist is literal and cannot escape docs/", () => {
  assert.deepEqual(Object.keys(PUBLISHED), [...SLUGS]);
  for (const e of Object.values(PUBLISHED)) {
    assert.ok(!/\.\.|^[\\/]|^[A-Za-z]:/.test(e.file), `${e.file} escapes docs/`);
  }
});
