import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import { publishableKey, serviceKey } from "../_shared/supabase-keys.ts";
import { toPublicQuestion } from "../_shared/question-dto.ts";
import { ADMIN_CLIENT_OPTIONS, insertQuestionInstance } from "./instance-insert.ts";
import { deriveQuestionScope } from "./scope.ts";
import { openInstanceMatches, resolveObjectiveTargeting } from "./objective-target.ts";
import { checkRequestedStep, historyFromRows, nextStep, stepOf, type SequenceDecision } from "../_shared/learning-sequence.ts";
import { sortByWave } from "./wave-order.ts";
import { resolveMixEngine } from "./format-mix.ts";
import { loadFormatMixPlan, type MixReadClient } from "./mix-flow.ts";
import { servableWireFormat } from "../_shared/interaction-kinds.ts";
import { pupilLogHash } from "./log-pseudonym.ts";
import { createMatchKey, parseMatchPairs } from "../_shared/match-pairs.ts";
import { createOrderKey, parseOrderContent } from "../_shared/order-items.ts";

// Formats whose instance key (question_instances.correct_answer) lays out what the browser sees: Match
// par (the shuffled right column) and Rækkefølge (the shuffled presentation; the facit is the authored
// order). Only these make the extra backend key read below; every other format reads exactly as before.
const KEYED_FORMATS: ReadonlySet<string> = new Set(["match", "order"]);
import {
  CANARY_ALLOWLIST_ENV, LEVEL_ENGINE_CANARY, chooseSelectionRoute, loadLevelPlan, resolveLevelEngineForStudent,
  type LevelReadClient,
} from "./level-flow.ts";
import { SERVED_SNAPSHOT_ENV, deliveredQuestion, deliveryProposal, servedSnapshotEnabled } from "./served-snapshot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// The backend client: no pupil Authorization header, no session. If the key cannot be resolved this
// throws — never a fallback to the user client. It is used for exactly two things:
//   * creating a question instance (./instance-insert.ts), and
//   * the server-side reads that carry an answer key — the due/repeat instance with its question,
//     get_unserved_questions_for_student and request_repeat_question_for_student — always scoped to
//     the verified student_id. What leaves this function is only toPublicQuestion's payload.
function makeAdminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), ADMIN_CLIENT_OPTIONS);
}

function mapAnswerFormat(format: string | null) {
  if (!format) return "mc";
  if (format.startsWith("mc")) return "mc";
  if (format.includes("number")) return "number";
  if (format.includes("text")) return "text";
  return "mc";
}

// The round the pupil is answering (D-266, H5): round_no = question_instances.repeat_count + 1 of the
// row this response serves, read from the database, never from the request. Every reopen raises
// repeat_count by exactly 1 (round guard, migration 20261030211428), so the first round is 1, a
// reopened instance gets the next number and fetching an open round again gives the same number.
// A row without a valid repeat_count is a server fault: it throws (500) instead of inventing a round.
function roundNoOf(instance: { id?: unknown; repeat_count?: unknown } | null | undefined): number {
  const repeatCount = instance?.repeat_count;
  if (typeof repeatCount !== "number" || !Number.isInteger(repeatCount) || repeatCount < 0) {
    throw new Error(`Invalid repeat_count on question instance ${String(instance?.id ?? "?")}`);
  }
  return repeatCount + 1;
}

// SERVER-SIDE ONLY. Validates the stored content and extracts the answer key that becomes
// question_instances.correct_answer. Its result must never be sent to the browser — the response is
// built from toPublicQuestion (../_shared/question-dto.ts) instead.
function normalizeContent(raw: any, answer_format: string) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid content");
  }

  const question = raw.question;
  let options = raw.options;
  const correct = raw.correct ?? null;

  if (typeof question !== "string" || question.trim().length === 0) {
    throw new Error("Missing question text");
  }

  if (answer_format === "mc") {
    if (!Array.isArray(options) || options.length < 2) {
      throw new Error("MC question missing valid options");
    }

    return { question, options, correct };
  }

  if (answer_format === "match") {
    // Match par: the key is this instance's shuffle of the right column, drawn here, once, and stored
    // as correct_answer (../_shared/match-pairs.ts). content.correct is not used.
    return { question, correct: createMatchKey(parseMatchPairs(raw).length) };
  }

  if (answer_format === "order") {
    // Rækkefølge: the key is this instance's shuffle of the PRESENTATION, drawn here, once, and stored as
    // correct_answer (../_shared/order-items.ts). The facit stays the authored order of content.items.
    return { question, correct: createOrderKey(parseOrderContent(raw).items.length) };
  }

  return { question, correct };
}

// A failed read of a Match par instance key is a backend error, not bad content: it must reach the outer
// catch as a visible 500 instead of being skipped like a row the client cannot render.
class InstanceKeyReadError extends Error {}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      publishableKey(),
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) throw new Error("Unauthorized");

    const student_id = user.id;

    // One backend client per request, built on first use (see makeAdminClient).
    let adminClient: ReturnType<typeof makeAdminClient> | null = null;
    const admin = () => (adminClient ??= makeAdminClient());

    const body = await req.json().catch(() => ({}));
    const sessionContext        = body?.session_context ?? null;
    const wavePhase             = (sessionContext?.wave_phase as string) ?? "challenge";
    const lastMisconceptionType = (sessionContext?.last_misconception_type as string | null) ?? null;
    const currentDifficultyBand = (body?.current_difficulty_band as number | null) ?? null;

    // The scope comes from the pupil's profile, which the pupil cannot write (./scope.ts). The request
    // contributes only the chosen subject; body.selected_grade is deliberately ignored.
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("active_domains, selected_grade")
      .eq("id", student_id)
      .maybeSingle();

    if (profileError) throw profileError;

    const scope = deriveQuestionScope(profileData, body?.subject);

    // Objective targeting (D-329, ./objective-target.ts): OFF unless the Edge secret
    // LAERLIGVERSE_OBJECTIVE_TARGETING is "on" AND the request names a learning_objective. It can only
    // NARROW the server-derived scope to one of its own domains; everything below then runs unchanged
    // on that narrower scope, except that the repeat step is skipped (E2 mini-scope, see the module).
    const targeting = resolveObjectiveTargeting(Deno.env.get("LAERLIGVERSE_OBJECTIVE_TARGETING"), body?.learning_objective, scope.subjectDomains);
    if (targeting.mode === "error") {
      return new Response(JSON.stringify({ error: targeting.error }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: targeting.status,
      });
    }
    if (targeting.mode === "on") {
      scope.subjectDomains = [targeting.objective];
      // The subject-switch release below must never release an open round of the TARGETED objective: the
      // objective is already validated as part of this pupil's own scope (D-338, found by the isolated
      // resume test — an objective outside HISTORY_DOMAINS was released and re-served on every request).
      if (!scope.releaseDomains.includes(targeting.objective)) scope.releaseDomains = [...scope.releaseDomains, targeting.objective];
      console.log("OBJECTIVE_TARGETING:", { objective: targeting.objective });
    }

    // Server-directed sequence (D-338, ../_shared/learning-sequence.ts): OFF unless the Edge secret
    // LAERLIGVERSE_SEQUENCE is "on", objective targeting is on, AND the request asks for it. The SERVER derives
    // the pupil's current step from its own history in the objective; the client may only name the step it
    // expects (a stale or manipulated one is refused). Off: no read, no change — the calls are as before.
    let sequence: Extract<SequenceDecision, { state: "step" }> | null = null;
    if (targeting.mode === "on" && Deno.env.get("LAERLIGVERSE_SEQUENCE") === "on" && body?.sequence === true) {
      const { data: historyRows, error: historyError } = await admin()
        .from("question_instances")
        .select("answered, was_correct, answered_at, questions!inner(learning_objective, metadata)")
        .eq("student_id", student_id)
        .eq("questions.learning_objective", targeting.objective);
      if (historyError) throw historyError;
      const decision = nextStep(historyFromRows(historyRows), Date.now());
      const requested = checkRequestedStep(body?.learning_step, decision);
      if (!requested.ok) {
        return new Response(JSON.stringify({ error: requested.error }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: requested.status,
        });
      }
      if (decision.state !== "step") {
        return new Response(JSON.stringify(decision.state === "complete"
          ? { step: "sequence_complete", learning_objective: targeting.objective, policy: decision.policy }
          : { step: "sequence_waiting", learning_objective: targeting.objective, learning_step: decision.step, due_at: decision.dueAt, policy: decision.policy }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
      sequence = decision;
      console.log("LEARNING_SEQUENCE:", { step: decision.step, policy: decision.policy });
    }
    const selectedGrade  = scope.grade;
    const subjectDomains = scope.subjectDomains;

    console.log("WAVE:", { wavePhase, lastMisconceptionType });
    console.log("GRADE:", { selectedGrade, currentDifficultyBand });
    console.log("DOMAINS:", { activeDomains: scope.activeDomains, subject: scope.subject, subjectDomains });

    // Fagskift: idx_one_open_question allows only ONE unanswered instance per student. If that
    // open instance belongs to the OTHER subject (and holds no saved answer), release it so the
    // student gets the chosen subject from the first question. Subject-level domains are passed —
    // not the teacher filter — so only a subject switch releases. Missing RPC = loud 500.
    const { data: releasedCount, error: releaseError } = await supabase.rpc(
      "release_open_question_outside",
      { p_domains: scope.releaseDomains }
    );

    if (releaseError) throw releaseError;
    if (typeof releasedCount === "number" && releasedCount > 0) {
      console.log("RELEASED_OPEN_QUESTION:", { subject: scope.subject, releasedCount });
    }

    // Which selection runs (step 2 explains the modes). Under "v2" every path — due, new, repeat — takes
    // the browser's answer_format from the interaction-kind registry, so a format the client cannot
    // show is skipped instead of falling back to "mc"; v1 keeps mapAnswerFormat unchanged.
    const mixEngine = resolveMixEngine(Deno.env.get("QUESTION_MIX_ENGINE"));
    // The level engine (Edge secret LEVEL_ENGINE, ./level-flow.ts). Unset = "off" = everything below
    // runs exactly as before; "v1" changes only step 2 (new questions) and step 3 (repeat RPC).
    // "canary" = "v1" only for the verified user on the allowlist LEVEL_ENGINE_CANARY_STUDENT_IDS, and
    // only if that user's own profile is a pupil; anyone else, or a bad list, gets "off" call for call.
    const levelFlag = Deno.env.get("LEVEL_ENGINE");
    let levelEngine = resolveLevelEngineForStudent(levelFlag, () => Deno.env.get(CANARY_ALLOWLIST_ENV), student_id);
    if (levelEngine === "v1" && levelFlag === LEVEL_ENGINE_CANARY) {
      const { data: roleRow, error: roleError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", student_id)
        .maybeSingle();
      if (roleError) throw roleError;
      if ((roleRow as { role?: unknown } | null)?.role !== "student") levelEngine = "off";
    }
    const route = chooseSelectionRoute(mixEngine, levelEngine);
    // L1 K1 (Edge secret K1_SERVED_SNAPSHOT, ./served-snapshot.ts): unset = everything below runs exactly
    // as before; "on" (only after migration 20261103110000) makes every response and the recorded delivered
    // version the same: new instances propose the row they are built from, open and repeated rounds are
    // served from their snapshot.
    const servedSnapshot = servedSnapshotEnabled(Deno.env.get(SERVED_SNAPSHOT_ENV));
    const wireFormat = (row: { answer_format?: unknown; answer_type?: unknown; content?: unknown }): string | null =>
      mixEngine === "v2" ? servableWireFormat(row) : mapAnswerFormat(row.answer_format as string | null);

    // Keyed formats only (Match par, Rækkefølge): the instance key (question_instances.correct_answer) lays out the shuffled
    // right column / presentation (../_shared/match-pairs.ts, order-items.ts). It is read here, on the backend client, scoped to the verified
    // student and ONLY for a KEYED_FORMATS row — every other format makes exactly the reads it made before
    // (release gate, docs/operations/level-engine-rollout.md §3.1). The key is never put into a response.
    // No row → null → toPublicQuestion throws → the row is skipped as unrenderable.
    const matchInstanceKey = async (format: string, instanceId: string): Promise<unknown> => {
      if (!KEYED_FORMATS.has(format)) return undefined;
      const { data: keyRows, error: keyError } = await admin()
        .from("question_instances")
        .select("correct_answer")
        .eq("id", instanceId)
        .eq("student_id", student_id)
        .limit(1);
      if (keyError) throw new InstanceKeyReadError(`Match key read failed for ${instanceId}: ${keyError.message}`);
      const keyRow = Array.isArray(keyRows) && keyRows.length > 0 ? keyRows[0] : null;
      return keyRow ? keyRow.correct_answer : null;
    };

    // K1 only (K1_SERVED_SNAPSHOT=on): the delivered version of an instance, read on the backend client,
    // scoped to the verified student — a separate read, so with the switch off every read is exactly as
    // before. A failed read is a backend error (500), never a silent fallback to the question row.
    const deliveredFor = async (instanceId: string) => {
      const { data: rows, error } = await admin()
        .from("question_instances")
        .select("served_snapshot")
        .eq("id", instanceId)
        .eq("student_id", student_id)
        .limit(1);
      if (error) throw new InstanceKeyReadError(`Served snapshot read failed for ${instanceId}: ${error.message}`);
      const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      return deliveredQuestion(row ? (row as { served_snapshot?: unknown }).served_snapshot : null);
    };

    // 🔥 1. DUE QUESTIONS (spaced repetition — wave awareness applied to ordering)
    // Due instances are served regardless of grade filter (backwards compatible).
    // Read through the backend client, scoped to the verified student: the embedded question carries
    // the key, which only the server may read.
    const { data: dueInstances, error: dueError } = await admin()
      .from("question_instances")
      .select(`
        id,
        repeat_count,
        next_review_at,
        questions (${targeting.mode === "on" ? "\n          learning_objective," : ""}
          content,
          answer_format,
          answer_type,
          metadata,
          is_active
        )
      `)
      .eq("student_id", student_id)
      .eq("answered", false)
      .lte("next_review_at", new Date().toISOString())
      .order("next_review_at", { ascending: true })
      .limit(10);

    if (dueError) throw dueError;

    // For due instances, apply wave ordering — spaced repetition still wins over new questions
    // but within the due pool we prefer wave-appropriate questions first.
    // No band filter for due instances (already committed, grade filter does not apply).
    // is_active=false questions are excluded — inactive questions must not be delivered.
    // Not filtered by subject here: an open instance from the other subject was already released
    // above. Any remaining open instance (same subject, or a long answer awaiting the teacher)
    // must be served — hiding it would block every new insert and dead-end at no_questions.
    const sortedDue = sortByWave(
      (dueInstances || []).filter((i: any) => i.questions && i.questions.is_active !== false),
      wavePhase,
      lastMisconceptionType
    );

    for (const instance of sortedDue) {
      if (!instance.questions) continue;
      // D-329 rule 3: an open instance of ANOTHER objective is neither served as this objective's
      // question nor released — explicit conflict, no side effect on the ordinary quiz. The objective is
      // the question row's (routing), whatever version K1 delivers.
      if (!openInstanceMatches(targeting, instance.questions.learning_objective)) {
        return new Response(JSON.stringify({ error: "open_question_other_objective" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 409,
        });
      }
      // D-338: in a sequence, an open round is resumed only in the step the server decided (the step tag is the
      // question row's, like the objective; K1 may deliver an earlier version of the content).
      if (sequence !== null && stepOf(instance.questions.metadata) !== sequence.step) {
        return new Response(JSON.stringify({ error: "open_question_other_step" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 409,
        });
      }
      // Outside the try: an invalid round, or a malformed delivered version, fails loud instead of being
      // skipped like bad content.
      const roundNo = roundNoOf(instance);
      // K1: an open round with a delivered version is served FROM it (a reload never shows a later edit);
      // without one it is served from the question row as before (version unknown).
      const delivered = servedSnapshot ? await deliveredFor(instance.id) : null;
      const q = delivered ?? instance.questions;

      try {
        const format = wireFormat(q);
        if (format === null) throw new Error(`Unservable format: ${q.answer_format}`);
        const instanceKey = delivered
          ? (KEYED_FORMATS.has(format) ? delivered.key : undefined)
          : await matchInstanceKey(format, instance.id);
        const pub = toPublicQuestion(q.content, format, q.metadata, instanceKey);

        return new Response(
          JSON.stringify({
            question_instance_id: instance.id,
            round_no: roundNo,
            content: pub.content,
            answer_format: format,
            answer_type: q.answer_type || "short",
            metadata: pub.metadata,
            wave_phase: wavePhase,
            // D-329: echoed only when targeting, so the caller can verify it got the objective it asked for.
            ...(targeting.mode === "on" ? { learning_objective: targeting.objective } : {}),
            // D-338: the server's step and activity mode, only in a sequence.
            ...(sequence !== null ? { learning_step: sequence.step, mode: sequence.mode } : {}),
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      } catch (e) {
        if (e instanceof InstanceKeyReadError) throw e;
        console.error("Skipping due instance with bad content:", instance.id, e);
      }
    }

    // 🔥 2. NEW QUESTIONS — unserved only, grade-filtered, domain-filtered
    //
    // Which selection runs is a SERVER setting, the Edge secret QUESTION_MIX_ENGINE (./format-mix.ts):
    //   unset / "v1"  today's selection, unchanged: get_unserved_questions_for_student + sortByWave
    //                 with the band from the request body;
    //   "shadow"      serves v1 and only LOGS what the format mix would have chosen;
    //   "v2"          serves the format mix: stratified per-pupil candidates
    //                 (get_question_candidates_for_student), server-derived band, interaction-kind
    //                 mix — ./mix-flow.ts.
    // "shadow" and "v2" need migration 20261019150000 applied first; without it their RPC fails loudly.
    // (mixEngine and wireFormat are resolved before step 1.)
    let sortedQuestions: any[];

    if (route.newQuestions === "level" || route.newQuestions === "level+mix") {
      // LEVEL_ENGINE=v1: the pupil's server-owned level for the subject, nearest-level candidates, no
      // grade ceiling (migration 20261029120000; ./level-flow.ts). Needs migrations #351, A and B.
      const { ordered, level, mixKind } = await loadLevelPlan(admin() as unknown as LevelReadClient, {
        studentId: student_id,
        subject: scope.subject,
        grade: selectedGrade,
        domains: subjectDomains,
        wavePhase,
        lastMisconceptionType,
        mixEngine,
      });
      console.log("LEVEL_ENGINE:", JSON.stringify({
        route: route.newQuestions, subject: scope.subject, level: level.level, answered: level.answered,
        newly_folded: level.newlyFolded, seed_source: level.seedSource, candidates: ordered.length, mix_kind: mixKind,
      }));
      sortedQuestions = ordered;
    } else if (mixEngine === "v2") {
      const { plan, band } = await loadFormatMixPlan(admin() as unknown as MixReadClient, {
        studentId: student_id,
        grade: selectedGrade,
        domains: subjectDomains,
        wavePhase,
        lastMisconceptionType,
      });
      // pupil = a one-way pseudonym (./log-pseudonym.ts), so the evaluation can exclude test accounts.
      const pupil = await pupilLogHash(student_id);
      console.log("FORMAT_MIX:", JSON.stringify({
        engine: mixEngine, pupil, ...plan.decision, band, client_band: currentDifficultyBand,
      }));
      sortedQuestions = plan.ordered;
    } else {
      // get_unserved_questions_for_student excludes questions already instanced for the student
      // via a server-side NOT EXISTS subquery. It returns full content (the key included), so it is
      // EXECUTE for the backend only and called with the verified student_id.
      const { data: questions, error: questionError } = await admin().rpc(
        "get_unserved_questions_for_student",
        {
          p_student_id: student_id,
          p_grade:      selectedGrade,
          p_domains:    subjectDomains,
        }
      );

      if (questionError) throw questionError;

      // Sort candidate questions by wave + difficulty-band preference before attempting insertion.
      sortedQuestions = sortByWave(
        questions || [],
        wavePhase,
        lastMisconceptionType,
        currentDifficultyBand
      );

      if (mixEngine === "shadow") {
        // Observation only: a failure here is logged and never changes what is served.
        try {
          const { plan, band } = await loadFormatMixPlan(admin() as unknown as MixReadClient, {
            studentId: student_id,
            grade: selectedGrade,
            domains: subjectDomains,
            wavePhase,
            lastMisconceptionType,
          });
          // pupil = a one-way pseudonym (./log-pseudonym.ts), so the evaluation can exclude test accounts.
          const pupil = await pupilLogHash(student_id);
          console.log("FORMAT_MIX:", JSON.stringify({
            engine: mixEngine, pupil, ...plan.decision, band, client_band: currentDifficultyBand,
            would_try_first: plan.ordered.length > 0 ? plan.ordered[0].id : null,
            v1_first: sortedQuestions.length > 0 ? sortedQuestions[0]?.id ?? null : null,
          }));
        } catch (e) {
          console.error("FORMAT_MIX_SHADOW_FAILED:", (e as { message?: unknown })?.message ?? e);
        }
      }
    }

    let inserted = null;

    for (const q of sortedQuestions) {
      if (!q.content) continue;
      // D-338: in a sequence, only the questions tagged with the server's current step are candidates.
      if (sequence !== null && stepOf(q.metadata) !== sequence.step) continue;

      let format: string;
      let normalized: any;
      let pub: ReturnType<typeof toPublicQuestion>;
      try {
        const resolved = wireFormat(q);
        if (resolved === null) throw new Error(`Unservable format: ${q.answer_format}`);
        format = resolved;
        normalized = normalizeContent(q.content, format);
        pub = toPublicQuestion(q.content, format, q.metadata, normalized.correct);
      } catch (e) {
        console.error("Skipping question with bad content:", q.id, e);
        continue;
      }

      // Server-owned assignment: the backend admin client writes the row, with the verified
      // student_id and the server-normalised key (./instance-insert.ts). Pupils have no INSERT on
      // question_instances, so they can never choose their own correct_answer. A key failure
      // throws to the outer catch (500); a row-level failure (e.g. a concurrent insert of the
      // same question) is logged and the next candidate is tried, as before.
      const { data, error } = await insertQuestionInstance(makeAdminClient, {
        studentId: student_id,
        questionId: q.id,
        correctAnswer: normalized.correct,
        nowIso: new Date().toISOString(),
        // K1: the row this response is built from; the database refuses the insert (40001) if the
        // question changed since it was read, and the next candidate is tried.
        servedSnapshot: servedSnapshot ? deliveryProposal(q) : undefined,
      });

      if (error) {
        console.error("INSTANCE INSERT FAILED:", JSON.stringify({
          question_id: q.id,
          code: (error as { code?: unknown })?.code ?? null,
        }));
      }

      if (!error && Array.isArray(data) && data.length > 0) {
        inserted = { instance: data[0], question: q, normalized, pub, format };
        break;
      }
    }

    // 🔁 3. REPEAT — last resort, only once the unserved pool is genuinely empty.
    //
    // request_repeat_question_for_student reopens one already answered auto-graded instance:
    // incorrect answers first, oldest first. It re-verifies that no unserved question remains in the
    // SERVER-DERIVED scope (profile grade + subject domains, ./scope.ts) and that the pupil has no
    // open question, so a pupil can neither skip ahead to repeats nor name an empty scope to farm
    // them. It is EXECUTE for the backend only. It returns null when a repeat is not warranted.
    //
    // Reopening bumps question_instances.repeat_count, which is what makes
    // process_question_attempt award the reduced amount for the re-answer.
    //
    // Same subject scope as the unserved query above: a pupil in historie must not be handed an
    // English repeat, and "the pool is empty" must mean empty for the chosen subject.
    // D-329 rule 4: a targeted request never reaches the repeat step (E2 mini-scope).
    if (!inserted && targeting.mode === "on") {
      // A concurrent request may have won idx_one_open_question (one open instance per pupil): then the
      // objective is NOT exhausted. Say so explicitly; the caller's retry gets that instance as due.
      const { data: openRows, error: openError } = await admin()
        .from("question_instances")
        .select("id")
        .eq("student_id", student_id)
        .eq("answered", false)
        .limit(1);
      if (openError) throw openError;
      if (Array.isArray(openRows) && openRows.length > 0) {
        return new Response(JSON.stringify({ error: "open_question_exists" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 409,
        });
      }
      return new Response(JSON.stringify(sequence !== null
        ? { step: "no_questions", reason: "step_exhausted", learning_step: sequence.step }
        : { step: "no_questions", reason: "objective_exhausted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (!inserted) {
      // v2: "exhausted" means no SERVABLE unserved question is left — the same rule the v2 candidate
      // window uses (public.question_is_servable), so a pool that holds only formats the client cannot
      // show still reaches repeats instead of "no questions". Every other guard is identical.
      // LEVEL_ENGINE=v1: the same guards over the level engine's pool (20261029120000).
      const { data: repeatId, error: repeatError } = route.repeatArgs !== "student+domains"
        ? (mixEngine === "v2"
          ? await admin().rpc(
            "request_repeat_question_servable_for_student",
            { p_student_id: student_id, p_grade: selectedGrade, p_domains: subjectDomains }
          )
          : await admin().rpc(
            "request_repeat_question_for_student",
            { p_student_id: student_id, p_grade: selectedGrade, p_domains: subjectDomains }
          ))
        : await admin().rpc(
          "request_repeat_level_question_for_student",
          { p_student_id: student_id, p_domains: subjectDomains }
        );

      if (repeatError) throw repeatError;

      if (repeatId) {
        const { data: repeatRows, error: repeatFetchError } = await admin()
          .from("question_instances")
          .select(`
            id,
            repeat_count,
            questions (
              content,
              answer_format,
              answer_type,
              metadata,
              is_active
            )
          `)
          .eq("id", repeatId)
          .eq("student_id", student_id)
          .limit(1);

        if (repeatFetchError) throw repeatFetchError;

        const repeatRow = Array.isArray(repeatRows) && repeatRows.length > 0
          ? repeatRows[0]
          : null;

        if (repeatRow) {
          // PostgREST returns a to-one embed as an object, but supabase-js types it as an array.
          // Normalise both shapes rather than indexing blindly.
          const embedded: unknown = repeatRow.questions;
          const rq = (Array.isArray(embedded) ? embedded[0] : embedded) as {
            content: unknown;
            answer_format: string | null;
            answer_type: string | null;
            metadata: unknown;
            is_active: boolean | null;
          } | null | undefined;

          if (rq && rq.is_active !== false) {
            // The reopened round, read back after the reopen (outside the try, so it fails loud).
            const roundNo = roundNoOf(repeatRow);
            // K1: the reopen took the round's snapshot in the same statement; serve FROM it.
            const delivered = servedSnapshot ? await deliveredFor(repeatRow.id) : null;
            const src = delivered ?? rq;
            try {
              const format = wireFormat(src);
              if (format === null) throw new Error(`Unservable format: ${src.answer_format}`);
              const instanceKey = delivered
                ? (KEYED_FORMATS.has(format) ? delivered.key : undefined)
                : await matchInstanceKey(format, repeatRow.id);
              const pub = toPublicQuestion(src.content, format, src.metadata, instanceKey);

              return new Response(
                JSON.stringify({
                  question_instance_id: repeatRow.id,
                  round_no: roundNo,
                  content: pub.content,
                  answer_format: format,
                  answer_type: src.answer_type || "short",
                  metadata: pub.metadata,
                  wave_phase: wavePhase,
                  // D-329: echoed only when targeting, so the caller can verify it got the objective it asked for.
                  ...(targeting.mode === "on" ? { learning_objective: targeting.objective } : {}),
                  // D-338: the server's step and activity mode, only in a sequence.
                  ...(sequence !== null ? { learning_step: sequence.step, mode: sequence.mode } : {}),
                  is_repeat: true,
                }),
                {
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                  status: 200,
                }
              );
            } catch (e) {
              if (e instanceof InstanceKeyReadError) throw e;
              // Bad content on the repeat candidate: fall through to no_questions rather than
              // serving something the client cannot render. The instance stays reopened, and the
              // DUE step picks it up next time under the same guard.
              console.error("Skipping repeat instance with bad content:", repeatRow.id, e);
            }
          }
        }
      }
    }

    if (!inserted) {
      return new Response(
        JSON.stringify({ step: "no_questions" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // The new instance's round, from the row the insert returned (repeat_count's default, 0 → round 1).
    const roundNo = roundNoOf(inserted.instance as { id?: unknown; repeat_count?: unknown });

    return new Response(
      JSON.stringify({
        question_instance_id: inserted.instance.id,
        round_no: roundNo,
        content: inserted.pub.content,
        answer_format: inserted.format,
        answer_type: inserted.question?.answer_type || "short",
        metadata: inserted.pub.metadata,
        wave_phase: wavePhase,
        // D-329: echoed only when targeting, so the caller can verify it got the objective it asked for.
        ...(targeting.mode === "on" ? { learning_objective: targeting.objective } : {}),
        // D-338: the server's step and activity mode, only in a sequence.
        ...(sequence !== null ? { learning_step: sequence.step, mode: sequence.mode } : {}),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (err: any) {
    console.error("EDGE FUNCTION ERROR:", err);

    return new Response(
      JSON.stringify({
        error: err?.message ?? "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
