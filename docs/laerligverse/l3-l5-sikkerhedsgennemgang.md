# Lærligverse L3/L5: sikkerhedsgennemgang af migration `20261108043500`

**Status: gennemgang af et udkast (2026-11-08).** Migrationen er ikke anvendt, og alle fire Edge-flag er slukket:
`LAERLIGVERSE_SERVED_MODE`, `LAERLIGVERSE_ATTEMPT_CONTEXT`, `LAERLIGVERSE_HINTS` og broens `serverHints`.

Kontrakten står i [evidens-datakontrakt.md](evidens-datakontrakt.md). Denne side beskriver kun, hvem der må hvad. Hvert punkt er bevist med en navngiven test. Hvor noget kun er ræsonneret, står det udtrykkeligt.

## 1. Resultat

**Ingen reelle sikkerhedsfund i migrationen eller de nye funktioner.**

Observationer om eksisterende tilstand, som migrationen ikke ændrer:
- **DELETE på `question_instances`:** `anon` og `authenticated` har stadig tabelrettigheden DELETE. RLS har ingen DELETE-politik, så sletningen rammer 0 rækker (testet). Det er uændret siden baseline.
- **`search_path` med `public`:** de ældre SECURITY DEFINER-funktioner `process_question_attempt`, `process_text_answer` og `request_repeat_question_for_student` har `search_path = public, pg_temp`, og `release_open_question_outside` har `search_path = public`. Stien er fastlåst, men ikke tom. De nye funktioner bruger alle `search_path = ''`.
- **#610 og `question_instances`:** anti-gætte-pausen (#610) ændrer **ingen** rettigheder eller politikker på `question_instances`. Den tilføjer kun to triggere. Kolonnerettigheden og politikken i #610 ligger på `quiz_cooldown_state`. Migrationens rettighedsomlægning er derfor uændret efter #610, og guarden kontrollerer udgangspunktet.

## 1a. Bekræftelse: #653 udvider ikke angrebsfladen og svækker ikke RLS

**Konklusion:** ingen rolle får en databaserettighed, den ikke havde. `anon` og `authenticated` mister tabel-UPDATE (indsnævring), og RLS er enten uændret eller slået til.

**Hver rettighed, migrationen tilføjer eller fjerner:**

| Objekt | Rolle | Fjernet | Tilføjet | Nettoeffekt |
|---|---|---|---|---|
| `question_instances` (tabel) | `anon`, `authenticated` | UPDATE (tabelniveau) | UPDATE (kolonneniveau) på alle kolonner, der fandtes før filen, undtagen `served_mode` | Uændret på de eksisterende kolonner. **Ingen** rettighed til `served_mode` og fremtidige kolonner, så rettighederne er **snævrere** end før. RLS har stadig ingen UPDATE-politik, så UPDATE rammer 0 rækker |
| `question_instances.served_mode` | `anon`, `authenticated` | — | — | Ingen SELECT, INSERT eller UPDATE |
| `question_instances` | `service_role`, `PUBLIC` | — | — | Uændret |
| `question_hint_requests` (ny tabel) | `PUBLIC`, `anon`, `authenticated` | ALL (også Supabases standardrettigheder for nye tabeller) | — | Ingen adgang. RLS er slået til uden politikker |
| `question_hint_requests` | `service_role` | ALL | SELECT, INSERT | Kun læsning og tilføjelse. Ingen UPDATE, DELETE eller TRUNCATE |
| `request_question_hint`, `process_question_attempt_with_context`, `process_text_answer_with_context` (nye) | `PUBLIC`, `anon`, `authenticated` | EXECUTE (også standardrettigheden) | — | Kan ikke kaldes. Alle tre er SECURITY INVOKER |
| De samme tre | `service_role` | — | EXECUTE | Kun backend kan kalde dem, med den verificerede elev-id |
| `question_instances_served_mode` (trigger, ny) | alle API-roller | EXECUTE | — | Triggeren fyrer stadig. Ingen kan kalde den direkte |
| RLS-politikker på `question_instances` | — | — | — | Ingen ændret, oprettet eller fjernet |

**HTTP-flade:**
- **Ny funktion:** `request-hint` er en ny HTTP-funktion. Slukket svarer den 404 uden at bygge en klient.
- **Tændt (særskilt GO):** en elev med gyldig JWT kan højst skrive 3 loglinjer pr. egen åben runde. Funktionen bruger den verificerede id og kun RPC'en ovenfor. En anden elevs instans giver `not_found`.
- **`process-event` og `get-next-question`:** ingen nye klientindgange. Body-felter til tilstand og hints ignoreres.

Alt er testet som rollerne selv (`laerligverse-l3-l5-migration-run`, `laerligverse-l3-l5-attempt-wrapper-run`, `laerligverse-request-hint`).

## 2. Rettigheder på `question_instances` (før → efter)

| Rolle | Før (produktionens udgangspunkt, krævet af guarden) | Efter |
|---|---|---|
| `anon` | tabel: UPDATE, DELETE, REFERENCES, TRIGGER | tabel: DELETE, REFERENCES, TRIGGER; kolonne-UPDATE på alle kolonner undtagen `served_mode` |
| `authenticated` | tabel: UPDATE, DELETE, REFERENCES, TRIGGER; kolonne-SELECT på alle kolonner undtagen `correct_answer` | tabel: DELETE, REFERENCES, TRIGGER; kolonne-UPDATE på alle kolonner undtagen `served_mode`; kolonne-SELECT uændret |
| `service_role` | alt undtagen MAINTAIN | uændret |
| `PUBLIC` | intet | intet |

- **RLS-politikker:** uændrede. Der er kun to SELECT-politikker: eleven læser sine egne rækker, og læreren læser sine elevers rækker. Der er ingen INSERT-, UPDATE- eller DELETE-politik.
- **Guarden stopper filen**, hvis udgangspunktet afviger. Det gælder en ekstra tabel- eller kolonnerettighed og en rettighed til `PUBLIC`. Testen dækker fem afvigelser, og ved hver af dem ændres intet.
- **`served_mode`:** `anon` og `authenticated` kan hverken læse, indsætte eller ændre kolonnen. Tabel-REFERENCES dækker den som alle kolonner, men giver hverken læse- eller skriveadgang.

## 3. Positive og negative tests (som de roller, vejene faktisk kører som)

| Spørgsmål | Svar | Test |
|---|---|---|
| Kan en elev opdatere en andens (eller sin egen) instans? | Nej. RLS giver 0 rækker, og DELETE giver 0 rækker | `laerligverse-l3-l5-attempt-wrapper-run` |
| Kan en elev sætte eller ændre `served_mode`? | Nej. 42501 for `authenticated` og `anon`, ved både UPDATE og INSERT. Triggeren fryser værdien også for `service_role` | `…-migration-run`, `…-attempt-wrapper-run` |
| Kan en elev læse `served_mode` eller hint-loggen? | Nej (42501). Det gælder også en lærer | `…-attempt-wrapper-run` |
| Kan en elev påvirke `hints_used` via body'en? | Nej. Hverken process-event eller wrapperen har en parameter til det | `laerligverse-attempt-context-process-event`, `…-attempt-wrapper-run` |
| Kan en elev påvirke `hints_used` gennem request-hint for en andens instans? | Nej. Den verificerede elev-id og en fremmed instans giver `not_found`, og intet logges | `laerligverse-request-hint`, `…-attempt-wrapper-run` |
| Kan en elev påvirke `hints_used` ved at skrive direkte i tabellen? | Nej. Loggen giver 42501, og wrapper, `_v2` og `request_question_hint` giver 42501 for API-roller | `…-attempt-wrapper-run` |
| Kan `hints_used` ændres efter registreringen? | Nej. Ingen rolle kan opdatere eller slette `question_attempts`, heller ikke ejeren, fordi H5's append-only-trigger forhindrer det | `…-attempt-wrapper-run` |
| Afslører en ny kolonne eller tabel data for andre elever eller `anon`? | Nej. Ingen SELECT-rettighed på `served_mode` eller loggen | `…-migration-run`, `…-attempt-wrapper-run` |
| Virker de eksisterende veje stadig med deres rettigheder? | Ja: legacy MC og tekst, K1's `_v2`, #610's pause (LQ429 gennem wrapperen), `request_repeat_question_for_student` (genåbner og nulstiller `served_mode`), `release_open_question_outside` som `authenticated` (sletter en åben runde med loggede hints; loggen følger med via CASCADE) og lærerens læsning | `…-attempt-wrapper-run` |
| Afvises en manglende eller forfalsket JWT i request-hint? | Ja. `verify_jwt = false` som i process-event og get-next-question. Funktionen kalder selv `auth.getUser()` på en klient med kun requestens egen header. Fejl giver 401, uden RPC | `laerligverse-request-hint` |
| Bruger request-hint et elev-id fra body'en? | Aldrig. `p_student_id` er den verificerede `user.id`, og body-felterne `student_id`, `p_student_id` og `user_id` ignoreres | `laerligverse-request-hint` |

## 4. Funktioner, migrationen opretter eller er afhængig af

| Funktion | Ny eller eksisterende | SECURITY | `search_path` | Adgangskontrol |
|---|---|---|---|---|
| `request_question_hint` | ny | INVOKER | `''` | EXECUTE kun for `service_role`. Instansen matches på id **og** student_id |
| `process_question_attempt_with_context`, `process_text_answer_with_context` | ny | INVOKER | `''` | EXECUTE kun for `service_role`. Låser egen instans på id **og** student_id og kalder `_v2` |
| `question_instances_served_mode` (trigger) | ny | INVOKER | `''` | Ingen EXECUTE for API-roller. Rører kun `NEW.served_mode` |
| `process_question_attempt_v2`, `process_text_answer_v2` (K1) | eksisterende, uændret, md5 fastlåst | DEFINER | `''` | EXECUTE kun for `service_role`. Instansen matches på id **og** student_id |
| `question_instances_served_snapshot` (K1-trigger) | eksisterende | DEFINER | `''` | Ingen EXECUTE for API-roller |
| `guard_open_round_requires_active_question` (G2-trigger) | eksisterende | DEFINER | `''` | Ingen EXECUTE for API-roller |
| `quiz_cooldown_guard`, `quiz_cooldown_register` (#610-triggere) | eksisterende | DEFINER | `''` | Ingen EXECUTE for API-roller |
| `release_open_question_outside` | eksisterende | DEFINER | `public` | `auth.uid()` påkrævet. Kun kalderens egne rækker. EXECUTE for `authenticated` |
| `request_repeat_question_for_student` | eksisterende | DEFINER | `public, pg_temp` | EXECUTE kun for `service_role`, kaldes med den verificerede id |
| `process_question_attempt`, `process_text_answer` (legacy) | eksisterende | DEFINER | `public, pg_temp` | EXECUTE kun for `service_role` |

Der er ingen ny SECURITY DEFINER. Migrationen ændrer ikke nogen af de eksisterende funktioner. Testen `every SECURITY DEFINER these paths rely on pins its search_path` håndhæver tabellen.

## 5. Atomicitet: hvad er bevist, og hvad er ræsonneret

**Bevist på PGlite** (én forbindelse):
- hint før svar tælles;
- et hint efter svaret afvises (`round_closed`), og forsøget er uændret;
- en replay giver de oprindelige værdier;
- samme `request_id` tæller én gang;
- et niveau tælles én gang;
- efter en genåbning tælles kun den nye rundes hints.

**Bevist på rigtig PostgreSQL 17** (`laerligverse-l3-l5-concurrency.test.mjs`, kører i CI's unit-shards med PostgreSQL 17.6, springes over lokalt uden `LEVEL_ENGINE_PG_URL`):
- et åbent hint får svaret til at vente, og hintet tælles;
- et åbent svar får hintet til at vente, og hintet afvises bagefter;
- otte samtidige anmodninger med samme id giver én række;
- når hints og svar slippes løs samtidig, er antallet af loggede niveauer lig med `hints_used`.

**Ræsonneret:** at rækkefølgen også holder under andre isolationsniveauer end READ COMMITTED. Supabase bruger READ COMMITTED.

## 6. Koordinering med K1-sporet

Wrapperne er afhængige af `_v2`:
- signaturerne `process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text,text,integer)` og `process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text,text,integer)`;
- kroppene med md5 `439186fa94119fec02b8f282eb75dbbd` og `809675f9071eb2a62d1c9a9b2628bc84`;
- at `_v2` selv låser instansen og er idempotent pr. submission.

Ændrer K1-sporet `_v2`, stopper denne migrations guard. Den skal da gennemgås og opdateres sammen med K1-ændringen.
