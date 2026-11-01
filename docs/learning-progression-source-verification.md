# Læringsprogression — kildeverifikation (bilag 2)

Bilag til [learning-progression-design.md](learning-progression-design.md) ([D-277](decisions/D-277.md)), revision 2.
Verificerer kilderne bag de vigtigste designvalg mod primærkilderne.

Udført 2026-10-31 ved webresearch.

**Metode.** For hver påstand er den primære kilde søgt (forlagets side, PubMed, OpenAlex/Crossref-metadata, forfatter-PDF eller accepteret manuskript). Hvor fuldteksten blev læst, står der "fuldtekst". Hvor kun abstract kunne nås, står der "abstract". Hvor jeg måtte bruge en sekundær kilde, står det eksplicit.

**Verdikter:** SUPPORTED = tallet/påstanden står i den primære kilde. PARTLY = kernen holder, men dokumentets formulering overdriver, forenkler eller blander kilder. NOT SUPPORTED = den primære kilde siger noget andet. COULD NOT VERIFY = primærkilden kunne ikke nås.

---

## Oversigt: verdikter, der ændrer dokumentet

| # | Påstand i dokumentet | Verdikt | Konsekvens |
|---|---|---|---|
| 4 | Agarwal m.fl. 2021: "ingen studier fra indskolingen blandt 50 eksperimenter" | **NOT SUPPORTED** | Tabel 2: 5 eksperimenter i elementary school, 12 i middle school og 3 i high school. Det gennemgående forbehold i §3 skal omskrives. |
| 3 | Karpicke m.fl. 2016: effekt "hos elever i indskolingen" | **PARTLY** | Det var 4. klasse (gennemsnitsalder 10,0 år), ordlister, kort forsinkelse og ingen feedback. Ikke indskoling i dansk forstand. |
| 1 / 2 | "Recall > recognition" (Rowland) | **PARTLY** | Holder i laboratoriet. I klasserummet fandt Yang m.fl. 2021 ingen forskel (med feedback: genkendelse g = 0,607, genkaldelse g = 0,541). Kravet om "én genkaldelse" skal begrundes med gætteloftet, ikke med større læringseffekt. |
| 2 | Yang m.fl. 2021: klasserum g ≈ 0,50 | SUPPORTED, men **mangler nuance** | I forhold til genlæsning: g = 0,330. I elementary school: g = 0,328 (CI 0,085–0,571). "Test slår genlæsning, g ≈ 0,50" blander de to tal. |
| 7 | Karpicke & Roediger 2007 som begrundelse for "første repetition tidligst næste dag" | **PARTLY** | Spredningen blev målt i mellemliggende forsøg (1-5-9 mod 5-5-5) inden for én session hos studerende (18–22 år). Studiet siger intet om døgn. |
| 6 | Cepeda 2008 som begrundelse for ≥ 20 t og 7/30/90 dage | **PARTLY** | 20–40 % af testforsinkelsen ved 1 uge og 5–10 % ved 1 år er korrekt. Men ved 35 dages forsinkelse var det optimale interval 8–11 dage, ikke 1 dag. ≥ 20 t er kun tæt på det optimale, hvis stoffet skal holde ca. en uge. |
| 8 | ≥ 20 t før det forsinkede tjek | **Egen heuristik** | Ingen kilde angiver 20 eller 24 timer. Søvnforskningen støtter "mindst én nats søvn mellem læring og test" (også hos 9–12-årige), ikke et timetal. |
| 16 | Kelly m.fl. 2015: "3 i træk er sårbar over for gæt" | **NOT SUPPORTED som formuleret** | Kelly fandt, at 3 i træk var tilstrækkeligt for "næste opgave rigtig", og at højere N forudsagde transfer bedre (n = 37). Sårbarheden over for gæt er vores egen kombinatoriske beregning. Kelly har desuden 4 forfattere (+ Heffernan). |
| 16 | (mangler) Pelánek & Řihák 2017 | **Bør tilføjes** | Valget af datakilder og tærskel betyder mere end valget af model. Et eksponentielt glidende gennemsnit (EMA) er et egnet mestringskriterium. Det støtter "gennemsigtig regel nu, kalibrér senere". |
| 19 | Deci m.fl. 1999: kun belønning for deltagelse svækker | **PARTLY** | Også performance-kontingente belønninger svækkede den frie lyst (d = −0,28). Mestringsbonussen er altså ikke neutral, kun mindre skadelig. Materielle belønninger var mere skadelige for børn. Verbal ros hjalp ikke børns frie lyst (d = 0,11, ikke signifikant). |
| 5 | Prætest: "for grundskolebørn er evidensen tynd og blandet" | **PARTLY / bør præciseres** | Der findes fagfællebedømte børnestudier: Carneiro m.fl. 2018 (gavn fra børnehaveklasse til 3. klasse, ingen gavn i førskolealder) og Foo m.fl. 2025 (5–6-årige, delvis gavn). Det negative 2.-/5.-klasses-fund er et upubliceret speciale. |
| 20 | Hanghøj & Brund "2010/2011" | Afklaret: **2010** | Konferenceartikel, s. 115–122, ISBN 978-1-906638-79-5. "Spildidaktik" findes ikke hos Hanghøj i de kilder, jeg fandt. Hans danske titler er "Spilscenarier i undervisningen – præsentation af en didaktisk model" (Læring & Medier nr. 9, 2012). "Spil i undervisningen" er **temanummerets** titel i samme LOM-nummer, ikke en Hanghøj-bog. |
| 22 | Marsh m.fl. 2007 "uden feedback" | PARTLY | Lure-effekten stammer fra Marsh 2007. At feedback reducerer den, stammer fra Butler & Roediger 2008. Begge skal citeres. |

---

## 1. Rowland 2014

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| Samlet g ≈ 0,50 | SUPPORTED | Rowland, C. A. (2014). The effect of testing versus restudy on retention: A meta-analytic review of the testing effect. *Psychological Bulletin*, 140(6), 1432–1463. doi:10.1037/a0037559 (fuldtekst, forfatterens upload) | "the mean weighted effect size from the random-effects model, g = 0.50 (CI [0.42, 0.58])"; 159 effektstørrelser fra 61 studier (1975–2013). Kontrol = genlæsning (restudy). | "almost exclusively used samples of undergraduate college students". Klasserumsstudier blev **eksplicit ekskluderet** (kriterium d). | Uændret, men tilføj: "laboratoriestudier, mest universitetsstuderende". |
| Feedback 0,73 mod 0,39 | SUPPORTED | Samme | "studies providing feedback … (g = 0.73, CI [0.61, 0.86]) than studies not providing feedback (g = 0.39, CI [0.29, 0.49])" | Samme | Uændret. |
| Større ved interval ≥ 1 dag | SUPPORTED | Samme | "retention intervals of at least 1 day … (g = 0.69 …) than those with retention intervals less than 1 day (g = 0.41 …)" | Samme | Uændret. |
| Genkaldelse > genkendelse | SUPPORTED (lab) | Samme | Første test: cued recall g = 0,61, free recall 0,29, recognition 0,29 i det fulde datasæt. I high-exposure-sættet: cued recall 0,72, free recall 0,81, recognition 0,36. Abstract: "initial recall tests yielding larger testing benefits than recognition tests". | Samme | "I laboratoriet giver genkaldelse større testeffekt end genkendelse (Rowland 2014). I klasserum er forskellen ikke fundet (Yang m.fl. 2021)." |
| (Ekstra, relevant for §4.5) "Effekten forudsætter, at en del kan genkaldes" | SUPPORTED | Samme | Uden feedback og med ≤ 50 % rigtige på den første test: "did not produce a reliable testing effect (g = 0.03 …)". Med feedback: g = 0,73 uanset succesrate. | Samme | Brug denne kilde direkte i §4.5: diagnostik uden feedback og med lav succesrate giver ingen testeffekt. Feedback er derfor nødvendig. |

## 2. Yang, Luo, Vadillo, Yu & Shanks 2021

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| Klasserum g = 0,499, 222 studier, 48.478 elever | SUPPORTED | Yang, C., Luo, L., Vadillo, M. A., Yu, R., & Shanks, D. R. (2021). Testing (quizzing) boosts classroom learning: A systematic and meta-analytic review. *Psychological Bulletin*, 147(4), 399–435. doi:10.1037/bul0000309 (fuldtekst) | "integrated 48,478 students' data, extracted from 222 independent studies … (g = 0.499)". PEESE-korrigeret: g = 0,475. | Klasserum fra elementary school til videregående uddannelse | — |
| (implicit i §3) "Test slår genlæsning … g ≈ 0,50" | PARTLY | Samme | 0,499 er mod **alle** kontroller. Mod genlæsning: "Restudying (g = 0.330 [0.256, 0.404])". Mod ingen aktivitet: 0,610. | Samme | "Quizzer i klasserummet: g ≈ 0,50 samlet og g ≈ 0,33 mod genlæsning (Yang m.fl. 2021)." |
| (Ny, vigtig) Børn | — | Samme | "elementary school (g = 0.328 [0.085, 0.571])", middle school 0,597, high school 0,655. Forskellen mellem niveauerne var ikke signifikant (Q(4) = 6,85, p = 0,144). | — | Tilføj: "Effekten er også fundet i elementary school, men mindre og mere usikker (g ≈ 0,33)." |
| (Ny) Genkaldelse mod genkendelse i klasserum | — | Samme | Med feedback: "no significant difference between Recognition (g = 0.607 …) and Recall tests (g = 0.541 …)" | — | Se #1. |
| (Ny, relevant for "to forskellige opgaver") | — | Samme | Omformulerede spørgsmål g = 0,558; ikke-testet stof g = 0,321; 1×/2×/≥3× quiz: 0,444/0,601/0,642. | — | Effekten overføres til omformulerede spørgsmål, men er mindre for nyt stof. Det understøtter at kræve en *anden* opgave som bevis. |

## 3. Karpicke, Blunt & Smith 2016

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| Genkaldelse gavner børn "i indskolingen" | PARTLY | Karpicke, J. D., Blunt, J. R., & Smith, M. A. (2016). Retrieval-based learning: Positive effects of retrieval practice in elementary school children. *Frontiers in Psychology*, 7, 350. doi:10.3389/fpsyg.2016.00350 (fuldtekst, PMC4786565) | "In all experiments, children showed robust retrieval practice effects." d = 0,48 / 0,56 / 0,64. "No feedback was given." | 88 børn i **4. klasse** (gennemsnit 10,0 år, 9,2–12,0), N = 40/40/42. Ordlister med kategorier, sluttest "after a brief delay" (samme session). | "… også fundet hos 4.-klasseelever (ca. 10 år) med ordlister og kort forsinkelse (Karpicke m.fl. 2016)." |

## 4. Agarwal, Nunes & Blunt 2021

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| "ingen studier fra indskolingen blandt 50 eksperimenter" / bilag: "~40 % gymnasie, ~40 % universitet, ~20 % medicin, ingen indskoling" | **NOT SUPPORTED** | Agarwal, P. K., Nunes, L. D., & Blunt, J. R. (2021). Retrieval practice consistently benefits student learning: A systematic review of applied research in schools and classrooms. *Educational Psychology Review*, 33, 1409–1453. doi:10.1007/s10648-021-09595-9. Tallene er læst i forfatternes preprint (PsyArXiv, doi:10.31234/osf.io/xe9kv, fuldtekst). Den publicerede version er bag betalingsmur. Abstractet er identisk. | Tabel 2, "Education level (k = 50)": **Elementary 5, Middle 12, High 3, Undergraduate 20, Medical 10**. Teksten: "20 experiments were conducted in K-12 settings (elementary, middle, and high school)"; "Education levels ranged from elementary school to medical school". | Klasserum. Kun 6 % uden for USA og Vesteuropa. | "Af 50 klasserumseksperimenter var kun 5 fra elementary school og 12 fra middle school (Agarwal m.fl. 2021). Evidensen er tyndest for de yngste." Bemærk: tallene er fra preprintet, så kontrollér dem mod den publicerede Tabel 2, hvis der er adgang. |

## 5. Prætest / mislykkede genkaldelsesforsøg

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| Richland m.fl. 2009: prætest hjælper, også ved forkerte svar | SUPPORTED | Richland, L. E., Kornell, N., & Kao, L. S. (2009). The pretesting effect: Do unsuccessful retrieval attempts enhance learning? *Journal of Experimental Psychology: Applied*, 15(3), 243–257. doi:10.1037/a0016496 (abstract + sekundære resuméer) | Fem eksperimenter med et essay om syn. Effekten fandtes "even though only items that were not successfully retrieved on the pretest were analyzed". | Universitetsstuderende (laboratorium) | Uændret ("voksne"). |
| Kornell, Hays & Bjork 2009 | SUPPORTED | Kornell, N., Hays, M. J., & Bjork, R. A. (2009). Unsuccessful retrieval attempts enhance subsequent learning. *JEP: LMC*, 35(4), 989–998. doi:10.1037/a0015729 (PubMed-abstract) | "Unsuccessful retrieval attempts enhanced learning with both types of materials." Svaret blev vist umiddelbart efter forsøget. | Voksne i laboratoriet (fiktive trivia, svage associationer). Detaljer om stikprøven fremgår ikke af abstractet. | Uændret. |
| Børn: "tynd og blandet; upubliceret studie fandt skade i 2. og 5. klasse" | PARTLY (kan præciseres) | (a) Carneiro, P., Lapa, A., & Finn, B. (2018). The effect of unsuccessful retrieval on children's subsequent learning. *Journal of Experimental Child Psychology*, 166, 400–420. doi:10.1016/j.jecp.2017.09.010 (abstract). (b) Foo, J. H., Yu, L., Pan, S. C., & Ding, X. P. (2025). Pretesting promotes theme extraction but not generalization from moral stories in young children. *Developmental Psychology*, 62(6), 1236–1249. doi:10.1037/dev0002005 (fuldtekst). (c) Pan, S. C., & Carpenter, S. K. (2023). Prequestioning and pretesting effects: A review … *Educational Psychology Review*, 35, 97. doi:10.1007/s10648-023-09814-5 (abstract). (d) Bar-Ilan-speciale (2019) om 2. og 5. klasse, ikke fagfællebedømt (kun set via søgeresultat). | (a) "older children—those in kindergarten and early elementary school—benefited from unsuccessful retrieval". Førskolebørn: ingen forskel. Svag-associationsparadigme med korrigerende feedback. (b) 60 børn på 5–6 år: prætestede børn genererede oftere den rigtige morale, men var ikke bedre til tvungent valg eller generalisering. (c) "can often enhance learning, but the extent … may vary due to differences in procedure". Foo m.fl. opsummerer: "A small body of evidence suggests that the benefits of pretesting can be extended to children … Not all studies … have shown pretesting effects (e.g., McDaniel et al., 2011)". | 5–9 år (a, b); 2. og 5. klasse (d) | "Hos børn er der få fagfællebedømte studier. Mislykkede gæt efterfulgt af det rigtige svar hjalp børn fra børnehaveklasse til 3. klasse på ordpar (Carneiro m.fl. 2018) og 5–6-årige med moralhistorier, men kun for genkaldelse, ikke for generalisering (Foo m.fl. 2025). Et upubliceret speciale fandt negativ effekt for teksttilegnelse i 2. og 5. klasse. Evidens for faglige tekster i klasse 4–9 mangler stort set (ANTAGELSE)." |
| Grimaldi & Karpicke | — | Grimaldi & Karpicke 2012 (*Memory & Cognition*) blev ikke verificeret her. Ifølge min viden er det et voksenstudie og bør ikke bruges som børneevidens. | — | — | — |

## 6. Cepeda m.fl. 2006 og 2008

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| Optimalt interval ≈ 20–40 % ved 1 uge, ≈ 5–10 % ved 1 år | SUPPORTED | Cepeda, N. J., Vul, E., Rohrer, D., Wixted, J. T., & Pashler, H. (2008). Spacing effects in learning: A temporal ridgeline of optimal retention. *Psychological Science*, 19(11), 1095–1102. doi:10.1111/j.1467-9280.2008.02209.x (fuldtekst) | "the optimal gap declined from about 20 to 40% of a 1-week test delay to about 5 to 10% of a 1-year test delay" | 1.354 voksne i et internetpanel. Fakta (trivia), med feedback i 2. session. | Uændret. |
| For langt interval koster mindre end for kort | SUPPORTED | Samme | "costs [of a too-long gap] are much smaller than the costs of using too short a gap" | Samme | Uændret. |
| Er ca. 1 dag tæt på optimalt for 1 uge–1 måned? | PARTLY | Samme | For testforsinkelserne 7/35/70/350 dage var de bedste testede intervaller 1/11/21/21 dage (genkaldelse). Interpoleret: ca. 3/8/12/27 dage. | Samme | "Ca. 1 dag er tæt på det optimale, hvis stoffet skal huskes ca. en uge, men for kort, hvis det skal huskes en måned eller mere (optimum ca. 8–11 dage). Det støtter, at intervallerne derefter vokser." Bemærk: Cepeda måler interval mellem to *læringssessioner*, ikke mellem øvelse og et kontroltjek. |
| Cepeda 2006 (metaanalyse) | SUPPORTED | Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. *Psychological Bulletin*, 132(3), 354–380. doi:10.1037/0033-2909.132.3.354 (abstract via søgeresultat) | 839 vurderinger, 317 eksperimenter, 184 artikler. "the ISI producing maximal retention increased as retention interval increased" | Mest voksne | — |

## 7. Karpicke & Roediger 2007

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| Ekspanderende spredning er bedre ved kort forsinkelse, lige spredning efter 2 dage, og det afgørende er at udsætte den første genkaldelse | SUPPORTED (selve påstanden) | Karpicke, J. D., & Roediger, H. L., III (2007). Expanding retrieval practice promotes short-term retention, but equally spaced retrieval enhances long-term retention. *JEP: LMC*, 33(4), 704–719. doi:10.1037/0278-7393.33.4.704 (fuldtekst) | "equally spaced retrieval produced superior retention 2 days later"; "The important factor … is delaying initial retrieval to make it more difficult". | 48 + 48 studerende på 18–22 år, GRE-ordpar. **Spredningen blev målt i antal mellemliggende forsøg** (massed 0-0-0, ekspanderende 1-5-9, lige 5-5-5) inden for én session. | Behold påstanden, men brug den **ikke** som støtte for "tidligst næste dag" eller "≥ 20 t". Studiet viser kun, at den første genkaldelse ikke skal komme med det samme. |

## 8. Søvn og konsolidering, og en tærskel på ca. 20–24 timer

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| Søvn efter indlæring styrker deklarativ hukommelse | SUPPORTED | Gais, S., Lucas, B., & Born, J. (2006). Sleep after learning aids memory recall. *Learning & Memory*, 13(3), 259–262. doi:10.1101/lm.132106 (PubMed-abstract) | "declarative memory is enhanced when sleep follows within a few hours of learning, independent of time of day". Retentionsintervaller på 24 t og 36/48 t. | Gymnasieelever, ordforråd | — |
| Gælder også børn, og også når søvnen kommer senere | SUPPORTED | Backhaus, J., Hoeckesfeld, R., Born, J., Hohagen, F., & Junghanns, K. (2008). Immediate as well as delayed post learning sleep but not wakefulness enhances declarative memory consolidation in children. *Neurobiology of Learning and Memory*, 89(1), 76–80. doi:10.1016/j.nlm.2007.08.010 (abstract via universitetsportal) | Fastholdelsen steg kun efter et søvninterval, uanset om søvnen kom straks efter indlæringen eller efter en dag i vågen tilstand. | 27 børn på 9–12 år | — |
| Børn | SUPPORTED (tilgrænsende) | Wilhelm, I., Rose, M., Imhof, K. I., Rasch, B., Büchel, C., & Born, J. (2013). The sleeping child outplays the adult's capacity to convert implicit into explicit knowledge. *Nature Neuroscience*, 16(4), 391–393. doi:10.1038/nn.3343. Desuden: Wilhelm, Prehn-Kristensen & Born (2012), *Neuroscience & Biobehavioral Reviews*, 36(7), 1718–1728. | Motorisk sekvens: efter søvn fik børn mere eksplicit viden end voksne. Reviewet: "longer and deeper SWS during childhood appears to produce a distinctly superior strengthening of hippocampus-dependent declarative memories". | Børn mod voksne | — |
| Oversigt | SUPPORTED (bibliografisk) | Diekelmann, S., & Born, J. (2010). The memory function of sleep. *Nature Reviews Neuroscience*, 11(2), 114–126. doi:10.1038/nrn2762 | Teorien om aktiv systemkonsolidering (gengivet sekundært) | Review | — |
| **En bestemt tærskel på ca. 20–24 t** | **Ingen kilde fundet** | — | Ingen af kilderne angiver et minimumstal i timer. De støtter "mindst én nats søvn mellem læring og test". | — | "≥ 20 t er vores heuristik: den sikrer én nats søvn og passer til et skoleskema (næste dags lektion). Den er ikke et forskningsfund." |
| Præstation under øvelse er en dårlig indikator for læring | SUPPORTED | Soderstrom, N. C., & Bjork, R. A. (2015). Learning versus performance: An integrative review. *Perspectives on Psychological Science*, 10(2), 176–199. doi:10.1177/1745691615569000 (PubMed-abstract) | "performance, which is often an unreliable index of whether the relatively permanent changes that support retention and transfer have occurred"; "people often mistakenly interpret their performance during acquisition as a reliable guide to long-term learning" | Review (motorisk og verbal læring) | Brug den som den primære begrundelse for at kræve et *forsinket* tjek. |

## 9. Vlach & Sandhofer 2012

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| Spredning gavner 5–7-åriges generalisering af naturfagsbegreber | SUPPORTED | Vlach, H. A., & Sandhofer, C. M. (2012). Distributing learning over time: The spacing effect in children's acquisition and generalization of science concepts. *Child Development*, 83(4), 1137–1144. doi:10.1111/j.1467-8624.2012.01781.x (abstract + fuldtekst PMC3399982) | "early elementary school children (5- to 7-year-olds; N = 36) … spacing lessons out in time resulted in higher generalization performance for both simple and complex concepts". Spredt = én lektion om dagen i 4 dage. Test "exactly one week after the last lesson". | 36 børn på 5–7 år, fødekæder | Tilføj "N = 36; 1 lektion/dag; test efter 1 uge". |

## 10. Interleaving

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| Brunmair & Richter: g = 0,42, negativ for ord | SUPPORTED | Brunmair, M., & Richter, T. (2019). Similarity matters: A meta-analysis of interleaved learning and its moderators. *Psychological Bulletin*, 145(11), 1029–1052. doi:10.1037/bul0000209 (PubMed-abstract) | "moderate overall interleaving effect (Hedges' g = 0.42)"; 59 studier, 238 effektstørrelser; malerier g = 0,67; matematik g = 0,34; "An advantage of blocking compared with interleaving was found for studies based on words (g = −0.39)" | Mest voksne | Bilagets "sekundær, uden fuld kontekst" kan opgraderes til primær. Tilføj "matematik g = 0,34". |
| Rohrer m.fl.: 7. klasse, d = 0,83 (61 % mod 38 %) | SUPPORTED | Rohrer, D., Dedrick, R. F., Hartwig, M. K., & Cheung, C.-N. (2020). A randomized controlled trial of interleaved mathematics practice. *Journal of Educational Psychology*, 112(1), 40–52. doi:10.1037/edu0000367 (online 2019) | IES/WWC: 61 % mod 38 % (37,6), d = 0,83, 95 % CI [0,68, 0,97]. Uanmeldt test mindst 1 måned senere. | 54 klasser, 787 elever i 7. klasse, Florida, ét distrikt. Interleavede opgaver tog længere tid. | Uændret. Tilføj "én skolekreds, test efter ≥ 1 måned". |

## 11. Expertise reversal og fading

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| Vejledning kan skade dem, der kan stoffet | SUPPORTED (bibliografisk; abstract ikke læst ordret) | Kalyuga, S., Ayres, P., Chandler, P., & Sweller, J. (2003). The expertise reversal effect. *Educational Psychologist*, 38(1), 23–31. doi:10.1207/S15326985EP3801_4. Desuden: Kalyuga, S. (2007), *Educational Psychology Review*, 19, 509–539, doi:10.1007/s10648-007-9054-3 (kun bibliografisk). | Review af interaktionen mellem instruktionsteknik og elevernes erfaringsniveau | Review | Uændret. |
| Gradvis nedtrapning (fading) virker | SUPPORTED (sekundært for effekten) | Renkl, A., & Atkinson, R. K. (2003). Structuring the transition from example study to problem solving in cognitive skill acquisition: A cognitive load perspective. *Educational Psychologist*, 38(1), 15–22. doi:10.1207/S15326985EP3801_3 | Ifølge sekundære kilder fremmer fading pålideligt nær transfer, mens far transfer er mindre sikker. | Mest studerende og ældre elever | "Fading fremmer især nær transfer." |

## 12. van der Kleij, Feskens & Eggen 2015

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| Forklarende feedback 0,49, korrekt svar 0,32, rigtigt/forkert 0,05 | SUPPORTED | van der Kleij, F. M., Feskens, R. C. W., & Eggen, T. J. H. M. (2015). Effects of feedback in a computer-based learning environment on students' learning outcomes: A meta-analysis. *Review of Educational Research*, 85(4), 475–511. doi:10.3102/0034654314564881 (abstract via OpenAlex) | "elaborated feedback (EF …) produced larger effect sizes (0.49) than … (KR; 0.05) or … (KCR; 0.32)"; 40 studier, 70 effektstørrelser; "Effect sizes were negatively affected by delayed feedback timing and by primary and high school." | Computerbaseret. Mindre effekter i grundskole og gymnasium. | Tilføj: "Effekterne var mindre i grundskolen." |

## 13. Kluger & DeNisi 1996

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| d = 0,41; over en tredjedel negative | SUPPORTED | Kluger, A. N., & DeNisi, A. (1996). The effects of feedback interventions on performance: A historical review, a meta-analysis, and a preliminary feedback intervention theory. *Psychological Bulletin*, 119(2), 254–284. doi:10.1037/0033-2909.119.2.254 (abstract) | "607 effect sizes; 23,663 observations … improved performance on average (d = .41) but … over 1/3 of the FIs decreased performance" | Bredt (arbejde, laboratorium, uddannelse) | — |
| "især når feedbacken handler om personen" | PARTLY | Samme | Fra abstractet: "FI effectiveness decreases as attention moves up the hierarchy closer to the self and away from the task". Det er teorien (FIT), understøttet af moderatoranalyser. | — | "… ifølge forfatternes teori især, når feedbacken flytter opmærksomheden fra opgaven til personen." |

## 14. Wisniewski, Zierer & Hattie 2020

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| d = 0,48, 435 studier | SUPPORTED | Wisniewski, B., Zierer, K., & Hattie, J. (2020). The power of feedback revisited: A meta-analysis of educational feedback research. *Frontiers in Psychology*, 10, 3087. doi:10.3389/fpsyg.2019.03087 (fuldtekst) | "435 studies, k = 994, N > 61,000 … medium effect (d = 0.48)"; forstærkning/straf d = 0,24, korrigerende 0,46, informationsrig feedback 0,99; "17% of the effects were negative" | Uddannelse | Kan tilføjes som støtte til forklarende feedback. |

## 15. Hints og hjælpsøgning

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| God hjælpsøgning hænger sammen med bedre læring | SUPPORTED | Aleven, V., Stahl, E., Schworm, S., Fischer, F., & Wallace, R. (2003). Help seeking and help design in interactive learning environments. *Review of Educational Research*, 73(3), 277–320. doi:10.3102/00346543073003277 (abstract via OpenAlex) | "although effective help-seeking behavior in ILEs is related to better learning outcomes, learners are not using help facilities effectively" | Selektivt review | Tilføj: "… men eleverne bruger ofte hjælpen ineffektivt." |
| At klikke sig igennem hints hænger sammen med mindre læring | SUPPORTED | Baker, R. S., Corbett, A. T., Koedinger, K. R., & Wagner, A. Z. (2004). Off-task behavior in the cognitive tutor classroom: When students "game the system". *Proceedings of CHI 2004*, 383–390. doi:10.1145/985692.985741 (abstract) | "students who frequently game the system score substantially lower on a post-test than students who never game"; ingen anden off-task-adfærd var "nearly as strongly" forbundet med mindre læring | Elever i middle school i Cognitive Tutor-klasser (korrelationelt) | Tilføj "korrelationelt". |
| Assistance dilemma | SUPPORTED (bibliografisk; abstract ikke hentet) | Koedinger, K. R., & Aleven, V. (2007). Exploring the assistance dilemma in experiments with cognitive tutors. *Educational Psychology Review*, 19(3), 239–264. doi:10.1007/s10648-007-9049-0 | Sekundært: at balancere mellem at give og at tilbageholde hjælp | — | Uændret. |
| "Svar med hint tæller ikke som mestringsevidens" | Praksis-konvention, ikke et eksperimentelt fund | Chaudhry, R., Singh, H., Dogga, P., & Saini, S. K. (2018). Modeling hint-taking behavior and knowledge state of students with multi-task learning. *EDM 2018* (fuldtekst) | "Traditional knowledge tracing models either tag a hint taken as an incorrect response or remove the data point where hints were taken." Deres baselines på ASSISTments-data: "transactions where hints are taken are labelled as incorrect responses. This is the same approach followed in the baseline publications." | Datasæt fra ASSISTments 2009–10 og Junyi | "I knowledge tracing er det almindelig praksis at behandle et svar med hint som forkert eller udelade det (fx Chaudhry m.fl. 2018). Vores regel følger den konvention. Den er ikke testet som læringsintervention." Corbett & Andersons egen behandling af hjælpeanmodninger blev **ikke** verificeret (fuldteksten var ikke tilgængelig). |

## 16. Mestringskriterier

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| BKT har eksplicitte parametre for gæt og fejl | SUPPORTED (metadata; abstract ikke hentet) | Corbett, A. T., & Anderson, J. R. (1995). Knowledge tracing: Modeling the acquisition of procedural knowledge. *User Modeling and User-Adapted Interaction*, 4(4), 253–278. doi:10.1007/BF01099821 (Crossref: 1995; udgaven dateres ofte 1994) | Guess- og slip-parametrene er modellens standardparametre (velkendt; ikke citeret ordret her). Pelánek (u.å., "Conceptual issues in mastery criteria", forfatter-PDF): BKT sammenlignes "commonly" med tærsklen 0,95. | Studerende, LISP-programmering (ACT Programming Tutor) | Uændret. |
| "Reglen '3 i træk' er sårbar over for gæt (Kelly m.fl. 2015)" | **NOT SUPPORTED som formuleret** | Kelly, K., Wang, Y., Thompson, T., & Heffernan, N. (2015). Defining mastery: Knowledge tracing versus N-consecutive correct responses. *Proceedings of the 8th International Conference on Educational Data Mining* (poster), s. 630–631 (fuldtekst) | "a threshold of 3 consecutive correct responses provides adequate practice, especially for students who reach the threshold without making an error"; "higher thresholds of N-CCR lead to more accurate predictions of performance on a transfer question than lower thresholds of N-CCR or KT". Med 3 i træk løste 80 % også opgave 4 og 5; transferstudiet havde 37 elever. | ASSISTments, matematik | "Kelly m.fl. (2015, poster, lille stikprøve) fandt, at 3 i træk forudsagde den næste opgave godt, men at 5 i træk forudsagde transfer bedre. At 3 i træk er sårbar over for gæt på MC, er vores egen beregning (§4.6)." |
| Pelánek & Řihák 2017 (ikke i dokumentet) | — | Pelánek, R., & Řihák, J. (2017). Experimental analysis of mastery learning criteria. *Proceedings of UMAP '17*, 156–163. ACM. doi:10.1145/3079628.3079667. Prisvindende (Best Paper). Journalversion: *New Review of Hypermedia and Multimedia*, 24(3), 2018, doi:10.1080/13614568.2018.1476596. | Abstract: "the choice of data sources used for mastery decision and setting of thresholds are more important than the choice of a learner modeling technique. We argue that a simple exponential moving average method is a suitable technique for mastery criterion and propose techniques for the choice of a mastery threshold." | Simulerede og rigtige data, én videnskomponent | Tilføj i §3/§4.6: "Hvilke svar der tæller (forsinket, uassisteret, varieret), og hvor tærsklen ligger, betyder mere end modelvalget (Pelánek & Řihák 2017). Det støtter en gennemsigtig regelmodel." |
| (Supplement) | — | Pelánek, R. (u.å.). Conceptual issues in mastery criteria: Differentiating uncertainty and degrees of knowledge. Forfatter-PDF (fi.muni.cz); år og venue ikke verificeret | "If we use the common 0.95 threshold … BKT model leads to premature declaration of mastery"; simple statistikker "may be in some cases sufficient". | Simulering | Valgfri reference. |

## 17. Settles & Meeder 2016

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| Half-life regression forudsiger glemsel | SUPPORTED | Settles, B., & Meeder, B. (2016). A trainable spaced repetition model for language learning. *Proceedings of ACL 2016 (Vol. 1)*, 1848–1858. doi:10.18653/v1/P16-1174 (fuldtekst) | "reducing error by 45%+ compared to several baselines at predicting student recall rates"; "improve Duolingo daily student engagement by 12%" | Duolingo-brugere (alder ikke opgjort) | "… forudsiger sandsynligheden for genkaldelse (Duolingo-data)". Bemærk: modellen kræver store mængder logdata. |

## 18. Misopfattelser

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| Danielson m.fl. 2025: 76 studier, 294 effektstørrelser | SUPPORTED | Danielson, R. W., Jacobson, N. G., Patall, E. A., Sinatra, G. M., Adesope, O. O., Kennedy, A. A. U., m.fl. (2025). The effectiveness of refutation text in confronting scientific misconceptions: A meta-analysis. *Educational Psychologist*, 60(1), 23–47. doi:10.1080/00461520.2024.2365628 (abstract) | "71 articles … 76 studies, 111 samples, and 294 effect sizes"; "consistent and statistically significant advantage of refutation texts"; "moderators neither enhanced nor diminished the impact" (26 moderatorer) | Naturfaglige misopfattelser | Den samlede g-værdi fremgår ikke af abstractet og blev ikke verificeret. |
| "mest naturfag og ældre elever" | PARTLY / COULD NOT VERIFY (alder) | Samme | Naturfag ligger i selve inklusionskriteriet. Om alder: abstractet siger, at ingen af de 26 moderatorer ændrede effekten. Aldersfordelingen kunne ikke verificeres. | — | "Studierne handler om naturfaglige misopfattelser. Aldersfordelingen er ikke verificeret." |
| Tippett 2010, tidsskrift | SUPPORTED | Tippett, C. D. (2010). Refutation text in science education: A review of two decades of research. *International Journal of Science and Mathematics Education*, 8(6), 951–970. doi:10.1007/s10763-010-9203-x (Crossref + OpenAlex) | — | — | Opgradér status i bilaget fra K til V. |

## 19. Gamification og belønning

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| Sailer & Homner: g 0,49 / 0,36 / 0,25 | SUPPORTED | Sailer, M., & Homner, L. (2020). The gamification of learning: A meta-analysis. *Educational Psychology Review*, 32(1), 77–112. doi:10.1007/s10648-019-09498-w | Kognitiv g = 0,49 (k = 19), motivationel 0,36 (k = 16), adfærdsmæssig 0,25 (k = 9). Kun den kognitive effekt var stabil i studier med høj stringens. | Blandet | Tilføj: "kun den kognitive effekt var robust". |
| Deci, Koestner & Ryan 1999 | PARTLY | Deci, E. L., Koestner, R., & Ryan, R. M. (1999). A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation. *Psychological Bulletin*, 125(6), 627–668. doi:10.1037/0033-2909.125.6.627 (fuldtekst) | "engagement-contingent, completion-contingent, and performance-contingent rewards significantly undermined free-choice intrinsic motivation (d = −0.40, −0.36, and −0.28)"; "Tangible rewards tended to be more detrimental for children than college students, and verbal rewards tended to be less enhancing for children"; børn, engagement-kontingent: d = −0,43; verbal ros hos børn: d = 0,11 (ikke signifikant). Performance-kontingente belønninger påvirkede ikke den selvrapporterede interesse. Uventede belønninger og belønninger uafhængige af opgaven: ingen svækkelse. Gælder for opgaver, der i forvejen er interessante. | 128 laboratorieeksperimenter, mange med børn i førskole og indskoling | "Forventede, materielle belønninger svækker den indre motivation for interessante opgaver, mest når de gives for blot at deltage (d = −0,40), men også når de afhænger af præstation (d = −0,28). Effekten var større hos børn (Deci m.fl. 1999; omstridt af Cameron m.fl.)." |

## 20. Hanghøj

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Korrigeret formulering |
|---|---|---|---|---|
| Hanghøj 2013 (IGI Global) | SUPPORTED | Hanghøj, T. (2013). Game-based teaching: Practices, roles, and pedagogies. I S. de Freitas, M. Ott, M. M. Popescu & I. Stanescu (red.), *New Pedagogical Approaches in Game Enhanced Learning: Curriculum Integration* (s. 81–101). IGI Global. doi:10.4018/978-1-4666-3950-8.ch005 (Crossref bekræfter sidetal 81–101; redaktørerne ikke verificeret) | "teachers must be able to shift back and forth between various interactional roles in order to facilitate game scenarios" (sekundært citat af abstractet) | Sidetal er nu verificeret. |
| Hanghøj & Brund | SUPPORTED: **2010** | Hanghøj, T., & Brund, C. E. (2010). Teacher roles and positionings in relation to educational games. I *Proceedings of the 4th European Conference on Games Based Learning (ECGBL 2010)*, s. 115–122. Academic Publishing / Academic Conferences. ISBN 978-1-906638-79-5 (AAU VBN-post) | VBN: år 2010, s. 115–122, artikel i proceedings. At det er ECGBL, er udledt af ISBN-præfikset og ikke verificeret direkte. | Ret "2010/2011" til "2010". |
| Hanghøj, Lieberoth & Misfeldt 2018 | SUPPORTED | *British Journal of Educational Technology*, 49(4), 775–799. doi:10.1111/bjet.12642 | Torchlight II plus analog gamification; 32 udsatte elever (af 190 elever i 8 klasser på 4 danske skoler); "positive impact on at-risk students' well-being and reduced experiences of external regulation" | Tilføj "32 udsatte elever; lærervurdering + C-PLOC". |
| "Spildidaktik" hos Hanghøj | NOT SUPPORTED (ikke fundet) | Søgning på "spildidaktik Hanghøj" gav ingen Hanghøj-tekst med begrebet. Begrebet bruges af Andersen, Lauta & Löbl, "Spildidaktik i fremmedsprogsundervisning: En designbaseret tilgang", *Sprogforum* 78 (2024). | — | Brug ikke "spildidaktik" som Hanghøj-begreb. Hanghøj bruger "spilscenarier" og "scenariedidaktik". |
| Hanghøjs danske titler | Fundet | (1) Hanghøj, T. (2012). "Spilscenarier i undervisningen – præsentation af en didaktisk model". *Læring & Medier (LOM)*, nr. 9. Temanummeret hedder "Spil i undervisningen", hvilket formentlig forklarer den ikke-eksisterende bogtitel. (2) Hanghøj, T., Kabel, K., & Jensen, S. H. (2024). "Brug af digitale spil i dansk og engelsk: Resultater fra et systematisk review med implikationer for praksis". *Sprogforum* 78. (3) Hanghøj, T., Kjellow, T. N., Melgaard, S., Møller, L. D., Henningsen, B., & Jensen, E. O. (red.) (2021). *Sæt skolen i spil: Brug af computerspil og gamification i undervisningen*. Aalborg Universitetsforlag. (4) *Faglig gamification – differentiering, progression og feedback* (2021, Aalborg Universitetsforlag, Hanghøj som medredaktør; ISBN 978-87-7210-744-8). (5) Kapitlet "Scenariedidaktik i dansk – et overblik" i *Håndbog i scenariedidaktik* (2022; forlag ikke verificeret). | Erstat "Spil i undervisningen" med (1). (4) er direkte relevant for progression og feedback. |

## 21. Mestringslæring

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| Kulik m.fl. 1990: positive effekter | SUPPORTED | Kulik, C.-L. C., Kulik, J. A., & Bangert-Drowns, R. L. (1990). Effectiveness of mastery learning programs: A meta-analysis. *Review of Educational Research*, 60(2), 265–299. doi:10.3102/00346543060002265 (abstract via OpenAlex) | "108 controlled evaluations showed that mastery learning programs have positive effects on the examination performance of students in colleges, high schools, and the upper grades in elementary schools. The effects appear to be stronger on the weaker students"; "may increase student time on instructional tasks" | Videregående uddannelse, gymnasium og øvre grundskoleklasser | Gennemsnittet 0,52 SD står kun i sekundære kilder (COULD NOT VERIFY i 1990-artiklen; Slavin 1987 tilskriver 0,52 til Kulik m.fl. 1986). Skriv uden tal, eller "ca. 0,5 SD (sekundært)". |
| Slavin 1987: Bloom formentlig overvurderet | SUPPORTED | Slavin, R. E. (1987). Mastery learning reconsidered. *Review of Educational Research*, 57(2), 175–213. doi:10.2307/1170235 (JSTOR-DOI via Crossref; fuldtekst) | "essentially no evidence to support the effectiveness of group-based mastery learning on standardized achievement measures"; median ES på standardiserede test = +0,04; på eksperimentatorudviklede test "generally positive but moderate"; "little evidence that effects maintained over time" | Grundskole og ungdomsuddannelse, gruppebaseret, ≥ 4 uger | "… især: ingen effekt på standardiserede test og ingen dokumenteret fastholdelse." Det støtter, at mestring skal kræve forsinket evidens. |

## 22. Multiple choice og lures

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| Marsh m.fl. 2007: MC kan lære forkerte svarmuligheder | SUPPORTED | Marsh, E. J., Roediger, H. L., III, Bjork, R. A., & Bjork, E. L. (2007). The memorial consequences of multiple-choice testing. *Psychonomic Bulletin & Review*, 14(2), 194–199. doi:10.3758/BF03194051 (abstract) | "taking a multiple-choice test boosts performance on later tests"; "Even though students may learn false facts from multiple-choice tests, the positive effects of testing outweigh this cost." | Studerende | — |
| "… uden feedback" / feedback reducerer | PARTLY: forkert kilde | Butler, A. C., & Roediger, H. L., III (2008). Feedback enhances the positive effects and reduces the negative effects of multiple-choice testing. *Memory & Cognition*, 36(3), 604–616. doi:10.3758/MC.36.3.604 (PubMed-abstract) | Feedback (straks eller forsinket) "reduced the proportion of intrusions" af lures på en forsinket cued-recall-test | Studerende | "MC kan indlære forkerte svarmuligheder (Marsh m.fl. 2007). Feedback reducerer det (Butler & Roediger 2008)." |

## 23. Bundsgaard & Kreiner 2019

| Påstand | Verdikt | Primær kilde + DOI | Præcis evidens | Population | Korrigeret formulering |
|---|---|---|---|---|---|
| De nationale test har stor måleusikkerhed på elevniveau | SUPPORTED (men omstridt) | Bundsgaard, J., & Kreiner, S. (2019). *Undersøgelse af De Nationale Tests måleegenskaber* (2. udg.). Aarhus Universitetsforlag / DPU. doi:10.7146/aul.319.217 (fuldtekst) | "ministeriets beslutning om at slække på kravene til målingernes sikkerhed fører til testresultater der er så usikre at de er uanvendelige på elevniveau". SEM-kravet var 0,30, men algoritmen stoppede ved 0,55. | Dansk læsning, 8. klasse, 2017, 48.481 elever | "… for læsning i 8. klasse (2017). Konklusionerne er mødt med faglig kritik (UVM-notat 2019, Mortensen)." |

---

## Hvilke designparametre er forskningsbaserede, og hvilke er vores heuristikker?

| Parameter (afsnit) | Hvad forskningen faktisk siger | Status |
|---|---|---|
| **≥ 20 t før det forsinkede tjek** (§4.3, §4.6, §4.7) | (1) Præstation i samme session er en upålidelig indikator for læring (Soderstrom & Bjork 2015). (2) Testeffekten er større ved retentionsintervaller ≥ 1 dag (Rowland 2014). (3) Søvn efter indlæring styrker deklarativ hukommelse, også hos 9–12-årige og når søvnen kommer senere (Gais 2006; Backhaus 2008). (4) Ca. 1 dag er tæt på det optimale interval, hvis stoffet skal huskes ca. en uge (Cepeda 2008). Ingen kilde nævner 20 eller 24 timer. Karpicke & Roediger 2007 handler om forsinkelse inden for én session. | **HEURISTIK med forskningsbaseret retning.** "Forsinket tjek, helst efter en nats søvn" er FUND. Tallet 20 er et valg, der passer til skoleskemaet. |
| **To forskellige opgaver** (§4.5, §4.6) | Testeffekten overføres til omformulerede spørgsmål (Yang: g = 0,558), og effekten var mindre med omformulerede end med identiske spørgsmål (Agarwal). En gentaget identisk opgave overvurderer derfor læringen. Gætteloftet er kombinatorik. Antallet "2" har ingen kilde. | Princippet "varieret evidens" er **forskningsunderbygget**. Antallet 2 er en **HEURISTIK**. |
| **Mindst én genkaldelse** (§4.5, §4.6) | Lab: genkaldelse > genkendelse (Rowland 2014). Klasserum: ingen forskel (Yang 2021). Hovedargumentet er måleteknisk: gætteloft ≈ 0 for genkaldelse mod 25–50 % for MC og sandt/falsk (kombinatorik, FUND). | Begrundes som **måling (FUND: kombinatorik)**, ikke som "giver mere læring". |
| **Hints tæller ikke som mestring** (§4.2, §5.4) | Almindelig praksis i knowledge tracing: hint = forkert eller udeladt (Chaudhry m.fl. 2018). Gaming hænger sammen med mindre læring (Baker 2004). Hjælpsøgning bør være billig (Aleven 2003). Der er intet RCT af selve reglen. | **Konvention + heuristik.** At hints er gratis i øvelsen, er underbygget (Aleven). |
| **Stop efter 2 forkerte i diagnostikken** (§4.5) | Ingen kilde. Relaterede fund: uden feedback og med ≤ 50 % succes giver første test ingen effekt (Rowland). Prætest kræver, at svaret følger (Kornell, Richland). Børn i førskolealder fik ingen gavn (Carneiro). Upubliceret skadefund i 2. og 5. klasse. | **HEURISTIK** (motivation og tid). Feedback efter hvert diagnostisk svar er **forskningsbaseret**. |
| **Kun 1 opgave pr. mål i 1.–3. klasse, kun hvis læreren slår det til** (§4.5) | Carneiro 2018: gavn fra børnehaveklasse til 3. klasse ved ordpar. Foo 2025: delvis gavn hos 5–6-årige. Ingen studier af faglig diagnostik i indskolingen. | **ANTAGELSE (forsigtighed)**. Formuleringen "uafklaret" er dækkende. |
| **7 → 30 → 90 dage** (§4.7) | Cepeda 2008: det optimale interval vokser med retentionsintervallet (ca. 8–11 dage for 35 dage; ca. 21–27 dage for 1 år), og for lange intervaller koster mindre end for korte. Ekspanderende frem for ligelige intervaller er ikke afgjort (Karpicke & Roediger 2007, inden for én session). Half-life regression kan senere kalibrere ud fra data. | **HEURISTIK, konsistent med ridgeline-fundet**, hvis målet er at huske ca. et skoleår. Tallene er ikke testet. |
| **Halveret interval efter fejl** (§4.7) | Ingen kilde fundet. | **HEURISTIK.** |
| **Mestringsbonus frem for deltagelsesbelønning** (§7.1) | Deci m.fl. 1999: engagement-kontingent d = −0,40 (børn −0,43), performance-kontingent d = −0,28 (fri lyst), ingen effekt på selvrapporteret interesse. Verbal ros hjalp ikke børns frie lyst. Uventede belønninger påvirkede ikke. Gamification har små effekter, kun den kognitive er robust (Sailer & Homner). | **Delvist forskningsbaseret**: at belønne mestring frem for deltagelse/volumen er *mindre* skadeligt, men ikke neutralt. **Uforudsigelige** og sjældne belønninger og opgaverettet feedback er bedre underbygget end store forventede bonusser. |
| **Ingen belønning for svartid** (§7.1 R7) | Ingen direkte kilde. Konsistent med Baker 2004 (gaming) og ønsket om at belønne læringsadfærd. | **Designprincip / heuristik.** |
| **"Mestring kræver forsinket og varieret evidens"** (§3) | Slavin 1987: ingen dokumenteret fastholdelse af mestringseffekter. Pelánek & Řihák 2017: datakilder og tærskel betyder mere end modellen. Soderstrom & Bjork 2015. | **Forskningsunderbygget princip.** De konkrete tal er heuristikker. |

## Kilder, der ikke kunne verificeres i primær form

- Kulik m.fl. 1990: gennemsnit 0,52 SD (kun sekundært).
- Danielson m.fl. 2025: den samlede g og aldersfordelingen (kun abstract).
- Corbett & Anderson 1995: ordret abstract og hvordan hjælpeanmodninger behandles (betalingsmur).
- Koedinger & Aleven 2007: abstract (betalingsmur).
- Redaktørerne af Hanghøj 2013. At Hanghøj & Brund er udkommet i ECGBL-proceedings.
- Bar-Ilan-specialet: forfatter og titel er ikke verificeret. Kendt kun via søgeresultat; ikke fagfællebedømt.
- Agarwal m.fl. 2021: niveaufordelingen er læst i preprintet (PsyArXiv 2019/2020), ikke i den publicerede Tabel 2.
