# 167A — Avatar R2 pilot allowlist enablement (design, D-075)

**Status:** `DESIGN_READY_AWAITING_OWNER_DECISION`
**Type:** read-only audit + design. **Nothing is implemented.** No runtime/asset/test/golden/workflow change.
**Related:** D-071 (raster debt accepted), D-072 (pilot protocol + status), D-073 (manual onboarding kit),
D-074 (observability, console-only, owner-confirmed).
**Pilot status (unchanged):** `AUTHORIZED_BUT_NOT_STARTED`. **Test-student (unchanged):**
`LIVE_VERIFIED_IN_EPHEMERAL_TEST_BROWSER`. **`AVATAR_R2 = false`.**

---

## 1. Scope & goal

Determine the **least-risky** way to enable R2 for **specific pilot accounts centrally**, so the owner does
not have to set `localStorage.avatar_r2="1"` in each user's browser by hand — **without shipping student
identifiers to the public client, without weakening the C2 default, and without a broad activation.**

This document **audits, designs and documents** the options and sets an explicit **owner decision gate** for
a possible later runtime PR. It adds **no code**.

---

## 2. Current-state audit (verified read-only vs code)

- **The activation gate has no user id today [direct].** `isAvatarR2()` (`js/avatar-layers.js:314`) is a pure
  per-browser check: `AVATAR_R2 || localStorage.avatar_r2 === "1"`. It takes **no arguments** and never sees
  the profile or uid.
- **The identity-scoped gate also has no uid [direct].** `isAvatarR2ActiveFor(identity)` (`:456`) uses only
  the **avatar identity token** (`body_type` / `skin_tone` / `hairstyle` / `hair_color`) — no uid, no email,
  no account id.
- **The render entry point has no uid [direct].** `mountC2Avatar(rootEl, identity, opts)` receives the
  identity token and options only. The three surfaces fetch the profile (quiz `app.js` `pd`, avatar/hub
  `avatarIdentity`) but pass only the **identity token** onward.
- **Consequence [direct].** An **id-keyed allowlist** would require **threading the uid into the activation
  gate** — a **data-flow change** through the render call chain — plus a place to store the id→eligibility
  mapping. This is an architectural change, not a one-line edit.
- **The frontend bundle is public [direct].** `den-seje-app-frontend/` is served to every browser. Anything
  compiled/committed into the client JS (a hardcoded or build-injected list) is **downloadable by anyone**.
- **Wave 1 is tiny [direct, D-072].** Target 3, max 5 users. The **manual per-browser opt-in (D-073 kit)**
  already covers Wave 1 with **zero PII and zero code change**.
- **No cohort/DB scaffolding exists [direct].** ROADMAP explicitly records "Cohort / % rollout: None — only
  constant + localStorage override"; there is no server-side pilot state to build on.

---

## 3. Privacy & GDPR boundary (the crux)

This is a Danish educational app used by **children**. Student identifiers are **sensitive personal data**.

- A **client-side allowlist of student UIDs** (hardcoded, committed, or build/env-injected) **ships those
  UIDs to every visitor** in the public bundle — a direct GDPR problem and a hard contradiction of the
  no-PII discipline established in D-072/D-073/D-074 (which forbid UID/email/token even in logs).
- **Committing** UIDs to git additionally puts children's identifiers in source history permanently.
- Therefore: **no design that places a real student identifier into the client bundle or the repository is
  acceptable.** An allowlist, if ever built, must keep identifiers **server-side only**, with the client
  learning **only its own** boolean eligibility.

---

## 4. Options

### A. Client-side hardcoded / committed UID allowlist in `isAvatarR2()`
Ships children's UIDs in the public bundle and commits them to git. **Rejected** on privacy/GDPR grounds —
do not build.

### B. Build-time / env-injected UID allowlist (not committed)
Removes git exposure but **still ships the UIDs to the public client bundle** at build time. GDPR risk
persists. **Not recommended.**

### C. Opaque, non-PII per-user enable token
The owner generates a random opaque code (no PII) that a user enters once (or via a one-time URL param),
which just sets the existing `localStorage.avatar_r2` opt-in. **No uid in code, no data-flow change, no
server.** It is an **ergonomic wrapper over the existing per-browser opt-in**, not a real server-enforced
allowlist — a determined user could still self-enable, but that is already true of the localStorage opt-in
today, and R2 is **manifest-gated to neutral-medium** regardless (a manipulated client cannot force R2 on an
unsupported identity, per §2 of the pilot plan). Low value beyond the D-073 kit for a supervised pilot.

### D. Server-side eligibility flag (the only *real* allowlist)
A per-account boolean (e.g. a `profiles` column such as `avatar_r2_pilot`, RLS-protected) that the client
reads for **its own** account and maps to the opt-in. **No identifier is ever shipped in code**; the client
only learns its own flag. This is a genuine, enforceable allowlist, but it requires: a DB migration + RLS, a
read of the flag, and **plumbing the result into the activation gate** (a new gate input). It is a **backend
track** with real cost, and it changes the render data flow — an architectural change requiring owner
sign-off. Appropriate **only when scale makes per-browser onboarding impractical**.

### E. Defer — keep per-browser localStorage opt-in for the pilot — **RECOMMENDED**
For the controlled Wave-1 pilot (3–5 users) the **manual D-073 kit** already enables specific accounts
per-browser with **zero PII, zero code change, and zero data-flow change**. Build **no** allowlist now.
Revisit only if/when scale (many users, or a cohort/percentage rollout) makes manual onboarding impractical —
and then choose **option D (server-side flag)**, never a client-side UID list.

**Per-option assessment**

| Option | Real allowlist? | Ships UID to client? | Data-flow change | Backend/DB | Wave-1 value | Privacy risk | Reversibility | Recommend |
|---|---|---|---|---|---|---|---|---|
| A client committed | yes | **yes (+git)** | yes | no | low | **severe** | medium | ❌ reject |
| B build/env injected | yes | **yes** | yes | no | low | high | medium | ❌ no |
| C opaque token | no (ergonomic) | no | no | no | low | low | easy | maybe (post-pilot ergonomics) |
| D server-side flag | **yes** | no | yes | yes | low now / high at scale | low (if RLS-correct) | medium | future, at scale |
| E defer (per-browser) | n/a | no | no | no | sufficient | none | n/a | ✅ **now** |

---

## 5. Recommended decision: `NO_ALLOWLIST_FOR_PILOT` (defer)

For Wave 1, **do not build an allowlist.** Keep the per-browser `localStorage.avatar_r2` opt-in driven by the
manual D-073 onboarding kit — it already enables exactly the chosen accounts, with no PII, no code change and
no data-flow change. **If** central enablement is ever needed at larger scale, adopt **option D
(server-side eligibility flag)** — never a client-side UID list (A/B). Option C (opaque token) may be
considered later purely as an onboarding-ergonomics convenience, but adds little for a supervised pilot.

Rationale: the only options that are *real* allowlists (A/B/D) either ship children's UIDs to a public client
(A/B — unacceptable) or require a backend + data-flow change whose cost is unjustified for 3–5 supervised
users (D). The pilot's own protocol (D-072/D-073) already solves Wave-1 enablement safely.

---

## 6. If a server-side flag (option D) is chosen later — design sketch (not to build now)

- **Storage:** a nullable/boolean `profiles.avatar_r2_pilot` (default `false`), **RLS: a user may read only
  their own row's flag; only an admin/service role may set it.** No new table of ids in the client.
- **Read:** each surface already fetches the profile; extend that select to include the flag for the current
  user only.
- **Gate:** add a new gate input rather than overloading `isAvatarR2()` — e.g. an explicit
  `r2EnabledForUser` boolean passed into `mountC2Avatar` / `isAvatarR2ActiveFor`, OR OR-ed into the opt-in
  check. **Fail-closed:** any read error → treat as not-enabled → C2 (never accidentally on). The C2 default
  and the manifest neutral-medium gate stay untouched.
- **Boundaries:** no percentage/auto-cohort; owner sets the flag per account; `AVATAR_R2` stays `false`
  (the flag is per-user, not a global flip).

---

## 7. Data-flow impact (why this needs owner sign-off)

A real allowlist (D) changes the render data flow: the **uid/flag must reach the activation gate**, which
today is deliberately uid-free. Per the project's production-strict rule ("do not change data flow" without
explicit direction), building D requires an explicit owner decision and a dedicated runtime + migration PR
with goldens. E (defer) and C (token) do **not** change the render data flow.

---

## 8. Test strategy (for a later option-D PR, design only)

Unit: enabled flag → R2 eligible (with a neutral-medium identity); disabled/absent/read-error → C2 (fail-
closed); non-pilot users unaffected; C2 default byte-for-byte unchanged; `AVATAR_R2=false`. RLS: a user
cannot read another user's flag; a non-admin cannot set it. Integration/Playwright: fixture-intercepted,
self-served, no shared-student mutation — enabled fixture renders R2 on avatar/hub/quiz; disabled fixture
renders C2; no mixed stack; no broken images; existing goldens unchanged.

---

## 9. Acceptance criteria (for a later option-D PR)

No student identifier in the client bundle or repo; flag read is own-account-only (RLS-enforced); fail-closed
to C2 on any error; C2 default unchanged; manifest neutral-medium gate unchanged; no percentage/auto-cohort;
`AVATAR_R2` stays `false`; all three surfaces covered; tests green; goldens unchanged.

---

## 10. Non-goals

No client-side UID list (committed or injected) · no percentage/auto-cohort rollout · no broad R2 activation
· no UI toggle · no telemetry · no change to the manifest neutral-medium gate · no change to pilot status ·
no concrete user onboarding · no flip of `AVATAR_R2`.

---

## 11. Reversibility & rollback

- **E (recommended):** nothing to reverse — no code is added.
- **C (token):** delete the small wrapper; the underlying localStorage opt-in is unchanged.
- **D (flag):** remove the flag read + gate input; the migration/column can be dropped or left dormant
  (default `false` = no effect). R2/C2 rendering returns to per-browser opt-in only.

---

## 12. Owner decision gate

Choose one:

- **`NO_ALLOWLIST_FOR_PILOT`** — recommended (defer; keep per-browser opt-in via the D-073 kit).
- `SERVER_SIDE_ELIGIBILITY_FLAG` — build option D now (backend + data-flow change; only if scale needs it).
- `OPAQUE_ENABLE_TOKEN` — build option C (ergonomic wrapper; no PII, no server).
- `CLIENT_SIDE_UID_ALLOWLIST` — **not recommended** (ships children's UIDs to the public client; GDPR).

**Recommendation: `NO_ALLOWLIST_FOR_PILOT`.** The Wave-1 pilot is already enabled safely per-browser (D-073)
with no PII; the only *real* allowlists either leak children's UIDs (A/B) or require an unjustified backend +
data-flow change for 3–5 users (D). Revisit with option D **only** at a scale where manual onboarding is
impractical. **No code is written until the owner selects an option.**
