# Avatar Vision — C2 Base Avatar Premium

_Authoritative design intent for the player avatar. This is the design GOAL all
avatar art is measured against. Locked 2026-06-14._

---

## The design goal: the C2 winner reference
- **Binding reference:** the **"C2 BASE AVATAR – PREMIUM"** concept sheet
  (ChatGPT image, 2026-06-13 14:44) — a polished, anime-inspired kid shown as a
  turnaround + near-portrait + expression set + colour palette + design-essence.
- It is the **single source of design truth** for the avatar's look and energy.

## Why it was chosen
- Human and **relatable** ("feels like me") for a Danish school platform, ages 8–16.
- Age-robust, broad appeal, strong cosmetic/wardrobe potential.
- Won a bake-off over a creature/axolotl route, a chibi study-hero, a bold
  geometric mascot, and a redesign of the legacy avatar.
- Reads as a **premium, modern mobile-game character**, not a generic flat figure.

## Binding visual qualities (MUST be present)
- **Store, udtryksfulde øjne** — large, expressive eyes; the single most important
  trait. Must read as "big and alive" at 48px and stay legible at 32px.
- **Premium / chibi / anime-inspired character** — ~4 heads, head-dominant but not
  extreme chibi; polished anime cel-shaded finish; distinct tousled hair silhouette.
- **Varm, charmerende, moderne mobilspilsfølelse** — warm harmonious palette, a
  friendly open smile, charming energy; the figure should feel "designed", premium.
- **Connected, coherent body** — no paper-doll limbs; one consistent shading
  language across the figure and its cosmetics.

## Current state vs the goal (important)
- **The current SVG avatar does NOT match the desired art direction.** The shipped
  flat-SVG C2 base matches the reference on gross proportions (head/body ratio,
  legs, arms, shoulders = LOW deviation) but deviates **CRITICALLY** on the
  reference's defining traits: **eye size** (~35–45% too small) and **art finish**
  (flat geometric vs polished anime), and therefore on overall character/silhouette.
- **The user explicitly does NOT expect to be satisfied with an SVG-only avatar.**
  SVG-only is rejected as the final art strategy (see project-state D-011).

## Success criteria (for the future raster / hybrid avatar)
1. A user **immediately recognizes the reference's character and energy** — not a
   generic figure.
2. Eyes read as **large and expressive** at 48px and remain legible at 32px.
3. The figure has a **premium, polished, modern mobile-game finish** consistent
   with the reference.
4. Warm, charming, coherent palette; connected limbs; one shading language across
   base + cosmetics.
5. Holds identity across skin tones and all hairstyles; dressable with cosmetics
   without losing the character.

## Compromises ACCEPTED
- A **neutral default outfit** (blank canvas) instead of the reference's green
  sweater, **provided** the figure still reads as the same character.
- A **hybrid** approach (raster character art layered with the existing slot /
  identity system) rather than a full ground-up raster rebuild, if it meets the
  success criteria.
- Progressive cosmetic redesign (parity first, premium finish over time).

## Compromises NOT accepted
- **Small / generic eyes** — loses the reference's signature.
- A figure not immediately recognizable as the reference's character.
- **Flat-only finish** that fails the "premium / anime" success criteria.
- Muddy/cold palette, paper-doll limbs, or inconsistent shading across cosmetics
  (the legacy and early-C2 failure modes).
- Shipping the current flat-SVG base as the FINAL art direction.

## Raster / Hybrid direction principles
1. **Identity/architecture is reusable; art is replaceable.** Keep the proven
   slot system, identity model (body_type/hairstyle/skin_tone/hair_color),
   equipped_slots, z-model, and the `AVATAR_V2` flag. Swap the ART layer.
2. **Preserve the anchor contract where possible** (viewBox 160×240, head/eye/
   shoulder/foot anchors) so blink, expression, and cosmetic layering keep working;
   document any anchor change as a contract revision.
3. **Eyes and finish are the priority** — the raster/hybrid base must hit success
   criteria #2 and #3 first.
4. **One coherent shading language** for base + all cosmetics; no mixed flat/raster
   that reintroduces the style-conflict fault.
5. **Mobile-first:** assets must stay performant and legible down to 32–48px;
   resolution/atlas/lazy-load strategy to be defined in the pipeline assessment.
6. **Gate everything behind `AVATAR_V2`** until the raster/hybrid avatar passes a
   visual QA + golden baseline against these success criteria.
7. **Eyes are a first-class, separate layer** (ADR-163B / D-012). The eyes are the
   signature feature AND a customizable dimension: the eye layer is its own render
   layer with a **tintable iris** (eye color = a token, free), designed to support
   future eye cosmetics, eye rarity, magic/rare eyes, glasses, masks, blink and the
   emotion system. Eyes are NOT baked into the Face/Expression layer (that would
   force an expression × color × variant asset explosion). Cut the eye layer from
   the same North Star so it still matches the painted face; tint only the iris base
   and keep the glossy highlight fixed.
8. **WebP asset pipeline** (D-013). Canonical 2:3 raster master (1024×1536) → served
   WebP (512×768); anchors mapped proportionally from the 160×240 geometry. PNG only
   as a capability fallback.
9. **Hair color = luminance-map tint** (D-014). Paint each hairstyle once as a neutral
   luminance map; tint via canvas multiply (8 colors free); hand-paint overrides for
   problem colors. No per-color asset explosion.
10. **Skin tone = separate base assets** (D-016). Cel-shaded skin is not reliably
    runtime-tintable; render a base per body_type × skin_tone (body owns skin).
11. **Immutable, versioned assets + manifest** (D-018). Never mutate a shipped asset;
    new version = new filename; the manifest publishes atomically; long-lived cache.
12. **Mobile-first performance budget** (D-019). First-paint < 100ms, full composite
    < 250ms, total avatar < ~350KB, decoded memory < ~15MB; hybrid loading (eager own
    avatar, lazy catalog).

> All principles above are consistent with D-011 (SVG rejected), D-011b (Hybrid
> Raster), D-012 (separate eye layer), and North Star Avatar v1.0 as the permanent
> visual target. Full pipeline rationale: `docs/adr/ADR-163D-hybrid-raster-pipeline.md`.

## Missing reference material (obtain before raster production)
- A measurable proportion spec extracted from the reference (target eye width/
  height as % of head, head/body ratio, shoulder width).
- A higher-fidelity / vector or layered source of the reference (currently a single
  raster concept image).
- References for non-neutral body types and additional skin tones (only
  neutral + medium/dark currently exist).
