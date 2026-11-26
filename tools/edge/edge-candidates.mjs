// The register of REVIEWED Edge candidate identities (D-384, 2026-11-26), shared by tools/edge/gnq-deploy-preflight.mjs
// and tools/edge/edge-deploy-gate.mjs.
//
// Why: a class read from source text alone (a marker string, a call) is evidence, not identity. A source that only
// mentions a marker in a comment, has a safety call renamed, or is partly changed must never be taken for a known,
// safe version. So the class a gate acts on comes from the manifest (sha256 over the deployed file set,
// gnq-release.mjs's rule) of a REVIEWED version, and the source's markers only cross-check it:
//   - manifest registered, markers read the same class → KNOWN (the gate may proceed to its state and pair rules)
//   - manifest not registered                            → UNKNOWN (refused on every database, also as a partner)
//   - manifest registered, markers read another class    → CONFLICTING (refused: the register or the source is wrong)
// The register is tools/edge/edge-candidates.json; every entry is verified by tests/unit/edge-deploy-gate.test.mjs.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REGISTRY_FILE = join(dirname(fileURLToPath(import.meta.url)), "edge-candidates.json");
export const SLUGS = Object.freeze(["get-next-question", "process-event"]);
const HASH_RE = /^[0-9a-f]{64}$/;
const VERIFIED_BY_RE = /^(tree|fixture:[0-9a-f]{8})$/;

/** The register, validated; anything malformed throws (a broken register must stop a gate, never be ignored). */
export function parseRegistry(text, where = REGISTRY_FILE) {
  let doc;
  try { doc = JSON.parse(text); } catch (e) { throw new Error(`${where}: not JSON (${e.message})`); }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error(`${where}: not an object`);
  const extra = Object.keys(doc).filter((k) => k !== "_comment" && !SLUGS.includes(k));
  if (extra.length > 0) throw new Error(`${where}: unknown key ${extra.join(", ")}`);
  const out = {};
  for (const slug of SLUGS) {
    const entries = doc[slug];
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) throw new Error(`${where}: ${slug} must be an object of manifests`);
    out[slug] = {};
    for (const [hash, e] of Object.entries(entries)) {
      if (!HASH_RE.test(hash)) throw new Error(`${where}: ${slug}: "${hash}" is not a sha256 manifest`);
      if (!e || typeof e !== "object" || typeof e.class !== "string" || e.class === "") throw new Error(`${where}: ${slug} ${hash.slice(0, 8)}: class is required`);
      if (typeof e.verified_by !== "string" || !VERIFIED_BY_RE.test(e.verified_by)) throw new Error(`${where}: ${slug} ${hash.slice(0, 8)}: verified_by must be "tree" or "fixture:<commit8>"`);
      if (typeof e.reviewed !== "string" || e.reviewed.trim() === "") throw new Error(`${where}: ${slug} ${hash.slice(0, 8)}: reviewed (where it was reviewed) is required`);
      out[slug][hash] = { class: e.class, verified_by: e.verified_by, reviewed: e.reviewed };
    }
  }
  return out;
}

export const loadRegistry = (file = REGISTRY_FILE) => parseRegistry(readFileSync(file, "utf8"), file);

/**
 * The identity verdict for one source of `slug` with manifest `hash`, whose markers read as `markerKind`:
 * { verdict: "KNOWN", entry } | { verdict: "UNKNOWN", reason } | { verdict: "CONFLICTING", reason }.
 */
export function identify(registry, slug, hash, markerKind) {
  const entry = registry?.[slug]?.[hash];
  if (!entry) {
    return { verdict: "UNKNOWN", reason: `manifest ${hash} is not a reviewed ${slug} version (its source reads as ${markerKind}; tools/edge/edge-candidates.json)` };
  }
  if (entry.class !== markerKind) {
    return { verdict: "CONFLICTING", reason: `manifest ${hash} is registered as ${entry.class}, but its source reads as ${markerKind}` };
  }
  return { verdict: "KNOWN", entry };
}
