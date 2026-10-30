// THE SPECS THAT NEED NO SUPABASE PROJECT AT ALL.
//
// WHY: playwright.config.ts runs tests/global-setup.ts before ANY spec, and global-setup resets the
// E2E slot's live test accounts (question_instances deleted, profile fields rewritten). A local run
// of even one of the specs below therefore reset the slot-0 accounts that CI was using at the same
// moment. These specs never needed that: each serves the checkout from its own localhost server and
// answers every *.supabase.co request itself (fixture or abort), or proves it made no off-host
// request at all.
//
// playwright.offline.config.ts runs exactly this list with NO globalSetup and NO .env, so an offline
// run touches no database, holds no credentials, and can run beside any live E2E run.
// playwright.config.ts is unchanged and still runs these specs as part of the full suite.
//
// ADMISSION RULES (pinned per file by tests/unit/offline-e2e-config.test.mjs):
//   - serves the checkout from its own http server on localhost;
//   - routes every *.supabase.co request, or collects off-host requests (offHost) and asserts them;
//   - does not read PROD, process.env, dotenv, tests/helpers or @supabase/supabase-js.
// A spec that cannot meet all three stays out of this list and keeps running under global-setup.

export const OFFLINE_SPECS = Object.freeze([
  "avatar-r2-blink-frames.spec.ts",
  "avatar-r2-expression-frames.spec.ts",
  "avatar-r2-eyes.spec.ts",
  "avatar-r2-face.spec.ts",
  "avatar-r2-fallback.spec.ts",
  "avatar-r2-headwear.spec.ts",
  "avatar-r2-observability.spec.ts",
  "avatar-r2-shop-preview.spec.ts",
  "avatar-r2-torso-force-c2.spec.ts",
  "avatar-r2-torso-golden.spec.ts",
  "landing.spec.ts",
  "login-page.spec.ts",
  "teacher-first-run.spec.ts",
]);

// Environment variables an offline run must not carry, even when the calling shell exported them.
// Nothing offline needs them, and without them no spec could reach a live account by accident.
export function isCredentialVar(name) {
  if (typeof name !== "string") return false;
  if (name === "SUPABASE_SERVICE_ROLE_KEY") return true;
  if (name.startsWith("TEST_") && (name.endsWith("_PASSWORD") || name.endsWith("_EMAIL"))) return true;
  return false;
}
