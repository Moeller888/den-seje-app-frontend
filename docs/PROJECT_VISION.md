# PROJECT_VISION.md — Den Seje App

_Permanent product north star. Stable across sections; changes here are rare and deliberate._
_Source of truth for **why** the project exists. For **how** it is built, see [ARCHITECTURE.md](./ARCHITECTURE.md)._
_Last reviewed: 2026-06-30._

---

## Vision

A Danish school platform where learning **feels like a game worth coming back to** — where a
student answers real curriculum questions, grows a character that is unmistakably _theirs_, and
a teacher keeps full authority over what "correct" and "good" mean. The long-term picture is a
warm, premium, modern mobile-game experience built on top of rigorous pedagogy, not a quiz form
with points bolted on.

## Mission

Help Danish students (roughly ages 8–16) build durable knowledge through short, well-designed
question loops, immediate and never-punitive feedback, and a progression/cosmetic system that
rewards consistent effort — while giving teachers lightweight, trustworthy tools to manage
students, review open answers, and shape content.

## Core philosophy

1. **The teacher is the authority.** Automated systems grade what is safely auto-gradable
   (multiple-choice, short text, numbers) and **defer everything ambiguous to the teacher**.
   No system silently overrides a teacher's judgement.
2. **Determinism over cleverness.** XP, coins, mastery and progression are computed by explicit,
   predictable rules (see the progression engine and state machine in
   [ARCHITECTURE.md](./ARCHITECTURE.md)). Surprise is for cosmetics, never for grading or rewards.
3. **Never-negative.** The experience encourages; it does not shame. This extends to the avatar's
   expression set (positive expressions only — decision D-024) and to feedback copy.
4. **Fail loud to the developer, soft to the child.** Errors are surfaced and logged, never
   swallowed; but a student is never left in a dead UI state — there is always a way forward.
5. **Premium feel, honest substance.** The polish (avatar, animation, game-feel) exists to serve
   engagement with genuine educational content, not to disguise its absence.

## Educational principles

- **Short loops:** login → question → answer → feedback → next. Momentum matters.
- **Spaced repetition:** correct answers schedule a later review; incorrect answers return sooner
  (see `process-event` review scheduling in [ARCHITECTURE.md](./ARCHITECTURE.md)).
- **Misconception-aware feedback:** wrong answers can carry a `review_text` and a
  `misconception_type` signal, so feedback teaches rather than merely marks.
- **Open answers belong to teachers:** long-form answers are stored for human review and awarded
  XP by a teacher's score, not by a machine.
- **Curriculum is first-class:** content is organised by grade/difficulty and topic sprints
  (history domains: Vikings, Cold War, Industrialisation, etc.), deployed via migrations.

## Target audience

- **Primary:** Danish students ~ages 8–16 (`student` role).
- **Secondary:** Teachers managing students, content and open-answer review (`teacher` role).
- **Operational:** Platform owner / administrator (`super_admin` role).
- **Scale assumption (current):** pre-launch / pilot-school scale — on the order of tens of
  classes, not mass-market. Decisions favour robustness and low operational cost over
  hyper-scale optimisation. (See the project working-model notes in agent memory.)

## Long-term goals

- A living, identity-rich avatar (the **Northstar** character) that students personalise and
  invest in over a school year.
- A scalable cosmetics shop driven by an automatable asset pipeline (no per-item manual art).
- Teacher tooling that makes review and content curation fast and trustworthy.
- Carefully-scoped, **advisory** AI assistance that accelerates teachers and enriches feedback
  **without ever taking authority** (see [AI_GUIDELINES.md](./AI_GUIDELINES.md)).
- Sustainable operation on zero-/low-cost infrastructure appropriate to a solo-maintained,
  pilot-scale product.

## What this project deliberately is NOT

- **Not** a platform where an algorithm has final say over a child's grade. Ambiguous work is a
  teacher's call.
- **Not** a casino. Randomness never decides XP, coins, correctness, or progression outcomes.
- **Not** a punitive system. No negative avatar states, no shaming feedback, no "you failed" dead ends.
- **Not** an over-engineered SPA. The frontend is intentionally a no-build, vanilla-JS static site
  (see [ARCHITECTURE.md](./ARCHITECTURE.md)); complexity lives in Supabase/Postgres where it is
  testable and secured by RLS.
- **Not** a data-harvesting product. It serves minors; data minimisation and privacy are
  constraints, not afterthoughts (see [AI_GUIDELINES.md](./AI_GUIDELINES.md) → Privacy).
- **Not** feature-maximalist. One controlled section at a time; stability over speed
  (see [CLAUDE_WORKFLOW.md](./CLAUDE_WORKFLOW.md)).

## Role of the Northstar avatar

The avatar is the **emotional engine** of retention and identity. It is not decoration; it is the
thing a student grows and recognises as "me."

- **Design intent** is fixed by `docs/avatar-vision.md` ("C2 Base Avatar Premium"): a warm,
  anime-inspired kid with large expressive eyes and a premium, modern mobile-game finish. That
  document is the binding visual goal; this file does not restate its detail.
- **Identity is reusable; art is replaceable.** The slot system, identity model
  (body_type / hairstyle / skin_tone / hair_color), equipped slots, z-model and the `AVATAR_V2`
  flag are durable architecture. The _art_ behind them can be upgraded without a rewrite.
- **Living, never negative.** Expression, presence and blink engines make the avatar feel alive;
  the expression set is permanently positive-only (D-024).
- **Current reality vs goal:** the live avatar is a functional **placeholder** (flat SVGs), not yet
  the Northstar Master character. The gap is _art production + wiring_, not architecture. See
  [AVATAR_SYSTEM.md](./AVATAR_SYSTEM.md) for the full picture and the path to the Master raster.

## Long-term AI vision

AI is a **future, advisory accelerator** — never an authority. The durable principles:

- AI may **suggest** (draft feedback, draft a grade for teacher confirmation, transcribe a photo
  or voice answer into text) but may **never** write rewards, bypass teacher review, or mutate
  authoritative state directly.
- Deterministic systems stay deterministic. AI output is an _input_ to a human or to a
  deterministic rule, never the final arbiter of XP, coins, correctness or progression.
- Every AI capability must **fail soft**: if the AI is unavailable or low-confidence, the system
  falls back to today's behaviour (e.g. "save the open answer for the teacher").
- Privacy-first: minimise what student data is sent anywhere; prefer self-hostable / zero-cost
  services; make data flows explicit and consented.
- Model-agnostic by design: AI access goes through an abstraction layer so models/providers can
  change without touching feature code.

The binding rules for all of the above live in [AI_GUIDELINES.md](./AI_GUIDELINES.md). The
service-by-service integration audit (what is even possible, and where each service may live)
is Section 157A, summarised in [ARCHITECTURE.md](./ARCHITECTURE.md) and tracked in
[ROADMAP.md](./ROADMAP.md). **As of 2026-06-30 no AI service is implemented** — this section is
vision, not current capability.
