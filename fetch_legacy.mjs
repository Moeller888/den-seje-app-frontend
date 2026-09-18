import { createClient } from './node_modules/@supabase/supabase-js/dist/index.mjs';

// Credentials come from the environment, never from this file. The service-role key bypasses Row
// Level Security entirely, and this repository is public: a key written here is a key published.
// Run as: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node fetch_legacy.mjs
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment.');
  process.exit(1);
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data, error } = await supabase
  .from('questions')
  .select('id, content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band')
  .is('target_grade', null)
  .order('id');

if (error) { console.error('ERROR:', error); process.exit(1); }

console.log('Legacy questions:', data.length);
console.log(JSON.stringify(data, null, 2));
