---
time: 2026-11-06T19:44:52Z
session: b06fd411
action: Engelsk 5.000, trin 1b del 3 — 20261020130003_english_level_pilot_3.sql (SHA-256 0f9245ad7b13af3f8facb775df7ec2dd4fd25061b5974a2351414c804fdb50e8) anvendt gennem ét apply_migration-kald med navnet english_level_pilot_3, filen ordret fra main 8ad14c1c
go: Ejerens GO 2026-11-06 i session b06fd411 ("GO til kun 20261020130003_english_level_pilot_3.sql. Kør forhåndskontrol, anvend migrationen uændret fra main, kontrollér de nye inaktive rækker og at piloten samlet har 500 rækker med niveau/CEFR, og stop. Aktivér intet."). Godkendelsen omfattede ikke aktivering, trin 1c eller tilbagerulning
---

## Skrivninger

- `public.questions` fik 166 nye rækker. Alle har `is_active = false`, `learning_objective = 'english'` og
  `metadata.level_batch = 'pilot'`.
- Migrationen er én `INSERT … SELECT` uden `UPDATE`, `DELETE` eller DDL.
- Migrationsloggen fik én række, `20261106194452 english_level_pilot_3`. Den har nu 173 poster.
- Ingen andre tabeller, funktioner, flag eller secrets er ændret.

## Kontrol

**Læsende forhåndskontrol** umiddelbart før kaldet:
- Ingen eksisterende opgave har samme tekst som en af de 166.
- Banken havde 2.597 rækker (`grade6_9` 120, `pilot` 334), og 2.099 var aktive.
- Der var 0 triggere, og constraints og indeks var uændrede.
- Der var ingen nye poster i migrationsloggen siden pilot_2.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`.

**Læsende efterkontrol for hele piloten:**

| Kontrol | Forventet | Resultat |
|---|---|---|
| Pilotrækker | 500 | 500 |
| Aktive | 0 | 0 |
| Uden niveau eller CEFR | 0 | 0 |
| Niveauer | 3.001–10.000 | 3.001–10.000 |
| Fordeling på CEFR | A2 63, B1 162, B2 148, C1 127 | Samme |
| Indholdsfingeraftryk for alle 500 | `b65021c5…` (repoet) | `b65021c5…` |
| Rækker i banken i alt | 2.763 | 2.763 |
| Aktive opgaver i alt | 2.099 (uændret) | 2.099 |

Den gemte sætning har md5 `c1f25358…`, samme som filen.

**Afvigelser:** ingen.

**Åbent punkt før aktivering:** forklaringen til "She has a ___ memory" (se loggen for pilot_2 og runbookens
§2.8).

**Virkning:** ingen for eleverne, fordi rækkerne er inaktive.

**Tilbagerulning:** runbookens §2.8, fase 1 (`DELETE` på `level_batch = 'pilot'` og `NOT is_active`, efter at
`question_instances` er kontrolleret). Den er ikke udført og kræver ejerens særskilte godkendelse.

**Ikke gjort:** aktivering og trin 1c–1d.
