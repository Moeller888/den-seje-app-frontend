// The unit-shard weights: tests/unit-ci-weights.json (written ONLY by tools/ci/unit-weights-refresh.mjs --write) plus
// one fragment file per new or changed weight in tests/unit-ci-weights.d/.
//
// Why fragments: every PR that added a weight also rewrote the one-line `_comment` of the shared file with its own
// measurement source, so any two such PRs conflicted on that line (#746 and #742, 2026-11-25/26, and before them each
// weights refresh). A fragment is a file of its own, named after the test file, so two PRs never touch the same lines
// — unless they set a weight for the SAME test file, and then identical content merges cleanly and different content
// is a real conflict worth seeing.
//
// A fragment: tests/unit-ci-weights.d/<test file>.json = { "seconds": <number > 0>, "source": "<where it was measured>" }
// A fragment overrides the shared file's entry for that test file. tools/ci/unit-weights-refresh.mjs --write folds the
// measured values into the shared file and DELETES the fragments the refresh covers (one left behind would override the
// newer measurement); commit those deletions with the shared file.
// Anything malformed throws: a broken fragment must fail the run loudly, never be ignored.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const WEIGHTS_FILE = join("tests", "unit-ci-weights.json");
export const FRAGMENT_DIR = join("tests", "unit-ci-weights.d");
const FRAGMENT_NAME = /^([a-z0-9][a-z0-9.-]*\.test\.mjs)\.json$/;

/** Every fragment in `dir` as { file, seconds, source }; throws on anything that is not exactly one valid fragment. */
export function readWeightFragments(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === "README.md") continue;
    const m = FRAGMENT_NAME.exec(name);
    if (!m) throw new Error(`${FRAGMENT_DIR}: ${name} is not <test file>.test.mjs.json`);
    let v;
    try { v = JSON.parse(readFileSync(join(dir, name), "utf8")); } catch (e) { throw new Error(`${FRAGMENT_DIR}/${name}: not JSON (${e.message})`); }
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(`${FRAGMENT_DIR}/${name}: not an object`);
    const extra = Object.keys(v).filter((k) => k !== "seconds" && k !== "source");
    if (extra.length > 0) throw new Error(`${FRAGMENT_DIR}/${name}: unknown key ${extra.join(", ")}`);
    if (typeof v.seconds !== "number" || !Number.isFinite(v.seconds) || v.seconds <= 0) throw new Error(`${FRAGMENT_DIR}/${name}: seconds must be a number > 0`);
    if (typeof v.source !== "string" || v.source.trim() === "") throw new Error(`${FRAGMENT_DIR}/${name}: source (where the seconds were measured) is required`);
    out.push({ file: m[1], seconds: v.seconds, source: v.source });
  }
  return out;
}

/** The weights the shard planner uses: the shared file, then every fragment on top. */
export function loadUnitWeights(root) {
  const doc = JSON.parse(readFileSync(join(root, WEIGHTS_FILE), "utf8"));
  const base = doc && typeof doc === "object" && doc.weights && typeof doc.weights === "object" ? doc.weights : null;
  if (!base) throw new Error(`${WEIGHTS_FILE}: no "weights" object`);
  const fragments = readWeightFragments(join(root, FRAGMENT_DIR));
  const weights = { ...base };
  for (const f of fragments) weights[f.file] = f.seconds;
  return { weights, base, fragments };
}
