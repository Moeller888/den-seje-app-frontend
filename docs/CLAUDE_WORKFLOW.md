# CLAUDE_WORKFLOW.md — Den Seje App

_How work is done on this project: section workflow, audit-first policy, testing, review, commits,
Definition of Done. Operationalises the rules in the root `CLAUDE.md`._
_`CLAUDE.md` (root) is authoritative and **overrides** this file on any conflict; this file explains
how to apply it day to day._
_Last reviewed: 2026-06-30._

---

## 0. Mental model

This is a **production system** serving minors. The working posture is **execution engine, not
architect** (CLAUDE.md "PRODUCTION STRICT MODE"): implement exactly what a section asks, at the
right altitude, without redesigning architecture, changing data flow, or introducing patterns
unless explicitly requested. **Correct > fast. Stability > speed.**

## 1. Section workflow (one controlled section at a time)

Work is organised into numbered **sections** (e.g. 157A audit, 157AA docs, 157B Sentry; avatar
track 164x/166x/167x). The discipline:

1. **One task per request.** Do not combine multiple changes. A section is the unit of work.
2. **Audit before acting** (§2).
3. **Plan / decide** — if the section is architecture/decision-shaped, produce the plan or ADR and
   **stop for approval before writing code** (the 164x/167x sections are "plan only, not executed").
4. **Implement** the single change, full-file (§5 commits / §6 code rules).
5. **Test** before and after (§3).
6. **Commit only on green** (§3, §6).
7. **Record the decision** if it changes architecture or avatar direction (D-xxx register in
   `docs/project-state.md`; cross-track status in [ROADMAP.md](./ROADMAP.md)).

Each section must have an explicit **completion criterion** ("done" condition). For test-driven
sections, "done" = all tests pass. Do not stop early; do not stop mid-loop (CLAUDE.md rules 45–46).

## 2. Audit-first policy

**Never guess. Investigate, then conclude.** Before writing anything:
- Read the relevant code, the existing docs, the decision register, and the migrations.
- Identify the real integration boundary and the root cause — not the symptom.
- If anything is unclear or requires an assumption → **STOP and ask** (CLAUDE.md rules 3, "NO
  ASSUMPTIONS"; "REFUSE if the task requires guessing").
- Do not duplicate or contradict existing documentation; consolidate mentally and point to the
  single source of truth ([ARCHITECTURE.md](./ARCHITECTURE.md) §14).

Section 157A (service audit) and 157AA (this doc set) are the canonical examples of audit-first:
inspect the whole repo, produce architecture/recommendations, **stop before changes**.

## 3. Testing requirements

Tests are the **gatekeeper** and **ground truth** (CLAUDE.md rules 1, 34, 41–44).

- **Standard one-command workflow:** `.\fix-tests.ps1` — runs Playwright; on failure invokes Claude
  to find root cause and fix, re-runs, and **auto-commits only on green**.
- **Fast smoke (daily dev, ~10s):** `npx playwright test tests/example.spec.ts --project=chromium`
  — verifies the core flow (login → question → answer).
- **Full suite (before push/release, ~55s):** `npx playwright test` — all specs on Chromium,
  Firefox, WebKit (1 worker, no parallelism), against the **live** Vercel URL.
- **Always run tests BEFORE and AFTER a change.** Never assume a fix works; re-run.
- **Never weaken a test to make it pass:** do not raise timeouts without a root cause, do not remove
  assertions, do not switch to weaker selectors, do not bypass failing conditions. **Fix the
  implementation, not the test.** A test only changes if it is _objectively_ incorrect.
- **Avatar goldens:** `tests/c2-golden/`; use `toHaveScreenshot({ animations: "disabled" })`; guard
  CSS transitions with `prefers-reduced-motion`; for reduced-motion use `page.emulateMedia`, not
  `test.use` (agent memory `project_repo_sync_model`).
- **No deploy without green tests.**

## 4. Rollback policy

- **Feature flags first.** New behaviour (especially AI — [AI_GUIDELINES.md](./AI_GUIDELINES.md))
  ships behind a **default-off flag** mirroring `AVATAR_V2`, so it can be disabled instantly without
  a code rollback. Prefer flag-off over `git revert`.
- **Avatar example:** the live `AVATAR_V2` can be rolled back with `revert 52f8365` (a one-liner,
  no data impact); golden-prep and retry commits are flag-decoupled and stay green
  (`docs/167a-...`). Rolling back shows the legacy avatar.
- **DB changes:** migrations are forward-only in practice; design changes to be **additive and
  reversible** (new nullable columns, new tables) rather than destructive. Never mutate a shipped
  immutable asset (D-018) — ship a new version.
- **Keep changes small** so a single `git revert` is a viable rollback unit.

## 5. Commit conventions

- **Conventional-commit style prefixes**, matching the existing history:
  `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:` — e.g. `feat: activate AVATAR_V2 C2
  rendering`, `docs: define Master raster wiring plan`, `test: retry local Playwright flakes once`.
- **One logical change per commit**; commit **only on green tests**; no commits with known failures.
- **Two-clone discipline** ([ARCHITECTURE.md](./ARCHITECTURE.md) §2): push from one clone,
  fast-forward-pull the other so root + `den-seje-app-frontend/` stay in sync. Frontend source is
  duplicated across both clones — apply edits to both.
- **Frontend deploys via Vercel** on push to `main`; **Edge Functions deploy separately**
  (`supabase functions deploy <name>`); **migrations** via Supabase MCP / `apply_migration`
  (note TD-3: `db push` is **forbidden** — see [`migration-workflow-policy.md`](./migration-workflow-policy.md)).
- Prefer new commits over amending; branch before committing if on a protected default branch.

## 6. Code rules (from CLAUDE.md — applied)

- **Full-file output only.** No snippets, no partial patches, no "insert this line" — replace whole
  files (CLAUDE.md rules 1, 4).
- **No hidden changes.** Modify only what the section requests; do not "improve" surrounding code,
  rename, or restructure (rules 2, 13).
- **Defensive coding (strict):** assume all data can be null/undefined; arrays may be empty; objects
  may miss fields; JSON may be malformed. Check `length` before access; use `[0]` only after
  validation; validate joined relations before access (rules 3–6; helpers in
  `supabase/functions/_shared/foundation.ts`).
- **Database safety:** `.maybeSingle()` not `.single()` unless guaranteed; prefer `.limit(1)` + `[0]`
  with null check; RLS is the authorization boundary (rule 7).
- **Deterministic flow:** no randomness in reward/correctness/progression; every path predictable
  (rule 8). The quiz state machine (`app.js`) must never reach a dead/invalid state (rule 7).
- **Errors are explicit:** no silent failures; **every code path returns a response**; Edge
  Functions always return a `Response`; errors are visible (logged via `logError`/`handleError`,
  surfaced in UI where appropriate) — but never as a student dead state (rules 9–10, 6).
- **Frontend contract is strict:** the backend must never break the response shape the frontend
  depends on (e.g. `process-event`'s `{status, correct_answer, review_text?, misconception_type?}`);
  the frontend must not crash on backend variation (rule 11).
- **Root cause over workaround:** fix the cause, not the symptom; no hacks, no temporary patches
  (rule 12, 35). **Do not reduce complexity by removing features** — fix, don't delete (rule 8/CER).

## 7. Review checklist (before marking a section done)

- [ ] Scope: only the requested change; no unrelated edits, renames, or refactors.
- [ ] Full-file replacements; no snippets/partials.
- [ ] Defensive: nulls/empties/malformed inputs handled; no `.single()` on non-guaranteed rows.
- [ ] Deterministic: no randomness in rewards/correctness; state machine stays valid.
- [ ] Errors explicit; all paths return; Edge Functions return a `Response`; no silent failures.
- [ ] Frontend contract preserved (response shapes unchanged or additively extended).
- [ ] AI work (if any) satisfies the [AI_GUIDELINES.md](./AI_GUIDELINES.md) §9 checklist.
- [ ] Tests run **before and after**; full suite green; no test weakened.
- [ ] Behind a default-off flag if it's new/risky behaviour; rollback path identified.
- [ ] Two clones in sync; correct deploy path (Vercel / functions deploy / migration).
- [ ] Decisions recorded (D-xxx in `project-state.md`; status in [ROADMAP.md](./ROADMAP.md)); docs
      point to a single source of truth (no duplication/contradiction).

## 8. Prompt conventions (working with Claude on this repo)

- State the **section number and a single, explicit task**; specify whether it is _audit/plan only_
  or _implementation_.
- Restate constraints when they matter ("no code yet", "full-file only", "do not touch tests").
- Expect Claude to **audit first and ask** rather than guess; an unclear request should produce a
  question, not an assumption.
- For AI-related prompts, store the actual model/feature prompts in the AI abstraction layer
  (versioned), not inline ad hoc ([AI_GUIDELINES.md](./AI_GUIDELINES.md) §4, §6).

## 9. Risk-assessment process

For any non-trivial change, before implementing:
1. **Classify the blast radius:** reward path / grading / auth / RLS / migration = **high risk**;
   cosmetic/UI/additive = lower risk.
2. **Identify the failure mode** and its fallback (what happens if this errors? is there a dead
   state? does it double-award?).
3. **Choose the safe boundary:** secrets → Edge only; student data off-platform → consent-gated;
   AI → advisory + fail-soft + flagged.
4. **Decide reversibility:** flag-off, additive migration, small revertible commit.
5. **Record** medium/high risks in the risk register (`docs/project-state.md` R-x) and mention them
   in the section summary.

## 10. Definition of Done

A section is **done** only when:
- The completion criterion stated for the section is met (for test-driven work: **all tests pass**).
- The review checklist (§7) passes.
- Tests are green (full suite for anything touching production behaviour).
- Changes are committed on green, deployed via the correct path, and both clones are in sync.
- Risk and decisions are recorded; relevant docs updated to keep a single source of truth.
- For AI features: the [AI_GUIDELINES.md](./AI_GUIDELINES.md) §9 checklist is fully satisfied.

If any of these cannot be satisfied, the work is **not done** — stop, surface the blocker, and
(per `CLAUDE.md`) **refuse rather than ship a rule violation.**
