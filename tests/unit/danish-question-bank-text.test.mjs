// Exact production migration and rollback, offline PostgreSQL, no live pupil accounts.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {toPublicQuestion} from '../../supabase/functions/_shared/question-dto.ts';

const read=p=>readFileSync(new URL(`../../${p}`,import.meta.url),'utf8');
const SQL=read('supabase/migrations/20261018143726_fix_danish_question_bank_text.sql');
const ROLLBACK=read('docs/operations/rollback-danish-question-bank-text.sql');
const BEFORE_FN=read('tests/fixtures/danish-grading-before.sql');
const BANK=JSON.parse(read('tests/fixtures/danish-question-bank-before.json'));
const PATCHES=JSON.parse(SQL.match(/\$patches\$(.*?)\$patches\$/s)[1]);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const PUPIL=id(8000), OTHER=id(8001);

test('the latest grading definition changes only reviewed spelling compatibility, preserving the complete reward, ownership and repeat implementation',()=>{
 const latest=SQL.match(/\$grading\$\n([\s\S]*?)\n  \$grading\$/)[1];
 const restored=latest
  .replace('  v_orthography_aliases jsonb;\n','')
  .replace('SELECT qi.*, q.answer_format, q.content AS question_content, q.metadata AS question_metadata','SELECT qi.*, q.answer_format')
  .replace(/  -- Only the reviewed old\/new spellings[\s\S]*?(?=  IF v_instance.answered = true THEN)/,'')
  .replace('  IF v_answer = v_correct_answer OR v_orthography_aliases ? p_answer THEN','  IF v_answer = v_correct_answer THEN');
 assert.equal(restored.trim(),BEFORE_FN.trim());
});

async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE questions(id uuid PRIMARY KEY,content jsonb,metadata jsonb,learning_objective text,
   target_grade smallint,difficulty_band integer,answer_format text,type text,is_active boolean);
 CREATE TABLE question_instances(id uuid PRIMARY KEY,student_id uuid,question_id uuid REFERENCES questions,
   correct_answer text,answered boolean DEFAULT false,was_correct boolean,repeat_count integer DEFAULT 0,
   answered_at timestamptz,user_answer text);
 CREATE TABLE student_progress(student_id uuid PRIMARY KEY,xp integer DEFAULT 0,coins integer DEFAULT 0,
   correct_answers integer DEFAULT 0,total_correct_answers integer DEFAULT 0);
 CREATE TABLE calls(name text);
 CREATE FUNCTION update_streak(uuid) RETURNS void LANGUAGE sql AS $$ INSERT INTO calls VALUES ('streak') $$;
 CREATE FUNCTION update_quest_progress_for_answer(uuid,boolean,integer) RETURNS void LANGUAGE sql AS $$ INSERT INTO calls VALUES ('quest') $$;
 CREATE FUNCTION update_weekly_quest_progress_for_answer(uuid,boolean,integer) RETURNS void LANGUAGE sql AS $$ INSERT INTO calls VALUES ('weekly') $$;
 ${BEFORE_FN};
 REVOKE ALL ON FUNCTION process_question_attempt(uuid,uuid,text,bigint) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION process_question_attempt(uuid,uuid,text,bigint) TO service_role;
 `);
 const rows=BANK.map((q,i)=>({...q,id:id(i+1)}));
 await db.query(`INSERT INTO questions SELECT * FROM jsonb_populate_recordset(NULL::questions,$1::jsonb)`,[JSON.stringify(rows)]);
 await db.query('INSERT INTO student_progress(student_id) VALUES ($1),($2)',[PUPIL,OTHER]);
 // No transform may ever touch legitimate digraphs, names, English, or numeric answers.
 await db.query(`INSERT INTO questions VALUES ($1,$2,'{}','english',7,1,'mc','mc_single',true),
  ($3,'{"question":"2 + 2?","correct":"4"}','{}','math',7,1,'number','number',true)`,
 [id(9001),JSON.stringify({question:'Søren Aagaard, Aarhus, Graeber, Goethe og en koala',options:['does','goes','Aagaard'],correct:'does'}),id(9002)]);
 return db;
}
async function snapshot(db){
 return {
  questions:(await db.query('SELECT * FROM questions ORDER BY id')).rows,
  instances:(await db.query('SELECT * FROM question_instances ORDER BY id')).rows,
  progress:(await db.query('SELECT * FROM student_progress ORDER BY student_id')).rows,
  fn:(await db.query("SELECT pg_get_functiondef(oid) AS definition,proacl::text,prosecdef,proconfig FROM pg_proc WHERE oid='process_question_attempt(uuid,uuid,text,bigint)'::regprocedure")).rows[0]
 };
}
async function attempt(db,instance,question,key,answer,repeat=0){
 await db.query('INSERT INTO question_instances(id,student_id,question_id,correct_answer,repeat_count) VALUES ($1,$2,$3,$4,$5)',[instance,PUPIL,question,key,repeat]);
 return (await db.query('SELECT process_question_attempt($1,$2,$3,0) AS result',[PUPIL,instance,answer])).rows[0].result;
}

test('executes every reviewed text change atomically, preserves all other question fields and history, and is idempotent',async t=>{
 const db=await fixture(t);
 for(let i=0;i<BANK.length;i++)await db.query('INSERT INTO question_instances(id,student_id,question_id,correct_answer,answered,was_correct,user_answer) VALUES ($1,$2,$3,$4,true,true,$4)',[id(10000+i),PUPIL,id(i+1),String(BANK[i].content.correct)]);
 const before=await snapshot(db);await db.exec(SQL);const after=await snapshot(db);
 assert.equal(BANK.length,254);assert.equal(PATCHES.length,254);
 let changed=0,aliases=0;
 for(let i=0;i<BANK.length;i++){
  const original=before.questions[i],fixed=after.questions[i],patch=PATCHES[i];
  assert.deepEqual({...fixed,content:original.content,metadata:original.metadata},original);
  const expected=structuredClone(original);
  for(const change of patch.changes){
   let target=expected;for(const key of change.path.slice(0,-1))target=target[key];
   const key=change.path.at(-1);assert.deepEqual(target[key],change.before);target[key]=change.after;changed++;
  }
  if(patch.aliases){expected.metadata.danish_orthography_correct_aliases=patch.aliases;aliases++;}
  assert.deepEqual(fixed,expected);
  if(fixed.content.options)assert.ok(fixed.content.options.includes(fixed.content.correct));
  if(fixed.content.accepted_answers)assert.ok(fixed.content.accepted_answers.includes(fixed.content.correct));
  const dto=JSON.parse(JSON.stringify(toPublicQuestion(fixed.content,'mc',fixed.metadata)));
  assert.equal(dto.content.question,fixed.content.question);assert.deepEqual(dto.content.options,fixed.content.options);
  assert.equal('danish_orthography_correct_aliases' in (dto.metadata??{}),false);
 }
 assert.equal(changed,1431);assert.equal(aliases,201);
 assert.deepEqual(after.questions.slice(BANK.length),before.questions.slice(BANK.length));
 assert.deepEqual(after.instances,before.instances);assert.deepEqual(after.progress,before.progress);
 assert.deepEqual({...after.fn,definition:before.fn.definition},before.fn,'owner rights, SECURITY DEFINER and search_path unchanged');
 const propaganda=after.questions.find(q=>q.content.question==='Hvad var formålet med propaganda under Første Verdenskrig?');
 assert.ok(propaganda);assert.ok(propaganda.content.options.includes('At koordinere militære operationer mellem allierede'));
 assert.ok(propaganda.content.review_text.includes('få mænd'));
 await db.exec(SQL);assert.deepEqual(await snapshot(db),after);
});

test('every changed correct answer grades correctly for old open pages, new pages and repeated historical instances, without changing stored snapshots',async t=>{
 const db=await fixture(t);await db.exec(SQL);
 const fixed=(await snapshot(db)).questions;let serial=20000,count=0;
 for(let i=0;i<BANK.length;i++){
  const old=BANK[i].content.correct,now=fixed[i].content.correct;if(old===now)continue;count++;
  assert.equal(BANK[i].answer_format,'mc');
  const variants=[[old,now,0],[now,now,0],[now,old,0],[old,now,1]];
  for(const [stored,answer,repeat] of variants){
   const instance=id(serial++),result=await attempt(db,instance,id(i+1),stored,answer,repeat);
   assert.equal(result.status,'correct');assert.equal(result.correct_answer,now);
   const row=(await db.query('SELECT correct_answer,user_answer FROM question_instances WHERE id=$1',[instance])).rows[0];
   assert.equal(row.correct_answer,stored);assert.equal(row.user_answer,answer);
   const progress=(await db.query('SELECT * FROM student_progress ORDER BY student_id')).rows;
   await db.query('SELECT process_question_attempt($1,$2,$3,0)',[PUPIL,instance,answer]);
   assert.deepEqual((await db.query('SELECT * FROM student_progress ORDER BY student_id')).rows,progress,'retry awards nothing');
  }
  const wrong=fixed[i].content.options.find(o=>o!==now);
  assert.equal((await attempt(db,id(serial++),id(i+1),old,wrong)).status,'incorrect');
 }
 assert.equal(count,201);
 const progress=(await db.query('SELECT * FROM student_progress WHERE student_id=$1',[PUPIL])).rows[0];
 assert.equal(progress.xp,count*32);assert.equal(progress.coins,count*15);
 assert.equal(progress.correct_answers,count*3);assert.equal(progress.total_correct_answers,count*3);
 assert.equal((await attempt(db,id(serial++),id(9002),'4','4')).status,'correct','numeric path unchanged');
 assert.equal((await attempt(db,id(serial++),id(9001),'does','goes')).status,'incorrect','English path unchanged');
 await assert.rejects(db.query('SELECT process_question_attempt($1,$2,$3,0)',[OTHER,id(serial-1),'does']),/Instance not found/);
});

test('rollback restores every question, the exact grading function and its permissions, without rewriting pupil history',async t=>{
 const db=await fixture(t);const before=await snapshot(db);
 await db.exec(SQL);await db.exec(ROLLBACK);assert.deepEqual(await snapshot(db),before);
 await db.exec(ROLLBACK);assert.deepEqual(await snapshot(db),before);
});

test('rollback refuses to strand new historical instances after live traffic has used corrected answer keys',async t=>{
 const db=await fixture(t);await db.exec(SQL);
 const i=PATCHES.findIndex(p=>p.aliases);
 await attempt(db,id(7000),id(i+1),PATCHES[i].aliases[1],PATCHES[i].aliases[1]);
 const before=await snapshot(db);await assert.rejects(db.exec(ROLLBACK),/Nye facit-snapshots/);
 assert.deepEqual(await snapshot(db),before);
});

for(const mode of ['missing row','duplicate row','edited text','edited metadata','changed grading function','new trigger']){
 test(`fails closed and rolls back the entire operation: ${mode}`,async t=>{
  const db=await fixture(t),last=id(BANK.length);
  if(mode==='missing row')await db.query('DELETE FROM questions WHERE id=$1',[last]);
  if(mode==='duplicate row')await db.query('INSERT INTO questions SELECT $1,content,metadata,learning_objective,target_grade,difficulty_band,answer_format,type,is_active FROM questions WHERE id=$2',[id(9999),last]);
  if(mode==='edited text')await db.query(`UPDATE questions SET content=jsonb_set(content,'{review_text}','"En ny forklaring"') WHERE id=$1`,[last]);
  if(mode==='edited metadata')await db.query(`UPDATE questions SET metadata=metadata||'{"new_tag":"bevares"}' WHERE id=$1`,[last]);
  if(mode==='changed grading function')await db.exec(BEFORE_FN.replace('v_coins          integer := 0','v_coins          integer := 1'));
  if(mode==='new trigger')await db.exec(`CREATE FUNCTION no_op() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$; CREATE TRIGGER new_trigger BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION no_op()`);
  const before=await snapshot(db);await assert.rejects(db.exec(SQL));assert.deepEqual(await snapshot(db),before);
 });
}
