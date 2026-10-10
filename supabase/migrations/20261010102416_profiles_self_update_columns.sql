-- Restrict what a signed-in user may change on their own public.profiles row.
--
-- WHY THIS IS A SECURITY FIX
-- profiles_self_update (20260603074307) lets a user UPDATE their own row, and its WITH CHECK only
-- pins id and role. anon and authenticated hold table-wide UPDATE, so every other column of the own
-- row was client-writable through PostgREST, including:
--   * must_reset_password — a pupil could set it to false and skip the forced password change that
--     create-student (v18) and reset-student-password impose on a teacher-chosen password;
--   * teacher_id — a pupil could move to another teacher, pick any teacher or drop their teacher;
--   * selected_grade, active_domains, equipped_slots, active_theme, active_title, avatar_identity,
--     active_avatar, avatar_gender, full_name, created_at — all bypassing the RPCs that validate them.
-- RLS selects rows; it cannot restrict columns. Column privileges can.
--
-- THE WRITE CONTRACT (derived from every runtime profiles write on origin/main 328aad6)
--   * Direct client UPDATE of the own row is used for exactly two columns: placement_band and
--     current_band (app.js — the adaptive engine persists its own state; Section 132 opened this
--     deliberately and tests/profiles-rls.spec.ts pins it). Their ranges are CHECK-constrained.
--   * Everything else is written server-side and is NOT affected by this migration:
--       selected_grade         set_student_grade()     SECURITY DEFINER
--       active_domains         set_student_domains()   SECURITY DEFINER (teacher)
--       equipped_slots         equip_item() / unequip_item()  SECURITY DEFINER
--       active_theme / _title  set_active_theme() / set_active_title()  SECURITY DEFINER
--       avatar_identity        set_avatar_identity()   SECURITY DEFINER
--       active_avatar          equip-avatar Edge Function (backend key)
--       id, role, teacher_id, must_reset_password = true
--                              create-student / create-teacher / reset-student /
--                              reset-student-password Edge Functions (backend key)
--   * The one remaining client write was reset-password.js clearing must_reset_password after
--     auth.updateUser(). A client-side clear cannot prove the password changed, so it is replaced by
--     the database observing the change itself (part 2).
--
-- PART 1 — column privileges: authenticated may UPDATE only placement_band and current_band.
-- anon has no UPDATE policy anyway; its UPDATE privilege is removed too. service_role (backend key)
-- is untouched. profiles_self_update still scopes the row to id = auth.uid().
--
-- PART 2 — must_reset_password is cleared only by a real password change.
-- An AFTER UPDATE trigger on auth.users clears the flag when encrypted_password changes. A pupil
-- can no longer clear it without choosing a new password. Teacher resets keep working: the
-- reset-student-password function changes the password first and sets the flag to true afterwards.
-- The trigger function is SECURITY DEFINER (it runs in Supabase Auth's UPDATE), pinned to
-- search_path = public, pg_temp, touches only the profile with the same id, and is not executable
-- through the API. reset-password.js keeps its now-redundant client clear until a follow-up PR, so
-- the frontend works before and after this migration is applied.
--
-- WHY THERE IS NO "GRANT EXECUTE … TO supabase_auth_admin"
-- Postgres checks EXECUTE on a trigger function only when the trigger is CREATED, for the creator
-- (here postgres, which owns the function). It never checks it when the trigger fires, so Supabase
-- Auth's role needs no grant. Leaving it out keeps the function uncallable by every role except its
-- owner. Proven in tests/unit/profiles-self-update-columns-migration-run.test.mjs, which applies
-- this file as a non-superuser that owns profiles and holds TRIGGER on an auth.users owned by
-- supabase_auth_admin — the production arrangement, verified read-only 2026-10-10 — and fires the
-- trigger as supabase_auth_admin.
--
-- ORDERING CONTRACT FOR BACKEND WRITERS
-- Because every real password change clears the flag, a writer that wants the flag TRUE must
-- change the password FIRST. reset-student-password does (updateUserById, then the flag);
-- create-student inserts the auth user (an INSERT — the trigger does not fire) before the profile.
-- tests/unit/profiles-self-update-columns-guard.test.mjs fails if that order is reversed.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- No policy change (profiles_select and profiles_self_update are untouched), no data change, no
-- change to SELECT/INSERT/DELETE privileges, no other table.

-- ── Part 1 ────────────────────────────────────────────────────────────────────────────────────
REVOKE UPDATE ON public.profiles FROM anon, authenticated;

GRANT UPDATE (placement_band, current_band) ON public.profiles TO authenticated;

-- ── Part 2 ────────────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.clear_must_reset_password_on_password_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.profiles
     SET must_reset_password = false
   WHERE id = NEW.id
     AND must_reset_password = true;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_must_reset_password_on_password_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER clear_must_reset_password_on_password_change
AFTER UPDATE OF encrypted_password ON auth.users
FOR EACH ROW
WHEN (NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password)
EXECUTE FUNCTION public.clear_must_reset_password_on_password_change();
