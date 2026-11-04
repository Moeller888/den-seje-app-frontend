---
time: 2026-11-04T14:06:59Z
session: 43db7a63
action: H5-alignment anvendt — 20261101190100_question_attempts_v2_align_grading.sql (SHA-256 f20281531f3e5cf51266acfb005f8f7c60c69cd836a343d2a1708bae909c8749) gennem ét apply_migration-kald med navnet question_attempts_v2_align_grading, filen ordret fra main a7450b0
go: Ejerens godkendelse 2026-11-04 i session 43db7a63 ("Ja, jeg godkender H5-alignment i produktionen", med filnavn, SHA-256 og migrationsnavn). Den var separat fra merge-godkendelsen af #585. Godkendelsen omfattede ikke D-327, K1, Edge-deploy eller aktivering
---

## Skrivninger

Migrationen er én DO-blok: vagter, erstatning, rettigheder og slutkontrol i ét.

- `process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)` fik den tilpassede bedømmelse:
  aliaser ved to eller flere poster (D-280) og G1's normalisering (`normalize_choice_answer` og
  `normalize_number_answer`). Signatur, returform, rundetjek, belønninger og `SECURITY DEFINER` er
  uændrede.
- `service_role` fik EXECUTE på `process_question_attempt_v2`. `PUBLIC`, `anon` og `authenticated` har
  ingen.
- Migrationsloggen fik én række: `20261104140659 question_attempts_v2_align_grading`. Versionen er tildelt
  af serveren.
- Ingen række blev skrevet eller ændret. `question_attempts` er tom.

## Kontrol

Læsende forhåndskontrol ca. kl. 14:00 UTC, umiddelbart før kaldet:

- Filen på main `a7450b0` havde SHA-256 `f2028153…`, md5 `808e8d50…`, LF-linjeskift og 316 linjer.
  Siden #585 var D-237 (#442), level-engine-canaryen (#582) og D-340 (#584/#587) merget. Ingen af dem
  rører H5-objekterne, og ingen af dem var anvendt i produktionen.
- `process_question_attempt` havde md5 `2e05e769…` (G1), ejer `postgres`.
- `normalize_choice_answer` (`281addc2…`) og `normalize_number_answer` (`3dadb6e1…`) var `IMMUTABLE`,
  ikke `SECURITY DEFINER`, `search_path=""`, ejer `postgres`, ACL `{postgres=X/postgres}`.
- `process_text_answer_v2` havde md5 `f8809846…`.
- `process_question_attempt_v2` havde md5 `943d0382…` og ACL `{postgres=X/postgres}`.
- G2-værnet (`e5627de1…`) og rundevagten var aktive.
- `question_attempts` havde 0 rækker. Der var 5985 instanser, 80 svar og 43 åbne runder.
- Seneste version i loggen var `20261104095423`, og alignmentet var ikke registreret.
- Der var 0 åbne transaktioner og 0 låse på `question_instances`, `question_attempts` og `_v2`. Rollen var
  `postgres`.

Læsende efterkontrol lige efter kaldet:

- `process_question_attempt_v2` har md5 `8a7696147df978e250918b2c93e20577`, `SECURITY DEFINER`,
  `search_path=""` og ejer `postgres`. ACL er `{postgres=X/postgres,service_role=X/postgres}`:
  `service_role` har EXECUTE, `authenticated` og `anon` har ikke.
- `process_question_attempt` (`2e05e769…`), `normalize_choice_answer` (`281addc2…`),
  `normalize_number_answer` (`3dadb6e1…`) og `process_text_answer_v2` (`f8809846…`) er uændrede, med
  uændrede rettigheder.
- Triggerne `open_round_requires_active_question` (G2, `e5627de1…`), `question_attempts_append_only` og
  `question_instances_round_guard` er uændrede og aktive.
- `question_attempts` har 0 rækker. Der er 5985 instanser, 80 svar og 43 åbne runder, alle uændrede.
  `student_progress`: 69 rækker, XP i alt 165694, mønter i alt 83743. Migrationen skriver ingen rækker.
- Migrationsloggen har præcis én ny post, `20261104140659 question_attempts_v2_align_grading`. Den gemte
  sætning har md5 `808e8d50…`, lig filens md5.

**Afvigelser:** ingen.

**Virkning:** ingen for eleverne. Intet kalder `_v2` endnu: process-event i produktionen er version 34
og kalder kun de gamle RPC'er, og H5-indsendelser er slået fra i klienten. Tilbagerulning før
aktivering: [question-attempts-v2-bootstrap-rollback.md](../question-attempts-v2-bootstrap-rollback.md).
Runbooken accepterer alignmentets krop med EXECUTE for `service_role`, og dens test dækker tilstanden
efter bootstrap og alignment.

**Ikke gjort:** D-327 (`20261103100000`), K1, Edge-deploy og aktivering. Hvert trin kræver sin egen
godkendelse.
