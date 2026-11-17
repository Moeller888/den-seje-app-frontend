// The isolated run's four E2E accounts and the primary pupil's standing state, created before the
// existing suite runs (D-110, A2).
//
// tests/global-setup.ts never creates an account: it verifies, read-only, that the four accounts of
// the account registry (tests/e2e-accounts.mjs) exist and carry app_metadata.laerlig_e2e, and stops
// otherwise. In production those accounts are provisioned once, separately. An isolated run starts
// from an empty local stack, so this seed — on the checked local stack only — provisions them exactly
// as the registry expects, marker, roles and relations included:
//
//   owner     teacher, NO password (nobody can sign in as it); address ownerAddressFor(teacher, 0).
//             password-help.spec.ts captures the pupil's teacher_id and restores it, so the pupil must
//             belong to a teacher; teacher-password-reset.spec.ts needs that teacher NOT to be the
//             test teacher.
//   teacher   teacher (TEST_TEACHER_EMAIL), the teacher-flow specs.
//   student2  student (TEST_STUDENT2_EMAIL) under the test teacher — its only pupil.
//   primary   student (TEST_STUDENT_EMAIL) under the owner — its only pupil. Plus the state some specs
//             rely on rather than set up themselves:
//     1 correct answer hub-avatar-living.spec.ts test 2 deletes first_correct and expects the hub to
//                   re-unlock it, which evaluate_achievements does only at correct_answers >= 1.
//     owns aura-gold  avatar-hair-decoupling.spec.ts golden "shop first item preview": the first shop
//                   item (legendary, lowest price) is owned by the production pupil, so its card is
//                   drawn as owned (.shop-card.is-owned, opacity 0.68) in the committed baseline.
//
// Nothing here is read from production. Every address is a synthetic @e2e.invalid one.
import { SYNTHETIC_EMAIL_DOMAIN } from "../isolation-guard.mjs";
import { MARKER_KEY, expectedMarker, ownerAddressFor } from "../../e2e-accounts.mjs";

export const OWNED_ITEM_ID = "aura-gold";

const fail = (step, error) => { throw new Error(`primary-account: ${step} failed — ${error?.message ?? error}`); };
const synthetic = (v) => String(v ?? "").toLowerCase().endsWith("@" + SYNTHETIC_EMAIL_DOMAIN) && String(v).indexOf("@") > 0;

// `admin` is a raw service-role supabase-js client for the LOCAL stack (the caller checks the URL).
export async function provisionPrimaryAccount(admin, {
  runId, studentEmail, studentPassword, teacherEmail, teacherPassword, student2Email, student2Password,
}) {
  if (!/^[a-z0-9]+$/i.test(String(runId ?? ""))) throw new Error("primary-account: runId missing");
  for (const [name, v] of [["the pupil", studentEmail], ["the teacher", teacherEmail], ["student2", student2Email]]) {
    if (!synthetic(v)) throw new Error(`primary-account: ${name} must be on @${SYNTHETIC_EMAIL_DOMAIN}`);
  }
  for (const [name, v] of [["pupil", studentPassword], ["teacher", teacherPassword], ["student2", student2Password]]) {
    if (typeof v !== "string" || v.length < 20) throw new Error(`primary-account: the ${name} password must be a generated password`);
  }

  const { data: item, error: itemErr } = await admin.from("shop_items").select("id").eq("id", OWNED_ITEM_ID).maybeSingle();
  if (itemErr) fail("shop item lookup", itemErr);
  if (!item) fail("shop item lookup", `${OWNED_ITEM_ID} is not in the catalog`);

  // Slot 0: isolated runs have no E2E slots (run-suite.mjs removes E2E_SLOT).
  const createMarked = async (kind, email, password) => {
    const attrs = { email, email_confirm: true, app_metadata: { [MARKER_KEY]: expectedMarker(0, kind) } };
    if (password !== null) attrs.password = password;
    const res = await admin.auth.admin.createUser(attrs);
    if (res.error || !res.data?.user?.id) fail(`${kind} createUser`, res.error ?? "no user");
    return res.data.user.id;
  };
  const profile = async (kind, row) => {
    const { error } = await admin.from("profiles").upsert(row, { onConflict: "id" });
    if (error) fail(`${kind} profile`, error);
  };

  const ownerId = await createMarked("owner", ownerAddressFor(teacherEmail, 0), null);
  await profile("owner", { id: ownerId, role: "teacher", full_name: "Isoleret ejer-lærer", equipped_slots: {}, active_theme: "default" });

  const teacherId = await createMarked("teacher", teacherEmail, teacherPassword);
  await profile("teacher", { id: teacherId, role: "teacher", full_name: "Test Lærer Auto", equipped_slots: {}, active_theme: "default" });

  const student2Id = await createMarked("student2", student2Email, student2Password);
  await profile("student2", { id: student2Id, role: "student", teacher_id: teacherId, full_name: "Test Elev Auto", equipped_slots: {}, active_theme: "default" });

  const pupilId = await createMarked("primary", studentEmail, studentPassword);
  await profile("pupil", { id: pupilId, role: "student", teacher_id: ownerId, full_name: "Test Elev Primary", equipped_slots: {}, active_theme: "default" });

  const { error: progressErr } = await admin.from("student_progress").upsert(
    { student_id: pupilId, correct_answers: 1, total_correct_answers: 1 },
    { onConflict: "student_id" },
  );
  if (progressErr) fail("pupil progress", progressErr);

  const { error: itemGrantErr } = await admin.from("user_items").insert({ user_id: pupilId, item_id: OWNED_ITEM_ID });
  if (itemGrantErr) fail("pupil item", itemGrantErr);

  return { ownerId, pupilId, teacherId, student2Id };
}
