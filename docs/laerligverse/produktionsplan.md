# Lærligvers — integrations- og produktionsplan (F10-B2)

**Status:** plan, ikke en godkendelse. Intet her er anvendt, deployet eller aktiveret i produktionen. Hver handling
i §3 kræver ejerens særskilte GO (CLAUDE.md regel 48, `docs/migration-workflow-policy.md`, D-110).
`supabase db push` er forbudt.

**Senest kontrolleret:** 2026-11-11, mod main `edc899bd`.

Denne plan bygger videre på `docs/operations/h5-k1-activation-runbook.md`, som ejer trin A1–A10 (H5 og K1), og
gentager det ikke.

## 1. Ti adskilte tilstande

At kode er på `main`, betyder ikke, at den er aktiv. For hvert lag skal disse tilstande holdes adskilt:

1. Koden er merget til `main`.
2. Databasekontrakten er testet isoleret (PGlite, rigtig PostgreSQL i CI, K1-testbanen #652).
3. Migrationen er klar til review (vagt, tilbagerulning og verifikations-SQL er skrevet).
4. Migrationen er godkendt til produktion (ejerens GO for netop den fil).
5. Migrationen er anvendt i produktionen.
6. Edge Function er deployet.
7. Flaget er tændt.
8. Funktionen er verificeret med sikre tests (testelev, aldrig rigtige elever).
9. Begrænset elevpilot (én klasse, én lærer, aftalt periode).
10. Bredere frigivelse.

Status pr. 2026-11-11: alle lag i §2 står højst i tilstand 3. Intet er i tilstand 4 eller derover.

Et merge til `main` deployer kun frontenden (Cloudflare, allowlist i `tools/cloudflare-build-static.mjs`):

- `laerligverse/` er ikke på allowlisten, så `/laerligverse/host/` svarer 404.
- `js/` er på allowlisten. #665's kode går derfor i drift ved merge, men er slukket: `ENABLE_COURSE_PROGRESS_VIEW`
  er en konstant `false`, og `js/course-progress-view.js` indlæses kun, når den er `true`.

Intet workflow deployer Edge Functions eller anvender migrationer.

## 2. Integrationsrækkefølge (merge til main)

| # | PR | Lag | Migration (ikke i produktion) | Flag (alle slukket som standard) | Afhænger af |
|---|---|---|---|---|---|
| 1 | #652 | K1-testbane i CI | — | — | — |
| 2 | #656 | Hints i testfixturen og kontrakter | — | — | — |
| 3 | #653 | L3/L5: `served_mode`, atomisk hintlog, `request-hint` | `20261108043500` | `LAERLIGVERSE_SERVED_MODE`, `LAERLIGVERSE_ATTEMPT_CONTEXT`, `LAERLIGVERSE_HINTS` | K1 (kun i produktion); #656 for hint-teksten i testen |
| 4 | #665 | Lærerens og elevens kursusvisning | `20261109120000` (kun læsning) | `ENABLE_COURSE_PROGRESS_VIEW` (frontend-konstant) | K1 opdages under kørsel |
| 5 | #664 | K9: introduktion og præsentation | `20261109043500`, `20261110043500` | `LAERLIGVERSE_INTRODUCTION`, `LAERLIGVERSE_PRESENTED` | #653 (den er indeholdt i #664) |
| 6 | #657 | Kursusbelønninger | `20261108171500` | `LAERLIGVERSE_COURSE_REWARDS` | **NO-GO**; se §5 |

Begrundelse for rækkefølgen:

- **#656 før #653:** #653's `request_question_hint` læser hint-teksten fra `content.hints`. Uden #656 giver
  hver hintanmodning i den isolerede stak `hint_unavailable`.
- **#665 før #664:** #665 rører ingen Edge Function og ingen af #653's filer. Den kan merges uafhængigt og er
  derfor lagt tidligt.
- **#664 efter #653:** #664 indeholder #653's head (`807a9e10`). Når #653 er merget, skrumper #664's diff til
  dens egne 7 commits (22 filer). Historikken skal ikke omskrives.

Fælles filer, der skal genkontrolleres før hvert merge:

- `get-next-question`: manifesttabellen i `docs/operations/level-engine-rollout.md` og
  `tests/unit/get-next-question-release-gate.test.mjs`;
- `tests/isolated/schema/replay-plan.mjs` (`NOT_IN_PRODUCTION`);
- `tests/unit-ci-weights.json`;
- `supabase/config.toml`.

Hvert merge kræver:

- en frisk CI-kørsel mod den aktuelle `main`;
- de påkrævede checks `unit` og `isolated-e2e (run 1)` grønne;
- `isolated-e2e (run 1, K1-testprofil)` grøn;
- ejerens GO for netop den PR.

## 3. Produktionsrækkefølge (efter H5/K1-runbookens A1–A9)

| Trin | Handling | Type | Forudsætning | Verifikation (kun læsning) | Tilbagerulning |
|---|---|---|---|---|---|
| P1 | K1 og H5-aktivering som i runbookens A4–A9 | Se runbooken | Runbookens GO/NO-GO | Runbookens §4 og §8 | Runbookens §10 |
| P2 | Anvend `20261108043500` (L3/L5) | `apply_migration` | P1 grøn i 48–72 timer. Rettighederne på `question_instances` er uændrede (§4) | `served_mode` findes; `question_hint_requests` findes med RLS; de fire funktioner har de fastlåste md5'er; EXECUTE kun for `service_role` | Migrationen er én DO-blok; en afvist vagt ændrer intet. Er den anvendt: ROLLBACK-blokken i filens hoved (drop de nye objekter og kolonnen `served_mode`, genskab tabel-UPDATE). Den må kun bruges, før der findes rækker i `question_hint_requests`; bagefter kun fremad |
| P3 | Deploy `get-next-question`, `process-event` og `request-hint` fra main med L3/L5-flagene **ikke sat** | Edge-deploy (tre GO'er) | P2 | Bundle-diff mod den deployede kode; produktions-smoke grøn | Genudrul den forrige version |
| P4 | Tænd `LAERLIGVERSE_SERVED_MODE`, derefter `LAERLIGVERSE_ATTEMPT_CONTEXT` og til sidst `LAERLIGVERSE_HINTS` | Secret (ét GO pr. flag) | P3 + testelev | Testelevens forsøg får `served_mode`; en hintanmodning giver én række, også ved genforsøg | Fjern flaget |
| P5 | Anvend `20261109043500`, derefter `20261110043500` (K9) | `apply_migration` (to GO'er) | P2 | Migrationernes egne slutkontroller | Fremad. Ingen elevdata før P6 |
| P6 | Deploy `introduction-progress` og `get-next-question`. Tænd derefter `LAERLIGVERSE_INTRODUCTION` og til sidst `LAERLIGVERSE_PRESENTED` | Edge-deploy og secrets | P5 | Testelev får introduktionen før første trin | Fjern flaget |
| P7 | Anvend `20261109120000` (`get_course_progress`) | `apply_migration` | P1 (viser `mode` og `hints_used`, når K1 og L3 findes) | Læreren ser kun egne elever, eleven kun sig selv, en anden rolle får NULL | `DROP FUNCTION` (kun læsning, ingen data) |
| P8 | `ENABLE_COURSE_PROGRESS_VIEW = true` | Egen PR, merge og Cloudflare-deploy | P7 | Lærervisningen på en testelev. Manglende data vises som "Ikke registreret", aldrig som 0 | Sæt konstanten til `false` igen |
| P9 | Rettelsen af lærerbedømmelsens udbetaling: migration `20261111120000`, derefter Edge `review-answer` | `apply_migration` + Edge-deploy (to GO'er) | Uafhængig af P1–P8; skal ligge før P10 | `docs/security/review-answer-enkelt-udbetaling.md`, verifikation 1–4 | Fremad; posteringstabellen er append-only |
| P10 | Belønninger (#657) | — | §5 og `belonningsmodel-v2.md` | — | — |
| P11 | Begrænset elevpilot | Ejerbeslutning | P1–P8 (og P10, hvis belønninger skal med) | Lærerens kursusvisning, forsøgsregister, hintlog | Sluk flagene i omvendt rækkefølge |
| P12 | #616: legacy-svarfunktionerne lukkes | Migration (GO) | H5 + K1 live, `ENABLE_H5_SUBMISSIONS = true` i klienten, ingen legacy-kald i loggen i en aftalt periode | Runbookens §8 | Genskab EXECUTE (fremad-migration) |

**Legacy-vejen:** indtil P12 svarer produktionen stadig gennem de gamle svarfunktioner. Arkivskabets forsøg
registreres med L3/L5-data kun på H5-vejen. Derfor skal en pilot (P11) bruge H5-vejen, og #616 må først
lukke legacy-vejen, når ingen klient længere bruger den.

### 3.1 NO-GO-kriterier for alle trin

- **Uventet tilstand:** en vagt i migrationen afviser (ukendt md5 eller uventede rettigheder). Ingen force, ingen
  hurtig rettelse i produktionen.
- **Fejlende produktions-smoke:** den almindelige quiz fejler i `production-smoke` eller i en manuel prøve på
  testeleven.
- **Upålideligt forsøgsregister:** `question_attempts` har huller eller dobbelte forsøg (runbookens
  integritetskontroller).
- **Andre sporers arbejde i gang:** der står en anden migration eller et andet Edge-deploy i kø i samme
  vindue.

## 4. Afhængighed til sikkerhedssporet

#653's vagt kræver de nuværende tabelrettigheder på `question_instances`. I dag har `anon` og `authenticated`
UPDATE, DELETE, REFERENCES og TRIGGER (læst 2026-11-11). Migrationen erstatter tabel-UPDATE med kolonne-UPDATE.

Hvis sikkerhedssporet trækker DELETE tilbage, før P2 er udført (anbefaling i #661), afviser #653's vagt, og der
sker ingen ændring. Rækkefølgen skal derfor aftales:

- Enten P2 først og REVOKE bagefter.
- Eller sikkerhedssporets migration først, og #653's vagt opdateres i samme PR.

## 5. Kursusbelønninger (#657): NO-GO indtil

1. **Satser:** ejeren har godkendt de endelige satser (i dag er de foreløbige: 3+1 / 0 / 8+4 / 25+10 / 30+15 / 75+40).
   Beslutningen om trinvis bonus står også åben.
2. **Lange svar:** der findes en lærerbedømt vej for kursusopgaver med langt svar. Indtil da er de blokeret
   (`long_answer_items_blocked`).
3. **Ingen anden betalingsvej:** de almindelige belønnings-RPC'er betaler ikke længere kursussvar (forslaget
   `docs/laerligverse/forslag-k1-belonning-kursussvar.md`). Fejlen med gentagen XP-udbetaling i lærerens
   bedømmelse skal også være rettet; den håndteres i belønnings- og sikkerhedssporet.
4. **Produktion:** P1–P4 er i produktion, så "bestået" kan strammes til "første forsøg uden hjælp".
5. **Beståelseskriterium:** ejeren har valgt model (forslag: 3b i `belonningsmodel-v2.md`).

## 6. Kursusprogression og mastery (#647)

#647 sikrer, at kursusopgaver ikke flytter niveau eller bånd og ikke tæller i lærerens mestringstal. Den er
bygget oven på #623 og har md5-vagter på #623's funktionskroppe. #623 tilhører opgaveformssporet og er i dag
CONFLICTING og rød (2026-11-11). #647 kan derfor først gøres færdig, når #623 er grøn eller merget.

Indtil da er prod-risikoen lav: produktionen har 0 spørgsmål med `metadata.learning_step`, så ingen
kursusopgave kan påvirke niveauet i dag. #647 skal være anvendt, før der lægges kursusopgaver i produktionen
(før P11).
