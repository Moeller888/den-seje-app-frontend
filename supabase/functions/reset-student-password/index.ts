import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Omits visually ambiguous characters (0/O, 1/I/l) so the code is easy to
// read aloud or hand-write on paper.
function generateTemporaryPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join("")
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace("Bearer ", "")

    // 1. Verify caller identity
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 2. Verify caller is a teacher
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    if (!callerProfile || callerProfile.role !== "teacher") {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 3. Parse and validate request body
    const body = await req.json().catch(() => null)
    const student_id: string | undefined = body?.student_id

    if (!student_id || typeof student_id !== "string") {
      return new Response(
        JSON.stringify({ error: "student_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 4. Verify this teacher owns the student
    const { data: studentProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", student_id)
      .eq("teacher_id", user.id)
      .eq("role", "student")
      .maybeSingle()

    if (!studentProfile) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 5. Generate and set temporary password
    const temporaryPassword = generateTemporaryPassword()

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      student_id,
      { password: temporaryPassword }
    )

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Password update failed: " + updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 6. Flag student for forced password change on next login
    await supabase.from("profiles")
      .update({ must_reset_password: true })
      .eq("id", student_id)

    // 7. Write audit record
    await supabase.from("teacher_password_resets").insert({
      teacher_id: user.id,
      student_id,
    })

    return new Response(
      JSON.stringify({ success: true, temporary_password: temporaryPassword }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
