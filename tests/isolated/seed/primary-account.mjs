// The primary test pupil's standing state, created before the existing suite runs (D-110).
//
// In production the primary test pupil is a long-lived account, and some specs rely on what it has
// accumulated rather than setting it up themselves. global-setup.ts creates a missing account but
// cannot give a fresh one that history, so an isolated run (every account is new) provisions it here,
// on the local stack only, before Playwright starts. Each item names the spec that depends on it:
//
//   owner teacher   password-help.spec.ts captures the pupil's teacher_id and restores it, so the
//                   pupil must belong to a teacher; teacher-password-reset.spec.ts needs that teacher
//                   NOT to be the test teacher. Same rule as the E2E slots' password-less owner
//                   (tests/e2e-slot.mjs): nobody can sign in as it.
//   1 correct answer hub-avatar-living.spec.ts test 2 deletes first_correct and expects the hub to
//                   re-unlock it, which evaluate_achievements does only at correct_answers >= 1.
//   owns aura-gold  avatar-hair-decoupling.spec.ts golden "shop first item preview": the first shop
//                   item (legendary, lowest price) is owned by the production pupil, so its card is
//                   drawn as owned (.shop-card.is-owned, opacity 0.68) in the committed baseline.
//
// Nothing here is read from production: the facts are what those specs and baselines require. The
// owner gets a synthetic @e2e.invalid address like every other isolated account.
import { SYNTHETIC_EMAIL_DOMAIN } from "../isolation-guard.mjs";

export const OWNED_ITEM_ID = "aura-gold";

const fail = (step, error) => { throw new Error(`primary-account: ${step} failed — ${error?.message ?? error}`); };

// `admin` is a service-role supabase-js client for the LOCAL stack (the caller checks the URL).
export async function provisionPrimaryAccount(admin, { runId, studentEmail, studentPassword }) {
  if (!/^[a-z0-9]+$/i.test(String(runId ?? ""))) throw new Error("primary-account: runId missing");
  if (!String(studentEmail ?? "").toLowerCase().endsWith("@" + SYNTHETIC_EMAIL_DOMAIN)) throw new Error("primary-account: the pupil must be on @" + SYNTHETIC_EMAIL_DOMAIN);

  const { data: item, error: itemErr } = await admin.from("shop_items").select("id").eq("id", OWNED_ITEM_ID).maybeSingle();
  if (itemErr) fail("shop item lookup", itemErr);
  if (!item) fail("shop item lookup", `${OWNED_ITEM_ID} is not in the catalog`);

  const owner = await admin.auth.admin.createUser({ email: `owner-${runId}@${SYNTHETIC_EMAIL_DOMAIN}`, email_confirm: true });
  if (owner.error || !owner.data?.user?.id) fail("owner createUser", owner.error ?? "no user");
  const ownerId = owner.data.user.id;
  const { error: ownerProfileErr } = await admin.from("profiles").upsert(
    { id: ownerId, role: "teacher", full_name: "Isoleret ejer-lærer", equipped_slots: {}, active_theme: "default" },
    { onConflict: "id" },
  );
  if (ownerProfileErr) fail("owner profile", ownerProfileErr);

  const pupil = await admin.auth.admin.createUser({ email: studentEmail, password: studentPassword, email_confirm: true });
  if (pupil.error || !pupil.data?.user?.id) fail("pupil createUser", pupil.error ?? "no user");
  const pupilId = pupil.data.user.id;
  const { error: pupilProfileErr } = await admin.from("profiles").upsert(
    { id: pupilId, role: "student", teacher_id: ownerId, full_name: "Test Elev Primary", equipped_slots: {}, active_theme: "default" },
    { onConflict: "id" },
  );
  if (pupilProfileErr) fail("pupil profile", pupilProfileErr);

  const { error: progressErr } = await admin.from("student_progress").upsert(
    { student_id: pupilId, correct_answers: 1, total_correct_answers: 1 },
    { onConflict: "student_id" },
  );
  if (progressErr) fail("pupil progress", progressErr);

  const { error: itemGrantErr } = await admin.from("user_items").insert({ user_id: pupilId, item_id: OWNED_ITEM_ID });
  if (itemGrantErr) fail("pupil item", itemGrantErr);

  return { ownerId, pupilId };
}
