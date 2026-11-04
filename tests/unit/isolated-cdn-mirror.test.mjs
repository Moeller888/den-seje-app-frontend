// D-110: the frontend's CDN modules are mirrored before the network lock and served from loopback;
// nothing outside the two mirrored origins is ever fetched, and a missing module is a 404.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importsOf, crawl, writeMirror, loadMirror, rewriteCdnUrls, rewriteModule, urlForMirrorPath, isMirroredUrl } from "../isolated/cdn-mirror.mjs";
import { rewriteForLocal } from "../isolated/serve-build.mjs";

const J = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

test("imports: absolute-path, relative and absolute URLs on mirrored origins; never another origin", () => {
  const text = `import a from "/npm/@supabase/auth-js@2.1.0/+esm";export*from"/npm/tslib@2/+esm";
    const x = import("./chunk.mjs"); import "https://evil.example/x.js"; import y from "https://esm.sh/z@1";`;
  assert.deepEqual(importsOf(text, J).sort(), [
    "https://cdn.jsdelivr.net/npm/@supabase/auth-js@2.1.0/+esm",
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/chunk.mjs",
    "https://cdn.jsdelivr.net/npm/tslib@2/+esm",
    "https://esm.sh/z@1",
  ]);
});

test("crawl: follows imports breadth-first; an entry that fails is fatal; a non-mirrored entry is refused", async () => {
  const site = {
    [J]: `export * from "/npm/@supabase/auth-js@2.1.0/+esm"; // see from "/npm/not-real/+esm"`,
    "https://cdn.jsdelivr.net/npm/@supabase/auth-js@2.1.0/+esm": "export const a = 1;",
  };
  const fetchImpl = async (u) => (site[u] ? { status: 200, type: "text/javascript", body: site[u] } : { status: 404, body: "" });
  const m = await crawl([J], fetchImpl);
  assert.deepEqual([...m.keys()], [J, "https://cdn.jsdelivr.net/npm/@supabase/auth-js@2.1.0/+esm"]);
  assert.deepEqual(m.skipped, ["https://cdn.jsdelivr.net/npm/not-real/+esm"], "an import-like comment is skipped, not fatal");
  await assert.rejects(crawl(["https://cdn.jsdelivr.net/npm/missing/+esm"], fetchImpl), /HTTP 404/);
  await assert.rejects(crawl(["https://unpkg.com/x"], fetchImpl), /refusing to mirror/);
});

test("served text: CDN URLs become the local prefix; mirrored module imports too", () => {
  assert.equal(rewriteCdnUrls(`import { createClient } from "${J}";`), `import { createClient } from "/__cdn/cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";`);
  assert.equal(rewriteModule(`export*from"/npm/a@1/+esm";import"/__cdn/x";`, J), `export*from"/__cdn/cdn.jsdelivr.net/npm/a@1/+esm";import"/__cdn/x";`);
  assert.equal(rewriteModule(`export * from "/@supabase/x@2/es2022/x.mjs";`, "https://esm.sh/@supabase/supabase-js@2"),
    `export * from "/__cdn/esm.sh/@supabase/x@2/es2022/x.mjs";`);
  const page = rewriteForLocal(`import { createClient } from "${J}";`, { supabaseUrl: "http://127.0.0.1:54321", anonKey: "k" });
  assert.ok(!page.includes("https://cdn.jsdelivr.net"));
});

test("mirror paths map back only to mirrored origins; a written mirror round-trips", async () => {
  assert.equal(urlForMirrorPath("/__cdn/cdn.jsdelivr.net/npm/a@1/+esm"), "https://cdn.jsdelivr.net/npm/a@1/+esm");
  assert.equal(urlForMirrorPath("/__cdn/evil.example/x.js"), null);
  assert.equal(urlForMirrorPath("/__cdn/"), null);
  assert.equal(isMirroredUrl("https://cdn.jsdelivr.net.evil.example/x"), false);
  const dir = mkdtempSync(join(tmpdir(), "cdnm-"));
  const m = new Map([[J, { type: "text/javascript", body: "export const v = 1;" }]]);
  assert.equal(writeMirror(dir, m), 1);
  const back = loadMirror(dir);
  assert.equal(back.read(back.index[J].key), "export const v = 1;");
  assert.equal(loadMirror(join(dir, "nope")), null);
});
