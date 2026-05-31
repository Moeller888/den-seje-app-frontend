import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TEST_STUDENT_EMAIL = "christnmoeller@hotmail.com";

export default async function globalSetup() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "global-setup: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env"
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: users, error: listError } =
    await supabase.auth.admin.listUsers();

  if (listError) {
    throw new Error(`global-setup: listUsers failed — ${listError.message}`);
  }

  const user = users.users.find((u) => u.email === TEST_STUDENT_EMAIL);

  if (!user) {
    throw new Error(
      `global-setup: test student ${TEST_STUDENT_EMAIL} not found`
    );
  }

  const { error } = await supabase
    .from("question_instances")
    .delete()
    .eq("student_id", user.id);

  if (error) {
    throw new Error(`global-setup: delete failed — ${error.message}`);
  }

  console.log(
    `[global-setup] Deleted all question_instances for ${TEST_STUDENT_EMAIL} (${user.id})`
  );

  // Reset grade, placement_band (prevents overlays) and current_band (fresh session).
  // Service role bypasses RLS — direct update is safe here.
  const { error: gradeError } = await supabase
    .from("profiles")
    .update({ selected_grade: 9, placement_band: 2, current_band: null, active_domains: null })
    .eq("id", user.id);

  if (gradeError) {
    throw new Error(`global-setup: grade update failed — ${gradeError.message}`);
  }

  console.log(
    `[global-setup] Set selected_grade=9, placement_band=2, current_band=null, active_domains=null for ${TEST_STUDENT_EMAIL}`
  );
}
