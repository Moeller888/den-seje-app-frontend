#!/usr/bin/env node
// A4: SEPARAT, EKSPLICIT GODKENDT PROVISIONERING AF DE FIRE MARKEREDE E2E-TESTKONTI.
//
// Kontoregistret (tests/e2e-accounts.mjs, A1/A2) siger, hvilke fire konti en slot har, og global-setup
// opretter aldrig selv en konto. Dette værktøj er det ene sted, de fire konti kan oprettes:
//
//   kind      rolle    relation                  adgangskode
//   owner     teacher  —                         ingen (ingen kan logge ind som den)
//   teacher   teacher  —                         ingen her (se nedenfor)
//   student2  student  teacher_id = teacher      ingen her
//   primary   student  teacher_id = owner        ingen her
//
// Kontiene oprettes UDEN adgangskode. global-setup sætter de konfigurerede adgangskoder på primary,
// teacher og student2 gennem den beskyttede klient, når kontiene er verificeret (A2/A3). Værktøjet
// kender derfor ingen adgangskode, beder aldrig om en og kan ikke lække en.
//
// Tilstande (standard er dry-run):
//   --mode=dry-run   (standard) læser brugerlisten og profilerne og viser planen. Kun GET: HTTP-laget
//                    afviser enhver anden metode, før fetch kaldes.
//   --mode=apply     opretter de manglende konti. Kræver --confirm=provision-accounts-slot-<n> for netop
//                    denne slot. Mod produktion kræver ALLE kørsler desuden, at processen er det manuelt
//                    startede e2e-prod-workflow på main (se requireProductionContext): et lokalt kald med
//                    produktionsnøglen stopper før første netværkskald, også i dry-run.
//
// Regler for planen (planProvisioning), som stopper hele kørslen FØR første skrivning:
//   - en adresse, der findes på mere end én konto;
//   - en eksisterende konto på en af de fire adresser UDEN præcis markøren app_metadata.laerlig_e2e =
//     { v: 1, slot, kind }: den overtages, omdøbes, nulstilles og slettes aldrig;
//   - en konto, der er markeret som denne slots konto af en type, men har en anden adresse;
//   - en markeret konto, hvis profil har en anden rolle eller relation end forventet;
//   - en markeret lærer, der har en elev, som ikke er slottens egen elev;
//   - to konti med samme bruger-id.
// Eksisterende, korrekt markerede konti med korrekt profil genbruges uændret.
//
// Delvis oprettelse og genoptagelse: en konto oprettes i ÉT kald med markøren (GoTrue admin create), og
// profilen indsættes i ét kald bagefter (INSERT, aldrig upsert). Afbrydes kørslen mellem de to kald,
// står kontoen markeret UDEN profil. Det er den eneste mellemtilstand, og den er registreret på serveren
// selv: markøren beviser, at netop dette værktøj oprettede kontoen til netop denne slot og type. Næste
// kørsel genoptager ved at indsætte profilen. Alt andet end "ingen profil" eller "præcis forventet profil"
// stopper kørslen. Der findes ingen oprydning og ingen sletning: værktøjet kan ikke slette en konto.
//
// Rækkefølge: owner → teacher → student2 → primary (en elev oprettes efter sin lærer). Efter sidste skridt
// verificeres alle fire konti med registrets egen verifyAccounts (samme kontrol som global-setup); den
// skal lykkes, ellers er exitkoden 1.
//
// Netværk: kun fetch, ingen afhængigheder (jobbet med service-nøglen kører ikke npm ci). Kun disse kald:
//   GET  /auth/v1/admin/users?page=<n>&per_page=<n>
//   GET  /rest/v1/profiles?select=id,role,teacher_id&id=in.(<uuid>,…)
//   GET  /rest/v1/profiles?select=id,teacher_id&teacher_id=in.(<uuid>,…)
//   POST /auth/v1/admin/users      (kun i apply; body: email, email_confirm, app_metadata.laerlig_e2e)
//   POST /rest/v1/profiles         (kun i apply; Prefer: return=minimal — aldrig merge-duplicates)
// Omdirigeringer følges aldrig, og hvert kald har en tidsgrænse.
//
// Logning: kontotype, handling, bruger-id (UUID) og faste danske tekster. Aldrig en adresse, en nøgle, en
// adgangskode eller et svar fra serveren. Eksisterende brugeres data læses kun for at finde de fire
// adresser og markøren; intet om andre brugere logges.
//
// Exitkoder: 0 = ok · 1 = afvist eller fejlet (intet skrevet efter en afvisning) · 2 = forkert kørselskontekst
// eller konfiguration (stoppet før første netværkskald).

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  ACCOUNT_KINDS, EXPECTED_ROLE, TEACHER_OF, MARKER_KEY, MAX_PAGES, PAGE_SIZE,
  E2EAccountError, expectedMarker, hasExactMarker, isUuid, resolveAccountRegistry, verifyAccounts,
} from "../../tests/e2e-accounts.mjs";
import { applySlotToEnv } from "../../tests/e2e-slot.mjs";
import { EXPECTED_HOST, SECRET_PREFIX as SECRET_KEY_PREFIX } from "../../.github/ci/e2e-prod-key-check.mjs";

export const EXIT = Object.freeze({ OK: 0, REFUSED: 1, CONTEXT: 2 });
export const MODES = Object.freeze(["dry-run", "apply"]);
export const CREATE_ORDER = Object.freeze(["owner", "teacher", "student2", "primary"]);
export const ENVIRONMENT_NAME = "e2e-prod";
export const ENVIRONMENT_MARKER = "E2E_PROD_ENVIRONMENT";
export const TIMEOUT_MS = 15_000;

// Produktion: navnene er de samme som secrets'enes navne i e2e-prod (workflowet mapper dem 1:1).
export const PROD_ENV = Object.freeze({
  url: "E2E_PROD_SUPABASE_URL",
  key: "E2E_PROD_SUPABASE_SERVICE_ROLE_KEY",
  primary: "E2E_PROD_TEST_STUDENT_EMAIL",
  teacher: "E2E_PROD_TEST_TEACHER_EMAIL",
  student2: "E2E_PROD_TEST_STUDENT2_EMAIL",
});
// Den isolerede stak (tests/isolated): loopback-URL, lokal nøgle, syntetiske @e2e.invalid-adresser.
export const ISOLATED_ENV = Object.freeze({
  url: "ISOLATED_SUPABASE_URL",
  key: "ISOLATED_SUPABASE_SERVICE_KEY",
  primary: "TEST_STUDENT_EMAIL",
  teacher: "TEST_TEACHER_EMAIL",
  student2: "TEST_STUDENT2_EMAIL",
});

export const confirmationFor = (slot) => `provision-accounts-slot-${slot}`;

export const PROFILE_NAMES = Object.freeze({
  owner: "E2E ejer-lærer",
  teacher: "E2E lærer",
  student2: "E2E elev 2",
  primary: "E2E elev",
});

export class ProvisionContextError extends Error {
  constructor(problems) {
    const list = Array.isArray(problems) ? problems : [String(problems)];
    super(`provisionering stoppet før første netværkskald:\n  - ${list.join("\n  - ")}`);
    this.name = "ProvisionContextError";
    this.problems = Object.freeze([...list]);
  }
}

export class ProvisionRefusedError extends Error {
  constructor(problems) {
    const list = Array.isArray(problems) ? problems : [String(problems)];
    super(`provisionering afvist — intet er skrevet efter afvisningen:\n  - ${list.join("\n  - ")}`);
    this.name = "ProvisionRefusedError";
    this.problems = Object.freeze([...list]);
  }
}

const lower = (s) => String(s).trim().toLowerCase();
const isSet = (v) => typeof v === "string" && v !== "";

// ── 1. argumenter ───────────────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const out = { mode: "dry-run", confirm: "" };
  const seen = new Set();
  const problems = [];
  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i++) {
    const arg = String(list[i]);
    const m = /^--(mode|confirm)(?:=(.*))?$/s.exec(arg);
    if (!m) { problems.push(`ukendt argument (kun --mode og --confirm er tilladt)`); continue; }
    const name = m[1];
    let value = m[2];
    if (value === undefined) {
      if (i + 1 >= list.length) { problems.push(`--${name} mangler en værdi`); continue; }
      value = String(list[++i]);
    }
    if (seen.has(name)) { problems.push(`--${name} er angivet mere end én gang`); continue; }
    seen.add(name);
    out[name] = value;
  }
  if (!MODES.includes(out.mode)) problems.push(`--mode skal være dry-run eller apply`);
  if (problems.length > 0) throw new ProvisionContextError(problems);
  return Object.freeze(out);
}

// ── 2. mål og kørselskontekst (før ethvert netværkskald) ────────────────────────────────────────

function isLoopbackUrl(value) {
  try {
    const u = new URL(String(value ?? ""));
    return (u.protocol === "http:" || u.protocol === "https:")
      && (u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]")
      && u.username === "" && u.password === "";
  } catch {
    return false;
  }
}

function isProductionUrl(value) {
  try {
    const u = new URL(String(value ?? ""));
    return u.protocol === "https:" && u.hostname === EXPECTED_HOST && u.port === ""
      && u.username === "" && u.password === "" && (u.pathname === "/" || u.pathname === "")
      && u.search === "" && u.hash === "" && String(value) === String(value).trim();
  } catch {
    return false;
  }
}

// Mod produktion: kun det manuelt startede workflow på main i environmentet e2e-prod. Variablen
// E2E_PROD_ENVIRONMENT findes kun på environment-niveau, så den er kun "e2e-prod" i et job, som
// environmentets beskyttelse (kun main, påkrævet reviewer) har sluppet igennem. Det er en kontrol, ikke
// selve sikkerhedsgrænsen: grænsen er environmentets regler i GitHub.
export function productionContextProblems(env) {
  const problems = [];
  if (env.GITHUB_ACTIONS !== "true") problems.push("produktion kun fra GitHub Actions (workflowet e2e-prod-provision.yml)");
  if (env[ENVIRONMENT_MARKER] !== ENVIRONMENT_NAME) problems.push(`jobbet kører ikke i environmentet ${ENVIRONMENT_NAME}`);
  if (env.GITHUB_EVENT_NAME !== "workflow_dispatch") problems.push("kun en manuel start (workflow_dispatch) må provisionere");
  if (env.GITHUB_REF !== "refs/heads/main") problems.push("kun fra branchen main");
  return problems;
}

// Returnerer { target, url, key, registry }. Kaster ProvisionContextError eller E2EAccountError.
export function resolveTarget(env, { slotRaw } = {}) {
  const source = env && typeof env === "object" ? env : {};
  const isolated = source.ISOLATED_SUITE === "1";
  const names = isolated ? ISOLATED_ENV : PROD_ENV;
  const problems = [];

  if (isolated) {
    for (const [k, v] of Object.entries(source)) {
      if (k.startsWith("E2E_PROD_") && isSet(v)) { problems.push("ISOLATED_SUITE=1 må ikke kombineres med E2E_PROD_-variabler"); break; }
    }
    if (!isLoopbackUrl(source[names.url])) problems.push(`${names.url} skal være en loopback-URL i den isolerede stak`);
  } else {
    problems.push(...productionContextProblems(source));
    if (!isProductionUrl(source[names.url])) problems.push(`${names.url} er ikke præcis https://${EXPECTED_HOST}`);
  }
  const key = source[names.key];
  if (!isSet(key)) problems.push(`${names.key} mangler`);
  else if (key !== key.trim() || /\s/.test(key)) problems.push(`${names.key} indeholder mellemrum eller linjeskift`);
  else if (!isolated && !key.startsWith(SECRET_KEY_PREFIX)) problems.push(`${names.key} har ikke formatet ${SECRET_KEY_PREFIX}…`);
  if (problems.length > 0) throw new ProvisionContextError(problems);

  // Registrets egne regler (domæne, slot, forskellige adresser) — på en kopi, aldrig process.env.
  const regEnv = {
    E2E_SLOT: slotRaw ?? source.E2E_SLOT,
    TEST_STUDENT_EMAIL: source[names.primary],
    TEST_TEACHER_EMAIL: source[names.teacher],
    TEST_STUDENT2_EMAIL: source[names.student2],
  };
  if (isolated) { regEnv.ISOLATED_SUITE = "1"; regEnv.SUPABASE_URL = source[names.url]; }
  try {
    applySlotToEnv(regEnv);
  } catch {
    // e2e-slot's fejltekster kan nævne en adresse; her bruges kun en fast tekst.
    throw new ProvisionContextError(["adresserne kunne ikke udledes for den valgte slot (mangler en adresse, eller er slot ugyldig?)"]);
  }
  const registry = resolveAccountRegistry(regEnv);
  return Object.freeze({ target: isolated ? "isolated" : "production", url: source[names.url], key, registry });
}

export function applyAuthorisationProblems(args, registry) {
  if (args.mode !== "apply") return [];
  if (args.confirm !== confirmationFor(registry.slot)) {
    return [`--mode=apply kræver --confirm=${confirmationFor(registry.slot)} (præcis denne slot)`];
  }
  return [];
}

// ── 3. HTTP-laget: kun de godkendte stier, kun GET i dry-run ─────────────────────────────────────

const LIST_USERS_RE = /^\/auth\/v1\/admin\/users\?page=[1-9][0-9]{0,3}&per_page=[1-9][0-9]{0,3}$/;
const UUID_LIST = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:,[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}){0,3}";
const PROFILES_BY_ID_RE = new RegExp(`^/rest/v1/profiles\\?select=id,role,teacher_id&id=in\\.\\(${UUID_LIST}\\)$`, "i");
const PUPILS_RE = new RegExp(`^/rest/v1/profiles\\?select=id,teacher_id&teacher_id=in\\.\\(${UUID_LIST}\\)$`, "i");
export const READ_PATTERNS = Object.freeze([LIST_USERS_RE, PROFILES_BY_ID_RE, PUPILS_RE]);
export const WRITE_PATHS = Object.freeze(["/auth/v1/admin/users", "/rest/v1/profiles"]);

export function isAllowedRequest(method, path, allowWrites) {
  if (method === "GET") return READ_PATTERNS.some((re) => re.test(path));
  if (method === "POST") return allowWrites === true && WRITE_PATHS.includes(path);
  return false;
}

// Én forespørgsel. Svaret returneres som { status, json }; body logges aldrig.
export function makeRequester({ url, key, fetchImpl, allowWrites }) {
  const origin = new URL(url).origin;
  if (typeof fetchImpl !== "function") throw new ProvisionContextError(["fetch mangler"]);
  return async function request(method, path, body) {
    if (!isAllowedRequest(method, path, allowWrites)) {
      throw new ProvisionRefusedError([`${method} ${path.split("?")[0]} er ikke tilladt${allowWrites ? "" : " i dry-run"}`]);
    }
    const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" };
    const init = { method, headers, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) };
    if (method === "POST") {
      headers["Content-Type"] = "application/json";
      if (path === "/rest/v1/profiles") headers.Prefer = "return=minimal";
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetchImpl(origin + path, init);
    } catch {
      throw new ProvisionRefusedError([`${method} ${path.split("?")[0]}: netværksfejl (ingen detaljer logges)`]);
    }
    let json = null;
    try {
      const text = await res.text();
      json = text === "" ? null : JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, json };
  };
}

const ok = (status) => status >= 200 && status < 300;
const uuidList = (ids) => {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 4 || !ids.every(isUuid)) {
    throw new ProvisionRefusedError(["ugyldig id-liste (kun 1–4 UUID'er)"]);
  }
  return ids.map((s) => s.toLowerCase()).join(",");
};

// Læsninger i samme form som registrets verifyAccounts forventer.
export function makeReadDeps(request) {
  return Object.freeze({
    async listUsers({ page, perPage }) {
      const { status, json } = await request("GET", `/auth/v1/admin/users?page=${page}&per_page=${perPage}`);
      if (!ok(status)) return { data: null, error: { status } };
      return { data: { users: Array.isArray(json?.users) ? json.users : null }, error: null };
    },
    async selectProfilesByIds(ids) {
      const { status, json } = await request("GET", `/rest/v1/profiles?select=id,role,teacher_id&id=in.(${uuidList(ids)})`);
      return ok(status) && Array.isArray(json) ? { data: json, error: null } : { data: null, error: { status } };
    },
    async selectPupilsOfTeachers(ids) {
      const { status, json } = await request("GET", `/rest/v1/profiles?select=id,teacher_id&teacher_id=in.(${uuidList(ids)})`);
      return ok(status) && Array.isArray(json) ? { data: json, error: null } : { data: null, error: { status } };
    },
  });
}

// De to eneste skrivninger. Begge bygger selv deres body; ingen kalder kan tilføje felter.
export function makeWriter(request) {
  return Object.freeze({
    async createMarkedUser({ email, slot, kind }) {
      const body = { email, email_confirm: true, app_metadata: { [MARKER_KEY]: expectedMarker(slot, kind) } };
      const { status, json } = await request("POST", "/auth/v1/admin/users", body);
      if (!ok(status) || !json || typeof json !== "object") return { user: null, error: { status } };
      return { user: json, error: null };
    },
    async insertProfile(row) {
      const { status } = await request("POST", "/rest/v1/profiles", row);
      return ok(status) ? { error: null } : { error: { status } };
    },
  });
}

// ── 4. plan (kun læsning) ────────────────────────────────────────────────────────────────────────

export function profileRow(kind, ids, slot) {
  const teacherKind = TEACHER_OF[kind];
  const teacherId = teacherKind === undefined ? null : ids[teacherKind];
  if (!isUuid(ids[kind]) || (teacherKind !== undefined && !isUuid(teacherId))) {
    throw new ProvisionRefusedError([`${kind}: profilen kan ikke bygges uden gyldige id'er`]);
  }
  return {
    id: ids[kind],
    role: EXPECTED_ROLE[kind],
    teacher_id: teacherId,
    full_name: `${PROFILE_NAMES[kind]} (slot ${slot})`,
    equipped_slots: {},
    active_theme: "default",
  };
}

const markerOf = (u) => {
  const meta = u && typeof u === "object" ? u.app_metadata : null;
  return meta && typeof meta === "object" && Object.prototype.hasOwnProperty.call(meta, MARKER_KEY) ? meta[MARKER_KEY] : undefined;
};

// Læser brugerlisten og profilerne og returnerer en frossen plan:
//   { slot, steps: [{ kind, action: "create" | "complete-profile" | "reuse", id }], problems: [] }
// Skriver aldrig: deps har kun læsninger.
export async function planProvisioning(registry, deps) {
  if (!registry || !registry.accounts) throw new ProvisionRefusedError(["registret mangler"]);
  const { slot, accounts } = registry;
  const kindByEmail = new Map(ACCOUNT_KINDS.map((kind) => [lower(accounts[kind].email), kind]));
  const found = {};
  const problems = [];

  let complete = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await deps.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new ProvisionRefusedError(["brugerlisten kunne ikke læses (ingen plan mulig)"]);
    const users = Array.isArray(data?.users) ? data.users : null;
    if (users === null) throw new ProvisionRefusedError(["brugerlisten gav et ugyldigt svar"]);
    for (const u of users) {
      const email = typeof u?.email === "string" ? lower(u.email) : null;
      const kind = email === null ? undefined : kindByEmail.get(email);
      if (kind !== undefined) {
        if (found[kind]) problems.push(`${kind}: adressen findes på mere end én konto`);
        else found[kind] = u;
      }
      // En konto, der er markeret som denne slots konto af en type, men har en anden adresse: to
      // "rigtige" konti af samme type må aldrig opstå (fx efter en ændret adresse).
      const m = markerOf(u);
      if (m && typeof m === "object" && m.slot === slot && ACCOUNT_KINDS.includes(m.kind) && email !== lower(accounts[m.kind].email)) {
        problems.push(`en konto (${isUuid(u?.id) ? u.id : "?"}) er markeret som slot ${slot}s ${m.kind}, men har ikke den konfigurerede adresse — intet oprettes`);
      }
    }
    if (users.length === 0) { complete = true; break; }
  }
  if (!complete) throw new ProvisionRefusedError([`brugerlisten blev ikke gennemløbet inden for ${MAX_PAGES} sider`]);

  for (const kind of ACCOUNT_KINDS) {
    const u = found[kind];
    if (!u) continue;
    if (!isUuid(u.id)) { problems.push(`${kind}: den eksisterende konto har ikke et gyldigt bruger-id`); continue; }
    if (!hasExactMarker(u, slot, kind)) {
      const what = markerOf(u) === undefined ? "findes allerede UDEN markør" : "findes allerede med en anden markør";
      problems.push(`${kind} (${u.id}): adressen ${what} — kontoen overtages, ændres og slettes aldrig`);
    }
  }
  if (problems.length > 0) return Object.freeze({ slot, steps: Object.freeze([]), problems: Object.freeze(problems) });

  const ids = {};
  for (const kind of ACCOUNT_KINDS) if (found[kind]) ids[kind] = found[kind].id.toLowerCase();
  const existing = Object.keys(ids);
  if (new Set(Object.values(ids)).size !== existing.length) problems.push("to konti har samme bruger-id");

  const profiles = new Map();
  if (existing.length > 0 && problems.length === 0) {
    const { data, error } = await deps.selectProfilesByIds(existing.map((k) => ids[k]));
    if (error || !Array.isArray(data)) throw new ProvisionRefusedError(["profilerne kunne ikke læses"]);
    for (const p of data) if (isUuid(p?.id)) profiles.set(p.id.toLowerCase(), p);
  }

  const action = {};
  for (const kind of ACCOUNT_KINDS) {
    if (!ids[kind]) { action[kind] = "create"; continue; }
    const p = profiles.get(ids[kind]);
    if (!p) { action[kind] = "complete-profile"; continue; }
    action[kind] = "reuse";
    if (p.role !== EXPECTED_ROLE[kind]) {
      problems.push(`${kind} (${ids[kind]}): har rollen ${JSON.stringify(p.role)}, forventet "${EXPECTED_ROLE[kind]}"`);
    }
    const teacherKind = TEACHER_OF[kind];
    const tid = typeof p.teacher_id === "string" ? p.teacher_id.toLowerCase() : p.teacher_id;
    if (teacherKind === undefined) {
      if (tid !== null && tid !== undefined) problems.push(`${kind} (${ids[kind]}): har selv en lærer`);
    } else if (!ids[teacherKind] || tid !== ids[teacherKind]) {
      problems.push(`${kind} (${ids[kind]}): tilhører ikke ${teacherKind}`);
    }
  }

  const teacherIds = ["teacher", "owner"].filter((k) => ids[k]).map((k) => ids[k]);
  if (teacherIds.length > 0 && problems.length === 0) {
    const { data, error } = await deps.selectPupilsOfTeachers(teacherIds);
    if (error || !Array.isArray(data)) throw new ProvisionRefusedError(["lærernes elever kunne ikke læses"]);
    for (const [pupil, teacherKind] of Object.entries(TEACHER_OF)) {
      if (!ids[teacherKind]) continue;
      const others = data
        .filter((r) => typeof r?.teacher_id === "string" && r.teacher_id.toLowerCase() === ids[teacherKind])
        .filter((r) => typeof r?.id !== "string" || r.id.toLowerCase() !== ids[pupil]);
      if (others.length > 0) {
        problems.push(`${teacherKind} (${ids[teacherKind]}): har ${others.length} elev(er), der ikke er slottens ${pupil} — intet ændres`);
      }
    }
  }

  const steps = CREATE_ORDER.map((kind) => Object.freeze({ kind, action: action[kind], id: ids[kind] ?? null }));
  return Object.freeze({
    slot,
    steps: problems.length > 0 ? Object.freeze([]) : Object.freeze(steps),
    problems: Object.freeze(problems),
  });
}

// ── 5. apply (kun efter en plan uden problemer og en gyldig bekræftelse) ─────────────────────────

export async function applyPlan(plan, registry, writer, readDeps, log = () => {}) {
  if (!plan || plan.problems.length > 0 || plan.steps.length !== CREATE_ORDER.length) {
    throw new ProvisionRefusedError(["planen er ikke godkendt — intet skrives"]);
  }
  if (plan.slot !== registry.slot) throw new ProvisionRefusedError(["planen gælder en anden slot"]);
  const { slot, accounts } = registry;
  const ids = {};
  for (const step of plan.steps) if (step.id) ids[step.kind] = step.id;

  for (const step of plan.steps) {
    const { kind } = step;
    if (step.action === "reuse") { log(`${kind}: genbruges uændret (${ids[kind]})`); continue; }
    if (step.action === "create") {
      const { user, error } = await writer.createMarkedUser({ email: accounts[kind].email, slot, kind });
      if (error || !user) throw new ProvisionRefusedError([`${kind}: kontoen kunne ikke oprettes (status ${error?.status ?? "?"}) — kørslen stoppes`]);
      if (!isUuid(user.id) || typeof user.email !== "string" || lower(user.email) !== lower(accounts[kind].email)
        || !hasExactMarker(user, slot, kind)) {
        throw new ProvisionRefusedError([`${kind}: svaret på oprettelsen er ikke den forventede markerede konto — kørslen stoppes`]);
      }
      ids[kind] = user.id.toLowerCase();
      log(`${kind}: oprettet med markør (${ids[kind]})`);
    } else if (step.action !== "complete-profile") {
      throw new ProvisionRefusedError([`${kind}: ukendt handling`]);
    }
    const { error } = await writer.insertProfile(profileRow(kind, ids, slot));
    if (error) throw new ProvisionRefusedError([`${kind}: profilen kunne ikke indsættes (status ${error.status ?? "?"}) — kørslen stoppes; næste kørsel genoptager`]);
    log(`${kind}: profil indsat (${step.action === "create" ? "ny konto" : "genoptaget"})`);
  }

  // Samme kontrol som global-setup. Ingen reparation: et problem her er en fejl.
  const verified = await verifyAccounts(registry, readDeps);
  return verified;
}

// ── 6. kørsel ────────────────────────────────────────────────────────────────────────────────────

const ACTION_TEXT = Object.freeze({
  create: "oprettes (med markør, uden adgangskode)",
  "complete-profile": "findes markeret uden profil — profilen indsættes (genoptagelse)",
  reuse: "findes markeret med korrekt profil — genbruges uændret",
});

export async function main(argv, env, { fetchImpl = globalThis.fetch, log = (l) => console.log(l) } = {}) {
  const lines = [];
  const say = (l) => { lines.push(l); log(l); };
  let args;
  let target;
  try {
    args = parseArgs(argv);
    target = resolveTarget(env);
    const authProblems = applyAuthorisationProblems(args, target.registry);
    if (authProblems.length > 0) throw new ProvisionContextError(authProblems);
  } catch (err) {
    if (err instanceof ProvisionContextError || err instanceof E2EAccountError) {
      for (const p of err.problems) say(`::error::provision: ${p}`);
      return { exitCode: EXIT.CONTEXT, lines };
    }
    throw err;
  }

  const { registry } = target;
  say(`mål: ${target.target === "production" ? "produktion (e2e-prod)" : "isoleret stak"} · slot ${registry.slot} · tilstand ${args.mode}`);
  try {
    const readDeps = makeReadDeps(makeRequester({ url: target.url, key: target.key, fetchImpl, allowWrites: false }));
    const plan = await planProvisioning(registry, readDeps);
    if (plan.problems.length > 0) {
      for (const p of plan.problems) say(`::error::provision: ${p}`);
      say("plan: AFVIST — intet oprettes eller ændres");
      return { exitCode: EXIT.REFUSED, lines };
    }
    for (const s of plan.steps) say(`plan: ${s.kind} — ${ACTION_TEXT[s.action]}${s.id ? ` (${s.id})` : ""}`);

    if (args.mode === "dry-run") {
      if (plan.steps.every((s) => s.action === "reuse")) {
        await verifyAccounts(registry, readDeps);
        say("dry-run: alle fire konti er klar og verificeret som global-setup gør — intet at gøre");
      } else {
        say("dry-run: intet er skrevet. Kør med --mode=apply og bekræftelsen for at udføre planen");
      }
      return { exitCode: EXIT.OK, lines };
    }

    const writer = makeWriter(makeRequester({ url: target.url, key: target.key, fetchImpl, allowWrites: true }));
    const verified = await applyPlan(plan, registry, writer, readDeps, say);
    say(`apply: færdig — slot ${verified.slot} verificeret: ${ACCOUNT_KINDS.map((k) => `${k} ${verified.ids[k]}`).join(", ")}`);
    return { exitCode: EXIT.OK, lines };
  } catch (err) {
    if (err instanceof ProvisionRefusedError || err instanceof E2EAccountError) {
      for (const p of err.problems) say(`::error::provision: ${p}`);
      return { exitCode: EXIT.REFUSED, lines };
    }
    say("::error::provision: uventet fejl — kørslen stoppet (ingen detaljer logges)");
    return { exitCode: EXIT.REFUSED, lines };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { exitCode, lines } = await main(process.argv.slice(2), process.env);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (typeof summary === "string" && summary !== "") {
    appendFileSync(summary, ["## E2E-provisionering (A4)", "", "```", ...lines, "```", ""].join("\n"));
  }
  process.exitCode = exitCode;
}
