---
time: 2026-11-11T17:31:54Z
session: b06fd411
action: Engelsk 5.000, trin 1c, batch 4 del 2 — 20261020160002_english_level_batch4_2.sql (SHA-256 34a56caa99609d44b479babb31bc7c4eaa633c60f7715da1fb1a49e442a9ecc1) anvendt gennem ét apply_migration-kald med navnet english_level_batch4_2, filen ordret fra main f389af2e
go: Ejerens GO 2026-11-11 i session b06fd411 ("GO til næste fil: `20261020160002_english_level_batch4_2.sql`. Kør samme kontroller, anvend kun filen uændret fra main, og verificér antal nye rækker, at alle er inaktive, samt gyldige niveauer og CEFR. Anvend ingen andre filer, aktivér intet, og vent med bogføringen til hele batch 4 er anvendt. Notér også den nye ryge-opgave til ejerens vurdering."). Godkendelsen omfattede ikke batch4_3, aktivering, rettelser eller tilbagerulning
---

## Skrivninger

- `public.questions` fik 167 nye rækker. Alle har `is_active = false`, `learning_objective = 'english'` og
  `metadata.level_batch = 'batch4'`.
- Migrationen er én `INSERT … SELECT` uden `UPDATE`, `DELETE` eller DDL.
- Migrationsloggen fik én række, `20261111173154 english_level_batch4_2`. Den har nu 182 poster.
- Ingen andre tabeller, funktioner, flag eller secrets er ændret.

## Kontrol

**Læsende forhåndskontrol** umiddelbart før kaldet:
- Ingen eksisterende opgave har samme tekst som en af de 167.
- Banken havde 3.930 rækker (`batch4` 167), og 2.099 var aktive.
- Der var 0 triggere, og constraints og indeks var uændrede.
- Der var ingen nye poster i migrationsloggen siden batch4_1, og filen var ikke anvendt før.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`.

**Læsende efterkontrol:**
- `batch4` har nu 334 rækker i alt, 0 aktive og 0 uden niveau eller CEFR.
- Den nye fil har niveauer i 2.300–8.112 og fordelingen A1 3, A2 11, B1 50 og B2 103. Intet niveau i batch 4
  ligger uden for sit CEFR-interval.
- Indholdsfingeraftrykket for batch4_1 + 2, `bbce43c1…`, er identisk med repoet.
- Den gemte sætning har md5 `a0992666…`, samme som filen.
- Banken har 4.097 rækker, og antallet af aktive er uændret, 2.099.

**Afvigelser:** ingen tekniske.

**Faglige fund**, ikke rettet og registreret som åbne punkter før aktivering i runbookens §2.8. I tre rækker er
forklaringen en forfatternote i stedet for en forklaring til eleven. Facit er rigtigt i alle tre:
- "Hvad betyder 'Sounds good!'?" (niveau 4.400, A2, række-id `aebc0b79-f77b-4621-a4ac-9ce3fa867522`):
  "Flyt til A2 (fx l ≈ 4400) eller erstat med et sværere B1-udtryk."
- "Hvilket ord betyder det modsatte af 'maximum'?" (niveau 5.200, B1, række-id
  `6668f28f-7951-4888-b7fa-5b7d274781f3`): "Flyt til B1 (fx l ≈ 5200) eller erstat med et sværere antonym-par."
- "Læs: 'My grandfather was only eighteen when the war broke out, and he was twenty-three when it ended.' Hvor
  længe varede krigen?" (niveau 6.698, B1, række-id `15372b8d-039e-4125-9f34-fe7900142433`): "Kræver at forstå
  begge tal og drage en slutning – passer til B1."

**Til ejerens vurdering før aktivering**, ikke rettet: læseopgaven om krigen ovenfor handler om krig. Filen har
ingen opgave om rygning; den nye ryge-opgave i batch 4 står i batch4_1's log.

**Virkning:** ingen for eleverne, fordi rækkerne er inaktive.

**Ikke gjort:** batch4_3, aktivering og rettelserne ovenfor.
