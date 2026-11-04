// The ONE reviewed exception the migration-ordering guards make for D-237
// (20261027160000_revoke_truncate_maintain_api_roles.sql).
//
// Several guards assert that their lockdown migration sorts after every migration that touches the
// objects it protects, so that no later file can quietly re-open them. D-237 sorts later and names
// those objects, but only to take TRUNCATE and MAINTAIN away from anon and authenticated: it cannot
// widen who reads or writes anything. It is exempt only while ALL of these hold:
//   1. it is exactly this file name;
//   2. the file is byte-identical to the reviewed version (SHA-256 recorded in docs/decisions/D-237.md);
//   3. its executable SQL is nothing but the two reviewed statement shapes below.
// Any edit to the file voids (2); a file that copies the content under another name fails (1). The
// shapes in (3) are checked separately so the narrowing rule itself is testable
// (tests/unit/d237-guard-exception.test.mjs). This is not a rule that REVOKE is safe in general.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const D237_FILE = "20261027160000_revoke_truncate_maintain_api_roles.sql";
export const D237_SHA256 = "c4a1728abe59aab4fa3be337ac72f2b5758d83c07a1681bd8fdc456595e38cb5";

const IDENT = String.raw`public\.[a-z_][a-z0-9_]*`;
const LIST = String.raw`${IDENT}(?:, ${IDENT})*`;
const REVIEWED_SHAPES = [
  new RegExp(String.raw`^REVOKE TRUNCATE, MAINTAIN ON TABLE ${LIST} FROM anon, authenticated$`),
  new RegExp(String.raw`^REVOKE MAINTAIN ON TABLE ${LIST} FROM anon, authenticated$`),
];

/** Executable statements: -- comment lines removed, split on ';', whitespace collapsed. */
export function executableStatements(sql) {
  return sql.split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n")
    .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** Whether SQL consists only of the reviewed D-237 narrowing statements (and at least one). */
export function onlyReviewedNarrowing(sql) {
  const statements = executableStatements(sql);
  return statements.length > 0 && statements.every((s) => REVIEWED_SHAPES.some((re) => re.test(s)));
}

/** Whether the migration `name` in `dir` is the reviewed D-237 file that the ordering guards exempt. */
export function isReviewedD237(dir, name) {
  if (name !== D237_FILE) return false;
  const bytes = readFileSync(join(dir, name));
  if (createHash("sha256").update(bytes).digest("hex") !== D237_SHA256) return false;
  return onlyReviewedNarrowing(bytes.toString("utf8"));
}
