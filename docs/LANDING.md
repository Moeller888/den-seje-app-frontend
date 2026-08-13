# Landing page — Lærlig (offentlig forside)

Status: **LIVE i produktion.** Hjemmesiden er implementeret, merget og deployet. Den er
**flersidet**: forsiden på `/` plus seks selvstændige informationssider bag rene ruter. Appen,
auth, Supabase og avatarsystemet er uændrede.

**Produktionsadresse:** `https://den-seje-app-frontend.christ-moeller.workers.dev`
Der er fortsat **ikke** tilknyttet noget custom domæne — `lærlig.dk` peger ikke på noget.

Kanonisk for routing/hosting i øvrigt: [`HOSTING.md`](./HOSTING.md). Sidetabellen bor i
[`ARCHITECTURE.md`](./ARCHITECTURE.md) §3.

----------------------------------------
LEVERANCEHISTORIK
----------------------------------------

Fire trancher, alle merget og live. Rækkefølgen er den, de faktisk blev leveret i.

| # | PR | Merge | Hvad |
|---|---|---|---|
| 1 | [#176](https://github.com/Moeller888/den-seje-app-frontend/pull/176) | `be78b0d` | Landingssiden + rodrewrite `/` → `/landing.html` |
| 2 | [#178](https://github.com/Moeller888/den-seje-app-frontend/pull/178) | `afac962` | Fjernet den tomme topzone mellem header og hero |
| 3 | [#177](https://github.com/Moeller888/den-seje-app-frontend/pull/177) | `afa4d3d` | `login.html` visuelt tilpasset landingssiden |
| 4 | [#179](https://github.com/Moeller888/den-seje-app-frontend/pull/179) | `fc45af5` | Heroen strammet ind til indholdshøjde |
| 5 | [#181](https://github.com/Moeller888/den-seje-app-frontend/pull/181) · [#182](https://github.com/Moeller888/den-seje-app-frontend/pull/182) | `4d85c5c` · `4c6ea58` | Dette dokument bragt i overensstemmelse med produktionen |
| 6 | [#183](https://github.com/Moeller888/den-seje-app-frontend/pull/183) | `fa7296f` | **One-pager → flersidet hjemmeside.** Seks selvstændige sider bag rene ruter |
| 7 | [#186](https://github.com/Moeller888/den-seje-app-frontend/pull/186) | `ff6f029` | Teksten skrevet om i almindeligt dansk; "Om Lærlig" flyttet til footeren alene |
| 8 | denne tranche | — | **Forsiden gjort minimal:** kun hero. Oversigtskortene og slut-CTA'en fjernet |

**Forsiden er bevidst kun en hero.** Den skal gøre den besøgende nysgerrig, ikke forklare hele
produktet — hovedmenuen er vejen videre, og undersiderne står for dybden. Derfor er de seks
oversigtskort fjernet, og de er **ikke** erstattet af en ny tekstsektion. Slut-CTA'en røg med:
med kortene væk stod dens "VI LÆRER!"-knap kun én skærm under den identiske knap i heroen.

**Hvorfor den var en one-pager til at begynde med.** Tranche 1 leverede én side, fordi det var det,
Model A-auditten omfattede: målet dér var at få en offentlig forside overhovedet og at flytte `/`
sikkert over på den uden at røre appens routing. Menupunkterne var derfor in-page-ankre
(`#produktet`, `#priser`, …) — billigst muligt, og uden behov for nye ruter. Det holdt, indtil
indholdet voksede: alle seks emner lå på samme side, forsiden blev ~5.400 px høj, og hvert
menuklik scrollede i stedet for at navigere. Denne tranche retter strukturen, ikke symptomet.

*(#177 blev merget efter #178, selv om den blev åbnet før — dens CI-kørsel blev fortrængt af
concurrency-låsen og skulle køres igen på den rigtige commit.)*

Verificeret på produktionen efter hver merge: `/` og `/landing.html` = 200 og samme dokument,
`/index.html` = 200 og fortsat quizzen, `/login.html` = 200, `/landing` = 404,
`AVATAR_R2 = false`.

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

Hjemmesiden er **flersidet**. Hvert menupunkt er sin egen HTML-fil bag en ren rute:

| Rute | Fil |
|---|---|
| `/` | `landing.html` |
| `/produktet` | `produktet.html` |
| `/saadan-virker-det` | `saadan-virker-det.html` |
| `/elev-og-laerer` | `elev-og-laerer.html` |
| `/til-skoler` | `til-skoler.html` |
| `/priser` | `priser.html` |
| `/om-laerlig` | `om-laerlig.html` |

Uændret ved siden af: `/index.html` = elevens quiz, `/login.html` = fælles login. `/landing`,
`/login`, `/hub` m.fl. er fortsat **404** — kun de syv offentlige sider har rene ruter.

**`_redirects` er ikke længere én regel, men en eksplicit tabel.** `REDIRECT_RULES` i
`tools/cloudflare-build-static.mjs` er kilden, og `validateOutput()` holder den emitterede fil
op mod den **linje for linje, i samme rækkefølge**. Den afviser en ekstra regel, en manglende
regel, en ombytning, enhver wildcard, enhver status ≠ 200, en regel der peger roden tilbage på
quizzen — og en rute, hvis målfil ikke rent faktisk ligger i outputtet.

Det er bevidst **ikke** en mønsterbaseret resolver: intet resolver ved konvention, så en
stavefejl eller et dødt link rammer stadig 404-siden. At tilføje en offentlig side kræver en
linje i `REDIRECT_RULES` **og** en i `RUNTIME_HTML`.

Status **200 betyder intern rewrite**: adresselinjen bliver stående på den rene rute.

### Hvorfor header og footer er kopieret ind på hver side

Der er ingen build-proces og ingen server-side include, og at injicere navigationen med
JavaScript ville efterlade hjemmesidens navigation ødelagt uden JS og give et glimt ved hver
indlæsning. Markup-gentagelsen er den ærlige pris; **styling og opførsel er delt** gennem
`css/landing.css` og `js/landing.js`. En unit-test sammenligner navigationen på alle syv sider
og fejler, hvis de driver fra hinanden.

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

| Fil | | Tranche |
|---|---|---|
| `landing.html` | siden. Semantisk HTML, in-page-ankre, ingen eksterne ressourcer | #176 |
| `css/landing.css` | landingsspecifik CSS. Forbruger `theme.css`-tokens; ændrer ikke `theme.css` | #176 |
| `js/landing.js` | kun to ting: headerens scrolltilstand og en tilgængelig mobilmenu | #176 |
| `tests/landing.spec.ts` | 33 tests: routing, CTA, tilgængelighed, mobilmenu, responsivitet, reduced motion, herogeometri | #176, #178, #179 |
| `playwright.landing.config.ts` | isoleret config for begge offentlige overflader — se begrundelsen nedenfor | #176, #177 |
| `css/login.css` | loginspecifik CSS på samme tokens som landingssiden | #177 |
| `tests/login-page.spec.ts` | 15 tests: markup-kontrakten `js/login.js` afhænger af, glemt-panelets toggle, tilgængelighed, responsivitet | #177 |

**Ændrede**

| Fil | Ændring |
|---|---|
| `tools/cloudflare-build-static.mjs` | `landing.html` i `RUNTIME_HTML` + `MANDATORY`; `css/landing.css` i `MANDATORY`; `REDIRECTS_RULE` → `/ /landing.html 200`; 404-siden linker til forsiden |
| `tests/unit/cloudflare-static-build.test.mjs` | 13 → 14 sider; nye landingsassertions; rewrite-kontrakten; "quizzen flyttede ikke" |
| `tools/cloudflare-serve-check.mjs` | `/landing.html` i `MUST_SERVE`, `/landing` i 404-listen, rodrewrite + "quizzen flyttede ikke" over HTTP |
| `docs/HOSTING.md`, `docs/ARCHITECTURE.md` | routingafsnit og sidetabel |
| `login.html` (#177) | restylet på landingssidens flade. **Markup-kontrakten er urørt:** alle ID'er, `#forgotBtn`-teksten og den inline `display:none` på `#forgot-panel` |

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

### Ordbogsopslaget på `/elev-og-laerer`

Mellem sidens indledning og opdelingen mellem elev og lærer står navnets egen ordbogsdefinition
som et typografisk citat:

> **lærlig**, adj. · † om person: som egner sig til at belæres eller undervises; lærenem; lærvillig
> fra *[Ordbog over det danske Sprog](https://ordnet.dk/ods/ordbog?query=l%C3%A6rlig)*, bind 13, 1932

Fire ting er bevidste og testdækkede:

- **Rigtig HTML-tekst**, ikke et skærmbillede fra Ordnet. Den kan markeres, søges i og læses op.
- **Daggeren `†` er bevaret.** Den er ordbogens egen markering af, at betydningen er forældet —
  fjernes den, ændres påstanden. Den er derfor ikke skjult for skærmlæsere.
- **Kildeangivelsen er hel tekst.** Ordet "fra" står i markup, ikke som en genereret `::before`,
  og værkets titel er pakket i `<cite>`. Hele linjen er kursiv. En CSS-genereret tankestreg ville
  se ens ud på skærmen, men hverken kunne kopieres eller læses op — testen afviser den eksplicit.
- **Ingen overskrift over og ingen forklarende tekst under.** Opslaget står alene; en forklaring
  ville forklare pointen ihjel.

Kildelinket er den eneste eksterne adresse på hele hjemmesiden. Det er et `<a href>`, ikke en
indlæst ressource: browseren henter intet fra ordnet.dk, medmindre den besøgende selv klikker.
Unit-testen skelner nu mellem de to — `src`/`link`/`@import` mod en fremmed vært er stadig forbudt.

Typografien bruger en **lokalt installeret serif** (Georgia med fallbacks). Det holder
no-webfont-reglen og giver samtidig det redaktionelle udtryk, systemfonten ikke kan.

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

### Heroens geometri (efter #178 og #179)

**Heroen er indholdshøj. Der er intet viewportbaseret `min-height`.** Den er 642–644 px høj
uanset vinduesstørrelse, og næste sektion (`#produktet`) er **bevidst synlig ved folden**, så
siden læses som sammenhængende frem for som et titelkort, læseren skal forbi.

**Afstanden fra headerens underkant til heroens eyebrow er 40 px** — målt konstant på
produktionen ved 1280×800, 1440×900, 1536×864 og 1920×1080. Fire assertions i
`tests/landing.spec.ts` holder den mellem 35 og 45 px, bevidst målt ved **flere** viewporthøjder.

Sådan så det ud før. `.hero` havde `min-height: 100svh` **og** `align-items: center` **og**
120 px top-padding, på en sektion der starter ved headerens underkant. Viewporthøjden blev
dermed talt to gange, og centreringen delte det overskydende rum ligeligt over og under
indholdet. Gabet voksede med vinduet — 155 px ved 800 px høj, 294 px ved 1080 px:

| Viewport | Gab før | Gab nu |
|---|---|---|
| 1280×800 | 155 px | 40 px |
| 1440×900 | 204 px | 40 px |
| 1536×864 | 186 px | 40 px |
| 1920×1080 | 294 px | 40 px |

`--l-header-h: 69px` bruges af **både** `.header-inner` (som `calc(var(--l-header-h) - 1px)`,
hvor 1px er dens border) og af heroen, så de to ikke kan glide fra hinanden.

**Scroll-indikatoren er fjernet** (#179). Med en indholdshøj hero landede den to pixel under de
sekundære links, og den var samtidig blevet overflødig: den pegede ned på en sektion, læseren
allerede kan se. Markup og CSS er begge væk, og en test hævder at `.scroll-hint` ikke
genopstår.

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

Landingssiden hedder **Lærlig**, og `login.html` gør nu det samme (`<title>Log ind — Lærlig</title>`
plus wordmark og et "Tilbage til Lærlig"-link).

Appen bag login hedder fortsat **DEN SEJE APP** — det står i `<title>` på `index.html`, `hub.html`
og de øvrige elev-/lærersider. Overgangen er altså rykket ét skridt længere ind i flowet: forside
og login er Lærlig, resten er ikke. Det er fortsat **accepteret for fase 1**; en fuld brandmigration
rører hver eneste side og hører til sit eget spor.

----------------------------------------
ÅBNE PUNKTER (EJER)
----------------------------------------

1. **Der er ingen kontaktmulighed på siden.** Der findes ingen dokumenteret kontaktadresse i
   repoet, og der er ikke opfundet en. En offentlig side til skoler bør have én — den skal komme
   fra ejeren.
2. **Custom domæne mangler.** Værtsskiftet til Cloudflare er gennemført, og siden er live på
   `https://den-seje-app-frontend.christ-moeller.workers.dev`. Men `lærlig.dk` er **ikke**
   tilknyttet, så brandnavnet på siden svarer ikke til adressen. Vercel-checket fejler fortsat
   med `Account is blocked` på hver PR — en kontospærring, uafhængig af koden, som ikke blokerer
   merge (`main` er ikke branch-protected).
   **Password-recovery på Worker-origin er verificeret.** `js/login.js` bygger sin `redirectTo`
   ud fra `window.location.origin`; Supabase accepterer den origin, og recovery-flowet svarer
   303 til `…workers.dev/reset-password.html`. Verifikationen brugte `generateLink`, så der blev
   ikke sendt nogen mail og ikke ændret noget brugerkodeord.
   **Gælder kun denne origin.** Tages et custom domæne i brug, skal dét domænes
   recovery-redirect godkendes i Supabase og verificeres særskilt, før brugere sendes derhen.
3. ~~**`login.html` er ustylet rå HTML.**~~ **LØST 2026-08-08.** `login.html` deler nu
   landingssidens flade: samme tokens, ambient glow, glas-kort, wordmark og knapsprog
   (`css/login.css`). Markup-kontrakten er urørt — alle ID'er, `#forgotBtn`-teksten og den
   **inline `display:none`** på `#forgot-panel`, som `js/login.js` toggler imod. Dækket af
   `tests/login-page.spec.ts`.
   **Én rest:** `js/login.js` sætter `resetMessage.style.color` til `"red"`/`"green"` inline, og
   inline vinder over CSS. Begge nøgleord er ulæselige på den mørke flade (grøn ≈ 2,4:1), så
   `#reset-message` har fået en lys chip-flade, hvor begge klarer 4,5:1. Rodårsagsrettelsen er at
   bytte de to linjer ud med CSS-klasser — en `js/login.js`-ændring, som er bevidst holdt uden for
   dette scope. Anbefales som næste lille opgave.
4. **Produktbilleder mangler.** Se afsnittet ovenfor.
5. **`noindex` skal fjernes ved lancering.**
