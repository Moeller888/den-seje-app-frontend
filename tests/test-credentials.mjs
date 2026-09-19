// THE ONE PLACE E2E CREDENTIALS ARE READ.
//
// Every test-account password used by the Playwright suite comes from the environment — a gitignored
// .env locally, GitHub Actions secrets in CI. Nothing here has a default: a missing or blank value
// throws, so a run can never quietly fall back to a value that is readable in the public repository.
//
// Plain ESM with no dependencies, so the TypeScript specs, tests/global-setup.ts and the Node unit
// tests share one implementation.
import { createHmac } from "node:crypto";

// The secrets the suite cannot run without. global-setup names all missing ones at once, before it
// touches any account or row.
export const REQUIRED_E2E_SECRETS = Object.freeze([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TEST_STUDENT_EMAIL",
  "TEST_STUDENT_PASSWORD",
  "TEST_TEACHER_PASSWORD",
  "TEST_STUDENT2_PASSWORD",
]);

// The temporary passwords the password-change specs set mid-test and restore afterwards. They are
// derived from the account's own secret rather than written in the spec: deterministic for a given
// secret (so retries and all three browsers agree), different from the base password (the "old
// password is rejected" assertions need that), and unknown to anyone without the secret.
export const DERIVED_PASSWORDS = Object.freeze({
  STUDENT_TEMP_PASSWORD:        Object.freeze({ base: "TEST_STUDENT_PASSWORD",  label: "password-reset:temp" }),
  STUDENT2_FRESH_TEMP_PASSWORD: Object.freeze({ base: "TEST_STUDENT2_PASSWORD", label: "teacher-password-reset:fresh-temp" }),
  STUDENT2_NEW_PASSWORD:        Object.freeze({ base: "TEST_STUDENT2_PASSWORD", label: "teacher-password-reset:new" }),
});

export function readRequiredSecret(name, env = process.env) {
  const value = env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `${name} is missing or empty. Set it in .env locally or as a GitHub Actions secret (see .env.example).`,
    );
  }
  return value;
}

export function missingSecrets(names = REQUIRED_E2E_SECRETS, env = process.env) {
  return names.filter((name) => typeof env[name] !== "string" || env[name].trim() === "");
}

export function derivePassword(baseSecret, label) {
  if (typeof baseSecret !== "string" || baseSecret === "") {
    throw new Error("derivePassword: base secret is missing or empty");
  }
  if (typeof label !== "string" || label === "") {
    throw new Error("derivePassword: label is missing or empty");
  }
  // 24 base64url characters of an HMAC-SHA256, plus one character from each class so the value
  // satisfies any upper/lower/digit/symbol password policy.
  const mac = createHmac("sha256", baseSecret).update(label).digest("base64url").slice(0, 24);
  return `${mac}Aa1!`;
}

export function derivedPassword(name, env = process.env) {
  const spec = DERIVED_PASSWORDS[name];
  if (!spec) throw new Error(`derivedPassword: unknown derived password ${name}`);
  return derivePassword(readRequiredSecret(spec.base, env), spec.label);
}
