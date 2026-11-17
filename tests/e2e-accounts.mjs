// THE ONE E2E ACCOUNT REGISTRY (A1) AND ITS FAIL-CLOSED VERIFICATION (A2).
//
// Every live account the Playwright suite may touch is named here, and nowhere else:
//
//   kind      address                          role     relation
//   primary   TEST_STUDENT_EMAIL               student  teacher_id = owner
//   teacher   TEST_TEACHER_EMAIL               teacher  —
//   student2  TEST_STUDENT2_EMAIL              student  teacher_id = teacher
//   owner     derived from the teacher address teacher  — (no password; anchors the primary pupil)
//
// A1 — addresses:
//   - there are NO defaults. Every address comes explicitly from the environment; a missing one
//     stops the run before any network call;
//   - every address must be on a domain Lærlig controls (LAERLIG_DOMAIN). The isolated stack
//     (tests/isolated, a loopback Supabase that is thrown away after the run) uses its synthetic
//     ISOLATED_DOMAIN instead, and only when ISOLATED_SUITE=1 and SUPABASE_URL is a loopback URL;
//   - slot 0 follows the same rules as slots 1..3: four accounts, including its own password-less
//     owner teacher (`<teacher-local>+e2e-slot-0-owner@<domain>`), all carrying the marker below.
//
// A2 — verification, before the suite writes anything:
//   - each account must already exist. Nothing here (or in global-setup) creates an account:
//     provisioning is a separate, explicitly authorised step;
//   - each account carries app_metadata.laerlig_e2e = { v: 1, slot, kind } exactly. app_metadata is
//     writable only with the service-role key, so the marker proves the account was provisioned as
//     this slot's account of this kind. An unmarked or differently marked account stops the run,
//     and is never modified;
//   - roles and relations are as in the table above, and the two teachers have no other pupils;
//   - the four ids are distinct UUIDs.
//   The result is published in E2E_VERIFIED_ACCOUNTS. The guarded admin client (tests/e2e-guard.mjs)
//   refuses to exist without it, only writes to those four ids, and in a spec re-runs this
//   verification before its first write (tests/e2e-admin.mjs).
//
// Logged: kinds, slot, user ids and fixed Danish problem texts. Never an address or a password.
// Plain ESM with no dependencies (global-setup, helpers, the isolated seed and the unit tests).

export const MARKER_KEY = "laerlig_e2e";
export const MARKER_VERSION = 1;
export const ACCOUNT_KINDS = Object.freeze(["primary", "teacher", "student2", "owner"]);
export const EXPECTED_ROLE = Object.freeze({ primary: "student", teacher: "teacher", student2: "student", owner: "teacher" });
// Relation: pupil kind → the kind of its teacher.
export const TEACHER_OF = Object.freeze({ primary: "owner", student2: "teacher" });
export const ADDRESS_ENV = Object.freeze({ primary: "TEST_STUDENT_EMAIL", teacher: "TEST_TEACHER_EMAIL", student2: "TEST_STUDENT2_EMAIL" });
export const OWNER_ENV = "E2E_SLOT_OWNER_TEACHER_EMAIL"; // set by tests/e2e-slot.mjs for slots 1..3
export const LAERLIG_DOMAIN = "xn--lrlig-sra.dk"; // lærlig.dk
export const ISOLATED_DOMAIN = "e2e.invalid";
export const VERIFIED_ENV = "E2E_VERIFIED_ACCOUNTS";
export const SLOT_TAG = "+e2e-slot-";
export const MAX_PAGES = 100;
export const PAGE_SIZE = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);

export class E2EAccountError extends Error {
  constructor(problems) {
    const list = Array.isArray(problems) ? problems : [String(problems)];
    super(`E2E-konti: ${list.length} problem(er) — kørslen stoppes før skrivning:\n  - ${list.join("\n  - ")}`);
    this.name = "E2EAccountError";
    this.problems = Object.freeze([...list]);
  }
}

function parseSlotValue(raw) {
  if (raw === undefined || raw === null) return 0;
  const t = String(raw).trim();
  if (t === "") return 0;
  if (t.length === 1 && t >= "0" && t <= "3") return Number(t);
  throw new E2EAccountError([`E2E_SLOT er ugyldig (skal være 0, 1, 2 eller 3)`]);
}

function isLoopbackUrl(value) {
  try {
    const u = new URL(String(value ?? ""));
    return (u.protocol === "http:" || u.protocol === "https:")
      && (u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]");
  } catch {
    return false;
  }
}

// The domain test accounts must use in this run.
export function allowedDomain(env = process.env) {
  if (env.ISOLATED_SUITE === "1") {
    if (!isLoopbackUrl(env.SUPABASE_URL)) {
      throw new E2EAccountError(["ISOLATED_SUITE=1 kræver, at SUPABASE_URL er en loopback-URL"]);
    }
    return ISOLATED_DOMAIN;
  }
  return LAERLIG_DOMAIN;
}

function asciiDomain(domain) {
  try {
    return new URL(`http://${domain}/`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// Problems with one address (fixed texts naming the variable, never the value).
export function addressProblems(name, value, domain) {
  if (typeof value !== "string" || value === "") return [`${name}: mangler (ingen standardværdi)`];
  const out = [];
  if (value !== value.trim()) out.push(`${name}: har mellemrum eller linjeskift før eller efter adressen`);
  const address = value.trim();
  if (/\s/.test(address)) out.push(`${name}: indeholder mellemrum`);
  const at = address.indexOf("@");
  if (at < 1 || at !== address.lastIndexOf("@") || at === address.length - 1) {
    out.push(`${name}: er ikke en adresse af formen lokal@domæne`);
    return out;
  }
  const host = asciiDomain(address.slice(at + 1));
  if (host === null || host !== domain) out.push(`${name}: er ikke på det tilladte domæne ${domain}`);
  return out;
}

// One address variable, for code that needs a single address before global-setup has run (the
// specs' login helpers). No default: missing or blank throws. The full rules (domain, slot,
// distinctness) are applied by resolveAccountRegistry() in global-setup before any spec runs.
export function requiredAddress(name, env = process.env) {
  if (!Object.values(ADDRESS_ENV).includes(name)) throw new E2EAccountError([`${name}: er ikke en kendt adressevariabel`]);
  const value = env[name];
  if (typeof value !== "string" || value.trim() === "") throw new E2EAccountError([`${name}: mangler (ingen standardværdi)`]);
  return value.trim();
}

const lower = (s) => s.trim().toLowerCase();

export function ownerAddressFor(teacherAddress, slot) {
  const address = teacherAddress.trim();
  const at = address.indexOf("@");
  let local = address.slice(0, at);
  const tag = `${SLOT_TAG}${slot}`;
  if (slot > 0 && local.toLowerCase().endsWith(tag)) local = local.slice(0, local.length - tag.length);
  return `${local}${tag}-owner${address.slice(at)}`;
}

// A1: the four accounts of this run's slot. Throws E2EAccountError naming every problem at once,
// before any network call. Returns a frozen registry.
export function resolveAccountRegistry(env = process.env) {
  const problems = [];
  const slot = parseSlotValue(env.E2E_SLOT);
  const domain = allowedDomain(env);
  const accounts = {};
  for (const kind of ["primary", "teacher", "student2"]) {
    const name = ADDRESS_ENV[kind];
    const p = addressProblems(name, env[name], domain);
    problems.push(...p);
    if (p.length === 0) accounts[kind] = env[name].trim();
  }
  for (const kind of ["primary", "teacher", "student2"]) {
    const a = accounts[kind];
    if (a === undefined) continue;
    const local = a.slice(0, a.indexOf("@")).toLowerCase();
    if (slot === 0 && local.includes(SLOT_TAG)) problems.push(`${ADDRESS_ENV[kind]}: slot 0 må ikke bruge en slot-adresse`);
    if (slot > 0 && !local.endsWith(`${SLOT_TAG}${slot}`)) problems.push(`${ADDRESS_ENV[kind]}: er ikke slot ${slot}s adresse`);
  }
  if (accounts.teacher !== undefined) {
    const derived = ownerAddressFor(accounts.teacher, slot);
    if (slot > 0) {
      const configured = env[OWNER_ENV];
      if (typeof configured !== "string" || lower(configured) !== lower(derived)) {
        problems.push(`${OWNER_ENV}: svarer ikke til slot ${slot}s ejer-lærer`);
      }
    }
    accounts.owner = derived;
  }
  const seen = new Map();
  for (const [kind, a] of Object.entries(accounts)) {
    const k = lower(a);
    if (seen.has(k)) problems.push(`${kind} og ${seen.get(k)}: har samme adresse`);
    else seen.set(k, kind);
  }
  if (problems.length > 0) throw new E2EAccountError(problems);
  return Object.freeze({
    slot,
    domain,
    accounts: Object.freeze(Object.fromEntries(ACCOUNT_KINDS.map((kind) => [kind, Object.freeze({
      kind, email: accounts[kind], role: EXPECTED_ROLE[kind],
    })]))),
  });
}

export function expectedMarker(slot, kind) {
  return { v: MARKER_VERSION, slot, kind };
}

// True only for app_metadata.laerlig_e2e === { v: 1, slot, kind }, with no other keys.
export function hasExactMarker(user, slot, kind) {
  const meta = user && typeof user === "object" ? user.app_metadata : null;
  const marker = meta && typeof meta === "object" ? meta[MARKER_KEY] : null;
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) return false;
  const keys = Object.keys(marker).sort();
  if (keys.join(",") !== "kind,slot,v") return false;
  return marker.v === MARKER_VERSION && marker.slot === slot && marker.kind === kind;
}

// A2: verify the registry's accounts against the live project. READ-ONLY: the deps can only list
// users and select profiles. Throws E2EAccountError with every problem; returns the frozen
// verified record { v, slot, ids: {kind: id}, roles: {id: role} } on success.
//   deps.listUsers({ page, perPage }) → { data: { users }, error }
//   deps.selectProfilesByIds(ids)     → { data: [{ id, role, teacher_id }], error }
//   deps.selectPupilsOfTeachers(ids)  → { data: [{ id, teacher_id }], error }
export async function verifyAccounts(registry, deps) {
  if (!registry || !registry.accounts) throw new E2EAccountError(["registret mangler"]);
  const { slot, accounts } = registry;
  const wanted = new Map(ACCOUNT_KINDS.map((kind) => [lower(accounts[kind].email), kind]));
  const found = {};
  const problems = [];

  let complete = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await deps.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new E2EAccountError(["listUsers fejlede (ingen kontrol mulig)"]);
    const users = Array.isArray(data?.users) ? data.users : null;
    if (users === null) throw new E2EAccountError(["listUsers gav et ugyldigt svar"]);
    for (const u of users) {
      const email = typeof u?.email === "string" ? lower(u.email) : null;
      const kind = email === null ? undefined : wanted.get(email);
      if (kind === undefined) continue;
      if (found[kind]) problems.push(`${kind}: adressen findes på mere end én konto`);
      else found[kind] = u;
    }
    // Stop only at an EMPTY page: the server may return fewer than PAGE_SIZE per page.
    if (users.length === 0) { complete = true; break; }
  }
  if (!complete) throw new E2EAccountError([`brugerlisten blev ikke gennemløbet inden for ${MAX_PAGES} sider`]);

  for (const kind of ACCOUNT_KINDS) {
    const u = found[kind];
    if (!u) { problems.push(`${kind}: kontoen findes ikke — den oprettes aldrig af testkørslen (kræver separat provisionering)`); continue; }
    if (!isUuid(u.id)) problems.push(`${kind}: har ikke et gyldigt bruger-id`);
    if (!hasExactMarker(u, slot, kind)) {
      problems.push(`${kind} (${isUuid(u.id) ? u.id : "?"}): mangler markøren app_metadata.${MARKER_KEY} = { v: ${MARKER_VERSION}, slot: ${slot}, kind: "${kind}" } — kontoen ændres ikke`);
    }
  }
  if (problems.length > 0) throw new E2EAccountError(problems);

  const ids = Object.fromEntries(ACCOUNT_KINDS.map((kind) => [kind, found[kind].id]));
  if (new Set(Object.values(ids)).size !== ACCOUNT_KINDS.length) throw new E2EAccountError(["to konti har samme bruger-id"]);

  const { data: profiles, error: profErr } = await deps.selectProfilesByIds(Object.values(ids));
  if (profErr || !Array.isArray(profiles)) throw new E2EAccountError(["profilerne kunne ikke læses"]);
  const byId = new Map(profiles.map((p) => [p?.id, p]));
  for (const kind of ACCOUNT_KINDS) {
    const p = byId.get(ids[kind]);
    if (!p) { problems.push(`${kind} (${ids[kind]}): har ingen profil`); continue; }
    if (p.role !== EXPECTED_ROLE[kind]) problems.push(`${kind} (${ids[kind]}): har rollen ${JSON.stringify(p.role)}, forventet "${EXPECTED_ROLE[kind]}"`);
  }
  for (const [pupil, teacherKind] of Object.entries(TEACHER_OF)) {
    const p = byId.get(ids[pupil]);
    if (p && p.teacher_id !== ids[teacherKind]) problems.push(`${pupil} (${ids[pupil]}): tilhører ikke ${teacherKind}`);
  }
  for (const kind of ["teacher", "owner"]) {
    const p = byId.get(ids[kind]);
    if (p && p.teacher_id !== null && p.teacher_id !== undefined) problems.push(`${kind} (${ids[kind]}): har selv en lærer`);
  }
  const { data: pupils, error: pupErr } = await deps.selectPupilsOfTeachers([ids.teacher, ids.owner]);
  if (pupErr || !Array.isArray(pupils)) throw new E2EAccountError(["lærernes elever kunne ikke læses"]);
  for (const [pupil, teacherKind] of Object.entries(TEACHER_OF)) {
    const mine = pupils.filter((r) => r?.teacher_id === ids[teacherKind]).map((r) => r.id).sort();
    if (mine.length !== 1 || mine[0] !== ids[pupil]) {
      problems.push(`${teacherKind} (${ids[teacherKind]}): skal have præcis én elev, ${pupil} — har ${mine.length}`);
    }
  }
  if (problems.length > 0) throw new E2EAccountError(problems);

  return Object.freeze({
    v: MARKER_VERSION,
    slot,
    ids: Object.freeze(ids),
    roles: Object.freeze(Object.fromEntries(ACCOUNT_KINDS.map((kind) => [ids[kind], EXPECTED_ROLE[kind]]))),
  });
}

export function publishVerified(env, verified) {
  env[VERIFIED_ENV] = JSON.stringify({ v: verified.v, slot: verified.slot, ids: verified.ids });
}

// Read and re-validate the record published by global-setup. Throws when it is missing, malformed,
// for another slot, or not four distinct UUIDs: the guarded admin client cannot exist without it.
export function readVerified(env = process.env) {
  const raw = env[VERIFIED_ENV];
  if (typeof raw !== "string" || raw === "") {
    throw new E2EAccountError([`${VERIFIED_ENV} mangler — kontiene er ikke verificeret af global-setup`]);
  }
  let rec;
  try {
    rec = JSON.parse(raw);
  } catch {
    throw new E2EAccountError([`${VERIFIED_ENV} er ikke gyldig JSON`]);
  }
  const problems = [];
  if (!rec || typeof rec !== "object" || rec.v !== MARKER_VERSION) problems.push(`${VERIFIED_ENV}: forkert version`);
  const slot = parseSlotValue(env.E2E_SLOT);
  if (rec?.slot !== slot) problems.push(`${VERIFIED_ENV}: gælder ikke slot ${slot}`);
  const ids = rec?.ids && typeof rec.ids === "object" ? rec.ids : {};
  const keys = Object.keys(ids).sort().join(",");
  if (keys !== [...ACCOUNT_KINDS].sort().join(",")) problems.push(`${VERIFIED_ENV}: skal have præcis de fire kontotyper`);
  for (const kind of ACCOUNT_KINDS) if (!isUuid(ids[kind])) problems.push(`${VERIFIED_ENV}: ${kind} er ikke et UUID`);
  if (new Set(ACCOUNT_KINDS.map((k) => ids[k])).size !== ACCOUNT_KINDS.length) problems.push(`${VERIFIED_ENV}: id'erne er ikke forskellige`);
  if (problems.length > 0) throw new E2EAccountError(problems);
  const frozenIds = Object.freeze(Object.fromEntries(ACCOUNT_KINDS.map((k) => [k, ids[k]])));
  return Object.freeze({
    v: MARKER_VERSION,
    slot,
    ids: frozenIds,
    roles: Object.freeze(Object.fromEntries(ACCOUNT_KINDS.map((kind) => [frozenIds[kind], EXPECTED_ROLE[kind]]))),
  });
}
