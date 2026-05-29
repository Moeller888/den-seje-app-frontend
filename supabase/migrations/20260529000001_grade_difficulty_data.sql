-- Section 70 — Grade-Level Architecture & Adaptive Difficulty
-- Part 2: Data population
-- Sets target_grade and difficulty_band on all 40 Democracy & Power questions.
--
-- target_grade: minimum grade (7=all grades, 8=grades 8-9, 9=grade 9 only)
-- difficulty_band: conceptual difficulty 1 (easiest) to 5 (hardest)
--
-- Grade 7 pool: 8 questions (dp_005, dp_007, dp_013, dp_014, dp_019, dp_021, dp_034, dp_036)
-- Grade 8 pool: 17 questions (grade 7 + dp_001, dp_004, dp_010, dp_011, dp_016, dp_017, dp_023, dp_030, dp_031)
-- Grade 9 pool: 40 questions (all)

-- dp_001 → grade 8, band 3
UPDATE public.questions
SET target_grade = 8, difficulty_band = 3
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er den vigtigste forskel på en demokratisk leder og en autokrat?';

-- dp_002 → grade 9, band 4
UPDATE public.questions
SET target_grade = 9, difficulty_band = 4
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvorfor kan et demokrati lovligt gennemføre uretfærdige love?';

-- dp_003 → grade 9, band 4
UPDATE public.questions
SET target_grade = 9, difficulty_band = 4
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er forskellen på formel magt og reel magt i et demokrati?';

-- dp_004 → grade 8, band 3
UPDATE public.questions
SET target_grade = 8, difficulty_band = 3
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad sker der med demokratiet, når mange vælger ikke at stemme?';

-- dp_005 → grade 7, band 3
UPDATE public.questions
SET target_grade = 7, difficulty_band = 3
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er det primære formål med magtadskillelse i et demokrati?';

-- dp_006 → grade 9, band 5
UPDATE public.questions
SET target_grade = 9, difficulty_band = 5
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvorfor kan ytringsfrihed og beskyttelse mod hadefuld tale eksistere som samtidige rettigheder?';

-- dp_007 → grade 7, band 3
UPDATE public.questions
SET target_grade = 7, difficulty_band = 3
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad gør propaganda mest effektiv?';

-- dp_008 → grade 9, band 5
UPDATE public.questions
SET target_grade = 9, difficulty_band = 5
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvorfor reproducerer revolutioner ofte de magtstrukturer de omvæltede?';

-- dp_009 → grade 9, band 4
UPDATE public.questions
SET target_grade = 9, difficulty_band = 4
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvornår er civil ulydighed legitim i et demokrati?';

-- dp_010 → grade 8, band 4
UPDATE public.questions
SET target_grade = 8, difficulty_band = 4
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er det mest præcise mål for et demokratis styrke?';

-- dp_011 → grade 8, band 3
UPDATE public.questions
SET target_grade = 8, difficulty_band = 3
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvornår er domstolenes uafhængighed mest truet?';

-- dp_012 → grade 9, band 4
UPDATE public.questions
SET target_grade = 9, difficulty_band = 4
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er den vigtigste svaghed ved repræsentativt demokrati?';

-- dp_013 → grade 7, band 3
UPDATE public.questions
SET target_grade = 7, difficulty_band = 3
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er "gratis-rider-problemet" i demokratisk kontekst?';

-- dp_014 → grade 7, band 2
UPDATE public.questions
SET target_grade = 7, difficulty_band = 2
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad adskiller journalistik fra propaganda?';

-- dp_015 → grade 9, band 5
UPDATE public.questions
SET target_grade = 9, difficulty_band = 5
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Kan en lille gruppe rige mennesker reelt bestemme i et demokrati — selvom alle har en stemme?';

-- dp_016 → grade 8, band 2
UPDATE public.questions
SET target_grade = 8, difficulty_band = 2
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad giver egentlig en politisk leder retten til at bestemme?';

-- dp_017 → grade 8, band 3
UPDATE public.questions
SET target_grade = 8, difficulty_band = 3
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er det konkrete problem med at samle politi og anklagemyndighed under én minister?';

-- dp_018 → grade 9, band 4
UPDATE public.questions
SET target_grade = 9, difficulty_band = 4
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad gør parlamentarisk kontrol effektiv?';

-- dp_019 → grade 7, band 2
UPDATE public.questions
SET target_grade = 7, difficulty_band = 2
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er forskellen på borgerrettigheder og menneskerettigheder?';

-- dp_020 → grade 9, band 4
UPDATE public.questions
SET target_grade = 9, difficulty_band = 4
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er det konkrete problem med at lade markedet bestemme over kollektive goder som rent vand eller national forsvar?';

-- dp_021 → grade 7, band 3
UPDATE public.questions
SET target_grade = 7, difficulty_band = 3
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er et ekkokammer — og hvad er den primære mekanisme der skaber det?';

-- dp_022 → grade 9, band 5
UPDATE public.questions
SET target_grade = 9, difficulty_band = 5
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Kan en leder der kom til magten ulovligt alligevel regere legitimt?';

-- dp_023 → grade 8, band 3
UPDATE public.questions
SET target_grade = 8, difficulty_band = 3
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvorfor kan man ikke bare lade alle borgere stemme om alle beslutninger i et land som Danmark?';

-- dp_024 → grade 9, band 5
UPDATE public.questions
SET target_grade = 9, difficulty_band = 5
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Kan et flertal undertrykke en minoritet — uden at en eneste lov forbyder noget?';

-- dp_025 → grade 9, band 5
UPDATE public.questions
SET target_grade = 9, difficulty_band = 5
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvornår er whistleblowing moralsk forpligtende — frem for blot moralsk tilladt?';

-- dp_026 → grade 9, band 4
UPDATE public.questions
SET target_grade = 9, difficulty_band = 4
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvornår er det populisme — og hvornår er det bare at kritisere de der har magten?';

-- dp_027 → grade 9, band 4
UPDATE public.questions
SET target_grade = 9, difficulty_band = 4
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er det tidligste advarselstegn på at et demokrati er ved at erodere?';

-- dp_028 → grade 9, band 4
UPDATE public.questions
SET target_grade = 9, difficulty_band = 4
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvornår udgør koncentration af medieejerskab en specifik demokratisk trussel?';

-- dp_029 → grade 9, band 4
UPDATE public.questions
SET target_grade = 9, difficulty_band = 4
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er det egentlige demokratiske problem med sociale medier — udover at de spreder falske nyheder?';

-- dp_030 → grade 8, band 3
UPDATE public.questions
SET target_grade = 8, difficulty_band = 3
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er det egentlige demokratiske formål med fagforeninger, sportsklubber og frivillige organisationer?';

-- dp_031 → grade 8, band 3
UPDATE public.questions
SET target_grade = 8, difficulty_band = 3
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad gør en forfatning til mere end et stykke papir?';

-- dp_032 → grade 9, band 5
UPDATE public.questions
SET target_grade = 9, difficulty_band = 5
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Uvalgte dommere kan ophæve love vedtaget af den folkevalgte regering. Er det demokratisk?';

-- dp_033 → grade 9, band 4
UPDATE public.questions
SET target_grade = 9, difficulty_band = 4
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvornår er politiske partier afgørende for demokratiet — og hvornår truer de det?';

-- dp_034 → grade 7, band 2
UPDATE public.questions
SET target_grade = 7, difficulty_band = 2
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er den vigtige forskel på desinformation og misinformation?';

-- dp_035 → grade 9, band 4
UPDATE public.questions
SET target_grade = 9, difficulty_band = 4
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er den afgørende faktor for om et demokrati overlever en alvorlig krise?';

-- dp_036 → grade 7, band 2
UPDATE public.questions
SET target_grade = 7, difficulty_band = 2
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvad er forskellen på at have formelt statsborgerskab og at være aktiv demokratisk deltager?';

-- dp_037 → grade 9, band 4
UPDATE public.questions
SET target_grade = 9, difficulty_band = 4
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Er lobbyisme nødvendigvis skadelig for demokratiet?';

-- dp_038 → grade 9, band 4
UPDATE public.questions
SET target_grade = 9, difficulty_band = 4
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvorfor er der i mange demokratier en grænse for, hvor mange år en leder kan sidde?';

-- dp_039 → grade 9, band 4
UPDATE public.questions
SET target_grade = 9, difficulty_band = 4
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Hvorfor gider mange unge ikke engagere sig politisk — er det egentlig deres skyld?';

-- dp_040 → grade 9, band 5
UPDATE public.questions
SET target_grade = 9, difficulty_band = 5
WHERE metadata->>'domain' = 'democracy_power'
  AND content->>'question' = 'Kan internationale institutioner som EU underminere nationalt demokrati?';
