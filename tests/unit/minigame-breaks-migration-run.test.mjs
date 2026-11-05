// RUNTIME proof for migration 20261105090000_minigame_breaks (D-347), in PGlite (in-process PostgreSQL).
//
// Fixture: the columns the migration reads from production (catalog, read-only, 2026-11-04):
// profiles(id, role), question_instances(id, student_id, created_at, answered, answered_at, user_answer),
// auth.users(id) and auth.uid() as Supabase defines it. Synthetic users only.
//
// Time is controlled without waiting: every timestamp the functions read (question_instances.created_at /
// answered_at, progress.last_credit_at, offers.*_at) is written relative to now() by the fixture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const FILE = "supabase/migrations/20261105090000_minigame_breaks.sql";

const P1 = "00000000-0000-4000-8000-0000000000a1";
const P2 = "00000000-0000-4000-8000-0000000000a2";
const T1 = "00000000-0000-4000-8000-0000000000b1"; // teacher

const FIXTURE = `
  CREATE ROLE anon NOLOGIN NOINHERIT NOBYPASSRLS;
  CREATE ROLE authenticated NOLOGIN NOINHERIT NOBYPASSRLS;
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  CREATE ROLE authenticator LOGIN NOINHERIT NOSUPERUSER;
  GRANT anon, authenticated, service_role TO authenticator;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  INSERT INTO auth.users VALUES ('${P1}'), ('${P2}'), ('${T1}');
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text);
  INSERT INTO public.profiles VALUES ('${P1}', 'student'), ('${P2}', 'student'), ('${T1}', 'teacher');
  CREATE TABLE public.question_instances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    answered boolean NOT NULL DEFAULT false,
    answered_at timestamptz,
    user_answer text);
  ALTER TABLE public.question_instances ENABLE ROW LEVEL SECURITY;
  -- Production's default privileges (pg_default_acl, read 2026-11-04): new tables and functions go to all
  -- three API roles. The migration must revoke them explicitly.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

async function migrated() {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(read(FILE));
  return db;
}

const q = (s) => String(s).split("'").join("''");

// Runs one statement as an API caller (role + JWT sub, the way PostgREST does), then resets.
async function as(db, role, sub, sql) {
  const claims = sub ? { role, sub } : { role };
  try {
    await db.exec(`SET SESSION AUTHORIZATION authenticator;
      SELECT set_config('request.jwt.claims', '${q(JSON.stringify(claims))}', false),
             set_config('request.jwt.claim.sub', '', false);
      SET ROLE ${role};`);
    return { ok: true, rows: (await db.query(sql)).rows };
  } catch (e) {
    return { ok: false, message: e.message };
  } finally {
    await db.exec(`RESET ROLE; SET SESSION AUTHORIZATION postgres;
      SELECT set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false);`);
  }
}

async function call(db, sub, fn, args) {
  const r = await as(db, "authenticated", sub, `SELECT public.${fn}(${args}) AS r`);
  if (!r.ok) return { error: r.message };
  return r.rows[0].r;
}
const afterAnswer = (db, sub, id, visible = "NULL") => call(db, sub, "minigame_break_after_answer", `'${id}'::uuid, ${visible}`);
const respond = (db, sub, id, accept) => call(db, sub, "minigame_break_respond", `'${id}'::uuid, ${accept}`);
const start = (db, sub, id, game) => call(db, sub, "minigame_break_start", `'${id}'::uuid, '${game}'`);
const finish = (db, sub, id, outcome) => call(db, sub, "minigame_break_finish", `'${id}'::uuid, '${outcome}'`);

// A registered answer: served `servedAgo` seconds ago, answered `answeredAgo` seconds ago.
async function answered(db, student, servedAgo, answeredAgo, answer = "x") {
  const r = await db.query(`INSERT INTO public.question_instances (student_id, created_at, answered, answered_at, user_answer)
    VALUES ('${student}', now() - interval '${servedAgo} seconds', true, now() - interval '${answeredAgo} seconds',
            ${answer === null ? "NULL" : `'${q(answer)}'`}) RETURNING id`);
  return r.rows[0].id;
}
async function unanswered(db, student) {
  const r = await db.query(`INSERT INTO public.question_instances (student_id, created_at) VALUES ('${student}', now() - interval '30 seconds') RETURNING id`);
  return r.rows[0].id;
}
async function setProgress(db, student, seconds, lastAgo = null) {
  await db.query(`INSERT INTO public.minigame_break_progress (student_id, active_seconds, last_credit_at)
    VALUES ('${student}', ${seconds}, ${lastAgo === null ? "NULL" : `now() - interval '${lastAgo} seconds'`})
    ON CONFLICT (student_id) DO UPDATE SET active_seconds = EXCLUDED.active_seconds, last_credit_at = EXCLUDED.last_credit_at`);
}
const seconds = async (db, student) =>
  (await db.query(`SELECT active_seconds FROM public.minigame_break_progress WHERE student_id = '${student}'`)).rows[0]?.active_seconds ?? null;
const offers = async (db, student) =>
  (await db.query(`SELECT id, game_key, status, outcome FROM public.minigame_break_offers WHERE student_id = '${student}' ORDER BY offered_at, id`)).rows;

// ── Gruppe A: tid ─────────────────────────────────────────────────────────────────────────────────────

test("A1: an answer earns the seconds between serving and answering, and no offer below 20 minutes", async () => {
  const db = await migrated();
  const r = await afterAnswer(db, P1, await answered(db, P1, 70, 10));
  assert.equal(r.status, "ok");
  assert.equal(r.reason, "counted");
  assert.equal(r.offer, null);
  assert.equal(r.interval_seconds, 1200);
  assert.ok(r.active_seconds >= 59 && r.active_seconds <= 61, String(r.active_seconds));
  assert.deepEqual(await offers(db, P1), []);
});

test("A2: 10 minutes and 19:59 give no offer; reaching 20:00 with an answer gives exactly one", async () => {
  const db = await migrated();
  await setProgress(db, P1, 590, 400);
  let r = await afterAnswer(db, P1, await answered(db, P1, 300, 290, "a"), 10);   // +10 s → 600 (10 min)
  assert.equal(r.active_seconds, 600);
  assert.equal(r.offer, null);
  await setProgress(db, P1, 1190, 400);
  r = await afterAnswer(db, P1, await answered(db, P1, 280, 250, "b"), 9);        // → 1199 = 19:59
  assert.equal(r.active_seconds, 1199);
  assert.equal(r.offer, null);
  r = await afterAnswer(db, P1, await answered(db, P1, 240, 200, "c"), 1);        // → 1200 = 20:00
  assert.equal(r.reason, "offer");
  assert.ok(r.offer && typeof r.offer.id === "string" && typeof r.offer.game === "string");
  assert.equal(r.active_seconds, 0, "a new period starts");
  assert.equal((await offers(db, P1)).length, 1);
});

test("A3: being eligible is not an offer: nothing exists until the next registered answer", async () => {
  const db = await migrated();
  await setProgress(db, P1, 1200, 600);       // 20 min earned, then a long question still open
  assert.deepEqual(await offers(db, P1), []);
  const notYet = await afterAnswer(db, P1, await unanswered(db, P1));
  assert.equal(notYet.reason, "not_answered");
  assert.deepEqual(await offers(db, P1), []);
  const r = await afterAnswer(db, P1, await answered(db, P1, 90, 0));
  assert.equal(r.reason, "offer");
  assert.equal((await offers(db, P1)).length, 1);
});

test("A4: surplus does not pile up — 30 minutes of credit still give one offer, then a fresh period", async () => {
  const db = await migrated();
  await setProgress(db, P1, 1100, 900);
  const r1 = await afterAnswer(db, P1, await answered(db, P1, 800, 500, "a"));   // +300 (cap) → 1200, offer
  assert.equal(r1.reason, "offer");
  await respond(db, P1, r1.offer.id, false);
  const r2 = await afterAnswer(db, P1, await answered(db, P1, 60, 0, "b"));
  assert.equal(r2.offer, null, "no second offer from the surplus");
  assert.ok(r2.active_seconds <= 60);
  assert.equal((await offers(db, P1)).length, 1);
});

test("A5: the inactivity rule — one answer counts at most 300 seconds, however long it stayed open", async () => {
  const db = await migrated();
  const r = await afterAnswer(db, P1, await answered(db, P1, 3600, 0));
  assert.equal(r.active_seconds, 300);
});

test("A6: a slow reader is not punished: a four-minute question counts four minutes", async () => {
  const db = await migrated();
  const r = await afterAnswer(db, P1, await answered(db, P1, 240, 0), 240);
  assert.ok(r.active_seconds >= 239 && r.active_seconds <= 240, String(r.active_seconds));
});

test("A7: background time — the browser's visible seconds can lower the credit, never raise it", async () => {
  const db = await migrated();
  const low = await afterAnswer(db, P1, await answered(db, P1, 200, 100, "a"), 20);
  assert.equal(low.active_seconds, 20);
  const high = await afterAnswer(db, P2, await answered(db, P2, 50, 0, "b"), 100000);
  assert.ok(high.active_seconds <= 51, "the server interval bounds a forged visible count");
  const neg = await afterAnswer(db, P2, await answered(db, P2, 0, 0, "c"), -500);
  assert.ok(neg.active_seconds <= 51);
});

test("A8: game, hub and dialog time do not count: responding and finishing move the credit start to now()", async () => {
  const db = await migrated();
  await setProgress(db, P1, 1199, 600);
  const r = await afterAnswer(db, P1, await answered(db, P1, 500, 400, "a"));
  assert.equal(r.reason, "offer");
  assert.equal((await respond(db, P1, r.offer.id, true)).status, "ok");
  assert.equal((await start(db, P1, r.offer.id, r.offer.game)).status, "ok");
  // The game "lasted" 20 minutes: pretend the question after it was (re)served long ago.
  await db.query(`UPDATE public.minigame_break_offers SET started_at = now() - interval '20 minutes' WHERE id = '${r.offer.id}'`);
  assert.equal((await finish(db, P1, r.offer.id, "completed")).status, "ok");
  const after = await afterAnswer(db, P1, await answered(db, P1, 3600, 0, "b"));
  assert.ok(after.active_seconds <= 1, "only time after the break counts: " + after.active_seconds);
});

// ── Gruppe B: besvarelse ──────────────────────────────────────────────────────────────────────────────

test("B1: correct, incorrect and teacher-pending answers count alike — only registration matters", async () => {
  const db = await migrated();
  // The functions never read correctness; a pending text answer has answered=true, answered_at and its text.
  for (const [i, answer] of ["rigtigt", "forkert", "et langt tekstsvar til læreren"].entries()) {
    const r = await afterAnswer(db, P1, await answered(db, P1, 300 - i * 60, 290 - i * 60, answer));
    assert.equal(r.reason, "counted", answer);
  }
});

test("B2: unregistered, released and other pupils' rounds never count and never open a break", async () => {
  const db = await migrated();
  await setProgress(db, P1, 1200, 900);
  assert.equal((await afterAnswer(db, P1, await unanswered(db, P1))).reason, "not_answered");
  // release_open_question_outside: answered=true and answered_at set, but no answer.
  assert.equal((await afterAnswer(db, P1, await answered(db, P1, 60, 0, null))).reason, "not_answered");
  assert.equal((await afterAnswer(db, P1, await answered(db, P2, 60, 0))).reason, "not_answered");
  assert.equal((await afterAnswer(db, P1, "00000000-0000-4000-8000-00000000ffff")).reason, "not_answered");
  assert.deepEqual(await offers(db, P1), []);
  assert.equal(await seconds(db, P1), 1200);
});

test("B3: a repeated or delayed call for the same answer is credited once (double click, retry)", async () => {
  const db = await migrated();
  const id = await answered(db, P1, 100, 40);
  const first = await afterAnswer(db, P1, id);
  const again = await afterAnswer(db, P1, id);
  assert.equal(first.reason, "counted");
  assert.equal(again.reason, "already_counted");
  assert.equal(again.active_seconds, first.active_seconds);
});

test("B4: an answer older than 10 minutes cannot open a break", async () => {
  const db = await migrated();
  await setProgress(db, P1, 1200, 2000);
  const r = await afterAnswer(db, P1, await answered(db, P1, 1000, 700));
  assert.equal(r.reason, "stale");
  assert.deepEqual(await offers(db, P1), []);
});

test("B5: a retried call after the offer was created returns the SAME offer, not a new one", async () => {
  const db = await migrated();
  await setProgress(db, P1, 1199, 600);
  const id = await answered(db, P1, 100, 0);
  const a = await afterAnswer(db, P1, id);
  const b = await afterAnswer(db, P1, id);
  const c = await afterAnswer(db, P1, await answered(db, P1, 0, 0, "next"));
  assert.equal(a.reason, "offer");
  assert.deepEqual(b.offer, a.offer);
  assert.deepEqual(c.offer, a.offer, "a waiting offer is shown again after the next answer, never doubled");
  assert.equal((await offers(db, P1)).length, 1);
});

// ── Gruppe C: invitation ──────────────────────────────────────────────────────────────────────────────

async function withOffer(db, student = P1) {
  await setProgress(db, student, 1199, 600);
  const r = await afterAnswer(db, student, await answered(db, student, 100, 0));
  assert.equal(r.reason, "offer");
  return r.offer;
}

test("C1: 'Ja tak' — accept, then exactly one start for exactly the offered game, then finish", async () => {
  const db = await migrated();
  const o = await withOffer(db);
  assert.deepEqual(await respond(db, P1, o.id, true), { status: "ok", offer_status: "accepted", game: o.game });
  assert.deepEqual(await respond(db, P1, o.id, true), { status: "ok", offer_status: "accepted", game: o.game }, "idempotent");
  const other = o.game === "brud" ? "hop" : "brud";
  assert.deepEqual(await start(db, P1, o.id, other), { status: "denied", reason: "wrong_game" });
  assert.deepEqual(await start(db, P1, o.id, o.game), { status: "ok", reason: "started" });
  assert.deepEqual(await start(db, P1, o.id, o.game), { status: "denied", reason: "already_used" }, "reload / back button");
  assert.deepEqual(await finish(db, P1, o.id, "completed"), { status: "ok", offer_status: "finished" });
  assert.deepEqual(await finish(db, P1, o.id, "exited"), { status: "ok", offer_status: "finished" }, "idempotent");
  assert.deepEqual(await start(db, P1, o.id, o.game), { status: "denied", reason: "already_used" });
  assert.equal((await offers(db, P1))[0].outcome, "completed");
});

test("C2: 'Nej, ellers tak' — declined, the period restarts, and the offer can never be played", async () => {
  const db = await migrated();
  const o = await withOffer(db);
  assert.deepEqual(await respond(db, P1, o.id, false), { status: "ok", offer_status: "declined", game: o.game });
  assert.equal(await seconds(db, P1), 0);
  assert.deepEqual(await respond(db, P1, o.id, true), { status: "conflict", offer_status: "declined", game: o.game });
  assert.deepEqual(await start(db, P1, o.id, o.game), { status: "denied", reason: "not_accepted" });
  const next = await afterAnswer(db, P1, await answered(db, P1, 30, 0, "next"));
  assert.equal(next.offer, null);
});

test("C3: both choices start a new 20-minute period", async () => {
  for (const accept of [true, false]) {
    const db = await migrated();
    const o = await withOffer(db);
    await respond(db, P1, o.id, accept);
    assert.equal(await seconds(db, P1), 0, String(accept));
  }
});

test("C4: an accepted pass that is never started expires after 15 minutes and frees the pupil", async () => {
  const db = await migrated();
  const o = await withOffer(db);
  await respond(db, P1, o.id, true);
  await db.query(`UPDATE public.minigame_break_offers SET responded_at = now() - interval '16 minutes' WHERE id = '${o.id}'`);
  assert.deepEqual(await start(db, P1, o.id, o.game), { status: "denied", reason: "expired" });
  // While accepted (before expiry) nothing accrued; after expiry answers count again.
  const r = await afterAnswer(db, P1, await answered(db, P1, 30, 0, "x"));
  assert.equal(r.reason, "counted");
});

test("C5: a quiz answer ends an accepted or started break — its pass dies, time counts again, no new offer", async () => {
  // Accepted, never played (the pupil came back to the quiz instead).
  let db = await migrated();
  let o = await withOffer(db);
  await respond(db, P1, o.id, true);
  let r = await afterAnswer(db, P1, await answered(db, P1, 20, 0, "y"));
  assert.equal(r.reason, "counted");
  assert.equal(r.offer, null);
  assert.equal((await offers(db, P1))[0].status, "expired");
  assert.deepEqual(await start(db, P1, o.id, o.game), { status: "denied", reason: "expired" }, "the old pass is dead");
  // Started, the game tab closed mid-round.
  db = await migrated();
  o = await withOffer(db);
  await respond(db, P1, o.id, true);
  await start(db, P1, o.id, o.game);
  r = await afterAnswer(db, P1, await answered(db, P1, 20, 0, "z"));
  assert.equal(r.reason, "counted");
  const row = (await offers(db, P1))[0];
  assert.equal(row.status, "finished");
  assert.equal(row.outcome, "exited");
  assert.deepEqual(await start(db, P1, o.id, o.game), { status: "denied", reason: "already_used" });
});

test("C6: a pass belonging to another pupil, an unknown pass and no pass are refused", async () => {
  const db = await migrated();
  const o = await withOffer(db, P1);
  await respond(db, P1, o.id, true);
  assert.deepEqual(await respond(db, P2, o.id, true), { status: "not_found", offer_status: null, game: null });
  assert.deepEqual(await start(db, P2, o.id, o.game), { status: "denied", reason: "not_found" });
  assert.deepEqual(await finish(db, P2, o.id, "completed"), { status: "not_found", offer_status: null });
  assert.deepEqual(await start(db, P1, "00000000-0000-4000-8000-00000000eeee", o.game), { status: "denied", reason: "not_found" });
  assert.equal((await as(db, "authenticated", P1, "SELECT public.minigame_break_start(NULL, 'brud') AS r")).rows[0].r.reason, "no_pass");
  // P1's pass still works for P1.
  assert.equal((await start(db, P1, o.id, o.game)).status, "ok");
});

test("C7: an empty pool offers nothing (no broken dialog); the earned time waits for an enabled game", async () => {
  const db = await migrated();
  await db.query("UPDATE public.minigame_break_games SET enabled = false");
  await setProgress(db, P1, 1199, 600);
  const r = await afterAnswer(db, P1, await answered(db, P1, 100, 0, "a"));
  assert.equal(r.reason, "no_games");
  assert.equal(r.offer, null);
  assert.equal(r.active_seconds, 1200);
  await db.query("UPDATE public.minigame_break_games SET enabled = true WHERE game_key = 'husk'");
  const r2 = await afterAnswer(db, P1, await answered(db, P1, 0, 0, "b"));
  assert.deepEqual(r2.offer?.game, "husk");
});

test("C8: invalid input is refused explicitly", async () => {
  const db = await migrated();
  const o = await withOffer(db);
  assert.match((await call(db, P1, "minigame_break_respond", `'${o.id}'::uuid, NULL`)).error, /invalid_request/);
  await respond(db, P1, o.id, true);
  await start(db, P1, o.id, o.game);
  assert.match((await finish(db, P1, o.id, "won")).error, /invalid_request/);
  assert.match((await call(db, P1, "minigame_break_after_answer", "NULL, NULL")).error, /invalid_instance/);
});

// ── Gruppe D: persistens og samtidighed ───────────────────────────────────────────────────────────────

test("D1: two tabs answering overlapping questions earn wall-clock time once, not twice", async () => {
  const db = await migrated();
  const tabA = await answered(db, P1, 120, 60, "a");   // served t-120, answered t-60
  const tabB = await answered(db, P1, 110, 0, "b");    // served t-110 (other tab), answered t-0
  await afterAnswer(db, P1, tabA);
  const r = await afterAnswer(db, P1, tabB);
  assert.ok(r.active_seconds >= 119 && r.active_seconds <= 121, "120 s of wall clock, not 170: " + r.active_seconds);
});

test("D2: at most one open offer per pupil is enforced by the database itself", async () => {
  const db = await migrated();
  await withOffer(db);
  await assert.rejects(
    db.query(`INSERT INTO public.minigame_break_offers (student_id, game_key) VALUES ('${P1}', 'brud')`),
    /minigame_break_offers_one_open/);
});

test("D3: the earned time is per pupil and survives everything browser-side (it lives in the database)", async () => {
  const db = await migrated();
  await afterAnswer(db, P1, await answered(db, P1, 200, 0, "a"));
  assert.equal(await seconds(db, P2), null, "P2 has no counter of P1's");
  const p1 = await seconds(db, P1);
  // A "new device / reload / logout-login" is just another call with the same JWT sub.
  const r = await afterAnswer(db, P1, await answered(db, P1, 30, 0, "b"));
  assert.ok(r.active_seconds >= p1);
});

test("D4: an offer left waiting expires after 2 hours, then time accrues again from zero", async () => {
  const db = await migrated();
  const o = await withOffer(db);
  await db.query(`UPDATE public.minigame_break_offers SET offered_at = now() - interval '3 hours' WHERE id = '${o.id}'`);
  const r = await afterAnswer(db, P1, await answered(db, P1, 40, 0, "x"));
  assert.equal(r.reason, "counted");
  assert.equal((await offers(db, P1))[0].status, "expired");
  assert.deepEqual(await respond(db, P1, o.id, true), { status: "conflict", offer_status: "expired", game: o.game });
});

// ── Gruppe E: adgang ──────────────────────────────────────────────────────────────────────────────────

test("E1: anon cannot call anything; pupils cannot read or write the tables or call the internals", async () => {
  const db = await migrated();
  for (const sql of [
    "SELECT public.minigame_break_after_answer(gen_random_uuid(), NULL)",
    "SELECT public.minigame_break_start(gen_random_uuid(), 'brud')",
  ]) {
    const r = await as(db, "anon", null, sql);
    assert.equal(r.ok, false, sql);
    assert.match(r.message, /permission denied/);
  }
  for (const sql of [
    "SELECT * FROM public.minigame_break_offers",
    "SELECT * FROM public.minigame_break_progress",
    "SELECT * FROM public.minigame_break_games",
    `INSERT INTO public.minigame_break_progress (student_id, active_seconds) VALUES ('${P1}', 1200)`,
    "UPDATE public.minigame_break_games SET enabled = false",
    `SELECT public._minigame_break_expire('${P1}')`,
    "SELECT public._minigame_break_lock_pupil()",
  ]) {
    const r = await as(db, "authenticated", P1, sql);
    assert.equal(r.ok, false, sql);
    assert.match(r.message, /permission denied/, sql);
  }
});

test("E2: no caller identity, or a teacher, is refused", async () => {
  const db = await migrated();
  const id = await answered(db, T1, 60, 0);
  assert.match((await afterAnswer(db, null, id)).error, /not_authenticated/);
  assert.match((await afterAnswer(db, T1, id)).error, /not_a_student/);
  assert.match((await call(db, T1, "minigame_break_start", `gen_random_uuid(), 'brud'`)).error, /not_a_student/);
});

test("E3: every function is SECURITY DEFINER with search_path pinned, and EXECUTE only for authenticated", async () => {
  const db = await migrated();
  const rows = (await db.query(`SELECT p.proname, p.prosecdef, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_x,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_x,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_x
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE '%minigame_break%' ORDER BY 1`)).rows;
  assert.deepEqual(rows.map((r) => r.proname), [
    "_minigame_break_expire", "_minigame_break_lock_pupil",
    "minigame_break_after_answer", "minigame_break_finish", "minigame_break_respond", "minigame_break_start",
  ]);
  for (const r of rows) {
    assert.equal(r.prosecdef, true, r.proname);
    assert.deepEqual(r.proconfig, ["search_path=public"], r.proname);
    assert.equal(r.anon_x, false, r.proname);
    assert.equal(r.auth_x, !r.proname.startsWith("_"), r.proname);
    assert.equal(r.svc_x, !r.proname.startsWith("_"), r.proname + ": internal helpers are closed to service_role too");
  }
  const tables = (await db.query(`SELECT c.relname, c.relrowsecurity,
      (SELECT count(*) FROM pg_policy WHERE polrelid = c.oid)::int AS policies,
      has_table_privilege('authenticated', c.oid, 'SELECT') AS sel
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname LIKE 'minigame_break_%' AND c.relkind = 'r' ORDER BY 1`)).rows;
  assert.equal(tables.length, 3);
  for (const t of tables) {
    assert.equal(t.relrowsecurity, true, t.relname);
    assert.equal(t.policies, 0, t.relname);
    assert.equal(t.sel, false, t.relname);
  }
});

test("E4: the migration re-runs cleanly (idempotent DDL) and keeps the game list", async () => {
  const db = await migrated();
  await db.exec(read(FILE));
  const games = (await db.query("SELECT game_key FROM public.minigame_break_games ORDER BY 1")).rows.map((r) => r.game_key);
  assert.deepEqual(games, ["brud", "hop", "husk", "kloeft", "naal", "slope", "stabel"]);
});

// ── Gruppe F: tilfældighed ────────────────────────────────────────────────────────────────────────────

async function drawMany(db, n) {
  const counts = {};
  const id = await answered(db, P1, 100, 0);
  for (let i = 0; i < n; i++) {
    await db.query(`DELETE FROM public.minigame_break_offers WHERE student_id = '${P1}'`);
    await setProgress(db, P1, 1200, null);
    const r = await afterAnswer(db, P1, id);
    assert.equal(r.reason, "offer");
    counts[r.offer.game] = (counts[r.offer.game] ?? 0) + 1;
  }
  return counts;
}

test("F1: every enabled game can be drawn, roughly uniformly, and repeats are allowed", async () => {
  const db = await migrated();
  await db.query("SELECT setseed(0.347)");
  const n = 700;
  const counts = await drawMany(db, n);
  assert.deepEqual(Object.keys(counts).sort(), ["brud", "hop", "husk", "kloeft", "naal", "slope", "stabel"]);
  // Sanity only (the uniformity comes from ORDER BY random() over the enabled rows, nothing else):
  // each of 7 games expected 100 times; 60..140 is far outside any plausible fluctuation of a fair draw.
  for (const [game, c] of Object.entries(counts)) assert.ok(c > 60 && c < 140, `${game}: ${c}`);
});

test("F2: disabled games are never drawn; a one-game pool always gives that game (repeat allowed)", async () => {
  const db = await migrated();
  await db.query("UPDATE public.minigame_break_games SET enabled = (game_key IN ('husk', 'slope'))");
  const counts = await drawMany(db, 60);
  assert.deepEqual(Object.keys(counts).sort(), ["husk", "slope"]);
  await db.query("UPDATE public.minigame_break_games SET enabled = (game_key = 'naal')");
  assert.deepEqual(await drawMany(db, 5), { naal: 5 });
});

// ── Gruppe G: ingen belønning fra minispil — Stabels mønt-RPC lukket ─────────────────────────────────

const STABEL = "supabase/migrations/20260928000000_stabel_reward.sql";

// The fixture plus student_progress and the REAL Stabel migration of 2026-09-28, as production has it.
async function withStabel() {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(`CREATE TABLE public.student_progress (student_id uuid PRIMARY KEY, xp int NOT NULL DEFAULT 0,
    coins int NOT NULL DEFAULT 0, mastery int NOT NULL DEFAULT 0);
    ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
    INSERT INTO public.student_progress VALUES ('${P1}', 120, 40, 7), ('${P2}', 0, 0, 0);`);
  await db.exec(read(STABEL));
  return db;
}
const claim = (db, role, sub, plates = 30) =>
  as(db, role, sub, `SELECT public.claim_stabel_reward(${plates}) AS r`);
const progress = async (db, id) =>
  (await db.query(`SELECT xp, coins, mastery FROM public.student_progress WHERE student_id = '${id}'`)).rows[0];

test("G1: positive control — before D-347 a pupil can call claim_stabel_reward directly and is paid", async () => {
  const db = await withStabel();
  const r = await claim(db, "authenticated", P1);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.rows[0].r.coins, 30);
  assert.deepEqual(await progress(db, P1), { xp: 120, coins: 70, mastery: 7 });
});

test("G2: after D-347 no API role can call claim_stabel_reward — anon, a pupil, service_role", async () => {
  const db = await withStabel();
  await claim(db, "authenticated", P1);                     // history: 30 coins paid before the change
  await db.exec(read(FILE));
  for (const [role, sub] of [["authenticated", P1], ["authenticated", P2], ["anon", null], ["service_role", null]]) {
    const r = await claim(db, role, sub);
    assert.equal(r.ok, false, role);
    assert.match(r.message, /permission denied for function claim_stabel_reward/, role);
  }
  const acl = (await db.query(`SELECT proacl::text AS a FROM pg_proc WHERE oid = 'public.claim_stabel_reward(integer)'::regprocedure`)).rows[0].a;
  assert.equal(acl, "{postgres=X/postgres}", "only the owner keeps EXECUTE");
});

test("G3: closing it pays nothing and takes nothing: coins, XP, mastery and the ledger history are untouched", async () => {
  const db = await withStabel();
  await claim(db, "authenticated", P1);
  const before = await progress(db, P1);
  const ledger = async () => (await db.query("SELECT student_id, reward_date, coins_today FROM public.stabel_daily_rewards ORDER BY 1")).rows;
  const ledgerBefore = await ledger();
  await db.exec(read(FILE));
  for (let i = 0; i < 3; i++) await claim(db, "authenticated", P1, 50);
  assert.deepEqual(await progress(db, P1), before);
  assert.deepEqual(await progress(db, P2), { xp: 0, coins: 0, mastery: 0 });
  assert.deepEqual(await ledger(), ledgerBefore, "every historical row is kept");
  assert.ok(ledgerBefore.length === 1 && ledgerBefore[0].coins_today === 30);
  // The function itself still exists (for the record and a possible owner-approved rollback).
  assert.equal((await db.query("SELECT to_regprocedure('public.claim_stabel_reward(integer)') IS NOT NULL AS x")).rows[0].x, true);
});

test("G4: a whole break — offer, 'Ja tak', Stabel started and finished — moves no XP, coins or mastery", async () => {
  const db = await withStabel();
  await db.exec(read(FILE));
  await db.query("UPDATE public.minigame_break_games SET enabled = (game_key = 'stabel')");
  await setProgress(db, P1, 1199, 600);
  const before = await progress(db, P1);
  const r = await afterAnswer(db, P1, await answered(db, P1, 100, 0));
  assert.deepEqual(r.offer.game, "stabel", "Stabel can still be drawn");
  await respond(db, P1, r.offer.id, true);
  assert.equal((await start(db, P1, r.offer.id, "stabel")).status, "ok");
  assert.equal((await claim(db, "authenticated", P1, 50)).ok, false, "a forged end-of-round claim is refused");
  await finish(db, P1, r.offer.id, "completed");
  assert.deepEqual(await progress(db, P1), before);
});

test("G5: the migration runs on a database without Stabel's function (guarded), and re-runs cleanly", async () => {
  const db = await migrated();                               // FIXTURE has no claim_stabel_reward
  await db.exec(read(FILE));
  const withIt = await withStabel();
  await withIt.exec(read(FILE));
  await withIt.exec(read(FILE));
  assert.equal((await claim(withIt, "authenticated", P1)).ok, false);
});

test("G6: no minigame function writes XP, coins or mastery — the migration never names student_progress", () => {
  const code = read(FILE).replace(/--.*$/gm, "");
  assert.equal(/student_progress/.test(code), false);
  assert.equal(/\b(xp|coins|mastery)\b/i.test(code), false);
});
