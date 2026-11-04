---
time: 2026-11-04T09:54:23Z
session: 43db7a63
action: H5-bootstrap anvendt — 20261101190000_question_attempts_v2_bootstrap.sql (SHA-256 55061cc48f1991cfea38efa9a9564c2f245f95381a5c097219aae710b093b010) gennem ét apply_migration-kald med navnet question_attempts_v2_bootstrap, filen ordret fra main 6738369
go: Ejerens godkendelse 2026-11-04 i session 43db7a63 ("Ja, jeg godkender anvendelsen af H5-bootstrap i produktionen", med filnavn og SHA-256). Den var separat fra merge-godkendelsen af #581. Godkendelsen omfattede ikke H5-alignment, D-327, K1, Edge-deploy eller aktivering
---

## Skrivninger

Migrationen er én DO-blok: tilstandskontrol, oprettelse og slutkontrol i ét. Den oprettede H5-skemaet:

- den unikke nøgle `question_instances_id_student_id_key (id, student_id)` på `question_instances`;
- tabellen `question_attempts` med kommentar, index `question_attempts_student_answered_idx`, RLS uden
  policies og kun SELECT for `service_role`;
- funktionerne `question_attempts_reject_update()`, `question_instances_round_guard()`,
  `process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)` og
  `process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)`;
- triggerne `question_attempts_append_only` og `question_instances_round_guard`.

Derudover:

- `service_role` fik EXECUTE på `process_question_attempt_v2` frataget igen, indtil alignment.
- Migrationsloggen fik én række: `20261104095423 question_attempts_v2_bootstrap`. Versionen er tildelt
  af serveren.
- Ingen række blev skrevet eller ændret. `question_attempts` er tom.

## Kontrol

Læsende forhåndskontrol kl. 09:30 UTC, umiddelbart før kaldet:

- De syv skrivere har den gennemgåede krop og sikkerhedstilstand. `process_question_attempt` har md5
  `2e05e769…` (G1) og `release_open_question_outside` har `b80c1c78…` (D-316).
- Der var 0 ukendte skrivere af `answered`/`repeat_count`.
- G2-værnet var præcis som gennemgået og den eneste trigger på `question_instances`.
- Der var 0 af 9 H5-objekter og 0 dubletter af `(id, student_id)`.
- Der var 5985 instanser, 80 svar og 43 åbne runder.
- Seneste version i loggen var `20261102182750`, og H5 var ikke registreret.
- Der var 0 åbne transaktioner og 0 låse på `question_instances`. Rollen var `postgres`.
- Filen på main havde SHA-256 `55061cc4…`, md5 `13d6d365…`, LF-linjeskift og 798 linjer.

Læsende efterkontrol kl. 09:54 UTC:

- Alle 9 H5-objekter findes.
- `process_question_attempt_v2` har md5 `943d0382…` og er `SECURITY DEFINER` med `search_path=""` og
  ejer `postgres`. ACL er `{postgres=X/postgres}`, så hverken `service_role`, `authenticated` eller
  `anon` har EXECUTE.
- `process_text_answer_v2` har md5 `f8809846…`, `SECURITY DEFINER`, `search_path=""`. ACL er
  `{postgres=X/postgres,service_role=X/postgres}`, så kun `service_role` har EXECUTE.
- `question_attempts_reject_update()` (`3910dd2d…`) og `question_instances_round_guard()` (`c557309a…`)
  er `SECURITY INVOKER` og kan ikke kaldes af nogen API-rolle.
- Triggerne er `open_round_requires_active_question` (G2, tgtype 23, md5 `e5627de1…`, uændret),
  `question_attempts_append_only` (tgtype 19) og `question_instances_round_guard` (tgtype 19). Alle er
  aktive.
- `question_attempts_instance_fkey` er
  `FOREIGN KEY (question_instance_id, student_id) REFERENCES question_instances(id, student_id) ON DELETE CASCADE`.
- `question_attempts` har RLS slået til, 0 policies og kun SELECT for `service_role`.
  `authenticated` og `anon` har ingen rettigheder. Tabellen har 0 rækker.
- De syv skrivere har uændrede md5.
- Der er 5985 instanser, 80 svar og 43 åbne runder, alle uændrede.
- Migrationsloggen har præcis én ny post, `20261104095423 question_attempts_v2_bootstrap`. Den gemte
  sætning har md5 `13d6d365…`, lig filens md5.

**Afvigelser:** ingen.

**Virkning:** ingen for eleverne. Intet kalder `_v2` endnu: process-event i produktionen er version 34
og kalder kun de gamle RPC'er, og H5-indsendelser er slået fra i klienten. Rundevagten gælder nu på
`question_instances`, og alle syv skrivere overholder den. Tilbagerulning før aktivering:
[question-attempts-v2-bootstrap-rollback.md](../question-attempts-v2-bootstrap-rollback.md).

**Ikke gjort:** H5-alignment (`20261101190100`), D-327, K1, Edge-deploy og aktivering. Hvert trin kræver
sin egen godkendelse.
