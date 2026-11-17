// THE ONLY PLACE IN THE PLAYWRIGHT SUITE THAT TURNS THE SERVICE-ROLE KEY INTO A CLIENT.
//
//   verifyAndOpenAdmin()   global-setup only: resolve the account registry (A1, no network), verify the
//                          four accounts read-only (A2), publish E2E_VERIFIED_ACCOUNTS for the workers,
//                          and return the GUARDED client (A3) for the setup's own resets.
//   createE2EAdminClient() every spec: the guarded client for the accounts global-setup verified.
//                          It throws when E2E_VERIFIED_ACCOUNTS is missing or malformed, and before its
//                          first write it re-runs the read-only verification and requires the very same
//                          four ids — so a spec run without global-setup, or with a hand-made record,
//                          can never write to an account that is not a marked test account.
//
// tests/unit/e2e-account-safety-contract.test.mjs pins that no other file under tests/ (outside
// tests/isolated, which talks to a throw-away loopback stack) reads SUPABASE_SERVICE_ROLE_KEY or sets
// E2E_VERIFIED_ACCOUNTS, and that every spec calls createE2EAdminClient() with no arguments.
// The `rawClient` option exists only for tests/unit/e2e-admin.test.mjs (an in-memory fake client).
import { createClient } from "@supabase/supabase-js";
import { readRequiredSecret } from "./test-credentials.mjs";
import {
  ACCOUNT_KINDS, E2EAccountError, publishVerified, readVerified, resolveAccountRegistry, verifyAccounts,
} from "./e2e-accounts.mjs";
import { guardAdminClient } from "./e2e-guard.mjs";

function rawServiceClient(env) {
  const url = readRequiredSecret("SUPABASE_URL", env);
  const key = readRequiredSecret("SUPABASE_SERVICE_ROLE_KEY", env);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Read-only dependencies for verifyAccounts(): nothing here can write.
function readDeps(raw) {
  return {
    listUsers: (params) => raw.auth.admin.listUsers(params),
    selectProfilesByIds: (ids) => raw.from("profiles").select("id, role, teacher_id").in("id", ids),
    selectPupilsOfTeachers: (ids) => raw.from("profiles").select("id, teacher_id").in("teacher_id", ids),
  };
}

export async function verifyAndOpenAdmin(env = process.env, { rawClient = rawServiceClient } = {}) {
  const registry = resolveAccountRegistry(env); // A1: throws before any network call
  const raw = rawClient(env);
  const verified = await verifyAccounts(registry, readDeps(raw)); // A2: read-only, throws on any problem
  publishVerified(env, verified);
  // Verified a moment ago, by this very call: nothing further to confirm.
  return { admin: guardAdminClient(raw, verified, { confirm: async () => {} }), verified, registry };
}

export function createE2EAdminClient(env = process.env, { rawClient = rawServiceClient } = {}) {
  const verified = readVerified(env);
  const registry = resolveAccountRegistry(env); // the addresses must still be valid for this slot
  const raw = rawClient(env);
  const confirm = async () => {
    const fresh = await verifyAccounts(registry, readDeps(raw));
    const drift = ACCOUNT_KINDS.filter((k) => fresh.ids[k] !== verified.ids[k]);
    if (drift.length > 0) throw new E2EAccountError([`E2E_VERIFIED_ACCOUNTS svarer ikke til de markerede konti (${drift.join(", ")})`]);
  };
  return guardAdminClient(raw, verified, { confirm });
}
