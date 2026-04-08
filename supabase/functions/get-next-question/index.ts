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

  if (!Array.isArray(options)) {
    options = [];
  }

  if (options.length === 0) {
    options = ["A", "B", "C", "D"];
  }

  if (typeof correct !== "string") {
    correct = null;
  }

  return {
    question,
    options,
    correct
  };
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

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const student_id = user.id;

    // Hent due instances
    const { data: dueInstances, error: dueError } = await supabase
      .from("question_instances")
      .select(`
        id,
        question_id,
        answered,
        questions (
          id,
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

    const validDue = (dueInstances || []).filter(i => i.answered !== true);

    if (validDue.length > 0) {
      const instance = validDue[0];

      if (!instance.questions || !instance.questions.content) {
        throw new Error("Missing question relation");
      }

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

    // fallback: første spørgsmål (simpel og stabil)
    const { data: questions, error: randomError } = await supabase
      .from("questions")
      .select("id, content, answer_format")
      .limit(1);

    if (randomError) throw randomError;

    if (!questions || questions.length === 0) {
      return new Response(
        JSON.stringify({ step: "no_questions" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const randomQuestion = questions[0];

    if (!randomQuestion.content) {
      throw new Error("Question missing content");
    }

    const normalized = normalizeContent(randomQuestion.content);

    const { data: inserted, error: insertError } = await supabase
      .from("question_instances")
      .insert({
        student_id,
        question_id: randomQuestion.id,
        answered: false,
        next_review_at: new Date().toISOString(),
      })
      .select("id")
      .limit(1);

    if (insertError) throw insertError;

    if (!inserted || inserted.length === 0) {
      throw new Error("Insert failed");
    }

    const newInstance = inserted[0];

    return new Response(
      JSON.stringify({
        question_instance_id: newInstance.id,
        content: normalized,
        answer_format: mapAnswerFormat(randomQuestion.answer_format),
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
        stack: err?.stack ?? null
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});