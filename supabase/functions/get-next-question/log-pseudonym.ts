// A pseudonym for the pupil in the FORMAT_MIX log lines, so the shadow evaluation can tell pupils apart
// and leave out known test accounts (the CI test student, the owner's test class) — without the log
// carrying the pupil's id.
//
// WHAT IT IS
// The first 16 hex characters (64 bits) of SHA-256("laerlig-format-mix-log-v1:" + student_id). One-way;
// the prefix keeps it from matching a hash of the bare id made for any other purpose. The same pupil
// always gets the same value, so lines can be grouped per pupil.
//
// WHAT IT IS NOT — THE DATA IS NOT ANONYMOUS
// This is PSEUDONYMISED personal data (GDPR art. 4(5)), not anonymous data, and must be handled as
// personal data. There is no secret, so anyone who holds a list of student ids can compute each
// pupil's pseudonym and link every line to that pupil. That is deliberate — it is how the evaluation
// excludes known test accounts — and it gives nothing such a person could not already read in the
// database. The log still holds no id, name, e-mail, answer or key.
//
// WHO CAN LINK IT, AND FOR HOW LONG (2026-10-22)
//   * Read access to Edge Function logs = members of the Supabase organisation (dashboard Logs Explorer,
//     Management API, the Supabase MCP). Pupils and teachers have none.
//   * Linking also needs student ids: the same operators (database / service role). A teacher can read
//     their own pupils' ids through RLS but has no log access.
//   * Retention is Supabase's log retention for the plan — the project is on the free plan (1 day at
//     the time of writing); logs stay in Supabase (project region eu-west-1). An evaluation that needs
//     more than a day must export aggregates, never raw lines with pseudonyms, outside Supabase.
//
// Pure TypeScript with no Deno or network imports (Web Crypto exists in Deno and Node), so the Node unit
// suite tests exactly what the Edge Function runs.

export const PUPIL_LOG_HASH_PREFIX = "laerlig-format-mix-log-v1:";
export const PUPIL_LOG_HASH_HEX_LENGTH = 16;

export async function pupilLogHash(studentId: string): Promise<string> {
  if (typeof studentId !== "string" || studentId.length === 0) throw new Error("pupilLogHash: student id required");
  const bytes = new TextEncoder().encode(PUPIL_LOG_HASH_PREFIX + studentId);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  let hex = "";
  for (const b of digest) hex += b.toString(16).padStart(2, "0");
  return hex.slice(0, PUPIL_LOG_HASH_HEX_LENGTH);
}
