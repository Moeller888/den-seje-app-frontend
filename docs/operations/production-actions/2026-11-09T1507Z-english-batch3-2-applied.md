---
time: 2026-11-09T15:07:12Z
session: b06fd411
action: Engelsk 5.000, trin 1c, batch 3 del 2 — 20261020150002_english_level_batch3_2.sql (SHA-256 aad4670c5316efdfd6103dec4cfeefcc2cffae43bd3fe6f0aeef0b5a9a5121cd) anvendt gennem ét apply_migration-kald med navnet english_level_batch3_2, filen ordret fra main 406b9197
go: Ejerens GO 2026-11-09 i session b06fd411 ("GO til næste fil: `20261020150002_english_level_batch3_2.sql`. Kør samme kontroller, anvend kun filen uændret fra main, og verificér antal nye rækker, at alle er inaktive, samt gyldige niveauer og CEFR. Anvend ingen andre filer, aktivér intet, og vent med bogføringen til hele batch 3 er anvendt."). Godkendelsen omfattede ikke batch3_3, aktivering eller tilbagerulning
---

## Skrivninger

- `public.questions` fik 167 nye rækker. Alle har `is_active = false`, `learning_objective = 'english'` og
  `metadata.level_batch = 'batch3'`.
- Migrationen er én `INSERT … SELECT` uden `UPDATE`, `DELETE` eller DDL.
- Migrationsloggen fik én række, `20261109150712 english_level_batch3_2`. Den har nu 179 poster.
- Ingen andre tabeller, funktioner, flag eller secrets er ændret.

## Kontrol

**Læsende forhåndskontrol** umiddelbart før kaldet:
- Ingen eksisterende opgave har samme tekst som en af de 167.
- Banken havde 3.430 rækker (`batch3` 167), og 2.099 var aktive.
- Der var 0 triggere, og constraints og indeks var uændrede.
- Der var ingen nye poster i migrationsloggen siden batch3_1, og filen var ikke anvendt før.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`.

**Læsende efterkontrol:**
- `batch3` har nu 334 rækker i alt, 0 aktive og 0 uden niveau eller CEFR.
- Den nye fil har niveauer i 2.500–8.112 og fordelingen A1 1, B1 62 og B2 104. Intet niveau i batch 3 ligger
  uden for sit CEFR-interval.
- Indholdsfingeraftrykket for batch3_1 + 2, `0001f276…`, er identisk med repoet.
- Den gemte sætning har md5 `cb8b3fe6…`, samme som filen.
- Banken har 3.597 rækker, og antallet af aktive er uændret, 2.099.

**Afvigelser:** ingen tekniske.

**Til ejerens vurdering før aktivering**, ikke rettet (runbookens §2.8): opgaven "She's a ___ smoker. She smokes
forty a day." (niveau 7.982, B2, række-id `214ebebf-2f13-4ec4-b7ff-03be35eb2d8a`) handler om rygning.

**Virkning:** ingen for eleverne, fordi rækkerne er inaktive.

**Ikke gjort:** batch3_3 og aktivering.
