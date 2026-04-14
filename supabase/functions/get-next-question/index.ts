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

function normalizeContent(raw: any) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid content");
  }

  let question = raw.question;
  let options = raw.options;
  let correct = raw.correct;

  if (typeof question !== "string" || question.trim().length === 0) {
    throw new Error("Missing question text");
  }

  if (!Array.isArray(options)) options = [];

  // 🔥 ALTID 4 svarmuligheder
  while (options.length < 4) {
    options.push(`Option ${options.length + 1}`);
  }

  if (typeof correct !== "string") correct = null;

  return { question, options, correct };
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

    // 🔥 BODY (kun én gang!)
    const body = await req.json().catch(() => ({}));
    const lastQuestionId = body?.last_question_id ?? null;

    // 🔥 1. DUE QUESTIONS (ALTID prioritet)
    const { data: dueInstances, error: dueError } = await supabase
      .from("question_instances")
      .select(`
        id,
        next_review_at,
        questions (
          content,
          answer_format
        )
      `)
      .eq("student_id", student_id)
      .eq("answered", false)
      .lte("next_review_at", new Date().toISOString())
      .order("next_review_at", { ascending: true })
      .limit(1);

    if (dueError) throw dueError;

    if (dueInstances && dueInstances.length > 0) {
      const instance = dueInstances[0];
      const normalized = normalizeContent(instance.questions.content);

      return new Response(
        JSON.stringify({
          question_instance_id: instance.id,
          content: normalized,
          answer_format: mapAnswerFormat(instance.questions.answer_format),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // 🔥 2. UPCOMING (ANTI-REPEAT HARD FIX)
    const { data: upcoming, error: upcomingError } = await supabase
      .from("question_instances")
      .select(`
        id,
        next_review_at,
        questions (
          content,
          answer_format
        )
      `)
      .eq("student_id", student_id)
      .order("next_review_at", { ascending: true })
      .limit(10);

    if (upcomingError) throw upcomingError;

    if (upcoming && upcoming.length > 0) {

      // 🔥 HARD FILTER (ingen gentagelse)
      const filtered = upcoming.filter(q => q.id !== lastQuestionId);

      const pool = filtered.length > 0 ? filtered : upcoming;

      const instance = pool[Math.floor(Math.random() * pool.length)];

      const normalized = normalizeContent(instance.questions.content);

      return new Response(
        JSON.stringify({
          question_instance_id: instance.id,
          content: normalized,
          answer_format: mapAnswerFormat(instance.questions.answer_format),
          preview: true,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // 🔥 3. NYE SPØRGSMÅL
    const { data: questions, error: questionError } = await supabase
      .from("questions")
      .select("id, content, answer_format")
      .limit(50);

    if (questionError) throw questionError;

    let inserted = null;

    for (const q of questions || []) {
      if (!q.content) continue;

      const normalized = normalizeContent(q.content);

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
        inserted = { instance: data[0], question: q, normalized };
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
        answer_format: mapAnswerFormat(inserted.question.answer_format),
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
