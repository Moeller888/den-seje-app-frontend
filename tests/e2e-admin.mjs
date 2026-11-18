// THE ONLY PLACE IN THE PLAYWRIGHT SUITE THAT TURNS THE SERVICE-ROLE KEY INTO A CLIENT.
//
//   verifyAndOpenAdmin()   global-setup only: resolve the account registry (A1, no network), verify the
//                          four accounts read-only (A2), publish E2E_VERIFIED_ACCOUNTS for the workers,
//                          and return the GUARDED client (A3) for the setup's own resets. Its one
//                          repair: a marked pupil left with teacher_id = null by an interrupted run is
//                          re-attached to its marked teacher, then everything is verified again.
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
  ACCOUNT_KINDS, E2EAccountError, EXPECTED_ROLE, publishVerified, readVerified, resolveAccountRegistry, verifyAccounts,
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

// Controlled recovery of a DETACHED marked pupil (teacher_id = null, left behind when a run is killed
// inside password-help test 4 before its finally-block). Only for a plan from verifyAccounts(): every
// account was found, carries its exact marker and role, and the only problem is that relation. The
// write goes through the guarded client (profiles UPDATE, id filter, teacher_id = a verified teacher),
// and the caller re-verifies everything afterwards. An unmarked account can never be part of a plan.
async function repairDetachedPupils(raw, plan, log) {
  const roles = Object.freeze(Object.fromEntries(ACCOUNT_KINDS.map((k) => [plan.ids[k], EXPECTED_ROLE[k]])));
  const provisional = Object.freeze({ v: plan.v, slot: plan.slot, ids: plan.ids, roles });
  const guarded = guardAdminClient(raw, provisional, { confirm: async () => {} });
  for (const { kind, id, teacherId } of plan.pupils) {
    const { error } = await guarded.from("profiles").update({ teacher_id: teacherId }).eq("id", id);
    if (error) throw new E2EAccountError([`${kind} (${id}): teacher_id kunne ikke gendannes`]);
    log(`[e2e-admin] ${kind} (${id}) had teacher_id = null (interrupted run); restored to its marked teacher ${teacherId}`);
  }
}

export async function verifyAndOpenAdmin(env = process.env, { rawClient = rawServiceClient, log = console.log } = {}) {
  const registry = resolveAccountRegistry(env); // A1: throws before any network call
  const raw = rawClient(env);
  let verified;
  try {
    verified = await verifyAccounts(registry, readDeps(raw)); // A2: read-only, throws on any problem
  } catch (err) {
    if (!(err instanceof E2EAccountError) || !err.repair) throw err;
    await repairDetachedPupils(raw, err.repair, log);
    // Full re-verification: anything still wrong (or wrong again) stops the run. No second repair.
    verified = await verifyAccounts(registry, readDeps(raw));
  }
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
