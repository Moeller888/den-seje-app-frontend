// Reads legacy_questions.json, applies classification decisions,
// and writes supabase/migrations/20260529000003_legacy_question_migration.sql

import { readFileSync, writeFileSync } from 'fs';

const raw = readFileSync('./legacy_questions.json', 'utf-8');
// First line is "Legacy questions: 72", rest is JSON
const jsonStart = raw.indexOf('[');
const data = JSON.parse(raw.slice(jsonStart));

// ─── CLASSIFICATION DECISIONS ───────────────────────────────────────────────
// Domain: world_war_2 for all
// Audit criteria:
//   RETIRE: duplicates, encoding errors, long-text (unsuitable format), inactive duplicates
//   KEEP: unique educational value, MC questions, unique date questions

const RETIRE = new Set([
  // Duplicate WW2 start 1939
  'ae60bbea-789c-435f-9d3a-a798a9fcc86a',
  'fcc28274-8a83-4ec1-a4fe-555b73415f37',
  'ff04f29a-69b0-4fe7-9af8-d94f31997d67',
  'e1cb522f-aa3e-47ea-9f17-aeb16a435184',
  // Duplicate Denmark invasion 1940
  '29c72e16-c4da-4a8b-9532-1af08ce764d8',
  '5b4357b9-9e87-4a3e-8dc7-ac4203b8c582',
  '794857e7-2835-4703-a2ec-c38f118fafe1',
  '158862bf-6d6b-4db3-8f9f-5b12a6e2e8e2',
  // Duplicate WW2 end Europe 1945
  '5877db83-08ce-4743-8e1e-32003d120ec7',
  '0d0720c2-96a8-4cf2-bf3f-5e9d663c4551',
  '09e77a30-98d4-4039-98ff-1a513972af89',
  'c5165a86-8bc0-471c-baee-ac60dcb59286',
  // Duplicate Berlin 1945
  '3a52faca-2bc1-48b7-bb93-f26da0d361ba',
  '0eda5de4-fc7b-48ec-b8a4-b9aacf3a2cd3',
  // Duplicate D-dag 1944
  '11dbdaaa-51db-4041-b8dd-f8d3e1ec7da0',
  '9298bf4e-6f00-41bd-993b-90b0c013250d',
  // Duplicate Pearl Harbor year
  '7c082449-f6a7-45f5-9917-2dbfb00ae26f',
  // Duplicate Kursk year
  'd6fe6b4a-3512-4582-aa2f-e4d59027070b',
  // Duplicate Danish resistance 1943 (4 of 5 variants)
  '30d3a9b1-bbea-4b1c-b62c-8b94ebb5b9bd',
  '08d34ac9-8f1d-4233-8a04-4ec0ceeb482f',
  '9b79c22a-3a09-4911-819b-18f4d23385c6',
  'e7085189-6821-482e-8695-999706f1814c',
  // Duplicate Denmark occupation end (inactive)
  '42527058-d5c7-46ec-aa97-ba85a5ff421d',
  // Duplicate Tehran conference
  'e32947cd-9993-401d-906b-208abfbc527d',
  // Duplicate Eisenhower/Normandy year
  'ed8ee772-2235-40f4-9457-a40736ba25b3',
  // Encoding error in question text
  '6049a11f-63fd-4e94-afd0-d7239e2e7411',
  // Long text format — unsuitable for current quiz system
  '869ca2d3-f21e-451e-9566-aebbf66ef846',
  'bf38ffac-730f-4d06-99ad-3de0bcf4fe4e',
  // Wrong answer_format for content type
  'a4fed64b-3ba2-4d1a-aacb-78deca047ff0',
]);

// Keep decisions with full metadata assignments
// [id, target_grade, difficulty_band, misconception_type, cognitive_skill, difficulty_type, insight_type, challenge_role]
const KEEP = [
  // ── Grade 7, Band 1 — factual/recall ──────────────────────────────────────
  ['9196283c-313f-4b52-ba11-303400d53576', 7, 1, 'surface_association', 'recall', 'factual', 'conceptual_bridge', 'reinforcement'],
  ['06963c9f-903a-4381-806a-1d8e5635129d', 7, 1, 'surface_association', 'recall', 'factual', 'conceptual_bridge', 'reinforcement'],
  ['89396d88-2bd0-4484-b51c-1eeda36672c2', 7, 1, 'surface_association', 'recall', 'factual', 'conceptual_bridge', 'reinforcement'],
  ['3dd9d299-1a3d-4771-b9a8-ce27e8e994c9', 7, 1, 'surface_association', 'recall', 'factual', 'conceptual_bridge', 'reinforcement'],
  ['b27ebef9-6d47-4118-afd7-de4f00369770', 7, 1, 'false_equivalence',   'recall', 'factual', 'conceptual_bridge', 'reinforcement'],
  ['d1fd9060-4d26-425a-a6b4-90f393be146c', 7, 1, 'false_equivalence',   'recall', 'factual', 'conceptual_bridge', 'reinforcement'],
  ['2009619a-353d-42bd-9260-b70edd968df4', 7, 1, 'false_equivalence',   'recall', 'factual', 'conceptual_bridge', 'reinforcement'],
  ['2e018356-68f6-412b-8f7c-055044c4bfca', 7, 1, 'false_equivalence',   'recall', 'factual', 'conceptual_bridge', 'reinforcement'],
  ['a0f8b848-2ab7-43db-a4b0-71e3045a7806', 7, 1, 'false_equivalence',   'recall', 'factual', 'conceptual_bridge', 'reinforcement'],
  ['a7af99d8-bb50-4234-8ecc-9651d1df8019', 7, 1, 'surface_association', 'recall', 'factual', 'conceptual_bridge', 'reinforcement'],
  ['b88f169a-f959-4d8b-bc9b-846fb36017fb', 7, 1, 'surface_association', 'recall', 'factual', 'conceptual_bridge', 'reinforcement'],
  // ── Grade 7, Band 2 — comprehension ──────────────────────────────────────
  ['06e02cbf-b27f-4a00-bdc7-9c67e27e0f09', 7, 2, 'false_equivalence',   'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['13d91b14-6dad-4825-8905-04a3b1ae9a16', 7, 2, 'surface_association', 'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['5f1e275c-2a32-40a9-877d-2d12a14c4753', 7, 2, 'surface_association', 'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['234d1158-5f26-4861-80e9-fe726402334e', 7, 2, 'surface_association', 'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['b39678e2-c659-49ab-bf58-fe94aff5f80e', 7, 2, 'scope_confusion',     'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['bfd4e13c-2d0f-4c2a-9e64-a93b2caf27b5', 7, 2, 'causal_inversion',   'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['c5ecf0d2-1ea1-4b9d-8ea6-917f65fedf80', 7, 2, 'surface_association', 'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['d02db9bf-6e42-44e4-ae35-39966b6a4f96', 7, 2, 'scope_confusion',     'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  // ── Grade 8, Band 2 — specific operations/events ─────────────────────────
  ['ae576bbe-00ac-4ed2-b773-1f7bc5538095', 8, 2, 'surface_association', 'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['b46a54e2-221a-49e8-b0c7-23857ac3deb3', 8, 2, 'surface_association', 'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['28b1ac82-92f6-4baf-b14d-d97180736eb5', 8, 2, 'surface_association', 'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['5a1bd120-5df7-4042-8878-7d32b27c3240', 8, 2, 'surface_association', 'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['5bbc17ae-00ac-4ed2-b773-1f7bc5538095', 8, 2, 'causal_inversion',   'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['dac73291-c73c-47a0-8514-b0469d34ddd8', 8, 2, 'surface_association', 'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['c370d20d-fdf3-453d-92d3-dafa10aa8fa9', 8, 2, 'surface_association', 'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['71b38cd8-2bfd-4e0a-ae87-d84b1308fdaf', 8, 2, 'surface_association', 'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['09d85bd8-f8db-4a3e-a203-54fde2c46e1b', 8, 2, 'surface_association', 'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['e1441657-8e58-4d7a-be24-0362164a7f58', 8, 2, 'surface_association', 'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['3e6be961-13fe-4d9e-bc36-73cd6c480683', 8, 2, 'scope_confusion',     'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  // ── Grade 8, Band 2 — MC country/role questions ───────────────────────────
  ['45663f43-fd77-47a6-bc44-53a4f6f9584f', 8, 2, 'false_equivalence',   'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['b2176d68-dfb7-44e9-9e76-5f7aa20a50fa', 8, 2, 'causal_inversion',   'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['e027b23a-538b-463b-90df-0eb7481b2f9c', 8, 2, 'false_equivalence',   'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['a0a6058e-b07c-46f9-9881-35ac5a87d0a0', 8, 2, 'false_equivalence',   'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['a5d54f61-cf01-497a-b74c-eae41b997916', 8, 2, 'false_equivalence',   'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['e97ac377-884e-41d3-a868-f8ebda5cc6ad', 8, 2, 'false_equivalence',   'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['1c193e44-bfd7-4c91-94e4-9b70e0cb1008', 8, 2, 'causal_inversion',   'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  ['fdd94868-dfe5-4dfa-85e8-c23326351e04', 8, 2, 'scope_confusion',     'comprehension', 'conceptual', 'reframing', 'reinforcement'],
  // ── Grade 8, Band 3 — analysis/turning points ────────────────────────────
  ['c037d436-bea4-40f5-8f10-ee758c126c6d', 8, 3, 'causal_inversion',   'analysis', 'analytical', 'perspective_shift', 'challenge'],
  ['d0a6a400-d786-4ac2-8c8c-f1a7851629a7', 8, 3, 'causal_inversion',   'analysis', 'analytical', 'perspective_shift', 'challenge'],
  // ── Grade 9, Band 3 — diplomatic/strategic specifics ─────────────────────
  ['83cb5400-83d3-4d84-8512-3bda09ce1d97', 9, 3, 'surface_association', 'analysis', 'analytical', 'perspective_shift', 'challenge'],
  ['907ec855-e29e-4d0b-ae14-c6e2f4787d82', 9, 3, 'surface_association', 'analysis', 'analytical', 'perspective_shift', 'challenge'],
  ['c36937c7-56e2-486d-a93b-917aace5a0f3', 9, 3, 'scope_confusion',     'analysis', 'analytical', 'perspective_shift', 'challenge'],
];

// Verify accounting
const retireCount = RETIRE.size;
const keepCount = KEEP.length;
console.log(`Retire: ${retireCount}, Keep: ${keepCount}, Total: ${retireCount + keepCount}`);
if (retireCount + keepCount !== 72) {
  // Find missing
  const allIds = new Set(data.map(q => q.id));
  const accounted = new Set([...RETIRE, ...KEEP.map(k => k[0])]);
  const missing = [...allIds].filter(id => !accounted.has(id));
  console.log('Missing IDs:', missing);
}

// Build SQL
const retireIds = [...RETIRE].map(id => `'${id}'`).join(',\n  ');

let sql = `-- Section 73 — Legacy Question Audit & Migration Sprint
-- WW2 domain recovery: ${keepCount} questions classified, ${retireCount} retired
-- Converts dead-weight legacy content into adaptive-ready world_war_2 domain
-- Total DB after: ${142 - retireCount} questions, 0 unclassified

-- ─── PART 1: RETIRE ${retireCount} DUPLICATE / LOW-QUALITY QUESTIONS ──────────────────
-- Remove question_instances first to avoid FK constraint violations

DELETE FROM public.question_instances
WHERE question_id IN (
  ${retireIds}
);

DELETE FROM public.questions
WHERE id IN (
  ${retireIds}
);

-- ─── PART 2: CLASSIFY ${keepCount} RECOVERED QUESTIONS ────────────────────────────────
-- Assigns: target_grade, difficulty_band, metadata (domain, misconception_type,
--          cognitive_skill, difficulty_type, insight_type, challenge_role)

`;

// Group by grade/band for readable SQL
const groups = {};
for (const [id, grade, band, misconception, skill, diffType, insight, role] of KEEP) {
  const key = `Grade ${grade}, Band ${band}`;
  if (!groups[key]) groups[key] = [];
  groups[key].push({ id, grade, band, misconception, skill, diffType, insight, role });
}

for (const [groupKey, items] of Object.entries(groups)) {
  sql += `-- ── ${groupKey} ──\n`;
  const metaBase = (item) => JSON.stringify({
    domain: 'world_war_2',
    misconception_type: item.misconception,
    cognitive_skill: item.skill,
    difficulty_type: item.diffType,
    insight_type: item.insight,
    challenge_role: item.role,
  });

  // Use single batch UPDATE per group using IN clause for efficiency
  // But we need different metadata per question, so individual UPDATEs
  for (const item of items) {
    const q = data.find(d => d.id === item.id);
    const label = q?.content?.question?.substring(0, 60).replace(/\n/g, ' ') ?? item.id;
    sql += `-- ${label}\n`;
    sql += `UPDATE public.questions SET\n`;
    sql += `  target_grade = ${item.grade}, difficulty_band = ${item.band},\n`;
    sql += `  metadata = '${metaBase(item)}'::jsonb\n`;
    sql += `WHERE id = '${item.id}';\n\n`;
  }
}

writeFileSync('./supabase/migrations/20260529000003_legacy_question_migration.sql', sql, 'utf-8');
console.log('Migration written.');
console.log('Grade 7 questions:', KEEP.filter(k => k[1] === 7).length);
console.log('Grade 8 questions:', KEEP.filter(k => k[1] === 8).length);
console.log('Grade 9 questions:', KEEP.filter(k => k[1] === 9).length);
