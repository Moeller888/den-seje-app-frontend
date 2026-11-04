---
time: 2026-11-04T15:56:15Z
session: b06fd411
action: get-next-question deployet som version 181 fra main a7450b0fab679ca1358997d55bf332766d77d849 (15 filer, kandidatmanifest 1f508a8459f5141f1e629dec94ec979ce34bafdcecdbc650b8d6db2a2f7c3bbe), med niveaumotoren, R2-canary'en, K1, Match par og H5 slukket
go: Ejerens GO 2026-11-04 i session b06fd411 til deploy af kun get-next-question fra den fastlåste kandidat (commit, 15 filer, manifest og verify_jwt=false navngivet), med udtrykkelig accept af de to uflagede ændringer (round_no i svaret og logpseudonymet i FORMAT_MIX-linjerne). Et særskilt GO dækkede én manuel Production Smoke-kørsel og denne log. Ingen af dem omfattede secrets, migrationer, databaseændringer, flag eller aktivering
---

## Skrivninger

- **Én Edge Function:** `get-next-question` gik fra version 180 til **version 181**, `ACTIVE` og
  `verify_jwt` false. Deployet skete 2026-11-04 kl. 15:56:15 UTC (`updated_at` 1793807775012).
- **Kilde:** de 15 filer i modulgrafen fra `index.ts` plus `deno.json` på commit `a7450b0f` (merge af
  PR #582). De blev skrevet ud fra git til en isoleret mappe, der kun indeholdt de 15 filer, og
  deployet derfra med Supabase CLI 2.101.0 (`functions deploy get-next-question --use-api
  --no-verify-jwt`). CLI'en uploadede præcis de 15 filer.
- **Ny `ezbr_sha256`:** `77e6acf862b5cfd9c8224a7b84dbff328b3f3912b5fed483d2b8d2a025a5b24c`.
- **Ikke ændret:** ingen secrets, flag, migrationer eller rækker og ingen andre funktioner.
  `process-event` er stadig version 34.
- **Elevtrafik:** der er ikke skabt nogen. Kontrollerne nedenfor er læsninger, én OPTIONS og én
  Production Smoke uden konto.

### Hvad version 181 ændrer i forhold til version 180

| Ændring | Styres af | Tilstand efter deployet |
|---|---|---|
| `round_no` i svaret, og `repeat_count` læses (H5 PR 2, #494) | Intet flag | **Aktiv.** Klienten bruger kun feltet til H5-indsendelser, og dem slår `ENABLE_H5_SUBMISSIONS = false` fra. |
| Logpseudonym `pupil` i `FORMAT_MIX:`-linjerne (#379) | Intet eget flag. Skrives kun, når `QUESTION_MIX_ENGINE` giver shadow eller v2. | **Aktiv,** når mix-loggen er aktiv. Pseudonymiseret persondata (`log-pseudonym.ts`). |
| Match par (#377) | `servable: false` | Slukket |
| L1 K1 (#536) | `K1_SERVED_SNAPSHOT`, skal være præcis `on` | Slukket: secret'en findes ikke, og migration `20261103110000` er ikke anvendt |
| R2-canary pr. elev (#582) | `LEVEL_ENGINE=canary` plus allowlisten | Slukket: ingen af de to secrets findes |
| Niveaumotoren `v1` | `LEVEL_ENGINE` | Slukket: secret'en findes ikke |

H5 er ikke aktiveret. Bootstrap og alignment er anvendt, men `process-event` version 34 kalder kun de
gamle RPC'er, og H5-indsendelser er slået fra i klienten (`main` og det live site).

## Kontrol

**Før deployet** (læsende):
- `get-next-question` var version 180, `ACTIVE`, `verify_jwt` false, ezbr `3891f940…`.
- De 15 filer fra `a7450b0f` gav præcis manifestet `1f508a84…`, uden CRLF.
- Ingen fil i `supabase/functions/get-next-question/` eller `supabase/functions/_shared/` var ændret
  på main efter `a7450b0f`.
- `LEVEL_ENGINE`, `LEVEL_ENGINE_CANARY_STUDENT_IDS` og `K1_SERVED_SNAPSHOT` fandtes ikke. Kun navnene er
  læst.
- `question_instances.repeat_count` var `NOT NULL DEFAULT 0`, uden ugyldige rækker, og rundevagten var
  aktiv.

**Efter deployet** (læsende):
- `get_edge_function` viser version 181, `ACTIVE` og `verify_jwt` false. De 15 deployede filers sha256
  giver præcis kandidatmanifestet `1f508a84…`.
- De tre secrets findes stadig ikke, og der er fortsat 11 secret-navne.
- `student_subject_level` og `student_level_fold_log` har begge 0 rækker.
- `OPTIONS https://tjzbehwfagiwpwodsgwg.supabase.co/functions/v1/get-next-question` gav 200 `ok`.
- **Logs for version 181 (kun antal):**
  - 1 OPTIONS med 200 og 1 opstart på 34 ms;
  - 0 5xx, 0 `EDGE FUNCTION ERROR` og 0 `LEVEL_ENGINE:`-linjer;
  - ingen fejlniveau-linjer.
- **Manuel Production Smoke,** kørsel `41866531126` (`workflow_dispatch`): **PASS**.
  - Den kørte på `main` `349aae18`. Et dispatch kan ikke fastlåses til en commit, og `349aae18`
    adskiller sig fra `a7450b0f` kun i docs, tests og avatar-værktøjer.
  - Workflowet var uændret siden den grønne push-kørsel `41844048900`.
  - Resultater: Cloudflare-buildet var grønt. Det live site matchede bundlen (315 filer, 9 ruter, 8
    interne stier). OPTIONS til `get-next-question` og `process-event` gav 200 `ok`.
  - Smoken bruger ingen konto og laver ingen skrivninger.

**Ikke verificeret:** almindelig elevtrafik på version 181. Ved kontrollen var der endnu ingen
elevkald. Ingen observation af trafikken er godkendt.

## Tilbagerulning

- **Kilde:** de 12 filer fra commit `1aee47aaa81c8eb3c266be762ffd86bc9951ee02`, manifest
  `a6a874b7c4b01a4654679bf5d9c472cb683844f7c6ac3fe69ccf6b19d4f54603` (version 180), med samme
  parametre (`verify_jwt` false).
  - Filerne fås med `git worktree add --detach <mappe> 1aee47a`.
  - De fås ikke med `materialize-rollback`, som skriver version 179.
- **Begrænsning:** kilden gælder kun, så længe H5 ikke er aktiveret. Efter H5-aktivering vurderes
  klient, Edge-funktioner og database samlet (runbookens §3.1, "Efter H5-aktivering").
- Rollback ændrer hverken database eller secrets. Den giver et nyt versionsnummer og en ny ezbr.
