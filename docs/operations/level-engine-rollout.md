# Niveaumotoren (sværhedsskala 1–10.000): udrulning, tilbagerulning og query-planer

**Status (2026-10-30):** #351 er anvendt (`20261022053442 question_format_mix`, 2026-10-22). Migration
A er anvendt og verificeret (`20261030045204 difficulty_scale_a`, 2026-10-30, trin 4). Migration B er
anvendt og verificeret (`20261030094958 difficulty_scale_b`, 2026-10-30, første del af trin 5).
Rettelsen af tabelkommentaren er anvendt og verificeret (`20261030182931 student_subject_level_comment`,
2026-10-30, §2.4). Niveaumotoren er **ikke** deployet: `get-next-question` er version 179, som hverken indeholder eller
kalder B's funktioner, så motoren er effektivt inaktiv. Arkitektur:
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
| 4 | Godkend og anvend `20261020120000_difficulty_scale_a` | Trin 3. Optællingen af opgaver uden niveau er gjort 2026-10-22: 0 mangler klassetrin/bånd | §2.3. **Udført 2026-10-30:** produktionspost `20261030045204 difficulty_scale_a`, verificeret (§2.3) |
| 5 | Først derefter: godkend og anvend `20261029120000_difficulty_scale_b`, deploy `get-next-question` med niveaumotoren (flaget stadig ikke sat), og behandl `LEVEL_ENGINE=v1` som en særskilt beslutning | Trin 4 | §2.4–§2.6. **B udført 2026-10-30:** produktionspost `20261030094958 difficulty_scale_b`, verificeret (§2.4). Deploy og `LEVEL_ENGINE` udestår |
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

**Resultat 2026-10-30** (læsende, efter `20261030045204 difficulty_scale_a`): 0 af 2.143 uden niveau;
backfill lig formlen for alle rækker; niveau 143–9.857; `authenticated` har kun SELECT på
`student_subject_level` (ingen UPDATE, INSERT, DELETE, TRUNCATE eller MAINTAIN), `anon` intet;
`difficulty_level_from_grade_band` kan kun kaldes af `service_role`, og kroppen er md5-identisk med
filen. B's objekter findes ikke. #351's fire funktioner er uændrede.

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

**Resultat 2026-10-30** (læsende, efter `20261030094958 difficulty_scale_b`): filen er anvendt ordret
fra `main`, SHA-256 `9fb5ffd33df32f8342cda143cc28c32b25478ec0332b2261925cf8ca21a96a1c`, lig SHA-256 af den sætning, migrationsloggen gemte. De tre funktioner
findes med `prosecdef = false`, `search_path=public, pg_temp`, EXECUTE kun for `service_role` (ikke
`PUBLIC`, `anon` eller `authenticated`) og md5 som i filen: `advance_student_level` `4147c559…`,
`get_level_questions_for_student` `9e5862b2…`, `request_repeat_level_question_for_student` `ee153327…`.
`student_level_fold_log` har RLS og 0 policies, og kun `postgres` og `service_role` står i ACL'en. Begge
indeks er som i filen. `student_subject_level` og `student_level_fold_log` har 0 rækker. A og #351 er
uændrede, og `get-next-question` er stadig version 179.

**Kommentarrettelse anvendt og verificeret (2026-10-30).** A gav `student_subject_level` kommentaren
"written only by SECURITY DEFINER functions", men B skriver gennem `advance_student_level`, som er
`SECURITY INVOKER`. Rettelsen er en ny, separat migration efter B,
`20261030120000_student_subject_level_comment.sql`, med kun ét `COMMENT ON TABLE`. A og B er ikke
ændret. Den er anvendt som produktionspost `20261030182931 student_subject_level_comment`, ordret fra
`main` (SHA-256 `beda3783777d4f961e67358ed543cf7e849e91187408b3a9d81d4361ae1286f0`, lig SHA-256 af den
sætning, migrationsloggen gemte). Den læsende efterkontrol viste den nye tekst ordret; B's funktioner,
ACL, grants, RLS, policies, kolonner, indeks og constraints var identiske med øjebliksbilledet før, og
begge niveautabeller havde 0 rækker. Efterkontrol:
```sql
SELECT obj_description('public.student_subject_level'::regclass, 'pg_class');
-- Forvent den nye tekst ("Elevens niveau 1–10.000 pr. fag. Serverejet: …"); alt andet uændret.
```

### 2.5 Query-planer i produktion, før `LEVEL_ENGINE=v1`
Kør `EXPLAIN (ANALYZE, BUFFERS)` på kandidat- og fold-forespørgslerne (§4) for en rigtig elev med lang
historik. **Grænse:** kandidatvalget skal være under 50 ms for engelsk med alt indhold aktivt. Ligger
det over, skal årsagen findes, før flaget slås til (§4, risiko R7).

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
| Ny Edge-kode skal ud | Deploy rollback-kilden for `get-next-question` (§3.1) | Kræver, at flagene er slået fra først |
| Migration B skal fjernes (kun hvis nødvendigt) | `DROP FUNCTION public.request_repeat_level_question_for_student(uuid, text[]); DROP FUNCTION public.get_level_questions_for_student(uuid, integer, text[], integer); DROP FUNCTION public.advance_student_level(uuid, text, smallint); DROP INDEX public.idx_qi_student_answered; DROP TABLE public.student_level_fold_log;` | Kun med `LEVEL_ENGINE` slået fra. Fold-loggen går tabt. Niveauerne i `student_subject_level` bevares |
| Migration A skal fjernes (kun før indhold er indsat) | `DROP TABLE public.student_subject_level; DROP INDEX public.idx_questions_objective_level; ALTER TABLE public.questions DROP CONSTRAINT questions_difficulty_level_check; ALTER TABLE public.questions DROP COLUMN difficulty_level; DROP FUNCTION public.difficulty_level_from_grade_band(integer, integer);` | Forudsætter, at B og indholdet ikke er anvendt. Ellers er det en datamigration, der kræver sin egen plan |

Al tilbagerulning af skema kræver ejerens godkendelse ligesom anvendelsen.

### 3.1 Release-gate for `get-next-question`: deploy med motoren slukket
**Status:** deploy er **ikke** godkendt. Proceduren her skal være merget, før nogen deploy, og hvert
trin kræver ejerens godkendelse ligesom resten af runbooken.

**Afhængigheden er låst.** `index.ts` importerer `https://esm.sh/@supabase/supabase-js@2.118.0`
(supabase-js@2.118.0, ejerbeslutning 2026-10-30) og ikke længere `@2`, som opløses til den nyeste 2.x,
når funktionen bundles eller køres.
- **Hvilken version `@2` hidtil gav:** 2.118.0 blev udgivet på npm 2026-10-15 kl. 12:57 UTC og er
  stadig den nyeste 2.x (`dist-tags.latest`, kontrolleret 2026-10-30). esm.sh svarer i dag Deno på
  `@2` med en 302 til `@2.118.0`, og de to svar er byte-identiske. Version 179 blev deployet
  2026-10-22, og de grønne CI-kørsler 2026-10-30 (PR #485 og main `242d7eb`) kørte efter 2026-10-15.
  De har derfor opløst 2.118.0. Det er udledt af udgivelsestidspunkterne: CI-loggene og den deployede
  bundle navngiver ikke versionen.
- **Det, låsningen ikke dækker:** esm.sh bygger selv modulet, og Supabase bygger bundlen. Bundlens hash
  (`ezbr_sha256`) kan derfor ikke forudsiges lokalt. Det, der verificeres, er kilden: manifestet herunder.

**Manifester.** `node tools/edge/gnq-release.mjs manifest` skriver én linje `<sha256>  <sti>` pr. fil
i modulgrafen fra `index.ts` (relative imports) plus `deno.json`, sorteret. Manifestet er sha256 af
de linjer. Filmængden er præcis den, `get_edge_function` viser efter en deploy.

| | Kilde | Filer | Manifest |
|---|---|---|---|
| Kandidat | dette repository | 13 | `2ce45c7eaa113a9bda93d342e77e51e53efbe3b53ea64aeabaec0bb9dda3560e` |
| Forrige kandidat (H5 PR 2, før Match par #377) | main før #377 | 12 | `a52e2da432f61fb7cdcf38827529526a33e9b0d6ad123cc0a91095cb4d30ebc3` |
| Version 180, som deployet 2026-10-31 — **rollback-mål før H5-aktivering** | `1aee47a` (main, merge af #487), uændret | 12 | `a6a874b7c4b01a4654679bf5d9c472cb683844f7c6ac3fe69ccf6b19d4f54603` |
| Historisk rollback til version 179 (det, `materialize-rollback` skriver) | `21ec9ff` med låsningen (kun linje 2 i `index.ts` er ændret) | 11 | `ca21b993839e48ff4e5baf3189306860d6b349fdcc7eea12f65ab78a73e418c6` |
| Version 179, som deployet | `21ec9ff` uændret | 11 | `c4414671f3a5aff1e8d5bc3cb57ec4e92bb0d70ef8008a7ade39a75730c81985` |

Kandidaten adskiller sig fra version 179 i `index.ts` (niveaugrenen, låsningen, H5's `round_no` og
Match par's nøglelæsning), `instance-insert.ts` (læser `repeat_count` tilbage, H5),
`_shared/interaction-kinds.ts` og `_shared/question-dto.ts` (Match par) og i de nye `level-flow.ts` og
`_shared/match-pairs.ts`. De øvrige 7 filer er byte-identiske. Fra version 180 adskiller den sig ved
H5's `round_no` (D-266, H5 PR 2): et nyt svarfelt og `repeat_count` i de tre læsninger, der udleverer
en instans. Slukket-pariteten fjerner præcis den forskel efter at have kontrolleret den, og resten skal
stadig være identisk med version 179. Match par (PR #377) læser instansens nøgle i en særskilt
backend-læsning, **kun** når opgaven er `match`. Alle andre opgaveformer laver præcis de samme kald
som før, så Match par ændrer ikke slukket-pariteten. Match par er ikke servable.
Et deploy af kandidaten kræver ejerens særskilte godkendelse; punkt 4 under "Før deploy" skal da
kontrollere version 180 (`a6a874…`) i stedet for version 179. Unit-testen kræver, at kandidatmanifestet i
tabellen er dette træs manifest: ændres en fil i grafen, skal manifestet opdateres her, og gaten
gennemgås igen.

**Rollback-mål før H5-aktivering: version 180 fra `1aee47a`.** Version 180 er den version, kandidaten
afløser. Et deploy af kandidaten rulles derfor tilbage til version 180, ikke til version 179: version
179 mangler også niveaugrenen og låsningen fra #487.
- **Kilde:** commit `1aee47aaa81c8eb3c266be762ffd86bc9951ee02` (merge af #487 på main, 2026-10-30).
  Modulgrafen er den samme i `d7571d6`, `b1f4e8e` og `988755b`. Commit'en er uforanderlig og ligger i
  main-historikken, så der er ikke brug for et tag.
- **Lig med version 180:** alle 12 filer, `get_edge_function` viser for version 180, er byte for byte
  lig med filerne i `1aee47a` (kontrolleret 2026-10-31). Manifestet `a6a874…` består af:

  ```
  3790eaafb399ce683e04cb1768eba6d0303789c389b63fe44609b0be4bb398dc  functions/_shared/interaction-kinds.ts
  cfa41770e2752d3d44e5b85c8d74f32cdbcbbc93715c706662ebe6d1240ca68b  functions/_shared/question-dto.ts
  472b99398ba2e94b3a71ee6383bce6d70f8bcfe0d76b955b0912e94a3eaa274d  functions/_shared/supabase-keys.ts
  52047e69faf4e12b45df387e9510d1be97c68ef9d02795ff3e2ef40657d394da  functions/get-next-question/deno.json
  7638e2063fa045fb8011910afabeb6856d528062b2ea8a7e0b4fd23a234f7f9f  functions/get-next-question/format-mix.ts
  aff35dcfa8583ac4c2a7f55f7389b5dec442dd4a1a90c55347e42a5a3db103c5  functions/get-next-question/index.ts
  7c9864a1b80943b7590dad726e1ca1a67c505a0e2cf47bee447339db3df81b8c  functions/get-next-question/instance-insert.ts
  df5c574b5a20a8aa3bd93e4f47029fafb14010256db9b7a8751bba710f724125  functions/get-next-question/level-flow.ts
  f161934181edac9ee4a5c7c37723a18b150cc214c363b5a42697b103bffcb082  functions/get-next-question/mix-flow.ts
  a0be345d09a0fa114571e139927588a8ef7d5e752fe479c7b9cd51a544b18e7e  functions/get-next-question/scope.ts
  eb3cce0affc37c46c7e52561777ad8857427e878b21346dc44a31672dea3a1d3  functions/get-next-question/server-band.ts
  9a0e60610e52536cbdc328816b7758f4f334f64aeb6502c53a80968e1b3ff5c3  functions/get-next-question/wave-order.ts
  ```
- **Filerne genskabes uden værktøjsændring:** `git worktree add --detach <mappe> 1aee47a`. I den
  mappe skal `node tools/edge/gnq-release.mjs manifest` vise `candidate (working tree): a6a874…
  (12 files)`. De 12 filer deployes derfra, med stierne i manifestet.
- **`materialize-rollback` skriver ikke version 180.** Værktøjet skriver altid `21ec9ff` med
  låsningen, altså version 179 (`ca21b993…`, 11 filer). Det bruges kun til den historiske rollback
  nedenfor.

**Efter H5-aktivering** (D-273) afhænger klienten (`app.js`), `process-event`, `get-next-question` og
databasens kontrakt (`_v2`-funktionerne og rettighederne på de gamle svarfunktioner) af `round_no` og
`submission_id`. En rollback af `get-next-question` alene kan da være usikker. Klient, Edge-funktioner
og database vurderes samlet, forward-fix er udgangspunktet, og en `GRANT` tilbage på de gamle
svarfunktioner kræver ejerens særskilte GO. Rollback til version 180 som ovenfor gælder kun før
aktiveringen.

**Historisk rollback-kilde for version 179: `21ec9ff`** (2026-10-20, "fix(opgaveformer): ret fallback,
serverniveau og repeat-pulje …"). Den var rollback-målet for deployet af version 180 og bevares som
reference.
- **Lig med version 179:** commit'ens modulgraf er byte for byte de 11 filer, `get_edge_function`
  viste for version 179 (kontrolleret 2026-10-30).
- **I main-historikken:** `git merge-base --is-ancestor 21ec9ff origin/main` er sand (2026-10-30), så
  der er ikke brug for et tag.
- **Filerne skrives med:** `node tools/edge/gnq-release.mjs materialize-rollback <mappe>`. Det kræver
  den fulde historik, ikke en shallow clone.
- **Opførsel:** kørt gennem samme harness som unit-testen opfører den låste rollback-kilde sig som
  version 179 i alle 241 tilfælde (lokalt, 2026-10-30).

**Slukket-paritet** (`tests/unit/get-next-question-release-gate.test.mjs`, i unit-CI).
- **Hvad testen kører:** den rigtige `index.ts` i Node mod en registrerende supabase-js-stand-in.
- **Flagværdier:** `LEVEL_ENGINE` mangler eller er `""`, `"false"`, `"true"`, `"0"`, `"off"`,
  `"V1"` eller `" v1"`.
- **Variationer:** alle tre `QUESTION_MIX_ENGINE`-tilstande, historie og engelsk, og fem situationer
  (forfalden, ny, gentagelse, ingen opgaver, RPC-fejl).
- **Krav:** status, svar, alle backend-kald med argumenter og loglinjer skal være identiske med
  `tests/fixtures/gnq-v179-parity.json`. Filen er skrevet fra `21ec9ff` med
  `node tools/edge/gnq-release.mjs golden`.
- **Ingen niveaumotor:** ingen af B's funktioner kaldes, ingen niveautabel læses eller skrives, og der
  kommer ingen `LEVEL_ENGINE:`-linje.
- **Negativ kontrol:** `"v1"` fanges af samme sammenligning.
- **Vagt mod flydende imports:** enhver ekstern import i grafen skal have en præcis version
  (`x.y.z`). Supabase-js skal være den låste version, og ingen import må gå gennem `deno.json`.

**Før deploy** (læsende; alle punkter skal holde, ellers stop):
1. Ejerens særskilte godkendelse af deploy med en navngiven commit og kandidatmanifestet ovenfor.
2. **Rent checkout af den commit:** `node tools/edge/gnq-release.mjs manifest` viser kandidatmanifestet
   ovenfor, og `21ec9ff` er forfader til `origin/main`. Main-CI er grøn på commit'en.
3. **Secret-navne:** `supabase secrets list --project-ref tjzbehwfagiwpwodsgwg` (kun navnene læses).
   - `LEVEL_ENGINE` må ikke findes. Findes navnet, kan værdien ikke læses sikkert, og tilstanden er
     ukendt: deploy er blokeret.
   - Kontrol 2026-10-30: 11 navne, `LEVEL_ENGINE` findes ikke. `QUESTION_MIX_ENGINE` findes, men
     dens værdi er ikke læst. Pariteten dækker alle tre tilstande.
4. **Live-tilstand:** `get_edge_function get-next-question` er version 180, og dens filer giver
   manifestet `a6a874…`. Afviger det, har nogen deployet siden: stop. (Ved deployet af version 180
   var kravet version 179 og `c4414671…`.)
5. **Rollback klar:** en ren checkout af `1aee47a` findes, og `manifest` viser `a6a874…` for den
   (version 180). (Ved deployet af version 180 var rollback-filerne `21ec9ff` med manifest
   `ca21b993…`.)

**Deploy:** Supabase-pluginets `deploy_edge_function` med disse parametre:
- `name` `get-next-question`;
- `entrypoint_path` `functions/get-next-question/index.ts`;
- `import_map_path` `functions/get-next-question/deno.json`;
- `verify_jwt` `false`, ellers fejler browserens OPTIONS-preflight;
- præcis de 13 filer i kandidatmanifestet, med stierne som i manifestet.

Ingen secret ændres.

**Efter deploy** (læsende):
1. `get_edge_function`: en ny version, `ACTIVE`, `verify_jwt` false, og filerne giver
   kandidatmanifestet. `ezbr_sha256` noteres; den kan ikke forudsiges.
2. `OPTIONS https://tjzbehwfagiwpwodsgwg.supabase.co/functions/v1/get-next-question` giver 200 `ok`.
3. Production Smoke er grøn. En manuel kørsel kræver sin egen godkendelse.
4. Edge-logs viser `WAVE:`, `GRADE:` og `DOMAINS:` som før, **ingen** `LEVEL_ENGINE:`, og 5xx som før.
5. `SELECT count(*) FROM public.student_subject_level;` og
   `SELECT count(*) FROM public.student_level_fold_log;` er begge 0, også efter et døgn.
6. Secret-navnene er uændrede.

**Rollback** (ved en afvigelse: stop, rapportér, og ejeren beslutter):
- **Udførelse før H5-aktivering:** deploy de 12 filer fra `1aee47a` (manifest `a6a874…`, version
  180) med samme parametre. Efter H5-aktivering: se "Efter H5-aktivering" ovenfor.
- **Historisk (rollback af version 180 til 179):** rollback-filerne fra `materialize-rollback` (11
  filer, manifest `ca21b993…`).
- **Efterkontrol:**
  - filerne giver det deployede rollback-manifest (`a6a874…` for version 180);
  - for version 180: `level-flow.ts` findes, og `round_no` er ikke i svaret; for version 179:
    `level-flow.ts` findes ikke;
  - `verify_jwt` er false;
  - OPTIONS giver 200 `ok`;
  - Production Smoke er grøn;
  - der er ingen `LEVEL_ENGINE:`-linjer.
- **Det, rollback ikke kan:** versionsnummeret bliver nyt, for en tidligere version kan ikke
  genaktiveres som sådan. `ezbr_sha256` vil afvige fra den tidligere versions (version 179:
  `cf25886c…`).
- **Ingen side-ændringer:** rollback ændrer hverken database eller secrets.

---

## 4. Query-planer

### 4.1 Kandidatvinduet i migration B (ejerbeslutning 2026-10-22)
`get_level_questions_for_student` henter ikke længere hele faget, før den filtrerer:

1. **Hurtig vej.** For hvert fag i `p_domains` læses de 300 nærmeste aktive opgaver på eller over
   elevens niveau og de 300 nærmeste under niveauet, i niveaurækkefølge, gennem
   `idx_questions_objective_level`. Det er to ordnede indeksscanninger, der stopper efter 300 rækker.
   Kun disse højst 600 rækker pr. fag får `question_is_servable()` og kontrollen af, om eleven allerede
   har set opgaven.
2. **Bevis for samme resultat.** En gren, der gav færre end 300 rækker, rummer alle aktive opgaver på
   sin side. En gren, der gav præcis 300, rummer alle opgaver, der ligger *strengt* tættere på end
   dens fjerneste række. Under grænsen `v_cut` (den mindste fjerneste afstand blandt de afskårne
   grene) rummer vinduet altså alle aktive opgaver og dermed alle gyldige. Findes der mindst `limit`
   gyldige opgaver under `v_cut`, er de præcis den fulde søgnings første `limit`, i samme rækkefølge
   (samme `ORDER BY`). Opgaver med afstand lig med `v_cut` tælles ikke med, fordi vinduet måske kun
   rummer en del af dem.
3. **Fallback.** Ellers køres den fulde søgning, ord for ord som før. Det sker, når vinduet er brugt op
   (eleven har set de nærmeste, eller de kan ikke serveres), når en gruppe af lige store niveauer
   bliver skåret midt over, og når banken har færre end `limit` gyldige opgaver. Inaktive opgaver
   kommer aldrig ind i vinduet (indekset er delvist på `is_active`) og udløser derfor ikke fallback.
4. **Planlægning.** Fagene behandles ét ad gangen, og funktionen har `SET plan_cache_mode =
   force_custom_plan`, så hver sætning planlægges med kaldets faktiske fag og niveau. Første udgave
   brugte faget som en lateral join-værdi. Da undervurderede planlæggeren rækkerne pr. fag
   (1/ndistinct) og valgte bitmap over hele faget plus sortering: den nedadgående gren læste alle
   6.090 rækker gennem `unique_active_objective_level`. Med bitmap slået fra valgte den opadgående gren
   i stedet en sekventiel scanning. Med faktiske værdier er estimaterne rigtige (2.065 og 4.025
   rækker), og begge grene bliver ordnede indeksscanninger.

### 4.2 PostgreSQL 17.10 (rigtig server), 6.090 aktive engelskopgaver
Målt 2026-10-22 på en lokal PostgreSQL 17.10 (`embedded-postgres`, samme major-version som
produktionens 17.6). Datasættet er 2.143 opgaver formet som i produktion plus 5.000 aktive
engelskopgaver med niveau 1–10.000, i alt **6.090 aktive engelske**, og 300 elever × 200 besvarelser
(60.000 instanser). Elev 17 har en almindelig historik. Elev 299 har derudover fået de 700 nærmeste
opgaver omkring niveau 6000, så vinduet er brugt op. Niveau 6000, `limit` 50.

| Måling (klienttid, 21 kald, uden instrumentering) | Median | p95 | `question_is_servable`-kald |
|---|---|---|---|
| **Funktionen, hurtig vej** (elev 17) | **7,1 ms** | 8,6 ms | **598** |
| Funktionen, fallback (elev 299) | 59 ms | 72 ms | 7.286 (vinduet + hele faget) |
| Den fulde søgning alene (sådan som funktionen var før) | 63 ms | 113 ms | 6.090 |

Begge elever fik præcis samme 50 opgaver i samme rækkefølge som den fulde søgning. Maskinen var under
hukommelsespres, så de absolutte tider svinger. Forholdet er stabilt.

**Flaskehalsen** er stadig `question_is_servable()` (#351): den har `SET search_path`, kan ikke
inlines og koster cirka 0,01 ms pr. række. Vinduet begrænser den til højst 600 rækker pr. fag, uanset
hvor stor banken er. **Forventet effekt ved 10.000 aktive engelskopgaver:** den hurtige vej er
konstant (2 × 300 rækker fra indekset og 600 kald), mens fallback og den gamle søgning vokser lineært
til cirka 100 ms. Fallback rammer kun elever, der har brugt de nærmeste opgaver op (risiko R7).

Planerne herunder er funktionens egne sætninger, vist med `auto_explain` (`log_analyze`, `log_buffers`
og `log_nested_statements`). Det svarer til `EXPLAIN (ANALYZE, BUFFERS)` inde i funktionen.
Instrumenteringen gør hvert af de 600 indre funktionskald langsommere, så tiderne i planerne er højere
end klienttiderne i tabellen. Lange id-lister er forkortet.

<details><summary>Hurtig vej (elev 17): de to vinduesgrene, filteret og genlæsningen</summary>

```
-- Gren 1: på eller over niveauet (0,25 ms)
Aggregate  (actual time=0.241..0.242 rows=1 loops=1)
  Buffers: shared hit=11
  ->  Limit  (cost=0.28..116.58 rows=300 width=20) (actual time=0.057..0.185 rows=300 loops=1)
        ->  Index Scan using idx_questions_objective_level on questions q  (cost=0.28..800.76 rows=2065 width=20) (actual time=0.055..0.166 rows=300 loops=1)
              Index Cond: ((learning_objective = 'english'::text) AND (difficulty_level >= 6000))
              Buffers: shared hit=11

-- Gren 2: under niveauet (0,25 ms)
Aggregate  (actual time=0.242..0.242 rows=1 loops=1)
  Buffers: shared hit=12
  ->  Limit  (cost=0.28..66.89 rows=300 width=20) (actual time=0.028..0.184 rows=300 loops=1)
        ->  Index Scan Backward using idx_questions_objective_level on questions q  (cost=0.28..893.98 rows=4025 width=20) (actual time=0.027..0.165 rows=300 loops=1)
              Index Cond: ((learning_objective = 'english'::text) AND (difficulty_level < 6000))
              Buffers: shared hit=12

-- Filteret på vinduets 600 rækker
Aggregate  (actual time=89.132..89.134 rows=1 loops=1)
  Buffers: shared hit=26
  ->  Limit  (actual time=89.107..89.114 rows=50 loops=1)
        ->  Sort  (actual time=89.105..89.110 rows=50 loops=1)
              Sort Key: (abs((q.difficulty_level - 6000))), (md5((elev || (q.id)::text))), q.id
              Sort Method: top-N heapsort  Memory: 38kB
              ->  Merge Anti Join  (actual time=0.773..88.568 rows=580 loops=1)
                    Merge Cond: (q.id = qi.question_id)
                    ->  Index Scan using questions_pkey on questions q  (actual time=0.658..82.325 rows=598 loops=1)
                          Index Cond: (id = ANY ('{…600 id'er…}'::uuid[]))
                          Filter: ((abs((difficulty_level - 6000)) < 599) AND question_is_servable(answer_format, answer_type, content))
                          Rows Removed by Filter: 2
                          Buffers: shared hit=20
                    ->  Index Only Scan using idx_student_question_instance on question_instances qi  (actual time=0.037..0.140 rows=193 loops=1)
                          Index Cond: (student_id = elev)  Heap Fetches: 0
                          Buffers: shared hit=6

-- Genlæsning af de 50 valgte (0,25 ms)
Sort  (actual time=0.223..0.225 rows=50 loops=1)
  Sort Key: (array_position('{…50 id'er…}'::uuid[], id))
  Buffers: shared hit=5
  ->  Index Scan using questions_pkey on questions q  (actual time=0.112..0.171 rows=50 loops=1)
        Index Cond: (id = ANY ('{…50 id'er…}'::uuid[]))
```
</details>

<details><summary>Fallback (elev 299): vinduet giver 0 gyldige, så den fulde søgning kører</summary>

```
-- De to grene er de samme som ovenfor (300 + 300 rækker via idx_questions_objective_level).
-- Filteret: 598 rækker under v_cut, men eleven har set dem alle
Merge Anti Join  (actual time=72.778..72.779 rows=0 loops=1)
  ->  Index Scan using questions_pkey on questions q  (actual time=0.861..71.772 rows=598 loops=1)
        Filter: ((abs((difficulty_level - 6000)) < 599) AND question_is_servable(answer_format, answer_type, content))
  ->  Index Only Scan using idx_student_question_instance on question_instances qi  (rows=799)

-- Den fulde søgning (fallback)
Limit  (actual time=594.153..594.163 rows=50 loops=1)
  Buffers: shared hit=172
  ->  Sort  (actual time=594.152..594.158 rows=50 loops=1)
        Sort Key: (abs((q.difficulty_level - 6000))), (md5((elev || (q.id)::text))), q.id
        Sort Method: top-N heapsort  Memory: 47kB
        ->  Hash Anti Join  (actual time=0.828..589.225 rows=5232 loops=1)
              Hash Cond: (q.id = qi.question_id)
              ->  Bitmap Heap Scan on questions q  (actual time=0.572..557.346 rows=6090 loops=1)
                    Recheck Cond: ((learning_objective = ANY ('{english}'::text[])) AND is_active)
                    Filter: ((difficulty_level IS NOT NULL) AND question_is_servable(answer_format, answer_type, content))
                    Heap Blocks: exact=152
                    Buffers: shared hit=159
                    ->  Bitmap Index Scan on unique_active_objective_level  (actual time=0.148..0.148 rows=6090 loops=1)
                          Index Cond: (learning_objective = ANY ('{english}'::text[]))
              ->  Hash  (actual time=0.225..0.226 rows=900 loops=1)
                    ->  Index Only Scan using idx_student_question_instance on question_instances qi  (rows=900)
                          Index Cond: (student_id = elev)  Heap Fetches: 0
```
</details>

### 4.3 Hvad CI kontrollerer, uden en fast tidsgrænse
- `tests/unit/difficulty-scale-b-candidate-window.test.mjs` (PGlite, 11 tests) sammenligner
  funktionens svar med den fulde søgning, i samme rækkefølge. Den dækker de nærmeste 50, et vindue
  fyldt med sete eller ikke-serverbare opgaver (fallback), færre end 50 gyldige i hele banken, begge
  sider af niveauet, grænserne 1 og 10.000, lige store niveauer på vinduets kant, flere fag på én gang
  og 300 tilfældige kald. Hvilken vej der kørte, aflæses af databasens egne tællere
  (`pg_stat_xact_user_functions`, `pg_stat_user_indexes`), ikke af tid. Otte mutationer af
  vindueslogikken fanges alle.
- `tests/unit/difficulty-scale-b-concurrency.test.mjs` kører i unit-jobbet mod en PostgreSQL 17.6-
  servicecontainer. Scenarie 5 bygger 6.000+ aktive engelskopgaver og læser funktionens indlejrede
  planer med `auto_explain`. Testen kræver:
  - at begge grene er ordnede indeksscanninger på `idx_questions_objective_level` med højst 300 rækker;
  - at hverken grenene, filteret eller genlæsningen scanner hele `questions`;
  - at `question_is_servable` kaldes højst 600 gange;
  - at fallback giver samme svar som den fulde søgning.
- De fire flagkombinationer køres stadig gennem de rigtige TS-flows og den rigtige SQL
  (`difficulty-scale-b-migration-run.test.mjs`, "flag matrix").

### 4.4 PGlite (WebAssembly), til sammenligning
Før vinduet, med 5.143 opgaver (3.000 af dem niveausatte og aktive) og 30.000 instanser: kandidatvalg
engelsk 286 ms, historie 56 ms, fold-udvalg 8 ms, udtømningstjek 0,5 ms.

### 4.5 Samtidighed på en rigtig server
`tests/unit/difficulty-scale-b-concurrency.test.mjs` kører mod en rigtig PostgreSQL med flere
samtidige forbindelser. I GitHub CI sker det i unit-jobbet mod en PostgreSQL 17.6-servicecontainer.
Her er `LEVEL_ENGINE_PG_REQUIRED=1` sat, så en manglende server får testen til at fejle i stedet for
at blive sprunget over. Lokalt springes den over, medmindre `LEVEL_ENGINE_PG_URL` er sat. Kørt
2026-10-22 mod PostgreSQL 17.10: 8/8 grønne. Testen dækker:
- ACL'erne;
- samme første svar sendt to gange samtidig;
- otte samtidige kald for en helt ny elev;
- låsen, set i `pg_stat_activity`;
- to samtidige valg af samme kandidat, som kun giver én instans;
- kandidatvinduet på realistisk mængde.

## 5. Åbne risici

| # | Risiko | Afbødning |
|---|---|---|
| R1 | Kandidatvalget kaldte `question_is_servable()` for **alle** fagets aktive opgaver (51–178 ms ved 6.090 aktive engelske) | **Løst i migration B (2026-10-22):** kandidatvinduet (§4.1) giver samme svar på 7 ms median med højst 600 kald. Mål stadig i produktion (§2.5) |
| R2 | Flaget er globalt, så der er ingen pilot på enkelte elever | Aktivér på et roligt tidspunkt, test straks med en testelev og rul tilbage ved at fjerne flaget (§2.6) |
| R3 | Første kald folder hele elevens historik i faget. Elever med lang historik flyttes mange niveauer på én gang | Det er tilsigtet: den tidligere historik giver det bedste startestimat. Trinene bliver mindre med antal svar. Kan ses i fold-loggen |
| R4 | Samtidighedstesten kræver en rigtig PostgreSQL | **Løst:** den kører i unit-jobbet mod en PostgreSQL 17.6-servicecontainer og fejler, hvis serveren mangler (§4.5) |
| R5 | Placeringstesten måler kun historie, så engelsk og dansk starter på klassetrinnets startbånd | Bevidst (B9 er udskudt). De store første trin flytter eleven hurtigt |
| R6 | Indholdets egne tests bruger stadig et forenklet skema | Kørt én gang 2026-10-22: alle 18 indholdsfiler (3.000 rækker) indsat på det produktionstro skema efter #351 → A → B, alle inaktive og mærket, niveau 1–3.000 (`batch6`) og 3.001–10.000 (de øvrige). Opgave-PR'ernes egne tests skal flyttes over på `tests/unit/helpers/prod-base-schema.mjs`, når #356 og B er merget |
| R7 | En elev, der har set eller ikke kan få de 600 nærmeste opgaver i faget, rammer fallback ved hvert kald (~60 ms ved 6.090 aktive, lineært voksende) | Det rammer kun elever med en meget lang historik omkring deres niveau. Følg det i produktion. Et bredere andet vindue før den fulde søgning er en mulig senere ændring (separat beslutning) |
