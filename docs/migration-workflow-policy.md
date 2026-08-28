# Migration workflow policy — TEMPORARY, API-ONLY

**Status:** `MIGRATION_DIVERGENCE_ACCEPTED — NOT_RESOLVED — TEMPORARY_API_ONLY_WORKFLOW`
**Decision:** [D-110](./project-state.md) · **Debt:** TD-3 · **Established:** 2026-08-28

This document is **operational policy, not a solution**. It records how database changes reach
production while the CLI migration history is out of sync, and it is binding until a separate,
owner-approved normalisation task replaces it.

---

## 1. The state of the migration history

The repository migration directory **cannot currently be treated as a safe, fully reproducible
production history.** Measured 2026-08-28 with `supabase migration list --linked`:

| | count |
|---|---:|
| common (local file ↔ remote ledger) | 107 |
| local-only | 50 |
| remote-only | **2** |

The two remote-only versions — applied to production, with no local file of that version — are:

- `20260823144030_docs_private_bucket`
- `20260827125327_avatar_jobs_cancelled_status`

**Why it looks like this.** Every one of this project's remote migration records was created through
the dashboard / Management API, which stamps its own server-side timestamp, while repository files
carry hand-written ones. The two ledgers therefore drift **by construction**, not by accident.

**41 migration names exist in the repo under two different timestamps**, and no such pair is
byte-identical: the remote-stamped file matches the SQL stored in `supabase_migrations`, while the
hand-stamped file is the human-authored original and carries 4–7× more comment lines. Neither set is
disposable without a decision — see §4.

---

## 2. Forbidden against the linked production project

Until a separate normalisation decision is carried out, **none of the following may be run against
the linked production project**:

| Command | Why |
|---|---|
| `supabase db push` | Fails on the divergence, and its guidance leads to `migration repair` |
| `supabase db push --include-all` | **Especially dangerous** — see below |
| `supabase migration up --linked` | Applies files the ledger does not agree about |
| `supabase migration repair` | Rewrites the production ledger to match an assumption |
| `supabase db pull` | Writes new local files and deepens the duplicate-file problem |
| Any manual edit of `supabase_migrations.schema_migrations` | The ledger is evidence, not scratch space |

**`--include-all` is the sharpest edge.** It would attempt to apply *every* local-only file that
sits before the newest remote migration — **48 files, of which 42 have already been applied under a
different timestamp**. It does not know they are the same migrations. Re-running them is not a
no-op: they include content inserts, RPC redefinitions and RLS changes.

`supabase migration list --linked` is **read-only and permitted**. It is how §3 step 8 is measured.

---

## 3. The temporary procedure

A future migration may be applied **only** through the Management API / Supabase plugin
(`apply_migration`), and **only after a separate, explicit owner authorisation for that specific
migration**.

**This policy grants no standing permission.** Each migration needs its own owner decision. The
gates below are what that decision buys, not a substitute for it.

1. The migration is reviewed and merged to a known `main` SHA.
2. The exact SQL file is runtime-tested.
3. A fresh read-only production preflight is performed.
4. Every expected data and schema precondition matches. Any mismatch stops the work.
5. The exact file is applied **once**.
6. The remote timestamp, name and result are recorded.
7. A read-only postflight is performed.
8. The new local/remote divergence is measured and **documented honestly**.
9. **No migration may be presented as CLI-synchronised.**

**Every API migration can increase the version divergence**, because the API assigns its own
timestamp and the repository keeps the file it already had. Step 8 exists so that growth is visible
rather than discovered later.

---

## 4. The long-term normalisation — NOT implemented

Recorded as the preferred future direction. **None of this is done, and none of it may be started
without a separate owner decision.**

- The **remote-stamped files are the executable historical truth** — they match what the database
  actually ran, and should be treated as canonical for that reason.
- **Valuable hand-written commentary can be moved to separate documentation.** The reasoning in the
  hand-stamped originals is worth keeping even when the file is not.
- **No comment needs to be lost.** A normalisation that discards them is not the one to run.
- Each duplicate pair must be compared **semantically** — not by name, and not by file size. Size
  differences here are mostly stripped comments, which proves nothing about the SQL.
- The **six files with no remote name counterpart** must be investigated individually:
  `cold_war_grade7`, `fix_get_teacher_visibility`, `reformation_monarchy_content_sprint`,
  `world_war_1_content_sprint`, `world_war_2_band5`, `world_war_2_grade7`. Name matching is a
  heuristic; some may be superseded, some may never have been applied.
- **`prestige.sql` must be classified separately.** It has no timestamp prefix, so the CLI skips it
  entirely (`file name must match pattern "<timestamp>_name.sql"`), and it is therefore in neither
  ledger.

Only after all of that may the CLI history be brought into agreement.

---

## 5. What the automated guard does and does not do

`tests/unit/migration-workflow-policy.test.mjs` pins this document, the D-110 status, and the
absence of database-deploying commands from `package.json` scripts and GitHub workflows.

It is **documentation protection**. It cannot stop a person from typing `supabase db push` in a
terminal, and it does not claim to. What it catches is this policy being quietly weakened, or a
forbidden command being wired into automation where nobody would notice it.
