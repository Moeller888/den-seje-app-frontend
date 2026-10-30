/**
 * Content CLI (phase 6, docs/decisions/phase-6.md §3).
 *
 *   content validate <project-dir | bundle.json> [--strict] [--json]
 *   content build <project-dir> --out <bundle.json> [--strict] [--json] [--check]
 *   content format <project-dir> [--check] [--json]
 *   content schema --out <dir> [--check] [--json]
 *
 * Exit codes: 0 = OK (warnings allowed), 1 = validation errors or --check found
 * differences, 2 = usage or I/O error. Every write is atomic (temporary file in
 * the same directory, then rename); `build` validates first and writes the
 * bundle last, so a failed build never leaves a (half) bundle behind.
 */

import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { buildBundle, validateBundle, validateProject } from "./build.ts";
import { checkFileSet, isSafeRelativePath } from "./limits.ts";
import { encodeText, prettyCanonical, projectToFiles, type Problem } from "./project.ts";
import { SCHEMAS } from "./schema.ts";

export interface CliIo {
  readonly cwd: string;
  out(text: string): void;
  err(text: string): void;
}

const SKIP_DIRS = new Set([".git", "node_modules", ".DS_Store"]);

/**
 * All files below a directory as project-relative POSIX paths (sorted, so the
 * platform's order never matters). Symbolic links are skipped, so a project
 * cannot pull in files from outside its folder; the import limits apply.
 */
export function readDir(root: string): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      const st = lstatSync(full);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(full);
      else out.set(relative(root, full).split(sep).join("/"), new Uint8Array(readFileSync(full)));
    }
  };
  walk(root);
  checkFileSet(out);
  return out;
}

let tmpCounter = 0;

/** Write a file atomically: a temporary file next to it, then rename over the target. */
export function writeAtomic(path: string, data: Uint8Array | string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${tmpCounter++}`;
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, path);
  } catch (err) {
    if (existsSync(tmp)) unlinkSync(tmp);
    throw err;
  }
}

/**
 * Write a project-relative file atomically below `root`; a path that would
 * leave `root` (absolute, "..", drive letters) is refused before anything is written.
 */
export function writeInside(root: string, rel: string, data: Uint8Array | string): void {
  const target = resolve(root, ...rel.split("/"));
  const back = relative(resolve(root), target);
  if (!isSafeRelativePath(rel) || back.startsWith("..") || isAbsolute(back)) throw new Error(`refusing to write outside ${root}: ${rel}`);
  writeAtomic(target, data);
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

interface Args {
  readonly command: string | undefined;
  readonly target: string | undefined;
  readonly out: string | undefined;
  readonly strict: boolean;
  readonly json: boolean;
  readonly check: boolean;
}

function parseArgs(argv: readonly string[]): Args | string {
  const flags = new Set<string>();
  const pos: string[] = [];
  let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === "--out") {
      out = argv[++i];
      if (out === undefined) return "--out needs a path";
    } else if (a.startsWith("--")) {
      if (!["--strict", "--json", "--check"].includes(a)) return `unknown option ${a}`;
      flags.add(a);
    } else pos.push(a);
  }
  return { command: pos[0], target: pos[1], out, strict: flags.has("--strict"), json: flags.has("--json"), check: flags.has("--check") };
}

const USAGE = [
  "usage:",
  "  content validate <project-dir | bundle.json> [--strict] [--json]",
  "  content build <project-dir> --out <bundle.json> [--strict] [--json] [--check]",
  "  content format <project-dir> [--check] [--json]",
  "  content schema --out <dir> [--check] [--json]",
].join("\n");

function report(io: CliIo, problems: readonly Problem[]): void {
  for (const p of problems) {
    const where = [p.file, p.path].filter((x) => x !== "").join(" ");
    io.out(`${p.level === "error" ? "ERROR  " : "WARNING"} ${p.code} ${where}: ${p.message}`);
  }
  const errors = problems.filter((p) => p.level === "error").length;
  io.out(`${errors} error(s), ${problems.length - errors} warning(s)`);
}

/** Run the CLI; returns the exit code. */
export function runCli(argv: readonly string[], io: CliIo): number {
  const args = parseArgs(argv);
  if (typeof args === "string") {
    io.err(`${args}\n${USAGE}`);
    return 2;
  }
  const emit = (value: unknown): void => io.out(JSON.stringify(value, null, 2));
  try {
    switch (args.command) {
      case "validate":
        return validate(args, io, emit);
      case "build":
        return build(args, io, emit);
      case "format":
        return format(args, io, emit);
      case "schema":
        return schema(args, io, emit);
      default:
        io.err(USAGE);
        return 2;
    }
  } catch (err) {
    io.err(`content: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
}

function needTarget(args: Args, io: CliIo): string | null {
  if (args.target === undefined) {
    io.err(`missing <project-dir>\n${USAGE}`);
    return null;
  }
  const path = resolve(io.cwd, args.target);
  if (!existsSync(path)) {
    io.err(`content: ${args.target} does not exist`);
    return null;
  }
  return path;
}

function validate(args: Args, io: CliIo, emit: (v: unknown) => void): number {
  const path = needTarget(args, io);
  if (path === null) return 2;
  const v = statSync(path).isDirectory() ? validateProject(readDir(path), { strict: args.strict }) : validateBundle(readFileSync(path, "utf8"), { strict: args.strict });
  if (args.json) emit({ ok: v.ok, problems: v.problems });
  else report(io, v.problems);
  return v.ok ? 0 : 1;
}

function build(args: Args, io: CliIo, emit: (v: unknown) => void): number {
  const path = needTarget(args, io);
  if (path === null) return 2;
  if (args.out === undefined) {
    io.err(`build needs --out <bundle.json>\n${USAGE}`);
    return 2;
  }
  const files = readDir(path);
  const v = validateProject(files, { strict: args.strict });
  if (!v.ok || v.project === null) {
    if (args.json) emit({ ok: false, problems: v.problems, written: [] });
    else report(io, v.problems);
    return 1;
  }
  const { json } = buildBundle(v.project);
  // The built bundle is validated again on its own (schema, content hash, engine validator).
  const check = validateBundle(json, { strict: args.strict });
  const problems = [...v.problems, ...check.problems];
  if (!check.ok) {
    if (args.json) emit({ ok: false, problems, written: [] });
    else report(io, problems);
    return 1;
  }
  const outFile = resolve(io.cwd, args.out);
  const outDir = dirname(outFile);
  const assets = new Map<string, Uint8Array>();
  for (const a of Object.values(v.project.assets)) {
    for (const file of [a.file, ...(a.alternatives ?? []).map((x) => x.file)]) assets.set(`assets/${file}`, files.get(`assets/${file}`) as Uint8Array);
  }
  const bundleBytes = encodeText(json);
  if (args.check) {
    const differs = [...assets].filter(([rel, data]) => !existsSync(join(outDir, rel)) || !sameBytes(new Uint8Array(readFileSync(join(outDir, rel))), data)).map(([rel]) => rel);
    if (!existsSync(outFile) || !sameBytes(new Uint8Array(readFileSync(outFile)), bundleBytes)) differs.push(relative(outDir, outFile).split(sep).join("/"));
    if (args.json) emit({ ok: differs.length === 0, problems, differs });
    else {
      report(io, problems);
      io.out(differs.length === 0 ? "bundle is up to date" : `out of date: ${differs.join(", ")}`);
    }
    return differs.length === 0 ? 0 : 1;
  }
  const written: string[] = [];
  for (const [rel, data] of assets) {
    writeInside(outDir, rel, data);
    written.push(rel);
  }
  // The bundle comes last: it only appears once everything it refers to is in place.
  writeAtomic(outFile, bundleBytes);
  written.push(relative(outDir, outFile).split(sep).join("/"));
  if (args.json) emit({ ok: true, problems, written });
  else {
    report(io, problems);
    io.out(`wrote ${relative(io.cwd, outFile).split(sep).join("/")} (${bundleBytes.length} bytes) and ${assets.size} asset file(s)`);
  }
  return 0;
}

function format(args: Args, io: CliIo, emit: (v: unknown) => void): number {
  const path = needTarget(args, io);
  if (path === null) return 2;
  const files = readDir(path);
  const v = validateProject(files, { strict: false });
  if (v.project === null) {
    if (args.json) emit({ ok: false, problems: v.problems, changed: [] });
    else report(io, v.problems);
    return 1;
  }
  const changed: string[] = [];
  for (const [rel, text] of projectToFiles(v.project)) {
    const bytes = encodeText(text);
    const old = files.get(rel);
    if (old !== undefined && sameBytes(old, bytes)) continue;
    changed.push(rel);
    if (!args.check) writeInside(path, rel, bytes);
  }
  if (args.json) emit({ ok: !args.check || changed.length === 0, changed });
  else io.out(changed.length === 0 ? "all files are formatted" : `${args.check ? "not formatted" : "formatted"}: ${changed.join(", ")}`);
  return args.check && changed.length > 0 ? 1 : 0;
}

function schema(args: Args, io: CliIo, emit: (v: unknown) => void): number {
  if (args.out === undefined) {
    io.err(`schema needs --out <dir>\n${USAGE}`);
    return 2;
  }
  const dir = resolve(io.cwd, args.out);
  const changed: string[] = [];
  for (const name of Object.keys(SCHEMAS).sort()) {
    const file = join(dir, `${name}.schema.json`);
    const bytes = encodeText(prettyCanonical(SCHEMAS[name]));
    if (existsSync(file) && sameBytes(new Uint8Array(readFileSync(file)), bytes)) continue;
    changed.push(`${name}.schema.json`);
    if (!args.check) writeAtomic(file, bytes);
  }
  if (args.json) emit({ ok: !args.check || changed.length === 0, changed });
  else io.out(changed.length === 0 ? "schemas are up to date" : `${args.check ? "out of date" : "wrote"}: ${changed.join(", ")}`);
  return args.check && changed.length > 0 ? 1 : 0;
}
