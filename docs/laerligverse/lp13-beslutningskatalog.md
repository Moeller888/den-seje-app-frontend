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
