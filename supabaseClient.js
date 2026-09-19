import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://tjzbehwfagiwpwodsgwg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_tktBmM5vnUD2qW98EVQOeA_MyZJfF-C";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// KRITISK: gør global
window.supabase = supabase;

console.log("Supabase forbundet korrekt (ESM)");

// The URL and the ANON key are public by design — the anon key identifies the project to the
// API and authorises nothing on its own. Exported so a page can call a Storage endpoint the
// SDK does not wrap, while still sending the USER's JWT for authorisation.
export { supabase, SUPABASE_URL, SUPABASE_ANON_KEY };
