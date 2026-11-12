---
time: 2026-11-11T17:04:01Z
session: b06fd411
action: Engelsk 5.000, trin 1c, batch 4 del 1 — 20261020160001_english_level_batch4_1.sql (SHA-256 ea1e4e40bba0e3f4ccc86056bda0cb7a06520aed640ad7f866aaf9d60f29af74) anvendt gennem ét apply_migration-kald med navnet english_level_batch4_1, filen ordret fra main f389af2e
go: Ejerens GO 2026-11-11 i session b06fd411 ("Lad den eksterne apt-fejl ligge. GO til næste fil: `20261020160001_english_level_batch4_1.sql`. Kør samme forhåndskontrol, anvend kun filen uændret fra main, og verificér antal nye rækker, at alle er inaktive, samt gyldige niveauer og CEFR. Anvend ingen andre filer, aktivér intet, og vent med bogføringen til hele batch 4 er anvendt."). Godkendelsen omfattede ikke andre filer, aktivering eller tilbagerulning
---

## Skrivninger

- `public.questions` fik 167 nye rækker. Alle har `is_active = false`, `learning_objective = 'english'` og
  `metadata.level_batch = 'batch4'`.
- Migrationen er én `INSERT … SELECT` uden `UPDATE`, `DELETE` eller DDL.
- Migrationsloggen fik én række, `20261111170401 english_level_batch4_1`. Den har nu 181 poster.
- Ingen andre tabeller, funktioner, flag eller secrets er ændret.

## Kontrol

**Læsende forhåndskontrol** umiddelbart før kaldet:
- Ingen eksisterende opgave har samme tekst som en af de 167.
- Banken havde 3.763 rækker (`grade6_9` 120, `pilot` 500, `batch2` 500, `batch3` 500), og 2.099 var aktive.
- Der var 0 triggere, og constraints og indeks var uændrede (`521b53fb…` og `c2eba564…`).
- Der var ingen nye poster i migrationsloggen siden batch3_3, og filen var ikke anvendt før.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`.

**Læsende efterkontrol:**
- 167 rækker i `batch4`, 0 aktive og 0 uden niveau eller CEFR.
- Niveauerne ligger i 2.200–6.208, og fordelingen er A1 3, A2 84 og B1 80. Intet niveau ligger uden for sit
  CEFR-interval.
- Indholdsfingeraftrykket `c5b22529…` er identisk med repoet. Det dækker spørgsmål, facit, svarmuligheder,
  niveau og CEFR.
- Den gemte sætning har md5 `ceda35cf…`, samme som filen.
- Banken har 3.930 rækker, og antallet af aktive er uændret, 2.099.

**Afvigelser:** ingen tekniske.

**Til ejerens vurdering før aktivering**, ikke rettet (runbookens §2.8): opgaven "My grandfather ___ to smoke,
but he stopped years ago." (niveau 5.152, B1, række-id `29c46027-0fab-416f-b689-f444782e9a1f`) handler om rygning.

**Virkning:** ingen for eleverne, fordi rækkerne er inaktive.

**Ikke gjort:** batch4_2 og batch4_3 samt aktivering.
