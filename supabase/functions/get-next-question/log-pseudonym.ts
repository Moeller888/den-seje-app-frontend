// A pseudonym for the pupil in the FORMAT_MIX log lines, so the shadow evaluation can tell pupils apart
// and leave out known test accounts (the CI test student, the owner's test class) — without the log
// carrying the pupil's id.
//
// WHAT IT IS
// The first 16 hex characters (64 bits) of SHA-256("laerlig-format-mix-log-v1:" + student_id). One-way;
// the prefix keeps it from matching a hash of the bare id made for any other purpose. The same pupil
// always gets the same value, so lines can be grouped per pupil.
//
// WHAT IT IS NOT
// Not anonymous: there is no secret, so anyone who already holds a list of student ids (an operator with
// database access) can compute the pseudonym for each and link the lines. That is deliberate — it is how
// the evaluation excludes test accounts — and it adds nothing such a person could not already read in
// the database. The log still holds no id, name, e-mail, answer or key.
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
