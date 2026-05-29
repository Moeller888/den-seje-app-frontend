import { createClient } from './node_modules/@supabase/supabase-js/dist/index.mjs';

const supabase = createClient(
  'https://tjzbehwfagiwpwodsgwg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqemJlaHdmYWdpd3B3b2RzZ3dnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY4Nzk5NCwiZXhwIjoyMDg3MjYzOTk0fQ.g6GB4_FdVu8_z375bj9U_TXf3gIJYsM0p8x6aNagt2A',
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
