---
time: 2026-11-25T19:40:22Z
session: dda698b8
action: D-387 — 20261125113412_avatar_northstar_hair_h25g2_d387.sql (SHA-256 23f16d36277784119cdf6e3d81bc48807b4ad7527f15ef2200e50da40a30f318) anvendt gennem ét apply_migration-kald med navnet avatar_northstar_hair_h25g2_d387; filens indhold ordret fra merge-committen 93ac063b (merge af #752)
go: Ejerens godkendelse 2026-11-25 i session dda698b8 ("Jeg godkender derefter anvendelse af migration 20261125113412 i produktionen, efter kontrol af at den stadig kun udvider de tilladte hårvalg og fejlteksten som beskrevet i D-387. Kontrollér også, at den ikke allerede er anvendt."). Godkendelsen omfattede ikke andre migrationer
---

## Skrivninger

- `public.validate_avatar_identity()` er erstattet (`CREATE OR REPLACE`).
  - `northstar.hair` må nu også være én af de seks værdier `h25d1-grey`, `h25d1-brown`, `h25v1-grey`, `h25v1-brown`, `h25n9-grey` og `h25n9-brown`, og fejlteksten nævner dem.
  - Alle andre regler er ordret som `20261124120000` (D-386).
- Migrationsloggen fik én række, `20261125194022 avatar_northstar_hair_h25g2_d387`.
- Ingen rækker, andre funktioner, triggere, rettigheder, flag eller secrets er ændret. Ingen andre migrationer er anvendt.

**Kaldets tekst** er filens fulde indhold, byte for byte, inklusive de indledende kommentarer.

## Kontrol

**Kontrol af indholdet før kaldet:**
- Filen i merge-committen `93ac063b` er byte for byte den samme som i den godkendte head `a5561e3e` (SHA-256 ovenfor).
- `diff` mod D-386's `20261124120000` viser kun hårlisten og fejlteksten.
- Når de seks nye værdier fjernes fra de to linjer, er funktionen tegn for tegn D-386's. Migrationen udvider altså kun de tilladte hårvalg og fejlteksten, som D-387 beskriver.

**Læsende forhåndskontrol umiddelbart før kaldet:**
- Projektet var `tjzbehwfagiwpwodsgwg`.
- Ledgeren havde ingen post for filen (0 rækker), så migrationen var ikke anvendt. Den seneste post var `20261124160706` (D-386).
- Live `validate_avatar_identity` havde md5 `285376e0014d48c5605762df3eaffe38`, D-386's udgave.
- `set_avatar_northstar(p_choice jsonb)` havde md5 `43ae34bde9bd2d5d48170c5ef8724d20`, og én trigger kaldte `validate_avatar_identity`.
- 0 profiler havde en gruppe 2-frisure.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`.

**Læsende efterkontrol 19:40:26Z:**
- Ledgerposten `20261125194022 avatar_northstar_hair_h25g2_d387` findes og er den seneste.
- Funktionsdefinitionen har md5 `635d2535ec73ff22ff319036081ecdea`, og alle seks nye værdier står i listen sammen med de tidligere.
- Uændret:
  - `set_avatar_northstar(p_choice jsonb)` (md5 `43ae34bde9bd2d5d48170c5ef8724d20`);
  - den ene trigger.

**Virkning:** ingen for eleverne. Kortene var skjult (`NORTHSTAR_HAIR_H25G2 = false` live), så kun en browser med tilvalget kunne vælge gruppe 2. Accepten er bevist ved produktionsprøven med testeleven, se `2026-11-25T1941Z-d387-group2-trial-test-pupil.md`.
