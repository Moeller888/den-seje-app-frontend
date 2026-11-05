---
time: 2026-11-04T21:59:00Z
session: b06fd411
action: Niveaumotoren aktiveret for alle elever (LEVEL_ENGINE canary → v1). Allowlist-secret'en er beholdt til hurtig tilbagegang til canary. Runbookens §2.5 er bevidst fraveget af ejeren
go: Ejerens GO 2026-11-04 i session b06fd411 til global aktivering. Ejeren fraveg §2.5 udtrykkeligt ("Jeg fraviger §2.5 bevidst og godkender global aktivering nu") og godkendte samtidig den minimale test i hvert fag med test-eleven og én times læsende, aggregeret overvågning
---

Tidspunktet er omtrentligt (inden for et minut): det er kontrollen lige efter, at secret'en blev sat.

## Skrivninger

- **Secret `LEVEL_ENGINE`:** ændret fra `canary` til `v1` af Claude. `LEVEL_ENGINE_CANARY_STUDENT_IDS` er
  uændret.
- **Elevtrafik fra testen:** kun test-eleven, gennem den normale app og udført af ejeren. I hvert af de
  tre fag var der ét svar og ét nyt spørgsmål.
- **Niveautabeller:** motoren skriver nu én række i `student_subject_level` pr. elev og fag ved elevens
  første kald, og én række i `student_level_fold_log` pr. foldet svar. Det gælder alle elever.
- **Ikke ændret:** ingen deploy, migration eller kode.

## Kontrol

### §2.5 før aktiveringen (læsende, kun aggregeret)

- **Kandidatforespørgslen** (`get_level_questions_for_student`) blev **ikke målt**. LÆRLIG-GUARD
  blokerer `execute_sql`, der kalder app-funktioner. Funktionen er `STABLE`, men guarden skelner ikke.
- **Fold-udvalget** blev målt med `EXPLAIN (ANALYZE, BUFFERS)` på den præcise `SELECT` fra
  `advance_student_level`, for den rigtige elev med den længste historik (687 besvarede historiesvar):
  - cirka 7–8 ms for selve udvalget. De øvrige ~39 ms af målingen gik til at vælge eleven;
  - indeksscanninger på `idx_qi_student_answered` og `questions_pkey`, uden fuld scanning af
    `questions`.
- **Indholdet:** 1.088 aktive engelskopgaver mod 6.090 i den lokale måling (§4.2). De mest erfarne
  elever har 152 besvarede i engelsk og 687 i historie. Der er 0 danskopgaver.
- **Ingen skrivninger fra målingen:** `questions`, `question_instances`, `student_answers`, niveautabellerne
  og `placement_sessions` havde samme rækkeantal før og efter.
- **Ejerens begrundelse for at fravige §2.5:**
  - den manglende måling skyldes guarden, ikke en fejlet eller langsom måling;
  - produktionens indhold er en brøkdel af den lokale belastningstest;
  - fold-udvalget er hurtigt;
  - canary'en lykkedes;
  - tilbagegang kræver ingen deploy.

### Lige efter ændringen

- `get-next-question` er ACTIVE og `verify_jwt` false, med version 188, `updated_at` 1793807775012 og ezbr
  `77e6acf8…`.
- 15 filer med manifest `1f508a84…`.
- 13 secret-navne, med `LEVEL_ENGINE` og allowlisten. `K1_SERVED_SNAPSHOT` findes ikke.
- OPTIONS gav 200.

### Testen i hvert fag (test-eleven)

| Fag | `LEVEL_ENGINE:`-linjer | route | kandidater | foldet |
|---|---|---|---|---|
| historie | 2 | `level` | 50 | 24 |
| engelsk | 1 | `level` | 50 | 1 |
| dansk | 1 | `level` | 0 | 0 |

Dansk har 0 opgaver i databasen, hverken aktive eller inaktive. Appen viste derfor tilstanden "alle
danskopgaver klaret". Det er manglende indhold, ikke en fejl i motoren.

Alle kald gav 200, og der var ingen 5xx eller fejllinjer. Linjerne indeholdt ingen UUID, intet 16-tegns
pseudonym og intet `@`.

### Overvågning, vindue 21:59–02:00 UTC

Kontrollen var planlagt til 23:02 UTC, men kørte først 02:00 UTC. Vinduet dækker derfor cirka fire timer.

- `get-next-question`: 12 POST og 12 OPTIONS, alle med status 200. 0 5xx.
- 0 fejl- og exception-linjer i funktionsloggen, ud af 196 linjer.
- 10 `LEVEL_ENGINE:`-linjer, alle med route `level` og uden persondata.
- `student_subject_level` har 3 rækker og `student_level_fold_log` 75. De tilhører alle én elev, som er
  test-eleven.
- Koden er uændret: version 188, samme `updated_at`, ezbr og manifest.

**Ikke verificeret:** rigtige elevers trafik. Ingen andre elever brugte appen i vinduet, der lå om
aftenen og natten. Første rigtige belastning, herunder elevernes første fold af hele historikken pr. fag
(R3), er ikke observeret.

## Tilbagerulning

- Sæt `LEVEL_ENGINE=canary` for at begrænse motoren til test-eleven igen, eller fjern `LEVEL_ENGINE` for at
  slukke den for alle. Ingen af delene kræver deploy.
- Niveaurækker, der allerede er skrevet, bliver liggende. Med motoren slukket bruges de ikke.
- Kildekoden til `get-next-question` er uændret. En kode-tilbagerulning er beskrevet i
  `docs/operations/level-engine-rollout.md` §3.1.
