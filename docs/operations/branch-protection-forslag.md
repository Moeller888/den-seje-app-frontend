# Beskyttelse af `main`: status og forslag (F10-B2, 2026-11-09)

**Status:** forslag. Intet i repositoryets regler er ændret. Ændringer kræver ejerens særskilte godkendelse.

## 1. Sådan er det i dag (verificeret read-only 2026-11-09)
`main` er beskyttet af **repository-rulesettet 26126869** "main: unit + isolated E2E required (D-241 step B)". Rulesettet bruger ikke klassisk branch protection. API'et for klassisk protection svarer 404, og det er grunden til, at F10-B2's rapport fra 2026-11-08 fejlagtigt skrev "ingen beskyttelse".

| Regel | Værdi |
|---|---|
| Gælder | `~DEFAULT_BRANCH` (`main`) |
| Håndhævelse | `active` |
| Bypass | ingen |
| Sletning af `main` | blokeret |
| Force-push (non-fast-forward) | blokeret |
| Påkrævede checks | `unit`, `isolated-e2e (run 1)` (GitHub Actions) |
| Branchen skal være opdateret (`strict`) | **nej** |
| Påkrævet review | nej |

Begge påkrævede checks findes på **alle** PR'er:
- `unit` er det samlede job over de fire unit-shards (D-361), `if: always()`.
- `isolated-e2e` har intet stifilter og en docs-only-hurtigvej (D-241).

## 2. Hvad der ikke er dækket, og hvorfor det betyder noget

| Hul | Risiko | Eksempel fra F10-B2 |
|---|---|---|
| **Ikke strict:** en PR kan merges med grøn CI mod en gammel `main` | En semantisk konflikt mellem to grønne PR'er opdages først på `main` | #610 (anti-gætte-pause i `process-event`) kom ind, mens Lærligverse-lagene var grønne mod den forrige `main`. Isolated-e2e kørte først på `main` |
| **Migrationsversioner kan kollidere** | To PR'er med samme `YYYYMMDDHHMMSS` er begge grønne hver for sig | #647 og #651 brugte begge `20261107090000`. Det blev opdaget ved en konflikt, ikke af et check |
| **Stifiltrerede checks kan ikke kræves** (`adventure-engine / *` kører kun ved `adventure-engine/**`) | Et påkrævet check, der aldrig starter, blokerer alle andre PR'er for altid | — |
| **K1-testbanen (#652) er ikke påkrævet** | H5-regressioner opdages kun, hvis nogen kigger | — |
| **Ingen review-regel** | Med én ejer og mange Claude-spor er GitHub-reviews ikke realistiske. Merge styres i dag af LÆRLIG-GUARD (ejerens "ask" pr. merge) | — |

## 3. Forslag: mindst indgribende og med reel sikkerhed

**Trin 1: nu, uden nye CI-omkostninger**
- **(a) Behold rulesettet uændret.** Gør ikke `strict` til et krav. Med 9 parallelle spor ville det give en rebase-kaskade og en flaskehals i CI, fordi hver merge gør alle andre PR'er forældede.
- **(b) Nyt billigt unit-check:** `migration-versions-unique`. Det skal fejle, hvis to filer i `supabase/migrations` deler version, eller hvis en PR's nye migration har en version, der allerede findes på `origin/main`. Det kører som en del af `unit`, så intet nyt checknavn skal kræves.
  - Der findes allerede enkelte tests pr. migration ("the version is unique"), men ingen generel.
- **(c) Procesregel** (for Claude-sporene, ikke GitHub): genkontrollér mod den aktuelle `main` lige før merge. Det betyder `git merge-tree` plus én frisk CI-kørsel, hvis `main` har ændret runtime-filer (`supabase/`, `js/`, `app.js`, `*.html`, workflows) siden PR'ens seneste kørsel. Det er den manuelle erstatning for `strict`.

**Trin 2: når #644 og #652 er på `main`**
- **(d) Gør `isolated-e2e (run 1, K1-testprofil)` påkrævet,** efter en stabiliseringsperiode på 2 uger, hvor banen er grøn på alle PR'er uden genkørsler.
  - Checknavnet er stabilt, fordi matrix-entryet er fast `{run: 1, profile: k1}`, og navnet er testet i `isolated-scope.test.mjs`.
  - Banen kører ikke frontend-suiten, så den koster et parallelt job på cirka 10–15 minutter og forlænger ikke ventetiden.
- **(e) Gør ikke `adventure-engine / *` påkrævet,** så længe workflowet har et stifilter. Hvis de skal kræves, skal workflowet have samme mønster som isolated-e2e: altid kørende med en hurtigvej, så checket findes på alle PR'er.

**Trin 3: valgfrit**
- **(f) Merge queue.** Den giver `strict` uden kaskade, fordi GitHub selv tester hver PR oven på køen. Det kræver, at alle påkrævede workflows også lytter på `merge_group`. Det er en ændring af workflows og skal måles først (D-110/D-241-sporet).

## 4. Ustabile tests: uden at svække beskyttelsen
- **Ingen automatiske genkørsler af tests.** `isolated-e2e` genkører kun opstart af infrastruktur (stakken, edge-runtime) og aldrig en test (D-241).
- **En infrastrukturfejl før første test** (fx `supabase/setup-cli` med HTTP 5xx, set 2026-11-08) må genkøres én gang manuelt med en kort note. En testfejl må ikke.
- **En test, der fejler ustabilt,** sættes i karantæne via en navngivet liste med ejer og udløbsdato, aldrig ved `test.skip` eller en lavere assertion. Karantænelisten kræver ejerens godkendelse og vises i CI-opsummeringen.
- Playwright-rapportens "flaky" (bestået ved retry) tælles og vises. Retries må ikke stige.

## 5. Godkendelser og rettigheder
- Merge udføres kun med ejerens eksplicitte GO pr. PR (LÆRLIG-GUARD v2: merge, deploy, migration og secrets kræver "ask").
- Rulesettet må ikke få bypass-aktører. Ingen Claude-spor må ændre rulesets eller workflows for påkrævede checks uden ejerens GO.
- Forslag (b) og (d) ændrer ikke rulesettet. (d) tilføjer ét påkrævet checknavn, når ejeren beslutter det.

## 6. Overdragelse til sikkerhedssporet (fra #653's gennemgang)
Tre forhold er observeret i `docs/laerligverse/l3-l5-sikkerhedsgennemgang.md` (PR #653). De ændres ikke i F10, fordi de ligger i ældre kode, som andre spor ejer.

| Forhold | Risikovurdering | Anbefaling |
|---|---|---|
| `anon` og `authenticated` har DELETE på `question_instances` på tabelniveau. RLS har ingen DELETE-policy | Lav: 0 rækker kan slettes i dag (testet). Det er forsvar i én lag. En fremtidig `FOR DELETE`-policy eller `ALTER TABLE … DISABLE ROW LEVEL SECURITY` ville åbne straks | REVOKE DELETE (og TRUNCATE/TRIGGER/REFERENCES, hvis ubrugt) fra `anon` og `authenticated`. Det skal testes mod `release_open_question_outside`, som sletter via sin egen DEFINER-rolle |
| Ældre SECURITY DEFINER-funktioner med `search_path = public[, pg_temp]` (`process_question_attempt`, `process_text_answer`, `request_repeat_question_for_student`, `release_open_question_outside`) | Lav: `public` er fastlåst. Risikoen opstår kun, hvis en angriber kan oprette objekter i `public`, og read-only-læsning af produktionen den 2026-11-09 viste `has_schema_privilege(…, 'public', 'CREATE') = false` for `anon`, `authenticated` og `service_role` | Ved næste redefinition: `search_path = ''` og fuldt kvalificerede navne. En test bør fastlåse, at CREATE i `public` forbliver nægtet for API-rollerne |
| `anon` og `authenticated` har INSERT på `profiles` på tabelniveau, også kolonnen `role`. RLS er slået til, og den eneste skrive-policy er `profiles_self_update` (UPDATE). Der er ingen INSERT-policy (læst read-only i produktionen 2026-11-10). UPDATE af `role`/`teacher_id` er nægtet på kolonneniveau | Lav: RLS afviser alle indsættelser, fordi der ikke er nogen INSERT-policy. Det er forsvar i ét lag. En fremtidig INSERT-policy uden `WITH CHECK` på `role` ville give en elev mulighed for at oprette en lærer- eller administratorprofil | REVOKE INSERT på `profiles` fra `anon` og `authenticated` (oprettelse sker via `create-student`/`create-teacher` med `service_role`). Fastlås med en test, at hverken INSERT eller UPDATE af `role`/`teacher_id` er muligt for API-rollerne |
| Nye funktioner i #653/#657 er SECURITY INVOKER med tomt `search_path` og EXECUTE kun til `service_role` | Ingen ny angrebsflade | — |

Ejer: sikkerhedssporet (D-227 "sweep hardening": residual default-ACL'er er allerede registreret som åbne dér). Ingen produktionsmigration er godkendt.
