# Landing page — Lærlig (offentlig forside)

Status: **implementeret, ikke deployet.** Denne tranche tilføjer en offentlig landingsside og
flytter rodruten `/` over på den. Den ændrer ikke appen, auth, Supabase, avatarsystemet eller
hostingopsætningen i øvrigt, og der er ikke tilknyttet noget domæne.

Kanonisk for routing/hosting i øvrigt: [`HOSTING.md`](./HOSTING.md). Sidetabellen bor i
[`ARCHITECTURE.md`](./ARCHITECTURE.md) §3.

----------------------------------------
BESLUTNINGEN (MODEL A)
----------------------------------------

Ejeren godkendte **Model A** efter en routingaudit, der sammenlignede tre modeller:

| Model | | |
|---|---|---|
| **A** | ny `landing.html` + rodrewrite; `index.html` bliver hvor den er | **valgt** |
| B | `index.html` bliver landingsside, quizzen flyttes til en ny adresse | afvist |
| C | en anden løsning, hvis routingen gjorde A/B uforsvarlig | ikke nødvendig |

**Hvorfor A og ikke B.** Auditten viste, at `/` i dag ikke har en eneste indgående reference i
runtime-koden: hver eneste navigation i appen bruger eksplicitte, relative `*.html`-adresser.
At ændre betydningen af `/` har derfor en usædvanligt lille blast radius. Model B ville derimod
kræve samtidige, korrekte ændringer i rolleredirectet i `js/login.js`, `playBtn` og otte
`next-goal`-links i `hub.html`, cirka 20 Playwright-specs, syv avatar-specs der mapper `"/"` til
`/index.html` direkte på filsystemet, samt alle eksisterende bogmærker til `/index.html` — en
migration af appens mest centrale rute for at få en marketingside.

----------------------------------------
ROUTINGKONTRAKTEN
----------------------------------------

```
/                → intern rewrite (200) → /landing.html    offentlig forside
/landing.html    → samme side, eksplicit adresse
/index.html      → elevens quiz, UÆNDRET
/login.html      → fælles login for alle roller, UÆNDRET
/landing         → 404 (den eksplicitte .html-kontrakt gælder også landingssiden)
```

`_redirects` indeholder fortsat **præcis én regel**. `validateOutput()` afviser en ekstra regel,
en wildcard og en 301/302 — og afviser nu også en regel, der stille peger roden tilbage på
quizzen. Status **200 betyder intern rewrite**: adresselinjen bliver stående på `/`.

**Quizzen er ikke flyttet, omdøbt eller ændret.** `index.html`, `app.js`, `js/login.js`, alle
auth-guards og alle rolleredirects er byte-identiske med `bde9ca5`. En unit-test hævder eksplicit,
at elevens rolleredirect stadig peger på `index.html`, og serve-check beviser over HTTP, at
`/index.html` fortsat serverer quiz-shellen, og at `/` og `/index.html` er to forskellige
dokumenter.

**Kendt og accepteret:** et gammelt bogmærke direkte til `/` viser fremover landingssiden i stedet
for quizzen. `/index.html` fortsætter uændret. Det er en bevidst ejerbeslutning.

### Hvorfor CTA'en peger på `login.html`

"VI LÆRER!" er et almindeligt `<a href="login.html">` — ikke en knap med en JavaScript-handler.

- `login.html` er den dokumenterede fælles indgang for alle tre roller, og `js/login.js` **ejer
  allerede** rollefordelingen (student → `index.html`, teacher → `teacher.html`, super_admin →
  `admin.html`, tvungen nulstilling → `reset-password.html?forced=1`). Enhver anden destination
  ville duplikere den logik.
- `index.html` ville være forkert: `app.js` er auth-beskyttet og kalder
  `location.replace("login.html")` for en anonym besøgende — altså et glimt af app-UI til en
  fremmed, efterfulgt af et redirect. En test fastholder den begrundelse.
- Et rigtigt `<a>` virker uden JavaScript, med midterklik og med tastatur, og opfører sig
  identisk fra `/` og fra `/landing.html`.

**Kendt hul, ikke rørt her:** `login.html` har ingen "allerede logget ind"-kontrol. En elev med
aktiv session, der klikker CTA'en, ser loginformularen igen i stedet for at blive sendt videre.
Det er præeksisterende adfærd; at rette det er en auth-ændring og ligger uden for dette spor.

----------------------------------------
FILER
----------------------------------------

**Nye**

| Fil | |
|---|---|
| `landing.html` | siden. Semantisk HTML, in-page-ankre, ingen eksterne ressourcer |
| `css/landing.css` | landingsspecifik CSS. Forbruger `theme.css`-tokens; ændrer ikke `theme.css` |
| `js/landing.js` | kun to ting: headerens scrolltilstand og en tilgængelig mobilmenu |
| `tests/landing.spec.ts` | 26 tests: routing, CTA, tilgængelighed, mobilmenu, responsivitet, reduced motion |
| `playwright.landing.config.ts` | isoleret config — se begrundelsen nedenfor |

**Ændrede**

| Fil | Ændring |
|---|---|
| `tools/cloudflare-build-static.mjs` | `landing.html` i `RUNTIME_HTML` + `MANDATORY`; `css/landing.css` i `MANDATORY`; `REDIRECTS_RULE` → `/ /landing.html 200`; 404-siden linker til forsiden |
| `tests/unit/cloudflare-static-build.test.mjs` | 13 → 14 sider; nye landingsassertions; rewrite-kontrakten; "quizzen flyttede ikke" |
| `tools/cloudflare-serve-check.mjs` | `/landing.html` i `MUST_SERVE`, `/landing` i 404-listen, rodrewrite + "quizzen flyttede ikke" over HTTP |
| `docs/HOSTING.md`, `docs/ARCHITECTURE.md` | routingafsnit og sidetabel |

### Hvorfor `playwright.landing.config.ts` findes

Default-`playwright.config.ts` erklærer `globalSetup: './tests/global-setup.ts'`, som taler med det
**levende Supabase-projekt**: den kører question-pool-health-check, opretter/opdaterer testlærer og
to testelever, nulstiller deres adgangskoder og **sletter deres `question_instances`-rækker**. Det
er en produktionsdatamutation, og den sker før en eneste test kører — den kan altså ikke undgås ved
at vælge hvilken spec man afvikler.

`tests/landing.spec.ts` har ikke brug for noget af det: landingssiden er statisk, har ingen
Supabase-klient og ingen session. Den isolerede config udelader derfor `globalSetup` helt og
indlæser ingen `.env` — nøjagtigt samme kontrakt som `playwright.headwear.config.ts` og
`playwright.torso.config.ts` allerede bruger. Under den config laver hele kørslen **nul
backendkald**.

Specen er selvbetjent (en lokal `http.Server` serverer branchens egne filer og modellerer
rodrewriten), så den består **også** under default-configen i CI, uden at landingssiden behøver
være deployet.

----------------------------------------
TEKSTENS DOKUMENTATIONSGRUNDLAG
----------------------------------------

Ingen produktpåstand på siden er opfundet. Hver enkelt kan føres tilbage til et kanonisk dokument
eller til faktisk runtime-adfærd:

| Påstand på siden | Kilde |
|---|---|
| Dansk læringsplatform, elever ca. 8–16 år | `PROJECT_VISION.md` → Mission, Target audience |
| Korte forløb: log ind → svar → feedback → videre | `PROJECT_VISION.md` → Educational principles |
| Rigtigt svar: gensyn næste dag. Forkert: efter få minutter | `ARCHITECTURE.md:205` — `next_review_at` +1 dag / +10 min |
| Forkerte svar kan bære forklaring og misforståelsessignal | `ARCHITECTURE.md:207-208`, `173` (`review_text`, `misconception_type`) |
| Kun det entydige afgøres automatisk; resten går til læreren | `PROJECT_VISION.md` → Core philosophy 1 |
| Lange svar vurderes af læreren, XP efter lærerens vurdering | `PROJECT_VISION.md` → "Open answers belong to teachers" |
| Næste spørgsmål følger klassetrin og sværhedsgrad | `ARCHITECTURE.md:122` grade/difficulty-schema |
| Tilfældighed afgør aldrig rigtigt/forkert eller belønning | `PROJECT_VISION.md` → "Not a casino", Determinism |
| Aldrig nedgørende feedback, ingen nederlagsskærme | `PROJECT_VISION.md` → Never-negative, D-024 |
| Figur eleven selv former: krop, frisure, hårfarve, hudtone | `PROJECT_VISION.md` → identitetsmodellen |
| Dataminimering som designprincip, mindreårige brugere | `PROJECT_VISION.md` → "Not a data-harvesting product" |
| Før lancering, pilotskala, lille selvstændigt drevet produkt | `PROJECT_VISION.md` → Scale assumption, Long-term goals |

**Bevidst udeladt:**

- **Ingen AI-påstande.** `PROJECT_VISION.md:121` fastslår, at ingen AI-tjeneste er implementeret.
  Siden nævner ikke AI med ét ord.
- **Ingen priser og ingen abonnementspakker.** Prissektionen siger ligeud, at prisen ikke er
  fastlagt, frem for at få placeholdertekst.
- **Ingen kontaktoplysninger.** Der findes ingen dokumenteret kontaktadresse i repoet, og der
  opfindes ingen. Se "Åbne punkter".
- **Ingen juridiske GDPR-løfter.** Dataminimering beskrives som et designprincip — som
  dokumentationen understøtter — ikke som en juridisk garanti.
- **Ingen tal om resultater, kunder, skoleaftaler eller testimonials.**
- **Ingen billeder overhovedet.** Se næste afsnit.

----------------------------------------
INGEN BILLEDER — MED VILJE
----------------------------------------

Siden indeholder **nul `<img>`-elementer**, og en unit-test håndhæver det.

Der findes i dag ingen godkendte marketingklare produktskærmbilleder. De eneste screenshots i
repoet er Playwright-goldens — små avatar-crops lavet til pixeldiff, som desuden ligger i `tests/`
og aldrig shipper. Avatarreferencerne under `assets/avatar/reference/` (herunder
Northstar-materialet) er **kunstreference**: den live avatar er en flad SVG-placeholder, ikke
Northstar-figuren. At bruge dem i marketing ville reklamere for noget, brugeren ikke får.

Siden er derfor komponeret, så den fungerer ærligt uden billeder: typografi, rytme og ét stærkt
CTA-objekt bærer den. Når rigtige skærmbilleder er taget og godkendt, kan de lægges i
`assets/marketing/` som `.webp` — den endelse ligger allerede i buildets allowlist, så det kræver
**ingen** ændring af buildkontrakten.

**`AVATAR_R2` er uændret `false`. Ingen avatar-assets, manifests eller feature flags er rørt.**

----------------------------------------
DESIGN
----------------------------------------

- **Tokens fra `css/theme.css`.** Default-temaets navy er basen (`--bg-main #12122a`,
  `--bg-panel #1a1a3e`, `--avatar-outer #0a0a20`, `--border #2a2a5a`). Højdepunkterne låner
  ice-temaets `--accent #0288d1` og `--info-text #90caf9`. `theme.css` er ikke ændret, og der er
  ikke tilføjet et 11. tema.
- **Landingssiden læser bevidst ikke elevens gemte tema.** Den renderer altid den samme navy
  identitet, så brandfladen er deterministisk for enhver besøgende.
- **`--text-muted` (#555588) bruges ikke til brødtekst.** Kontrasten mod `--bg-main` er ca. 3,1:1,
  under de 4,5:1 der kræves. Landingssiden har sin egen læsbare sekundærfarve (`--l-soft #9aa3c4`).
- **Systemfont-stack.** Ingen webfont-fil, intet CDN. Google Fonts er udelukket: det ville sende
  brugerens IP til USA ved hver sidevisning på et produkt til danske folkeskoler.
- **`backdrop-filter` er nyt i kodebasen** og bruges kun i headerens scrolltilstand, bag
  `@supports`. Uden understøttelse bliver headeren en solid flade — altid læsbar.
- **De ambiente glows er radiale gradienter, ikke skarpe cirkler med blur.** Under 640px droppes
  `filter: blur()`, fordi det er dyrt på svage skoletablets; fordi formen selv fader ud, opstår der
  ingen hård kant. (Det var en reel defekt, fanget i visuel QA og rettet.)
- **Reduced motion:** bevægelse fjernes, men affordancen bevares som farve/glow — CTA'ens løft
  forsvinder, glowet gør ikke. Ingen pulserende CTA, hverken med eller uden reduced motion.
- **44×44 minimum hitområde.** Korte navnelabels ("Priser") er 37px brede af sig selv, så
  breddegulvet er lige så bærende som højdegulvet. En test hævder begge.

----------------------------------------
PRE-LAUNCH
----------------------------------------

Siden bærer `<meta name="robots" content="noindex, nofollow">`. Det er midlertidig
pre-launch-beskyttelse og skal fjernes bevidst ved lancering.

Der er **ikke** oprettet `robots.txt` eller `sitemap.xml`, og buildkontrakten er ikke udvidet for
dem. Bemærk at det ikke bare er et fravalg: `.txt` står i `FORBIDDEN_EXTENSIONS`, så en
`robots.txt` i outputtet ville få `validateOutput()` til at slette hele buildet. At publicere en
rigtig robots.txt kræver derfor en bevidst, snæver undtagelse i buildkontrakten — samme slags
beslutning som `KNOWN_STRING_EXCEPTIONS`.

----------------------------------------
KENDT FASE-1-FORHOLD: BRANDOVERGANGEN
----------------------------------------

Landingssiden hedder **Lærlig**. Appen bagved hedder fortsat **DEN SEJE APP** — det står i
`<title>` på `index.html` og `login.html`.

En besøgende går derfor fra "Lærlig" til "DEN SEJE APP" i ét klik. Det er **accepteret for fase 1**
og bevidst ikke rettet her: en brandmigration rører hver eneste side og hører til sit eget spor.

----------------------------------------
ÅBNE PUNKTER (EJER)
----------------------------------------

1. **Der er ingen kontaktmulighed på siden.** Der findes ingen dokumenteret kontaktadresse i
   repoet, og der er ikke opfundet en. En offentlig side til skoler bør have én — den skal komme
   fra ejeren.
2. **Hosting er ikke afsluttet.** Vercel svarer 402; Cloudflare-Workeren er deploybar, men ikke
   aktiveret for brugere; `lærlig.dk` er ikke tilknyttet. Landingssiden kan ikke publiceres, før
   værtsskiftet er gennemført — og Supabases liste over tilladte redirect-URL'er skal opdateres,
   **før** brugere sendes til det nye domæne (`js/login.js` bygger sin `redirectTo` ud fra
   `window.location.origin`).
3. **`login.html` er ustylet rå HTML.** Den er det første, en besøgende ser efter det vigtigste
   klik på siden. En poleret forside, der leverer direkte ind i den, gør springet mere synligt,
   ikke mindre. Selvstændig opgave.
4. **Produktbilleder mangler.** Se afsnittet ovenfor.
5. **`noindex` skal fjernes ved lancering.**
