# 157CB — Dedicated Staging Environment (Plan)

Status: **PLAN — partially executable now.** No production code/config/secrets changed by this doc.
Date: 2026-06-30. Owner: project owner (solo).
Gates: **prerequisite for 157D→157T and for live observability validation (157B/157C Part B).**
Builds on: [OBSERVABILITY.md](./OBSERVABILITY.md), [ARCHITECTURE.md](./ARCHITECTURE.md),
[ROADMAP.md](./ROADMAP.md), `project-state.md` D-006 (Supabase Branching endorsed over free staging).

---

## 1. Goal

A **non-production environment** where monitoring/analytics/AI feature flags can be turned **on** and
validated **without touching production or real student data**. Policy (owner, 2026-06-30): *no
external service is activated or validated against production.*

## 2. Target architecture

```
   Branch / preview deploy                 Production (unchanged, safe)
   ┌───────────────────────────┐           ┌───────────────────────────┐
   │ Vercel PREVIEW deployment │           │ Vercel prod (main)         │
   │  staging-*.vercel.app      │          │  den-seje-app-frontend...  │
   │  frontend resolves target  │          │  frontend → prod Supabase  │
   │  by hostname → STAGING     │          │  (hardcoded today)         │
   └──────────┬────────────────┘           └──────────┬────────────────┘
              ▼                                        ▼
   ┌───────────────────────────┐           ┌───────────────────────────┐
   │ Supabase STAGING (branch) │           │ Supabase PROD             │
   │  own URL + anon key        │          │  tjzbehwfagiwpwodsgwg      │
   │  own Edge secrets          │          │  (never used for staging) │
   │  ENABLE_SENTRY_EDGE=true   │          │  flags OFF                │
   │  SENTRY_ENVIRONMENT=staging│          │                            │
   └──────────┬────────────────┘           └────────────────────────────┘
              ▼
   Sentry: 2 projects (frontend + edge), events tagged environment=staging
```

Chosen (owner): **Supabase Pro branch** + **Vercel preview**. Two Sentry projects, environments
separated by the `environment` tag (not by project).

## 3. The core problem and its solution (the one real code change)

**Problem:** the frontend hardcodes the **production** Supabase URL + anon key in two files
(`js/supabase.js:3-4`, `supabaseClient.js:3-4`), and there is **no build step** to inject per-env
config. A Vercel preview today would still talk to **production** Supabase.

**Solution — a runtime environment resolver** (no build step required):

- New module `js/env-config.js` exporting `resolveEnvConfig()` → `{ environment, supabaseUrl,
  supabaseAnonKey }`, decided by **`location.hostname`**:
  - production host(s) → production values (the current literals) — **default / fallback**.
  - staging host(s) (the Vercel preview alias, e.g. `staging-den-seje-app.vercel.app`, and
    `*-git-*.vercel.app` previews) → **staging** values.
  - unknown/localhost → safest default = **production read-only** OR explicit development values.
- `js/supabase.js` and `supabaseClient.js` import the resolver instead of hardcoding. **Production
  path returns byte-identical values → zero behavioural change** (validated by the smoke test).
- `js/sentry.js` reads `environment` from the same resolver (so `flag`/`environment` tags are
  correct), and **`ENABLE_SENTRY` is gated to non-production hostnames** so prod stays off while
  staging is on — one DSN, environment-scoped.

> This is **high blast radius** (every page uses the Supabase client). It is implemented **defensively**
> (try/catch, production fallback) and only **after** staging URL+anon key exist, so the staging path
> is meaningfully validated rather than shipped blind. Until then production stays exactly as-is.

## 4. Owner privileged checklist (cannot be automated — requires your accounts/dashboards)

**A. Sentry (decision already made: 2 projects)**
- [ ] Create Sentry org (if none) + projects `den-seje-app-frontend` (Browser) and
  `den-seje-app-edge` (Deno). Copy both DSNs. (Edge DSN = secret; browser DSN = public.)

**B. Supabase staging (Pro branch)**
- [ ] Create a **persistent staging branch** (recommended over ephemeral per-PR branches, for a
  stable validation target). Record its **API URL**, **anon key**, **service_role key**.
- [ ] Confirm migrations apply to the branch (note TD-3 ledger drift; use MCP `apply_migration` if
  `db push` is blocked).
- [ ] Seed **synthetic** test accounts only (no real student PII) — staging is for fake data.

**C. Vercel preview**
- [ ] Confirm preview deployments are enabled; choose/assign a stable **staging hostname**
  (alias a preview to e.g. `staging-den-seje-app.vercel.app`) so the resolver can match it.
- [ ] (Optional) set any Vercel preview env vars if we later move config out of code.

**D. Staging secrets (on the STAGING Supabase only — never production)**
- [ ] `supabase secrets set` on the staging branch: `ENABLE_SENTRY_EDGE=true`,
  `SENTRY_DSN_EDGE=<edge-dsn>`, `SENTRY_ENVIRONMENT=staging`,
  `SENTRY_RELEASE=den-seje-app-edge@<sha>`, plus staging copies of any function secrets.

**Provide back to me for the code step:** staging **Supabase URL**, staging **anon key**, the chosen
**staging hostname(s)**, and the **frontend browser DSN** (public). I do **not** need the
service_role or edge DSN (those are secrets you set directly).

## 5. Code steps (I implement once §4 values exist)

1. Add `js/env-config.js` resolver (prod default; staging by hostname).
2. Rewire `js/supabase.js` + `supabaseClient.js` to use it (defensive; prod byte-identical).
   - Apply across both repo clones (root + `den-seje-app-frontend/`) per the sync model.
3. Gate `js/sentry.js` `ENABLE_SENTRY` to non-production hostnames + wire `environment` from resolver.
4. Validate: `node --check` all touched files; run the prod smoke test (must stay green → prod path
   unchanged); then deploy a preview and run the staging checklist.
5. Parametrise the test target: add `BASE_URL`/`STAGING_URL` env so Playwright can run against
   staging (config already loads `.env` via dotenv); keep the prod suite separate.

## 6. Validation & promotion

- Run **157B Part B** + **157C Part B** checklists against staging (flags on) — including the PII
  gate (Task 8). Only on green do we unblock 157D.
- Frontend→edge correlation: implement + validate the `x-request-id` propagation (OBSERVABILITY.md
  §7) in staging.
- Promotion to production = flip prod flags **only** after staging proves safe; production keeps its
  own (separate) decision and DSN/`environment=production`.

## 7. Teardown & cost

- Persistent branch incurs Pro branch compute — document the monthly cost; pause/delete the branch
  when not validating if cost matters at pilot scale.
- Ephemeral per-PR branches are cheaper but less stable for repeated validation — chosen approach is
  **persistent**; revisit if cost is a concern.

## 8. Risks

- **R-A (High, blast radius):** rewiring the hardcoded Supabase client touches every page. Mitigate:
  prod fallback, `node --check`, smoke test, staged rollout, both-clones sync.
- **R-B (Medium):** branch **migration drift** (TD-3) → staging schema ≠ prod. Mitigate: apply the
  same migrations; verify via `list_migrations`.
- **R-C (Medium, GDPR):** staging must use **synthetic data only**; never copy real student rows.
- **R-D (Low):** hostname matching brittleness (preview URLs vary). Mitigate: match the stable alias
  + a `*-git-*` pattern; default to production on no match.
- **R-E (Low, cost):** Pro branch compute.

## 9. Definition of Done (157CB)

- Staging Supabase (branch) + Vercel preview live; 2 Sentry projects created.
- Frontend resolves its target by environment (prod unchanged, staging → staging Supabase).
- Edge + frontend monitoring **activated in staging** (flags on), production still default-off.
- 157B/157C Part B checklists **pass in staging**, incl. PII gate and request correlation.
- Docs updated; production verified unchanged. → **then** 157D may begin.

## 10. What is executable right now vs blocked

- **Now (me):** this plan; the resolver **design**. (I can pre-write `js/env-config.js` with prod
  values only, but wiring it in without staging values is risky churn with no benefit — deferred to §5.)
- **Blocked on owner (§4):** Sentry projects/DSNs, Supabase staging branch + keys, Vercel staging
  hostname, staging secrets. These unblock §5–§6.
