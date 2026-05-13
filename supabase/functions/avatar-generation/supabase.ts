import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type SupabaseClient = ReturnType<typeof createClient>;

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || url.trim() === "") {
    throw new Error("SUPABASE_URL environment variable is not set");
  }
  if (!key || key.trim() === "") {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
