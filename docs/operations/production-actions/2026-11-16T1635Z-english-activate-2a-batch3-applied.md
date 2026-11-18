---
time: 2026-11-16T16:35:35Z
session: b06fd411
action: Engelsk 5.000, fase 2, trin 2a — 20261114203117_english_activate_2a_batch3.sql (SHA-256 426cde994e4ab6651431a94da1d800850d599c9084236d4d5f218124b5a5c5c6) anvendt gennem ét apply_migration-kald med navnet english_activate_2a_batch3, filen ordret fra main b4b0a18e (merge af #712)
go: Ejerens GO 2026-11-16 i session b06fd411 ("GO til kun at anvende migration `20261114203117_english_activate_2a_batch3.sql` i produktion"), med læsende kontroller før og efter. Godkendelsen omfattede ikke andre migrationer, bogføring eller yderligere ændringer
---

## Skrivninger

- `public.questions`: `is_active` blev sat til `true` for præcis de 500 engelske rækker med
  `metadata.level_batch = 'batch3'`. Indhold, niveau, metadata og alle andre rækker er uændrede.
- Migrationen er én `DO`-blok med én `UPDATE`, uden `INSERT`, `DELETE` eller DDL.
- Migrationsloggen fik én række, `20261116163535 english_activate_2a_batch3`. Serveren giver selv versionen, så den
  afviger fra filnavnets `20261114203117`.
- Ingen andre tabeller, funktioner, flag eller secrets er ændret.

## Kontrol

**Læsende forhåndskontrol** umiddelbart før kaldet:

| Kontrol | Forventet | Resultat |
|---|---|---|
| Filen på main `b4b0a18e` | Identisk med PR-headen `f743e4e7` | Identisk |
| Aktiveringsmigrationer i migrationsloggen | 0 | 0 |
| `batch3`: rækker, aktive, `question_instances` | 500, 0, 0 | 500, 0, 0 |
| `batch3`: fingeraftryk | `c6de3bd6da24bed3cc61801e909ec8da` | `c6de3bd6…` |
| `pilot`: rækker, aktive, fingeraftryk | 500, 0, `11b10d36…` | 500, 0, `11b10d36…` |
| `batch2`: rækker, aktive, fingeraftryk | 500, 0, `1071bf07…` | 500, 0, `1071bf07…` |
| `grade6_9`: rækker, aktive, fingeraftryk | 120, 0, `404da537…` | 120, 0, `404da537…` |
| `batch4`: rækker, aktive, fingeraftryk | 500, 0, `bfe61b1c…` | 500, 0, `bfe61b1c…` |
| `question_instances` på de fire øvrige portioner | 0 | 0 |
| Aktive engelske rækker med en anden `level_batch` (batch 5–10) | 0 | 0 |
| Aktive engelskopgaver i alt | 1.088 | 1.088 |

Fingeraftrykket er `md5(string_agg(md5(content::text) || '|' || difficulty_level::text || '|' ||
md5(metadata::text), ',' ORDER BY md5(content::text)))` pr. portion, det samme som migrationens egne vagter bruger.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`. Migrationens egne vagter (rækkefølge, ingen aktive
uden for de fem portioner, 500 inaktive rækker med rigtigt fingeraftryk, 0 `question_instances`, præcis 500
ændrede rækker og uændret fingeraftryk bagefter) slog derfor ikke til.

**Læsende efterkontrol** (2026-11-16 16:35:41Z):

| Kontrol | Forventet | Resultat |
|---|---|---|
| Migrationsloggen | Én ny række `english_activate_2a_batch3` | `20261116163535 english_activate_2a_batch3` (eneste aktiveringsrække) |
| `batch3`: rækker, aktive, fingeraftryk | 500, 500, `c6de3bd6…` (uændret) | 500, 500, `c6de3bd6…` |
| `pilot`, `batch2`, `grade6_9`, `batch4`: aktive | 0 | 0 i alle fire, fingeraftryk uændret |
| Aktive engelske rækker med en anden `level_batch` | 0 | 0 |
| Aktive engelskopgaver i alt | 1.588 (+500) | 1.588 |

**Opfølgende læsning ved bogføringen** (2026-11-18 17:05Z): `batch3` har fortsat 500 af 500 aktive, de fire øvrige
portioner har 0 aktive, engelsk har 1.588 aktive, og migrationsloggen har fortsat kun én aktiveringsrække. Ingen af
de fem portioner har rækker uden niveau eller CEFR. `batch3` har fået 7 `question_instances`.

**Ikke kontrolleret ved dette trin:** runbookens §2.8 nævner også et fingeraftryk af alle øvrige rækker i
`public.questions` og et opslag af navnet på `LEVEL_ENGINE`. De indgik ikke i ejerens GO og blev ikke udført.
Portionernes egne fingeraftryk og migrationens vagter dækker de fem portioner.

**Afvigelser:** ingen.

**Virkning:** elever med et engelskniveau kan nu få de 500 `batch3`-opgaver (niveau 2.200–10.000, A1–C1).

**Observation:** mindst tre skoledage med elevtrafik, fra 2026-11-16. Kriterierne og stopkriterierne står i
runbookens §2.8, fase 2 (C). Trin 2b (`pilot`) venter på, at observationen afsluttes uden stopkriterier, og kræver
sit eget GO.

**Tilbagerulning:** kun med ejerens særskilte godkendelse, aldrig `DELETE`:

```sql
UPDATE public.questions SET is_active = false
WHERE learning_objective = 'english' AND metadata->>'level_batch' = 'batch3' AND is_active;
```

Den er ikke udført.

**Ikke gjort:** trin 2b–2e. Batch 5–10 er fortsat sat på pause (ejerbeslutning 2026-11-12). Bogføringen i repoet
(denne log, `APPLIED_IN_PRODUCTION`, runbookens §2.8 og ROADMAP) skete bagefter med ejerens særskilte GO.
