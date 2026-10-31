// The server-owned half of get-next-question: creating a question instance (an assignment).
//
// WHY THE ASSIGNMENT IS A BACKEND WRITE
// A question_instances row carries the answer key the answer path grades against: process-event
// evaluates short text against question_instances.correct_answer, and process_question_attempt
// compares MC / number answers to the same column, then awards XP, coins, streak and quests. While a
// pupil could INSERT that row through their own client (RLS checked only student_id = auth.uid()),
// they could choose correct_answer — and answered, was_correct, teacher_score, repeat_count … — for
// any question, active or not, and then be paid for "answering" their own key. The rule is: the
// pupil submits an answer; the server decides the key, the verdict and the reward.
//
// So the row is written here, through the backend admin client, after get-next-question has
// authenticated the pupil and chosen the question server-side (get_unserved_questions: active,
// grade/domain scope, not yet served). A separate D-110 migration then removes INSERT on
// question_instances from anon and authenticated, so no client can create an instance at all.
//
// SAFETY RULES ENFORCED HERE
//   * student_id is the caller's verified user.id and correct_answer is the server-normalised key of
//     the chosen question; nothing comes from the request body.
//   * The written columns are exactly the ones get-next-question has always written; every other
//     column keeps its database default (answered = false, no verdict, no teacher fields).
//   * The admin client never receives the pupil's Authorization header and keeps no session.
//   * If the admin client cannot be built (missing or broken key configuration), the error
//     propagates. There is deliberately no fallback to the user client.
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite can import exactly what
// the Edge Function runs (same arrangement as process-event/text-answer-rpc.ts).

export type InsertResponse = { data: unknown; error: unknown };
export type InsertClient = {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => {
      select: (columns: string) => {
        limit: (count: number) => PromiseLike<InsertResponse>;
      };
    };
  };
};

// A server-side, single-request client that never stores or refreshes a session. Global headers are
// intentionally absent — see "SAFETY RULES" above.
export const ADMIN_CLIENT_OPTIONS = Object.freeze({
  auth: Object.freeze({ persistSession: false, autoRefreshToken: false }),
});

export type QuestionAssignment = {
  studentId: string;
  questionId: string;
  correctAnswer: unknown;
  nowIso: string;
};

// Creates one question instance for the signed-in pupil through a freshly built admin client.
// makeAdminClient is invoked only here, so the backend key is resolved only when an instance is
// actually written; if it throws, so does this.
export async function insertQuestionInstance(
  makeAdminClient: () => InsertClient,
  assignment: QuestionAssignment,
): Promise<InsertResponse> {
  const admin = makeAdminClient();
  return await admin
    .from("question_instances")
    .insert({
      student_id: assignment.studentId,
      question_id: assignment.questionId,
      answered: false,
      correct_answer: assignment.correctAnswer,
      difficulty_at_time: 1,
      mastery_snapshot: 1,
      next_review_at: assignment.nowIso,
    })
    // repeat_count is read back, not assumed: get-next-question derives round_no from it (D-266, H5).
    .select("id, repeat_count")
    .limit(1);
}
