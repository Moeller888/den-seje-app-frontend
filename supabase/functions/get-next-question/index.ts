import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function mapAnswerFormat(format: string | null) {
  if (!format) return "mc";
  if (format.startsWith("mc")) return "mc";
  if (format.includes("number")) return "number";
  if (format.includes("text")) return "text";
  return "mc";
}

function normalizeContent(raw: any, answer_format: string) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid content");
  }

  const question = raw.question;
  let options = raw.options;
  const correct = raw.correct ?? null;

  // Pass review_text through if present and non-empty (teacher-authored explanation)
  const review_text = (typeof raw.review_text === "string" && raw.review_text.trim().length > 0)
    ? raw.review_text.trim()
    : null;

  if (typeof question !== "string" || question.trim().length === 0) {
    throw new Error("Missing question text");
  }

  if (answer_format === "mc") {
    if (!Array.isArray(options) || options.length < 2) {
      throw new Error("MC question missing valid options");
    }

    return { question, options, correct, review_text };
  }

  return { question, correct, review_text };
}

// NUZO wave scoring: higher score = preferred for this wave phase.
// Reads conceptual tension dimensions — not just difficulty.
// Uses: difficulty_type, cognitive_skill, misconception_type (recovery targeting),
//       insight_type (perspective_shift / reframing / conceptual_bridge),
//       challenge_role (reinforcement / challenge / deep_challenge).
// Optional: questionBand + targetBand give difficulty-band preference bonus (+6 exact, +3 adjacent).
// Questions without metadata score 0 — no preference, existing order preserved.
function getWaveScore(
  metadata: any,
  wavePhase: string,
  lastMisconceptionType: string | null,
  questionBand: number | null = null,
  targetBand: number | null = null
): number {
  if (!metadata || typeof metadata !== "object") return 0;

  const difficultyType    = metadata.difficulty_type    ?? null;
  const cognitiveSkill    = metadata.cognitive_skill    ?? null;
  const misconceptionType = metadata.misconception_type ?? null;
  const insightType       = metadata.insight_type       ?? null;
  const challengeRole     = metadata.challenge_role     ?? null;
  let score = 0;

  switch (wavePhase) {
    case "recovery":
      // Genopbygning: prefer factual/recall to restore conceptual ground
      if (difficultyType === "factual") score += 10;
      if (cognitiveSkill === "recall")  score += 5;
      // Targeted recovery: same misconception type helps address root confusion
      if (lastMisconceptionType && misconceptionType === lastMisconceptionType) score += 8;
      // Prefer stabilisering-role objects — safe re-entry after destabilization
      if (challengeRole === "reinforcement") score += 6;
      // Prefer conceptual_bridge insights — gentler entry point, lower tension
      if (insightType === "conceptual_bridge") score += 4;
      break;

    case "reinforcement":
      // Stabilisering: consolidate unstable understanding, reduce cognitive load
      if (difficultyType === "conceptual")    score += 8;
      if (cognitiveSkill === "comprehension") score += 5;
      // Prefer reinforcement-role objects for direct role alignment
      if (challengeRole === "reinforcement") score += 5;
      // Prefer reframing insights — shift perspective without high tension
      if (insightType === "reframing") score += 4;
      break;

    case "deep_challenge":
      // Begrebsovergang: shift abstraction level, require synthesis
      if (difficultyType === "analytical") score += 10;
      if (difficultyType === "applied")    score += 7;
      if (cognitiveSkill === "synthesis" || cognitiveSkill === "evaluation") score += 5;
      // Prefer deep_challenge-role objects for direct role alignment
      if (challengeRole === "deep_challenge") score += 6;
      // Prefer perspective_shift insights — require reconsidering assumptions
      if (insightType === "perspective_shift") score += 5;
      break;

    case "challenge":
    default:
      // Tankespænding: balanced productive tension — conceptual without overwhelming
      if (difficultyType === "conceptual" || difficultyType === "applied") score += 3;
      // Prefer challenge-role objects
      if (challengeRole === "challenge") score += 4;
      // Prefer conceptual_bridge or reframing — introductory tension types
      if (insightType === "conceptual_bridge" || insightType === "reframing") score += 2;
      break;
  }

  // Difficulty-band preference: +6 for exact match, +3 for adjacent band
  if (questionBand !== null && targetBand !== null) {
    const diff = Math.abs(questionBand - targetBand);
    if (diff === 0) score += 6;
    else if (diff === 1) score += 3;
  }

  return score;
}

// targetBand: optional difficulty band target from adaptive difficulty engine.
// When provided, band-matching bonus is included in wave scores.
function sortByWave(
  questions: any[],
  wavePhase: string,
  lastMisconceptionType: string | null,
  targetBand: number | null = null
): any[] {
  if (wavePhase === "challenge" && targetBand === null) return questions; // No reordering needed
  return [...questions].sort((a, b) => {
    const aBand = (a.difficulty_band as number | null) ?? null;
    const bBand = (b.difficulty_band as number | null) ?? null;
    const aScore = getWaveScore(a.metadata, wavePhase, lastMisconceptionType, aBand, targetBand);
    const bScore = getWaveScore(b.metadata, wavePhase, lastMisconceptionType, bBand, targetBand);
    return bScore - aScore; // Descending: highest score = first
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
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

    const body = await req.json().catch(() => ({}));
    const lastQuestionId        = body?.last_question_id ?? null;
    const sessionContext        = body?.session_context ?? null;
    const wavePhase             = (sessionContext?.wave_phase as string) ?? "challenge";
    const lastMisconceptionType = (sessionContext?.last_misconception_type as string | null) ?? null;
    const selectedGrade         = (body?.selected_grade as number | null) ?? null;
    const currentDifficultyBand = (body?.current_difficulty_band as number | null) ?? null;

    // Fetch teacher-assigned domain filter (null = free exploration, all domains available)
    const { data: profileData } = await supabase
      .from("profiles")
      .select("active_domains")
      .eq("id", student_id)
      .maybeSingle();

    const activeDomains: string[] | null =
      Array.isArray(profileData?.active_domains) && (profileData.active_domains as string[]).length > 0
        ? (profileData.active_domains as string[])
        : null;

    console.log("WAVE:", { wavePhase, lastMisconceptionType });
    console.log("GRADE:", { selectedGrade, currentDifficultyBand });
    console.log("DOMAINS:", { activeDomains });

    // 🔥 1. DUE QUESTIONS (spaced repetition — wave awareness applied to ordering)
    // Due instances are served regardless of grade filter (backwards compatible).
    const { data: dueInstances, error: dueError } = await supabase
      .from("question_instances")
      .select(`
        id,
        next_review_at,
        questions (
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
    const sortedDue = sortByWave(
      (dueInstances || []).filter(i => i.questions && i.questions.is_active !== false),
      wavePhase,
      lastMisconceptionType
    );

    for (const instance of sortedDue) {
      const q = instance.questions;
      if (!q) continue;

      try {
        const format = mapAnswerFormat(q.answer_format);
        const normalized = normalizeContent(q.content, format);

        return new Response(
          JSON.stringify({
            question_instance_id: instance.id,
            content: normalized,
            answer_format: format,
            answer_type: q.answer_type || "short",
            metadata: q.metadata ?? null,
            wave_phase: wavePhase,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      } catch (e) {
        console.error("Skipping due instance with bad content:", instance.id, e);
      }
    }

    // 🔥 2. NEW QUESTIONS — unserved only, grade-filtered, domain-filtered
    // get_unserved_questions excludes questions already instanced for the student
    // via a server-side NOT EXISTS subquery, eliminating the silent insert-failure
    // loop that caused no_questions when the limit(50) batch was exhausted.
    const { data: questions, error: questionError } = await supabase.rpc(
      "get_unserved_questions",
      {
        p_grade:   selectedGrade,
        p_domains: activeDomains,
      }
    );

    if (questionError) throw questionError;

    // Sort candidate questions by wave + difficulty-band preference before attempting insertion.
    const sortedQuestions = sortByWave(
      questions || [],
      wavePhase,
      lastMisconceptionType,
      currentDifficultyBand
    );

    let inserted = null;

    for (const q of sortedQuestions) {
      if (!q.content) continue;

      let format: string;
      let normalized: any;
      try {
        format = mapAnswerFormat(q.answer_format);
        normalized = normalizeContent(q.content, format);
      } catch (e) {
        console.error("Skipping question with bad content:", q.id, e);
        continue;
      }

      const { data, error } = await supabase
        .from("question_instances")
        .insert({
          student_id,
          question_id: q.id,
          answered: false,
          correct_answer: normalized.correct,
          difficulty_at_time: 1,
          mastery_snapshot: 1,
          next_review_at: new Date().toISOString(),
        })
        .select("id")
        .limit(1);

      if (!error && data && data.length > 0) {
        inserted = { instance: data[0], question: q, normalized, format };
        break;
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

    return new Response(
      JSON.stringify({
        question_instance_id: inserted.instance.id,
        content: inserted.normalized,
        answer_format: inserted.format,
        answer_type: inserted.question?.answer_type || "short",
        metadata: inserted.question?.metadata ?? null,
        wave_phase: wavePhase,
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
