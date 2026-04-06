import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function mapAnswerFormat(format: string | null) {
  console.log("RAW FORMAT:", format);

  if (!format) return "mc";

  if (format.startsWith("mc")) return "mc";
  if (format.includes("number")) return "number";
  if (format.includes("text")) return "text";

  console.log("UNKNOWN FORMAT:", format);
  return "mc";
}

function normalizeContent(raw: any) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid content: not an object");
  }

  let question = raw.question;
  let options = raw.options;
  let correct = raw.correct;

  if (typeof question !== "string" || question.trim().length === 0) {
    throw new Error("Invalid content: missing question text");
  }

  if (!Array.isArray(options)) {
    console.warn("OPTIONS NOT ARRAY → fixing");
    options = [];
  }

  // Fix A/B/C/D problem
  if (options.length > 0 && options.every(o => ["A","B","C","D"].includes(o))) {
    console.warn("OPTIONS ARE LABELS → invalid data");
  }

  if (options.length === 0) {
    console.warn("EMPTY OPTIONS → injecting fallback");
    options = ["A","B","C","D"];
  }

  if (typeof correct !== "string") {
    console.warn("INVALID CORRECT → nulling");
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

    const { data: dueInstances, error: dueError } = await supabase
      .from("question_instances")
      .select(`
        id,
        question_id,
        questions (
          id,
          content,
          answer_format
        )
      `)
      .eq("student_id", student_id)
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
          content: normalized, // ✅ FLAT
          answer_format: mapAnswerFormat(instance.questions.answer_format),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const { data: randomQuestion, error: randomError } = await supabase
      .from("questions")
      .select("id, content, answer_format")
      .order("random()")
      .limit(1)
      .single();

    if (randomError || !randomQuestion) {
      return new Response(
        JSON.stringify({ step: "no_questions" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const normalized = normalizeContent(randomQuestion.content);

    const { data: newInstance, error: insertError } = await supabase
      .from("question_instances")
      .insert({
        student_id,
        question_id: randomQuestion.id,
        answered: false,
        next_review_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        question_instance_id: newInstance.id,
        content: normalized, // ✅ FLAT
        answer_format: mapAnswerFormat(randomQuestion.answer_format),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
