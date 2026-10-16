// The server-side read process-event grades against: one question instance with its answer key and
// its question (format, type, content incl. accepted_answers, metadata incl. review_text source).
//
// WHY THIS IS A BACKEND READ
// The key must never be readable by the pupil before they answer (audit finding E1, 2026-10-16).
// question_instances.correct_answer and questions.content are therefore being taken away from the
// client roles (migration step B), and the only reader left is the server. This read runs through the
// backend admin client — no pupil Authorization header, no session — after the pupil has been
// authenticated, and process-event checks ownership (isInstanceOwner → 403) on the returned
// student_id BEFORE anything from the row is used or returned. Nothing from a foreign row ever leaves
// the function.
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite can import exactly what the
// Edge Function runs (same arrangement as ./text-answer-rpc.ts and ./instance-writes.ts).

export type ReadResponse = { data: unknown; error: unknown };
// supabase-js parses the select string (with its embedded questions(...)) at type level; matching
// that against a structural return type is "excessively deep" for the checker (TS2589). The chain is
// therefore typed loosely after select(); the runtime chain is exactly the one below.
export type ReadClient = {
  from: (table: string) => {
    // deno-lint-ignore no-explicit-any
    select: (columns: string) => any;
  };
};

export const GRADING_COLUMNS = `
        correct_answer,
        student_id,
        questions (
          answer_format,
          answer_type,
          content,
          metadata
        )
      `;

// Reads one instance by id through a freshly built admin client. makeAdminClient is invoked only
// here; if it throws (missing or broken key configuration), so does this — never a fallback to the
// user client.
export async function readInstanceForGrading(
  makeAdminClient: () => ReadClient,
  instanceId: string,
): Promise<ReadResponse> {
  const admin = makeAdminClient();
  const result: ReadResponse = await admin
    .from("question_instances")
    .select(GRADING_COLUMNS)
    .eq("id", instanceId)
    .maybeSingle();
  return result;
}
