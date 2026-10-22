# Niveaumotoren (sværhedsskala 1–10.000): udrulning, tilbagerulning og query-planer

**Status (2026-10-22):** forberedt, **intet anvendt eller deployet**. Arkitektur:
[`docs/ARCHITECTURE.md` §6 "Difficulty scale 1–10.000"](../ARCHITECTURE.md). Design og beslutninger:
`docs/difficulty-scale-design.md` (B1–B8, E1–E5, vej A).

Hvert trin herunder kræver **sin egen ejergodkendelse**. Migrationer anvendes kun via
`apply_migration` (aldrig `db push`, D-110). Alle verifikationsforespørgsler er læsende.

---

## 1. Rækkefølge i produktion (ejerbeslutning 2026-10-22)

| # | Trin | Forudsætning | Verifikation (læsende) |
|---|---|---|---|
| 1 | Godkend og anvend `20261019150000_question_format_mix` (#351) | Security review | §2.1 |
| 2 | Verificér funktioner, tabel, RLS og rettigheder | Trin 1 | §2.1 |
| 3 | Deploy `get-next-question` fra `main` med `QUESTION_MIX_ENGINE` **ikke sat** og `LEVEL_ENGINE` **ikke sat**; smoke-test den hidtidige adfærd | Trin 2. Diff live mod repo først (kendt drift i nøgle-resolveren) | §2.2 |
| 4 | Godkend og anvend `20261020120000_difficulty_scale_a` | Trin 3. Optællingen af opgaver uden niveau er gjort 2026-10-22: 0 mangler klassetrin/bånd | §2.3 |
| 5 | Først derefter: godkend og anvend `20261022120000_difficulty_scale_b`, deploy `get-next-question` med niveaumotoren (flaget stadig ikke sat), og behandl `LEVEL_ENGINE=v1` som en særskilt beslutning | Trin 4 | §2.4–§2.6 |
| 6 | Indholdet (#358–#365) indsættes **inaktivt**; stikprøvekontrol (E5); aktivering pr. portion | Trin 5, niveaumotoren kører | §2.7 |

Koden i `get-next-question` kan deployes, før B er anvendt: med `LEVEL_ENGINE` ikke sat kalder den
ingen af B's funktioner. Med `LEVEL_ENGINE=v1` uden B fejler den **højlydt** (500), aldrig stille.

---

## 2. Verifikation pr. trin

### 2.1 Efter #351 (trin 1–2)
```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef, p.proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('question_is_servable','get_question_candidates_for_student',
  'request_repeat_question_servable_for_student','advance_student_band');
-- Forvent 4 rækker; anon = auth = false, svc = true; proconfig = {search_path=public, pg_temp}.
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.student_band_state'::regclass;          -- true
SELECT count(*) FROM pg_policies WHERE tablename = 'student_band_state';                         -- 0
SELECT has_table_privilege('authenticated','public.student_band_state','SELECT');                -- false
```

### 2.2 Smoke-test efter deploy med flagene ikke sat (trin 3)
- Produktions-smoken (Playwright mod prod) grøn, og en testelev i historie og engelsk får spørgsmål som før.
- Edge-logs: `WAVE:`/`GRADE:`/`DOMAINS:` som før; **ingen** `FORMAT_MIX:`- eller `LEVEL_ENGINE:`-linjer.
- `SELECT count(*) FROM public.student_band_state;` er uændret (0), fordi `v1` ikke kalder folden.

### 2.3 Efter migration A (trin 4)
```sql
SELECT count(*) FILTER (WHERE difficulty_level IS NULL) AS uden_niveau, count(*) AS i_alt FROM public.questions;
-- Forvent uden_niveau = 0 (2026-10-22: alle 2.143 har klassetrin og bånd).
SELECT has_table_privilege('authenticated','public.student_subject_level','UPDATE');             -- false
SELECT has_function_privilege('authenticated','public.difficulty_level_from_grade_band(integer,integer)','EXECUTE'); -- false
```

### 2.4 Efter migration B (trin 5)
```sql
SELECT p.proname, p.prosecdef, p.proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('advance_student_level','get_level_questions_for_student',
  'request_repeat_level_question_for_student');
-- Forvent 3 rækker; prosecdef = false; anon = auth = false; svc = true.
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.student_level_fold_log'::regclass;      -- true
```

### 2.5 Query-planer i produktion, før `LEVEL_ENGINE=v1`
Kør `EXPLAIN (ANALYZE, BUFFERS)` på kandidat- og fold-forespørgslerne (§4) for en rigtig elev med lang
historik. **Grænse:** kandidatvalget skal være under 50 ms for engelsk med alt indhold aktivt. Ligger
det over, skal kandidatvalget først optimeres (se risiko R1).

### 2.6 Aktivering af `LEVEL_ENGINE=v1`
Flaget er **globalt** (ingen styring pr. elev), så aktivering rammer alle elever på én gang:
- Slå det til på et roligt tidspunkt. Test straks med en testelev i hvert fag: `LEVEL_ENGINE:`-linjen
  i loggen skal vise `level`, `newly_folded` og `candidates > 0`.
- Overvåg 500-fejl i `get-next-question` den første time.

### 2.7 Indhold (efter stikprøvekontrollen)
```sql
-- Før aktivering: alle inaktive, alle med niveau.
SELECT metadata->>'level_batch' AS batch, count(*), bool_and(NOT is_active) AS alle_inaktive,
       bool_and(difficulty_level IS NOT NULL) AS alle_med_niveau
FROM public.questions WHERE metadata ? 'level_batch' GROUP BY 1 ORDER BY 1;
-- Aktivering pr. portion (egen godkendelse pr. portion):
-- UPDATE public.questions SET is_active = true
-- WHERE learning_objective = 'english' AND metadata->>'level_batch' = 'pilot';
```

---

## 3. Tilbagerulning

| Situation | Handling | Konsekvens |
|---|---|---|
| Niveaumotoren opfører sig forkert | Fjern Edge-secret'en `LEVEL_ENGINE` | Øjeblikkeligt tilbage til den hidtidige udvælgelse, uden deploy. `student_subject_level` og `student_level_fold_log` bliver liggende (læses ikke) |
| Formatblandingen opfører sig forkert | Fjern `QUESTION_MIX_ENGINE` | Tilbage til `v1` uden deploy |
| Et aktiveret indholdsportion har fejl | `UPDATE public.questions SET is_active = false WHERE metadata->>'level_batch' = '<portion>'` | Opgaverne serveres ikke længere. Allerede besvarede instanser bevares |
| Ny Edge-kode skal ud | Redeploy den forrige version af `get-next-question` | Kræver, at flagene er slået fra først |
| Migration B skal fjernes (kun hvis nødvendigt) | `DROP FUNCTION public.request_repeat_level_question_for_student(uuid, text[]); DROP FUNCTION public.get_level_questions_for_student(uuid, integer, text[], integer); DROP FUNCTION public.advance_student_level(uuid, text, smallint); DROP INDEX public.idx_qi_student_answered; DROP TABLE public.student_level_fold_log;` | Kun med `LEVEL_ENGINE` slået fra. Fold-loggen går tabt. Niveauerne i `student_subject_level` bevares |
| Migration A skal fjernes (kun før indhold er indsat) | `DROP TABLE public.student_subject_level; DROP INDEX public.idx_questions_objective_level; ALTER TABLE public.questions DROP CONSTRAINT questions_difficulty_level_check; ALTER TABLE public.questions DROP COLUMN difficulty_level; DROP FUNCTION public.difficulty_level_from_grade_band(integer, integer);` | Forudsætter, at B og indholdet ikke er anvendt. Ellers er det en datamigration, der kræver sin egen plan |

Al tilbagerulning af skema kræver ejerens godkendelse ligesom anvendelsen.

---

## 4. Query-planer

Målt i PGlite (PostgreSQL 18, WebAssembly) med en database i produktionsstørrelse: 5.143 opgaver
(2.143 som i produktion + 3.000 niveausatte engelskopgaver, alle **aktive** som efter aktivering) og
30.000 besvarede instanser (200 elever × 150). Planerne viser, hvilke indeks der bruges. Tiderne er
WebAssembly-tider og ligger væsentligt over native Postgres, så tallene skal måles igen i produktion
(§2.5).

| Forespørgsel | Plan (kort) | Tid (PGlite) |
|---|---|---|
| Kandidatvalg, engelsk (4.090 kandidater) | Bitmap Index Scan på `unique_active_objective_level` (learning_objective) → Hash Anti Join mod `idx_student_question_instance` (Index Only Scan) → top-N heapsort | 286 ms, heraf ~235 ms i `question_is_servable()` pr. række |
| Kandidatvalg, historie (1.053) | Samme plan | 56 ms |
| Fold-udvalg (150 svar) | Index Scan på `idx_student_question_instance` (student_id) → Merge Join med `questions_pkey` → Anti Join mod fold-loggen | 8 ms |
| Udtømningstjek (gentagelse) | Merge Anti Join, stopper ved første træf | 0,5 ms |
| `advance_student_level`, første kald (150 svar foldes) | — | 42 ms |
| `advance_student_level`, gentaget kald (intet nyt) | — | 4 ms |

<details><summary>Fulde planer</summary>

```
Kandidatvalg (engelsk, niveau 6000, LIMIT 50)
Limit (actual time=285.395..285.579 rows=50.00 loops=1)
  ->  Sort (actual time=285.382..285.458 rows=50.00 loops=1)
        Sort Key: (abs((q.difficulty_level - 6000))), (md5((student || (q.id)::text))), q.id
        Sort Method: top-N heapsort  Memory: 28kB
        ->  Hash Anti Join (actual time=5.675..273.432 rows=4015.00 loops=1)
              Hash Cond: (q.id = qi.question_id)
              ->  Bitmap Heap Scan on questions q (actual time=3.096..238.457 rows=4090.00 loops=1)
                    Recheck Cond: ((learning_objective = ANY ('{english}'::text[])) AND is_active)
                    Filter: ((difficulty_level IS NOT NULL) AND question_is_servable(answer_format, answer_type, content))
                    ->  Bitmap Index Scan on unique_active_objective_level (rows=4090.00)
                          Index Cond: (learning_objective = ANY ('{english}'::text[]))
              ->  Hash (rows=150.00)
                    ->  Index Only Scan using idx_student_question_instance on question_instances qi (rows=150.00)
                          Index Cond: (student_id = '…'::uuid)  Heap Fetches: 0
Execution Time: 285.911 ms

Fold-udvalg (advance_student_level)
Sort (actual time=7.644..7.746 rows=75.00 loops=1)
  Sort Key: qi.answered_at, qi.id
  ->  Nested Loop Anti Join (rows=75.00)
        Join Filter: (f.question_instance_id = qi.id)
        ->  Merge Join (rows=75.00)
              Merge Cond: (qi.question_id = q.id)
              ->  Index Scan using idx_student_question_instance on question_instances qi (rows=150.00)
                    Index Cond: (student_id = '…'::uuid)
                    Filter: (answered AND (was_correct IS NOT NULL) AND (answered_at IS NOT NULL) AND (teacher_score IS NULL) AND (repeat_count = 0))
              ->  Index Scan using questions_pkey on questions q (rows=1091.00)
                    Filter: ((COALESCE(answer_type, 'short'::text) <> 'long'::text) AND (learning_objective = 'english'::text))
        ->  Seq Scan on student_level_fold_log f (rows=0.00)   -- tom tabel; med data bruges primærnøglen
Execution Time: 8.056 ms

Udtømningstjek (request_repeat_level_question_for_student)
Result
  InitPlan 1
    ->  Merge Anti Join (rows=1.00)
          ->  Index Scan using questions_pkey on questions q (rows=1.00)
                Filter: (is_active AND (difficulty_level IS NOT NULL) AND (learning_objective = ANY ('{english}'::text[])) AND question_is_servable(...))
          ->  Index Only Scan using idx_student_question_instance on question_instances qi (rows=1.00)
Execution Time: 0.485 ms
```
</details>

Bemærkninger:
- Planneren vælger `unique_active_objective_level` frem for A's `idx_questions_objective_level`. Begge
  starter med `learning_objective`, så resultatet er det samme. A's indeks bliver relevant, når
  sorteringen flyttes ind i indekset (R1).
- Fold-forespørgslen bruger de eksisterende indeks. B's `idx_qi_student_answered` er tilføjet til den,
  men blev ikke valgt ved 150 svar pr. elev. Den bliver relevant ved længere historik.

---

## 5. Åbne risici

| # | Risiko | Afbødning |
|---|---|---|
| R1 | Kandidatvalget evaluerer `question_is_servable()` for **alle** fagets aktive opgaver pr. kald (funktionen har `SET search_path` og kan derfor ikke inlines). Det vokser lineært med indholdet: ~4.000 engelskopgaver efter aktivering | Mål i produktion (§2.5, grænse 50 ms). Er det for langsomt: hent først de nærmeste N efter niveau via `idx_questions_objective_level` (et vindue på begge sider af elevens niveau), filtrér dem og udvid vinduet, kun hvis der er for få |
| R2 | Flaget er globalt, så der er ingen pilot på enkelte elever | Aktivér på et roligt tidspunkt, test straks med en testelev og rul tilbage ved at fjerne flaget (§2.6) |
| R3 | Første kald folder hele elevens historik i faget. Elever med lang historik flyttes mange niveauer på én gang | Det er tilsigtet: den tidligere historik giver det bedste startestimat. Trinene bliver mindre med antal svar. Kan ses i fold-loggen |
| R4 | Ægte samtidighed er kun bevist via rækkelåsen og primærnøglen, ikke ved et kapløb (PGlite har kun én forbindelse) | Rækkelås + `ON CONFLICT DO NOTHING` på fold-loggens primærnøgle gør dobbelt-foldning umulig, selv uden låsen. Kan testes mod en rigtig Postgres i staging |
| R5 | Placeringstesten måler kun historie, så engelsk og dansk starter på klassetrinnets startbånd | Bevidst (B9 er udskudt). De store første trin flytter eleven hurtigt |
| R6 | Indholdets egne tests bruger stadig et forenklet skema | Kørt én gang 2026-10-22: alle 18 indholdsfiler (3.000 rækker) indsat på det produktionstro skema efter #351 → A → B, alle inaktive og mærket, niveau 1–3.000 (`batch6`) og 3.001–10.000 (de øvrige). Opgave-PR'ernes egne tests skal flyttes over på `tests/unit/helpers/prod-base-schema.mjs`, når #356 og B er merget |
