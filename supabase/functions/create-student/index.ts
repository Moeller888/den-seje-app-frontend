import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader)
      return new Response("Unauthorized", { status: 401, headers: corsHeaders })

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    )

    const token = authHeader.replace("Bearer ", "")

    // 🔐 Hent teacher
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(token)

    if (userError || !user)
      return new Response("Unauthorized", { status: 401, headers: corsHeaders })

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profileError || !profile || profile.role !== "teacher")
      return new Response("Forbidden", { status: 403, headers: corsHeaders })

    const { email, password } = await req.json()

    if (!email || !password)
      return new Response("Email and password required", { status: 400, headers: corsHeaders })

    // 👤 Opret auth-user
    const { data: newUser, error: createError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      })

    if (createError || !newUser?.user)
      return new Response(createError?.message || "User creation failed", {
        status: 400,
        headers: corsHeaders
      })

    // 🧠 Upsert profile (robust mod gamle rækker)
    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert({
        id: newUser.user.id,
        role: "student",
        teacher_id: user.id
      })

    if (upsertError)
      return new Response(upsertError.message, {
        status: 500,
        headers: corsHeaders
      })

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (err: any) {
    return new Response(err.message, {
      status: 500,
      headers: corsHeaders
    })
  }
})