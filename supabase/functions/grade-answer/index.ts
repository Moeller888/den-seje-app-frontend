// ── grade-answer Edge Function (157K) ────────────────────────────────────────
// ADVISORY-ONLY AI grading endpoint. It exposes the AI abstraction layer's grade()
// as an HTTP contract for future teacher tooling (157M). It is NOT wired into
// process-event and has NO part in the reward path (157L is that, later).
//
// HARD GUARANTEES (docs/AI_GUIDELINES.md, CLAUDE.md):
//   • Default-off: when ENABLE_AI_GRADING is unset / no provider configured, it
//     returns { available: false } (HTTP 200) — a clean "no suggestion; grade
//     manually" signal. No AI is called, nothing is sent anywhere.
//   • Never writes the database. Never awards XP/coins. Never auto-submits.
//   • Advisory only: returns a SUGGESTION for a teacher to confirm or override.
//   • Fail-soft: always returns a Response; errors never leak data.
//   • Auth required (forwards the caller's JWT).
//   • Wrapped with the shared observability layer (157C).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withObservability } from "../_shared/monitoring.ts";
import { createAiService } from "../_shared/ai/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

serve(withObservability("grade-answer", async (req, ctx) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth (advisory endpoint still requires an authenticated caller) ────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.answer !== "string" || body.answer.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Missing 'answer'" }), { status: 400, headers: corsHeaders });
    }

    // ── Advisory grade via the abstraction layer (default-off → available:false) ─
    const ai = createAiService();
    const result = await ai.grade({
      answer: body.answer,
      rubric: typeof body.rubric === "string" ? body.rubric : undefined,
      questionText: typeof body.question_text === "string" ? body.question_text : undefined,
      language: typeof body.language === "string" ? body.language : undefined,
    });

    // Advisory contract: always 200; the suggestion is null when unavailable. The
    // caller MUST treat this as a non-binding suggestion (teacher confirms/overrides).
    return new Response(JSON.stringify({
      available: result.available,
      advisory: true,
      suggestion: result.data,        // null when unavailable
      provider: result.providerId,
      model: result.model,
      prompt_version: result.promptVersion,
      reason: result.available ? null : result.reason,
    }), { status: 200, headers: corsHeaders });

  } catch (err: any) {
    // Fail-soft: report (no answer content) and return a clean error. Never throws.
    try { ctx.captureException(err, { phase: "catch" }); } catch (_e) { /* ignore */ }
    return new Response(
      JSON.stringify({ available: false, advisory: true, suggestion: null, error: err?.message ?? "Unknown error" }),
      { status: 500, headers: corsHeaders }
    );
  }
}));
