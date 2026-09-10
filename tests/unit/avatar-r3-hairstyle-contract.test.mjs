// D-137 — the R3 hairstyle contract.
//
// Contract coverage. D-137 creates no resolver and no manifest entry, so nothing here may assert
// that an R3 hair resolver exists — one test asserts the opposite.
//
// The mapping is exercised through a local reference implementation of the stated rule, so the
// table is proven to be total over the stored domain and to behave as written, rather than merely
// re-read as prose. That reference is NOT a shipped resolver: D-137 fixes behaviour, not code.
//
// Three things are easy to get wrong later and are guarded explicitly:
//   1. the absent / "northstar" asymmetry — absent maps TO northstar, the literal string does not;
//   2. the seven valid-but-unmapped values must return null, NOT fall back to northstar the way
//      R2 does — that departure is the whole point;
//   3. the stored domain is read from the live database and must not be widened here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const C = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "r3", "r3-shadow-contract-v1.json"), "utf8"));
const H = C.hairstyleContract;
const REGISTER = readFileSync(join(REPO, "docs", "project-state.md"), "utf8");
const d137Row = () => {
  const rows = REGISTER.split("\n").filter((l) => l.startsWith("| **D-137** |"));
  assert.equal(rows.length, 1, "D-137 must appear exactly once");
  return rows[0];
};

/** A reference implementation of the contract's stated rule. Not a shipped resolver. */
function resolve(stored) {
  if (stored === undefined || stored === null) return "northstar";
  const row = H.mapping.table.find((r) => r.profileValue === stored);
  if (row) return row.r3Hair;
  return null;   // every other value — valid-but-unmapped, or invalid — refuses
}

test("the hairstyle contract is D-137's, is contract only, and covers shape alone", () => {
  assert.equal(H.decision, "D-137");
  assert.equal(H.adoptedOn, "2026-09-10");
  assert.match(H.status, /CONTRACT ONLY/);
  assert.match(H.status, /NO RESOLVER OR MANIFEST CODE/);
  assert.match(H.status, /NO STORED-DOMAIN CHANGE/);
  assert.match(H.status, /NO SUPABASE WRITE/);
  assert.match(H.scope, /hairstyle SHAPE only/i);
  assert.match(H.scope, /hair colour token .* is untouched/i);
});

test("the stored domain is the live one, and D-137 does not widen it", () => {
  const d = H.storedDomain;
  assert.deepEqual([...d.values].sort(),
    ["afro", "braid", "buzz", "buzzcut", "curly", "default", "long", "ponytail", "short", "sidecut", "tousled"],
    "the eleven values the live trigger permits");
  assert.match(d.source, /validate_avatar_identity/);
  assert.match(d.source, /read-only/i);
  assert.match(d.absentIsValid, /may also be absent/i);
  assert.match(d.notWidened, /does NOT widen, narrow or otherwise change/i);
  assert.match(d.notWidened, /writes nothing to Supabase/i);
  assert.match(d.northstarIsNotStorable, /ASSET KEY, not a storable profile value/i);
  assert.ok(!d.values.includes("northstar"), "northstar may never appear in the stored domain");
});

test("the mapping is TOTAL over the stored domain: every value is either mapped or refused", () => {
  const mapped = H.mapping.table.map((r) => r.profileValue).filter((v) => typeof v === "string" && v !== "(absent)");
  const refused = H.mapping.otherValidValuesReturnNull.values;
  assert.deepEqual([...new Set([...mapped, ...refused])].sort(), [...H.storedDomain.values].sort(),
    "mapped ∪ refused must equal the stored domain exactly — no value may be unaccounted for");
  assert.equal(mapped.filter((v) => refused.includes(v)).length, 0, "no value may be both mapped and refused");
});

test("each row of the approved table resolves as written", () => {
  assert.equal(resolve(undefined), "northstar", "an absent key");
  assert.equal(resolve(null), "northstar", "an explicit null");
  assert.equal(resolve("default"), "northstar");
  assert.equal(resolve("tousled"), "northstar");
  assert.equal(resolve("short"), "short");
  assert.equal(resolve("afro"), "afro");
  // and the table itself records a reason for each row, so a later reader is not guessing
  for (const row of H.mapping.table) assert.ok(row.why && row.why.length > 0, "each row needs a reason");
});

test("the seven other valid values refuse, rather than falling back to northstar", () => {
  const seven = ["braid", "curly", "long", "sidecut", "buzzcut", "ponytail", "buzz"];
  assert.deepEqual([...H.mapping.otherValidValuesReturnNull.values].sort(), [...seven].sort());
  for (const v of seven) {
    assert.equal(resolve(v), null, `${v} must refuse`);
    assert.notEqual(resolve(v), "northstar", `${v} must NOT silently become northstar`);
  }
  assert.match(H.mapping.otherValidValuesReturnNull.behaviour, /R3 -> R2 -> C2/);
  assert.match(H.mapping.otherValidValuesReturnNull.why, /wrong hair/i);
  assert.match(H.mapping.otherValidValuesReturnNull.why, /complete-or-null/i);
});

test("invalid values refuse, and the literal 'northstar' is one of them", () => {
  for (const v of ["northstar", "", "SHORT", "afro ", "mohawk", "0"]) assert.equal(resolve(v), null, `${v} must refuse`);
  assert.match(H.mapping.invalidValuesReturnNull.behaviour, /INCLUDING the literal string 'northstar'/);
  assert.match(H.mapping.invalidValuesReturnNull.whyNorthstarToo, /asset key that the live trigger rejects/i);
});

test("the absent / 'northstar' asymmetry is deliberate and must survive", () => {
  assert.equal(resolve(undefined), "northstar", "absent renders northstar");
  assert.equal(resolve("northstar"), null, "the literal string refuses");
  assert.notEqual(resolve(undefined), resolve("northstar"), "the two must NOT behave the same");
  assert.match(H.mapping.asymmetryIsDeliberate, /intentional and must not be/i);
  assert.match(H.mapping.asymmetryIsDeliberate, /absent means no choice was made/i);
  assert.match(H.mapping.asymmetryIsDeliberate, /impossible stored value/i);
});

test("matching is exact: no fuzzy, prefix or similarity fallback", () => {
  assert.match(H.mapping.rule, /[Ee]xact match/);
  assert.match(H.mapping.rule, /no fuzzy matching/i);
  assert.match(H.mapping.rule, /no prefix rule/i);
  assert.match(H.mapping.rule, /no visual-similarity fallback/i);
  assert.match(H.resolverShape.noSilentSubstitution, /never substitute a visually similar style/i);
  assert.match(H.resolverShape.noSilentSubstitution, /never fall back to northstar/i);
});

test("the departure from R2 is recorded as deliberate, and R2 is left alone", () => {
  const d = H.departureFromR2;
  assert.match(d.r2Behaviour, /hairSrcForR2 falls back to R2_HAIR_FALLBACK/);
  assert.match(d.r3Behaviour, /R3 refuses instead/i);
  assert.match(d.deliberate, /deliberate departure/i);
  assert.match(d.deliberate, /complete-or-null/i);
  assert.match(d.deliberate, /sees the R2 avatar, not R3/i);
  assert.match(d.r2IsUnchanged, /NOT changed by this decision/i);
  // and D-135's atomic contract is the thing it defers to, not a second rule
  assert.match(C.zModel.stackSelection.resolverContract, /complete, validated R3 layer list OR null/i);
});

test("the measured impact is dated and framed as a measurement", () => {
  const m = H.measuredImpact;
  assert.equal(m.profiles, 33);
  assert.deepEqual(m.distribution, { "(absent)": 29, default: 2, short: 1, buzzcut: 1 });
  assert.equal(Object.values(m.distribution).reduce((a, b) => a + b, 0), m.profiles, "the distribution must sum to the total");
  // the recorded consequence must follow from the mapping, not merely be asserted
  const resolved = Object.entries(m.distribution)
    .filter(([k]) => k !== "(absent)")
    .reduce((n, [k, c]) => n + (resolve(k) === null ? 0 : c), m.distribution["(absent)"]);
  assert.equal(resolved, 32, "32 of the 33 profiles must resolve to an R3 hair under this mapping");
  assert.equal(resolve("buzzcut"), null, "the one that falls back is the buzzcut profile");
  assert.match(m.method, /read-only aggregate/i);
  assert.match(m.method, /no row-level or personal data/i);
  assert.match(m.isAMeasurementNotAGuarantee, /not a permanent property/i);
});

test("coverage gains a second axis, and the budget is unchanged", () => {
  assert.match(H.coverage.secondAxis, /SECOND axis/);
  assert.match(H.coverage.secondAxis, /never a partial render/i);
  assert.match(H.coverage.assetsUsed, /r3-hair-northstar \(id 9\)/);
  assert.match(H.coverage.assetsUsed, /r3-hair-afro \(id 14\)/);
  assert.match(H.coverage.assetsUsed, /r3-hair-short \(id 15\)/);
  assert.match(H.coverage.noBudgetChange, /stays 15-16/);
  // the assets it names must actually be the planned ones, and the budget must really be unchanged
  const hairAssets = C.assets.filter((a) => a.slot === "hair").map((a) => a.name).sort();
  assert.deepEqual(hairAssets, ["r3-hair-afro", "r3-hair-northstar", "r3-hair-short"]);
  assert.equal(C.imageCallBudget.minimum, 15);
  assert.equal(C.imageCallBudget.maximum, 16);
});

test("nothing is wired yet, and nothing existing is changed", () => {
  const layers = readFileSync(join(REPO, "js", "avatar-layers.js"), "utf8");
  for (const name of ["R3_MANIFEST", "hairSrcForR3", "R3_HAIR_FALLBACK"])
    assert.ok(!layers.includes(name), `${name} must not exist yet — D-137 is contract only`);
  // R2's own resolver and fallback are untouched
  assert.match(layers, /export const R2_HAIR_FALLBACK = "northstar";/);
  assert.match(layers, /function hairSrcForR2/);
  assert.match(H.resolverShape.contractNotImplementation, /creates no resolver, no manifest entry and no runtime code/i);
  assert.match(H.prohibitions.noStoredDomainChange, /no Supabase or student data is touched/i);
  assert.match(H.prohibitions.noUiChange, /D-102's render-path predicate is untouched/);
  assert.match(H.prohibitions.noR2Change, /unchanged/i);
  assert.match(H.prohibitions.noImageRequestOrClaim, /authorises no image request/i);
});

test("the hairstyle decision is closed under D-137, leaving only blush open", () => {
  const closed = C.closedOwnerDecisions.filter((d) => d.decision === "D-137");
  assert.equal(closed.length, 1, "D-137 closes exactly one decision");
  assert.match(closed[0].was, /VALID_HAIRSTYLES/);
  assert.match(closed[0].resolution, /exact mapping table/i);
  assert.match(closed[0].resolution, /literal 'northstar'/);

  const open = C.openOwnerDecisions;
  assert.equal(open.length, 1, "only blush may remain open");
  assert.match(open[0], /whether blush is part of the first slice/i);
  assert.equal(C.closedOwnerDecisions.length, 7);
});

test("D-137 is append-only and rewrites nothing before it", () => {
  for (const d of ["D-132", "D-133", "D-134", "D-135", "D-136", "D-137"])
    assert.equal(REGISTER.split("\n").filter((l) => l.startsWith("| **" + d + "** |")).length, 1, d + " must appear exactly once");
  const row = d137Row();
  assert.match(row, /D-120 through D-136 are not rewritten/);
  assert.match(row, /EXACT mapping table/);
  assert.match(row, /including the literal `northstar`/i);
  assert.match(row, /32 of the 33 resolve/);
  assert.match(row, /no image request or claim/i);
});
