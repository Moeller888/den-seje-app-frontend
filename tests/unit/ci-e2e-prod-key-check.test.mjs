// A7: kontrakt for den skrivebeskyttede Supabase-nøgletest i e2e-prod.
//   .github/ci/e2e-prod-key-check.mjs        — logikken (kun GET/HEAD, intet logges ud over status)
//   .github/workflows/e2e-prod-key-check.yml — workflow_dispatch fra main, environment e2e-prod, tre secrets
//
// Alle nøgler herunder er falske og bygges ved kørsel, så ingen fil indeholder noget, der ligner en rigtig nøgle
// (tests/unit/credential-hygiene.test.mjs). Ingen test her laver et netværkskald: fetch er altid en attrap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ADMIN_LIST_PATH,
  ALLOWED_METHODS,
  ENVIRONMENT_MARKER,
  ENVIRONMENT_NAME,
  ENV_NAMES,
  EXIT,
  EXPECTED_HOST,
  MethodNotAllowedError,
  NIL_UUID,
  REST_PROBE_PATH,
  buildChecks,
  runKeyCheck,
  safeFetch,
  stepSummary,
  validateConfig,
} from "../../.github/ci/e2e-prod-key-check.mjs";

const SCRIPT = readFileSync(new URL("../../.github/ci/e2e-prod-key-check.mjs", import.meta.url), "utf8");
const WORKFLOW = readFileSync(new URL("../../.github/workflows/e2e-prod-key-check.yml", import.meta.url), "utf8");

// ── falske værdier ──────────────────────────────────────────────────────────────────────────────

const FAKE_SECRET = ["sb", "secret", "FAKEfake0123456789abcdefXYZ"].join("_");
const FAKE_PUBLISHABLE = ["sb", "publishable", "FAKEpub0123456789abcdefXYZ"].join("_");
const FAKE_URL = `https://${EXPECTED_HOST}`;
const FAKE_EMAIL = "elev.navn@example.invalid";
const legacyJwt = () => {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part({ role: "anon", ref: "example" })}.${"s1gnature".repeat(3)}`;
};

const goodEnv = (over = {}) => ({
  [ENV_NAMES.url]: FAKE_URL,
  [ENV_NAMES.publishable]: FAKE_PUBLISHABLE,
  [ENV_NAMES.secret]: FAKE_SECRET,
  ...over,
});
const actionsEnv = (over = {}) => goodEnv({
  GITHUB_ACTIONS: "true",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  [ENVIRONMENT_MARKER]: ENVIRONMENT_NAME,
  ...over,
});

// ── attrap af Supabase: opfører sig som den dokumenterede platform ───────────────────────────────

const response = (status, bodyText = "", headers = {}) => {
  let cancelled = false;
  let read = false;
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    headers: { get: (name) => (Object.hasOwn(lower, name.toLowerCase()) ? lower[name.toLowerCase()] : null) },
    body: { cancel: async () => { cancelled = true; } },
    text: async () => { read = true; return bodyText; },
    get cancelled() { return cancelled; },
    get read() { return read; },
  };
};

// Et bevidst genkendeligt antal: det må aldrig nå loggen.
const FAKE_TOTAL = "73519";
const LIST_BODY = JSON.stringify({ users: [{ id: "u1", email: FAKE_EMAIL }], aud: "authenticated" });

// Svarene indeholder bevidst følsomme strenge (nøglen ekko'et, en e-mailadresse): de må aldrig nå loggen.
function fakeSupabase({ rejectBearer = false, overrides = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const u = new URL(url);
    const key = init.headers.apikey;
    const auth = init.headers.Authorization;
    const id = `${init.method} ${u.pathname}${u.search}`;
    if (overrides[id] && overrides[id](init)) return overrides[id](init);
    if (rejectBearer && auth !== undefined) return response(401, JSON.stringify({ msg: `Invalid JWT ${auth}` }));
    if (u.pathname === `/auth/v1/admin/users/${NIL_UUID}`) {
      if (key === undefined) return response(401, JSON.stringify({ message: "No API key found in request" }));
      if (key !== FAKE_SECRET) return response(403, JSON.stringify({ msg: `User not allowed ${key}` }));
      return response(404, JSON.stringify({ code: 404, error_code: "user_not_found", msg: `User not found ${FAKE_EMAIL}` }));
    }
    if (u.pathname === "/auth/v1/admin/users" && u.search === "?page=1&per_page=1") {
      if (key === undefined) return response(401, JSON.stringify({ message: "No API key found in request" }));
      if (key !== FAKE_SECRET) return response(403, JSON.stringify({ msg: `User not allowed ${key}` }));
      return response(200, LIST_BODY, { "X-Total-Count": FAKE_TOTAL, Link: `<${u}>; rel="last"` });
    }
    if (u.pathname === "/rest/v1/questions") return response(key === FAKE_SECRET ? 200 : 401);
    if (u.pathname === "/auth/v1/settings") return response(key === FAKE_PUBLISHABLE ? 200 : 401, JSON.stringify({ external: { email: true }, echo: key }));
    return response(404, "not found");
  };
  return { calls, fetchImpl };
}

async function run(env, fake = fakeSupabase()) {
  const logged = [];
  const result = await runKeyCheck({ env, fetchImpl: fake.fetchImpl, log: (l) => logged.push(l) });
  return { ...result, logged, calls: fake.calls };
}

// "Bearer " efterfulgt af noget andet end ")" ville være en header-værdi; "(apikey + Bearer)" er kun en beskrivelse.
const SENSITIVE = [FAKE_SECRET, FAKE_PUBLISHABLE, FAKE_EMAIL, FAKE_TOTAL, "rel=", "authenticated", "Bearer sb", "Bearer ey", "FAKEfake", "FAKEpub", "Invalid JWT", "User not found", "No API key"];
function assertNothingSensitive(lines) {
  const text = lines.join("\n");
  for (const s of SENSITIVE) assert.ok(!text.includes(s), `loggen må ikke indeholde ${JSON.stringify(s)}`);
}

// ── 1. format ───────────────────────────────────────────────────────────────────────────────────

test("format: gyldige værdier giver projektets origin og de trimmede nøgler", () => {
  const v = validateConfig(goodEnv());
  assert.equal(v.ok, true);
  assert.deepEqual(v.problems, []);
  assert.deepEqual(v.config, { origin: `https://${EXPECTED_HOST}`, secret: FAKE_SECRET, publishable: FAKE_PUBLISHABLE });
});

test("format: en manglende eller tom værdi navngives, uden at der gættes", () => {
  for (const name of Object.values(ENV_NAMES)) {
    for (const missing of [undefined, "", "   "]) {
      const v = validateConfig(goodEnv({ [name]: missing }));
      assert.equal(v.ok, false);
      assert.ok(v.problems.some((p) => p.startsWith(`${name}: mangler`)), `${name} = ${JSON.stringify(missing)}`);
      assert.equal(v.config, null);
    }
  }
});

test("format: URL'en skal være præcis det forventede projekts rod over https", () => {
  const bad = {
    "http://": `http://${EXPECTED_HOST}`,
    "andet projekt": "https://abcdefghijklmnopqrst.supabase.co",
    "lignende vært": `https://${EXPECTED_HOST}.evil.example`,
    "sti": `https://${EXPECTED_HOST}/rest/v1`,
    "query": `https://${EXPECTED_HOST}/?x=1`,
    "fragment": `https://${EXPECTED_HOST}/#x`,
    "port": `https://${EXPECTED_HOST}:8443`,
    "brugerinfo": `https://user:pw@${EXPECTED_HOST}`,
    "ikke en URL": "tjzbehwfagiwpwodsgwg",
  };
  for (const [label, url] of Object.entries(bad)) {
    const v = validateConfig(goodEnv({ [ENV_NAMES.url]: url }));
    assert.equal(v.ok, false, label);
    assert.ok(v.problems.some((p) => p.startsWith(ENV_NAMES.url)), label);
  }
  assert.equal(validateConfig(goodEnv({ [ENV_NAMES.url]: `https://${EXPECTED_HOST}/` })).ok, true, "afsluttende / er tilladt");
  assert.equal(validateConfig(goodEnv({ [ENV_NAMES.url]: `https://${EXPECTED_HOST.toUpperCase()}` })).ok, true, "værtsnavne er ikke store/små-følsomme");
});

test("format: secret key skal være en ny sb_secret_-nøgle, ikke en legacy-JWT eller publishable key", () => {
  const cases = {
    "legacy JWT": legacyJwt(),
    "publishable i stedet": FAKE_PUBLISHABLE,
    "kun præfiks": "sb_secret_",
    "uden præfiks": "FAKEfake0123456789abcdef",
    "mellemrum indeni": ["sb", "secret", "FAKE fake0123456789"].join("_"),
  };
  for (const [label, value] of Object.entries(cases)) {
    const v = validateConfig(goodEnv({ [ENV_NAMES.secret]: value }));
    assert.equal(v.ok, false, label);
    assert.ok(v.problems.some((p) => p.includes(ENV_NAMES.secret)), label);
  }
  // Hver kontrol har sin egen fejltekst, så en fjernet kontrol ikke skjules af en anden.
  const jwt = validateConfig(goodEnv({ [ENV_NAMES.secret]: legacyJwt() }));
  assert.ok(jwt.problems.includes(`${ENV_NAMES.secret}: ligner en legacy-JWT, ikke en ny secret key`));
  const dotted = validateConfig(goodEnv({ [ENV_NAMES.secret]: ["sb", "secret", "a.b.c"].join("_") }));
  assert.deepEqual(dotted.problems, [`${ENV_NAMES.secret}: ligner en legacy-JWT, ikke en ny secret key`], "kun JWT-formen fanger denne");
});

test("format: publishable key skal være en sb_publishable_-nøgle og forskellig fra secret key", () => {
  for (const value of [legacyJwt(), FAKE_SECRET, "sb_publishable_", "anon"]) {
    assert.equal(validateConfig(goodEnv({ [ENV_NAMES.publishable]: value })).ok, false, value.slice(0, 12));
  }
  const same = validateConfig(goodEnv({ [ENV_NAMES.publishable]: FAKE_SECRET }));
  assert.ok(same.problems.includes(`${ENV_NAMES.secret} og ${ENV_NAMES.publishable}: er ens`), "en kopieret nøgle navngives som sådan");
});

test("format: mellemrum eller linjeskift før/efter en værdi er en fejl, ikke noget der stilles stille", () => {
  for (const name of Object.values(ENV_NAMES)) {
    const value = goodEnv()[name];
    for (const padded of [` ${value}`, `${value}\n`, `${value}\r\n`]) {
      const v = validateConfig(goodEnv({ [name]: padded }));
      assert.equal(v.ok, false, `${name} ${JSON.stringify(padded.slice(-2))}`);
      assert.ok(v.problems.some((p) => p.includes(name) && p.includes("mellemrum")));
    }
  }
});

test("format: ingen problemtekst indeholder en værdi", () => {
  const env = goodEnv({ [ENV_NAMES.url]: "https://user:pw@elsewhere.example/x?y", [ENV_NAMES.secret]: ` ${legacyJwt()}`, [ENV_NAMES.publishable]: "FAKEpubXYZ" });
  const { problems } = validateConfig(env);
  assert.ok(problems.length >= 3);
  const text = problems.join("\n");
  for (const s of ["elsewhere", "user:pw", "eyJ", "FAKEpub"]) assert.ok(!text.includes(s), s);
});

// ── 2. kun GET og HEAD ──────────────────────────────────────────────────────────────────────────

test("safeFetch afviser enhver anden metode end GET/HEAD, FØR fetch kaldes", async () => {
  let called = 0;
  const fetchImpl = async () => { called++; return response(200); };
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT", "TRACE", "get", "head", "", undefined, null]) {
    await assert.rejects(safeFetch(fetchImpl, FAKE_URL, { method, headers: {} }), MethodNotAllowedError, String(method));
  }
  assert.equal(called, 0);
  assert.deepEqual([...ALLOWED_METHODS], ["GET", "HEAD"]);
});

test("safeFetch sender ingen body, følger ingen omdirigering og har en tidsgrænse", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push(init); return response(200); };
  for (const method of ["GET", "HEAD"]) await safeFetch(fetchImpl, FAKE_URL, { method, headers: { apikey: "x" } });
  for (const init of seen) {
    assert.equal("body" in init, false);
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal instanceof AbortSignal);
  }
});

test("hvert planlagt kald er GET eller HEAD mod projektets egen vært, og ingen sender en body", () => {
  const checks = buildChecks({ origin: FAKE_URL, secret: FAKE_SECRET, publishable: FAKE_PUBLISHABLE });
  assert.equal(checks.length, 12);
  for (const c of checks) {
    assert.ok(ALLOWED_METHODS.includes(c.method), c.id);
    assert.ok(c.path.startsWith("/auth/v1/") || c.path.startsWith("/rest/v1/"), c.id);
    assert.equal("body" in c, false, c.id);
  }
  assert.ok(checks.some((c) => c.method === "HEAD" && c.path === REST_PROBE_PATH));
  // Den positive admin-kontrol er den dokumenterede liste-operation med de mindst mulige, gyldige parametre.
  assert.equal(ADMIN_LIST_PATH, "/auth/v1/admin/users?page=1&per_page=1");
  assert.deepEqual(checks.filter((c) => c.path === ADMIN_LIST_PATH).map((c) => c.id), [
    "auth-admin-liste-uden-noegle", "auth-admin-liste-publishable", "auth-admin-liste-secret", "auth-admin-liste-secret-supabase-js-form",
  ]);
});

test("kildekoden: præcis ét kald ud på netværket, og ingen skrivende metode nævnes", () => {
  const code = SCRIPT.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  assert.equal([...code.matchAll(/\bfetchImpl\(/g)].length, 1, "kun safeFetch må kalde fetchImpl");
  assert.equal([...code.matchAll(/globalThis\.fetch/g)].length, 1, "kun main() giver den rigtige fetch videre");
  assert.doesNotMatch(code, /["'`](?:POST|PUT|PATCH|DELETE)["'`]/);
  assert.doesNotMatch(code, /\bbody\s*:/, "intet kald sender en body");
  assert.doesNotMatch(code, /\bfrom\s+["'][^"']*supabase|import\(\s*["'][^"']*supabase|require\(\s*["'][^"']*supabase/,
    "ingen klientbibliotek, kun dokumenterede HTTP-kald");
  assert.deepEqual([...code.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]).sort(), ["node:fs", "node:url"]);
  assert.doesNotMatch(code, /\.(?:insert|update|upsert|delete|rpc)\(/);
  assert.doesNotMatch(code, /console\.(?:log|error|warn)\((?!l\))/, "kun main() logger, og kun de færdige linjer");
});

// ── 3. hele kontrollen mod attrappen ────────────────────────────────────────────────────────────

test("glad sti: 12/12 kontroller bestået, exit 0, og kun GET/HEAD mod projektets vært", async () => {
  const r = await run(actionsEnv());
  assert.equal(r.exitCode, EXIT.OK);
  assert.equal(r.results.length, 12);
  assert.ok(r.results.every((x) => x.ok), JSON.stringify(r.results));
  assert.match(r.logged.at(-1), /^RESULTAT: GODKENDT — 12\/12/);
  assert.equal(r.calls.length, 12);
  for (const { url, init } of r.calls) {
    assert.ok(ALLOWED_METHODS.includes(init.method));
    assert.equal(new URL(url).host, EXPECTED_HOST);
    assert.equal("body" in init, false);
  }
  assertNothingSensitive(r.logged);
});

test("headers: den dokumenterede form sender nøglen KUN i apikey; supabase-js-formen sender samme nøgle som Bearer", async () => {
  const r = await run(goodEnv());
  const byPath = r.calls.map(({ init }) => init.headers);
  const plain = r.calls.filter(({ init }) => init.headers.Authorization === undefined);
  const jsForm = r.calls.filter(({ init }) => init.headers.Authorization !== undefined);
  assert.equal(plain.length, 8);
  assert.equal(jsForm.length, 4);
  // sb_secret_ og sb_publishable_ sendes i den dokumenterede form KUN i apikey, aldrig alene som Bearer.
  for (const { init } of plain) assert.deepEqual(Object.keys(init.headers).filter((h) => h !== "apikey"), []);
  assert.ok(r.calls.every(({ init }) => init.headers.Authorization === undefined || init.headers.apikey !== undefined), "aldrig Bearer uden apikey");
  for (const { init } of jsForm) assert.equal(init.headers.Authorization, `Bearer ${init.headers.apikey}`);
  assert.ok(byPath.some((h) => h.apikey === undefined), "den negative kontrol sender ingen nøgle");
  const ids = r.results.map((x) => x.id);
  assert.deepEqual(ids.filter((id) => id.endsWith("supabase-js-form")).length, 4);
});

test("negativ kontrol: svarer Auth admin 200 uden nøgle, er kontrollen IKKE godkendt", async () => {
  const fake = fakeSupabase({ overrides: { [`GET /auth/v1/admin/users/${NIL_UUID}`]: (init) => (init.headers.apikey === undefined ? response(200) : null) } });
  const r = await run(goodEnv(), fake);
  assert.equal(r.exitCode, EXIT.FAILED);
  assert.deepEqual(r.results.filter((x) => !x.ok).map((x) => x.id), ["auth-admin-uden-noegle"]);
});

test("negativ kontrol: får publishable key admin-adgang, er kontrollen IKKE godkendt", async () => {
  const fake = fakeSupabase({ overrides: { [`GET /auth/v1/admin/users/${NIL_UUID}`]: (init) => (init.headers.apikey === FAKE_PUBLISHABLE ? response(404, '{"error_code":"user_not_found"}') : null) } });
  const r = await run(goodEnv(), fake);
  assert.equal(r.exitCode, EXIT.FAILED);
  assert.deepEqual(r.results.filter((x) => !x.ok).map((x) => x.id), ["auth-admin-publishable"]);
});

test("admin-kontrollen kræver user_not_found: et 404 fra en ukendt rute eller en for stor body godkendes ikke", async () => {
  for (const body of ["not found", '{"error_code":"not_found"}', JSON.stringify({ error_code: "user_not_found", pad: "x".repeat(5000) })]) {
    const fake = fakeSupabase({ overrides: { [`GET /auth/v1/admin/users/${NIL_UUID}`]: (init) => (init.headers.apikey === FAKE_SECRET ? response(404, body) : null) } });
    const r = await run(goodEnv(), fake);
    assert.equal(r.exitCode, EXIT.FAILED, body.slice(0, 20));
    assert.ok(r.results.find((x) => x.id === "auth-admin-secret").ok === false);
    assertNothingSensitive(r.logged);
  }
});

test("en afvist secret key (fx tilbagekaldt) giver IKKE GODKENDT og navngiver de berørte kontroller", async () => {
  const fake = fakeSupabase({ overrides: {
    [`GET /auth/v1/admin/users/${NIL_UUID}`]: (init) => (init.headers.apikey === FAKE_SECRET ? response(401, `{"msg":"bad ${FAKE_SECRET}"}`) : null),
    [`HEAD ${REST_PROBE_PATH}`]: () => response(401),
    [`GET ${ADMIN_LIST_PATH}`]: (init) => (init.headers.apikey === FAKE_SECRET ? response(401, `{"msg":"bad ${FAKE_SECRET}"}`) : null),
  } });
  const r = await run(goodEnv(), fake);
  assert.equal(r.exitCode, EXIT.FAILED);
  assert.deepEqual(r.results.filter((x) => !x.ok).map((x) => x.id).sort(), [
    "auth-admin-liste-secret", "auth-admin-liste-secret-supabase-js-form",
    "auth-admin-secret", "auth-admin-secret-supabase-js-form", "rest-head-secret", "rest-head-secret-supabase-js-form",
  ]);
  assertNothingSensitive(r.logged);
});

test("afviser platformen Bearer-formen, fejler præcis de fire supabase-js-kontroller — den dokumenterede form består", async () => {
  const r = await run(goodEnv(), fakeSupabase({ rejectBearer: true }));
  assert.equal(r.exitCode, EXIT.FAILED);
  assert.deepEqual(r.results.filter((x) => !x.ok).map((x) => x.id).sort(), [
    "auth-admin-liste-secret-supabase-js-form", "auth-admin-secret-supabase-js-form", "auth-settings-publishable-supabase-js-form", "rest-head-secret-supabase-js-form",
  ]);
  assert.ok(r.results.filter((x) => !x.id.endsWith("supabase-js-form")).every((x) => x.ok));
  assertNothingSensitive(r.logged);
});

test("netværksfejl og tidsgrænse: kun en fast kategori logges, aldrig fejlteksten", async () => {
  const leaky = new TypeError(`fetch failed for ${FAKE_URL} with ${FAKE_SECRET}`);
  const timeout = Object.assign(new Error(`timed out ${FAKE_SECRET}`), { name: "TimeoutError" });
  for (const [err, category] of [[leaky, "netværksfejl eller omdirigering"], [timeout, "tidsgrænse overskredet"]]) {
    const r = await run(goodEnv(), { calls: [], fetchImpl: async () => { throw err; } });
    assert.equal(r.exitCode, EXIT.FAILED);
    assert.ok(r.results.every((x) => !x.ok && x.status === null && x.detail === category));
    assertNothingSensitive(r.logged);
    assert.ok(!r.logged.join("\n").includes(EXPECTED_HOST), "fejlteksten (med URL) logges ikke");
  }
});

test("formatfejl: intet netværkskald, exit 1", async () => {
  const r = await run(goodEnv({ [ENV_NAMES.secret]: legacyJwt() }));
  assert.equal(r.exitCode, EXIT.FAILED);
  assert.equal(r.calls.length, 0);
  assert.match(r.logged.at(-1), /intet netværkskald/);
  assertNothingSensitive(r.logged);
});

test("kontekst: i GitHub Actions kun workflow_dispatch fra main i e2e-prod — ellers exit 2 uden netværkskald", async () => {
  for (const over of [{ GITHUB_EVENT_NAME: "push" }, { GITHUB_EVENT_NAME: "pull_request" }, { GITHUB_REF: "refs/heads/feature" },
    { GITHUB_REF: "refs/pull/1/merge" }, { GITHUB_EVENT_NAME: undefined },
    { [ENVIRONMENT_MARKER]: undefined }, { [ENVIRONMENT_MARKER]: "" }, { [ENVIRONMENT_MARKER]: "Production" }, { [ENVIRONMENT_MARKER]: "e2e-prod " }]) {
    const r = await run(actionsEnv(over));
    assert.equal(r.exitCode, EXIT.CONTEXT, JSON.stringify(over));
    assert.equal(r.calls.length, 0);
  }
});

test("svar-bodies kasseres uden at blive læst, undtagen det ene error_code-svar", async () => {
  const responses = [];
  const fake = fakeSupabase();
  const wrapped = { calls: fake.calls, fetchImpl: async (u, i) => { const res = await fake.fetchImpl(u, i); responses.push({ i, res }); return res; } };
  await run(goodEnv(), wrapped);
  const notCancelled = responses.filter(({ res }) => !res.cancelled);
  assert.equal(notCancelled.length, 2, "kun de to admin-kald med secret key læser body (error_code)");
  for (const { i } of notCancelled) assert.equal(i.headers.apikey, FAKE_SECRET);
});

test("admin-listen: body læses aldrig, antallet logges aldrig, og kun et 200 MED X-Total-Count godkendes", async () => {
  const responses = [];
  const fake = fakeSupabase();
  const wrapped = { calls: fake.calls, fetchImpl: async (u, i) => { const res = await fake.fetchImpl(u, i); responses.push({ u, res }); return res; } };
  const ok = await run(actionsEnv(), wrapped);
  assert.equal(ok.exitCode, EXIT.OK);
  const list = responses.filter(({ u }) => u.endsWith(ADMIN_LIST_PATH));
  assert.equal(list.length, 4);
  for (const { res } of list) {
    assert.equal(res.read, false, "admin-listens body læses aldrig");
    assert.equal(res.cancelled, true, "admin-listens body afbrydes");
  }
  assertNothingSensitive(ok.logged);

  for (const headers of [{}, { "X-Total-Count": "" }, { "X-Total-Count": "-1" }, { "X-Total-Count": "12abc" }, { "X-Total-Count": "1.5" },
    // Ugyldige værdier, der indeholder et rigtigt antal (fx to sammenflettede headers): må heller ikke logges.
    { "X-Total-Count": `${FAKE_TOTAL}, ${FAKE_TOTAL}` }, { "X-Total-Count": ` ${FAKE_TOTAL}` }]) {
    const f = fakeSupabase({ overrides: { [`GET ${ADMIN_LIST_PATH}`]: (init) => (init.headers.apikey === FAKE_SECRET ? response(200, LIST_BODY, headers) : null) } });
    const r = await run(goodEnv(), f);
    assert.equal(r.exitCode, EXIT.FAILED, JSON.stringify(headers));
    assert.deepEqual(r.results.filter((x) => !x.ok).map((x) => x.id).sort(), ["auth-admin-liste-secret", "auth-admin-liste-secret-supabase-js-form"]);
    assertNothingSensitive(r.logged);
  }
});

test("admin-listen: negative kontroller fejler, hvis listen svarer uden nøgle eller med publishable key", async () => {
  const leak = (cond) => fakeSupabase({ overrides: { [`GET ${ADMIN_LIST_PATH}`]: (init) => (cond(init) ? response(200, LIST_BODY, { "X-Total-Count": FAKE_TOTAL }) : null) } });
  const noKey = await run(goodEnv(), leak((i) => i.headers.apikey === undefined));
  assert.deepEqual(noKey.results.filter((x) => !x.ok).map((x) => x.id), ["auth-admin-liste-uden-noegle"]);
  const pub = await run(goodEnv(), leak((i) => i.headers.apikey === FAKE_PUBLISHABLE));
  assert.deepEqual(pub.results.filter((x) => !x.ok).map((x) => x.id), ["auth-admin-liste-publishable"]);
  for (const r of [noKey, pub]) { assert.equal(r.exitCode, EXIT.FAILED); assertNothingSensitive(r.logged); }
});

test("step-summary indeholder kun de færdige linjer", async () => {
  const r = await run(goodEnv());
  const summary = stepSummary(r.lines);
  for (const l of r.lines) assert.ok(summary.includes(l));
  assertNothingSensitive([summary]);
});

// ── 4. workflowet ───────────────────────────────────────────────────────────────────────────────

const WF_CODE = WORKFLOW.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

test("workflow: kan kun startes manuelt og har ingen inputs", () => {
  const on = /^on:\n((?: {2}.*\n|\n)*)/m.exec(WF_CODE)?.[1] ?? "";
  assert.deepEqual(on.split("\n").filter((l) => l.trim() !== ""), ["  workflow_dispatch:"]);
  for (const ev of ["push", "pull_request", "pull_request_target", "schedule", "workflow_call", "workflow_run", "repository_dispatch", "inputs:"]) {
    assert.ok(!new RegExp(`^\\s+${ev}`, "m").test(WF_CODE), ev);
  }
});

test("workflow: kun contents: read, og ingen rettigheder på jobniveau", () => {
  const perms = [...WF_CODE.matchAll(/^( *)permissions:[ \t]*(.*)$/gm)];
  assert.equal(perms.length, 1, "præcis én permissions-blok");
  assert.equal(perms[0][1], "");
  const block = /^permissions:\n((?: {2}.*\n)*)/m.exec(WF_CODE)?.[1] ?? "";
  assert.deepEqual(block.trim().split("\n"), ["contents: read"]);
});

test("workflow: ét job, kun fra main, i environment e2e-prod, med tidsgrænse og låst runner", () => {
  const jobs = [...WF_CODE.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)].map((m) => m[1]).filter((j) => j !== "workflow_dispatch" && j !== "contents");
  assert.deepEqual(jobs, ["key-check"]);
  assert.match(WF_CODE, /^ {4}if: github\.ref == 'refs\/heads\/main'$/m);
  assert.match(WF_CODE, /^ {4}environment: e2e-prod$/m);
  assert.match(WF_CODE, /^ {4}runs-on: ubuntu-24\.04$/m);
  const timeout = Number(/^ {4}timeout-minutes:\s*(\d+)$/m.exec(WF_CODE)?.[1]);
  assert.ok(timeout > 0 && timeout <= 10, `timeout-minutes ${timeout}`);
});

test("workflow: præcis de tre secrets, hver én gang, i ren form og mappet til samme navn", () => {
  const refs = [...WF_CODE.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(refs, Object.values(ENV_NAMES).sort());
  for (const name of Object.values(ENV_NAMES)) {
    const lines = WF_CODE.split("\n").filter((l) => l.includes(`secrets.${name}`));
    assert.equal(lines.length, 1, name);
    assert.equal(lines[0], `          ${name}: \${{ secrets.${name} }}`, name);
  }
  assert.doesNotMatch(WF_CODE, /secrets\s*\[|secrets:\s*inherit|toJSON\(\s*secrets/);
  const exprs = [...WF_CODE.matchAll(/\$\{\{[^}]*\}\}/g)].map((m) => m[0]);
  assert.equal(exprs.length, 4, "ingen andre udtryk end de tre secrets og environment-markøren");
  const markerLines = WF_CODE.split("\n").filter((l) => l.includes("vars."));
  assert.deepEqual(markerLines, ["          E2E_PROD_ENVIRONMENT: ${{ vars.E2E_PROD_ENVIRONMENT }}"]);
});

test("workflow: ingen afhængigheder, ingen Playwright, ingen global-setup, ingen artefakter — kun scriptet", () => {
  for (const banned of [/npm\s+(?:ci|install|i)\b/, /\bnpx\b/, /playwright/i, /global-setup/, /upload-artifact/, /actions\/cache/, /\bcurl\b|\bwget\b/, /\bsupabase (?:db|functions|link|login|start|projects|secrets)\b/, /setup-cli/]) {
    assert.doesNotMatch(WF_CODE, banned, String(banned));
  }
  const runs = [...WF_CODE.matchAll(/^\s+run:\s*(.*)$/gm)].map((m) => m[1].trim());
  assert.deepEqual(runs, ["node .github/ci/e2e-prod-key-check.mjs"]);
  assert.match(WF_CODE, /persist-credentials: false/);
  assert.match(WF_CODE, /sparse-checkout: \.github\/ci/);
});

test("workflow: tager den delte E2E-lås som de andre workflows med service-nøglen (FIFO, aldrig afbrudt)", () => {
  const block = /^ {4}concurrency:\n((?: {6}.*\n)+)/m.exec(WF_CODE)?.[1] ?? "";
  assert.match(block, /^ {6}group: e2e-shared-supabase$/m);
  assert.match(block, /^ {6}cancel-in-progress: false$/m);
  assert.match(block, /^ {6}queue: max$/m);
});
