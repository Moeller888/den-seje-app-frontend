-- Section 73 — Legacy Question Audit & Migration Sprint
-- WW2 domain recovery: 43 questions classified, 29 retired
-- Converts dead-weight legacy content into adaptive-ready world_war_2 domain
-- Total DB after: 113 questions, 0 unclassified

-- ─── PART 1: RETIRE 29 DUPLICATE / LOW-QUALITY QUESTIONS ──────────────────
-- Remove question_instances first to avoid FK constraint violations

DELETE FROM public.question_instances
WHERE question_id IN (
  'ae60bbea-789c-435f-9d3a-a798a9fcc86a',
  'fcc28274-8a83-4ec1-a4fe-555b73415f37',
  'ff04f29a-69b0-4fe7-9af8-d94f31997d67',
  'e1cb522f-aa3e-47ea-9f17-aeb16a435184',
  '29c72e16-c4da-4a8b-9532-1af08ce764d8',
  '5b4357b9-9e87-4a3e-8dc7-ac4203b8c582',
  '794857e7-2835-4703-a2ec-c38f118fafe1',
  '158862bf-6d6b-4db3-8f9f-5b12a6e2e8e2',
  '5877db83-08ce-4743-8e1e-32003d120ec7',
  '0d0720c2-96a8-4cf2-bf3f-5e9d663c4551',
  '09e77a30-98d4-4039-98ff-1a513972af89',
  'c5165a86-8bc0-471c-baee-ac60dcb59286',
  '3a52faca-2bc1-48b7-bb93-f26da0d361ba',
  '0eda5de4-fc7b-48ec-b8a4-b9aacf3a2cd3',
  '11dbdaaa-51db-4041-b8dd-f8d3e1ec7da0',
  '9298bf4e-6f00-41bd-993b-90b0c013250d',
  '7c082449-f6a7-45f5-9917-2dbfb00ae26f',
  'd6fe6b4a-3512-4582-aa2f-e4d59027070b',
  '30d3a9b1-bbea-4b1c-b62c-8b94ebb5b9bd',
  '08d34ac9-8f1d-4233-8a04-4ec0ceeb482f',
  '9b79c22a-3a09-4911-819b-18f4d23385c6',
  'e7085189-6821-482e-8695-999706f1814c',
  '42527058-d5c7-46ec-aa97-ba85a5ff421d',
  'e32947cd-9993-401d-906b-208abfbc527d',
  'ed8ee772-2235-40f4-9457-a40736ba25b3',
  '6049a11f-63fd-4e94-afd0-d7239e2e7411',
  '869ca2d3-f21e-451e-9566-aebbf66ef846',
  'bf38ffac-730f-4d06-99ad-3de0bcf4fe4e',
  'a4fed64b-3ba2-4d1a-aacb-78deca047ff0'
);

DELETE FROM public.questions
WHERE id IN (
  'ae60bbea-789c-435f-9d3a-a798a9fcc86a',
  'fcc28274-8a83-4ec1-a4fe-555b73415f37',
  'ff04f29a-69b0-4fe7-9af8-d94f31997d67',
  'e1cb522f-aa3e-47ea-9f17-aeb16a435184',
  '29c72e16-c4da-4a8b-9532-1af08ce764d8',
  '5b4357b9-9e87-4a3e-8dc7-ac4203b8c582',
  '794857e7-2835-4703-a2ec-c38f118fafe1',
  '158862bf-6d6b-4db3-8f9f-5b12a6e2e8e2',
  '5877db83-08ce-4743-8e1e-32003d120ec7',
  '0d0720c2-96a8-4cf2-bf3f-5e9d663c4551',
  '09e77a30-98d4-4039-98ff-1a513972af89',
  'c5165a86-8bc0-471c-baee-ac60dcb59286',
  '3a52faca-2bc1-48b7-bb93-f26da0d361ba',
  '0eda5de4-fc7b-48ec-b8a4-b9aacf3a2cd3',
  '11dbdaaa-51db-4041-b8dd-f8d3e1ec7da0',
  '9298bf4e-6f00-41bd-993b-90b0c013250d',
  '7c082449-f6a7-45f5-9917-2dbfb00ae26f',
  'd6fe6b4a-3512-4582-aa2f-e4d59027070b',
  '30d3a9b1-bbea-4b1c-b62c-8b94ebb5b9bd',
  '08d34ac9-8f1d-4233-8a04-4ec0ceeb482f',
  '9b79c22a-3a09-4911-819b-18f4d23385c6',
  'e7085189-6821-482e-8695-999706f1814c',
  '42527058-d5c7-46ec-aa97-ba85a5ff421d',
  'e32947cd-9993-401d-906b-208abfbc527d',
  'ed8ee772-2235-40f4-9457-a40736ba25b3',
  '6049a11f-63fd-4e94-afd0-d7239e2e7411',
  '869ca2d3-f21e-451e-9566-aebbf66ef846',
  'bf38ffac-730f-4d06-99ad-3de0bcf4fe4e',
  'a4fed64b-3ba2-4d1a-aacb-78deca047ff0'
);

-- ─── PART 2: CLASSIFY 43 RECOVERED QUESTIONS ────────────────────────────────
-- Assigns: target_grade, difficulty_band, metadata (domain, misconception_type,
--          cognitive_skill, difficulty_type, insight_type, challenge_role)

-- ── Grade 7, Band 1 ──
-- Hvornår begyndte Anden Verdenskrig?
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 1,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement"}'::jsonb
WHERE id = '9196283c-313f-4b52-ba11-303400d53576';

-- Hvilket år blev Danmark besat af Tyskland?
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 1,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement"}'::jsonb
WHERE id = '06963c9f-903a-4381-806a-1d8e5635129d';

-- I hvilket år begyndte D-dag under Anden Verdenskrig?
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 1,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement"}'::jsonb
WHERE id = '89396d88-2bd0-4484-b51c-1eeda36672c2';

-- Hvilket år sluttede Anden Verdenskrig i Europa?
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 1,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement"}'::jsonb
WHERE id = '3dd9d299-1a3d-4771-b9a8-ce27e8e994c9';

-- Hvem var Tysklands leder under krigen?
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 1,
  metadata = '{"domain":"world_war_2","misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'b27ebef9-6d47-4118-afd7-de4f00369770';

-- Hvilket land var Adolf Hitler leder af?
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 1,
  metadata = '{"domain":"world_war_2","misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'd1fd9060-4d26-425a-a6b4-90f393be146c';

-- Hvilket land kæmpede mod Tyskland på Østfronten?
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 1,
  metadata = '{"domain":"world_war_2","misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement"}'::jsonb
WHERE id = '2009619a-353d-42bd-9260-b70edd968df4';

-- Hvilket land blev angrebet ved Pearl Harbor?
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 1,
  metadata = '{"domain":"world_war_2","misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement"}'::jsonb
WHERE id = '2e018356-68f6-412b-8f7c-055044c4bfca';

-- Hvilket land ledede Benito Mussolini under 2. verdenskrig?
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 1,
  metadata = '{"domain":"world_war_2","misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'a0f8b848-2ab7-43db-a4b0-71e3045a7806';

-- Hvilket land kæmpede sammen med Storbritannien i begyndelsen
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 1,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'a7af99d8-bb50-4234-8ecc-9651d1df8019';

-- Hvilket land invaderede Tyskland 1. september 1939?
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 1,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'b88f169a-f959-4d8b-bc9b-846fb36017fb';

-- ── Grade 7, Band 2 ──
-- Hvad hed alliancen mellem Tyskland, Italien og Japan?
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = '06e02cbf-b27f-4a00-bdc7-9c67e27e0f09';

-- Hvilket år blev FN oprettet?
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = '13d91b14-6dad-4825-8905-04a3b1ae9a16';

-- Hvilket år skiftede Italien alliance under Anden Verdenskrig
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = '5f1e275c-2a32-40a9-877d-2d12a14c4753';

-- Hvad år startede Slaget om Storbritannien?
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = '234d1158-5f26-4861-80e9-fe726402334e';

-- Hvilket land blev invaderet af Tyskland i april 1940 sammen 
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"scope_confusion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'b39678e2-c659-49ab-bf58-fe94aff5f80e';

-- Hvor mange år varede Anden Verdenskrig i Europa?
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"causal_inversion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'bfd4e13c-2d0f-4c2a-9e64-a93b2caf27b5';

-- Hvilket år begyndte Anden Verdenskrig med Tysklands invasion
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'c5ecf0d2-1ea1-4b9d-8ea6-917f65fedf80';

-- Hvilket land blev invaderet af Tyskland i maj 1940 som en de
UPDATE public.questions SET
  target_grade = 7, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"scope_confusion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'd02db9bf-6e42-44e4-ae35-39966b6a4f96';

-- ── Grade 8, Band 2 ──
-- ae576bbe-00ac-4ed2-b773-1f7bc5538095
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'ae576bbe-00ac-4ed2-b773-1f7bc5538095';

-- I hvilket år fandt angrebet på Pearl Harbor sted, som marker
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'b46a54e2-221a-49e8-b0c7-23857ac3deb3';

-- I hvilket år begyndte slaget om Stalingrad under Anden Verde
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = '28b1ac82-92f6-4baf-b14d-d97180736eb5';

-- I hvilket år begyndte Slaget ved Midway under Anden Verdensk
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = '5a1bd120-5df7-4042-8878-7d32b27c3240';

-- I hvilket år fandt det danske modstandsbevægelses store vend
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"causal_inversion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = '5bbc17ae-00ac-4ed2-b773-1f7bc5538095';

-- Hvilket år fandt Teherankonferencen sted under Anden Verdens
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'dac73291-c73c-47a0-8514-b0469d34ddd8';

-- I hvilket år begyndte Slaget ved Ardennerne (Battle of the B
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'c370d20d-fdf3-453d-92d3-dafa10aa8fa9';

-- Hvornår begyndte Operation Overlord?
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = '71b38cd8-2bfd-4e0a-ae87-d84b1308fdaf';

-- Hvilket år blev Berlin indtaget af de allierede?
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = '09d85bd8-f8db-4a3e-a203-54fde2c46e1b';

-- I hvilket år fandt Potsdam-konferencen sted under Anden Verd
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'e1441657-8e58-4d7a-be24-0362164a7f58';

-- I hvilket år begyndte slaget ved Kursk under Anden Verdenskr
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"scope_confusion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = '3e6be961-13fe-4d9e-bc36-73cd6c480683';

-- Hvilket land blev invaderet under Operation Barbarossa?
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = '45663f43-fd77-47a6-bc44-53a4f6f9584f';

-- Hvilket land skiftede side og kæmpede mod Tyskland fra 1943?
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"causal_inversion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'b2176d68-dfb7-44e9-9e76-5f7aa20a50fa';

-- Hvilken rolle havde Dwight D. Eisenhower under Operation Ove
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'e027b23a-538b-463b-90df-0eb7481b2f9c';

-- Hvilket land invaderede de allierede gennem Operation Overlo
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'a0a6058e-b07c-46f9-9881-35ac5a87d0a0';

-- Hvilket slag fandt sted i 1944 og førte til de allieredes la
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'a5d54f61-cf01-497a-b74c-eae41b997916';

-- Hvilket land blev befriet ved D-dag i 1944?
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'e97ac377-884e-41d3-a868-f8ebda5cc6ad';

-- Hvad var udfaldet af Slaget om England i 1940?
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"causal_inversion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = '1c193e44-bfd7-4c91-94e4-9b70e0cb1008';

-- I hvilket land lå slaget ved Kursk under 2. verdenskrig?
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 2,
  metadata = '{"domain":"world_war_2","misconception_type":"scope_confusion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement"}'::jsonb
WHERE id = 'fdd94868-dfe5-4dfa-85e8-c23326351e04';

-- ── Grade 8, Band 3 ──
-- Hvilket slag i 1942–43 regnes som et afgørende vendepunkt på
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 3,
  metadata = '{"domain":"world_war_2","misconception_type":"causal_inversion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge"}'::jsonb
WHERE id = 'c037d436-bea4-40f5-8f10-ee758c126c6d';

-- Hvilket slag i Nordafrika blev et vendepunkt mod Tyskland i 
UPDATE public.questions SET
  target_grade = 8, difficulty_band = 3,
  metadata = '{"domain":"world_war_2","misconception_type":"causal_inversion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge"}'::jsonb
WHERE id = 'd0a6a400-d786-4ac2-8c8c-f1a7851629a7';

-- ── Grade 9, Band 3 ──
-- Hvad hed aftalen mellem Tyskland og Sovjetunionen i 1939?
UPDATE public.questions SET
  target_grade = 9, difficulty_band = 3,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge"}'::jsonb
WHERE id = '83cb5400-83d3-4d84-8512-3bda09ce1d97';

-- I hvilket år blev Rom–Berlin-aksen politisk erklæret?
UPDATE public.questions SET
  target_grade = 9, difficulty_band = 3,
  metadata = '{"domain":"world_war_2","misconception_type":"surface_association","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge"}'::jsonb
WHERE id = '907ec855-e29e-4d0b-ae14-c6e2f4787d82';

-- Hvornår begyndte Operation Torch?
UPDATE public.questions SET
  target_grade = 9, difficulty_band = 3,
  metadata = '{"domain":"world_war_2","misconception_type":"scope_confusion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge"}'::jsonb
WHERE id = 'c36937c7-56e2-486d-a93b-917aace5a0f3';

