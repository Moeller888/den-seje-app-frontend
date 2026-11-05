---
time: 2026-11-04T20:30:00Z
session: b06fd411
action: R2-canary'en aktiveret for præcis én ejerstyret test-elev (LEVEL_ENGINE=canary, allowlisten sat på ny af ejeren). Motoren valgte test-elevens nye spørgsmål
go: Ejerens "GO til canary-forsøg 2" 2026-11-04 i session b06fd411, efter at ejeren havde sat allowlisten igen fra den senest indloggede test-elevs User UID. Samme betingelser som forsøg 1. Ingen udvidelse af allowlisten og ingen global v1
---

Tidspunktet er omtrentligt (inden for et minut): det er kontrollen lige efter, at secret'en blev sat.

## Skrivninger

- **Secret `LEVEL_ENGINE_CANARY_STUDENT_IDS`:** oprettet igen af ejeren i dashboardet. Den indeholder kun
  test-elevens auth-UUID, og værdien er hverken vist for Claude eller skrevet nogen steder.
- **Secret `LEVEL_ENGINE`:** sat til `canary` af Claude.
- **Elevtrafik:** kun test-eleven, gennem den normale app og udført af ejeren: ét svar på det åbne
  spørgsmål fra forsøg 1 og ét nyt spørgsmål i samme fag.
- **Niveautabeller:** motorens første kørsel for test-eleven skrev 1 række i `student_subject_level` og
  45 i `student_level_fold_log`. Fold-rækkerne er test-elevens tidligere svar i faget, som blev talt med.
- **Ikke ændret:** ingen deploy, migration, kode eller andre konti.

## Kontrol

**Før** (læsende):
- `get-next-question` var ACTIVE og `verify_jwt` false, med version 187, `updated_at` 1793807775012 og
  ezbr `77e6acf8…`.
- 15 filer med manifest `1f508a84…`.
- 13 secret-navne, inklusive begge canary-navne.
- 0 og 0 rækker i niveautabellerne.

**Efter testkaldet** (kun aggregeret):
- 0 5xx og 0 fejllinjer i funktionsloggen.
- Én `LEVEL_ENGINE:`-linje med route `level`. Felterne er kun `route, subject, level, answered,
  newly_folded, seed_source, candidates, mix_kind`, og linjen indeholder ingen UUID, intet 16-tegns
  pseudonym og intet `@`.
- Alle 46 niveaurækker tilhører én elev: den eneste indloggede konto, der er en elevkonto. Ingen andre
  elever har niveaurækker.

## Tilbagerulning

Fjern `LEVEL_ENGINE` først og derefter `LEVEL_ENGINE_CANARY_STUDENT_IDS`. Det kræver ingen deploy.
Niveaurækkerne bliver liggende og bruges ikke, når motoren er slukket.
