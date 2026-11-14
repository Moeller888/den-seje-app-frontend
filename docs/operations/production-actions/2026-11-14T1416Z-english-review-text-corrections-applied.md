---
time: 2026-11-14T14:16:53Z
session: b06fd411
action: Engelsk 5.000, rettelse af ni inaktive opgaver fra pilot og batch 2–4 — 20261113120000_english_review_text_corrections.sql (SHA-256 d47c3cc14d1a09d9f663f7fc91f6f9ba88e57e4c300dec75c3a74cecad0e5198) anvendt gennem ét apply_migration-kald med navnet english_review_text_corrections, filen ordret fra main 22e74bb8 (merge af #701)
go: Ejerens GO 2026-11-14 i session b06fd411 ("GO til at anvende kun `20261113120000_english_review_text_corrections.sql`, uændret fra main"), med læsende kontroller før og efter. Godkendelsen omfattede ikke andre filer, aktivering, bogføring eller tilbagerulning
---

## Skrivninger

- `public.questions`: præcis ni eksisterende rækker fik ny `content`. Kun nøglerne `review_text` og, i tre af
  rækkerne, `question` er ændret. Rækkerne er og forbliver `is_active = false`.

  | Række-id | `level_batch` | Ændring | Indhold før (md5) | Indhold efter (md5) |
  |---|---|---|---|---|
  | `5a26a219-5e47-493b-871b-dca3ae781da0` | `pilot` | Forklaring ("sharp memory") | `0e529d3d…` | `c804e426…` |
  | `3cf224e8-b08a-4ab3-b4d8-de4d72f09e6e` | `batch2` | Forklaring ("suppose") | `4a81b562…` | `cdd6784b…` |
  | `bc9fddd1-bfc2-42c1-a25f-edca68d1df90` | `batch3` | Forklaring ("Supposing he knew") | `ed10d888…` | `0fa74292…` |
  | `d5ed354d-186e-4ab2-9b8d-f5dd4dfd297a` | `batch3` | Forklaring ("unanimous") | `5b3e99f2…` | `7770fbb4…` |
  | `aebc0b79-f77b-4621-a4ac-9ce3fa867522` | `batch4` | Forklaring ("Sounds good!") | `4e2a93be…` | `0b5f06c4…` |
  | `6668f28f-7951-4888-b7fa-5b7d274781f3` | `batch4` | Forklaring ("maximum") | `4aadd3c8…` | `8b54516d…` |
  | `15372b8d-039e-4125-9f34-fe7900142433` | `batch4` | Opgave og forklaring: krig → London | `d1295c85…` | `adb22966…` |
  | `214ebebf-2f13-4ec4-b7ff-03be35eb2d8a` | `batch3` | Opgave og forklaring: "heavy smoker" → "heavy traffic" | `37626013…` | `504d78d6…` |
  | `29c46027-0fab-416f-b689-f444782e9a1f` | `batch4` | Opgave og forklaring: "used to smoke" → "used to play football" | `19b407cb…` | `aa39fe12…` |

- Migrationen er én `DO`-blok med én `UPDATE` på de ni id'er, uden `INSERT`, `DELETE` eller DDL.
- Migrationsloggen fik én række, `20261114141653 english_review_text_corrections`.
- Ingen andre tabeller, funktioner, flag eller secrets er ændret.

## Kontrol

**Læsende forhåndskontrol** umiddelbart før kaldet:

| Kontrol | Forventet | Resultat |
|---|---|---|
| Filen på main `22e74bb8` | Identisk med PR-headen `9b9132f3` | Identisk |
| De ni rækker findes | 9 | 9 |
| Inaktive, engelske, rigtig `level_batch` og gammelt indhold (md5 som ovenfor) | 9 | 9 |
| `question_instances` på de ni rækker | 0 | 0 |
| Migrationen findes i migrationsloggen | Nej | Nej |
| Rækker i banken i alt | 4.263 | 4.263 |
| Aktive opgaver i alt | 2.099 | 2.099 |
| Fingeraftryk af alle øvrige 4.254 rækker (id, md5 af `content` og `metadata`, `is_active`, `answer_format`, `difficulty_level`, `target_grade`, `difficulty_band`) | — | `b6d687efb1f6922b3c88664c42b4c43c` |
| Fingeraftryk af de ni rækkers øvrige felter (`metadata`, `is_active`, `answer_format`, niveau, klassetrin, bånd samt `correct`, `options` og `accepted_answers` i `content`) | — | `40f7ebf7bb1161f2b3637d4f109a2baf` |

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`. Migrationens egne vagter (9 rækker med gammelt
indhold, 0 `question_instances`, 9 ændrede rækker, 9 rækker med nyt indhold) slog derfor ikke til.

**Læsende efterkontrol:**

| Kontrol | Forventet | Resultat |
|---|---|---|
| Inaktive, engelske, rigtig `level_batch` og nyt indhold (md5 som ovenfor) | 9 | 9 |
| `question_instances` på de ni rækker | 0 | 0 |
| Migrationsloggen | `english_review_text_corrections` | `20261114141653 english_review_text_corrections` |
| Rækker i banken i alt | 4.263 (uændret) | 4.263 |
| Aktive opgaver i alt | 2.099 (uændret) | 2.099 |
| Fingeraftryk af alle øvrige 4.254 rækker | `b6d687ef…` (uændret) | `b6d687ef…` |
| Fingeraftryk af de ni rækkers øvrige felter | `40f7ebf7…` (uændret) | `40f7ebf7…` |
| Aktive rækker i `pilot`, `batch2`, `batch3` og `batch4` | 0 | 0 (alle fire portioner er inaktive) |

**Afvigelser:** ingen.

**Virkning:** ingen for eleverne, fordi alle ni rækker og alle fire portioner fortsat er inaktive. De syv åbne
forklaringsfejl og de tre opgaver til ejerens vurdering i runbookens §2.8 er dermed lukket.

**Tilbagerulning:** sæt de gamle værdier af `review_text` og `question` tilbage for de ni id'er. De står i runbookens
§2.8 og i produktionslogsene for pilot og batch 2–4. Den er ikke udført og kræver ejerens særskilte godkendelse.

**Ikke gjort:** aktivering af nogen portion. Batch 5–10 er fortsat sat på pause (ejerbeslutning 2026-11-12).
Bogføringen i repoet (denne log, `APPLIED_IN_PRODUCTION`, runbookens §2.8 og ROADMAP) skete bagefter med
ejerens særskilte GO.
