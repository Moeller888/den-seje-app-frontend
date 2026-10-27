// Prints one overview of the whole D-register (frozen legacy table + docs/decisions/D-NNN.md) as a
// Markdown table on stdout. The overview is GENERATED, never committed: a committed aggregate would
// bring back the shared-file conflicts the per-file register removes.
//
//   node tools/decisions/index.mjs [--root <repo>] [--from D-NNN]
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegister, parseDecisionFile, fmt, relatesList, LEGACY_FILE, DECISIONS_DIR } from "./register.mjs";

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
// Escape only pipes that are not escaped already (legacy cells contain `\|`).
const cell = (s) => String(s).replace(/(?<!\\)\|/g, "\\|").replace(/\s+/g, " ").trim();

export function legacySummary(line) {
  const cells = line.split(/(?<!\\)\|/).slice(2).join("|");
  const bold = /\*\*(.+?)\*\*/.exec(cells);
  const title = bold ? bold[1] : cells;
  const status = /Status \*\*`([^`]+)`\*\*/.exec(cells);
  return { title: cell(clip(title, 140)), status: status ? status[1] : "" };
}

export function buildIndex({ legacy, files }, { from = 0 } = {}) {
  const rows = [];
  for (const r of legacy) {
    const s = legacySummary(r.line);
    rows.push({ n: r.n, source: LEGACY_FILE, title: s.title, status: s.status, relates: "" });
  }
  for (const f of files) {
    const doc = parseDecisionFile(f.text);
    const fl = doc ? doc.fields : {};
    rows.push({ n: f.n, source: `${DECISIONS_DIR}/${f.name}`, title: cell(clip(fl.title || "", 140)), status: fl.status || "", relates: relatesList(fl.relates).join(", ") });
  }
  rows.sort((a, b) => a.n - b.n);
  const lines = ["| D | Titel | Status | Relaterer til | Kilde |", "|---|---|---|---|---|"];
  for (const r of rows.filter((x) => x.n >= from)) {
    lines.push(`| ${fmt(r.n)} | ${r.title} | ${cell(r.status)} | ${r.relates} | ${r.source} |`);
  }
  return lines.join("\n") + "\n";
}

const invoked = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invoked) {
  const args = process.argv.slice(2);
  const at = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const root = resolve(at("--root") || ".");
  const fromArg = at("--from");
  const from = fromArg && /^D-\d{3,}$/.test(fromArg) ? Number(fromArg.slice(2)) : 0;
  process.stdout.write(buildIndex(loadRegister(root), { from }));
}
