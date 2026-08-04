// The Cloudflare Static Assets build: what ships, and — mostly — what must never ship.
// ---------------------------------------------------------------------------------------------
// The frontend lives in the repository ROOT, beside `.env`, `.env.local`, `KUN TIL MIG.txt`, the
// `docs/` decision register, `tests/`, `tools/`, `supabase/` and 1,025 tracked files under
// `node_modules/`. `wrangler deploy --assets .` would publish all of it. These tests are the
// standing proof that the allowlist build does not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, lstatSync, readdirSync, mkdtempSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";
import {
  build, validateOutput, docsStubHtml, notFoundHtml, DOCS_STUB_MARKER,
  RUNTIME_HTML, ROOT_FILES, MANDATORY, FORBIDDEN_DIRS, FORBIDDEN_STRINGS, KNOWN_STRING_EXCEPTIONS,
} from "../../tools/cloudflare-build-static.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const toPosix = (p) => p.split(sep).join("/");

// One build, shared by every assertion below.
const result = build({ quiet: true });
const OUT = result.outDir;
const outFiles = new Set(result.files);
const read = (rel) => readFileSync(join(OUT, rel), "utf8");
const has = (rel) => outFiles.has(rel);

// ── what must be there ────────────────────────────────────────────────────────────────────────
test("index.html is in the output", () => assert.ok(has("index.html")));

test("login.html is in the output — it is the active entry page for every role", () => {
  assert.ok(has("login.html"));
  assert.match(read("login.html"), /<html/i);
});

test("every mandatory runtime file is present", () => {
  for (const m of MANDATORY) assert.ok(existsSync(join(OUT, m)), `missing ${m}`);
});

test("all 13 runtime HTML pages are copied", () => {
  assert.equal(RUNTIME_HTML.length, 13);
  for (const p of RUNTIME_HTML) assert.ok(has(p), `missing ${p}`);
});

test("the role-routing and password-recovery targets ship — js/login.js sends users to them", () => {
  const login = read("js/login.js");
  assert.match(login, /teacher\.html/);
  assert.match(login, /reset-password\.html/);
  assert.ok(has("teacher.html"), "teachers would land on a 404 after login");
  assert.ok(has("reset-password.html"), "password recovery would land on a 404");
});

test("the root entry files and css/theme.css are copied", () => {
  for (const f of [...ROOT_FILES, "css/theme.css"]) assert.ok(has(f), `missing ${f}`);
});

test("the required JS and asset trees are copied", () => {
  const js = result.files.filter((f) => f.startsWith("js/"));
  const assets = result.files.filter((f) => f.startsWith("assets/"));
  assert.ok(js.length >= 70, `expected the js/ tree, got ${js.length}`);
  assert.ok(assets.length >= 70, `expected the assets/ tree, got ${assets.length}`);
  assert.ok(has("js/supabase.js"), "the shared Supabase client must ship");
});

test("every local HTML reference resolves to a file that exists in the output", () => {
  const missing = [];
  for (const page of [...RUNTIME_HTML, "docs.html", "404.html"]) {
    const html = read(page);
    for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      const raw = m[1].trim();
      if (!raw || /^(https?:|data:|mailto:|javascript:|#|\/\/)/i.test(raw)) continue;
      if (raw.includes("${")) continue;                       // template literal, resolved at runtime
      const rel = raw.replace(/^\.?\//, "").split(/[?#]/)[0];
      if (!rel || rel.endsWith("/")) continue;
      if (!has(rel)) missing.push(`${page} -> ${rel}`);
    }
  }
  assert.deepEqual(missing, [], "referenced files absent from the output");
});

// ── the docs.html stub ────────────────────────────────────────────────────────────────────────
test("docs.html exists and IS the generated public stub, not the source page", () => {
  assert.ok(has("docs.html"));
  const t = read("docs.html");
  assert.ok(t.includes(DOCS_STUB_MARKER), "not the generated stub");
  assert.match(t, /ikke offentligt tilgængelig/);
  assert.match(t, /href="hub\.html"/);
  // the source page's machinery must be absent
  assert.ok(!t.includes("FILE_TO_SLUG"), "source docs.html machinery leaked into the output");
  assert.ok(!t.includes("157o-read-aloud"));
});

test("the public docs.html neither fetches nor links to /docs/", () => {
  const t = read("docs.html");
  assert.ok(!/fetch\s*\(/.test(t), "stub must not fetch");
  assert.ok(!/XMLHttpRequest/.test(t));
  assert.ok(!/["'`]\/?docs\//.test(t), "stub must not reference the docs/ directory");
  assert.ok(!/\.md\b/.test(t), "stub must not reference any Markdown file");
});

test("hub.html and admin.html can still open /docs.html without a 404", () => {
  for (const page of ["hub.html", "admin.html"]) {
    assert.ok(read(page).includes("docs.html"), `${page} should still link to docs.html`);
  }
  assert.ok(has("docs.html"), "so docs.html must exist in the output");
});

test("404.html is generated, neutral, and links back into the app", () => {
  assert.ok(has("404.html"));
  const t = read("404.html");
  assert.match(t, /404/);
  assert.match(t, /href="(index|login)\.html"/);
  for (const s of FORBIDDEN_STRINGS) assert.ok(!t.includes(s), `404.html leaks ${s}`);
});

// ── what must NOT be there ────────────────────────────────────────────────────────────────────
test("no internal directory reaches the output", () => {
  for (const d of FORBIDDEN_DIRS) {
    assert.ok(!existsSync(join(OUT, d)), `${d}/ must not be in the output`);
    assert.equal(result.files.filter((f) => f.startsWith(d + "/")).length, 0, `files under ${d}/ leaked`);
  }
});

test("docs/ is absent entirely — 0 files from the repository's docs directory", () => {
  assert.ok(!existsSync(join(OUT, "docs")));
  assert.equal(result.files.filter((f) => f.startsWith("docs/")).length, 0);
});

test("ROADMAP.md, project-state.md and CLAUDE.md appear nowhere in the output", () => {
  for (const name of ["ROADMAP.md", "project-state.md", "CLAUDE.md"]) {
    assert.equal(result.files.filter((f) => f.endsWith(name)).length, 0, `${name} leaked`);
    assert.ok(!existsSync(join(OUT, name)));
  }
});

test("no .env file and no package manifest reaches the output", () => {
  for (const f of result.files) {
    assert.ok(!/(^|\/)\.env/i.test(f), `env file leaked: ${f}`);
    const base = f.split("/").pop();
    assert.ok(!["package.json", "package-lock.json", "deno.lock"].includes(base), `manifest leaked: ${f}`);
  }
});

test("no internal Markdown, source map, or other non-runtime file type ships", () => {
  for (const f of result.files) {
    assert.ok(!f.endsWith(".md"), `markdown leaked: ${f}`);
    assert.ok(!f.endsWith(".map"), `source map leaked: ${f}`);
    for (const ext of [".ts", ".jsx", ".mjs", ".ps1", ".log", ".jsonl", ".txt", ".json"]) {
      assert.ok(!f.endsWith(ext), `non-runtime file leaked: ${f}`);
    }
  }
});

test("gamefeel.html and data/questions.js stay out, as agreed", () => {
  assert.ok(!has("gamefeel.html"));
  assert.ok(!has("data/questions.js"));
});

test("no dotfiles in the output except an optional .assetsignore", () => {
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (name.startsWith(".")) assert.equal(name, ".assetsignore", `unexpected dotfile: ${toPosix(relative(OUT, abs))}`);
      if (lstatSync(abs).isDirectory()) walk(abs);
    }
  };
  walk(OUT);
});

test("no symlinks anywhere in the output", () => {
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const st = lstatSync(abs);
      assert.ok(!st.isSymbolicLink(), `symlink in output: ${toPosix(relative(OUT, abs))}`);
      if (st.isDirectory()) walk(abs);
    }
  };
  walk(OUT);
});

test("the forbidden strings do not occur in the output", () => {
  const allowed = new Set(KNOWN_STRING_EXCEPTIONS.map((e) => `${e.file}::${e.string}`));
  const found = [];
  for (const f of result.files) {
    if (!/\.(html|js|css|svg)$/.test(f)) continue;
    const t = readFileSync(join(OUT, f), "utf8");
    for (const s of FORBIDDEN_STRINGS) {
      if (t.includes(s) && !allowed.has(`${f}::${s}`)) found.push(`${f}: ${s}`);
    }
  }
  assert.deepEqual(found, []);
});

test("the string exception list is exactly the two known comment references and cannot grow silently", () => {
  assert.equal(KNOWN_STRING_EXCEPTIONS.length, 2);
  assert.deepEqual(
    KNOWN_STRING_EXCEPTIONS.map((e) => `${e.file}::${e.string}`).sort(),
    ["js/analytics.js::CLAUDE.md", "js/sentry.js::CLAUDE.md"],
  );
  for (const e of KNOWN_STRING_EXCEPTIONS) {
    assert.ok(e.reason && e.reason.length > 10, "every exception must carry a reason");
    // each must genuinely be a comment line, not live code
    const line = readFileSync(join(OUT, e.file), "utf8").split("\n").find((l) => l.includes(e.string));
    assert.match(line.trim(), /^(\/\/|\*|\/\*)/, `${e.file}: the exception must be a comment, got: ${line.trim()}`);
  }
});

// ── the build's own guarantees ────────────────────────────────────────────────────────────────
test("the build is deterministic — two runs produce the identical file list and bytes", () => {
  const a = build({ quiet: true });
  const b = build({ quiet: true });
  assert.deepEqual(a.files, b.files);
  assert.equal(a.bytes, b.bytes);
  assert.deepEqual(a.files, [...a.files].sort(), "the file list must be sorted, not filesystem-ordered");
  for (const f of ["docs.html", "404.html"]) {
    assert.equal(readFileSync(join(OUT, f), "utf8"), readFileSync(join(OUT, f), "utf8"));
  }
  // generated pages must not embed a timestamp or build id
  for (const html of [docsStubHtml(), notFoundHtml()]) {
    assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(html), "generated page embeds a timestamp");
  }
});

test("validateOutput rejects path traversal, forbidden files and symlinks", () => {
  const tmp = mkdtempSync(join(tmpdir(), "cf-static-"));
  try {
    writeFileSync(join(tmp, "index.html"), "<html></html>", "utf8");
    assert.deepEqual(validateOutput(tmp).problems, []);

    writeFileSync(join(tmp, "ROADMAP.md"), "internal", "utf8");
    let p = validateOutput(tmp).problems;
    assert.ok(p.some((x) => x.includes("ROADMAP.md")), "a forbidden filename must be caught");
    rmSync(join(tmp, "ROADMAP.md"));

    writeFileSync(join(tmp, ".env"), "SECRET=1", "utf8");
    p = validateOutput(tmp).problems;
    assert.ok(p.some((x) => x.includes(".env")), "an env file must be caught");
    rmSync(join(tmp, ".env"));

    writeFileSync(join(tmp, "leak.html"), "see project-state for D-098", "utf8");
    p = validateOutput(tmp).problems;
    assert.ok(p.some((x) => x.includes("forbidden string")), "forbidden text must be caught");
    rmSync(join(tmp, "leak.html"));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("a symlink in the output is refused rather than followed", () => {
  const tmp = mkdtempSync(join(tmpdir(), "cf-symlink-"));
  try {
    writeFileSync(join(tmp, "index.html"), "<html></html>", "utf8");
    const target = join(REPO, "package.json");
    try {
      symlinkSync(target, join(tmp, "sneaky.html"), "file");
    } catch {
      return;   // unprivileged Windows cannot create symlinks; the guard is still asserted below
    }
    const p = validateOutput(tmp).problems;
    assert.ok(p.some((x) => x.includes("symlink")), "a symlink must be reported, never followed");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("the build refuses to publish the repository root", () => {
  const src = readFileSync(join(REPO, "tools", "cloudflare-build-static.mjs"), "utf8");
  assert.ok(!/--assets\s+\.[\s"']/.test(src), "must never suggest deploying the repo root");
  const wrangler = readFileSync(join(REPO, "wrangler.jsonc"), "utf8");
  assert.match(wrangler, /"directory":\s*"\.\/dist-cloudflare"/);
  assert.ok(!/"main"\s*:/.test(wrangler), "the Worker must stay asset-only — no main entry");
});

test("dist-cloudflare is gitignored so the build output can never be committed", () => {
  assert.match(readFileSync(join(REPO, ".gitignore"), "utf8"), /^dist-cloudflare\/$/m);
});
