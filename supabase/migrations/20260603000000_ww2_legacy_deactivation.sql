-- Section 119B — World War 2 Legacy Deactivation Sprint
-- Deactivates all 34 legacy WW2 questions identified and audited in Section 119A.
--
-- Audit verdict: DEACTIVATE all 34 (unanimous — no KEEP, no MERGE)
-- Reasons: no review_text, pure recall format, date/country memorisation,
--          duplicate concepts, text-entry format, below current curriculum standard.
--
-- No records deleted. is_active = false preserves records for audit trail.
-- Expected outcome: world_war_2 active count 172 → 138, B1+B2 share 53% → 45%.

UPDATE public.questions
SET is_active = false
WHERE id IN (
  -- B1 / Grade 7 (10 questions)
  '06963c9f-903a-4381-806a-1d8e5635129d', -- "Hvilket år blev Danmark besat af Tyskland?"
  '2009619a-353d-42bd-9260-b70edd968df4', -- "Hvilket land kæmpede mod Tyskland på Østfronten?"
  '2e018356-68f6-412b-8f7c-055044c4bfca', -- "Hvilket land blev angrebet ved Pearl Harbor?"
  '3dd9d299-1a3d-4771-b9a8-ce27e8e994c9', -- "Hvilket år sluttede Anden Verdenskrig i Europa?"
  '9196283c-313f-4b52-ba11-303400d53576', -- "Hvornår begyndte Anden Verdenskrig?"
  'a0f8b848-2ab7-43db-a4b0-71e3045a7806', -- "Hvilket land ledede Benito Mussolini under 2. verdenskrig?"
  'a7af99d8-bb50-4234-8ecc-9651d1df8019', -- "Hvilket land kæmpede sammen med Storbritannien i begyndelsen mod Tyskland?"
  'b27ebef9-6d47-4118-afd7-de4f00369770', -- "Hvem var Tysklands leder under krigen?"
  'b88f169a-f959-4d8b-bc9b-846fb36017fb', -- "Hvilket land invaderede Tyskland 1. september 1939?"
  'd1fd9060-4d26-425a-a6b4-90f393be146c', -- "Hvilket land var Adolf Hitler leder af?"

  -- B2 / Grade 7 (8 questions)
  '06e02cbf-b27f-4a00-bdc7-9c67e27e0f09', -- "Hvad hed alliancen mellem Tyskland, Italien og Japan?"
  '13d91b14-6dad-4825-8905-04a3b1ae9a16', -- "Hvilket år blev FN oprettet?"
  '234d1158-5f26-4861-80e9-fe726402334e', -- "Hvad år startede Slaget om Storbritannien?"
  '5f1e275c-2a32-40a9-877d-2d12a14c4753', -- "Hvilket år skiftede Italien alliance under Anden Verdenskrig?"
  'b39678e2-c659-49ab-bf58-fe94aff5f80e', -- "Hvilket land blev invaderet af Tyskland i april 1940 sammen med Danmark?"
  'bfd4e13c-2d0f-4c2a-9e64-a93b2caf27b5', -- "Hvor mange år varede Anden Verdenskrig i Europa?"
  'c5ecf0d2-1ea1-4b9d-8ea6-917f65fedf80', -- "Hvilket år begyndte Anden Verdenskrig med Tysklands invasion af Frankrig…?"
  'd02db9bf-6e42-44e4-ae35-39966b6a4f96', -- "Hvilket land blev invaderet af Tyskland i maj 1940 som en del af Vestoffensiven?"

  -- B2 / Grade 8 (11 questions)
  '09d85bd8-f8db-4a3e-a203-54fde2c46e1b', -- "Hvilket år blev Berlin indtaget af de allierede?"
  '1c193e44-bfd7-4c91-94e4-9b70e0cb1008', -- "Hvad var udfaldet af Slaget om England i 1940?"
  '45663f43-fd77-47a6-bc44-53a4f6f9584f', -- "Hvilket land blev invaderet under Operation Barbarossa?"
  '71b38cd8-2bfd-4e0a-ae87-d84b1308fdaf', -- "Hvornår begyndte Operation Overlord?"
  'a0a6058e-b07c-46f9-9881-35ac5a87d0a0', -- "Hvilket land invaderede de allierede gennem Operation Overlord?"
  'a5d54f61-cf01-497a-b74c-eae41b997916', -- "Hvilket slag fandt sted i 1944 og førte til de allieredes landgang i Frankrig?"
  'ae576bbe-9c7f-465e-929f-5455bef90688', -- "Hvilket år begyndte Operation Barbarossa?"
  'b2176d68-dfb7-44e9-9e76-5f7aa20a50fa', -- "Hvilket land skiftede side og kæmpede mod Tyskland fra 1943?"
  'e027b23a-538b-463b-90df-0eb7481b2f9c', -- "Hvilken rolle havde Dwight D. Eisenhower under Operation Overlord?"
  'e97ac377-884e-41d3-a868-f8ebda5cc6ad', -- "Hvilket land blev befriet ved D-dag i 1944?"
  'fdd94868-dfe5-4dfa-85e8-c23326351e04', -- "I hvilket land lå slaget ved Kursk under 2. verdenskrig?"

  -- B3 / Grade 8 (2 questions)
  'c037d436-bea4-40f5-8f10-ee758c126c6d', -- "Hvilket slag i 1942–43 regnes som et afgørende vendepunkt på Østfronten?"
  'd0a6a400-d786-4ac2-8c8c-f1a7851629a7', -- "Hvilket slag i Nordafrika blev et vendepunkt mod Tyskland i 1942?"

  -- B3 / Grade 9 (3 questions)
  '83cb5400-83d3-4d84-8512-3bda09ce1d97', -- "Hvad hed aftalen mellem Tyskland og Sovjetunionen i 1939?"
  '907ec855-e29e-4d0b-ae14-c6e2f4787d82', -- "I hvilket år blev Rom–Berlin-aksen politisk erklæret?"
  'c36937c7-56e2-486d-a93b-917aace5a0f3'  -- "Hvornår begyndte Operation Torch?"
);
