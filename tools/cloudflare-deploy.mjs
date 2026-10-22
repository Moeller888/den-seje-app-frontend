// The ONE deploy command Cloudflare Workers Builds runs, for every branch.
// ---------------------------------------------------------------------------------------------
// WHY THIS EXISTS: THE READ-ALOUD SECRETS KEPT VANISHING
// The Worker's secrets (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, TTS_ADMIN_TOKEN) live on the Worker,
// not in Git. Every new version — `wrangler deploy` and `wrangler versions upload` alike — copies
// them from the LATEST version, which is not necessarily the deployed one. Workers Builds also
// builds every non-production branch and uploads it as a version. A branch cut before 157P has no
// `worker/` script, so its upload is an assets-only version with NO secrets, and it becomes the
// latest version. The next merge to main then deploys a version that inherits that empty set, and
// production `/api/tts` answers 503. It happened on 2026-10-19 and again by 2026-10-21. A preview
// upload as latest version also makes `wrangler secret put` refuse to run.
//
// SO, BY BRANCH (Workers Builds sets WORKERS_CI_BRANCH):
//   main       -> preflight: the latest version must carry every required secret, or nothing is
//                 deployed and the build fails; `wrangler deploy`; then the version now serving
//                 100 % must carry them too, or the build fails loudly.
//   any other  -> `wrangler deploy --dry-run`: the bundle is validated, nothing is uploaded. Preview
//                 URLs are unavailable on a Worker with a Durable Object class anyway, so a branch
//                 upload never bought anything but this risk.
// A branch older than this file has no tools/cloudflare-deploy.mjs, so its build fails before it can
// upload anything. That is the point: fail closed.
//
// Only secret NAMES are ever read or printed — never a value. Node builtins only (Cloudflare sets
// SKIP_DEPENDENCY_INSTALL=1); Wrangler is the same pinned version as before.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const WORKER_NAME = "den-seje-app-frontend";
export const PRODUCTION_BRANCH = "main";
export const WRANGLER = ["--yes", "wrangler@4.118.0"];
export const REQUIRED_SECRETS = Object.freeze(["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "TTS_ADMIN_TOKEN"]);

/** "production" | "validate-only". A missing or blank branch is an error, never a guess. */
export function planFor(branch) {
  if (typeof branch !== "string" || branch.trim() === "") {
    throw new Error("WORKERS_CI_BRANCH is not set; refusing to guess whether this is production");
  }
  return branch.trim() === PRODUCTION_BRANCH ? "production" : "validate-only";
}

/** Secret binding names of one `wrangler versions view --json` result. */
export function secretNamesOf(version) {
  const bindings = version && version.resources && Array.isArray(version.resources.bindings)
    ? version.resources.bindings : null;
  if (bindings === null) throw new Error("version has no bindings list");
  return bindings
    .filter((b) => b && (b.type === "secret_text" || b.type === "secret_key") && typeof b.name === "string")
    .map((b) => b.name)
    .sort();
}

/** Required names absent from `names`. */
export function missingSecrets(names) {
  const present = new Set(Array.isArray(names) ? names : []);
  return REQUIRED_SECRETS.filter((name) => !present.has(name));
}

/** Id of the newest entry of `wrangler versions list --json`. */
export function latestVersionId(list) {
  if (!Array.isArray(list) || list.length === 0) throw new Error("the Worker has no versions");
  const dated = list.filter((v) => v && typeof v.id === "string" && v.metadata && typeof v.metadata.created_on === "string");
  if (dated.length === 0) throw new Error("no version carries an id and created_on");
  dated.sort((a, b) => a.metadata.created_on.localeCompare(b.metadata.created_on));
  return dated[dated.length - 1].id;
}

/** Version id(s) the current deployment serves, from `wrangler deployments status --json`. */
export function deployedVersionIds(status) {
  const versions = status && Array.isArray(status.versions) ? status.versions : [];
  const ids = versions.filter((v) => v && typeof v.version_id === "string").map((v) => v.version_id);
  if (ids.length === 0) throw new Error("the current deployment lists no versions");
  return ids;
}

function wrangler(args, { json }) {
  const result = spawnSync("npx", [...WRANGLER, ...args], {
    encoding: "utf8",
    stdio: json ? ["ignore", "pipe", "inherit"] : "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw new Error(`wrangler ${args[0]} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`wrangler ${args.join(" ")} exited with ${result.status}`);
  if (!json) return null;
  try {
    return JSON.parse(result.stdout);
  } catch (_e) {
    throw new Error(`wrangler ${args.join(" ")} did not return JSON`);
  }
}

function assertSecrets(label, versionId) {
  const version = wrangler(["versions", "view", versionId, "--name", WORKER_NAME, "--json"], { json: true });
  const missing = missingSecrets(secretNamesOf(version));
  if (missing.length > 0) {
    throw new Error(`${label} version ${versionId} is missing secret(s): ${missing.join(", ")}. ` +
      "Restore them with `wrangler secret put <NAME>` (see docs/HOSTING.md) before deploying.");
  }
  console.log(`${label} version ${versionId}: all ${REQUIRED_SECRETS.length} required secrets present`);
}

export function main(env) {
  const plan = planFor(env.WORKERS_CI_BRANCH);
  if (plan === "validate-only") {
    console.log(`branch "${env.WORKERS_CI_BRANCH}": validate only, no version is uploaded`);
    wrangler(["deploy", "--dry-run"], { json: false });
    return;
  }
  const list = wrangler(["versions", "list", "--name", WORKER_NAME, "--json"], { json: true });
  assertSecrets("latest (the one deploy inherits from)", latestVersionId(list));
  wrangler(["deploy"], { json: false });
  const status = wrangler(["deployments", "status", "--name", WORKER_NAME, "--json"], { json: true });
  for (const id of deployedVersionIds(status)) assertSecrets("deployed", id);
}

const invoked = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invoked) {
  try { main(process.env); } catch (e) { console.error("deploy failed: " + e.message); process.exit(1); }
}
