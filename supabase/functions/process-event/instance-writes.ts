// Server-owned writes to question_instances from process-event.
//
// WHY THESE GO THROUGH THE ADMIN CLIENT
// question_instances has RLS enabled with SELECT and INSERT policies but no UPDATE policy. An UPDATE
// through the pupil's own client is therefore filtered to zero rows — and PostgREST reports that as
// success (error = null). The long-answer save and the misconception signal were both lost that way.
// Pupils are deliberately NOT given an UPDATE policy: they must never be able to change answered,
// correct_answer, repeat_count, rewards-related fields or another pupil's rows. Instead process-event,
// after it has verified that the instance belongs to the signed-in pupil, makes these writes itself
// through the backend admin client (see makeAdminClient in index.ts and ./text-answer-rpc.ts).
//
// SAFETY RULES ENFORCED HERE
//   * Every update is scoped to BOTH id = the instance AND student_id = the verified user.id, even
//     though ownership has already been checked — defence in depth against a wrong id.
//   * The result is proven, not assumed: the update returns the touched ids (.select("id")) and only
//     exactly one row counts as success. Zero rows, more than one row, a DB error or an unexpected
//     response are all failures. `error === null` alone is never taken as success.
//   * makeAdminClient failures (a broken key configuration) propagate from updateOwnInstance; there is
//     no fallback to the user client anywhere in this module.
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite can import exactly what
// the Edge Function runs (same arrangement as ./text-answer-rpc.ts).

export type UpdateResponse = { data: unknown; error: unknown };
export type UpdateClient = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: unknown) => {
        eq: (column: string, value: unknown) => {
          select: (columns: string) => PromiseLike<UpdateResponse>;
        };
      };
    };
  };
};

export type InstanceScope = { instanceId: string; studentId: string };

export type InstanceWriteFailure =
  | "invalid_scope"
  | "db_error"
  | "no_row"
  | "multiple_rows"
  | "unexpected_result"
  | "admin_client_error";

export type InstanceWriteResult =
  | { ok: true; rows: 1 }
  | { ok: false; reason: InstanceWriteFailure; rows: number | null; code: string | null };

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function errorCode(error: unknown): string | null {
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return null;
}

// Updates exactly one of the pupil's own question_instances rows through a freshly built admin client.
export async function updateOwnInstance(
  makeAdminClient: () => UpdateClient,
  scope: InstanceScope,
  values: Record<string, unknown>,
): Promise<InstanceWriteResult> {
  if (!isNonEmptyString(scope?.instanceId) || !isNonEmptyString(scope?.studentId)
      || !values || typeof values !== "object" || Object.keys(values).length === 0
      || Object.values(values).some((v) => v === undefined)) {
    return { ok: false, reason: "invalid_scope", rows: null, code: null };
  }

  const admin = makeAdminClient();
  const { data, error } = await admin
    .from("question_instances")
    .update(values)
    .eq("id", scope.instanceId)
    .eq("student_id", scope.studentId)
    .select("id");

  if (error) return { ok: false, reason: "db_error", rows: null, code: errorCode(error) };
  if (!Array.isArray(data)) return { ok: false, reason: "unexpected_result", rows: null, code: null };
  if (data.length === 1) return { ok: true, rows: 1 };
  return { ok: false, reason: data.length === 0 ? "no_row" : "multiple_rows", rows: data.length, code: null };
}

export type MisconceptionSignal = InstanceScope & { signal: string };
export type ErrorLogger = (label: string, detail: string) => void;

// The misconception signal is written AFTER the answer RPC has already marked the instance answered
// and (maybe) paid out XP/coins. Failing the request at that point would show the pupil an error for
// an answer that was in fact accepted, so this write is NON-FATAL: it never throws and never changes
// the answer response. It is not silent either — every failure is logged as one structured line with
// the instance id and the failure reason (no user id, no key, no answer text). No retry.
export async function recordMisconceptionSignal(
  makeAdminClient: () => UpdateClient,
  write: MisconceptionSignal,
  logError: ErrorLogger = (label, detail) => console.error(label, detail),
): Promise<InstanceWriteResult> {
  let result: InstanceWriteResult;
  try {
    result = await updateOwnInstance(
      makeAdminClient,
      { instanceId: write?.instanceId, studentId: write?.studentId },
      { misconception_signal: write?.signal },
    );
  } catch {
    result = { ok: false, reason: "admin_client_error", rows: null, code: null };
  }

  if (!result.ok) {
    logError("INSTANCE WRITE FAILED:", JSON.stringify({
      field: "misconception_signal",
      instance_id: typeof write?.instanceId === "string" ? write.instanceId : null,
      reason: result.reason,
      rows: result.rows,
      code: result.code,
      fatal: false,
    }));
  }
  return result;
}
