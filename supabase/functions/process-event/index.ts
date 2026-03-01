import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json"
}

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders })
    }

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    )

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return new Response("Invalid user", {
        status: 401,
        headers: corsHeaders
      })
    }

    const body = await req.json()

    const question_instance_id = body.question_instance_id
    const user_answer = body.user_answer ?? ""

    if (!question_instance_id) {
      return new Response("question_instance_id required", {
        status: 400,
        headers: corsHeaders
      })
    }

    const { data, error } = await supabase.rpc(
      "process_question_attempt",
      {
        p_student_id: user.id,
        p_instance_id: question_instance_id,
        p_user_answer: user_answer
      }
    )

    if (error) {
      return new Response(error.message, {
        status: 500,
        headers: corsHeaders
      })
    }

    return new Response(JSON.stringify(data), {
      headers: corsHeaders
    })

  } catch (err: any) {
    return new Response(err?.message ?? "Server error", {
      status: 500,
      headers: corsHeaders
    })
  }

})