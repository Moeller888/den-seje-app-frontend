import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabaseUrl = "https://tjzbehwfagiwpwodsgwg.supabase.co";
const supabaseAnonKey = "sb_publishable_tktBmM5vnUD2qW98EVQOeA_MyZJfF-C";

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
);

console.log("Supabase forbundet korrekt (ESM)");