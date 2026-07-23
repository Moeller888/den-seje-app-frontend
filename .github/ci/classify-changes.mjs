// Path-aware CI classifier for the Playwright workflow (see .github/workflows/playwright.yml, D-066).
//
// Given the list of files changed by a pull request, return exactly one mode:
//   "docs"        — every changed file is under docs/**
//   "avatar-tool" — at least one file under tools/avatar/**, and every file is under
//                   tools/avatar/** or docs/**
//   "full"        — everything else
//
// FAIL-CLOSED: any non-array / empty / malformed input, or any path not provably inside
// the docs / avatar-tool safe sets, resolves to "full" (run the whole suite). It is always
// safe to over-classify as "full"; it is never safe to under-classify. `push` events (e.g.
// to main) are forced to "full" by the workflow before this function is consulted.
//
// Pure, deterministic, no regex (simple prefix checks only), no side effects.

const DOCS_PREFIX = "docs/";
const AVATAR_TOOL_PREFIX = "tools/avatar/";

export const MODES = Object.freeze({ DOCS: "docs", AVATAR_TOOL: "avatar-tool", FULL: "full" });

// Normalise a single path entry. Returns null for anything unusable (→ fail closed to full).
function normalise(p) {
  if (typeof p !== "string") return null;
  // Windows-style separators → POSIX, then trim. No regex: split/join on backslash.
  const t = p.split("\\").join("/").trim();
  if (t === "") return null;
  return t;
}

export function classify(files) {
  // Fail closed on any non-array or empty list.
  if (!Array.isArray(files) || files.length === 0) return MODES.FULL;

  const norm = [];
  for (const f of files) {
    const n = normalise(f);
    if (n === null) return MODES.FULL; // unknown / blank entry → full
    norm.push(n);
  }

  // MODE A — docs: every changed file under docs/**
  if (norm.every((f) => f.startsWith(DOCS_PREFIX))) return MODES.DOCS;

  // MODE B — avatar-tool: >=1 under tools/avatar/**, and all under tools/avatar/** or docs/**
  const hasAvatarTool = norm.some((f) => f.startsWith(AVATAR_TOOL_PREFIX));
  const onlyToolOrDocs = norm.every(
    (f) => f.startsWith(AVATAR_TOOL_PREFIX) || f.startsWith(DOCS_PREFIX),
  );
  if (hasAvatarTool && onlyToolOrDocs) return MODES.AVATAR_TOOL;

  // MODE C — full: everything else.
  return MODES.FULL;
}

// ── CLI: node .github/ci/classify-changes.mjs <file> [<file> ...]
//        or:  <newline-separated file list> | node .github/ci/classify-changes.mjs -
// Prints the resolved mode on a single line. Used for local verification; the workflow
// imports classify() directly via actions/github-script.
import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const emit = (files) => process.stdout.write(classify(files) + "\n");
  if (args.length === 1 && args[0] === "-") {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => emit(data.split("\n").map((l) => l.trim()).filter(Boolean)));
  } else {
    emit(args);
  }
}
