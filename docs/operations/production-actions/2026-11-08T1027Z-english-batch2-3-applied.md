---
time: 2026-11-08T10:27:51Z
session: b06fd411
action: Engelsk 5.000, trin 1c, batch 2 del 3 — 20261020140003_english_level_batch2_3.sql (SHA-256 bf95d1f19d32f9857439f2d327ff20317500c683796791bd1368b297322384f1) anvendt gennem ét apply_migration-kald med navnet english_level_batch2_3, filen ordret fra main 814f0da0
go: Ejerens GO 2026-11-08 i session b06fd411 ("GO til sidste fil i batch 2: `20261020140003_english_level_batch2_3.sql`. Kør samme kontroller, anvend kun denne fil uændret fra main, og verificér hele batch 2 på 500 inaktive rækker med gyldige niveauer og CEFR. Aktivér intet. Notér også fejlen i forklaringen til “suppose” som et åbent punkt før aktivering. Rapportér resultatet og stop før bogføring."). Godkendelsen omfattede ikke andre filer, aktivering eller tilbagerulning
---

## Skrivninger

- `public.questions` fik 166 nye rækker. Alle har `is_active = false`, `learning_objective = 'english'` og
  `metadata.level_batch = 'batch2'`.
- Migrationen er én `INSERT … SELECT` uden `UPDATE`, `DELETE` eller DDL.
- Migrationsloggen fik én række, `20261108102751 english_level_batch2_3`. Den har nu 176 poster.
- Ingen andre tabeller, funktioner, flag eller secrets er ændret.

## Kontrol

**Læsende forhåndskontrol** umiddelbart før kaldet:
- Ingen eksisterende opgave har samme tekst som en af de 166.
- Banken havde 3.097 rækker (`grade6_9` 120, `pilot` 500, `batch2` 334), og 2.099 var aktive.
- Der var 0 triggere, og constraints og indeks var uændrede.
- Der var ingen nye poster i migrationsloggen siden batch2_2, og filen var ikke anvendt før.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`.

**Læsende efterkontrol for hele batch 2:**

| Kontrol | Forventet | Resultat |
|---|---|---|
| Rækker i `batch2` | 500 | 500 |
| Aktive | 0 | 0 |
| Uden niveau eller CEFR | 0 | 0 |
| Niveauer | 2.200–10.000 | 2.200–10.000 |
| Fordeling på CEFR | A1 2, A2 82, B1 156, B2 137, C1 123 | Samme |
| Niveau uden for sit CEFR-interval | 0 | 0 |
| Indholdsfingeraftryk for alle 500 | `59c6a079…` (repoet) | `59c6a079…` |
| Rækker i banken i alt | 3.263 | 3.263 |
| Aktive opgaver i alt | 2.099 (uændret) | 2.099 |

Den gemte sætning har md5 `fed81de7…`, samme som filen.

**Afvigelser:** ingen.

**Åbne punkter før aktivering:** forklaringen til "suppose" (se loggen for batch2_2 og runbookens §2.8).

**Virkning:** ingen for eleverne, fordi rækkerne er inaktive.

**Tilbagerulning:** runbookens §2.8, fase 1 (`DELETE` på `level_batch = 'batch2'` og `NOT is_active`, efter at
`question_instances` er kontrolleret). Den er ikke udført og kræver ejerens særskilte godkendelse.

**Ikke gjort:** aktivering, rettelsen af "suppose" og de øvrige filer i trin 1c.
