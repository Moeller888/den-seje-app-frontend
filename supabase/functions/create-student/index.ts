// create-student — a teacher creates a pupil account.
//
// This file is WIRING ONLY. The contract (who may call, what is written, the partial-failure
// rollback and every response) lives in handler.ts, which carries no client, no fetch and no env
// so it can be tested with fakes: tests/unit/create-student-handler.test.mjs.
//
// ERROR POLICY
// Every Supabase call below checks `error`. The role read THROWS on failure, so a failed read is
// never mistaken for "not a teacher". The other calls return their error to the handler, which
// decides the response.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { serviceKey } from "../_shared/supabase-keys.ts";
import { createHandler } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = serviceKey()

serve((req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return createHandler({
    getUserId: async (token) => {
      const { data, error } = await supabase.auth.getUser(token)
      if (error || !data?.user?.id) return null
      return data.user.id
    },

    getRole: async (userId) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle()
      if (error) throw new Error(`role lookup failed: ${error.message ?? "unknown error"}`)
      return data && typeof data.role === "string" ? data.role : null
    },

    createAuthUser: async (email, password) => {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      return { id: data?.user?.id ?? null, error: error ?? null }
    },

    // must_reset_password = true makes the teacher-chosen password temporary in practice:
    // js/login.js routes a flagged pupil to reset-password.html?forced=1, and js/reset-password.js
    // clears the flag once the pupil has chosen their own password. Same flag, same flow as
    // reset-student-password — no parallel mechanism.
    writeStudentProfile: async (studentId, teacherId) => {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: studentId,
          role: "student",
          teacher_id: teacherId,
          must_reset_password: true,
        })
      return { error: error ?? null }
    },

    deleteAuthUser: async (userId) => {
      const { error } = await supabase.auth.admin.deleteUser(userId)
      return { error: error ?? null }
    },

    logError: (stage, detail) => {
      console.error(`[create-student] ${stage}`, JSON.stringify(detail))
    },
  })(req)
})
