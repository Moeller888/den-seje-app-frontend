#!/usr/bin/env node
// SKRIVEBESKYTTET KONTROL AF DE TRE SUPABASE-SECRETS I GITHUB-ENVIRONMENTET e2e-prod (A7).
//
// Kører kun fra .github/workflows/e2e-prod-key-check.yml (workflow_dispatch fra main, environment e2e-prod,
// godkendelse af en reviewer). Beviser, at secrets'ene i e2e-prod er de rigtige, FØR nogen produktions-E2E
// bruger dem — uden global-setup, uden Playwright, uden login og uden at skrive noget i produktionen.
//
// Hvad der kontrolleres:
//   1. Format (lokalt, intet netværk): URL'en er præcis https://<forventet projekt>.supabase.co, secret key har
//      formatet sb_secret_, publishable key har formatet sb_publishable_, og de to nøgler er forskellige.
//   2. Negative kontroller: Auth admin afviser et kald UDEN nøgle og et kald MED publishable key. Det beviser,
//      at endpointet håndhæver nøgler, så et positivt svar med secret key ikke er tilfældigt.
//   3. Auth admin med secret key: GET /auth/v1/admin/users/<nul-UUID>. Admin-autorisationen kommer før opslaget,
//      så 404 med error_code "user_not_found" beviser, at nøglen er godkendt som admin — uden at hente en
//      eneste brugerpost (nul-UUID'en findes ikke).
//   4. Auth admin, positivt bevis: GET /auth/v1/admin/users?page=1&per_page=1 — den dokumenterede liste-operation
//      (Auth OpenAPI "GET /admin/users", parametrene page/per_page med minimum 1; supabase-js auth.admin.listUsers,
//      som global-setup bruger). Med secret key skal svaret være 200 med headeren X-Total-Count som et heltal:
//      Auth sætter kun den header, efter at admin-listen faktisk er hentet (addPaginationHeaders). Svarets body
//      læses ALDRIG: den afbrydes ulæst, og hverken body, antal eller andre headers logges eller gemmes.
//      Uden nøgle og med publishable key skal samme kald afvises (401/403). Ingen antagelse om sidetal.
//   5. PostgREST med secret key: HEAD på et indholdsbord (ingen body i svaret).
//   6. Publishable key: GET /auth/v1/settings (offentlige Auth-indstillinger).
//
// Headers (Supabases dokumentation, "API keys" og "Migrating to publishable and secret API keys"): de nye
// nøgler sendes i `apikey`-headeren. De er ikke JWT'er og kan ikke sendes alene i `Authorization: Bearer`. Den
// dokumenterede form kontrolleres derfor med `apikey` ALENE. supabase-js (som E2E-suiten bruger) sender
// desuden samme nøgle som `Authorization: Bearer <nøgle>`, når der ikke er nogen session; dokumentationen er
// ikke entydig om, hvordan platformen behandler den form. Den kontrolleres derfor som et særskilt punkt
// ("supabase-js-form"), så et rødt resultat viser præcis, hvilken form der afvises.
//
// Sikkerhed:
//   - Kun GET og HEAD. safeFetch() afviser enhver anden metode, før fetch kaldes, og sender aldrig en body.
//   - Omdirigeringer følges aldrig (redirect: "error"), så nøglen aldrig sendes videre til en anden vært.
//   - Hvert kald har en tidsgrænse.
//   - Intet secret, ingen URL, ingen header, ingen response body og ingen fejltekst fra netværket logges — kun
//     kontrollens navn, HTTP-status og en fast dansk beskrivelse. Den eneste body, der læses, er fejlsvaret fra
//     nul-UUID-opslaget (højst 4 KB, kun feltet error_code sammenlignes), og den logges aldrig.
//   - I GitHub Actions kører kontrollen kun som workflow_dispatch fra main OG i environmentet e2e-prod
//     (variablen E2E_PROD_ENVIRONMENT, som kun findes på environment-niveau) — ellers exit 2 uden netværkskald.
//
// Exitkoder: 0 = alle kontroller bestået · 1 = mindst én kontrol fejlede · 2 = forkert kørselskontekst.

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const EXPECTED_PROJECT_REF = "tjzbehwfagiwpwodsgwg";
export const EXPECTED_HOST = `${EXPECTED_PROJECT_REF}.supabase.co`;

// Navnene i env er de samme som secrets'enes navne i e2e-prod (workflowet mapper dem 1:1).
export const ENV_NAMES = Object.freeze({
  url: "E2E_PROD_SUPABASE_URL",
  publishable: "E2E_PROD_SUPABASE_ANON_KEY",
  secret: "E2E_PROD_SUPABASE_SERVICE_ROLE_KEY",
});

export const SECRET_PREFIX = "sb_secret_";
export const PUBLISHABLE_PREFIX = "sb_publishable_";
export const ALLOWED_METHODS = Object.freeze(["GET", "HEAD"]);
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";
export const REST_PROBE_PATH = "/rest/v1/questions?select=id&limit=1";
export const ADMIN_LIST_PATH = "/auth/v1/admin/users?page=1&per_page=1";
export const ENVIRONMENT_NAME = "e2e-prod";
export const ENVIRONMENT_MARKER = "E2E_PROD_ENVIRONMENT";
export const TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 4096;

export const EXIT = Object.freeze({ OK: 0, FAILED: 1, CONTEXT: 2 });

// ── 1. format ───────────────────────────────────────────────────────────────────────────────────

function hasOuterWhitespace(value) {
  return value !== value.trim();
}

function looksLikeJwt(value) {
  return value.startsWith("eyJ") || value.split(".").length === 3;
}

// Returnerer { ok, problems, config }. Problemerne er faste danske tekster uden værdier.
export function validateConfig(env) {
  const problems = [];
  const raw = {};
  for (const [key, name] of Object.entries(ENV_NAMES)) {
    const value = env[name];
    if (typeof value !== "string" || value.trim() === "") {
      problems.push(`${name}: mangler eller er tom`);
      continue;
    }
    if (hasOuterWhitespace(value)) problems.push(`${name}: har mellemrum eller linjeskift før eller efter værdien`);
    raw[key] = value;
  }

  let origin = null;
  if (raw.url !== undefined) {
    let parsed = null;
    try {
      parsed = new URL(raw.url.trim());
    } catch {
      problems.push(`${ENV_NAMES.url}: er ikke en gyldig URL`);
    }
    if (parsed) {
      if (parsed.protocol !== "https:") problems.push(`${ENV_NAMES.url}: skal bruge https`);
      if (parsed.username !== "" || parsed.password !== "") problems.push(`${ENV_NAMES.url}: må ikke indeholde brugernavn eller kodeord`);
      if (parsed.hostname.toLowerCase() !== EXPECTED_HOST) problems.push(`${ENV_NAMES.url}: peger ikke på det forventede Supabase-projekt`);
      if (parsed.port !== "") problems.push(`${ENV_NAMES.url}: må ikke angive en port`);
      if (parsed.pathname !== "/" && parsed.pathname !== "") problems.push(`${ENV_NAMES.url}: må ikke have en sti (kun projektets rod-URL)`);
      if (parsed.search !== "" || parsed.hash !== "") problems.push(`${ENV_NAMES.url}: må ikke have query eller fragment`);
      origin = `https://${EXPECTED_HOST}`;
    }
  }

  if (raw.secret !== undefined) {
    const s = raw.secret.trim();
    if (!s.startsWith(SECRET_PREFIX)) problems.push(`${ENV_NAMES.secret}: har ikke formatet ${SECRET_PREFIX}`);
    else if (s.length <= SECRET_PREFIX.length) problems.push(`${ENV_NAMES.secret}: er kun præfikset`);
    if (looksLikeJwt(s)) problems.push(`${ENV_NAMES.secret}: ligner en legacy-JWT, ikke en ny secret key`);
    if (/\s/.test(s)) problems.push(`${ENV_NAMES.secret}: indeholder mellemrum`);
  }
  if (raw.publishable !== undefined) {
    const p = raw.publishable.trim();
    if (!p.startsWith(PUBLISHABLE_PREFIX)) problems.push(`${ENV_NAMES.publishable}: har ikke formatet ${PUBLISHABLE_PREFIX}`);
    else if (p.length <= PUBLISHABLE_PREFIX.length) problems.push(`${ENV_NAMES.publishable}: er kun præfikset`);
    if (looksLikeJwt(p)) problems.push(`${ENV_NAMES.publishable}: ligner en legacy-JWT, ikke en publishable key`);
    if (/\s/.test(p)) problems.push(`${ENV_NAMES.publishable}: indeholder mellemrum`);
  }
  if (raw.secret !== undefined && raw.publishable !== undefined && raw.secret.trim() === raw.publishable.trim()) {
    problems.push(`${ENV_NAMES.secret} og ${ENV_NAMES.publishable}: er ens`);
  }

  const ok = problems.length === 0;
  return {
    ok,
    problems,
    config: ok ? { origin, secret: raw.secret.trim(), publishable: raw.publishable.trim() } : null,
  };
}

// ── 2. netværk: kun GET/HEAD ────────────────────────────────────────────────────────────────────

export class MethodNotAllowedError extends Error {}

// Den ENESTE vej ud på netværket. Afviser alt andet end GET/HEAD, før fetchImpl kaldes.
export async function safeFetch(fetchImpl, url, { method, headers }) {
  if (!ALLOWED_METHODS.includes(method)) throw new MethodNotAllowedError(`metoden ${String(method)} er ikke tilladt`);
  return fetchImpl(url, {
    method,
    headers: { ...headers },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function discardBody(res) {
  try {
    if (res && res.body && typeof res.body.cancel === "function") await res.body.cancel();
  } catch {
    // Ingen oplysninger fra svaret må nå loggen; en fejl ved oprydning ændrer ikke resultatet.
  }
}

// Læser højst MAX_BODY_BYTES og returnerer kun error_code (eller null). Logges aldrig.
async function readErrorCode(res) {
  try {
    const text = typeof res.text === "function" ? await res.text() : "";
    if (typeof text !== "string" || text.length > MAX_BODY_BYTES) return null;
    const parsed = JSON.parse(text);
    return parsed && typeof parsed.error_code === "string" ? parsed.error_code : null;
  } catch {
    return null;
  }
}

// Kun om headeren findes og er et ikke-negativt heltal. Værdien (antallet af brugere) returneres aldrig.
function hasTotalCount(res) {
  try {
    const value = res && res.headers && typeof res.headers.get === "function" ? res.headers.get("x-total-count") : null;
    return typeof value === "string" && /^\d+$/.test(value);
  } catch {
    return false;
  }
}

function errorCategory(err) {
  if (err instanceof MethodNotAllowedError) return "ikke-tilladt metode";
  const name = err && typeof err.name === "string" ? err.name : "";
  if (name === "TimeoutError" || name === "AbortError") return "tidsgrænse overskredet";
  return "netværksfejl eller omdirigering";
}

// ── 3. kontrollerne ─────────────────────────────────────────────────────────────────────────────

const apikeyOnly = (key) => ({ apikey: key });
const supabaseJsForm = (key) => ({ apikey: key, Authorization: `Bearer ${key}` });

// Hver kontrol: id, beskrivelse, metode, sti, headers og hvad der forventes. Ingen af dem skriver.
export function buildChecks(config) {
  const adminPath = `/auth/v1/admin/users/${NIL_UUID}`;
  const refused = [401, 403];
  const listChecks = [
    { id: "auth-admin-liste-uden-noegle", text: "Auth admin-liste afviser et kald uden nøgle", method: "GET", path: ADMIN_LIST_PATH, headers: {}, expect: refused },
    { id: "auth-admin-liste-publishable", text: "Auth admin-liste afviser publishable key", method: "GET", path: ADMIN_LIST_PATH, headers: apikeyOnly(config.publishable), expect: refused },
    { id: "auth-admin-liste-secret", text: "Auth admin-liste (listUsers) virker med secret key (apikey)", method: "GET", path: ADMIN_LIST_PATH, headers: apikeyOnly(config.secret), expect: [200], totalCount: true },
  ];
  return [
    { id: "auth-admin-uden-noegle", text: "Auth admin afviser et kald uden nøgle", method: "GET", path: adminPath, headers: {}, expect: refused },
    { id: "auth-admin-publishable", text: "Auth admin afviser publishable key", method: "GET", path: adminPath, headers: apikeyOnly(config.publishable), expect: refused },
    { id: "auth-admin-secret", text: "Auth admin godkender secret key (apikey)", method: "GET", path: adminPath, headers: apikeyOnly(config.secret), expect: [404], errorCode: "user_not_found" },
    ...listChecks,
    { id: "rest-head-secret", text: "PostgREST HEAD med secret key (apikey)", method: "HEAD", path: REST_PROBE_PATH, headers: apikeyOnly(config.secret), expect: [200, 206] },
    { id: "auth-settings-publishable", text: "Publishable key virker (Auth settings, apikey)", method: "GET", path: "/auth/v1/settings", headers: apikeyOnly(config.publishable), expect: [200] },
    { id: "auth-admin-secret-supabase-js-form", text: "supabase-js-form: Auth admin med secret key (apikey + Bearer)", method: "GET", path: adminPath, headers: supabaseJsForm(config.secret), expect: [404], errorCode: "user_not_found" },
    { id: "auth-admin-liste-secret-supabase-js-form", text: "supabase-js-form: Auth admin-liste med secret key (apikey + Bearer)", method: "GET", path: ADMIN_LIST_PATH, headers: supabaseJsForm(config.secret), expect: [200], totalCount: true },
    { id: "rest-head-secret-supabase-js-form", text: "supabase-js-form: PostgREST HEAD med secret key (apikey + Bearer)", method: "HEAD", path: REST_PROBE_PATH, headers: supabaseJsForm(config.secret), expect: [200, 206] },
    { id: "auth-settings-publishable-supabase-js-form", text: "supabase-js-form: publishable key (apikey + Bearer)", method: "GET", path: "/auth/v1/settings", headers: supabaseJsForm(config.publishable), expect: [200] },
  ];
}

async function runOne(fetchImpl, origin, check) {
  let res;
  try {
    res = await safeFetch(fetchImpl, origin + check.path, { method: check.method, headers: check.headers });
  } catch (err) {
    return { id: check.id, text: check.text, ok: false, status: null, detail: errorCategory(err) };
  }
  const status = typeof res?.status === "number" ? res.status : null;
  let ok = status !== null && check.expect.includes(status);
  let detail = ok ? "som forventet" : `forventet ${check.expect.join(" eller ")}`;
  if (ok && check.totalCount) {
    // Kun headeren kontrolleres; body'en (en brugerpost) afbrydes ulæst nedenfor.
    if (!hasTotalCount(res)) {
      ok = false;
      detail = `HTTP ${status}, men uden headeren X-Total-Count fra admin-listen`;
    }
    await discardBody(res);
  } else if (ok && check.errorCode) {
    const code = await readErrorCode(res);
    if (code !== check.errorCode) {
      ok = false;
      detail = `HTTP ${status}, men ikke det forventede svar "${check.errorCode}"`;
    }
  } else {
    await discardBody(res);
  }
  return { id: check.id, text: check.text, ok, status, detail };
}

function formatLine(r) {
  const status = r.status === null ? "intet svar" : `HTTP ${r.status}`;
  return `${r.ok ? "OK  " : "FEJL"} ${r.id}: ${r.text} — ${status} (${r.detail})`;
}

// Kører hele kontrollen. Returnerer { exitCode, lines, results }. Skriver kun via log().
export async function runKeyCheck({ env, fetchImpl, log }) {
  const lines = [];
  const out = (line) => { lines.push(line); log(line); };

  if (env.GITHUB_ACTIONS === "true") {
    if (env.GITHUB_EVENT_NAME !== "workflow_dispatch" || env.GITHUB_REF !== "refs/heads/main") {
      out("FEJL kontekst: kontrollen må kun køre som workflow_dispatch fra main");
      return { exitCode: EXIT.CONTEXT, lines, results: [] };
    }
    if (env[ENVIRONMENT_MARKER] !== ENVIRONMENT_NAME) {
      out(`FEJL kontekst: jobbet kører ikke i environmentet ${ENVIRONMENT_NAME} (variablen ${ENVIRONMENT_MARKER})`);
      return { exitCode: EXIT.CONTEXT, lines, results: [] };
    }
  }

  const { ok, problems, config } = validateConfig(env);
  if (!ok) {
    for (const p of problems) out(`FEJL format: ${p}`);
    out("RESULTAT: IKKE GODKENDT — formatfejl, intet netværkskald er foretaget");
    return { exitCode: EXIT.FAILED, lines, results: [] };
  }
  out("OK   format: URL peger på det forventede projekt; sb_secret_ og sb_publishable_ har korrekt format");

  const results = [];
  for (const check of buildChecks(config)) {
    const r = await runOne(fetchImpl, config.origin, check);
    results.push(r);
    out(formatLine(r));
  }
  const failed = results.filter((r) => !r.ok);
  out(failed.length === 0
    ? `RESULTAT: GODKENDT — ${results.length}/${results.length} kontroller bestået`
    : `RESULTAT: IKKE GODKENDT — ${failed.length} af ${results.length} kontroller fejlede: ${failed.map((r) => r.id).join(", ")}`);
  return { exitCode: failed.length === 0 ? EXIT.OK : EXIT.FAILED, lines, results };
}

// ── 4. kørsel ───────────────────────────────────────────────────────────────────────────────────

export function stepSummary(lines) {
  return ["## E2E prod key check", "", "```", ...lines, "```", ""].join("\n");
}

async function main() {
  const { exitCode, lines } = await runKeyCheck({ env: process.env, fetchImpl: globalThis.fetch, log: (l) => console.log(l) });
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (typeof summaryFile === "string" && summaryFile !== "") appendFileSync(summaryFile, stepSummary(lines));
  process.exitCode = exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
