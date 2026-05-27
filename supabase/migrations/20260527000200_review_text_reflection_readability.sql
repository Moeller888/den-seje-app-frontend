-- Section 56 — Review Text Reflection Readability Pass
-- Final polish: 5 targeted review_text fixes after the Section 53 youth-near rewrite.
-- Section 53 did the major rewrites. Section 56 does final compression and jargon removal.
--
-- Issues addressed:
--   dp_026: 8 sentences → 6 (over the 6-sentence canonical limit)
--   dp_029: last sentence jargon ("institutionelle incitamenter diskriminerer") → plain language
--   dp_033: 7 sentences → 6 (over limit); "valgbarhedstærskler" → "Stemmetærskler"
--   dp_037: 8 sentences → 6 (over limit); last 3 forbud-sentences → 1
--   dp_038: "Franklins" → "Roosevelts" (vague reference); opener "institutionel kapring" → "magtakkumulering";
--           grammar fix: question text "kan sidder" → "kan sidde" (infinitive)
--
-- Rollback: re-run the relevant UPDATE blocks from 20260527000100_democracy_power_youth_near_rewrite.sql

-- dp_026: 8 sentences → 6 — trim while keeping the key insight about populism's homogeneity demand
UPDATE public.questions
SET content = $${"question":"Hvornår er det populisme — og hvornår er det bare at kritisere de der har magten?","options":["Populisme er ulovlig politisk mobilisering — demokratisk kritik er lovlig","Populisme opdeler samfundet i 'det ægte folk' mod 'eliten' — kritik udfordrer konkrete beslutninger inden for et fælles system","Populisme har altid ekstremistiske politiske mål","Populisme er altid antidemokratisk"],"correct":"Populisme opdeler samfundet i 'det ægte folk' mod 'eliten' — kritik udfordrer konkrete beslutninger inden for et fælles system","review_text":"Populisme er ikke en politik — det er en fortællestruktur. Den opdeler alt i to rene blokke: 'det ægte folk' og 'den korrupte elite'. Demokratiet er bygget på at folk er uenige — og at alle parters interesser er legitime. Populisme kræver det modsatte: er du uenig med folkets vilje, forråder du folket. Det gør kompromis til forræderi og opposition til fjendtlighed. Og det nedbryder den tillid der holder demokratiet kørende — også når din side taber."}$$::jsonb
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvornår er det populisme — og hvornår er det bare at kritisere de der har magten?';

-- dp_029: fix last sentence jargon — "De institutionelle incitamenter diskriminerer mod demokratiets
-- kommunikationsform" → plain language that lands the same insight without academic noun-stacking
UPDATE public.questions
SET content = $${"question":"Hvad er det egentlige demokratiske problem med sociale medier — udover at de spreder falske nyheder?","options":["Sociale medier spreder misinformation der erstatter faktuel viden","Folk bruger for meget tid på underholdning og for lidt på politik","Sociale medier er for nemme at manipulere af udenlandske aktører","Platforme belønner emotionel og polariserende kommunikation frem for nuanceret argumentation, fordi det genererer mere engagement"],"correct":"Platforme belønner emotionel og polariserende kommunikation frem for nuanceret argumentation, fordi det genererer mere engagement","review_text":"Problemet er ikke de falske nyheder. Det er selve arkitekturen. Platforme er bygget til at maksimere engagement — og det der engagerer mest er outrage, identitetsmarkering og bekræftelse. En præcis, nuanceret analyse genererer færre reaktioner end et skarpt partisanopslag. Resultatet er ikke et informationsproblem — det er et problem med samtalen selv. Platformene belønner skarphed og straffer nuance: det modsatte af hvad demokratisk debat kræver."}$$::jsonb
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er det egentlige demokratiske problem med sociale medier — udover at de spreder falske nyheder?';

-- dp_033: 7 sentences → 6 — merge the three-line opener into one punchy sentence;
-- simplify "valgbarhedstærskler, medieregler, offentlig partifinansiering" → readable list
UPDATE public.questions
SET content = $${"question":"Hvornår er politiske partier afgørende for demokratiet — og hvornår truer de det?","options":["Partier er altid gavnlige fordi de organiserer politisk deltagelse i skala","Partier truer altid demokratiet fordi de skaber partisan loyalitet frem for saglig vurdering","Partier er afgørende når de aggregerer interesser og koordinerer — de truer demokratiet når de danner karteller der fastsætter regler der beskytter dem mod ny konkurrence","Partier er primært truende i flerpartisystemer der producerer politisk instabilitet"],"correct":"Partier er afgørende når de aggregerer interesser og koordinerer — de truer demokratiet når de danner karteller der fastsætter regler der beskytter dem mod ny konkurrence","review_text":"Partier er uundværlige og farlige på én gang. Et politisk parti samler borgere med sammenfaldende interesser og muliggør politisk handling i skala — uden dem er demokratisk koordination umulig. Men modne partisystemer kan degenerere til karteller: etablerede partier aftaler regler der gør det svært for udfordrere at komme ind. Stemmetærskler, medieregler, offentlig finansiering der favoriserer dem der allerede er der. Ikke nødvendigvis korruption. Et sundt demokrati kræver partier — og mekanismer der holder dem konkurrenceudsatte."}$$::jsonb
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvornår er politiske partier afgørende for demokratiet — og hvornår truer de det?';

-- dp_037: 8 sentences → 6 — merge the three closing "forbud" sentences into one;
-- removes "institutionel modvægt" (jargon) without losing the argument
UPDATE public.questions
SET content = $${"question":"Er lobbyisme nødvendigvis skadelig for demokratiet?","options":["Ja — lobbyisme giver organiserede interesser uforholdsmæssig indflydelse","Ja — kun vælgernes stemme bør forme politiske beslutninger","Nej — lobbyisme er blot erhvervslivets ytringsfrihed","Nej — lobbyisme er en form for politisk deltagelse der kan informere beslutningstagere, men asymmetrien kræver regulering og transparens"],"correct":"Nej — lobbyisme er en form for politisk deltagelse der kan informere beslutningstagere, men asymmetrien kræver regulering og transparens","review_text":"En patientforening der informerer parlamentarikere om konsekvenserne af et sundhedslovforslag. En tobaksindustri der ansætter konsulenter til at forsinke videnskabeligt begrundet regulering. Begge er lobbyisme. Problemet er asymmetrien: velfinansierede interesser kan lobbye kontinuerligt og professionelt; diffuse offentlige interesser kan det ikke. Løsningen er regulering og transparens — ikke forbud. Et forbud ville flytte indflydelsen til uofficielle kanaler og gøre den usynlig, ikke eliminere den."}$$::jsonb
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Er lobbyisme nødvendigvis skadelig for demokratiet?';

-- dp_038: (1) fix grammar typo in question text: "kan sidder" → "kan sidde" (infinitive)
--         (2) opener: "institutionel kapring" → "magtakkumulering" (less academic)
--         (3) "Franklins fire præsidentvalg" → "Roosevelts fire præsidentvalg" (unambiguous reference)
UPDATE public.questions
SET content = $${"question":"Hvorfor er der i mange demokratier en grænse for, hvor mange år en leder kan sidde?","options":["For at sikre at nye perspektiver kontinuerligt introduceres i politikken","Det er et demokratisk princip om at magt regelmæssigt bør cirkulere","For at forhindre populære ledere i at akkumulere for stor folkelig støtte","Det reducerer incitamentet til at kapre institutioner — gevinsten begrænses af tidsrammen"],"correct":"Det reducerer incitamentet til at kapre institutioner — gevinsten begrænses af tidsrammen","review_text":"Tidsbegrænsning handler ikke om at bringe variation — det handler om at reducere magtakkumulering. En leder der ved de kun sidder i otte år og ikke kan sidde i tolv, har færre incitamenter til at cementere personlig magt permanent. En leder uden tidsbegrænsning har alle incitamenter til at investere i at kontrollere de institutioner der skulle kontrollere dem. Roosevelts fire præsidentvalg — dog under ekstraordinære omstændigheder — førte direkte til det tillæg der begrænsede fremtidige præsidenter. Argumentet er ikke at magt korrumperer mennesker. Det er at magt skaber de incitamenter der korrumperer systemer."}$$::jsonb
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvorfor er der i mange demokratier en grænse for, hvor mange år en leder kan sidder?';
