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

// Wave-aware scoring: higher score = preferred for this wave phase.
// Questions without metadata score 0 — no preference, existing order preserved.
function getWaveScore(metadata: any, wavePhase: string, lastMisconceptionType: string | null): number {
  if (!metadata || typeof metadata !== "object") return 0;

  const difficultyType  = metadata.difficulty_type  ?? null;
  const cognitiveSkill  = metadata.cognitive_skill  ?? null;
  const misconceptionType = metadata.misconception_type ?? null;
  let score = 0;

  switch (wavePhase) {
    case "recovery":
      // Prefer factual/recall to restore confidence after repeated mistakes
      if (difficultyType === "factual") score += 10;
      if (cognitiveSkill === "recall")  score += 5;
      // Bonus: targeted recovery — same misconception type at factual level
      if (lastMisconceptionType && misconceptionType === lastMisconceptionType) score += 8;
      break;

    case "reinforcement":
      // Prefer conceptual/comprehension to consolidate after one mistake
      if (difficultyType === "conceptual")    score += 8;
      if (cognitiveSkill === "comprehension") score += 5;
      break;

    case "deep_challenge":
      // Prefer analytical/synthesis after sustained correct streak
      if (difficultyType === "analytical") score += 10;
      if (difficultyType === "applied")    score += 7;
      if (cognitiveSkill === "synthesis" || cognitiveSkill === "evaluation") score += 5;
      break;

    case "challenge":
    default:
      // Slight preference for conceptual/applied — balanced mid-difficulty
      if (difficultyType === "conceptual" || difficultyType === "applied") score += 3;
      break;
  }

  return score;
}

function sortByWave(questions: any[], wavePhase: string, lastMisconceptionType: string | null): any[] {
  if (wavePhase === "challenge") return questions; // No reordering in neutral phase
  return [...questions].sort((a, b) => {
    const aScore = getWaveScore(a.metadata, wavePhase, lastMisconceptionType);
    const bScore = getWaveScore(b.metadata, wavePhase, lastMisconceptionType);
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
    const lastQuestionId      = body?.last_question_id ?? null;
    const sessionContext      = body?.session_context ?? null;
    const wavePhase           = (sessionContext?.wave_phase as string) ?? "challenge";
    const lastMisconceptionType = (sessionContext?.last_misconception_type as string | null) ?? null;

    console.log("WAVE:", { wavePhase, lastMisconceptionType });

    // 🔥 1. DUE QUESTIONS (spaced repetition — wave awareness applied to ordering)
    const { data: dueInstances, error: dueError } = await supabase
      .from("question_instances")
      .select(`
        id,
        next_review_at,
        questions (
          content,
          answer_format,
          answer_type,
          metadata
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
    const sortedDue = sortByWave(
      (dueInstances || []).filter(i => i.questions),
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

    // 🔥 2. NEW QUESTIONS — wave-aware sorting determines which new question to introduce
    const { data: questions, error: questionError } = await supabase
      .from("questions")
      .select("id, content, answer_format, answer_type, metadata")
      .limit(50);

    if (questionError) throw questionError;

    // Sort candidate questions by wave preference before attempting insertion.
    // Questions without metadata score 0 and preserve their original order.
    const sortedQuestions = sortByWave(questions || [], wavePhase, lastMisconceptionType);

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
