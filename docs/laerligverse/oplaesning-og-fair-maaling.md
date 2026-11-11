# Oplæsning i Arkivskabet og fair måling af kildekritik (D-346, F9)

Status: **UNDERSØGELSE OG FORSLAG.** Der er bygget en lille prototype, der er slået fra som standard, men kun på
prøvegodkendelsessiden og ikke i spillet. Ingen tekst sendes til nogen tjeneste. Intet er aktiveret for elever.

## 1. Rettelse af F8

F8 skrev: »Oplæsning i spillet ville være et nyt system, og en løsning som Azure sender tekst til en ekstern
tjeneste.« Det er kun delvist rigtigt:

- Lærlig har allerede et oplæsningssystem (`js/read-aloud/`, 157O/157P), så det er ikke nyt.
- Ikke al oplæsning sender tekst ud af computeren. Lokale stemmer og forudindspillede klip gør ikke.

F8's påstand er ikke brugt som beslutningsgrundlag her.

## 2. Hvad Lærlig har i dag (verificeret i kode)

| Del | Fil | Hvad den gør | Sender tekst? |
|---|---|---|---|
| Facade | `js/read-aloud/index.js` | Én indgang. I produktionen er det **kun Azure** (`ENABLE_READ_ALOUD = true`). Web Speech kun bag `ENABLE_WEBSPEECH_DEV_FALLBACK = false` | — |
| Azure (cached) | `js/read-aloud/provider-azure.js` | 1) `GET /tts/v<N>/<nøgle>.json`, et offentligt, uforanderligt klip; 2) ved et cache-miss `POST /api/tts` med elevens token til Lærligs Worker, som kalder Azure. Nøglen er SHA-256 af tekst og sprog (`tts-key.js`) | **Ja, ved cache-miss:** opgaveteksten (aldrig navne eller brugerdata) går via Lærligs Worker til Microsoft Azure |
| Web Speech | `js/read-aloud/provider-webspeech.js` | Browserens `speechSynthesis`. Den foretrækker »Natural«- og »Google«-stemmer og kontrollerer **ikke** `localService` | **Afhænger af stemmen.** Chromes »Google dansk« og Edges »Natural«-stemmer er netværksstemmer, hvor browseren sender teksten til Google/Microsoft. Lokale OS-stemmer gør ikke |
| Forudindspillet (Piper) | `js/read-aloud/provider-prerecorded.js`, `tools/read-aloud/generate-clips.mjs` | Afspiller færdige lydfiler fra et manifest | **Nej** ved afspilning |
| Quiz-adapter | `js/read-aloud/adapters/quiz.js` | Kobler facaden til quizzen | — |

Arkivskabet (`adventure-engine/packages/archive-prototype`) bruger ingen af dem. Spillet er bygget med vite og
deler ikke modul med `js/`. Facaden *kan* importeres, men Azure-stien kræver en indlogget elev (token) og Lærligs
Worker, og den lokale demo har ingen af delene.

## 3. Målt på denne maskine (Windows 11, Playwright-browsere, 4. november 2026)

`speechSynthesis.getVoices()`:

| Browser | Stemmer | Danske lokale stemmer |
|---|---|---|
| Chromium (Playwright) | Microsoft Helle (da-DK, `localService=true`) | 1 |
| Firefox (Playwright) | Microsoft Helle, Stine (da-DK), Claire (en-GB), Zira (en-US), alle `localService=true` | 2 |
| WebKit (Playwright, Windows) | **`speechSynthesis` findes ikke** | 0 |

Windows' stemmeliste i registreringsdatabasen har de samme fire stemmer. **Ikke målt:**

- rigtig Chrome, som desuden viser Googles netværksstemmer;
- Edge (»Natural«-netværksstemmer);
- Safari/macOS/iOS, hvor Apple har en lokal dansk stemme (Sara), men det er ikke kontrolleret her;
- Chromebooks og skole-iPads.

**Konsekvens:** Kvalitet og tilgængelighed af browseroplæsning afhænger af elevens maskine. En skole-pc kan have
én robotagtig dansk stemme, ingen eller en netværksstemme.

## 4. Beslutningsmatrix

| | **A. Browserens lokale stemmer** (`speechSynthesis`, kun `localService=true`) | **B1. Lærligs Azure-pipeline, forudgenereret for de faste tekster** | **B2. Piper, lokalt genereret** | **B3. Azure live som i quizzen** | **C. En ny ekstern tjeneste** |
|---|---|---|---|---|---|
| Dansk udtale | Varierer. Microsoft Helle er forståelig, men robotagtig | Høj (Azure Neural, samme som quizzen) | Middel (Piper har en dansk stemme, men den er ikke afprøvet her) | Høj | Ukendt |
| Browsere | Chromium og Firefox: ja. WebKit/Windows: nej. Safari: ikke målt | Alle (en lydfil) | Alle (en lydfil) | Alle | Alle |
| Tilgængelighed | Afhænger af maskinen; ingen stemme = ingen oplæsning | Den samme stemme for alle elever | Den samme for alle | Den samme for alle | — |
| Privatliv | Intet sendes, **hvis** browseren angiver stemmen korrekt som lokal (vi kan ikke selv kontrollere det) | De faste, konstruerede undervisningstekster sendes **én gang** til Azure ved genereringen. Ingen elevtekst, ingen elevdata, intet ved afspilning | Intet sendes | Teksten sendes ved hvert cache-miss med elevens token til autentificering | Ny databehandler, kræver aftale |
| Pris | 0 | En lille engangsudgift: nogle tusinde tegn (prøvernes kilder er ca. 1.200 tegn; spørgsmål og spillets tekster kommer oveni). Ikke beregnet | 0 (kræver installation) | Løbende, lille | Ukendt |
| Kompleksitet | Lav | Middel: et genereringsskridt + filer i bundtet | Middel–høj: installation og stemmefiler | Høj i den lokale demo (kræver login og Worker) | Høj |
| Vedligehold | Lav | Ny generering, når en tekst ændres. Det passer med fingeraftrykkene | Som B1 | Lav | Høj |
| Egnet til børn | Delvist: en robotstemme kan virke afskrækkende | Ja: samme stemme, som eleverne kender fra quizzen | Sandsynligvis | Ja | — |

## 5. Anbefaling

1. **Til piloten (papir): menneskelig oplæsning.** Læreren eller en makker læser op. Det er det enkleste, virker
   overalt, og intet sendes.
2. **Til Arkivskabet: B1.** Forudgenerer klip af spillets *faste* tekster (introkort, opgaver, bagsider) og
   prøveteksterne med Lærligs eksisterende Azure-pipeline, og afspil dem som lydfiler. Under spillet sendes intet,
   der kommer ingen elevtekst, alle får samme stemme som i quizzen, og det virker også i WebKit.
   - **Det kræver et særskilt GO**, fordi de faste tekster sendes én gang til Azure.
   - Hvis en godkendt tekst ændres, ændres dens fingeraftryk, og klippet skal genereres igen.
3. **A kun som udviklingsprototype** (bygget, se §6), til at høre teksterne nu. Ikke som elevløsning: kvaliteten
   og tilgængeligheden varierer, og WebKit på Windows har ingen oplæsning.
4. **B3 og C anbefales ikke** til Arkivskabet.

## 6. Prototypen (bygget)

På `docs/laerligverse/proeve-godkendelse.html`, **slået fra som standard** (afkrydsningsfeltet »Prøv oplæsning«):

- Kun stemmer med `lang` da\* **og** `localService === true`. Findes ingen, vises »Ingen lokal dansk stemme«,
  og der tales ikke. Der er ingen reserve med netværksstemmer.
- Knapperne er Læs op, Pause, Fortsæt og Stop. En ny »Læs op« stopper først den igangværende.
- Kun elevens tekst læses op, aldrig facit eller lærerdelen.
- Siden har en streng CSP (`default-src 'none'`) og intet `fetch`/XHR. Den kan altså ikke selv sende noget. Om
  *browseren* sender teksten, afhænger af stemmen (se §2), og derfor filtreres der på `localService`.

**Tests** (`adventure-engine/e2e/proeve-godkendelse.spec.ts`, med en falsk `speechSynthesis`):

- start, pause, fortsæt, stop og gentag;
- sproget er da-DK, og den lokale stemme vælges frem for en dansk netværksstemme;
- ingen lokal dansk stemme → besked, og intet tales;
- ingen netværkskald.

**Begrænsninger:**

- Testene bruger en falsk stemme. Den rigtige lyd er hverken hørt eller testet; kun stemmelisten er målt (§3).
- `localService` er browserens egen angivelse.
- Ingen ordfremhævning.
- Ingen hastighedsvælger. Hastigheden er fast 0,9.

## 7. Tilgængelighed og fair måling

**1. Hvad kræver selvstændig læsning?**
- Kilden: 35–58 ord.
- Spørgsmålene: ca. 15 linjer.
- Del 3's kildekort: fire korte linjer.
- I spillet: introkort på 53–69 ord og bagsider på 104–122 ord pr. opgave.

**2. Er læsning en del af læringsmålet?** **Nej.** Målet er at bruge en kildes ophav til at vurdere, hvad den kan
bruges til. At *afkode* tekst selv er ikke målet. At *forstå* indholdet er det (man kan ikke vurdere en kilde, man
ikke har forstået).

**3. Bør oplæsning være tilladt?** **Ja, for alle elever og ved alle målinger.** Ikke kun for elever med
en diagnose: så skal ingen udpeges, og forholdene er ens.

**4. Påvirker det sværhedsgraden?** Ja. Oplæsning gør især del 1 (R1/R2) lettere for svage læsere og ændrer
næppe noget for gode læsere. Det er *meningen*, for det fjerner en barriere, som ikke er en del af målet. Til
gengæld er en elevs score uden oplæsning ikke direkte sammenlignelig med en score med oplæsning.

**5. Skal brug af oplæsning registreres?** Ja, pr. elev og pr. måling (`*_stoette`). Det er ikke en dom, men en
forudsætning for at sammenligne.

**6. Hvordan sammenlignes elever med forskellig støtte?** Hovedsagen er ændringen pr. elev (B − A) med *samme*
støtte, så eleven er sin egen kontrol. Rapportér grupperne med og uden oplæsning for sig, og sammenlign ikke
niveauer på tværs.

**7. Samme støtte ved prætest og posttest?** **Ja, altid.** En elev, der får oplæsning i B, men ikke fik den i A,
indgår *ikke* i B − A. Hvis det sker, skal det noteres, og eleven rapporteres for sig.

**8. Konsekvens for rubrikken:**
- R1/R2 er næsten rene læsetests uden oplæsning. Med oplæsning måler de om eleven *hører* afsender og tid.
- B1/B2 kræver skrivning. Et mundtligt svar til læreren skal derfor tælle på samme måde (se tvivlstilfælde S2).

### 7.1 Ens testprocedure (forslag)

| Støtte | Regel | Registreres |
|---|---|---|
| **Oplæsning** | Tilbydes alle elever ved A, B, T og C. Den samme form (lærer, makker eller lyd) for den samme elev hver gang | `*_stoette`: `oplaesning_laerer`, `oplaesning_makker`, `oplaesning_lyd` |
| **Skriftlig begrundelse** | Standard. Korte svar accepteres, og stavning bedømmes ikke | — |
| **Mundtlig begrundelse** | Tilladt for alle. Læreren skriver ordret ned, hvad eleven siger, uden at omformulere | `mundtlig` |
| **Lærerens hjælp** | Kun til teknik og ordforklaringer, som allerede står på arket. Aldrig til kildekritik (»hvem er afsenderen?«) | `hjaelp` + kort note. En elev med faglig hjælp indgår ikke i B − A for den måling |
| **Ekstra tid** | Tilladt for alle (op til det dobbelte). Tiden er ikke en del af målet | `ekstra_tid` |
| **Visuel støtte** | Større skrift eller linjeafstand er tilladt for alle. Billeder eller farvekoder, der fremhæver svaret, er ikke | `visuel` |

**Regel:** Støtten skal være den samme ved A og B (og C). Ændres den, noteres det, og eleven rapporteres for sig.
