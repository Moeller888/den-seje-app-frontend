-- Section 57 — One-Idea Reflection Standard
-- Core principle: ONE CLEAR INSIGHT PER REFLECTION.
-- Not about dumbing down — about retention. A student who walks away with one
-- thing they will remember tomorrow learned more than a student who read eight
-- sentences and retained none.
--
-- Issues addressed (15 review_texts):
--   dp_012: "Principal-agent-problemet" / "agenturproblemet" — academic jargon pair
--   dp_013: "gratis-rider-strategien" — jargon; opener too abstract; last sentence fragmented
--   dp_014: 7 sentences, two ideas; last two sentences diverge
--   dp_015: 7 sentences; academic evidence sentence ("Videnskabelige analyser...")
--   dp_020: 8 sentences, textbook walkthrough structure
--   dp_021: 7 sentences; parenthetical "(evidensen er blandet)" hedges the key point
--   dp_023: Dense 6-sentence closer with academic abstraction chain
--   dp_024: 9 sentences, multiple ideas; Tocqueville mid-text redundancy
--   dp_025: 7 sentences; opener sub-clause weakens the punch
--   dp_027: 7 sentences; Levitsky/Ziblatt citation mid-text
--   dp_028: 7 sentences; sentence 3 adds a specific media example that dilutes focus
--   dp_030: 7 sentences; Tocqueville beundrede mid-text
--   dp_031: 10 sentences; Nordkorea second example redundant after USSR lands the point
--   dp_035: 8 sentences; "gensidig tolerance og institutionel selvkontrol" academic compound
--   dp_039: 7 sentences; last sentence triple-repetition ("reelt valg, reelt responsivt, reelt meningsfulde")
--
-- Rollback: re-run the relevant UPDATE blocks from the preceding migrations
--   (20260527000100 for questions updated by S53, 20260526000200 for original inserts)

-- dp_012: remove "Principal-agent-problemet" and "agenturproblemet" — plain language throughout
UPDATE public.questions
SET content = jsonb_set(content, '{review_text}', to_jsonb($RT$Du vælger nogen til at handle på dine vegne. Men der er ingen garanti for at de faktisk gør det. Repræsentanter har egne karriereinteresser, partiloyaliteter og påvirkninger fra lobbyister. Det er ikke en designfejl der kan rettes — det er en strukturel spænding. Transparens, karantæneregler og pressefrihed er ikke dekorationer; de er de mekanismer der begrænser kløften.$RT$::text))
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er den vigtigste svaghed ved repræsentativt demokrati?';

-- dp_013: remove "gratis-rider-strategien" jargon; keep house metaphor as standalone kicker
UPDATE public.questions
SET content = jsonb_set(content, '{review_text}', to_jsonb($RT$Demokrati beskytter alle — uanset om de bidrager til det eller ej. En person kan aldrig stemme, aldrig deltage, og stadig nyde pressefrihed, retssikkerhed og fredelige magtovergange. Det skaber et problem: ingen har individuelt incitament til at vedligeholde det. Civilsamfund, presse og valg er ikke selvkørende maskiner — de kræver aktiv deltagelse. Demokrati er et fællesejet hus. Hvis ingen vedligeholder det, rådner det.$RT$::text))
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er "gratis-rider-problemet" i demokratisk kontekst?';

-- dp_014: trim to 6 sentences, one idea — intent distinguishes journalism from propaganda
UPDATE public.questions
SET content = jsonb_set(content, '{review_text}', to_jsonb($RT$Grænsen er ikke indhold men formål. Journalistik verificerer, korrigerer sig selv og viser sit arbejde. Propaganda vælger hvad der tjener et forudbestemt narrativ — og udelader hvad der modsiger det. Begge bruger fakta. Det betyder at spørgsmålet 'er det sandt?' ikke er nok. Spørgsmålet er: søger denne tekst sandheden — eller fremmer den en beslutning der allerede er truffet?$RT$::text))
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad adskiller journalistik fra propaganda?';

-- dp_015: drop the academic evidence sentence — the structural argument stands alone
UPDATE public.questions
SET content = jsonb_set(content, '{review_text}', to_jsonb($RT$Du stemmer. Virksomhederne lobbyerer. Begge former lovgivningen — men ikke i samme omfang. En lille velhavende elite kan finansiere valgkampagner, eje medier og lobbye professionelt, mens valgurnen formelt fungerer. Demokrati og oligarki er et spektrum, ikke en binær. Spørgsmålet er ikke 'har vi et demokrati?' men 'hvem har den reelle indflydelse — og hvorfra?'$RT$::text))
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Kan en lille gruppe rige mennesker reelt bestemme i et demokrati — selvom alle har en stemme?';

-- dp_020: compress from 8 to 6 — one idea: markets can't finance collective goods
UPDATE public.questions
SET content = jsonb_set(content, '{review_text}', to_jsonb($RT$Markedet fungerer ved at ekskludere dem der ikke betaler. Det virker for brød og software. Det virker ikke for rent vand, ren luft og national forsvar — ingen kan holdes ude fra dem, og én persons brug reducerer ikke en andens. Resultatet: alle ønsker godet, men ingen har incitament til at finansiere det alene. Demokratisk kollektiv finansiering er ikke ideologi. Det er løsningen på et strukturelt problem markedet ikke kan løse.$RT$::text))
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er det konkrete problem med at lade markedet bestemme over kollektive goder som rent vand eller national forsvar?';

-- dp_021: drop parenthetical "(evidensen er blandet)" caveat and "primært" hedge; sharpen to one idea
UPDATE public.questions
SET content = jsonb_set(content, '{review_text}', to_jsonb($RT$Ekkokamre opstår ikke fordi folk er snæversynede. De opstår fordi platforme er designet til engagement — og bekræftelse genererer mere engagement end modsigelse. En bruger der klikker på ét perspektiv ser gradvist mere af det, ikke som valg men som algoritmisk konsekvens. Det farlige er ikke ekstremisme — det er at to mennesker kan leve i hver sin faktuelle virkelighed og begge tro de har fat i sandheden. Politisk dialog kræver delt faktuel bund. Ekkokamre eroderer den bund, stille, en feed ad gangen.$RT$::text))
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er et ekkokammer — og hvad er den primære mekanisme der skaber det?';

-- dp_023: tighten closer — "specialisering, ikke elitisme" replaces dense academic abstraction chain
UPDATE public.questions
SET content = jsonb_set(content, '{review_text}', to_jsonb($RT$Athen praktiserede direkte demokrati med måske 30.000–50.000 deltagelsesberettigede — og selv dér var det krævende. En moderne nation kan ikke afholde daglige folkeafstemninger om hvert lovforslag. Men problemet er ikke kun logistisk — det er kognitivt. En enkelt lov kan indeholde hundredvis af tekniske afvejninger borgere hverken har tid eller ressourcer til at evaluere. Borgere kan have stærke meninger om formål — men ikke altid om implementeringsdetaljer. Repræsentation er specialisering, ikke elitisme.$RT$::text))
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvorfor kan man ikke bare lade alle borgere stemme om alle beslutninger i et land som Danmark?';

-- dp_024: compress from 9 to 6 — one idea: social tyranny leaves no traces to fight
UPDATE public.questions
SET content = jsonb_set(content, '{review_text}', to_jsonb($RT$Det mest effektive tyranni efterlader ingen spor. Ingen love. Ingen betjente. Et flertal behøver ikke forbyde anderledestænkning — det kan bare gøre den socialt ubærlig. Kulturel isolation og udstødelse er reelle konsekvenser, selv uden en eneste paragraf. Det kalder Tocqueville 'tyranni over sindet' — og det er sværere at bekæmpe end love, fordi der ingenting er at sagsøge.$RT$::text))
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Kan et flertal undertrykke en minoritet — uden at en eneste lov forbyder noget?';

-- dp_025: tighten opener; restructure three-condition as readable list; sharpen close
UPDATE public.questions
SET content = jsonb_set(content, '{review_text}', to_jsonb($RT$Snowden, Ellsberg, Manning — whistleblowere opererer i en etisk gråzone. At 'afsløre noget forkert' er ikke nok. Det moralsk overbevisende tilfælde kræver tre ting: at skaden er reel og alvorlig, at interne kanaler er forsøgt udtømt, og at afsløringen retter sig mod skaden — ikke mod alt hvad institutionen gemmer. Kort sagt: 'dette sker, ingen stopper det, og jeg har forsøgt alt andet.' Generaliseret systemkritik er noget andet. Det er aktivisme — og det er ikke det samme.$RT$::text))
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvornår er whistleblowing moralsk forpligtende — frem for blot moralsk tilladt?';

-- dp_027: drop Levitsky/Ziblatt citation; let the argument carry itself
UPDATE public.questions
SET content = jsonb_set(content, '{review_text}', to_jsonb($RT$Demokratier bryder sjældent ned på én dag. De eroderer. Mønsteret er konsistent: normerne bryder ned først — respekten for domstolsafgørelser, accepten af valgresultater, tilbageholdenhed med at stemple oppositionen som kriminelle. Institutionerne følger efter: domstolene besættes, pressen presses. Og erosionen sker lovligt. Den kommende autokrat vinder et lovligt valg — og bruger derefter den magt til at afmontere de begrænsninger der skulle have stoppet dem.$RT$::text))
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er det tidligste advarselstegn på at et demokrati er ved at erodere?';

-- dp_028: remove sentence 3 (six-aviser example dilutes focus); tighten to 6
UPDATE public.questions
SET content = jsonb_set(content, '{review_text}', to_jsonb($RT$Mediefrihed er ikke kun frihed fra staten. Det er frihed til at rapportere — uanset ejerens interesser. Redaktioner censureres sjældent åbenlyst. De selvregulerer: journalister lærer hurtigt hvilke historier der aldrig bliver til forsider. Mediemangfoldighed er derfor demokratisk infrastruktur — ikke konkurrencepolitik. Et demokrati der overlader nyheder til ét ejerskab, forventer at private interesser generøst modarbejder sig selv.$RT$::text))
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvornår udgør koncentration af medieejerskab en specifik demokratisk trussel?';

-- dp_030: remove Tocqueville reference mid-text; let the structural argument stand alone
UPDATE public.questions
SET content = jsonb_set(content, '{review_text}', to_jsonb($RT$En sportsklub, en fagforening, en borgerforening. Hvad har de med demokrati at gøre? Mere end man tror. De lærer borgere at koordinere og handle kollektivt — uden statens initiativ. Denne kapacitet er demokratiets muskler: et folk der ikke kan organisere sig uafhængigt, kan ikke holde staten ansvarlig. Når foreningslivet svækkes, svækkes ikke bare kulturen — det svækkes demokratiets modstandskraft.$RT$::text))
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er det egentlige demokratiske formål med fagforeninger, sportsklubber og frivillige organisationer?';

-- dp_031: drop Nordkorea second example and the list-openers (Domstole der...) — USSR alone is enough
UPDATE public.questions
SET content = jsonb_set(content, '{review_text}', to_jsonb($RT$Sovjetunionen havde en fremragende forfatning — på papiret. Den garanterede ytringsfrihed, forsamlingsfrihed, religionsfrihed. Ingen efterlevede den. Det viser hvad forfatninger faktisk er: løfter, der kun er stærke hvis institutioner og politikere faktisk indfrier dem. En forfatning uden den politiske kultur der håndhæver den, er en meget flot tekst. Intet mere.$RT$::text))
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad gør en forfatning til mere end et stykke papir?';

-- dp_035: remove "gensidig tolerance og institutionel selvkontrol" (academic compound);
--         compress from 8 to 6 — one idea: it's human will, not institutional strength
UPDATE public.questions
SET content = jsonb_set(content, '{review_text}', to_jsonb($RT$Demokratier overlever ikke fordi institutionerne er stærke. De overlever fordi de mennesker der sidder i institutionerne, vælger at respektere dem. Weimar-Republikken kollapsede ikke fordi demokratiets mekanismer fejlede — det kollapsede fordi de mennesker der burde have forsvaret dem, valgte at se til. Det afgørende er vilje: vilje til at acceptere tabet, vilje til at begrænse sig selv. Det er ikke regler. Det er normer — og normer er sårbare.$RT$::text))
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er den afgørende faktor for om et demokrati overlever en alvorlig krise?';

-- dp_039: tighten last sentence — remove triple "reelt" repetition; sharpen symptom/solution framing
UPDATE public.questions
SET content = jsonb_set(content, '{review_text}', to_jsonb($RT$Apati er ikke personlighedstræk — det er et rationelt svar. Når alle partier siger det samme, er marginaldifferencen lav. Når politiske processer er ekspertdominerede og uigennemsigtige, virker deltagelse meningsløs. Scepticisme er rationel, ikke problematisk. Politisk apati er demokratiets symptom — ikke dets kerne-problem. At løse den kræver at løse det den er et svar på: reelt valg, responsivt styre, mærkbare konsekvenser.$RT$::text))
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvorfor gider mange unge ikke engagere sig politisk — er det egentlig deres skyld?';
