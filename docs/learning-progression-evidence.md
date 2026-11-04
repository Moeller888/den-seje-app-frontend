# Læringsprogression — evidensnotat (bilag)

**Bilag til** [learning-progression-design.md](learning-progression-design.md) ([D-277](decisions/D-277.md)).
Notatet er udarbejdet 2026-10-31 ved webresearch og ændrer ingen kode. Designdokumentet bruger
afsnit (c) som grundlag for sine FORSLAG. Afsnit (a) og (b) er forskningens egne fund og grænser.

## Errata og supplement (revision 2, 2026-10-31)

Kilderne bag de vigtigste designvalg er kontrolleret mod primærkilderne i
[learning-progression-source-verification.md](learning-progression-source-verification.md). **Hvor dette
bilag og verifikationen afviger, gælder verifikationen.** De vigtigste rettelser:

| Påstand | Rettelse |
|---|---|
| Agarwal m.fl. 2021: "ingen studier fra indskolingen" | **Forkert.** 5 elementary og 12 middle school ud af 50 (rettet i teksten). |
| Karpicke m.fl. 2016: "indskolingen" | 4. klasse, ca. 10 år, ordlister og kort forsinkelse (rettet i teksten). |
| Genkaldelse slår genkendelse | Gælder kun i laboratoriet (Rowland 2014). I klasserum med feedback var der ingen forskel (Yang m.fl. 2021: 0,61 mod 0,54). |
| Yang m.fl. 2021: g ≈ 0,50 | Mod alle kontroller. Mod genlæsning er g = 0,33. I elementary school er g = 0,33 (CI 0,09–0,57). |
| Karpicke & Roediger 2007 og "første repetition næste dag" | Spredningen blev målt i forsøg inden for én session. Studiet støtter ikke en grænse i døgn eller timer. |
| ≥ 20 t | Ingen kilde. Søvnforskningen støtter "mindst én nats søvn" (Gais m.fl. 2006; Backhaus m.fl. 2008, 9–12-årige). Tallet er en heuristik. |
| Kelly m.fl. 2015 | Fire forfattere (med Heffernan). Fandt, at 3 i træk forudsagde næste opgave, og at højere N forudsagde transfer bedre. At "3 i træk er sårbart over for gæt", er vores egen beregning. |
| Deci m.fl. 1999 | Også belønninger, der afhænger af præstation, svækkede den frie lyst (d = −0,28). Materielle belønninger var mere skadelige for børn. |
| Prætest hos børn | Der findes fagfællebedømte studier: Carneiro, Lapa & Finn 2018 (gavn fra børnehaveklasse til 3. klasse på ordpar, ingen gavn i førskolealder) og Foo m.fl. 2025 (5–6-årige, delvis gavn). |
| Marsh m.fl. 2007 | At feedback reducerer indlæring af forkerte svarmuligheder, stammer fra Butler & Roediger 2008. |
| Hanghøj | Hanghøj & Brund er fra **2010**. "Spildidaktik" er ikke Hanghøjs begreb. Han skriver om "spilscenarier" og "scenariedidaktik". Dansk titel: "Spilscenarier i undervisningen – præsentation af en didaktisk model" (*Læring & Medier* nr. 9, 2012). "Spil i undervisningen" er temanummerets titel. |
| Kulik m.fl. 1990: 0,52 | Tallet kunne ikke verificeres i primærkilden. Brug det ikke. |

**Supplerende kilder** (verificeret, se verifikationsfilen for DOI):
- Backhaus m.fl. 2008; Butler & Roediger 2008; Carneiro, Lapa & Finn 2018.
- Chaudhry m.fl. 2018; Foo m.fl. 2025; Gais, Lucas & Born 2006.
- Hanghøj 2012; Pelánek & Řihák 2017; Soderstrom & Bjork 2015.


**Læsevejledning.** Hvert afsnit har tre strengt adskilte dele:

- **(a) DOKUMENTEREDE FUND** – hvad forskningen robust viser (effektstørrelser hvor tilgængelige, med population/alder).
- **(b) OMSTRIDT / GRÆNSER** – randbetingelser, nulresultater, replikationsproblemer, børn vs. voksne.
- **(c) DESIGNIMPLIKATIONER FOR LÆRLIG** – *mine slutninger/antagelser*, ikke forskningsfund.

**Om tal.** Effektstørrelser markeret med "(sekundær)" er hentet fra sekundære sammenfatninger og ikke kontrolleret mod artiklens tabeller. Tal uden markering er bekræftet i abstract eller primærkilde under søgningen. Se referencelisten for verificeringsstatus pr. kilde.

**Gennemgående forbehold.** Langt hovedparten af den eksperimentelle hukommelsesforskning er lavet på universitetsstuderende. Agarwal, Nunes & Blunt (2021) fandt i deres systematiske review af anvendt klasserumsforskning kun 5 eksperimenter fra elementary school og 12 fra middle school blandt de 50 kodede eksperimenter (Tabel 2 i preprintet). *Rettet i revision 2; tidligere stod der "ingen".* Lærligs målgruppe (1.–9. klasse) ligger altså delvist uden for, hvor evidensen er stærkest.

---

## 1. Genkaldelsespraksis (testing effect), pretesting og fejlfuld generering

### (a) Dokumenterede fund
- **Testeffekten er robust.** Roediger & Karpicke (2006): at tage hukommelsestests forbedrer langtidsfastholdelse mere end gentaget læsning; fordelen viser sig især på forsinkede tests, mens genlæsning kan vinde på umiddelbare tests.
- **Metaanalyser:** Rowland (2014, *Psychological Bulletin*): samlet g ≈ 0,50 for test vs. genlæsning (sekundær); større effekt når der gives feedback (g ≈ 0,73 vs. 0,39 uden; sekundær), ved opholdsinterval ≥ 1 dag, og ved genkaldelsestest (recall) frem for genkendelse. Adesope, Trevisan & Sundararajan (2017, *RER*): praksistests slår genlæsning og alle andre sammenligningsbetingelser; g ≈ 0,61 (fixed) / 0,70 (random) (sekundær); omfatter også grund- og gymnasieelever; effekterne modereres af testformat, deltagerkarakteristika m.m. Yang m.fl. (2021, *Psychological Bulletin*): i *klasserum* g = 0,499 på tværs af 222 studier og 48.478 elever.
- **Børn:** Karpicke, Blunt & Smith (2016) fandt robuste genkaldelseseffekter hos 4.-klasseelever (gennemsnit 10 år) i alle tre eksperimenter. Materialet var ordlister med kort forsinkelse og uden feedback. *Rettet i revision 2; tidligere stod der "indskolingen".* Rohrer m.fl. (2020) viste store effekter i 7. klasses matematik (se afsnit 2).
- **Testformat og feedback:** Kang, McDermott & Roediger (2007): kortsvarsquiz *med* feedback gav bedst langtidsfastholdelse sammenlignet med multiple choice (MC) og genlæsning. Marsh m.fl. (2007): MC-tests hjælper generelt, men øger sandsynligheden for, at forkerte svarmuligheder (lures) senere gengives som svar ("negativ testeffekt"); feedback reducerer dette markant.
- **Pretesting / fejlfuld generering:** Richland, Kornell & Kao (2009): at forsøge at besvare spørgsmål *før* man læser en tekst forbedrede senere læring – også for de spørgsmål, man svarede forkert på i pretesten. Kornell, Hays & Bjork (2009): mislykkede genkaldelsesforsøg forbedrer efterfølgende læring, når det korrekte svar gives straks bagefter. Pan & Carpenter (2023, *Educational Psychology Review*) sammenfatter prequestion-/pretesting-litteraturen som generelt positiv for de pretestede emner.
- **Produktiv fejl:** Sinha & Kapur (2021, *RER*, 53 studier): problemløsning før instruktion kan give bedre konceptuel forståelse end instruktion først – men primært i STEM og primært for ældre elever.

### (b) Omstridt / grænser
- **Børn og pretesting:** Direkte evidens for pretesting hos grundskolebørn er tynd og blandet. En israelsk specialeafhandling (Bar-Ilan; ikke fagfællebedømt) fandt, at pretesting af tekstindhold *ikke* hjalp og endda skadede 2. og 5. klasses elever. Et NUS-projekt om prequestioning hos små børn var ifølge søgningen ikke afsluttet. Konklusion: pretesting-effekten er velbelagt for voksne, uafklaret for børn.
- **Pretesting virker bedst, når** feedback/korrekt svar følger hurtigt, materialet faktisk præsenteres bagefter, og spørgsmålene matcher indholdet. Effekten for *ikke-pretestede* emner i samme tekst er svagere og mere usikker (Pan & Carpenter 2023).
- **Motivationel risiko:** Gentagne fejl på stof, man aldrig har mødt, kan være demotiverende for svage/yngre elever; Pan & Carpenter (2023) behandler motivationsspørgsmålet som åbent.
- **Klassisk testeffekt kræver ofte succesfuld genkaldelse:** Rowland (2014) finder, at effekten afhænger af, at en del items kan genkaldes ved første test; uden feedback og ved lav første-genkaldelse er effekten mindre.
- **Agarwal m.fl. (2021):** konkluderer bred fordel i skoler. Fordelingen på uddannelsesniveau (k = 50) er 5 elementary, 12 middle, 3 high school, 20 undergraduate og 10 medicinske studier (preprintets Tabel 2). *Rettet i revision 2.*
- **Sinha & Kapur (2021):** forfatterne selv bemærker, at elever i indskolingen ofte har for lidt forhåndsviden til at drage nytte af problemløsning før instruktion, og at procedurer læres lige så godt med instruktion først.

### (c) Designimplikationer for Lærlig (implikation/antagelse)
- Lærligs nuværende "kun test" udnytter testeffekten, men *uden* forudgående præsentation får man ikke den læring, testeffekten forudsætter. Indfør en fase "mød stoffet → arbejd med det → feedback → genkald senere".
- En diagnostisk pretest er forsvarlig, men et forkert svar på aldrig-undervist stof bør klassificeres som **"ikke mødt / ukendt"**, ikke som "manglende mestring". Pretest-svar bør logges separat (f.eks. `phase = 'pretest'`) og ikke indgå i mestringsestimatet med samme vægt.
- Hvis der bruges pretest-spørgsmål som læringsgreb, skal det korrekte svar/forklaringen vises umiddelbart efter, og pretesten bør være kort, uden XP-straf og tydeligt framet ("Vi tjekker, hvad du allerede ved – det er helt fint ikke at vide det").
- Til de yngste klasser (1.–3.) bør pretesting bruges sparsomt, da evidensen for børn er uafklaret.
- MC kombineret med feedback er acceptabelt; præferer genkaldelsesformater (kortsvar, "Stav til") til konsolidering, og vis altid korrekt svar efter fejl for at modvirke lure-indlæring.

---

## 2. Spredning (spacing), skemaer og interleaving

### (a) Dokumenterede fund
- **Spacing-effekten:** Cepeda m.fl. (2006, *Psychological Bulletin*; 839 vurderinger, 317 eksperimenter): fordelt øvelse slår massed øvelse; det optimale interval (ISI) vokser med opholdstiden indtil prøven.
- **"Temporal ridgeline":** Cepeda m.fl. (2008, *Psychological Science*, >1.350 deltagere): præstation stiger først og falder så langsomt, når mellemrummet øges. Optimalt mellemrum ≈ 20–40 % af opholdstiden ved 1 uges prøve, men kun ≈ 5–10 % ved 1 års prøve. For lange mellemrum koster mindre end for korte.
- **Børn:** Vlach & Sandhofer (2012, *Child Development*; 5–7-årige, naturfagsbegreber) og opfølgningen Gluckman, Vlach & Sandhofer (2014) viser, at spredte lektioner også forbedrer hukommelse *og* generalisering hos små børn.
- **Policy-sammenfatning:** Kang (2016) argumenterer for spaced repetition som billig og effektiv i undervisning.
- **Ekspanderende vs. ligelige intervaller:** Karpicke & Roediger (2007): ekspanderende skema vandt på umiddelbar test, men ligeligt spredt vandt efter 2 dage; den afgørende faktor var at *forsinke den første genkaldelse*.
- **Interleaving:** Brunmair & Richter (2019, *Psychological Bulletin*; 59 studier): samlet g = 0,42; størst for kategorier der ligner hinanden på tværs og varierer indenfor (f.eks. malerier g ≈ 0,67), mens effekten for ordmateriale var negativ (g ≈ −0,39; sekundær, uden fuld kontekst). Rohrer, Dedrick & Stershic (2015) og Rohrer m.fl. (2020; cluster-RCT, 54 klasser, 787 elever i 7. klasse): blandet matematikøvelse gav 61 % vs. 38 % på opfølgningstest, d = 0,83.

### (b) Omstridt / grænser
- Ekspanderende vs. ligelige skemaer: blandede resultater; nogle studier finder fordele for ekspanderende, andre ingen forskel (Karpicke & Roediger 2007; Karpicke 2010). Der er ikke konsensus om et "optimalt" skema.
- Cepeda-forsøgene brugte primært verbalt fakta-/ordmateriale med voksne; overførsel til komplekse færdigheder og til børn er sandsynlig, men mindre direkte belagt.
- Interleaving hjælper ved at træne *diskrimination* mellem problemtyper; det er tvivlsomt for helt nye begreber, ekspositoriske tekster og ord (Brunmair & Richter 2019). Interleaving kræver, at eleven allerede har et basalt greb om hver type.
- Spaced practice føles sværere og giver lavere præstation *under* øvelsen ("desirable difficulty") – præstation under øvelse er derfor en dårlig indikator for læring.

### (c) Designimplikationer for Lærlig (implikation/antagelse)
- Planlæg genbesøg af mestret stof med voksende intervaller (f.eks. 1 dag → ~1 uge → ~1 måned), men første genkaldelse skal ikke være umiddelbar. Et datadrevet glemselsmodel (afsnit 6) kan senere erstatte faste intervaller.
- Bland først problemtyper (interleaving) *efter* introduktionsfasen for hver type; brug det særligt i matematik (stærkeste evidens) og mindre i ren ordindlæring.
- Brug ikke korrekthed under massed øvelse som mestringsbevis; mål på et forsinket genbesøg.
- Den nuværende "gentagelse giver 2 XP + 1 mønt" (D-211) belønner gentagelse svagere – hvis spaced review indføres, bør belønningen ikke gøre genbesøg uattraktivt.

---

## 3. Gennemarbejdede eksempler, fading, expertise reversal og kognitiv belastning

### (a) Dokumenterede fund
- **Worked-example-effekten:** For novicer giver studie af gennemarbejdede eksempler bedre læring end ren problemløsning (kognitiv belastningsteori, Sweller m.fl.).
- **Element-interaktivitet:** Sweller (2010) definerer intrinsisk belastning ud fra hvor mange elementer der skal behandles samtidigt; ekstrinsisk belastning er interaktivitet skabt af den instruktionelle udformning.
- **Fading:** Renkl & Atkinson (2003, *Educational Psychologist*) foreslår en gradvis overgang fra komplette eksempler til delvist udfyldte og til selvstændige opgaver. Senere studier (Salden m.fl., sekundær omtale) fandt adaptiv fading > fast fading > ren problemløsning.
- **Expertise reversal:** Kalyuga, Ayres, Chandler & Sweller (2003) og Kalyuga (2007): vejledning, der hjælper novicer, bliver overflødig og kan *skade* mere kyndige elever (redundant information belaster arbejdshukommelsen). Kalyuga (2007) anbefaler hurtige diagnostiske opgaver til at tilpasse vejledningsniveauet.
- **Forhåndsviden:** Simonsmeier m.fl. (2022; 8.776 effektstørrelser): forhåndsviden forklarer meget af variationen i *slutresultat*, men i gennemsnit lidt af variationen i *læringsgevinst*.

### (b) Omstridt / grænser
- Kognitiv belastning måles ofte via selvrapportering; teorien kritiseres for at være svær at falsificere, og begrebet "germane load" er revideret flere gange (Sweller 2010 tilknytter det intrinsisk belastning).
- Det er uklart præcist *hvornår* man skal skifte vejledningsniveau; Kalyugas hurtigdiagnostik er lovende men ikke bredt valideret i skoleplatforme.
- Produktiv fejl (Kapur) står i spænding med worked-example-forskningen; Sinha & Kapur (2021) finder fordel for problem-først mest ved konceptuel forståelse hos ældre elever.

### (c) Designimplikationer for Lærlig (implikation/antagelse)
- "Introduktion"-fasen for nyt stof kan være et kort gennemarbejdet eksempel (matematik), en kort tekst + illustration (historie) eller en model-staveform (dansk), efterfulgt af delvist udfyldte opgaver, før fri testopgave.
- En elev, der klarer en kort diagnostik sikkert, skal kunne springe introduktionen over (undgå expertise reversal og kedsomhed).
- Hold skærmelementer få; undgå at instruktion og opgave konkurrerer om opmærksomheden.

---

## 4. Feedback, hints og hjælpsøgning

### (a) Dokumenterede fund
- **Hattie & Timperley (2007):** feedback virker bedst, når den adresserer opgave, proces og selvregulering (feed up / feed back / feed forward), og dårligst når den rettes mod personen ("du er dygtig").
- **Wisniewski, Zierer & Hattie (2020; 435 studier):** gennemsnitlig d = 0,48, med betydelig heterogenitet; jo mere information feedbacken indeholder, desto stærkere effekt.
- **Kluger & DeNisi (1996; 607 effektstørrelser):** gennemsnit d = 0,41, men *over en tredjedel* af feedbackinterventioner *forringede* præstationen – især når feedback flytter opmærksomheden mod selvet.
- **Elaboreret vs. verifikationsfeedback:** van der Kleij, Feskens & Eggen (2015; 40 studier, computerbaseret): elaboreret feedback (forklaring) 0,49; korrekt svar vist 0,32; kun "rigtigt/forkert" 0,05. Forsinket feedback og grundskole/gymnasium var associeret med mindre effekter.
- **Shute (2008):** gennemgang med retningslinjer; formativ feedback skal være specifik, fokuseret på opgaven, i håndterbare doser.
- **Hjælpsøgning:** Aleven m.fl. (2003): elever bruger ofte hjælpefunktioner dårligt eller slet ikke; effektiv hjælpsøgning følger med bedre læring. Baker m.fl. (2004): "gaming the system" (f.eks. klik-gennem hints til svaret) er stærkere forbundet med lavere læring end andre off-task-adfærd.
- **Assistance dilemma:** Koedinger & Aleven (2007): spørgsmålet om hvornår man giver vs. holder information tilbage er uløst og kontekstafhængigt.

### (b) Omstridt / grænser
- Umiddelbar vs. forsinket feedback: blandet. Shute nævner (sekundær) at umiddelbar feedback ofte hjælper procedural læring, og forsinket kan hjælpe højere-ordens læring; van der Kleij m.fl. fandt ingen signifikant interaktion. Rowland (2014) fandt større testeffekt, når feedback kom efter testen.
- Hattie-tallene (oprindeligt d = 0,79) er nedjusteret til 0,48 i 2020-metaanalysen; heterogeniteten betyder, at "feedback virker" ikke er én intervention.
- Hints under en opgave forurener den opgave som bevis for mestring: et svar opnået med hint er ikke ækvivalent med et selvstændigt svar (dette er standard i kognitive tutorer – hints tælles typisk som fejl i knowledge tracing).

### (c) Designimplikationer for Lærlig (implikation/antagelse)
- Udvid feedback fra "rigtigt/forkert" til elaboreret: kort forklaring + korrekt svar; misopfattelsesfeedback er allerede et godt udgangspunkt.
- Undgå personrettet ros/kritik i feedbacktekster; ret den mod opgaven og næste skridt.
- Tilbyd hints i øve-/arbejdsfasen, men marker svar med brugt hint som "assisteret"; disse må ikke tælle som mestringsbevis.
- Byg mod "gaming": f.eks. kræv et forsøg før hint, og registrer hurtige gæt/klik-gennem.

---

## 5. Formativ og diagnostisk vurdering, misopfattelser, sikkerhedsbaseret bedømmelse

### (a) Dokumenterede fund
- **Black & Wiliam (1998):** omfattende gennemgang (~250 kilder, sekundært omtalt som op til 600 studier) der konkluderer, at formativ vurdering hæver præstationer, især for lavt præsterende elever.
- **Refutationstekster:** Tippett (2010) og Guzzetti m.fl. (1993) fandt, at tekster der eksplicit nævner en misopfattelse og tilbageviser den, fremmer begrebsforandring bedre end almindelige tekster. Danielson m.fl. (2025, *Educational Psychologist*; 76 studier, 294 effektstørrelser) bekræfter en konsistent og signifikant fordel for refutationstekster i kontrollerede eksperimenter.
- **Sikkerhedsbaseret bedømmelse (CBM):** Gardner-Medwin (UCL) – eleven angiver sikkerhed (1–3); point for rigtige svar og stigende straf (0, −2, −6) for forkerte. Rapporteret højere reliabilitet (Cronbach's α 0,924 vs. 0,887) og ca. halvering af antal spørgsmål for samme reliabilitet. Dog primært konferenceabstracts og medicinstuderende.

### (b) Omstridt / grænser
- Black & Wiliam 1998's effektstørrelser (ofte gengivet som 0,4–0,7) er kritiseret (bl.a. Bennett 2011, ikke verificeret her) for at hvile på heterogene studier; "formativ vurdering" er et bredt begreb.
- Refutationstekst-effekter er primært fra naturfag og ældre elever/voksne; Danielson m.fl. nævner, at tidligere fund var mødt med skepsis.
- CBM er udviklet til voksne; om 6–10-årige kan angive sikkerhed meningsfuldt er ikke dokumenteret i de kilder, jeg fandt. Gardner-Medwin & Curtin advarer om overdreven sikkerhed efter delvis eliminering af svarmuligheder.

### (c) Designimplikationer for Lærlig (implikation/antagelse)
- Diagnostik bør skelne mindst fire tilstande: *ikke mødt*, *delvis forståelse*, *specifik misopfattelse*, *mestret*. Misopfattelser kan identificeres via distraktorer bygget på kendte fejl (misopfattelses-mapping pr. distraktor).
- Når en distraktor afslører en kendt misopfattelse: vis en kort refutationsforklaring ("Mange tror X. Men faktisk Y, fordi …").
- En simpel sikkerhedsmarkering ("Jeg ved det / jeg gætter") fra ca. 4.–5. klasse kan bruges til at nedvægte gæt i learner-modellen, men *uden* pointstraf for yngre elever (antagelse; ikke testet på målgruppen).

---

## 6. Mestringslæring, knowledge tracing, glemselsmodeller og falsk mestring

### (a) Dokumenterede fund
- **Mestringslæring:** Bloom (1968) "Learning for Mastery"; Bloom (1984) "2 sigma problem": en-til-en-tutoring ~2 SD over klasseundervisning, mestringslæring ~1 SD. Kulik, Kulik & Bangert-Drowns (1990; 108 evalueringer): positive effekter på eksamenspræstation i gymnasie, universitet og ældre grundskoleklasser (effektstørrelse ≈ 0,52 er nævnt i sekundære kilder, men tallet kan være forvekslet med Kulik m.fl. 1986).
- **BKT:** Corbett & Anderson (1995): Bayesiansk knowledge tracing med fire parametre – startviden P(L0), læringsrate P(T), *guess* P(G) og *slip* P(S).
- **Oversigt:** Pelánek (2017): BKT, logistiske modeller (PFA, AFM, IRT) m.fl.; modelvalg afhænger af formål.
- **Elo:** Pelánek (2016): Elo-varianter er simple, robuste og effektive til samtidig estimering af elev- og itemsværhed i adaptive systemer.
- **Glemsel:** Settles & Meeder (2016, ACL; Duolingo): half-life regression (p = 2^(−Δ/h)) forudsiger genkaldelse bedre end Leitner/Pimsleur.
- **"N i træk"-regler:** Kelly, Wang & Thompson (2015, EDM-poster, ASSISTments): 3 i træk gav tilstrækkelig praksis især for elever uden fejl, men højere N forudsagde transfer bedre end lavere N og end knowledge tracing.

### (b) Omstridt / grænser
- Slavin (1987) fandt langt mindre effekter i realistiske settings og ingen signifikant effekt på normrefererede tests; Bloom-2-sigma anses af flere for oppustet.
- BKT-parametre har identificerbarhedsproblemer (forskellige parametersæt passer ens); guess-parametre i MC med 3–4 muligheder er høje (25–33 %).
- **Falsk mestring:** Ved 4-valgs MC er sandsynligheden for 3 rigtige i træk ved rent gæt ≈ 1,6 %, men med delvis viden (to muligheder elimineret) ≈ 12,5 %; korte streak-regler er derfor sårbare, især når samme item gentages.
- Mestring målt umiddelbart efter øvelse overvurderer langtidsfastholdelse (spacing-litteraturen).

### (c) Designimplikationer for Lærlig (implikation/antagelse)
- Mestring bør kræve *forsinket* evidens (korrekt svar efter mindst ét spacing-interval), forskellige items/formater, og ingen hints.
- Brug en model med eksplicit gæt-parameter (BKT eller Elo/IRT med gæt-korrektion) frem for "3 i træk".
- Pretest-fejl på aldrig-mødt stof sættes til "ikke mødt", ikke til lav P(L).
- En glemselsmodel (HLR-lignende) kan markere "lært men glemt" og planlægge genbesøg.
- Klassetrin er kun startpunkt, ikke loft (jf. ejerens beslutning om niveaumodellen); elever, der mestrer, skal kunne gå videre ("klar til større udfordringer").

---

## 7. Spilbaseret læring, spildidaktik og gamification

### (a) Dokumenterede fund
- **Hanghøj (2013)** "Game-based teaching: Practices, roles, and pedagogies": lærere skal skifte mellem interaktionsroller for at facilitere spilscenarier; der er få empiriske studier af, hvordan lærere faktisk bruger spil.
- **Hanghøj & Brund (2010):** lærerroller i spilbaseret undervisning (fx instruktør, playmaker m.fl.).
- **Hanghøj, Lieberoth & Misfeldt (2018, *BJET*):** samarbejdsspil (Torchlight II) i danske klasser øgede social deltagelse og trivsel for udsatte elever og reducerede oplevet ekstern regulering.
- **Hanghøj, Kabel & Jensen (2022, *L1-ESLL*; dansk version i *Sprogforum* 2024):** systematisk review af digitale spil i L1/L2-undervisning (77 studier).
- **Gamification:** Sailer & Homner (2020): små positive effekter på kognitive (g = 0,49), motivationelle (g = 0,36) og adfærdsmæssige (g = 0,25) udfald; den kognitive effekt var kun stabil i en delmængde af stringente studier; spilfiktion og social interaktion modererede.
- **Overjustification:** Deci, Koestner & Ryan (1999; 128 studier): forventede, håndgribelige belønninger, der er betinget af engagement, mindsker indre motivation; Cameron & Pierce (1994) fandt begrænsede negative effekter. Debatten er ikke afsluttet.

### (b) Omstridt / grænser
- Gamification-studier er heterogene og ofte korte; "nyhedseffekt" er en kendt bias.
- Deci-Cameron-debatten: begge enige om, at verbal ros ikke skader og at belønninger betinget af *præstationsniveau* er mindre skadelige end belønninger for blot deltagelse.
- Jeg fandt ingen bog med titlen "Spil i undervisningen" af Hanghøj; påstanden kan ikke verificeres.

### (c) Designimplikationer for Lærlig (implikation/antagelse)
- XP/mønter bør belønne *læringsadfærd* (forsøg, retning efter feedback, genbesøg efter pause), ikke hastighed eller gæt.
- Ingen hastighedsbonus på mestringsopgaver; ingen ekstra belønning for "streaks" der kan fås via gæt.
- Overvej samarbejdselementer (Hanghøj 2018; Sailer & Homner) og lærerrolle-understøttelse i teacher-dashboardet.

---

## 8. Dansk kontekst (kort)

### (a) Dokumenterede fund
- **Fælles Mål:** Lov nr. 1445 af 12.12.2017 gjorde færdigheds- og vidensmål vejledende; fagformål og kompetencemål forblev bindende. Før lempelsen var der 3.385 bindende mål.
- **De nationale test:** Bundsgaard & Kreiner (2019) dokumenterede stor måleusikkerhed på elevniveau (læsning, 8. klasse) og kritiserede brugen til individniveau. Rapporten blev kritiseret af andre forskere (se Kronik i childresearch.au.dk).
- **Adaptive læremidler:** Læremiddel.dk/AU og Københavns Kommune (2020, Rhapsode-rapport; 12 klasser, 4. og 9. kl.) og Gissel & Jørnø (2024) "Between the clicks" om elevers læringsbaner i et adaptivt læremiddel i 4. klasses matematik. Konkrete effektstørrelser ikke fundet.
- Ingen EVA-rapport specifikt om adaptive læringsplatforme blev fundet.
- **Bremholm:** ingen kilde fundet, hvor Jesper Bremholm kritiserer de nationale test; kritikken tilskrives i kilderne Bundsgaard & Kreiner.

### (b) Omstridt / grænser
- Debatten om de nationale test er politisk; ministeriet anerkendte kritikpunkter, men afviste dele af tolkningen.
- Dansk evidens om adaptive platforme er sparsom og primært kvalitativ.

### (c) Designimplikationer for Lærlig (implikation/antagelse)
- Kobling til kompetencemål (bindende) og vejledende færdigheds- og vidensmål giver lærere meningsfuld rapportering.
- Lærlig bør ikke præsentere elevniveau-estimater som præcise målinger; vis usikkerhed og undgå "dom" over elever.

---

## Referencer (med verificeringsstatus)

Statuskoder: **V** = bekræftet via søgning i denne session (titel/tidsskrift/år); **V-sek** = bekræftet men tal fra sekundær kilde; **K** = kendt, ikke genverificeret.

1. Adesope, O. O., Trevisan, D. A., & Sundararajan, N. (2017). Rethinking the use of tests: A meta-analysis of practice testing. *Review of Educational Research*, 87(3), 659–701. https://doi.org/10.3102/0034654316689306 — **V-sek**
2. Agarwal, P. K., Nunes, L. D., & Blunt, J. R. (2021). Retrieval practice consistently benefits student learning: A systematic review of applied research in schools and classrooms. *Educational Psychology Review*, 33, 1409–1453. https://doi.org/10.1007/s10648-021-09595-9 — **V-sek**
3. Aleven, V., Stahl, E., Schworm, S., Fischer, F., & Wallace, R. (2003). Help seeking and help design in interactive learning environments. *Review of Educational Research*, 73(3), 277–320. https://doi.org/10.3102/00346543073003277 — **V**
4. Baker, R. S., Corbett, A. T., Koedinger, K. R., & Wagner, A. Z. (2004). Off-task behavior in the cognitive tutor classroom: When students "game the system". *Proceedings of ACM CHI 2004*, 383–390. — **V**
5. Black, P., & Wiliam, D. (1998). Assessment and classroom learning. *Assessment in Education: Principles, Policy & Practice*, 5(1), 7–74. — **V**
6. Bloom, B. S. (1968). Learning for mastery. *Evaluation Comment*, 1(2). — **K**
7. Bloom, B. S. (1984). The 2 sigma problem. *Educational Researcher*, 13(6), 4–16. — **V**
8. Brunmair, M., & Richter, T. (2019). Similarity matters: A meta-analysis of interleaved learning and its moderators. *Psychological Bulletin*, 145(11), 1029–1052. https://doi.org/10.1037/bul0000209 — **V**
9. Bundsgaard, J., & Kreiner, S. (2019). *Undersøgelse af De Nationale Tests måleegenskaber* (2. rev. udg.). DPU, Aarhus Universitet. — **V**
10. Cameron, J., & Pierce, W. D. (1994). Reinforcement, reward, and intrinsic motivation: A meta-analysis. *Review of Educational Research*, 64(3), 363–423. — **V**
11. Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. *Psychological Bulletin*, 132(3), 354–380. https://doi.org/10.1037/0033-2909.132.3.354 — **V**
12. Cepeda, N. J., Vul, E., Rohrer, D., Wixted, J. T., & Pashler, H. (2008). Spacing effects in learning: A temporal ridgeline of optimal retention. *Psychological Science*, 19(11), 1095–1102. https://doi.org/10.1111/j.1467-9280.2008.02209.x — **V**
13. Corbett, A. T., & Anderson, J. R. (1995). Knowledge tracing: Modeling the acquisition of procedural knowledge. *User Modeling and User-Adapted Interaction*, 4(4), 253–278. https://doi.org/10.1007/BF01099821 — **V** (citeres også som 1994)
14. Danielson, R. W., Jacobson, N. G., Patall, E. A., Sinatra, G. M., Adesope, O. O., Kennedy, A. A. U., m.fl. (2025). The effectiveness of refutation text in confronting scientific misconceptions: A meta-analysis. *Educational Psychologist*, 60(1), 23–47. https://doi.org/10.1080/00461520.2024.2365628 — **V**
15. Deci, E. L., Koestner, R., & Ryan, R. M. (1999). A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation. *Psychological Bulletin*, 125(6), 627–668. — **V**
16. Gardner-Medwin, A. R. (div. år). Certainty-based marking (CBM) – UCL/LAPT; konferenceabstracts i *Proceedings of The Physiological Society*. — **V** (primært abstracts, ikke fagfællebedømt fuldtekst)
17. Gissel, S. T., & Jørnø, R. L. (2024). Between the clicks: Student learning paths when interacting with an adaptive learning resource in 4th grade mathematics. *Learning Tech*. — **V** (eksistens)
18. Gluckman, M., Vlach, H. A., & Sandhofer, C. M. (2014). Spacing simultaneously promotes multiple forms of learning in children's science curriculum. *Applied Cognitive Psychology*, 28(2), 266–273. — **K** (titel/tidsskrift ikke genverificeret)
19. Guskey, T. R. (2007). Closing achievement gaps: Revisiting Benjamin S. Bloom's "Learning for Mastery". *Journal of Advanced Academics*, 19(1), 8–31. — **V**
20. Guzzetti, B. J., Snyder, T. E., Glass, G. V., & Gamas, W. S. (1993). Promoting conceptual change in science: A comparative meta-analysis of instructional interventions from reading education and science education. *Reading Research Quarterly*, 28(2), 116–159. — **V** (via sekundær referenceliste)
21. Hanghøj, T. (2013). Game-based teaching: Practices, roles, and pedagogies. I S. de Freitas m.fl. (red.), *New Pedagogical Approaches in Game Enhanced Learning: Curriculum Integration* (s. 81–101). IGI Global. https://doi.org/10.4018/978-1-4666-3950-8.ch005 — **V** (sidetal ikke verificeret)
22. Hanghøj, T., & Brund, C. E. (2010). Teacher roles and positionings in relation to educational games. *Proceedings of the 4th European Conference on Games Based Learning*, s. 115–122. — **V** (år og sider verificeret i revision 2)
23. Hanghøj, T., Lieberoth, A., & Misfeldt, M. (2018). Can cooperative video games encourage social and motivational inclusion of at-risk students? *British Journal of Educational Technology*, 49(4), 775–799. https://doi.org/10.1111/bjet.12642 — **V**
24. Hanghøj, T., Kabel, K., & Jensen, S. H. (2022). Digital games, literacy and language learning in L1 and L2: A comparative systematic review. *L1-Educational Studies in Language and Literature*, 22. https://doi.org/10.21248/l1esll.2022.22.2.363 — **V**
25. Hattie, J., & Timperley, H. (2007). The power of feedback. *Review of Educational Research*, 77(1), 81–112. https://doi.org/10.3102/003465430298487 — **V**
26. Kalyuga, S. (2007). Expertise reversal effect and its implications for learner-tailored instruction. *Educational Psychology Review*, 19(4), 509–539. https://doi.org/10.1007/s10648-007-9054-3 — **V**
27. Kalyuga, S., Ayres, P., Chandler, P., & Sweller, J. (2003). The expertise reversal effect. *Educational Psychologist*, 38(1), 23–31. — **V**
28. Kang, S. H. K. (2016). Spaced repetition promotes efficient and effective learning: Policy implications for instruction. *Policy Insights from the Behavioral and Brain Sciences*, 3(1), 12–19. https://doi.org/10.1177/2372732215624708 — **V**
29. Kang, S. H. K., McDermott, K. B., & Roediger, H. L. (2007). Test format and corrective feedback modify the effect of testing on long-term retention. *European Journal of Cognitive Psychology*, 19(4–5), 528–558. — **V**
30. Karpicke, J. D., Blunt, J. R., & Smith, M. A. (2016). Retrieval-based learning: Positive effects of retrieval practice in elementary school children. *Frontiers in Psychology*, 7, 350. https://doi.org/10.3389/fpsyg.2016.00350 — **V**
31. Karpicke, J. D., & Roediger, H. L. (2007). Expanding retrieval practice promotes short-term retention, but equally spaced retrieval enhances long-term retention. *JEP: Learning, Memory, and Cognition*, 33(4), 704–719. — **V**
32. Kelly, K., Wang, Y., Thompson, T., & Heffernan, N. (2015). Defining mastery: Knowledge tracing versus N-consecutive correct responses. *EDM 2015 (poster)*. — **V**
33. Kluger, A. N., & DeNisi, A. (1996). The effects of feedback interventions on performance. *Psychological Bulletin*, 119(2), 254–284. — **V-sek**
34. Koedinger, K. R., & Aleven, V. (2007). Exploring the assistance dilemma in experiments with Cognitive Tutors. *Educational Psychology Review*, 19(3), 239–264. https://doi.org/10.1007/s10648-007-9049-0 — **V**
35. Kornell, N., Hays, M. J., & Bjork, R. A. (2009). Unsuccessful retrieval attempts enhance subsequent learning. *JEP: Learning, Memory, and Cognition*, 35(4), 989–998. https://doi.org/10.1037/a0015729 — **V**
36. Kulik, C.-L. C., Kulik, J. A., & Bangert-Drowns, R. L. (1990). Effectiveness of mastery learning programs: A meta-analysis. *Review of Educational Research*, 60(2), 265–299. https://doi.org/10.3102/00346543060002265 — **V** (effektstørrelse ikke verificeret)
37. Læremiddel.dk & Aarhus Universitet (2020). *Rhapsode – design, brug og virkning*. Rapport for Københavns Kommune. — **V** (eksistens)
38. Marsh, E. J., Roediger, H. L., Bjork, R. A., & Bjork, E. L. (2007). The memorial consequences of multiple-choice testing. *Psychonomic Bulletin & Review*, 14(2), 194–199. https://doi.org/10.3758/BF03194051 — **V**
39. Pan, S. C., & Carpenter, S. K. (2023). Prequestioning and pretesting effects: A review of empirical research, theoretical perspectives, and implications for educational practice. *Educational Psychology Review*, 35(4), 97. — **V**
40. Pelánek, R. (2016). Applications of the Elo rating system in adaptive educational systems. *Computers & Education*, 98, 169–179. https://doi.org/10.1016/j.compedu.2016.03.017 — **V** (bind/sider K)
41. Pelánek, R. (2017). Bayesian knowledge tracing, logistic models, and beyond: An overview of learner modeling techniques. *User Modeling and User-Adapted Interaction*, 27(3–5), 313–350. https://doi.org/10.1007/s11257-017-9193-2 — **V**
42. Renkl, A., & Atkinson, R. K. (2003). Structuring the transition from example study to problem solving in cognitive skill acquisition: A cognitive load perspective. *Educational Psychologist*, 38(1), 15–22. — **V**
43. Richland, L. E., Kornell, N., & Kao, L. S. (2009). The pretesting effect: Do unsuccessful retrieval attempts enhance learning? *Journal of Experimental Psychology: Applied*, 15(3), 243–257. — **V**
44. Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. *Psychological Science*, 17(3), 249–255. — **V**
45. Rohrer, D., Dedrick, R. F., & Stershic, S. (2015). Interleaved practice improves mathematics learning. *Journal of Educational Psychology*, 107(3), 900–908. — **V**
46. Rohrer, D., Dedrick, R. F., Hartwig, M. K., & Cheung, C.-N. (2020). A randomized controlled trial of interleaved mathematics practice. *Journal of Educational Psychology*, 112(1), 40–52. — **V**
47. Rowland, C. A. (2014). The effect of testing versus restudy on retention: A meta-analytic review of the testing effect. *Psychological Bulletin*, 140(6), 1432–1463. https://doi.org/10.1037/a0037559 — **V-sek**
48. Sailer, M., & Homner, L. (2020). The gamification of learning: A meta-analysis. *Educational Psychology Review*, 32(1), 77–112. https://doi.org/10.1007/s10648-019-09498-w — **V**
49. Settles, B., & Meeder, B. (2016). A trainable spaced repetition model for language learning. *Proceedings of ACL 2016*, 1848–1858. — **V**
50. Shute, V. J. (2008). Focus on formative feedback. *Review of Educational Research*, 78(1), 153–189. https://doi.org/10.3102/0034654307313795 — **V**
51. Simonsmeier, B. A., Flaig, M., Deiglmayr, A., Schalk, L., & Schneider, M. (2022). Domain-specific prior knowledge and learning: A meta-analysis. *Educational Psychologist*, 57(1), 31–54. https://doi.org/10.1080/00461520.2021.1939700 — **V**
52. Sinha, T., & Kapur, M. (2021). When problem solving followed by instruction works: Evidence for productive failure. *Review of Educational Research*, 91(5), 761–798. https://doi.org/10.3102/00346543211019105 — **V-sek** (bind/sider K)
53. Slavin, R. E. (1987). Mastery learning reconsidered. *Review of Educational Research*, 57(2), 175–213. — **V**
54. Sweller, J. (2010). Element interactivity and intrinsic, extraneous, and germane cognitive load. *Educational Psychology Review*, 22, 123–138. https://doi.org/10.1007/s10648-010-9128-5 — **V**
55. Tippett, C. D. (2010). Refutation text in science education: A review of two decades of research. *International Journal of Science and Mathematics Education*, 8(6), 951–970. https://doi.org/10.1007/s10763-010-9203-x — **V** (bekræftet i revision 2)
56. van der Kleij, F. M., Feskens, R. C. W., & Eggen, T. J. H. M. (2015). Effects of feedback in a computer-based learning environment on students' learning outcomes: A meta-analysis. *Review of Educational Research*, 85(4), 475–511. — **V**
57. Vlach, H. A., & Sandhofer, C. M. (2012). Distributing learning over time: The spacing effect in children's acquisition and generalization of science concepts. *Child Development*, 83(4), 1137–1144. — **V**
58. Wisniewski, B., Zierer, K., & Hattie, J. (2020). The power of feedback revisited: A meta-analysis of educational feedback research. *Frontiers in Psychology*, 10, 3087. https://doi.org/10.3389/fpsyg.2019.03087 — **V**
59. Yang, C., Luo, L., Vadillo, M. A., Yu, R., & Shanks, D. R. (2021). Testing (quizzing) boosts classroom learning: A systematic and meta-analytic review. *Psychological Bulletin*, 147(4), 399–435. https://doi.org/10.1037/bul0000309 — **V** (bind/sider K)
60. Lov nr. 1445 af 12. december 2017 (lempelse af bindinger i Fælles Mål). — **V** (via emu.dk-vejledning)

**Ikke fundet / ikke verificeret:** Hanghøj-bog "Spil i undervisningen"; Jesper Bremholm-kritik af de nationale test; EVA-rapport om adaptive læringsplatforme; Rhapsode-effektstørrelser.
