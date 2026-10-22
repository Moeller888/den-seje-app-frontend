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

### 4.1 PostgreSQL 17.10 (rigtig server), 6.090 aktive engelskopgaver
Målt 2026-10-22 på en lokal PostgreSQL 17.10-server (`embedded-postgres`, samme major-version som
produktionens 17.6) med `EXPLAIN (ANALYZE, BUFFERS)`. Datasættet: 2.143 opgaver formet som i
produktion, plus 5.000 aktive engelskopgaver med niveau 1–10.000, i alt **6.090 aktive engelske**.
Desuden 300 elever × 200 besvarelser (60.000 instanser). Maskinen var under hukommelsespres, så de
absolutte tider svinger mellem kørsler. Forholdet mellem varianterne er stabilt.

| Variant | Plan (kort) | `EXPLAIN ANALYZE` (2 kørsler) |
|---|---|---|
| **A. Kandidatvalg som i migration B** | Bitmap Index Scan på `unique_active_objective_level` (learning_objective) → Bitmap Heap Scan med **filter `question_is_servable()` på alle 6.090 rækker** → Hash Anti Join mod `idx_student_question_instance` (Index Only Scan, 200 rækker) → top-N heapsort over 5.931 rækker | 51 ms / 178 ms, 165 buffers |
| B. Samme uden `question_is_servable` | Seq Scan + Hash Right Anti Join + top-N heapsort | 18 ms / 40 ms |
| C. Vindue: nærmeste 2×300 via `idx_questions_objective_level`, derefter filtrering (kun målt, ikke implementeret) | To Index Scans (frem og baglæns) på `idx_questions_objective_level` med `LIMIT 300` → servable-filter på 600 rækker → Anti Join → top-N | **22 ms**, 29 buffers, **samme 50 opgaver som A** |
| `advance_student_level`, gentaget kald | — | 6–9 ms (median, klienttid) |

**Flaskehalsen** er `question_is_servable()` (#351). Den har `SET search_path` og kan derfor ikke
inlines, så den kaldes som en selvstændig funktion pr. række: 6.090 kald ≈ 33–125 ms. Næst efter
kommer `md5(student_id || id)` og sorteringen over alle kandidater. Begge vokser lineært med antallet
af aktive opgaver i faget.

**Forventet effekt ved ≥ 5.000 aktive engelskopgaver:**
- **A (som nu):** cirka 50–180 ms pr. ny opgave, og tiden stiger lineært med indholdet. Det er over
  grænsen på 50 ms fra §2.5.
- **C:** læser et fast vindue på 600 rækker uanset størrelsen på banken og giver ~22 ms. Den kræver
  en fallback (udvid vinduet eller kør A), når eleven har fået alle 600 nærmeste.

**Anbefaling:** inden `LEVEL_ENGINE=v1` skal C implementeres i en opdatering af migration B (med test
af fallback). Det er en separat beslutning (R1).

<details><summary>Fuld plan, variant A (PostgreSQL 17.10)</summary>

```
Limit  (cost=2043.93..2044.06 rows=50 width=52) (actual time=51.109..51.114 rows=50 loops=1)
  Buffers: shared hit=165
  ->  Sort  (actual time=51.107..51.110 rows=50 loops=1)
        Sort Key: (abs((q.difficulty_level - 6000))), (md5((student || (q.id)::text))), q.id
        Sort Method: top-N heapsort  Memory: 36kB
        ->  Hash Anti Join  (actual time=0.302..50.058 rows=5931 loops=1)
              Hash Cond: (q.id = qi.question_id)
              ->  Bitmap Heap Scan on questions q  (actual time=0.235..39.066 rows=6090 loops=1)
                    Recheck Cond: ((learning_objective = ANY ('{english}'::text[])) AND is_active)
                    Filter: ((difficulty_level IS NOT NULL) AND question_is_servable(answer_format, answer_type, content))
                    Heap Blocks: exact=152
                    ->  Bitmap Index Scan on unique_active_objective_level  (actual time=0.102..0.102 rows=6090 loops=1)
                          Index Cond: (learning_objective = ANY ('{english}'::text[]))
              ->  Hash  (actual time=0.049..0.049 rows=200 loops=1)
                    ->  Index Only Scan using idx_student_question_instance on question_instances qi (rows=200)
                          Index Cond: (student_id = '…'::uuid)  Heap Fetches: 0
Planning Time: 0.288 ms
Execution Time: 51.145 ms
```
</details>

### 4.2 PGlite (WebAssembly), til sammenligning
5.143 opgaver (3.000 af dem niveausatte og aktive) og 30.000 instanser: kandidatvalg engelsk 286 ms,
historie 56 ms, fold-udvalg 8 ms, udtømningstjek 0,5 ms. Samme planform som på PostgreSQL 17.

### 4.3 Samtidighed på en rigtig server
`tests/unit/difficulty-scale-b-concurrency.test.mjs` kører mod en rigtig PostgreSQL med flere
samtidige forbindelser, når `LEVEL_ENGINE_PG_URL` peger på en server, der må smides ud bagefter. Uden
den springes testen over med en begrundelse. Kørt 2026-10-22 mod PostgreSQL 17.10: 6/6 grønne
(ACL'er, samme første svar sendt to gange samtidig, otte samtidige kald for en helt ny elev, låsen ses
i `pg_stat_activity`, to samtidige valg af samme kandidat giver kun én instans).

## 5. Åbne risici

| # | Risiko | Afbødning |
|---|---|---|
| R1 | Kandidatvalget evaluerer `question_is_servable()` for **alle** fagets aktive opgaver pr. kald (funktionen har `SET search_path` og kan derfor ikke inlines): 51–178 ms ved 6.090 aktive engelske på PostgreSQL 17 (§4.1), lineært voksende | Variant C (vindue via `idx_questions_objective_level`) giver de samme 50 opgaver på ~22 ms. Den bør implementeres med fallback, før `LEVEL_ENGINE=v1`. Det er en separat beslutning. Mål desuden i produktion (§2.5) |
| R2 | Flaget er globalt, så der er ingen pilot på enkelte elever | Aktivér på et roligt tidspunkt, test straks med en testelev og rul tilbage ved at fjerne flaget (§2.6) |
| R3 | Første kald folder hele elevens historik i faget. Elever med lang historik flyttes mange niveauer på én gang | Det er tilsigtet: den tidligere historik giver det bedste startestimat. Trinene bliver mindre med antal svar. Kan ses i fold-loggen |
| R4 | Samtidighedstesten kører kun, når der er en rigtig PostgreSQL (`LEVEL_ENGINE_PG_URL`). GitHub CI har ingen, så den springes over dér | Kørt lokalt mod PostgreSQL 17.10: 6/6 (§4.3). Skal den køre i CI, kræver det en Postgres-service i workflowen eller en dev-afhængighed (ejerbeslutning) |
| R5 | Placeringstesten måler kun historie, så engelsk og dansk starter på klassetrinnets startbånd | Bevidst (B9 er udskudt). De store første trin flytter eleven hurtigt |
| R6 | Indholdets egne tests bruger stadig et forenklet skema | Kørt én gang 2026-10-22: alle 18 indholdsfiler (3.000 rækker) indsat på det produktionstro skema efter #351 → A → B, alle inaktive og mærket, niveau 1–3.000 (`batch6`) og 3.001–10.000 (de øvrige). Opgave-PR'ernes egne tests skal flyttes over på `tests/unit/helpers/prod-base-schema.mjs`, når #356 og B er merget |
