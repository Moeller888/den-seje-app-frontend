---
time: 2026-11-09T14:29:35Z
session: b06fd411
action: Engelsk 5.000, trin 1c, batch 3 del 1 — 20261020150001_english_level_batch3_1.sql (SHA-256 a54569cd912627ce276af45bb1509060ad4637a8636ee8af0d8929553f0019f3) anvendt gennem ét apply_migration-kald med navnet english_level_batch3_1, filen ordret fra main 406b9197
go: Ejerens GO 2026-11-09 i session b06fd411 ("GO til næste fil: `20261020150001_english_level_batch3_1.sql`. Kør samme forhåndskontrol, anvend kun filen uændret fra main, og verificér antal nye rækker, at alle er inaktive, samt gyldige niveauer og CEFR. Anvend ingen andre filer, aktivér intet, og vent med bogføringen til hele batch 3 er anvendt."). Godkendelsen omfattede ikke andre filer, aktivering eller tilbagerulning
---

## Skrivninger

- `public.questions` fik 167 nye rækker. Alle har `is_active = false`, `learning_objective = 'english'` og
  `metadata.level_batch = 'batch3'`.
- Migrationen er én `INSERT … SELECT` uden `UPDATE`, `DELETE` eller DDL.
- Migrationsloggen fik én række, `20261109142935 english_level_batch3_1`. Den har nu 178 poster.
- Ingen andre tabeller, funktioner, flag eller secrets er ændret.

## Kontrol

**Læsende forhåndskontrol** umiddelbart før kaldet:
- Ingen eksisterende opgave har samme tekst som en af de 167.
- Banken havde 3.263 rækker (`grade6_9` 120, `pilot` 500, `batch2` 500), og 2.099 var aktive.
- Der var 0 triggere, og constraints og indeks var uændrede (`521b53fb…` og `c2eba564…`).
- Filen var ikke anvendt før.
- Én ny post i migrationsloggen fra en anden session (`20261108102949 minigame_break_interval_10min`, D-364) blev
  kontrolleret og skriver ikke til `questions`.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`.

**Læsende efterkontrol:**
- 167 rækker i `batch3`, 0 aktive og 0 uden niveau eller CEFR.
- Niveauerne ligger i 3.001–6.208, og fordelingen er A2 72 og B1 95. Intet niveau ligger uden for sit
  CEFR-interval.
- Indholdsfingeraftrykket `627ccca5…` er identisk med repoet. Det dækker spørgsmål, facit, svarmuligheder,
  niveau og CEFR.
- Den gemte sætning har md5 `2cf663de…`, samme som filen.
- Banken har 3.430 rækker, og antallet af aktive er uændret, 2.099.

**Afvigelser:** ingen.

**Virkning:** ingen for eleverne, fordi rækkerne er inaktive.

**Ikke gjort:** batch3_2 og batch3_3, øvrige filer i trin 1c samt aktivering.
