# CLAUDE_WORKFLOW.md — Den Seje App

_How work is done on this project: section workflow, audit-first policy, testing, review, commits,
Definition of Done. Operationalises the rules in the root `CLAUDE.md`._
_`CLAUDE.md` (root) is authoritative and **overrides** this file on any conflict; this file explains
how to apply it day to day._
_Last reviewed: 2026-11-05 (§11 hovedsession, underagenter og produktionskø tilføjet)._

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
7. **Record the decision** if it changes architecture or avatar direction: reserve a number with
   `node tools/decisions/reserve.mjs`, then add `docs/decisions/D-NNN.md`
   ([decisions/README.md](./decisions/README.md); the table in `docs/project-state.md` is frozen at
   D-223); cross-track status in [ROADMAP.md](./ROADMAP.md).

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
  to find root cause and fix, re-runs, and reports the result. It **never stages, commits, pushes or
  opens a PR** — fixes stay in the working tree; commit/push/PR/merge happen separately under the
  `.claude/settings.json` permission model, and only on green.
- **Fast smoke (daily dev, ~10s):** `npx playwright test tests/example.spec.ts --project=chromium`
  — verifies the core flow (login → Hub → "Spil" → question → answer).
- **Full suite (before push/release, ~55s):** `npx playwright test` — all specs on Chromium,
  Firefox, WebKit (1 worker, no parallelism), against the **live** production URL.
- **Every `playwright.config.ts` run resets live test accounts — even for a single offline spec.**
  `tests/global-setup.ts` runs first and deletes `question_instances` and rewrites the profile of
  the E2E slot's accounts (slot 0 unless `E2E_SLOT` is set). Slot 0 is the account set every
  production-facing CI run uses (`E2E_SLOT_COUNT` unset), so a local live run while such a run is
  queued or running can break it. Start a live run only when `gh run list --workflow "Playwright Tests"`
  shows no `test` job queued or in progress, and never on a slot that another process may be using.
  Slots 1–3 do not exist until provisioned; provisioning creates production accounts and needs the owner.
- **CI since D-261 (D-110 phase D3):** no automatic CI run touches production data. Pull requests run
  the required `isolated-e2e (run 1)` (a throwaway local Supabase stack, `isolated-e2e.yml`); a push to
  `main` runs the same isolated suite plus the read-only **Production Smoke** (`production-smoke.yml`:
  the live bundle must equal the commit's build byte for byte, GET/OPTIONS only, no credentials). The
  production-facing suite (`playwright.yml` job `test`) runs **only** by manual dispatch, and only with
  `confirm_production` = `production-e2e` (plus `confirm_provisioning` for an inactive slot); anything
  else fails before `npm ci` or any Supabase call. `update-avatar-goldens.yml` stays a manual workflow
  that changes the live slot-0 test student — dispatch it deliberately, never beside a live run.
- **Offline run (safe beside any live run):** `npm run test:e2e:offline`
  (`playwright.offline.config.ts`) runs only the specs in `tests/offline-specs.mjs` — no
  `globalSetup`, no `.env`, credentials stripped, every `*.supabase.co` request answered locally.
  A new spec joins that list only if it meets the admission rules pinned by
  `tests/unit/offline-e2e-config.test.mjs`.
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
- **Frontend deploys via Cloudflare Workers** on merge to `main`; **Edge Functions deploy separately**
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
- [ ] Two clones in sync; correct deploy path (Cloudflare / functions deploy / migration).
- [ ] Decisions recorded (`docs/decisions/D-NNN.md` via `tools/decisions/reserve.mjs`; status in [ROADMAP.md](./ROADMAP.md)); docs
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

## 11. Hovedsession, underagenter og produktionskø (fra 2026-11-05)

Målet er én primær Claude Code-session, der koordinerer tre spor (A Fundament, B Læring, C Avatar,
se [ROADMAP.md → Samlet styring](./ROADMAP.md)) i stedet for mange selvstændige sessioner med hver
deres plan. Root-`CLAUDE.md` og guard-hooks går forud for alt i dette afsnit.

### 11.1 Hovedsessionen

- Ejer backloggen og produktionskøen i ROADMAP og sikkerhedsregistret i `project-state.md`.
- Starter hver arbejdsdag med en **statuskontrol**, ikke en audit: `git fetch` + `git log origin/main`,
  `gh pr list`, `list_migrations`, `list_edge_functions` (ezbr + `updated_at`, ikke kun versionsnummer),
  seneste CI på main, og eventuelle nye filer i `docs/operations/production-actions/`.
- Er eneste session, der udfører produktionshandlinger, og kun efter ejerens GO for netop den handling.
- Samler underagenternes resultater, verificerer dem selv (stikprøver på de påstande, der bærer
  beslutninger) og rapporterer én samlet status til ejeren.

### 11.2 Før en større opgave (proportional kontrol, ikke ny audit)

1. Findes problemet allerede i backloggen, sikkerhedsregistret, en åben PR (`gh pr list`) eller en
   D-fil? Så genbruges den ejer og den plan.
2. Klassificér risikoen:
   - **L** — UI, tekst eller indhold uden skemaændring: kun funktionelle tests.
   - **M** — nyt opgaveformat, der følger formatkontrakten (serverside-facit, DTO-allowlist,
     `interaction-kinds.ts`, kanonisk svar → `process_question_attempt`, fælles belønning, H5-request
     når aktiveret, eksisterende oplæsning): funktionelle tests + den centrale sikkerhedstest. **Ingen
     ny sikkerhedsaudit.**
   - **H** — migration, RPC, grants/RLS, Edge-autentificering, secrets, deploy eller anden
     produktionshandling: fuldt review og GO pr. handling.
3. Skriv acceptkriteriet i backlogrækken, før arbejdet starter.
4. Et nyt sikkerhedsprojekt kræver dokumentation for en konkret risiko, som eksisterende kontrakter
   ikke dækker.

### 11.3 Underagenter, worktrees og filejerskab

- Én underagent = ét afgrænset ansvar = ét isoleret git-worktree = én branch fra `origin/main` = én PR.
- Ingen to agenter skriver til samme fil samtidig. Fast ejerskab:

  | Filer | Ejer |
  |---|---|
  | `supabase/functions/get-next-question/**`, `supabase/functions/process-event/**`, migrationer for `question_attempts`/`_v2`/bedømmelses-RPC'er | Hovedsessionen (spor A) — én ændring ad gangen |
  | `tests/isolated/schema/replay-plan.mjs` | Den PR, der tilføjer en migration; kun én sådan PR ad gangen pr. agentbølge |
  | `supabase/functions/_shared/interaction-kinds.ts`, `js/answer-input.js`, format-renderere, `_shared/<format>.ts` | Spor B — ét format ad gangen |
  | `tools/avatar/**`, `assets/**` (avatar), avatar-specs og -goldens | Spor C |
  | `app.js`, `hub.html`, `js/flags.js`, `docs/ROADMAP.md`, `docs/project-state.md`, dette dokument | Hovedsessionen koordinerer; kun én åben PR ad gangen pr. fil |

- Underagenter må ikke udføre produktionshandlinger, reservere D-numre eller starte nye audits uden
  begrundelse. De rører aldrig hovedcheckoutens arbejdstræ (regel 47).
- En opgave, der overlapper en aktiv ekstern sessions område, venter på overdragelse.

### 11.4 PR'er og tests

- Små PR'er, der kan reviewes hver for sig. Merge kræver ejerens GO; grøn CI er en betingelse, ikke en
  tilladelse.
- Lokalt: de berørte unit-tests og offline-specs, commit kun på grøn exitkode. Den produktionsrettede
  Playwright-suite er en produktionsskrivning (D-313) og køres kun med GO; `isolated-e2e` i CI er den
  funktionelle gatekeeper.
- Statusord i PR'er og rapporter: PLANLAGT · UNDER UDVIKLING · IMPLEMENTERET · TESTET · PR ÅBEN ·
  MERGET · DEPLOYET/ANVENDT · PRODUKTIONSVERIFICERET. Skriv aldrig "færdig" om en plan.

### 11.5 Produktionskøen

Gælder migrationer, Edge-deploys, secrets, JWT/nøgler, feature flags, aktivering, sletning af
produktionsfunktioner og autentificeringsændringer.

1. Én produktionshandling ad gangen, i ROADMAP-køens rækkefølge.
2. Ingen handling under et andet spors observationsvindue uden koordinering.
3. Før deploy: `list_edge_functions` + diff mellem den deployede kode og det, der skal deployes. Main kan
   indeholde mere end den tilsigtede ændring (fx nøgleresolveren eller RPC'er, der ikke er anvendt).
4. Efter handlingen: verifikation og én fil i `docs/operations/production-actions/` (D-313-formatet).
5. Hver handling kræver sit eget GO. Et GO gælder kun den navngivne handling.
6. Guard-hooks omgås aldrig. En blokeret handling rapporteres til ejeren.
7. Secret-ændringer tæller alle Edge Functions én version op uden ny kode. Brug derfor `ezbr_sha256` og
   `updated_at` som bevis for kode, ikke versionsnummeret.

### 11.6 Sessioner og oprydning

- Andre sessioner lukkes kun af ejeren, og først når deres arbejde er pushet til en branch eller
  udtrykkeligt kasseret.
- Worktrees og branches ryddes kun efter en read-only klassifikation (merget/umerget, reelle ændringer
  vs. kun linjeskift, commits der ikke findes på nogen remote) og et GO pr. trin. Prune, fjernelse og
  sletning er separate handlinger.
