// Offline PostgreSQL execution of the exact proposed migration; no Supabase connection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { toPublicQuestion } from '../../supabase/functions/_shared/question-dto.ts';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20261018142759_fix_ww1_propaganda_danish_text.sql');
// Independent input from the historical INSERT, not a duplicate of the migration's precondition.
const historical = read('supabase/migrations/20260531140000_world_war_1_content_sprint.sql');
const original = JSON.parse(historical.split('\n').find(line => line.includes('Hvad var formaaalet med propaganda')).match(/'(.*)'::jsonb/)[1]);
const expected = {
  ...original,
  question: 'Hvad var formålet med propaganda under Første Verdenskrig?',
  options: [original.options[0], 'At formidle objektiv information om krigens forløb til borgerne', 'At koordinere militære operationer mellem allierede', original.options[3]],
  review_text: 'Alle krigsførende lande brugte propaganda aktivt. Plakater og film fremstillede fjenden som barbarisk. Det var vigtigt for at få mænd til at melde sig og få befolkningen til at støtte krigen.',
};

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE TABLE questions (
    id integer PRIMARY KEY, content jsonb NOT NULL,
    learning_objective text DEFAULT 'world_war_1', target_grade integer DEFAULT 7,
    difficulty_band integer DEFAULT 2, answer_format text DEFAULT 'mc', type text DEFAULT 'mc_single',
    metadata jsonb DEFAULT '{"concepts":["propaganda"]}', is_active boolean DEFAULT true
  );
  CREATE TABLE question_instances (id integer PRIMARY KEY, question_id integer, correct_answer text);`);
  await db.query('INSERT INTO questions(id, content) VALUES (1, $1)', [JSON.stringify(original)]);
  await db.query('INSERT INTO question_instances VALUES (10, 1, $1)', [original.correct]);
  return db;
}
async function snapshot(db) {
  return {
    questions: (await db.query('SELECT * FROM questions ORDER BY id')).rows,
    instances: (await db.query('SELECT * FROM question_instances ORDER BY id')).rows,
  };
}

test('corrects the documented question, choices and explanation; preserves grading, identity and unrelated data', async t => {
  const db = await fixture(t);
  const other = { ...original, question: 'Hvad er en koala? Hvad hedder Søren Aagaard og Goethe?' };
  await db.query('INSERT INTO questions(id, content) VALUES (2, $1)', [JSON.stringify(other)]);
  await db.exec('INSERT INTO questions SELECT 3, content, learning_objective, 8, difficulty_band, answer_format, type, metadata, is_active FROM questions WHERE id = 1');
  await db.exec('INSERT INTO questions SELECT 4, content, learning_objective, target_grade, difficulty_band, answer_format, type, metadata, false FROM questions WHERE id = 2');
  // Unknown JSON fields must survive the merge verbatim, including legitimate aa/ae/oe.
  await db.exec(`UPDATE questions SET content = content || '{"source":"Søren Aagaard / koala / Goethe"}' WHERE id = 1`);
  const before = await snapshot(db);
  await db.exec(migration);
  const after = await snapshot(db);
  assert.deepEqual(after.questions[0], { ...before.questions[0], content: { ...expected, source: before.questions[0].content.source } });
  assert.deepEqual(after.questions.slice(1), before.questions.slice(1));
  assert.deepEqual(after.instances, before.instances);
  assert.equal(after.questions[0].content.correct, original.correct);
  assert.deepEqual(after.questions[0].content.accepted_answers, original.accepted_answers);
  assert.ok(after.questions[0].content.options.includes(original.correct));
  await db.exec(migration);
  assert.deepEqual(await snapshot(db), after, 'second application is a no-op');
});

test('the actual Edge DTO and JSON transport preserve Danish characters and options', async t => {
  const db = await fixture(t);
  await db.exec(migration);
  const { content, metadata } = (await snapshot(db)).questions[0];
  const dto = JSON.parse(JSON.stringify(toPublicQuestion(content, 'mc', metadata)));
  assert.deepEqual(dto.content, { question: expected.question, options: expected.options });
  assert.equal('correct' in dto.content, false);
  assert.equal('review_text' in dto.content, false);
  // The DTO must never become a general transliterator, in either direction.
  const untouched = { question: 'Søren Aagaard, Goethe og en koala', options: ['Ø Å Æ', 'aa ae oe'] };
  assert.deepEqual(toPublicQuestion(untouched, 'mc', null).content, untouched);
});

for (const scenario of ['missing', 'duplicate', 'changed option', 'extra option', 'reordered options', 'extra accepted answer', 'changed correct', 'changed review', 'metadata review', 'partial correction']) {
  test(`fails closed for ${scenario} and leaves every row untouched`, async t => {
    const db = await fixture(t);
    if (scenario === 'missing') await db.exec('DELETE FROM questions');
    else if (scenario === 'duplicate') await db.exec('INSERT INTO questions SELECT 2, content, learning_objective, target_grade, difficulty_band, answer_format, type, metadata, is_active FROM questions');
    else if (scenario === 'metadata review') await db.exec(`UPDATE questions SET metadata = metadata || '{"review_text":"En anden forklaring"}'`);
    else {
      const modified = structuredClone(original);
      if (scenario === 'changed option') modified.options[1] = 'En ny svarmulighed';
      if (scenario === 'extra option') modified.options.push('En ekstra svarmulighed');
      if (scenario === 'reordered options') modified.options.reverse();
      if (scenario === 'extra accepted answer') modified.accepted_answers.push('Et ekstra facit');
      if (scenario === 'changed correct') modified.correct = 'Et nyt facit';
      if (scenario === 'changed review') modified.review_text = 'En redigeret forklaring';
      if (scenario === 'partial correction') modified.question = expected.question;
      await db.query('UPDATE questions SET content = $1 WHERE id = 1', [JSON.stringify(modified)]);
    }
    const before = await snapshot(db);
    await assert.rejects(db.exec(migration));
    assert.deepEqual(await snapshot(db), before);
  });
}

test('guarded rollback restores the historical content and preserves the answer key', async t => {
  const db = await fixture(t);
  const before = await snapshot(db);
  const oldLiteral = migration.match(/\$before\$(.*?)\$before\$/s)[1];
  const newLiteral = migration.match(/\$after\$(.*?)\$after\$/s)[1];
  const rollback = migration
    .replace(`$before$${oldLiteral}$before$`, `$before$${newLiteral}$before$`)
    .replace(`$after$${newLiteral}$after$`, `$after$${oldLiteral}$after$`);
  await db.exec(migration);
  await db.exec(rollback);
  assert.deepEqual(await snapshot(db), before);
  await db.exec(rollback);
  assert.deepEqual(await snapshot(db), before);
});
