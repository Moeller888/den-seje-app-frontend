#!/usr/bin/env node
/**
 * Clean-room checks.
 *
 * CR-02: no code, test, document or build script in this project may
 * reference the separate traceability document or the analysed source
 * material. This file is excluded from its own scan because it has to contain
 * the patterns.
 *
 * CR-01: no project file may contain an identifier from an external denylist.
 * The denylist is NOT part of the repository; it is given by path:
 *
 *   CLEAN_ROOM_DENYLIST_PATH=<file>   the denylist (must lie outside the project)
 *   REQUIRE_CLEAN_ROOM_DENYLIST=1     a missing denylist is an error (CI), not SKIP
 *
 * Denylist format (UTF-8): one literal entry per line; surrounding whitespace
 * is trimmed; empty lines and lines starting with "#" are ignored; entries
 * need at least 3 characters. Matching is a case-insensitive literal substring
 * test: per line in text files (reported with the line number), and over the
 * raw bytes in binary files (ASCII case-insensitive, reported as "binary").
 * Reports name the file, the line and the entry's number in the denylist,
 * never the entry itself.
 *
 * Text or binary is decided by content, not by file name: a file is text when
 * its first 8 KB contain no NUL byte. CR-02 scans every text file.
 *
 * Scanned: every file of the project except the generated folders at their
 * known places (root: node_modules, .git, coverage, test-results,
 * playwright-report; packages/<name>/: node_modules, dist, dist-devtools).
 * A folder with one of those names anywhere else is scanned. Symbolic links
 * are not followed.
 * Exit code 1 on a hit, on an invalid denylist, or on a missing denylist when
 * it is required; a missing denylist otherwise prints "CR-01: SKIP".
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(import.meta.url);
export const ROOT = join(here, "..", "..");

/** Forbidden references (case-insensitive). */
export const FORBIDDEN = [
  { id: "trace-doc", re: /30-sporbarhed/i },
  { id: "analysis-report", re: /claude-code-report/i },
  { id: "analysis-inventory", re: /\binventory\.json\b/i },
  { id: "evidence-dir", re: /(^|[\\/"'`\s])evidence[\\/]/i },
  { id: "original-dir", re: /(^|[\\/"'`\s])original[\\/]/i },
  { id: "analysis-dir", re: /-analysis[\\/]/i },
];

/** Generated folders, skipped only at these root-relative places. */
export const ROOT_SKIP = new Set(["node_modules", ".git", "coverage", "test-results", "playwright-report"]);
export const PACKAGE_SKIP = new Set(["node_modules", "dist", "dist-devtools"]);

/** Whether a project-relative directory path is a generated folder. */
export function isGenerated(rel) {
  const parts = rel.split("/");
  if (parts.length === 1) return ROOT_SKIP.has(parts[0]);
  return parts.length === 3 && parts[0] === "packages" && PACKAGE_SKIP.has(parts[2]);
}

/** Text if the first 8 KB contain no NUL byte (decided by content, not by name). */
export function isText(buf) {
  return !buf.subarray(0, 8192).includes(0);
}

/** All files below `root` (project-relative POSIX paths); generated folders and symbolic links skipped. */
export function walk(root) {
  const out = [];
  const go = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      const rel = relative(root, p).split(sep).join("/");
      const st = lstatSync(p);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        if (!isGenerated(rel)) go(p);
      } else out.push(rel);
    }
  };
  go(root);
  return out;
}

/** CR-02 over every text file of `root`. */
export function scan(root = ROOT) {
  const self = relative(root, here).split(sep).join("/");
  const hits = [];
  for (const rel of walk(root)) {
    if (rel === self || rel === "pnpm-lock.yaml") continue;
    const buf = readFileSync(join(root, rel));
    if (!isText(buf)) continue;
    buf
      .toString("utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        for (const f of FORBIDDEN) if (f.re.test(line)) hits.push({ file: rel, line: i + 1, rule: f.id });
      });
  }
  return hits;
}

/** Parse a denylist text; throws on invalid entries (with line numbers, without values). */
export function parseDenylist(text) {
  const entries = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    if ([...line].length < 3) throw new Error(`denylist line ${i + 1}: entries need at least 3 characters`);
    entries.push({ n: entries.length + 1, line: i + 1, lower: line.toLowerCase() });
  });
  return entries;
}

/** CR-01 hits of `entries` in `root`: { file, line|null, entry } — the entry is reported by number only. */
export function scanDenylist(root, entries) {
  const hits = [];
  for (const rel of walk(root)) {
    const buf = readFileSync(join(root, rel));
    if (isText(buf)) {
      buf
        .toString("utf8")
        .split(/\r?\n/)
        .forEach((line, i) => {
          const l = line.toLowerCase();
          for (const e of entries) if (l.includes(e.lower)) hits.push({ file: rel, line: i + 1, entry: e.n });
        });
    } else {
      // Binary: ASCII case-insensitive search over the raw bytes (latin1 keeps every byte as one character).
      const raw = buf.toString("latin1").toLowerCase();
      for (const e of entries) if (raw.includes(Buffer.from(e.lower, "utf8").toString("latin1"))) hits.push({ file: rel, line: null, entry: e.n });
    }
  }
  return hits;
}

/**
 * Run CR-01 with an environment; returns { status: "PASS"|"FAIL"|"SKIP"|"ERROR", lines, code }.
 * Never prints denylist values.
 */
export function runCr01(env = process.env, root = ROOT) {
  const path = env.CLEAN_ROOM_DENYLIST_PATH;
  const required = env.REQUIRE_CLEAN_ROOM_DENYLIST === "1";
  if (path === undefined || path === "" || !existsSync(path)) {
    const why = path === undefined || path === "" ? "CLEAN_ROOM_DENYLIST_PATH is not set" : "the denylist file does not exist";
    return required
      ? { status: "ERROR", code: 1, lines: [`CR-01: ERROR (${why}; REQUIRE_CLEAN_ROOM_DENYLIST=1)`] }
      : { status: "SKIP", code: 0, lines: [`CR-01: SKIP (${why}; the external denylist was not checked)`] };
  }
  const abs = resolve(path);
  const rel = relative(root, abs);
  if (!rel.startsWith("..") && !isAbsolute(rel)) {
    return { status: "ERROR", code: 1, lines: ["CR-01: ERROR (the denylist must lie outside the project so it can never be committed)"] };
  }
  let entries;
  try {
    entries = parseDenylist(readFileSync(abs, "utf8"));
  } catch (err) {
    return { status: "ERROR", code: 1, lines: [`CR-01: ERROR (${err.message})`] };
  }
  if (entries.length === 0) return { status: "ERROR", code: 1, lines: ["CR-01: ERROR (the denylist has no entries)"] };
  const hits = scanDenylist(root, entries);
  if (hits.length === 0) return { status: "PASS", code: 0, lines: [`CR-01: PASS (${entries.length} denylist entries, no matches)`] };
  return {
    status: "FAIL",
    code: 1,
    lines: [...hits.map((h) => `CR-01: ${h.file}${h.line === null ? " (binary)" : `:${h.line}`} matches denylist entry #${h.entry}`), `CR-01: FAIL (${hits.length} match(es))`],
  };
}

if (process.argv[1] && here === resolve(process.argv[1])) {
  const hits = scan();
  if (hits.length > 0) {
    for (const h of hits) console.error(`clean-room: ${h.file}:${h.line} references forbidden material (${h.rule})`);
    process.exitCode = 1;
  } else {
    console.log("clean-room: OK (no references to traceability or source-analysis material)");
  }
  const cr01 = runCr01();
  for (const l of cr01.lines) (cr01.code === 0 ? console.log : console.error)(l);
  if (cr01.code !== 0) process.exitCode = 1;
}
