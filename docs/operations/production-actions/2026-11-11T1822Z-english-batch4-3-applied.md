---
time: 2026-11-11T18:22:11Z
session: b06fd411
action: Engelsk 5.000, trin 1c, batch 4 del 3 — 20261020160003_english_level_batch4_3.sql (SHA-256 7059c498718536ea0f17cd4bbd5131c6c0f66db12e0039394ab36d94fb7da71c) anvendt gennem ét apply_migration-kald med navnet english_level_batch4_3, filen ordret fra main f389af2e
go: Ejerens GO 2026-11-11 i session b06fd411 ("GO til sidste fil i batch 4: `20261020160003_english_level_batch4_3.sql`"), med samme kontroller og forbehold som for batch4_1 og batch4_2. Godkendelsen omfattede ikke andre filer, aktivering, rettelser, bogføring eller tilbagerulning
---

## Skrivninger

- `public.questions` fik 166 nye rækker. Alle har `is_active = false`, `learning_objective = 'english'` og
  `metadata.level_batch = 'batch4'`.
- Migrationen er én `INSERT … SELECT` uden `UPDATE`, `DELETE` eller DDL.
- Migrationsloggen fik én række, `20261111182211 english_level_batch4_3`. Den har nu 183 poster.
- Ingen andre tabeller, funktioner, flag eller secrets er ændret.

## Kontrol

**Læsende forhåndskontrol** umiddelbart før kaldet:
- Ingen eksisterende opgave har samme tekst som en af de 166.
- Banken havde 4.097 rækker (`batch4` 334), og 2.099 var aktive.
- Der var 0 triggere, og constraints og indeks var uændrede.
- Der var ingen nye poster i migrationsloggen siden batch4_2, og filen var ikke anvendt før.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`.

**Læsende efterkontrol for hele batch 4:**

| Kontrol | Forventet | Resultat |
|---|---|---|
| Rækker i `batch4` | 500 | 500 |
| Aktive | 0 | 0 |
| Uden niveau eller CEFR | 0 | 0 |
| Niveauer | 2.200–10.000 | 2.200–10.000 |
| Fordeling på CEFR | A1 6, A2 95, B1 132, B2 141, C1 126 | Samme |
| Niveau uden for sit CEFR-interval | 0 | 0 |
| Indholdsfingeraftryk for alle 500 | `c30a3508…` (repoet) | `c30a3508…` |
| Rækker i banken i alt | 4.263 | 4.263 |
| Aktive opgaver i alt | 2.099 (uændret) | 2.099 |

Den nye fil har niveauer i 6.500–10.000 og fordelingen B1 2, B2 38 og C1 126. Den gemte sætning har md5
`104c3df0…`, samme som filen.

**Afvigelser:** ingen tekniske.

**Faglige fund:** ingen i denne fil. Gennemlæsningen fandt ingen forfatternoter, intet forkert facit og ingen
opgaver om rygning eller krig.

**Virkning:** ingen for eleverne, fordi rækkerne er inaktive.

**Tilbagerulning:** runbookens §2.8, fase 1 (`DELETE` på `level_batch = 'batch4'` og `NOT is_active`, efter at
`question_instances` er kontrolleret). Den er ikke udført og kræver ejerens særskilte godkendelse.

**Ikke gjort:** aktivering, rettelserne fra batch4_2 og bogføringen. Ejeren har efterfølgende (2026-11-12) besluttet,
at batch 4 er det sidste batch i den nuværende udrulning, og at batch 5–10 er sat på pause (runbookens §2.8).
