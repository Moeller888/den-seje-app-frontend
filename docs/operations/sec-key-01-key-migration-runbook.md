# SEC-KEY-01 — runbook: væk fra de lækkede legacy-nøgler

**Status (2026-11-05):** procedure, **ikke en godkendelse**. Intet i denne runbook er udført i
produktionen. Hvert trin kræver ejerens særskilte GO for netop det trin (CLAUDE.md regel 48).
Deploy, ændring af secrets, deaktivering og tilbagekaldelse af nøgler udføres kun af ejeren eller
med ejerens Ja/Nej i Lærlig-guarden — én handling ad gangen.

> **KRITISK RISIKO: ÅBEN.** Så længe den legacy `service_role`-nøgle er aktiv, er den kritiske
> risiko åben — **uanset** hvor mange tests der er grønne, og uanset hvor mange funktioner der er
> flyttet. Nøglen har ligget offentligt i repositoryets historik (GitHub secret-scanning alert #1,
> D-146 `CONTAINED_IN_CODE — NOT_ROTATED`), og den giver fuld læse- og skriveadgang forbi RLS til
> alle elevdata. Risikoen er først lukket efter trin **R-04** (legacy-JWT-secret tilbagekaldt).

**Projekt:** `tjzbehwfagiwpwodsgwg` · **Repo:** `Moeller888/den-seje-app-frontend` (offentligt)
**Grundlag:** read-only gennemgang 2026-11-05 (`list_edge_functions`, `supabase functions download
--use-api` til en midlertidig mappe, `query_logs`, read-only `execute_sql`). Ingen nøgleværdi er
læst, kopieret eller logget.

**Kendte fakta, som runbooken bygger på:**

- Den delte resolver `supabase/functions/_shared/supabase-keys.ts` foretrækker
  `SUPABASE_SECRET_KEYS` / `SUPABASE_PUBLISHABLE_KEYS` og falder kun tilbage til legacy, når
  bundtet slet ikke findes. Den logger `[supabase-keys] source=…` én gang pr. kilde pr. isolate.
- `get-next-question` (v188) og `process-event` (v41) logger i dag `source=secret-keys` og
  `source=publishable-keys` — platformen injicerer altså de nye bundter. **De to funktioner er ikke
  en del af denne runbook og skal ikke redeployes her.**
- I perioden 2026-11-03 08:00Z → 2026-11-05 08:20Z viser `edge_logs` **nul** forespørgsler med en
  legacy-JWT som `apikey` (rolle `anon` eller `service_role`) og nul HS256-brugertokens. Alle
  brugertokens er ES256 med `key_id`. De eneste HS256-tokens er platformens interne
  `supabase_admin`-kald.
- Ingen cron-job, ingen databasefunktion og ingen Vault-secret i databasen indeholder en JWT-literal
  eller kalder en Edge Function (read-only kontrol 2026-11-05). Eneste cron-job:
  `sweep-stale-generation-jobs` (ren SQL).
- Loggene kan forespørges tilbage til ca. **2026-08-07** (rullende vindue på ca. 90 dage; ældste
  fundne post 2026-08-07T08:28Z). Den lækkede nøgle kom ind i repositoryet **2026-05-29** (commit
  `c3eebff4`, `fetch_legacy.mjs`) og blev fjernet fra den aktuelle kildekode 2026-09-16
  (`9f2edac5`), men ligger stadig i historikken.

---

## 0. Oversigt

| Trin | Hvad | Hvem | GO | Kan rulles tilbage |
|---|---|---|---|---|
| Q-00 | Dashboard-tjek: legacy-nøgler og JWT-signeringsnøgler | Ejer | — (kun aflæsning) | — |
| K-01 | Separate secret keys til CI og lokale værktøjer | Ejer | Ejer | Ja |
| Q-01…Q-08 | Flyt hver deployet funktion over på resolveren | Claude/ejer | Ét GO pr. funktion | Ja (redeploy) |
| Q-09 | Afklar `question-context` | Ejer | Ejer | Ja |
| O-01 | 24–48 timers observation: nul legacy-trafik | Claude (read-only) | — | — |
| R-01 | Deaktivér legacy API-nøgler (`anon` + `service_role`) | Ejer | Ejer | **Ja** (genaktivér) |
| R-02 | Rotér de eksponerede testkontoadgangskoder | Ejer | Ejer | Nej (nye værdier) |
| R-03 | Slet historiske Playwright-artefakter (D-146 (6)) | Ejer | Ejer | Nej |
| R-04 | Tilbagekald legacy-JWT-secret | Ejer | Ejer | **NEJ — irreversibel** |
| R-05 | Luk GitHub secret-scanning alert #1 med begrundelse | Ejer | Ejer | Ja (genåbn) |
| G-01 | Dokumentér persondata-risikovurdering (GDPR) | Ejer | Ejerbeslutning | — |

Rækkefølgen er bindende: R-01 først, når Q-01…Q-09 og O-01 er grønne; R-04 først, når R-01 har
stået i mindst 48 timer uden fejl.

---

## Q-00 — ejerens dashboard-tjek (kun aflæsning)

I Supabase-dashboardet for `tjzbehwfagiwpwodsgwg`:

1. **Settings → API Keys → Legacy API keys:** Er legacy `anon` og `service_role` stadig **aktive**?
   (Forventet i dag: ja. Så er den kritiske risiko åben.)
2. **Settings → API Keys → Publishable and secret keys:** Hvilke nøgler findes (kun **navne**, aldrig
   værdier)? Mindst én publishable og én secret med navnet `default` skal findes — det bekræfter
   loggene allerede indirekte.
3. **Settings → JWT Keys:** Hvad er **Current key**? Står der ES256 (asymmetrisk), og står legacy
   HS256-secret som *Previously used* eller *Standby*?
   - **Hvis current = ES256** (det loggene tyder på: alle brugertokens de seneste 48 timer er ES256
     med `key_id`): at tilbagekalde legacy-JWT-secret i R-04 logger **ikke** brugerne ud. Det gør
     kun tokens ugyldige, der er signeret med HS256 — herunder de legacy API-nøgler selv.
   - **Hvis current = legacy HS256:** at tilbagekalde den logger **alle** ud og stopper login, indtil
     en ny nøgle er current. Så må R-04 ikke udføres, før en asymmetrisk nøgle har været current i
     mindst én fuld token-levetid (standard 1 time) plus refresh-margen.

Ejeren noterer svarene (ja/nej og nøglenavne, ingen værdier) i PR'en for næste trin.

## K-01 — separate secret keys til CI og lokale værktøjer (ejer)

Formål: Når legacy slås fra, må hverken CI eller lokale scripts stå uden nøgle, og hver forbruger skal
kunne tilbagekaldes alene.

1. Ejeren opretter i dashboardet to nye secret keys, fx med navnene `ci` og `local-tools`.
2. Ejeren opdaterer **GitHub Actions-secret** `SUPABASE_SERVICE_ROLE_KEY` (bruges af
   `.github/workflows/playwright.yml` og `update-avatar-goldens.yml`) til værdien af `ci`, og
   `SUPABASE_ANON_KEY` til publishable-nøglen. Navnene på secrets kan blive stående; kun værdien
   skifter.
3. Ejeren opdaterer sin **lokale `.env`** (bruges af `fetch_legacy.mjs`, `production/…`,
   `tools/avatar-batch/batch-create.ts` og de manuelle Deno-tests i
   `supabase/functions/avatar-generation/*.test.ts`) til `local-tools`.
4. Kendt kompatibilitetspunkt: `sb_secret_…` er ikke en JWT. Klienter, der kun sender
   `Authorization: Bearer <nøgle>` uden et `apikey`-header, skal kontrolleres
   (`tools/avatar-batch/batch-create.ts` linje ~196). supabase-js sender begge headers.
5. **Verifikation:** næste prod-facing E2E-kørsel (kun med ejerens GO) eller et lokalt read-only
   script lykkes, og `edge_logs` viser forespørgslerne med en `sb_secret_`-nøgle (kun præfikset
   `sb_secret_` tælles, aldrig resten).

Claude læser, kopierer eller logger aldrig nogen af værdierne.

---

## Q-01…Q-08 — flyt de deployede funktioner

### Status pr. funktion (read-only, 2026-11-05)

`main` = `origin/main` `87aa94b4`. „Kun nøglelinjer" betyder, at diffen deployet → main udelukkende
er import af resolveren og udskiftning af `Deno.env.get("SUPABASE_…_KEY")` med resolverkaldet.

| Trin | Funktion | Deployet version · `ezbr_sha256` · `updated_at` | `verify_jwt` | Legacy-afhængighed (deployet kilde) | main == deployet? | Ændring | Kaldes fra frontend |
|---|---|---|---|---|---|---|---|
| Q-01 | `equip-avatar` | v14 · `8e8f557345f25dd00820696ad29bdd5e1ee644f4991aea8ba838345a6cf98342` · 2026-04-20T17:45:32Z | false | `index.ts` l. 29 `Deno.env.get("SUPABASE_ANON_KEY")!`; l. 54 `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!` | Ja, kun nøglelinjer | **Deploy fra main** | Nej (ingen kalder på main) |
| Q-02 | `reset-student` | v17 · `83ce406f57cc743bd10e11109bcd3b744e28721333bbf755e3d4d028a8d76020` · 2026-04-14T07:19:20Z | false | `index.ts` l. 5 `const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!` | Ja, kun nøglelinjer | **Deploy fra main** | Nej |
| Q-03 | `get-reviewed-answers` | v18 · `7ad1811c76bae00d397484a5635f17898f355dac9664271b3363887c02a31b36` · 2026-04-21T11:44:45Z | false | `index.ts` l. 17 `Deno.env.get("SUPABASE_ANON_KEY")!` | **Nej** — main pakker også handleren ind i `withObservability` (157C) og importerer `_shared/monitoring.ts` | **Kirurgisk patch** (`tools/production/edge-patches/get-reviewed-answers/`) | Nej |
| Q-04 | `buy-item` | v39 · `5652ff58796070cb74cbd0c122b8f980629cbf454afd472e10d623c4eb0763ac` · 2026-05-13T08:48:36Z | false | `index.ts` l. 28 `Deno.env.get("SUPABASE_ANON_KEY")!` | Ja, kun nøglelinjer (`deno.json` afviger kun i linjeskift) | **Deploy fra main** | `shop.html` |
| Q-05 | `reset-student-password` | v12 · `66657345170309068176d211ec55f7e9d9152b9d9e197a3bd13e11e6083e78aa` · 2026-06-03T14:10:09Z | false | `index.ts` l. 5 `const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!` | Ja, kun nøglelinjer | **Deploy fra main** | `js/student-detail.js` (lærer) |
| Q-06 | `create-teacher` | v19 · `211d183467f7cddc109241d0ed48e4793560ed6c70f079bc749c0db93cecbe57` · 2026-04-14T07:19:20Z | false | `index.ts` l. 5 `const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!` | Ja, kun nøglelinjer | **Deploy fra main** | `js/admin.js` (super_admin) |
| Q-07 | `avatar-generation` | v22 · `71d65a7c4da46dbf8bd986aa0cee3b6298f633bcb0839a84754df8f2750e13a5` · 2026-05-13T09:03:17Z | **true** | `index.ts` l. 53 `Deno.env.get("SUPABASE_ANON_KEY")`; `supabase.ts` l. 7 og `onboarding-client.ts` l. 25 `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` | Ja, kun nøglelinjer i 3 af 7 filer; 4 filer byte-identiske | **Deploy fra main** | `js/admin.js` (super_admin) |
| Q-08 | `request-password-help` | v10 · `d5c06a16b06e11f5f9a7aaa3e6ed6f101b72f8fc4e6a841148f1baaceece9afa` · 2026-08-08T16:28:32Z | **true** | `index.ts` l. 35 `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!`; l. 36 `Deno.env.get("SUPABASE_ANON_KEY") ?? ""` | **Nej** — main kalder RPC'en `reserve_password_help` (migration `20260808010000`, D-243), som **ikke** er anvendt | **Kirurgisk patch** (PR #606, `tools/production/edge-patches/request-password-help/`) | `js/login.js` |

Rækkefølgen er lavest risiko først: funktioner uden kaldere (Q-01…Q-03), så elevens butik (Q-04),
så lærer- og adminværktøjer (Q-05…Q-07) og til sidst login-flowets glemt-adgangskode (Q-08), som
har den mest komplekse fejlvej. `equip-avatar` og `buy-item` rører ikke avatar-render-stien.

**Bemærkning om `avatar-generation`:** den kalder `avatar-asset-onboarding`, som i dag er en
503-containment-stub (2026-11-02). Avatar-generering fejler derfor allerede i onboarding-trinnet,
uafhængigt af nøglerne. Det ændres ikke af Q-07.

### Øvrige deployede funktioner (ingen handling i denne runbook)

| Funktion | Version | Status |
|---|---|---|
| `get-next-question` | v188 | På resolveren (`source=secret-keys`/`publishable-keys` i loggen). **Rør ikke.** |
| `process-event` | v41 | På resolveren (samme). **Rør ikke.** |
| `create-student` | v26 | På resolveren; deployet `_shared/supabase-keys.ts` er identisk med main. |
| `review-answer` | v17 | På resolveren; deployet `_shared/supabase-keys.ts` er identisk med main. |
| `avatar-asset-validator` | v14 | Læser ingen Supabase-nøgle. |
| `avatar-asset-onboarding` | v17 | 503-containment-stub: læser intet miljø. **Må ikke deployes fra main** (main er den uautentificerede version). |
| `avatar-ingestion` | v22 | 503-containment-stub: læser intet miljø. **Må ikke deployes fra main** (samme grund). |
| `question-context` | v12 | **UKENDT** — se Q-09. |

Der blev ikke fundet nogen yderligere funktion, som læser `SUPABASE_SERVICE_ROLE_KEY` eller
`SUPABASE_ANON_KEY` direkte.

### Fælles tjek før hvert deploy

1. `list_edge_functions` (read-only): funktionens `version` og `ezbr_sha256` er præcis som i
   tabellen. Har noget ændret sig, er planen forældet for den funktion: **STOP** og gennemgå igen.
2. `git rev-parse origin/main` og diff af funktionens mappe mod `87aa94b4`. Har funktionen eller
   `_shared/supabase-keys.ts` ændret sig på main siden, gennemgås diffen igen før deploy.
3. `node --test tests/unit/sec-key-01-runbook.test.mjs tests/unit/request-password-help-keys-patch.test.mjs`
   er grøn.

### Deploy-metode

- **Deploy fra main** (Q-01, Q-02, Q-04…Q-07): fra en ren checkout af den gennemgåede `main`-commit,
  `supabase functions deploy <funktion> --project-ref tjzbehwfagiwpwodsgwg --use-api`. CLI'en
  bundter `_shared/supabase-keys.ts` med og tager `verify_jwt` fra `supabase/config.toml`, som
  stemmer med den deployede værdi for alle seks (false; `avatar-generation` true). Kontrollér efter
  deploy, at `verify_jwt` er uændret.
- **Kirurgisk patch** (Q-03, Q-08): Supabase-pluginets `deploy_edge_function` med filerne i
  `patched/` og layoutet i pakkens `README.md`.

### Verifikation efter hvert deploy (ikke-muterende)

Fælles for alle:

- `list_edge_functions`: ny version, samme `verify_jwt`.
- `OPTIONS` mod funktionen giver 200.
- Funktionsloggen for den **nye** version viser kun `source=secret-keys` / `source=publishable-keys`
  — aldrig `legacy-service-role` eller `legacy-anon` (forespørgsel O-01b nedenfor).
- Ingen 5xx og ingen `BOOT_ERROR` i `function_edge_logs` for den nye version.

Pr. funktion (kun med ugyldigt eller manglende token — ingen rigtige elevkonti):

| Trin | Tjek | Forventet |
|---|---|---|
| Q-01 `equip-avatar` | `POST {"item_id":"x"}` uden `Authorization` | 401; loggen viser `source=publishable-keys`. `source=secret-keys` ses først ved et autentificeret kald (E2E-testeleven, kun med ejerens GO). |
| Q-02 `reset-student` | `POST` uden `Authorization` | 401 `Unauthorized`; nøglen resolveres ved opstart, så `source=secret-keys` står i loggen allerede efter `OPTIONS`. |
| Q-03 `get-reviewed-answers` | `POST` med et ugyldigt bearer-token | 401 `{"error":"Unauthorized"}`; `source=publishable-keys`. |
| Q-04 `buy-item` | `POST {"item_id":"x"}` med et ugyldigt bearer-token | 401; `source=publishable-keys`. Butikken i `shop.html` åbner og viser varer. |
| Q-05 `reset-student-password` | `POST` uden `Authorization` | 401; `source=secret-keys` ved opstart. |
| Q-06 `create-teacher` | `POST` uden `Authorization` | 401 `Unauthorized`; `source=secret-keys` ved opstart. |
| Q-07 `avatar-generation` | `POST` med publishable-nøgle som `apikey` men uden brugertoken (`verify_jwt: true`) | 401 eller 403 fra gateway/funktion, aldrig 5xx; når kaldet når funktionen, viser loggen `source=publishable-keys`. `source=secret-keys` ses først ved et rigtigt admin-kald. |
| Q-08 `request-password-help` | Se `tools/production/edge-patches/request-password-help/README.md` | 200 med det generiske svar; `source=secret-keys`. |

### Rollback

- **Deploy fra main:** redeploy den tidligere deployede kilde. Den er ikke kopieret ind i repoet,
  fordi hver fil findes **byte-identisk** i git-historikken (verificeret med `git hash-object` mod
  den hentede kilde 2026-11-05). Hent med `git show <commit>:<sti>` og deploy med pluginets
  `deploy_edge_function`, samme `verify_jwt`:

  | Funktion | Fil (under `supabase/functions/`) | Commit | Bytes | SHA-256 |
  |---|---|---|---|---|
  | `equip-avatar` | `equip-avatar/index.ts` | `fef25319` | 2826 | `ed0c43e4e0f63cc397b9b8b028980999ede35a5d1627316c6220e03944345ee5` |
  | `equip-avatar` | `equip-avatar/deno.json` | `c097b4b4` | 85 | `776494746017e3d2b06d84933befb734499e53c2ef2e951566801b8cb65882ba` |
  | `reset-student` | `reset-student/index.ts` | `dba08967` | 2513 | `f4dddcb11dc4171d98dcc5ca656d38f91eb324b511ef6ac91723ea3eb07087d2` |
  | `reset-student` | `reset-student/deno.json` | `dba08967` | 85 | `776494746017e3d2b06d84933befb734499e53c2ef2e951566801b8cb65882ba` |
  | `buy-item` | `buy-item/index.ts` | `7e9a0b17` | 2668 | `ab1c544015d06f43209c18298168d2c127eb0bd5f3d929ebb488bd5627332762` |
  | `buy-item` | `buy-item/deno.json` | — (se note) | 90 | `199d42a93255f88b1f7567397cdcbf008d364e7a0bd664c581e1b84057b47af4` |
  | `reset-student-password` | `reset-student-password/index.ts` | `30e16336` | 4113 | `041ad1e396ffc99c9ff5cf83441c170ab193ddb3841c8d064d4aed9f321e6f8c` |
  | `create-teacher` | `create-teacher/index.ts` | `dba08967` | 2396 | `41c101c2be008a744ac1ff57258d9f7ce0f344ab780fb3390c2418b9d1add1e2` |
  | `create-teacher` | `create-teacher/deno.json` | `dba08967` | 85 | `776494746017e3d2b06d84933befb734499e53c2ef2e951566801b8cb65882ba` |
  | `avatar-generation` | `avatar-generation/index.ts` | `7e9a0b17` | 21255 | `81c6c5ccaaec53f735dd1678cbe44f13756a59705c83b32f58cfccd23b6a7c58` |
  | `avatar-generation` | `avatar-generation/database.ts` | `7e9a0b17` | 21124 | `eaea48480edede649c2606b769ab1eedcc875359101ab44c612ab1b661bbde88` |
  | `avatar-generation` | `avatar-generation/pipeline.ts` | `7e9a0b17` | 33872 | `21e41643058b6e880668b1f3a3bb7df256c99a95e18ba0e6aa65eb993329ccac` |
  | `avatar-generation` | `avatar-generation/onboarding-client.ts` | `7e9a0b17` | 2554 | `a8d4630b4218159f5380b35253543c57aa0b6e84671d6147f661125540989d52` |
  | `avatar-generation` | `avatar-generation/response.ts` | `7e9a0b17` | 2097 | `a425264f973f0b048389aee8ba935837d0fb3e0d17e92849f23fe9726edb1933` |
  | `avatar-generation` | `avatar-generation/storage.ts` | `7e9a0b17` | 1333 | `be0835e5975b26cc735fbefaa9927d711cfbd3cadae3716a362e139a81b91377` |
  | `avatar-generation` | `avatar-generation/supabase.ts` | `7e9a0b17` | 646 | `9620784ad92301bd52b88991aefb0ae2c575222ca8536493877cff14b38c6cc8` |

  Note om `buy-item/deno.json`: den deployede fil er den samme tekst som `create-teacher/deno.json`
  ovenfor, men med CRLF-linjeskift (90 i stedet for 85 bytes). Den importeres ikke af `index.ts` og
  har ingen betydning for adfærden. Rollback kan bruge LF-udgaven.

  Kontrollér altid SHA-256 på det, der hentes, før det deployes.
- **Kirurgisk patch:** redeploy pakkens `deployed-vN/` (se pakkens `README.md`).
- Rollback virker **kun**, så længe legacy-nøglerne er aktive (før R-01, eller efter en
  genaktivering af R-01). Efter R-04 er rollback til en legacy-læsende version udelukket.

## Q-09 — `question-context` (UKENDT)

- Deployet: v12, `verify_jwt: true`, oprettet og senest opdateret 2026-04-14T07:19:20Z, **ingen**
  `ezbr_sha256` i listen. Kilden kan ikke hentes: `get_edge_function` fejler (forsøgt igen
  2026-11-05: „internal error") og CLI-download fejler („expected multipart response, got
  application/octet-stream"). Den er altså i et ældre bundleformat.
- `main` indeholder kun Supabase-skabelonen („Hello from Functions!"), der ikke læser nogen nøgle.
  Ingen frontendfil kalder funktionen. `function_edge_logs` viser ingen kald de seneste 24 timer.
- Uden kilden kan det **ikke** udelukkes, at v12 læser en legacy-variabel. Hvis den gør, vil den
  fejle efter R-01, men da intet kalder den, er den praktiske konsekvens lille.
- **Ejerbeslutning:** (a) deploy main-skabelonen ovenpå (læser intet miljø; `verify_jwt: true`
  bevares), eller (b) slet funktionen i dashboardet. Begge fjerner det ukendte. Rollback til v12 er
  ikke mulig i nogen af tilfældene, fordi kilden ikke kan hentes. Det er uden betydning, så længe
  intet kalder den.

---

## O-01 — observation i 24–48 timer

Start, når Q-01…Q-09 er udført. Kør begge forespørgsler én gang pr. døgn i to på hinanden følgende
døgn via Supabase-MCP `query_logs` (read-only; vinduet er højst 24 timer, så angiv altid
`iso_timestamp_start`/`iso_timestamp_end`). Forespørgslerne returnerer kun tællinger og aldrig
nøgleværdier eller nøglefragmenter.

**O-01a — legacy-JWT-trafik mod API'et (forventet: 0 rækker):**

```sql
select
  multiIf(startsWith(log_attributes['request.headers.user_agent'], 'Deno/'), 'edge-function',
          log_attributes['request.headers.user_agent'] like 'node%'
            or log_attributes['request.headers.user_agent'] like '%undici%', 'node-tool',
          log_attributes['request.headers.user_agent'] like 'Mozilla/%', 'browser', 'other') as client,
  log_attributes['request.cf.asOrganization'] as as_org,
  log_attributes['request.cf.country'] as country,
  coalesce(nullif(log_attributes['request.sb.jwt.apikey.payload.role'], ''),
           log_attributes['request.sb.jwt.authorization.payload.role']) as legacy_role,
  splitByChar('/', log_attributes['request.path'])[2] as api,
  count(*) as n,
  min(timestamp) as first_seen,
  max(timestamp) as last_seen
from logs
where source = 'edge_logs'
  and (log_attributes['request.sb.jwt.apikey.payload.role'] in ('service_role', 'anon')
       or (log_attributes['request.sb.jwt.authorization.payload.role'] in ('service_role', 'anon')
           and log_attributes['request.sb.jwt.authorization.payload.algorithm'] = 'HS256'))
group by client, as_org, country, legacy_role, api
order by n desc
limit 100
```

**O-01b — resolverens kildevalg i funktionerne (forventet: kun `secret-keys`/`publishable-keys`):**

```sql
select
  log_attributes['function_id'] as function_id,
  log_attributes['version'] as version,
  event_message as line,
  count(*) as n,
  max(timestamp) as last_seen
from logs
where source = 'function_logs'
  and event_message like '%[supabase-keys] source=%'
group by function_id, version, line
order by last_seen desc
limit 100
```

**Vigtig begrænsning.** O-01a alene beviser **ikke**, at en funktion er fri af legacy-variablerne.
2026-11-05 08:07:22Z kaldte `buy-item` v39 — der læser `Deno.env.get("SUPABASE_ANON_KEY")` — RPC'en
`purchase_item`, og `edge_logs` registrerede kaldet med en `sb_publishable_`-nøgle. Enten indeholder
runtime-variablen `SUPABASE_ANON_KEY` allerede den nye nøgle, eller gatewayen logger den oversatte
nøgle. Det er ikke afklaret (spørgsmål til ejeren/Supabase). Beviset for, at intet afhænger af
legacy, er derfor kodegennemgangen (tabellen ovenfor) plus O-01b — og O-01a bekræfter kun, at ingen
**ekstern** klient (CI, scripts, tredjepart) stadig bruger legacy-nøglerne.

**Gate til R-01:** O-01a giver 0 rækker i begge døgn, O-01b viser ingen `legacy-…`-linjer for de
nye versioner, og alle Q-trin er verificeret.

---

## R-01 — deaktivér legacy API-nøgler (reversibelt)

- **Hvem:** ejeren, i dashboardet (Settings → API Keys → Legacy API keys → *Disable*).
- **Virkning:** `anon` og `service_role` slås fra samtidig. Den lækkede nøgle virker ikke længere
  mod API'et. Det kan fortrydes med *Enable*.
- **Verifikation:** O-01a/O-01b igen efter 1 time og efter 24 timer; elevflowet (login → spørgsmål
  → svar), butik, lærerens reset og glemt-adgangskode virker. Fejler noget: genaktivér straks, find
  forbrugeren i `edge_logs` (afvist med 401) og ret den, før der prøves igen.
- **Status bagefter:** risikoen er **reduceret, ikke lukket** — legacy-JWT-secret kan stadig
  signere nye tokens, og R-01 kan genaktiveres.

## R-02 — rotér de eksponerede testkontoadgangskoder

- D-146 (5) og (6): de tidligere testadgangskoder er kompromitterede.
- Ejeren sætter nye adgangskoder på testkontiene i Supabase Auth og opdaterer de tilhørende
  GitHub-secrets (`TEST_STUDENT_PASSWORD`, `TEST_TEACHER_PASSWORD`, `TEST_STUDENT2_PASSWORD` m.fl.).
- **Faldgrube (D-146 (7)):** grene og pull requests, der ikke er rebaset på D-146, kører den gamle
  `global-setup` og kan skrive de kompromitterede adgangskoder tilbage. Kontrollér, at ingen åben PR
  kører prod-facing E2E på en gammel base, før der roteres.
- Tilbagekald testkontienes aktive sessioner (Auth → Users → *Sign out user*).
- Verifikation: næste godkendte prod-facing E2E-kørsel er grøn med de nye secrets.

## R-03 — slet historiske Playwright-artefakter

D-146 (3)/(6): rapporter og traces fra før D-146 kan gengive adgangskoder. Ejeren sletter dem i
GitHub (Actions → artefakter, eller via API) — kun med særskilt GO.

## R-04 — tilbagekald legacy-JWT-secret (IRREVERSIBELT)

**Forudsætninger (alle skal være opfyldt og noteret):**

1. Q-00 bekræfter, at current JWT-signeringsnøgle er asymmetrisk (ES256), og at legacy HS256 ikke er
   current.
2. R-01 har været aktiv i mindst 48 timer uden fejl og uden genaktivering.
3. O-01a har været 0 i hele perioden, og O-01b viser ingen `legacy-…`-linjer.
4. Ingen kendt forbruger mangler: CI og lokale værktøjer bruger K-01-nøglerne.
5. Ejeren har accepteret, at rollback til en legacy-læsende funktionsversion herefter er umulig.

**Virkning:** alle tokens, der er signeret med legacy HS256-secret — herunder de lækkede legacy API-
nøgler — bliver permanent ugyldige. Først nu er den kritiske risiko **lukket**.

**Verifikation:** samme som R-01, plus at login og token-refresh virker for en testkonto.

## R-05 — luk GitHub secret-scanning alert #1

Efter R-04. Ejeren lukker alerten med resolution **„Revoked"** og en kommentar med dato for R-01 og
R-04 og en henvisning til denne runbook og D-146. Lukkes den før R-04, er det forkert: nøglen er så
ikke tilbagekaldt.

---

## G-01 — persondata-risikovurdering (GDPR, ejerbeslutning)

Nøglen gav adgang til alle tabeller forbi RLS, herunder elevers profiler, svar og lærerdata. Om
lækket er et brud på persondatasikkerheden, der skal anmeldes til Datatilsynet (art. 33) og/eller
meddeles de registrerede (art. 34), er **ejerens** beslutning. Uanset udfaldet skal hændelsen,
vurderingen og beslutningen dokumenteres (art. 33, stk. 5). Denne runbook træffer ingen beslutning.

**Tidslinje, der skal indgå:**

- 2026-05-29: nøglen committes (`c3eebff4`). Hvornår repositoryet blev offentligt, skal ejeren
  fastslå (GitHub → Settings → repository-historik/audit log).
- 2026-09-16: fjernet fra den aktuelle kildekode (D-146). Stadig i historikken.
- Ca. 2026-08-07 → i dag: perioden, som loggene stadig dækker.
- 2026-05-29 → ca. 2026-08-07: **ingen logs findes længere.** Brug af nøglen i den periode kan
  hverken bekræftes eller udelukkes.

**Logkilder og hvad de kan vise (alle read-only via `query_logs`, højst 24 timer pr. kald):**

| Kilde | Hvad den viser | Begrænsning |
|---|---|---|
| `edge_logs` | Hvert API-kald med JWT-rolle, sti (tabel/RPC), metode, status, svarstørrelse, user agent, land og netværksorganisation (`request.cf.asOrganization`) | Ingen svarindhold. Rullende ca. 90 dage. Indeholder IP-adresser (persondata) — forespørg kun aggregeret |
| `auth_audit_logs` | Admin-handlinger på brugere (`user_modified`, `user_deleted`, `user_updated_password` …) med `actor_username = service_role` | Ingen IP. Samme retention |
| `function_logs` / `function_edge_logs` | Edge Function-kald og logs | Viser ikke direkte kald mod API'et |
| `postgres_logs` | Databasefejl og forbindelser | Viser ikke almindelige PostgREST-læsninger |

**G-01a — brug af legacy `service_role` pr. døgn, fordelt på klient og netværk:**

```sql
select
  multiIf(startsWith(log_attributes['request.headers.user_agent'], 'Deno/'), 'edge-function',
          log_attributes['request.headers.user_agent'] like 'node%'
            or log_attributes['request.headers.user_agent'] like '%undici%', 'node-tool',
          log_attributes['request.headers.user_agent'] like 'Mozilla/%', 'browser', 'other') as client,
  log_attributes['request.cf.asOrganization'] as as_org,
  log_attributes['request.cf.country'] as country,
  splitByChar('/', log_attributes['request.path'])[2] as api,
  count(*) as n,
  min(timestamp) as first_seen,
  max(timestamp) as last_seen
from logs
where source = 'edge_logs'
  and (log_attributes['request.sb.jwt.apikey.payload.role'] = 'service_role'
       or (log_attributes['request.sb.jwt.authorization.payload.role'] = 'service_role'
           and log_attributes['request.sb.jwt.authorization.payload.algorithm'] = 'HS256'))
group by client, as_org, country, api
order by n desc
limit 100
```

Kør den døgn for døgn fra 2026-08-07 til i dag (eller med et længere interval i dashboardets Logs
Explorer). Stikprøve 2026-09-10: al `service_role`-trafik kom fra `node-tool` hos
`Microsoft Corporation`/`Microsoft Limited` (GitHub Actions — repositoryets egen CI). Rækker med en
anden netværksorganisation end GitHub Actions og ejerens egen internetudbyder er mistænkelige og
skal undersøges nærmere: tilføj `splitByChar('?', log_attributes['request.path'])[1]` og
`log_attributes['request.method']` for at se, hvilke tabeller der blev læst eller skrevet.

**G-01b — admin-handlinger udført med `service_role`:**

```sql
select
  log_attributes['auth_audit_event.action'] as action,
  log_attributes['auth_audit_event.log_type'] as log_type,
  count(*) as n,
  min(timestamp) as first_seen,
  max(timestamp) as last_seen
from logs
where source = 'auth_audit_logs'
  and log_attributes['auth_audit_event.actor_username'] = 'service_role'
group by action, log_type
order by n desc
limit 50
```

Stikprøve 2026-09-10: 160 × `user_modified` (forventeligt: CI'ens `global-setup`). Brugersletninger
eller oprettelser, som ingen kendt proces forklarer, er mistænkelige.

**Haster:** loggene slettes løbende efter ca. 90 dage. Hver dag uden G-01a/G-01b mister et døgns
bevis. Ejeren bør beslutte hurtigt, om resultaterne skal eksporteres og gemmes **privat** (aldrig i
dette offentlige repository).

---

## Åbne spørgsmål til ejeren

1. Q-00: er current JWT-signeringsnøgle ES256, og hvilken status har legacy HS256-secret?
2. Hvornår blev repositoryet offentligt? Det afgør den uverificerbare periode i G-01.
3. Q-09: skal `question-context` erstattes med main-skabelonen eller slettes?
4. Indeholder runtime-variablen `SUPABASE_ANON_KEY` i Edge Functions allerede den nye publishable-
   nøgle (se O-01, „Vigtig begrænsning")? Kan afklares med Supabase-support. Det ændrer ikke planen.
5. G-01: skal hændelsen anmeldes til Datatilsynet? Ejerens beslutning, som skal dokumenteres.
