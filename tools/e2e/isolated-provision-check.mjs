#!/usr/bin/env node
// A4 mod den RIGTIGE lokale Supabase (GoTrue + PostgREST) i den isolerede CI-bane — aldrig mod produktion.
//
// Kører i .github/workflows/isolated-e2e.yml efter suiten (produktionsbanen), inde i netværkslåsens gruppe.
// Stopper med det samme, hvis isolationsguarden (tests/isolated/isolation-guard.mjs) ikke godkender miljøet,
// eller hvis URL'en ikke er loopback. Bruger slots 1–3 med egne syntetiske @e2e.invalid-adresser, så suitens
// slot-0-konti aldrig berøres.
//
// Scenarier (provision-accounts.mjs's main() kaldes direkte, med et miljø bygget her — aldrig process.env):
//   slot 1: dry-run (4 × opret, intet skrevet) → apply uden/med forkert bekræftelse (exit 2, intet skrevet)
//           → apply (4 konti, verificeret) → dry-run (alle klar) → apply igen (intet skrevet)
//   slot 2: en UMARKERET konto på lærerens adresse → apply afvises, intet skrevet, kontoen uændret
//   slot 3: ejeren er oprettet markeret UDEN profil (afbrudt kørsel) → apply genoptager og verificerer
// Logger kun kontotyper, antal og exitkoder.

import { assertIsolated } from "../../tests/isolated/isolation-guard.mjs";
import { MARKER_KEY, expectedMarker, ownerAddressFor } from "../../tests/e2e-accounts.mjs";
import { slotEmail } from "../../tests/e2e-slot.mjs";
import { main, confirmationFor, ISOLATED_ENV } from "./provision-accounts.mjs";

assertIsolated(process.env);
const URL_ = process.env.ISOLATED_SUPABASE_URL;
const KEY = process.env.ISOLATED_SUPABASE_SERVICE_KEY;
const loopback = (() => { try { const u = new URL(URL_); return u.hostname === "127.0.0.1" || u.hostname === "localhost"; } catch { return false; } })();
if (!loopback || typeof KEY !== "string" || KEY === "") {
  console.log("::error::isolated-provision-check: kræver loopback ISOLATED_SUPABASE_URL og den lokale nøgle");
  process.exit(2);
}

const BASE = { primary: "a4-elev@e2e.invalid", teacher: "a4-laerer@e2e.invalid", student2: "a4-elev2@e2e.invalid" };
const envFor = (slot) => ({
  ISOLATED_SUITE: "1",
  [ISOLATED_ENV.url]: URL_,
  [ISOLATED_ENV.key]: KEY,
  [ISOLATED_ENV.primary]: BASE.primary,
  [ISOLATED_ENV.teacher]: BASE.teacher,
  [ISOLATED_ENV.student2]: BASE.student2,
  E2E_SLOT: String(slot),
});

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function allUsers() {
  const out = [];
  for (let page = 1; page <= 100; page++) {
    const res = await fetch(`${URL_}/auth/v1/admin/users?page=${page}&per_page=200`, { headers, redirect: "error" });
    if (!res.ok) throw new Error(`list users: status ${res.status}`);
    const users = (await res.json()).users ?? [];
    if (users.length === 0) return out;
    out.push(...users);
  }
  throw new Error("list users: too many pages");
}
async function profileCount() {
  const res = await fetch(`${URL_}/rest/v1/profiles?select=id`, { headers: { ...headers, Prefer: "count=exact" }, redirect: "error" });
  if (!res.ok) throw new Error(`profiles: status ${res.status}`);
  return (await res.json()).length;
}
// Test fixture writes, LOCAL stack only (the guard above has run).
async function createRawUser(email, appMetadata) {
  const res = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: "POST", headers, redirect: "error", body: JSON.stringify({ email, email_confirm: true, app_metadata: appMetadata }),
  });
  if (!res.ok) throw new Error(`fixture createUser: status ${res.status}`);
  return (await res.json()).id;
}

async function profilesById(idList) {
  const ids = idList.filter((x) => typeof x === "string").join(",");
  const res = await fetch(`${URL_}/rest/v1/profiles?select=id,role,teacher_id&id=in.(${ids})`, { headers, redirect: "error" });
  if (!res.ok) throw new Error(`profiles: status ${res.status}`);
  return res.json();
}
// A write that MUST be refused by the stack (duplicate). Returns the status only.
async function rawPost(path, body) {
  const res = await fetch(`${URL_}${path}`, { method: "POST", headers: { ...headers, Prefer: "return=minimal" }, redirect: "error", body: JSON.stringify(body) });
  await res.text();
  return res.status;
}

let failures = 0;
const check = (cond, what) => {
  console.log(`${cond ? "ok  " : "FEJL"} ${what}`);
  if (!cond) failures++;
};
const quiet = { log: () => {} };
const snapshot = async () => ({ users: (await allUsers()).length, profiles: await profileCount() });
const same = (a, b) => a.users === b.users && a.profiles === b.profiles;

// ── slot 1: dry-run, refused apply, apply, idempotence ──────────────────────────────────────────
{
  const env = envFor(1);
  const s0 = await snapshot();
  const dry = await main([], env, quiet);
  check(dry.exitCode === 0 && dry.lines.filter((l) => /— oprettes/.test(l)).length === 4, "slot 1 dry-run: fire konti planlagt");
  check(same(s0, await snapshot()), "slot 1 dry-run: intet skrevet");
  const noConfirm = await main(["--mode=apply"], env, quiet);
  const wrongSlot = await main(["--mode=apply", `--confirm=${confirmationFor(0)}`], env, quiet);
  check(noConfirm.exitCode === 2 && wrongSlot.exitCode === 2, "slot 1 apply uden eller med forkert bekræftelse: exit 2");
  check(same(s0, await snapshot()), "slot 1 afvist apply: intet skrevet");
  const apply = await main(["--mode=apply", `--confirm=${confirmationFor(1)}`], env, quiet);
  const s1 = await snapshot();
  check(apply.exitCode === 0 && s1.users === s0.users + 4 && s1.profiles === s0.profiles + 4, "slot 1 apply: fire konti og fire profiler, verificeret");
  const users = await allUsers();
  const expected = [slotEmail(BASE.primary, 1), slotEmail(BASE.teacher, 1), slotEmail(BASE.student2, 1), ownerAddressFor(slotEmail(BASE.teacher, 1), 1)];
  check(expected.every((e) => users.some((u) => u.email === e && u.app_metadata?.[MARKER_KEY]?.slot === 1)), "slot 1: alle fire adresser bærer slot 1-markøren");
  // The final state, read directly: roles, markers and teacher–pupil relations.
  const byEmail = new Map(users.map((u) => [u.email, u]));
  const ids = { primary: byEmail.get(expected[0])?.id, teacher: byEmail.get(expected[1])?.id, student2: byEmail.get(expected[2])?.id, owner: byEmail.get(expected[3])?.id };
  const profs = await profilesById(Object.values(ids));
  const p = (k) => profs.find((r) => r.id === ids[k]);
  check(["primary", "teacher", "student2", "owner"].every((k) => {
    const m = byEmail.get(expected[["primary", "teacher", "student2", "owner"].indexOf(k)])?.app_metadata?.[MARKER_KEY];
    return m && m.v === 1 && m.slot === 1 && m.kind === k && Object.keys(m).length === 3;
  }), "slot 1: præcis markør { v: 1, slot: 1, kind } på alle fire");
  check(p("owner")?.role === "teacher" && p("owner")?.teacher_id === null && p("teacher")?.role === "teacher" && p("teacher")?.teacher_id === null
    && p("student2")?.role === "student" && p("student2")?.teacher_id === ids.teacher && p("primary")?.role === "student" && p("primary")?.teacher_id === ids.owner,
    "slot 1: roller og lærer-elev-relationer som i registret");
  // Database identities that stop a concurrent second run: GoTrue keeps addresses unique, profiles.id is the key.
  const dupUser = await rawPost("/auth/v1/admin/users", { email: expected[1], email_confirm: true, app_metadata: { [MARKER_KEY]: expectedMarker(1, "teacher") } });
  const dupProfile = await rawPost("/rest/v1/profiles", { id: ids.teacher, role: "student", full_name: "dublet" });
  check(dupUser >= 400 && dupProfile >= 400 && same(s1, await snapshot()), `slot 1: dublet-konto (${dupUser}) og dublet-profil (${dupProfile}) afvises af stakken, intet ændret`);
  check((await profilesById([ids.teacher]))[0]?.role === "teacher", "slot 1: lærerens profil er uændret efter dublet-forsøget");
  const again = await main([], env, quiet);
  check(again.exitCode === 0 && again.lines.some((l) => /alle fire konti er klar/.test(l)), "slot 1 dry-run efter apply: alle klar");
  const reapply = await main(["--mode=apply", `--confirm=${confirmationFor(1)}`], env, quiet);
  check(reapply.exitCode === 0 && same(s1, await snapshot()), "slot 1 apply igen: intet skrevet");
}

// ── slot 2: an UNMARKED account at a configured address is never adopted ────────────────────────
{
  const env = envFor(2);
  const teacherAddr = slotEmail(BASE.teacher, 2);
  const id = await createRawUser(teacherAddr, {});
  const s0 = await snapshot();
  const res = await main(["--mode=apply", `--confirm=${confirmationFor(2)}`], env, quiet);
  check(res.exitCode === 1 && res.lines.some((l) => /teacher: adressen findes allerede UDEN markør/.test(l)), "slot 2: umarkeret konto afvist");
  check(same(s0, await snapshot()), "slot 2: intet skrevet");
  const after = (await allUsers()).find((u) => u.id === id);
  check(after && after.app_metadata?.[MARKER_KEY] === undefined && after.email === teacherAddr, "slot 2: den umarkerede konto er uændret");
}

// ── slot 3: a marked account without a profile (interrupted run) is resumed ─────────────────────
{
  const env = envFor(3);
  await createRawUser(ownerAddressFor(slotEmail(BASE.teacher, 3), 3), { [MARKER_KEY]: expectedMarker(3, "owner") });
  const s0 = await snapshot();
  const plan = await main([], env, quiet);
  check(plan.exitCode === 0 && plan.lines.some((l) => /owner — findes markeret uden profil/.test(l)), "slot 3 dry-run: ejeren genoptages");
  const res = await main(["--mode=apply", `--confirm=${confirmationFor(3)}`], env, quiet);
  const s1 = await snapshot();
  check(res.exitCode === 0 && s1.users === s0.users + 3 && s1.profiles === s0.profiles + 4, "slot 3 apply: ejerens profil + tre nye konti, verificeret");
}

if (failures > 0) {
  console.log(`::error::isolated-provision-check: ${failures} kontrol(ler) fejlede`);
  process.exitCode = 1;
} else {
  console.log("isolated-provision-check: alle kontroller bestået");
}
