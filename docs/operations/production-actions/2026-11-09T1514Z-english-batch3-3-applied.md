---
time: 2026-11-09T15:14:54Z
session: b06fd411
action: Engelsk 5.000, trin 1c, batch 3 del 3 — 20261020150003_english_level_batch3_3.sql (SHA-256 82224e820daf4457c29bd5c857cabb87f68945a3c9854877fd6f6fee6a25754f) anvendt gennem ét apply_migration-kald med navnet english_level_batch3_3, filen ordret fra main 406b9197
go: Ejerens GO 2026-11-09 i session b06fd411 ("GO til sidste fil i batch 3: `20261020150003_english_level_batch3_3.sql`. Kør samme kontroller, anvend kun filen uændret fra main, og verificér hele batch 3 på 500 inaktive rækker med gyldige niveauer og CEFR. Aktivér intet. Notér “heavy smoker”-opgaven til vurdering før aktivering, men ret den ikke nu. Rapportér resultatet og stop før bogføring."). Godkendelsen omfattede ikke andre filer, aktivering, rettelser eller tilbagerulning
---

## Skrivninger

- `public.questions` fik 166 nye rækker. Alle har `is_active = false`, `learning_objective = 'english'` og
  `metadata.level_batch = 'batch3'`.
- Migrationen er én `INSERT … SELECT` uden `UPDATE`, `DELETE` eller DDL.
- Migrationsloggen fik én række, `20261109151454 english_level_batch3_3`. Den har nu 180 poster.
- Ingen andre tabeller, funktioner, flag eller secrets er ændret.

## Kontrol

**Læsende forhåndskontrol** umiddelbart før kaldet:
- Ingen eksisterende opgave har samme tekst som en af de 166.
- Banken havde 3.597 rækker (`batch3` 334), og 2.099 var aktive.
- Der var 0 triggere, og constraints og indeks var uændrede.
- Der var ingen nye poster i migrationsloggen siden batch3_2, og filen var ikke anvendt før.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`.

**Læsende efterkontrol for hele batch 3:**

| Kontrol | Forventet | Resultat |
|---|---|---|
| Rækker i `batch3` | 500 | 500 |
| Aktive | 0 | 0 |
| Uden niveau eller CEFR | 0 | 0 |
| Niveauer | 2.500–10.000 | 2.500–10.000 |
| Fordeling på CEFR | A1 1, A2 72, B1 160, B2 140, C1 127 | Samme |
| Niveau uden for sit CEFR-interval | 0 | 0 |
| Indholdsfingeraftryk for alle 500 | `9addb774…` (repoet) | `9addb774…` |
| Rækker i banken i alt | 3.763 | 3.763 |
| Aktive opgaver i alt | 2.099 (uændret) | 2.099 |

Den gemte sætning har md5 `420812e9…`, samme som filen.

**Afvigelser:** ingen tekniske.

**Faglige fund**, ikke rettet og registreret som åbne punkter før aktivering i runbookens §2.8:
- "Supposing he ___ the truth, what would you do?" (niveau 8.722, C1, række-id
  `bc9fddd1-bfc2-42c1-a25f-edca68d1df90`): facit er "knew", men forklaringen siger "Hypotese om fortiden: supposing
  he had known." og passer dermed ikke til facit.
- "Hvad betyder 'unanimous'?" (niveau 8.908, C1, række-id `d5ed354d-186e-4ab2-9b8d-f5dd4dfd297a`): facit
  "enstemmig" er rigtigt, men forklaringen indeholder en forfatternote: "'anonym' bliver en reel fælde."

**Virkning:** ingen for eleverne, fordi rækkerne er inaktive.

**Tilbagerulning:** runbookens §2.8, fase 1 (`DELETE` på `level_batch = 'batch3'` og `NOT is_active`, efter at
`question_instances` er kontrolleret). Den er ikke udført og kræver ejerens særskilte godkendelse.

**Ikke gjort:** aktivering, rettelserne ovenfor og de øvrige filer i trin 1c.
