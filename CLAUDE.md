# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

----------------------------------------
CODEBASE OVERVIEW
----------------------------------------

"Den Seje App" is a Danish educational platform where students answer questions to earn XP and coins, and teachers manage students and content.

**Stack:**
- Frontend: Vanilla JS + HTML pages, no build step, deployed to Vercel (`den-seje-app-frontend/` is the Vercel root)
- Backend: Supabase (hosted) with Deno Edge Functions (`supabase/functions/`)
- Tests: Playwright E2E, run against the live production URL

**Roles:** `student`, `teacher`, `super_admin` — stored in `profiles.role`, checked on every page load.

----------------------------------------
COMMANDS
----------------------------------------

Run all tests (standard workflow):
```
.\fix-tests.ps1
```
This runs Playwright, and if tests fail it invokes Claude to auto-fix, then re-runs and auto-commits on green.

Run tests manually (without auto-fix):
```
npx playwright test
```

Run a single test file:
```
npx playwright test tests/health.spec.ts
```

Deploy Supabase Edge Functions:
```
supabase functions deploy <function-name>
```

Deploy all functions:
```
supabase functions deploy
```

Push database migrations:
```
supabase db push
```

----------------------------------------
ARCHITECTURE
----------------------------------------

**Frontend pages and their JS:**
- `login.html` + `js/login.js` — email/password login, redirects by role
- `index.html` + `app.js` — student quiz app (main feature)
- `teacher.html` + `js/teacher.js` — teacher dashboard, student management
- `admin.html` + `js/admin.js` — super_admin view
- `shop.html` — student coin shop
- `student-detail.html` + `js/student-detail.js` — per-student detail for teachers
- `hub.html` — navigation hub

`js/supabase.js` is the shared Supabase client for all `js/` modules. `supabaseClient.js` (root) is for ESM import in `app.js`.

**Supabase Edge Functions** (`supabase/functions/`):
- `get-next-question` — returns next question for student (no JWT required)
- `process-event` — submits a student answer via `process_question_attempt` RPC, awards XP/coins
- `buy-item` — handles shop purchases, verifies coins via RLS
- `create-student` / `create-teacher` — admin account creation (no JWT)
- `reset-student` — resets student progress
- `question-context` — fetches question context (JWT required)

All Edge Functions forward the `Authorization` header to run as the calling user (RLS is enforced server-side).

**Student quiz state machine** (`app.js`):
```
IDLE → LOADING_QUESTION → AWAITING_ANSWER → SUBMITTING_ANSWER → TRANSITIONING → LOADING_QUESTION
```
Invalid transitions are blocked and logged. Never bypass this machine.

**Progression engine** (`js/progression.js`):
- Event-driven: no direct coin/XP mutation — only events (`MC_CORRECT`, `TEXT_APPROVED`, `XP_BOOST`, `REFUND`)
- State is a pure aggregate of events, no side effects in the engine itself

**Database patterns:**
- Use `.maybeSingle()` (not `.single()`) unless the row is guaranteed to exist
- Prefer `.limit(1)` + `[0]` with null check for safety
- RLS enforces authorization; Edge Functions always forward the user's JWT

**Deployment:**
- Frontend: edit files in `den-seje-app-frontend/`, commit and push from the root `.git` — Vercel auto-deploys
- Backend: `supabase functions deploy <name>` — functions are deployed independently from frontend

**Tests** (`tests/`):
- `health.spec.ts` — full student flow: login → question loads → answer → feedback → next question
- `example.spec.ts` — additional flow tests
- Tests run against `https://den-seje-app-frontend.vercel.app` (production), not localhost
- Playwright config: 3 browsers (Chromium, Firefox, WebKit), 1 worker, no parallelism

----------------------------------------
# SYSTEM RULES – PRODUCTION STRICT MODE

You are working on a production system.

You are NOT an architect.
You are an execution engine.

You must NOT:
- redesign architecture
- change data flow
- introduce new patterns
- refactor unless explicitly requested

----------------------------------------
CORE EXECUTION RULE
----------------------------------------

You must perform ONLY ONE task per request.
Do not combine multiple changes.

----------------------------------------
MANDATORY RULES (NON-NEGOTIABLE)
----------------------------------------

1. FULL FILE OUTPUT ONLY
- Always return COMPLETE files
- Never return snippets
- Never return partial code

2. NO HIDDEN CHANGES
- Only modify what is explicitly requested
- Do NOT "improve" surrounding code
- Do NOT rename anything unless instructed

3. NO ASSUMPTIONS
- If ANYTHING is unclear → STOP
- Ask instead of guessing

4. DEFENSIVE CODING (STRICT)
- Assume ALL data can be null or undefined
- Arrays may be empty
- Objects may be missing fields
- JSON may be malformed

5. ARRAY & DATA SAFETY
- Arrays are NOT data
- Always check length before access
- Never treat arrays as objects
- Use [0] only after explicit validation

6. RELATION SAFETY
- Joined relations may be null
- Nested fields may not exist
- Always validate before access

7. DATABASE SAFETY
- Never assume data exists
- Do NOT use `.single()` unless guaranteed
- Prefer limit(1) + [0] with validation

8. DETERMINISTIC FLOW ONLY
- No randomness
- No implicit behavior
- Every path must be predictable

9. ERROR HANDLING IS REQUIRED
- No silent failures
- All errors must be explicit
- ALL code paths must return a response

10. FAIL FAST (CONTROLLED)
- Stop execution on invalid data
- Return explicit error immediately

11. FRONTEND CONTRACT IS STRICT
- Backend must NEVER break response shape
- Frontend must not crash due to backend

12. NO PARTIAL FIXES
- Fix root cause only
- Do NOT patch symptoms

13. RESPECT EXISTING STRUCTURE
- Do not restructure files
- Do not move logic
- Do not introduce abstractions

----------------------------------------
RESPONSE RULES
----------------------------------------

- Always explain what you changed
- Always explain WHY
- If uncertain → ask before coding
- If rules cannot be followed → REFUSE

----------------------------------------
FAIL CONDITIONS (MUST REFUSE)
----------------------------------------

You must REFUSE if:
- The task requires guessing
- The architecture is unclear
- The change would break rules above
========================================
CLAUDE EXECUTION RULES
========================================

1. NEVER FIX TESTS TO MAKE THEM PASS
- Tests are ground truth
- Fix the implementation instead

2. NEVER INTRODUCE WORKAROUNDS
- No hacks
- No temporary fixes
- Solve root cause only

3. NEVER BREAK EXISTING FEATURES
- All existing functionality must remain intact

4. ALWAYS PRODUCE COMPLETE CODE
- No partial edits
- No "insert this line" instructions
- Full file replacements only

5. NEVER GUESS
- If unclear → investigate
- Do not assume behavior

6. FAIL LOUD, NOT SILENT
- Errors must be visible in UI
- No silent returns

7. STATE MUST ALWAYS BE VALID
- No UI dead states
- No stuck flows

8. DO NOT REDUCE SYSTEM COMPLEXITY BY REMOVING FEATURES
- Fix problems, do not remove functionality

9. ALWAYS RE-RUN TESTS AFTER CHANGES
- Never assume fix works

10. PRIORITIZE STABILITY OVER SPEED
- Correct > fast

========================================
TEST & AUTOMATION WORKFLOW
========================================

33. ALTID TEST EFTER ÆNDRINGER (AUTOMATISK)

- Brug altid:
  .\fix-tests.ps1
- Ingen manuelle test-loops
- Ingen "jeg tror det virker"

34. TESTS ER GATEKEEPER

- Kode er ikke færdig før tests passer
- Hvis tests fejler → stop og fix
- Ingen deploy uden grønne tests

35. ROOT CAUSE OVER WORKAROUND

- Fejl skal løses ved årsagen
- Timeout, retries eller bypass er ikke løsninger
- Tests må ikke svækkes for at passe

36. AI ARBEJDER FOR SYSTEMET

- Claude bruges til:
  - analysere fejl
  - finde root cause
  - implementere fixes
- Claude må ikke ændre tests uden grund

37. ÉN KOMMANDO WORKFLOW

- Standard flow:
  .\fix-tests.ps1
- Ingen manuelle mellemtrin
- Ingen copy/paste loops

38. AUTO-COMMIT KUN VED GRØNNE TESTS

- Commit må kun ske hvis alle tests passer
- Ingen commits med kendte fejl

39. HEALTH TEST ER KRITISK

- Systemet skal ikke kun virke – det skal fungere stabilt
- Flow tests (health) er lige så vigtige som unit tests

40. SYSTEMET SKAL FORBEDRES OVER TID

- Tests skal fange nye fejl
- Automation skal reducere manuel indsats
- Workflow må ikke degenerere

========================================
TEST INTEGRITY RULES (CRITICAL)
========================================

41. TESTS MUST NOT BE WEAKENED

- Do NOT increase timeouts unless root cause requires it
- Do NOT replace logic with assigns
- Do NOT remove assertions
- Do NOT bypass failing conditions

42. TEST BEFORE AND AFTER FIX

- ALWAYS run tests BEFORE making changes
- ALWAYS run tests AFTER making changes
- Never assume current state

43. SELECTORS MUST BE MEANINGFUL

- Do NOT switch to weaker selectors to pass tests
- Prefer stable, semantic selectors (#id, role)
- Do NOT rely on timing-based behavior

44. FIX THE SYSTEM, NOT THE TEST

- If a test fails → assume system issue first
- Only change tests if they are objectively incorrect

========================================
EXECUTION SCOPE CLARIFICATION
========================================

45. MULTI-STEP TASKS ARE ALLOWED WHEN EXPLICIT

- If a task explicitly requires a loop (e.g. test → fix → retest),
  it is treated as ONE task
- Do NOT stop mid-process
- Continue until completion condition is met (e.g. all tests pass)

46. COMPLETION CRITERIA IS MANDATORY

- Every task must have a clear "done" condition
- For tests: ALL tests must pass
- Do NOT stop early
