# Hosting — frontend på Cloudflare Workers (Static Assets)

Status: **AKTIVERET.** Produktionen kører på Cloudflare Workers (Static Assets) og er live på
**`https://lærlig.dk`** (punycode `xn--lrlig-sra.dk`). Custom domain er tilknyttet, Supabase'
redirect-URL'er er opdateret, og E2E-suiten peger på den levende vært. Deploy sker automatisk
ved merge til `main`.

Vercel er **ikke længere deploy-mål.** Den gamle adresse `den-seje-app-frontend.vercel.app`
svarer fortsat `402 Payment Required`, og Vercel-checket fejler på hver PR med
`Account is blocked`. Det er en kontospærring uden for repoet: ingen kodeændring kan fjerne
checket — det kræver, at GitHub-integrationen kobles fra. **Checket er ikke et signal om
kodens tilstand.**

Afsnittet nedenfor er **historik** og forklarer, hvorfor migrationen blev nødvendig.

----------------------------------------
HVORFOR — HISTORIK (2026-08)
----------------------------------------

Vercel Hobby blev **pauset efter ca. 3M Edge Requests mod planens 1M-grænse**. Produktionen
returnerede derefter **HTTP 402 Payment Required** på hver eneste side — verificeret direkte på
`/`, `/login.html` og `/index.html`.

Det havde to konsekvenser, som er værd at holde adskilt:

1. **Appen var nede for brugerne.** Pilotbølge 1's deltager kunne ikke logge ind.
2. **CI så ud til at hænge, men fejlede i virkeligheden.** Alle Playwright-specs kører mod
   `https://den-seje-app-frontend.vercel.app`. Med `workers: 1` og `retries: 2` fejlede alle 816
   tests mod 402, hver blev kørt tre gange, og jobbet ramte 60-minutters-grænsen og blev aflyst
   uden nogen fejlsammenfatning. **En aflyst kørsel er ikke bevis for grøn kode** — tjek altid, at
   produktions-URL'en svarer 200, før en timeout-aflyst kørsel køres igen.

Cloudflare Workers Static Assets vælges som ny frontend-host. Dashboardet tilbyder kun
"Create Worker", ikke en separat Pages-oprettelse; det er korrekt — frontenden deployes som en
**asset-only Worker**.

----------------------------------------
HVAD MIGRATIONEN *IKKE* ÆNDREDE
----------------------------------------

- **Supabase forbliver backend.** Ingen migration, ingen databaseændring, ingen Edge-Function-ændring.
- Ingen ændring af appens funktionalitet. Ingen avatarændring. `AVATAR_R2` forbliver `false`.
- **Password-recovery følger den origin, appen serveres fra.** `js/login.js` sætter
  `redirectTo: window.location.origin + "/reset-password.html"`. Supabase' liste over tilladte
  redirect-URL'er er opdateret med Cloudflare-domænet. **Tages endnu et domæne i brug, skal dét
  domænes recovery-redirect godkendes i Supabase og verificeres, før brugere sendes derhen.**

----------------------------------------
HVORDAN BUILDET VIRKER
----------------------------------------

Frontenden ligger i **repo-roden**, side om side med `.env`, `.env.local`, `KUN TIL MIG.txt`,
`docs/`-beslutningsregistret, `tests/`, `tools/`, `supabase/` og 1.025 trackede filer under
`node_modules/`.

**Derfor må man aldrig køre `wrangler deploy --assets .`** — det ville publicere alt det.

`tools/cloudflare-build-static.mjs` kopierer i stedet en **eksplicit allowlist** til
`dist-cloudflare/` og **validerer resultatet bagefter**. En denylist ville kun være så god som den
sidste, der huskede at udvide den.

Output: **171 filer, 5,54 MB**

| | Antal | |
|---|---|---|
| Runtime-HTML | 13 | kopieret uændret |
| Genereret | 3 | `docs.html` (stub), `404.html`, `_redirects` |
| Root-entry | 3 | `app.js`, `style.css`, `supabaseClient.js` |
| `js/` | 79 | kun `.js` (`.jsx` er build-kilde) |
| `css/` | 1 | `theme.css` |
| `assets/` | 72 | `.svg .png .webp .wav` |

`dist-cloudflare/` er gitignored og bygges på ny ved hvert deploy.

### To sider genereres i stedet for at kopieres

**`docs.html`** — kildesiden henter `/docs/<fil>.md` ved runtime og er linket fra `hub.html` og
`admin.html`. At deploye den ville betyde at deploye intern dokumentation, herunder
`docs/ROADMAP.md`, som indeholder hele beslutningsregistret. Outputtet får derfor en neutral stub:
linkene virker fortsat, intet internt serveres, og der hentes ingen Markdown.
**Kilde-`docs.html` kopieres ikke. Der er 0 filer fra `docs/` i outputtet.**

**`404.html`** — krævet af `not_found_handling: "404-page"`. Neutral, uden projektinformation.

**`_redirects`** — én enkelt regel, se routingafsnittet nedenfor.

### ROUTING: EKSPLICITTE .html-ADRESSER BEVARES

Cloudflares standard, `html_handling: "auto-trailing-slash"`, fjerner endelsen og svarer **307**:

```
/login.html          → 307 → /login
/teacher.html        → 307 → /teacher
/student-detail.html → 307 → /student-detail
```

Det er verificeret på den kørende production-Worker, ikke gættet.

Appen er en traditionel multipage-app. Runtime-links, rolleredirects i `js/login.js` og
Playwright-kontrakten bruger alle eksplicitte `.html`-adresser, og fire assertions sammenligner den
endelige URL nøjagtigt:

```
tests/student-detail-domains.spec.ts:21,37   toHaveURL(`${PROD}/login.html`)
tests/teacher-dashboard.spec.ts:65           toHaveURL(`${PROD}/teacher.html`)
tests/teacher-dashboard.spec.ts:85           toHaveURL(`${PROD}/student-detail.html?id=…`)
```

Derfor er hostingen rettet ind efter appen frem for at svække testene til Cloudflares standard:

```jsonc
"html_handling": "none"
```

**Prisen** er, at `/` ikke længere selv finder en side. Buildet genererer derfor en `_redirects`
med præcis én regel:

```
/ /landing.html 200
```

**Roden er den offentlige landingsside, ikke quizzen.** `/` serverer marketingsiden
`landing.html`; elevens quiz beholder sin egen adresse på `/index.html`, uflyttet og uomdøbt.
Beslutningen, begrundelsen og hele kontrakten er dokumenteret i [`LANDING.md`](./LANDING.md) —
gentag den ikke her.

Status **200 betyder intern rewrite**, ikke redirect: browserens adresselinje viser fortsat `/`,
og der udsendes ingen 3xx. En 301/302 ville lægge `/landing.html` i adresselinjen og genindføre
netop det ekstra rundtur, reglen fjerner.

Det er **bevidst ikke** en SPA-fallback (`/* /landing.html 200`): ukendte stier skal fortsat ramme
404-siden, så et forkert link fejler synligt i stedet for lydløst at rendere forsiden.
`validateOutput()` afviser en wildcard-regel, en 301/302, en ekstra regel — og en regel, der
stille peger roden tilbage på quizzen.

Cloudflare læser `_redirects` som konfiguration og serverer den aldrig som fil.

**Kontrakten, bevist af `tools/cloudflare-serve-check.mjs`:**

| | |
|---|---|
| `/` `/landing.html` `/index.html` `/login.html` `/teacher.html` `/student-detail.html?id=…` `/avatar.html` `/reset-password.html` | **200, ingen 3xx** |
| `/` og `/landing.html` | samme dokument |
| `/` og `/index.html` | **forskellige** dokumenter — quizzen flyttede ikke |
| `/login` `/teacher` `/student-detail` `/avatar` `/reset-password` `/hub` `/admin` `/shop` `/landing` | **404** |
| `/_redirects` `/_headers` | **404** — konfiguration, ikke asset |
| ukendte stier | den neutrale 404-side |

### Bevidst udeladt

`gamefeel.html` (dev-sandbox uden indgående links fra nogen runtime-side) og `data/questions.js`
(refereres ikke af runtime-kode).

----------------------------------------
CLOUDFLARE DASHBOARD — PRÆCISE VÆRDIER
----------------------------------------

```
Production branch:   main
Build command:       node tools/cloudflare-build-static.mjs
Deploy command:      npx --yes wrangler@4.118.0 deploy
Build variable:      SKIP_DEPENDENCY_INSTALL=1
```

**Wrangler er pinnet til præcis 4.118.0 og er ikke en projektafhængighed.** Fordi Cloudflare kører
med `SKIP_DEPENDENCY_INSTALL=1`, kan man ikke regne med en lokalt installeret Wrangler; `npx --yes`
med en eksakt version henter netop den ene version ved deploy. En upinnet `latest` ville gøre
deployet uforudsigeligt. Projektets eksisterende testafhængigheder er uændrede — Wrangler tilføjes
hverken til `dependencies` eller `devDependencies`.

Buildet kører udelukkende på Node-builtins og kræver derfor ingen installation.

----------------------------------------
AKTIVERINGSFORLØBET — GENNEMFØRT
----------------------------------------

Skridtene blev udført i denne rækkefølge, hvert enkelt verificeret før det næste:

1. ✅ Worker `den-seje-app-frontend` oprettet i Cloudflare-dashboardet og forbundet med GitHub-repoet.
2. ✅ De fire værdier ovenfor indsat.
3. ✅ `*.workers.dev`-URL'en verificeret: login, quiz, shop, avatar.
4. ✅ Cloudflare-domænet tilføjet Supabase' tilladte redirect-URL'er.
5. ✅ Custom domain `lærlig.dk` tilknyttet — svarer 200.
6. ✅ E2E-målet flyttet: repository-variablen `PROD_BASE_URL`, og siden standardværdien i
   `tests/helpers.ts`.

**Udestående:** Vercel-integrationen er endnu ikke koblet fra GitHub, så `Account is blocked`-checket
bliver ved med at fejle på hver PR. Det er den eneste tilbageværende Vercel-binding.

----------------------------------------
PLAYWRIGHT — SÅDAN SKIFTES E2E-MÅLET
----------------------------------------

E2E-målet er nu defineret **ét sted**: `PROD` i `tests/helpers.ts`. Tidligere var adressen
kopieret ind i 21 spec-filer i ni forskellige formateringer, så et værtsskifte var en 21-filers
redigering — og suiten kunne kun nogensinde pege på én hardcodet adresse.

```ts
const CONFIGURED_BASE_URL = (process.env.PROD_BASE_URL ?? "").trim();
export const PROD = (CONFIGURED_BASE_URL || "https://xn--lrlig-sra.dk").replace(/\/+$/, "");
```

En **tom** værdi tæller som uangivet, ikke som en overstyring: i Actions udvider
`${{ vars.PROD_BASE_URL }}` til `""`, når variablen ikke findes, og `??` ville acceptere den tomme
streng — hver test ville så navigere til `/login.html` uden origin.

**To måder at skifte mål, begge uden at røre en eneste spec:**

1. **Midlertidigt / i CI** — sæt miljøvariablen. Ingen kodeændring:
   ```
   PROD_BASE_URL=https://<worker>.workers.dev
   ```
   I `.github/workflows/playwright.yml` sættes den på `test`-jobbet. Det er den rigtige måde at
   verificere Cloudflare-hosten, før domænet flyttes.

2. **Permanent** — ret default-værdien i `tests/helpers.ts`. Én linje.

Standardværdien var oprindeligt bevidst Vercel-adressen, fordi et værtsskifte er en selvstændig
beslutning og ikke en sidegevinst ved en oprydning. Den beslutning er nu truffet, og standarden er
den levende vært.

`tests/unit/e2e-base-url.test.mjs` (7 tests) holder det på plads: adressen må kun stå ét sted,
`PROD_BASE_URL` skal virke, trailing slash skal fjernes, ingen spec må redeklarere sin egen `PROD`,
og enhver spec der bruger `PROD` skal importere den fra `./helpers.js`. Guarden er verificeret ved
at slippe en spec med en hardcodet adresse ind i mappen og se den fejle.

----------------------------------------
SIKKERHEDSGEVINST
----------------------------------------

Vercels zero-config statiske hosting serverede fra repo-roden. Alt sporbart i roden — herunder
`/docs/project-state.md`, `/CLAUDE.md`, `/legacy_questions.json` og `/runBatch_dump.txt` — var
efter al sandsynlighed offentligt hentbart. Det kunne ikke verificeres bagefter, fordi siden
returnerede 402, men det er standardadfærden for den konfiguration.

Allowlist-buildet lukker det uanset hvad. `tools/cloudflare-serve-check.mjs` beviser det over
rigtig HTTP: 25 nødvendige stier svarer 200, og 24 interne stier — inkl. `/docs/ROADMAP.md`,
`/CLAUDE.md`, `/.env`, `/package.json`, `/node_modules/...` og path-traversal-forsøg — svarer 404.
