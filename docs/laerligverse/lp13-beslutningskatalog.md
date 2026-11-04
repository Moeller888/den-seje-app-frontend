# LP-13-beslutningskatalog: sekvenspolitik for ét læringsmål (D-341, F7)

Status: **TIL EJERENS BESLUTNING.** Ingen af beslutningerne er truffet. Den kørende politik
`laerligverse-test-policy-v0` (`supabase/functions/_shared/learning-sequence.ts`, D-338) er en **foreløbig
testpolitik**. Den er slået fra som standard (`LAERLIGVERSE_SEQUENCE`) og findes kun i den isolerede stak og i
den lokale demo. **Ingen ubesluttet politik må aktiveres for rigtige elever.**

Hver beslutning har 2–3 muligheder, konsekvenser, min anbefaling og det, Christopher skal godkende.
Anbefalingerne er **Hypoteser** med begrundelse, ikke dokumenterede effekter.

---

### LP13-1 — Hvad udløser revision efter støttet øvelse?

| Mulighed | Konsekvens |
|---|---|
| **A. Det seneste svar i øvelse er forkert** (testpolitikken i dag) | Enkelt og forudsigeligt. Et heldigt gæt springer revisionen over |
| B. Ét forkert svar ELLER brugte hints | Fanger elever, der kun klarede sig med hjælp. Kræver hints på serveren (K1 + L5) |
| C. Altid revision | Alle får to øvelser. Langsommere for dem, der kan stoffet (expertise reversal, Kalyuga m.fl. 2003) |

**Anbefaling:** A nu, B når hints registreres på serveren. **Godkend:** A som pilotpolitik; B som mål.

### LP13-2 — Hvor mange revisioner, og hvad sker der ved fortsat forkert svar?

| Mulighed | Konsekvens |
|---|---|
| **A. Højst én revision, derefter videre** (i dag) | Ingen sløjfe; ingen elev sidder fast. En elev, der ikke har forstået, går videre |
| B. Op til to revisioner, derefter videre med en lærermarkering | Mere øvelse; læreren ser, hvem der kæmper. Kræver en lærervisning (findes ikke) |
| C. Revision indtil rigtigt | Risiko for gæt-sløjfe (25 % pr. forsøg) og frustration; »rigtigt til sidst« betyder lidt |

**Anbefaling:** A til piloten (læreren er i lokalet). B senere. **Godkend:** A + at C aldrig bruges.

### LP13-3 — Må svar med hints tælle?

| Mulighed | Konsekvens |
|---|---|
| **A. Hints kun i øvelse; tæller aldrig som selvstændig præstation** | I tråd med »the assistance dilemma« (Koedinger & Aleven 2007). Kræver, at `check`/`application`/`review` ikke har hints (i dag: verdenen viser dem ikke dér) |
| B. Hints tilladt overalt, men registreret og fratrukket | Mere fleksibelt; kræver en vægtning, som ingen har valideret |
| C. Ingen hints | Simpelt; fjerner stilladseringen fra øvelsen |

**Anbefaling:** A. **Godkend:** A, og at serveren (ikke klienten) skal kende hints, før et svar kan bruges som
evidens (L5).

### LP13-4 — Hvad sker der ved forkert svar i selvstændig anvendelse?

| Mulighed | Konsekvens |
|---|---|
| **A. Videre til overførsel** (i dag) | Forløbet er kort og forudsigeligt; svaret registreres som forkert |
| B. Tilbage til én ny øvelse, derefter et nyt `check` | Mere læring for den, der ikke kunne; kræver flere opgaver pr. trin (findes ikke: én pr. trin) |
| C. Lærermarkering, ingen automatisk ændring | Læreren beslutter; kræver lærervisning |

**Anbefaling:** A til piloten; B kræver flere reviewede opgaver. **Godkend:** A for piloten.

### LP13-5 — Hvad tæller som overførsel?

| Mulighed | Konsekvens |
|---|---|
| **A. Ny periode, samme opgaveform** (1864) | »Nær overførsel« (Barnett & Ceci 2002). Billigt; overvurderer muligvis |
| B. Ny periode OG ny opgaveform (fx en begrundelse) | Stærkere; kræver lærerbedømmelse |
| C. Andet fag/emne | Fjern overførsel; uden for ét mål |

**Anbefaling:** A, men kald det »overførsel til en ny periode«. **Godkend:** ordet, der bruges over for lærere.

### LP13-6 — Genbesøgsinterval

| Mulighed | Konsekvens |
|---|---|
| **A. 20 timer** (forslag i dag) | Mindst én nats søvn; kort fastholdelse |
| B. 7 dage | Bedre match til fastholdelse over uger (Cepeda m.fl. 2008); passer til en ugentlig historietime |
| C. Lærerens valg pr. klasse | Fleksibelt; sværere at sammenligne |

**Anbefaling:** B til piloten (eller 2–4 uger, som pilotoplægget foreslår), A kun i test. **Godkend:** værdi.

### LP13-7 — Hvad må »gennemført« hedde?

| Mulighed | Konsekvens |
|---|---|
| **A. »Alle trin har et svar«** (i dag; dev-panelet) | Sandt; lover intet om læring |
| B. »Gennemført forløb« + en tabel over rigtige/forkerte pr. trin til læreren | Nyttigt for læreren; eleven får ingen dom |
| C. »Mestret« | **Frarådes.** Kan ikke dokumenteres med ét svar pr. trin (Soderstrom & Bjork 2015; Pelánek & Řihák 2017) |

**Anbefaling:** B. **Godkend:** B, og at C ikke bruges, før en mestringspolitik er besluttet og valideret.

### LP13-8 — Læringsmålets id

| Mulighed | Konsekvens |
|---|---|
| A. `kildekritik.ophav` (prototype) | Matcher verdenen; ikke i Lærligs måltaksonomi |
| B. Et id i Lærligs taksonomi (LP-2) | Kræver LP-2 |

**Anbefaling:** B, når LP-2 er besluttet. **Godkend:** LP-2 først.

---

## Det skal Christopher godkende (samlet)

1. LP13-1 A, LP13-2 A, LP13-3 A, LP13-4 A som **pilotpolitik** (ikke produktion).
2. LP13-6: intervallet til piloten.
3. LP13-7 B, og at »mestret« ikke bruges.
4. Om politikken må få et nyt id (`laerligverse-pilot-policy-v1`), når 1–3 er besluttet. Den gamle testpolitik
   bliver ved med at hedde »test«.

Ingen af disse godkendelser omfatter deploy, migration eller aktivering for rigtige elever. Det kræver
særskilte GO'er.

---

## Beslutningsskema (F8, D-344)

Kort grundlag til Christopher. **Godkendelsen af Arkivskabets indhold (04-11-2026) godkender ikke nogen af
reglerne.** Ingen af dem er implementeret som produktionsregel. Den kørende testpolitik v0 er stadig »test«.
Henvisningerne til forskning er de primærkilder, der allerede er verificeret i `laeringsmodel-og-evidens.md` §2.1
og `docs/learning-progression-source-verification.md`. Ingen af dem dokumenterer en effekt for Lærlig.

| Regel | Hvad skal besluttes? | Muligheder | Anbefaling | Hvorfor / forskning | Stærke og svage elever | Teknisk betydning | Sådan testes den | Hvis vi vælger forkert |
|---|---|---|---|---|---|---|---|---|
| **LP13-1** Revision | Hvad sender en elev til revision efter øvelsen (trin 3, proklamationen)? | A: seneste svar forkert · B: forkert eller hints · C: altid | **A** til piloten, B som mål | Feedback virker bedst, når den bruges på en ny opgave (Hattie & Timperley 2007). B kræver hints på serveren | Svag elev (generalprøvens A): får revisionen (ordren). Stærk elev (C): springer den over, uden spildtid. Et heldigt gæt slipper også | Ingen ændring: det er v0's regel. B kræver L1 K1 + L5 | Unit (`learning-sequence`), generalprøven (elev A får revision, C gør ikke) | For streng (C): stærke elever keder sig. For mild (A): en gætter slipper for øvelse. Det opdages på papirprøverne |
| **LP13-2** Antal revisioner | Hvor mange gange, og hvad sker der ved fortsat forkert svar? | A: højst én · B: op til to + lærermarkering · C: til rigtigt | **A**, og **aldrig C** | C giver gættesløjfer (25 % pr. forsøg) og »rigtigt til sidst«, som betyder lidt | Svag elev går videre uden at have forstået. Læreren er i lokalet i piloten | Ingen ændring | Unit: anden forkert revision → selvstændig anvendelse | A: eleven går videre for tidligt; det ses i posttesten. C: eleven sidder fast |
| **LP13-3** Hints | Må et svar med hjælp tælle som selvstændig præstation? | A: hints kun i øvelse, tæller aldrig · B: overalt, fratrukket · C: ingen hints | **A** | »The assistance dilemma« (Koedinger & Aleven 2007): hjælp hjælper læringen, men skjuler, hvad eleven kan alene | Svag elev får hjælp, hvor der øves (trin 3 og 5 har hints). Stærk elev mister intet | Spillet viser allerede hints kun i øvelse. Serveren kender dem ikke (K1) | Generalprøven: hints registreres kun i klienten; dataflow-testen | B uden validering: en vilkårlig vægt. C: svage elever opgiver |
| **LP13-4** Forkert i selvstændig anvendelse | Hvad sker der efter et forkert svar i trin 6 (dagbogen)? | A: videre til overførsel · B: tilbage til øvelse + nyt tjek · C: lærermarkering | **A** til piloten | B kræver flere godkendte opgaver pr. trin (i dag én) | Svag elev går videre med en registreret fejl. Stærk elev uændret | Ingen ændring | Unit + generalprøven (elev A: forkert i trin 6 → 1864) | A: et hul skjules for eleven, men ikke for læreren (posttest) |
| **LP13-5** Overførsel | Hvad må kaldes overførsel? | A: ny periode, samme opgaveform · B: + ny opgaveform · C: andet fag | **A**, kaldet »overførsel til en ny periode« | Nær vs. fjern transfer (Barnett & Ceci 2002). Spillets 1864 er nær transfer; papirets T er lidt længere | Ingen forskel | Ingen | Ordlyd i dev-panel og lærerpakke | At kalde nær transfer »overførsel« uden forbehold overvurderer |
| **LP13-6** Genbesøg og forsinket test | To tal: (1) hvor længe efter overførslen kommer spillets genbesøg (et nyt *øve*-tidspunkt), og (2) hvor længe efter posttesten kommer den forsinkede test C (*målingen*)? | Genbesøg: A 20 timer · B 1–3 dage · C 7 dage. Forsinket test: A 7 dage · B 2–4 uger | **Forsinket test: 7 dage. Genbesøg: 1–3 dage** (begge forslag) | Cepeda m.fl. 2008: ved en testforsinkelse på 1 uge var det bedste mellemrum mellem øvesessionerne ca. 20–40 % af forsinkelsen, dvs. ca. 1½–3 dage. Det gælder voksne og faktaviden, så den præcise længde er en heuristik (`learning-progression-source-verification.md` §6). Forsinket test og genbesøg må ikke blandes sammen: et genbesøg er øvelse, ikke en måling af fastholdelse | Fravær rammer svage elever mest; rapportér frafald | `REVISIT_AFTER_HOURS` er i dag 20 (test). En ændring kræver kode og tests i F6-sporet samt et GO. Den forsinkede test er papir og kræver ingen kode | Unit på `nextStep` med reelle datoer; aldrig »+20 timer«; den forsinkede test dateres i `C_dage_efter_post` | For kort testforsinkelse: kortvarig hukommelse kaldes fastholdelse. For langt: frafald. Genbesøg som måling: øvelseseffekt tolkes som fastholdelse |
| **LP13-7** Status | Hvad må et færdigt forløb hedde? | A: »alle trin har et svar« · B: »Gennemført forløb« + lærertabel · C: »Mestret« | **B, og aldrig C** | Én opgave pr. trin kan ikke dokumentere mestring (Soderstrom & Bjork 2015; Pelánek & Řihák 2017) | Stærk elev får ingen falsk ros, svag elev ingen falsk dom | Ingen produktionskode. Dev-panelet siger allerede A | Unit på teksterne (ingen »mestr«); rubrikken har ingen grænse | C: læreren og eleven tror, at noget er lært, som ikke er målt |

**Til GO (samlet):**

1. LP13-1 A, LP13-2 A, LP13-3 A og LP13-4 A som pilotpolitik.
2. LP13-6: forsinket test efter 7 dage; genbesøg i spillet efter 1–3 dage (to separate tal).
3. LP13-7 B.
4. Et nyt politik-id `laerligverse-pilot-policy-v1`, når 1–3 er besluttet.

Intet af dette er et GO til deploy, migration eller rigtige elever.
