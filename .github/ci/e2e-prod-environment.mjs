// Rule for the jobs that run against PRODUCTION with the protected `e2e-prod` environment
// (CLI: ./e2e-prod-preflight.mjs; unit-tested by tests/unit/ci-e2e-prod-environment.test.mjs):
// playwright.yml `test` (manual dispatch only) and update-avatar-goldens.yml `update`.
//
// It proves two things BEFORE npm ci, global setup or any Supabase call, and prints only names:
//   1. the job really runs in the GitHub environment `e2e-prod`. The environment variable
//      E2E_PROD_ENVIRONMENT exists ONLY at that environment's level (never as a repository
//      variable), so it resolves to "e2e-prod" only inside a job that the environment's
//      protection rules (branch `main` only, a required reviewer) have let through;
//   2. every credential the job needs is set (non-empty).
//
// No fallback to repository secrets (metode B). A secret defined at several levels resolves to the
// lowest one, but a MISSING environment secret silently resolves to a repository secret of the same
// name. So the environment secrets carry their own names — SECRET_SOURCES, prefix E2E_PROD_ — that
// must never exist at repository level, and the two jobs map them to the names the programs read:
//   SUPABASE_URL: ${{ secrets.E2E_PROD_SUPABASE_URL }}
// A missing environment secret then resolves to an empty string and point 2 stops the job.
// The workflow mapping is pinned by the contract test; the absence of E2E_PROD_* at repository
// level is checked read-only via the API (docs/operations/e2e-prod-environment.md).
//
// This is a VERIFICATION, not a security boundary: the boundary is the environment's branch rule
// and required reviewer in GitHub. The step makes a missing or mis-configured environment fail
// loudly instead of silently running with something else.
//
// It never prints, hashes or measures a value — only "sat"/"mangler" per name.
export const ENVIRONMENT_NAME = "e2e-prod";
export const MARKER = "E2E_PROD_ENVIRONMENT";
export const SECRET_PREFIX = "E2E_PROD_";
// The names the programs read (tests/global-setup.ts, tests/test-credentials.mjs, …).
export const REQUIRED_SECRETS = Object.freeze([
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TEST_STUDENT_EMAIL",
  "TEST_STUDENT_PASSWORD",
  "TEST_TEACHER_PASSWORD",
  "TEST_STUDENT2_PASSWORD",
]);
// Program name → the e2e-prod environment secret it is read from. The only source; no fallback.
export const SECRET_SOURCES = Object.freeze(
  Object.fromEntries(REQUIRED_SECRETS.map((name) => [name, `${SECRET_PREFIX}${name}`])),
);

export function preflight(env) {
  const source = env && typeof env === "object" ? env : {};
  const isSet = (name) => typeof source[name] === "string" && source[name].length > 0;
  const lines = [];
  const problems = [];

  if (source[MARKER] === ENVIRONMENT_NAME) {
    lines.push(`${MARKER}: ${ENVIRONMENT_NAME} (jobbet kører i det beskyttede environment)`);
  } else {
    lines.push(`${MARKER}: ${isSet(MARKER) ? "forkert værdi" : "mangler"}`);
    problems.push(`jobbet kører ikke i environmentet ${ENVIRONMENT_NAME} (variablen ${MARKER} skal være ${ENVIRONMENT_NAME} og må kun findes på environment-niveau)`);
  }

  const missing = [];
  for (const name of REQUIRED_SECRETS) {
    const ok = isSet(name);
    lines.push(`${name} (fra secrets.${SECRET_SOURCES[name]}): ${ok ? "sat" : "mangler"}`);
    if (!ok) missing.push(SECRET_SOURCES[name]);
  }
  if (missing.length > 0) problems.push(`manglende environment-secrets i ${ENVIRONMENT_NAME}: ${missing.join(", ")}`);

  return { ok: problems.length === 0, lines, problems };
}
