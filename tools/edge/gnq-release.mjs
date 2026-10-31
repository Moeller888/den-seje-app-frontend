// Release tooling for the get-next-question Edge Function (docs/operations/level-engine-rollout.md §3.1).
//
// The deployed file set is the module graph of index.ts (relative imports) plus deno.json — exactly
// the files get_edge_function lists after a deploy. A manifest is one line "<sha256>  <path>" per
// file (paths relative to supabase/, sorted), and the manifest hash is the sha256 of those lines.
//
//   node tools/edge/gnq-release.mjs manifest                    candidate (working tree), rollback and v179
//   node tools/edge/gnq-release.mjs materialize-rollback <dir>  write the rollback files under <dir>/supabase/
//   node tools/edge/gnq-release.mjs golden                      rewrite tests/fixtures/gnq-v179-parity.json
//
// The rollback source is commit 21ec9ff — byte-identical to the deployed version 179 — with the one
// dependency pin of this release applied (supabase-js 2.118.0). manifest and materialize-rollback
// need that commit in the local history (not in a shallow CI clone).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const ENTRY = "functions/get-next-question/index.ts";
export const IMPORT_MAP = "functions/get-next-question/deno.json";
export const ROLLBACK_COMMIT = "21ec9ff";
export const SUPABASE_JS_VERSION = "2.118.0";
export const SUPABASE_JS_FLOATING = "https://esm.sh/@supabase/supabase-js@2";
export const SUPABASE_JS_PINNED = `https://esm.sh/@supabase/supabase-js@${SUPABASE_JS_VERSION}`;

const SPECIFIER_RE = /\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|^\s*import\s*["']([^"']+)["']/gm;

export function specifiers(source) {
  return [...source.matchAll(SPECIFIER_RE)].map((m) => m[1] ?? m[2] ?? m[3]);
}

// The module graph from index.ts over relative imports, plus deno.json. read(path) → text.
export function graphFiles(read) {
  const seen = new Set([ENTRY]);
  const queue = [ENTRY];
  while (queue.length > 0) {
    const file = queue.shift();
    for (const spec of specifiers(read(file))) {
      if (!spec.startsWith("./") && !spec.startsWith("../")) continue;
      const next = posix.normalize(posix.join(posix.dirname(file), spec));
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return [...seen, IMPORT_MAP].sort();
}

// Every non-relative import in the graph, with the file it appears in.
export function externalImports(read) {
  return graphFiles(read)
    .filter((f) => f.endsWith(".ts"))
    .flatMap((file) => specifiers(read(file)).filter((s) => !s.startsWith("./") && !s.startsWith("../")).map((specifier) => ({ file, specifier })));
}

// An exact, immutable version: x.y.z on a URL, npm: or jsr: specifier. Ranges, majors, tags and
// unversioned specifiers are floating.
export function isPinned(specifier) {
  return /^https:\/\/[^\s?#]*@\d+\.\d+\.\d+(?:[/?#]|$)/.test(specifier)
    || /^(?:npm|jsr):(?:@[^@/]+\/)?[^@/]+@\d+\.\d+\.\d+(?:\/|$)/.test(specifier);
}

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

export function manifest(read, files) {
  const lines = files.map((f) => `${sha256(Buffer.from(read(f), "utf8"))}  ${f}`);
  const text = lines.join("\n") + "\n";
  return { files, lines, hash: sha256(text) };
}

export const workingTreeReader = (root = ROOT) => (path) => readFileSync(join(root, "supabase", path), "utf8");

export function gitReader(commit, root = ROOT) {
  return (path) => execFileSync("git", ["show", `${commit}:supabase/${path}`], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
}

// The rollback = ROLLBACK_COMMIT with the dependency pin of this release, nothing else.
export function pinSupabaseJs(text) {
  return text.split(`"${SUPABASE_JS_FLOATING}"`).join(`"${SUPABASE_JS_PINNED}"`);
}
export const rollbackReader = (root = ROOT) => {
  const read = gitReader(ROLLBACK_COMMIT, root);
  return (path) => pinSupabaseJs(read(path));
};

export function rollbackInMainHistory(root = ROOT) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ROLLBACK_COMMIT, "origin/main"], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function materialize(read, files, dir) {
  for (const f of files) {
    const out = join(dir, "supabase", f);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, read(f));
  }
}

async function main(argv) {
  const [cmd, arg] = argv;
  if (cmd === "manifest") {
    const show = (name, read) => {
      const m = manifest(read, graphFiles(read));
      console.log(`${name}: ${m.hash} (${m.files.length} files)`);
      for (const l of m.lines) console.log(`  ${l}`);
    };
    show("candidate (working tree)", workingTreeReader());
    show(`rollback (${ROLLBACK_COMMIT} + supabase-js ${SUPABASE_JS_VERSION})`, rollbackReader());
    show(`v179 as deployed (${ROLLBACK_COMMIT}, unpinned)`, gitReader(ROLLBACK_COMMIT));
    console.log(`${ROLLBACK_COMMIT} is an ancestor of origin/main: ${rollbackInMainHistory()}`);
    return;
  }
  if (cmd === "materialize-rollback") {
    if (!arg) throw new Error("usage: materialize-rollback <dir>");
    const read = rollbackReader();
    materialize(read, graphFiles(read), arg);
    console.log(`rollback files written under ${join(arg, "supabase")}`);
    return;
  }
  if (cmd === "golden") {
    const { loadHandler, goldenMatrix } = await import("../../tests/unit/helpers/gnq-parity-harness.mjs");
    const read = gitReader(ROLLBACK_COMMIT);
    const dir = mkdtempSync(join(tmpdir(), "gnq-v179-"));
    materialize(read, graphFiles(read), dir);
    const { handler, warmup } = await loadHandler(join(dir, "supabase", ENTRY));
    const golden = {
      source: `${ROLLBACK_COMMIT} (byte-identical to the deployed get-next-question version 179)`,
      source_manifest: manifest(read, graphFiles(read)).hash,
      warmup,
      cases: await goldenMatrix(handler),
    };
    const out = join(ROOT, "tests", "fixtures", "gnq-v179-parity.json");
    writeFileSync(out, JSON.stringify(golden, null, 1) + "\n");
    console.log(`wrote ${out}: ${Object.keys(golden.cases).length} cases`);
    return;
  }
  throw new Error("usage: gnq-release.mjs manifest | materialize-rollback <dir> | golden");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main(process.argv.slice(2));
}
