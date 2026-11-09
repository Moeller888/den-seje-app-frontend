---
time: 2026-11-07T16:10:10Z
session: b06fd411
action: Engelsk 5.000, trin 1c, batch 2 del 1 — 20261020140001_english_level_batch2_1.sql (SHA-256 c2324da000ed11d8dcc1472dc5b30d2ebd89adfc42e80accc0988853d94e0120) anvendt gennem ét apply_migration-kald med navnet english_level_batch2_1, filen ordret fra main 479bb193
go: Ejerens GO 2026-11-07 i session b06fd411 ("GO til trin 1c, men kun første fil: `20261020140001_english_level_batch2_1.sql`. Kør forhåndskontrol, anvend filen uændret fra main, og verificér antal nye rækker, at alle er inaktive, samt gyldige niveauer og CEFR. Anvend ingen andre filer, aktivér intet, og rapportér resultatet."). Godkendelsen omfattede ikke andre filer, aktivering eller tilbagerulning
---

## Skrivninger

- `public.questions` fik 167 nye rækker. Alle har `is_active = false`, `learning_objective = 'english'` og
  `metadata.level_batch = 'batch2'`.
- Migrationen er én `INSERT … SELECT` uden `UPDATE`, `DELETE` eller DDL.
- Migrationsloggen fik én række, `20261107161010 english_level_batch2_1`. Den har nu 174 poster.
- Ingen andre tabeller, funktioner, flag eller secrets er ændret.

## Kontrol

**Læsende forhåndskontrol** umiddelbart før kaldet:
- Ingen eksisterende opgave har samme tekst som en af de 167.
- Banken havde 2.763 rækker (`grade6_9` 120, `pilot` 500), og 2.099 var aktive.
- Der var 0 triggere, og constraints og indeks var uændrede (`521b53fb…` og `c2eba564…`).
- Der var ingen nye poster i migrationsloggen siden pilot_3, og filen var ikke anvendt før.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`.

**Læsende efterkontrol:**
- 167 rækker i `batch2`, 0 aktive og 0 uden niveau eller CEFR.
- Niveauerne ligger i 2.200–6.110, og fordelingen er A1 1, A2 79 og B1 87. Intet niveau ligger uden for sit
  CEFR-interval. Den ene A1-opgave ligger på 2.200, inden for A1-intervallet 1.501–3.000.
- Indholdsfingeraftrykket `39551511…` er identisk med repoet. Det dækker spørgsmål, facit, svarmuligheder,
  niveau og CEFR.
- Den gemte sætning har md5 `7b887cf3…`, samme som filen.
- Banken har 2.930 rækker, og antallet af aktive er uændret, 2.099.

**Afvigelser:** ingen.

**Virkning:** ingen for eleverne, fordi rækkerne er inaktive.

**Ikke gjort:** batch2_2 og batch2_3, øvrige filer i trin 1c samt aktivering.
