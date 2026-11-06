---
time: 2026-11-06T19:24:37Z
session: b06fd411
action: Engelsk 5.000, trin 1b del 1 — 20261020130001_english_level_pilot_1.sql (SHA-256 e5291088f325e8b691173798ca1945727d157a4e5afeebc9c17a6aadfb7ebaaf) anvendt gennem ét apply_migration-kald med navnet english_level_pilot_1, filen ordret fra main 8ad14c1c
go: Ejerens GO 2026-11-06 i session b06fd411 ("GO til kun 20261020130001_english_level_pilot_1.sql. Kør forhåndskontrol, anvend migrationen uændret fra main, kontrollér forventet antal inaktive rækker samt niveau/CEFR, og stop. Anvend ikke pilotfil 2 eller 3 endnu."). Godkendelsen omfattede ikke pilotfil 2 og 3, aktivering eller tilbagerulning
---

## Skrivninger

- `public.questions` fik 167 nye rækker. Alle har `is_active = false`, `learning_objective = 'english'` og
  `metadata.level_batch = 'pilot'`.
- Migrationen er én `INSERT … SELECT` uden `UPDATE`, `DELETE` eller DDL.
- Migrationsloggen fik én række, `20261106192437 english_level_pilot_1`. Den har nu 171 poster.
- Ingen andre tabeller, funktioner, flag eller secrets er ændret.

## Kontrol

**Læsende forhåndskontrol** umiddelbart før kaldet:
- Ingen eksisterende opgave har samme tekst som en af de 167. Kontrollen sammenlignede md5 af
  `content->>'question'`.
- Banken havde 2.263 rækker. Kun `grade6_9` (120) havde `level_batch`, og 2.099 var aktive.
- Der var 0 triggere, og constraints var uændrede siden trin 1a.
- Én ny post i migrationsloggen fra en anden session (`20261106151348 avatar_northstar_choice`, D-357) blev
  kontrolleret og nævner ikke `questions`.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`.

**Læsende efterkontrol:**
- 167 pilotrækker, 0 aktive og 0 uden niveau eller CEFR.
- Niveauerne ligger i 3.001–6.334, og fordelingen er A2 61 og B1 106.
- Indholdsfingeraftrykket `f4b427a3…` er identisk med repoet. Det dækker spørgsmål, facit, svarmuligheder,
  niveau og CEFR.
- Den gemte sætning har md5 `a3396821…`, samme som filen.
- Banken har 2.430 rækker, og antallet af aktive er uændret, 2.099.

**Afvigelser:** ingen.

**Virkning:** ingen for eleverne, fordi rækkerne er inaktive.

**Ikke gjort:** pilotfil 2 og 3 samt aktivering.
