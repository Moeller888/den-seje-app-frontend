// Builds the application schema of the ISOLATED E2E database (D-110):
//
//   CI baseline (ci-baseline.sql) → CI function stubs (ci-function-stubs.sql) → every migration
//   replay-plan.mjs marks "apply", in version order → manually applied files (prestige.sql)
//
// with the question-row filter on for the whole replay, so no real question row ever lands.
//
// FAIL-CLOSED: any failing statement, any missing precondition object and any "blocked" plan entry is
// a failure, and the CLI exits non-zero. Nothing is retried, skipped at run time or downgraded to a
// warning — the only skips are the plan's, each with its written reason.
//
// The engine is executor-agnostic: `exec(sql)` runs a script, `query(sql)` returns row objects. The
// unit test drives it with PGlite; the CI job drives it with psql against the local stack:
//
//   node tests/isolated/schema/replay.mjs --db-url "$ISOLATED_DB_URL" [--summary "$GITHUB_STEP_SUMMARY"]
//
// The CLI refuses unless the isolation guard passes and the database carries this run's marker
// (seed-guard: token + cluster id) — it can never build a schema into any other database.
import { readFileSync, readdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { planReplay, summarise, preconditionCheckSql, extractSchemaPart, MANUALLY_APPLIED_IN_PRODUCTION } from "./replay-plan.mjs";
import { contentFilterOnSql, contentFilterOffSql, assertSeedTarget } from "../seed/seed-guard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "..", "..", "..");
export const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const read = (p) => readFileSync(p, "utf8").split("\r\n").join("\n");

export const baselineSql = () => read(join(HERE, "ci-baseline.sql"));
export const stubsSql = () => read(join(HERE, "ci-function-stubs.sql"));

export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
}
export const readMigration = (f) => read(join(MIGRATIONS_DIR, f));

const firstLine = (e) => String(e?.message ?? e).split("\n")[0].slice(0, 300);

export async function replaySchema({ exec, query, files = migrationFiles(), readSql = readMigration, onStep = () => {} }) {
  const { plan, manual, notReplayed } = planReplay(files, readSql);
  const steps = [];
  const failures = [];
  const run = async (name, sql) => {
    try {
      await exec(sql);
      steps.push({ name, ok: true });
      onStep(name, true);
      return true;
    } catch (e) {
      const error = firstLine(e);
      steps.push({ name, ok: false, error });
      failures.push({ name, error });
      onStep(name, false, error);
      return false;
    }
  };

  for (const b of plan.filter((p) => p.action === "blocked")) failures.push({ name: b.file, error: `blocked: ${b.reason}` });
  if (!(await run("(ci-baseline.sql)", baselineSql()))) return { plan, manual, notReplayed, steps, failures };
  if (!(await run("(ci-function-stubs.sql)", stubsSql()))) return { plan, manual, notReplayed, steps, failures };
  if (!(await run("(question-row filter on)", contentFilterOnSql()))) return { plan, manual, notReplayed, steps, failures };

  // Manually applied files go immediately before their anchor; an anchor that is not applied is a failure.
  const manualBefore = new Map();
  for (const f of manual) {
    const anchor = MANUALLY_APPLIED_IN_PRODUCTION[f].before;
    if (!plan.some((p) => p.file === anchor && p.action === "apply")) failures.push({ name: f, error: `anchor ${anchor} is not an applied migration` });
    else manualBefore.set(anchor, [...(manualBefore.get(anchor) ?? []), f]);
  }

  for (const p of plan) {
    if (p.action !== "apply") continue;
    for (const f of manualBefore.get(p.file) ?? []) await run(f, readSql(f));
    const check = preconditionCheckSql(p.file);
    if (check) {
      const missing = (await query(check)).map((r) => r.missing);
      if (missing.length) {
        failures.push({ name: p.file, error: `precondition missing: ${missing.join(", ")}` });
        steps.push({ name: p.file, ok: false, error: "precondition missing" });
        continue;
      }
    }
    let sql;
    try { sql = p.part ? extractSchemaPart(p.file, readSql(p.file)) : readSql(p.file); }
    catch (e) { failures.push({ name: p.file, error: firstLine(e) }); continue; }
    await run(p.part ? `${p.file} (schema part)` : p.file, sql);
  }
  await run("(question-row filter off)", contentFilterOffSql());
  return { plan, manual, notReplayed, steps, failures };
}

export function summaryMarkdown(result, seconds) {
  const s = summarise(result.plan);
  const lines = [
    "### schema-replay (D-110)",
    "",
    `| measure | value |`,
    `|---|---|`,
    `| result | ${result.failures.length === 0 ? "**success**" : `**FAILED** (${result.failures.length})`} |`,
    `| timestamped migrations | ${s.total}: apply ${s.apply}, skip ${s.skip} (each with a written reason), blocked ${s.blocked} |`,
    `| manually applied | ${result.manual.join(", ") || "—"} |`,
    `| not replayed (non-timestamped) | ${result.notReplayed.join(", ") || "—"} |`,
    `| statements run | ${result.steps.length} |`,
  ];
  if (seconds !== undefined) lines.push(`| time | ${seconds} s |`);
  if (result.failures.length) {
    lines.push("", "| file | first error |", "|---|---|");
    for (const f of result.failures) lines.push(`| \`${f.name}\` | ${f.error.replace(/\|/g, "\\|")} |`);
  }
  return lines.join("\n") + "\n";
}

// ── psql executor (CI) ──────────────────────────────────────────────────────────────────────────
export function psqlExecutor(dbUrl) {
  const psql = (args, input) => {
    const r = spawnSync("psql", [dbUrl, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error((r.stderr || r.stdout || `psql exited ${r.status}`).trim());
    return r.stdout;
  };
  return {
    exec: async (sql) => { psql(["-f", "-"], sql); },
    query: async (sql) => {
      const body = sql.trim().replace(/;\s*$/, "");
      const out = psql(["-A", "-t", "-f", "-"], `SELECT coalesce(json_agg(t), '[]'::json) FROM (${body}) t;`);
      return JSON.parse(out.trim() || "[]");
    },
  };
}

async function main(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const dbUrl = arg("--db-url");
  const summary = arg("--summary");
  if (!dbUrl) throw new Error("usage: replay.mjs --db-url <postgres url> [--summary <file>]");
  const { exec, query } = psqlExecutor(dbUrl);
  await assertSeedTarget({ query, env: process.env }); // isolation guard + run token + cluster id + empty
  const t0 = Date.now();
  const result = await replaySchema({ exec, query, onStep: (n, ok, e) => console.log(`${ok ? "ok  " : "FAIL"} ${n}${e ? " — " + e : ""}`) });
  const md = summaryMarkdown(result, Math.round((Date.now() - t0) / 1000));
  console.log(md);
  if (summary) appendFileSync(summary, md);
  if (result.failures.length) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((e) => { console.error(firstLine(e)); process.exit(1); });
}
