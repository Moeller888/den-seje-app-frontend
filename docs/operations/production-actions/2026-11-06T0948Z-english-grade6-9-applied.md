---
time: 2026-11-06T09:48:31Z
session: b06fd411
action: Engelsk 5.000, trin 1a — 20261020125000_english_grade6_9.sql (SHA-256 2c7bb5cc379c96393839636f9fbc5c6ff8e57847de3885487f3600a8e73d1454) anvendt gennem ét apply_migration-kald med navnet english_grade6_9, filen ordret fra main 62adc668
go: Ejerens GO 2026-11-06 i session b06fd411 ("Dump taget og kontrolleret: 2.143 rækker, struktur inkluderet. GO til trin 1a alene. Kør forhåndskontrol, anvend kun 20261020125000_english_grade6_9, kontrollér 120 rækker, 0 aktive og 0 uden niveau, og stop derefter."). Godkendelsen omfattede ikke trin 1b–1d, aktivering eller tilbagerulning
---

## Skrivninger

- `public.questions` fik 120 nye rækker, alle med `is_active = false`, `learning_objective = 'english'` og
  `metadata.level_batch = 'grade6_9'`.
- Migrationens `UPDATE` satte `metadata.cefr` på de samme 120 rækker. Den er begrænset til
  `level_batch = 'grade6_9'` og har ikke rørt andre rækker.
- Migrationsloggen fik én række, `20261106094831 english_grade6_9`. Versionen er tildelt af serveren, og
  loggen har nu 169 poster.
- Ingen andre tabeller, funktioner, flag eller secrets er ændret.

## Kontrol

**Backup:** produktionen har ingen gendannelig backup (gratis plan, PITR slået fra). Ejeren tog derfor et dump
af `public.questions` (2.143 rækker med struktur) før kaldet.

**Læsende forhåndskontrol** umiddelbart før kaldet:
- `questions.difficulty_level` findes (migration A).
- Banken havde 2.143 rækker, og ingen af dem havde `level_batch`.
- Ingen eksisterende opgave har samme tekst som en af de 120. Kontrollen sammenlignede md5 af `content->>'question'`.
- Der er 0 triggere på `public.questions`.
- Tre constraints var ikke med i den lokale prøvekørsel: `questions_difficulty_level_check` (1–10.000),
  `ww2_attribute_whitelist_check` og `ww2_objective_format_check`. Jeg har læst dem, og ingen af dem afviser
  `learning_objective = 'english'` med niveauer i 1.800–9.571.
- Versionen 20261020125000 og navnet `english_grade6_9` stod ikke i migrationsloggen i forvejen.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`, uden gentagelse og uden timeout.

**Læsende efterkontrol** lige efter kaldet:

| Kontrol | Forventet | Resultat |
|---|---|---|
| Rækker i `grade6_9` | 120 | 120 |
| Aktive | 0 | 0 |
| Uden niveau eller CEFR | 0 | 0 |
| Niveauer | 1.800–9.571 | 1.800–9.571 |
| Fordeling på CEFR | A1 5, A2 28, B1 42, B2 25, C1 20 | Samme |
| Indholdsfingeraftryk | `9f3bcc25…` (repoet) | `9f3bcc25…` |
| Rækker i banken i alt | 2.263 | 2.263 |
| Rækker med `level_batch` i alt | 120 | 120 |

- Fingeraftrykket er md5 over spørgsmål, facit, svarmuligheder, niveau og CEFR for alle 120 rækker, sorteret
  efter md5 af spørgsmålet.
- Den gemte sætning i migrationsloggen har md5 `37a91d80…`, samme som filen.

**Afvigelser:** ingen.

**Virkning:** ingen for eleverne. Rækkerne er inaktive, og alle niveaumotorens udvælgelser filtrerer på
`is_active = true`.

**Tilbagerulning:** runbookens §2.8, fase 1 (`DELETE` på `level_batch = 'grade6_9'` og `NOT is_active`, efter at
`question_instances` er kontrolleret). Den er ikke udført og kræver ejerens særskilte godkendelse.

**Ikke gjort:** trin 1b–1d (30 migrationer) og hele fase 2 (aktivering). Hvert trin kræver sin egen
godkendelse.
