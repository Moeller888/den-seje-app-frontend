-- D-237 preflight, snapshot and rollback generator — READ ONLY.
--
-- For supabase/migrations/20261027160000_revoke_truncate_maintain_api_roles.sql (docs/decisions/D-237.md,
-- procedure in docs/operations/revoke-truncate-maintain-rollback.md).
--
-- Every statement below is a SELECT; run the whole file inside BEGIN TRANSACTION READ ONLY ... ROLLBACK.
-- Running it needs the owner's GO for a read-only production check; it changes nothing.
-- tests/unit/revoke-truncate-maintain-api-roles-migration-run.test.mjs runs this exact file in a
-- READ ONLY transaction against the PGlite fixture.
--
-- STOP RULE: each check marked "expect 0 rows" must return 0 rows. Any row means production is not the
-- state the migration was written and tested for: stop, do not apply, report.

-- ── Check 1 — D-237 is not applied yet (expect 0 rows) ───────────────────────────────────────────────
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE name = 'revoke_truncate_maintain_api_roles';

-- ── Check 2 — the 32 relations still exist (expect 0 rows) ───────────────────────────────────────────
-- BEGIN EXPECTED-RELATIONS
WITH expected(relname) AS (VALUES
  ('achievements'), ('attempt_stats'), ('avatar_asset_review_queue'), ('avatar_asset_validation_runs'),
  ('avatar_assets'), ('avatar_generation_events'), ('avatar_generation_jobs'), ('avatar_ingestion_artifacts'),
  ('avatar_ingestion_events'), ('avatar_ingestion_jobs'), ('daily_login_rewards'), ('daily_quests'),
  ('password_help_requests'), ('profiles'), ('question_instances'), ('question_performance'),
  ('questions'), ('shop_items'), ('streak_milestones'), ('student_events'), ('student_progress'),
  ('student_quest_progress'), ('student_weekly_quest_progress'), ('teacher_password_resets'),
  ('teacher_spotlights'), ('themes'), ('titles'), ('user_achievements'), ('user_items'),
  ('user_themes'), ('user_titles'), ('weekly_quests'))
-- END EXPECTED-RELATIONS
SELECT e.relname AS missing_relation
FROM expected e
WHERE to_regclass('public.' || quote_ident(e.relname)) IS NULL;

-- ── Check 3 — exactly those 32 give TRUNCATE or MAINTAIN to an API role (expect 0 rows) ──────────────
-- A relation in one list but not the other means the catalog moved since 2026-11-04.
WITH expected(relname) AS (VALUES
  ('achievements'), ('attempt_stats'), ('avatar_asset_review_queue'), ('avatar_asset_validation_runs'),
  ('avatar_assets'), ('avatar_generation_events'), ('avatar_generation_jobs'), ('avatar_ingestion_artifacts'),
  ('avatar_ingestion_events'), ('avatar_ingestion_jobs'), ('daily_login_rewards'), ('daily_quests'),
  ('password_help_requests'), ('profiles'), ('question_instances'), ('question_performance'),
  ('questions'), ('shop_items'), ('streak_milestones'), ('student_events'), ('student_progress'),
  ('student_quest_progress'), ('student_weekly_quest_progress'), ('teacher_password_resets'),
  ('teacher_spotlights'), ('themes'), ('titles'), ('user_achievements'), ('user_items'),
  ('user_themes'), ('user_titles'), ('weekly_quests')),
holding AS (
  SELECT DISTINCT c.relname
  FROM pg_class c
  CROSS JOIN LATERAL aclexplode(c.relacl) a
  JOIN pg_roles r ON r.oid = a.grantee
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v')
    AND r.rolname IN ('anon', 'authenticated') AND a.privilege_type IN ('TRUNCATE', 'MAINTAIN'))
SELECT 'holds but not listed' AS problem, relname FROM (SELECT relname FROM holding EXCEPT SELECT relname FROM expected) x
UNION ALL
SELECT 'listed but holds nothing', relname FROM (SELECT relname FROM expected EXCEPT SELECT relname FROM holding) y;

-- ── Check 4 — no grant options, no foreign grantor, no PUBLIC grant of either privilege (expect 0 rows)
-- The rollback re-grants as the owner; it can only reproduce grants the owner made, without options.
SELECT c.relname, coalesce(r.rolname, 'PUBLIC') AS grantee, a.privilege_type,
       a.grantor::regrole AS grantor, a.is_grantable
FROM pg_class c
CROSS JOIN LATERAL aclexplode(c.relacl) a
LEFT JOIN pg_roles r ON r.oid = a.grantee
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v')
  AND a.privilege_type IN ('TRUNCATE', 'MAINTAIN')
  AND (a.grantee = 0 OR (r.rolname IN ('anon', 'authenticated') AND (a.is_grantable OR a.grantor <> c.relowner)));

-- ── Check 5 — anon and authenticated inherit from no role (expect 0 rows) ────────────────────────────
SELECT m.member::regrole AS member, m.roleid::regrole AS member_of
FROM pg_auth_members m
WHERE m.member IN ('anon'::regrole, 'authenticated'::regrole);

-- ── Snapshot — the full ACL of every table and view in public. SAVE this output. ─────────────────────
-- It is the evidence the rollback is built from, and the baseline the postflight compares against.
SELECT c.relname, c.relkind, c.relowner::regrole AS owner, c.relacl::text AS acl
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v')
ORDER BY c.relname;

-- ── Rollback generator — run BEFORE applying; SAVE the output (one GRANT per relation and role). ─────
-- It reproduces exactly the TRUNCATE/MAINTAIN grants that exist now and nothing else: per relation, per
-- API role, only the privileges that role holds. Check 4 guarantees they were granted by the owner
-- without grant option, so re-granting as the owner restores the identical ACL entries.
-- BEGIN ROLLBACK-GENERATOR
SELECT format('GRANT %s ON TABLE public.%I TO %I;',
              string_agg(a.privilege_type, ', ' ORDER BY a.privilege_type DESC), c.relname, r.rolname) AS rollback_sql
FROM pg_class c
CROSS JOIN LATERAL aclexplode(c.relacl) a
JOIN pg_roles r ON r.oid = a.grantee
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v')
  AND r.rolname IN ('anon', 'authenticated') AND a.privilege_type IN ('TRUNCATE', 'MAINTAIN')
GROUP BY c.relname, r.rolname
ORDER BY c.relname, r.rolname;
-- END ROLLBACK-GENERATOR
