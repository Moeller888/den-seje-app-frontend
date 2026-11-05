---
time: 2026-11-04T20:13:00Z
session: b06fd411
action: R2-canary'en forsøgt aktiveret for én ejerstyret test-elev (LEVEL_ENGINE=canary plus allowlisten). Motoren gik ikke i gang for kontoen, og begge secrets blev fjernet igen kl. ca. 20:19 UTC
go: Ejerens GO 2026-11-04 i session b06fd411 til at aktivere R2-canary'en for præcis én eksisterende ejerstyret test-elev via ejerens manuelle vej (ejeren sætter allowlisten i dashboardet, Claude sætter LEVEL_ENGINE=canary), med ét svar og ét nyt spørgsmål som test og tilbagerulning ved fejl. Ejeren accepterede udtrykkeligt versionsstigningen fra secret-propagationen
---

Tidspunktet er omtrentligt (inden for et minut): det er kontrollen lige efter, at secret'en blev sat.

## Skrivninger

- **Secret `LEVEL_ENGINE_CANARY_STUDENT_IDS`:** oprettet af ejeren i Supabase-dashboardet med test-elevens
  auth-UUID. Værdien er hverken vist for Claude eller skrevet nogen steder.
- **Secret `LEVEL_ENGINE`:** sat til `canary` af Claude med `supabase secrets set`.
- **Elevtrafik:** kun test-eleven, gennem den normale app og udført af ejeren:
  1. ét fag åbnet. Kontoen havde et åbent, forfaldent spørgsmål, som blev serveret fra trin 1, så
     motoren blev ikke spurgt;
  2. ét svar og ét nyt spørgsmål. Svaret gav én svarrække og XP på test-kontoen, og det nye spørgsmål
     gav én ny `question_instance` på test-kontoen.
- **Tilbagerulning:** `LEVEL_ENGINE` fjernet først, derefter `LEVEL_ENGINE_CANARY_STUDENT_IDS`
  (`supabase secrets unset`).
- **Ikke ændret:** ingen deploy, migration, kode eller andre konti.

## Kontrol

**Før** (læsende): `get-next-question` var ACTIVE, `verify_jwt` false, ezbr `77e6acf8…` og `updated_at`
1793807775012. De 15 deployede filer gav præcis manifestet `1f508a84…`. Versionsnummeret var 182 i stedet
for 181, fordi ejerens oprettelse af allowlisten talte alle Edge Functions én version op uden ændret kode.
Begge niveautabeller havde 0 rækker.

**Efter testkaldet** (kun aggregeret):
- 0 5xx og 0 fejllinjer i funktionsloggen.
- Det nye spørgsmål kom fra den slukkede vej: én `FORMAT_MIX:`-linje (shadow) og **ingen
  `LEVEL_ENGINE:`-linje**.
- `student_subject_level` og `student_level_fold_log`: 0 og 0 rækker. Ingen elev fik niveaurækker.
- Der var præcis ét login i perioden, og det var en elevkonto.

**Vurdering:** allowlisten matchede ikke den indloggede konto. Kontoen er en elev, så rollekravet er ikke
årsagen. Listen lukker uden logning (§2.6.1), så årsagen kan ikke ses nærmere uden at læse værdien. Det er
ikke gjort.

**Efter tilbagerulningen:** begge secrets fandtes ikke, der var igen 11 secret-navne, og koden var uændret
(version 185, samme `updated_at` og ezbr).

## Tilbagerulning

Gennemført som beskrevet ovenfor. Secret-ændringerne kræver ingen deploy.
