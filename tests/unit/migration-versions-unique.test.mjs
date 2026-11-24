// Every migration VERSION in supabase/migrations is used by exactly one file (tools/ci/migration-versions.mjs explains
// why: schema_migrations is keyed by the version, the replay plan by the name). On main and on every pull request's
// merge with main in CI. The CLI checks the same rule against other open branches before a push.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collisions, duplicateVersions, versionOf } from "../../tools/ci/migration-versions.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILES = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql"));

test("no two migration files share a version", () => {
  assert.deepEqual(duplicateVersions(FILES), []);
});

test("every migration file except prestige.sql has a 14-digit version", () => {
  assert.deepEqual(FILES.filter((f) => versionOf(f) === null), ["prestige.sql"]);
});

test("the rule, with the 2026-11-24 collision as its case (D-386 merged, F8 open on 20261124120000)", () => {
  const d386 = "20261124120000_avatar_northstar_hair_h25g1_d386.sql";
  const f8 = "20261124120000_course_round_parking.sql";
  assert.deepEqual(duplicateVersions([d386, f8, "20261123100000_x.sql"]), [{ version: "20261124120000", names: [d386, f8].sort() }]);
  assert.deepEqual(duplicateVersions([d386, `supabase/migrations/${d386}`]), [], "the same file twice is not a collision");
  assert.deepEqual(duplicateVersions(["prestige.sql", "prestige.sql"]), [], "no version, no rule");
  assert.deepEqual(collisions([f8], [{ ref: "origin/main", names: [d386] }]),
    [{ version: "20261124120000", mine: f8, theirs: d386, ref: "origin/main" }]);
  assert.deepEqual(collisions(["20261124160000_course_round_parking.sql"], [{ ref: "origin/main", names: [d386] }]), [], "the renumbered F8");
  assert.deepEqual(collisions([f8], [{ ref: "origin/other", names: [f8] }]), [], "the same file merged elsewhere is not a collision");
  for (const bad of ["2026112412000_x.sql", "x_20261124120000.sql", "20261124120000.sql", "20261124120000_x.txt"]) assert.equal(versionOf(bad), null, bad);
});
