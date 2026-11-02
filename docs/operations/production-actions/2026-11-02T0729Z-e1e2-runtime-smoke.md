---
time: 2026-11-02T07:29:50Z
session: e6371def
action: Runtime-smoke af E1/E2 mod produktionen med to scripts i sessionens scratchpad, pe-probe.mjs og e1e2-smoke.mjs. Begge loggede ind med testlogins fra den lokale .env og kaldede get-next-question og process-event; e1e2-smoke.mjs gjorde det 14 gange i en løkke. Registreret bagefter af session 68d6376c ud fra sessionsloggen
go: Ejerens instruks "kør runtime-smoke" kl. 07:29:03 UTC i session e6371def. Instruksen nævnte ikke konto, antal skrivninger eller sideeffekter, som D-313 nu kræver
---

## Skrivninger

- 14 nye `question_instances` blev oprettet og besvaret af én elevkonto mellem 07:30:31 og 07:31:22 UTC: 13 korrekte og 1 forkert, alle førstegangsbesvarelser.
- Kontoen er formentlig E2E-testeleven (slot 0). Dens seneste login ligger i smoke-vinduet, og den har ingen `e2e_slot`-markør. Identiteten er ikke bevist, fordi den kræver en sammenligning med hemmeligheden `TEST_STUDENT_EMAIL`.
- Sideeffekter, observeret uden før-værdier:
  - 3 daglige quests for 2026-11-02 er markeret fuldført;
  - de ugentlige quests har fremskridt;
  - streakens `last_activity_date` er 2026-11-02;
  - den daglige login-belønning blev ikke hentet.
- XP og mønter kan ikke måles: der er ingen post pr. besvarelse, og ingen før-værdi. Efter reglerne giver 13 korrekte førstegangsbesvarelser +130 XP og +65 mønter, men det er en beregning, ikke en måling.
- 1 × HTTP 500 fra `process-event` kl. 07:30:31: `question_shown_at` blev sendt som tekst, ikke som tal.
- Scriptet loggede også ind som testlæreren og kaldte `get_teacher_visibility`. Det er en læsning.

## Kontrol

- Der er 0 åbne instanser tilbage for kontoen.
- Der er ingen besvarelser fra andre elever i vinduet.
- Bedømmelsen stemmer med G1's regel 14/14.
- Ingen GitHub-workflow skrev til produktionen: `playwright.yml`'s `test`-job blev sprunget over i run 41406729011.
