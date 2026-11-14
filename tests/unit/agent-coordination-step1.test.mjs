// Agentkoordinering trin 1 (docs/operations/agent-coordination.md): fælles låsemappe på tværs af kloner,
// sessions-id fra harnessen, gamle låse og konflikter, og `whois` efter genstart og procesophør.
// Alt kører i midlertidige mapper og repos; ingen netværk, ingen rigtig ~/.claude.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { EXIT, repoKey, main, claim, claimFile, whois, findSession, resolveSession, locate, verifyIdentity, sameStart, migrateLegacy, productionEnv, TEST_OVERRIDES, readClaim } from "../../tools/agents/claim.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const URL_ = "https://github.com/Example/Repo.git";
const sh = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const tmp = () => mkdtempSync(join(tmpdir(), "laerlig-step1-"));

// To uafhængige kloner af "samme" GitHub-repo (samme origin-URL), en fælles låsemappe og en sessionsmappe.
function world() {
  const root = tmp();
  const clones = ["k1", "k2"].map((n) => { const d = join(root, n); mkdirSync(d); sh(["init", "-q"], d); sh(["remote", "add", "origin", URL_], d); return d; });
  const home = join(root, "claims-home"), sessions = join(root, "sessions");
  mkdirSync(sessions);
  const env = (session) => ({ LAERLIG_CLAIMS_HOME: home, CLAUDE_SESSIONS_DIR: sessions, CLAUDE_CODE_SESSION_ID: session, USERPROFILE: root });
  const run = async (cwd, session, ...argv) => {
    const log = [];
    const code = await main(argv, { env: env(session), cwd, out: (s) => log.push(s), err: (s) => log.push(s), alive: (pid) => pid >= 1000, parentOf: (pid) => pid + 1, startOf: () => null });
    return { code, log: log.join("\n") };
  };
  const sessionFile = (pid, sessionId, name, extra = {}) => writeFileSync(join(sessions, `${pid}.json`), JSON.stringify({ pid, sessionId, name, status: "idle", updatedAt: pid, ...extra }));
  return { root, clones, home, sessions, env, run, sessionFile, done: () => rmSync(root, { recursive: true, force: true }) };
}

test("repo-nøglen er den samme for https/ssh og indeholder aldrig brugernavn eller kodeord", () => {
  const k = "github.com__moeller888__den-seje-app-frontend";
  for (const u of ["https://github.com/Moeller888/den-seje-app-frontend.git", "git@github.com:Moeller888/den-seje-app-frontend.git",
    "https://user:hemmelig@github.com/Moeller888/den-seje-app-frontend", "ssh://git@github.com/Moeller888/den-seje-app-frontend.git/"]) {
    assert.equal(repoKey(u), k, u);
  }
  assert.throws(() => repoKey(""), /kan ikke udlede repo/);
  // V7: alle gyldige GitHub-former giver samme nøgle …
  for (const u of ["ssh://git@github.com:22/Moeller888/den-seje-app-frontend.git", "ssh://git@ssh.github.com:443/Moeller888/den-seje-app-frontend.git",
    "https://www.github.com/Moeller888/den-seje-app-frontend", "https://github.com:443/moeller888/DEN-SEJE-APP-FRONTEND.git", "git@github.com:Moeller888/den-seje-app-frontend"]) {
    assert.equal(repoKey(u), k, u);
  }
  // … og ukendte eller tvetydige adresser afvises i stedet for at give en anden låsemappe.
  for (const u of ["git@github.com:/Moeller888/den-seje-app-frontend.git", "ssh://git@github.com:2222/Moeller888/den-seje-app-frontend",
    "https://gitlab.com/Moeller888/den-seje-app-frontend", "https://github.com/Moeller888/den-seje-app-frontend/tree/main",
    "github.com/Moeller888/den-seje-app-frontend", "file:///C:/x/repo", "C:\\Users\\x\\repo", "git://github.com/Moeller888/x.git",
    "https://ssh.github.com/Moeller888/x", "https://evil.example/github.com/Moeller888/x"]) {
    assert.throws(() => repoKey(u), /kan ikke udlede repo/, u);
  }
  assert.throws(() => repoKey("https://user:hemmelig@"), (e) => !String(e.message).includes("hemmelig"));
});

test("to agenter i FORSKELLIGE kloner om samme branch: den anden afvises (fælles låsemappe)", async () => {
  const w = world();
  try {
    const a = await w.run(w.clones[0], "A", "claim", "--branch", "ci/x", "--task", "T", "--purpose", "p");
    assert.equal(a.code, EXIT.OK, a.log);
    const b = await w.run(w.clones[1], "B", "claim", "--branch", "ci/x", "--task", "T", "--purpose", "p");
    assert.equal(b.code, EXIT.OWNED_BY_OTHER, b.log);
    assert.match(b.log, /STOP — ci\/x: ejet af session A/);
    assert.equal((await w.run(w.clones[1], "B", "check", "--branch", "ci/x")).code, EXIT.OWNED_BY_OTHER);
    assert.equal((await w.run(w.clones[1], "A", "check", "--branch", "ci/x")).code, EXIT.OK, "samme session fra en anden klon er stadig ejeren");
    assert.ok(existsSync(join(w.home, repoKey(URL_), "ci__x.json")));
  } finally { w.done(); }
});

test("sessions-id kommer fra harnessen; et afvigende --session afvises", async () => {
  const w = world();
  try {
    const r = await w.run(w.clones[0], "A", "claim", "--branch", "b", "--session", "B", "--task", "T", "--purpose", "p");
    assert.equal(r.code, EXIT.USAGE);
    assert.match(r.log, /afviger fra harnessens CLAUDE_CODE_SESSION_ID/);
    assert.equal(resolveSession(undefined, { CLAUDE_CODE_SESSION_ID: "A" }), "A");
    assert.equal(resolveSession("A", { CLAUDE_CODE_SESSION_ID: "A" }), "A");
    assert.throws(() => resolveSession(undefined, {}), /intet sessions-id/);
  } finally { w.done(); }
});

test("en gammel lås (klonens .git) fra en anden session stopper; ny og gammel med forskellige ejere er KONFLIKT", async () => {
  const w = world();
  try {
    const legacy = join(w.clones[1], ".git", "laerlig-claims");
    claim(legacy, { branch: "ci/y", session: "B", task: "T", purpose: "p" });
    const r = await w.run(w.clones[1], "A", "claim", "--branch", "ci/y", "--task", "T", "--purpose", "p");
    assert.equal(r.code, EXIT.OWNED_BY_OTHER, r.log);
    assert.equal(existsSync(join(w.home, repoKey(URL_), "ci__y.json")), false, "der skrives ingen ny lås ovenpå en andens");
    claim(join(w.home, repoKey(URL_)), { branch: "ci/y", session: "A", task: "T", purpose: "p" }); // modstridende tilstand
    for (const cmd of ["check", "push-check", "verify", "heartbeat", "release"]) {
      const c = await w.run(w.clones[1], "A", cmd, "--branch", "ci/y");
      assert.equal(c.code, EXIT.CONFLICT, `${cmd}: ${c.log}`);
    }
    assert.equal((await w.run(w.clones[1], "A", "whois", "--branch", "ci/y")).code, EXIT.CONFLICT);
    assert.ok(existsSync(claimFile(legacy, "ci/y")) && existsSync(join(w.home, repoKey(URL_), "ci__y.json")), "intet slettes ved konflikt");
  } finally { w.done(); }
});

test("en gammel lås fra SAMME session respekteres; release frigiver begge placeringer, aldrig en andens", async () => {
  const w = world();
  try {
    const legacy = join(w.clones[0], ".git", "laerlig-claims");
    claim(legacy, { branch: "z", session: "A", task: "T", purpose: "p" });
    assert.equal((await w.run(w.clones[0], "A", "check", "--branch", "z")).code, EXIT.OK);
    assert.equal((await w.run(w.clones[0], "A", "claim", "--branch", "z", "--task", "T", "--purpose", "p")).code, EXIT.OK);
    assert.equal((await w.run(w.clones[0], "A", "release", "--branch", "z")).code, EXIT.OK);
    assert.equal(existsSync(claimFile(legacy, "z")), false);
    assert.equal(locate({ shared: join(w.home, repoKey(URL_)), legacy }, "z").claim, null);
  } finally { w.done(); }
});

test("whois efter genstart: ny PID og nyt navn findes via sessions-id; den forældede sessionsfil nævnes; låsen er urørt", async () => {
  const w = world();
  try {
    w.sessionFile(17868, "A", "den-seje-app-ea");
    await w.run(w.clones[0], "A", "claim", "--branch", "ci/pin", "--task", "T", "--purpose", "p");
    const lockFile = join(w.home, repoKey(URL_), "ci__pin.json");
    assert.equal(JSON.parse(readFileSync(lockFile, "utf8")).sessionName, "den-seje-app-ea");
    // Genstart: den gamle proces er død (PID < 1000 i testens alive), en ny proces med nyt navn og ny PID.
    w.sessionFile(500, "A", "den-seje-app-ea", { updatedAt: 1 });
    w.sessionFile(22704, "A", "den-seje-app-68", { status: "busy" });
    const r = await w.run(w.clones[1], "B", "whois", "--branch", "ci/pin");
    assert.equal(r.code, EXIT.OK, r.log);
    assert.match(r.log, /Ejer nu: den-seje-app-68 · session A · PID 22704 · status busy · terminalens shell-PID 22705/);
    assert.match(r.log, /Forældede sessionsfiler for samme session \(genstart\): PID (500, 17868|17868, 500)/);
    assert.match(r.log, /Navnet er skiftet siden låsen blev taget: den-seje-app-ea → den-seje-app-68/);
    assert.equal((await w.run(w.clones[1], "A", "check", "--branch", "ci/pin")).code, EXIT.OK, "den genstartede session ejer stadig");
  } finally { w.done(); }
});

test("gammel lås efter procesophør: bevares, overtages ikke, og whois siger det", async () => {
  const w = world();
  try {
    w.sessionFile(400, "A", "den-seje-app-xx"); // død proces
    await w.run(w.clones[0], "A", "claim", "--branch", "old", "--task", "T", "--purpose", "p");
    let r = await w.run(w.clones[1], "B", "whois", "--branch", "old");
    assert.match(r.log, /PID 400 \(PROCES VÆK — forældet sessionsfil\)/);
    rmSync(join(w.sessions, "400.json"));
    r = await w.run(w.clones[1], "B", "whois", "--branch", "old");
    assert.match(r.log, /kører ikke \(ingen sessionsfil\)\. Låsen er bevaret/);
    assert.equal((await w.run(w.clones[1], "B", "claim", "--branch", "old", "--task", "T", "--purpose", "p")).code, EXIT.OWNED_BY_OTHER);
    assert.equal((await w.run(w.clones[1], "B", "release", "--branch", "old")).code, EXIT.OWNED_BY_OTHER);
    assert.ok(existsSync(join(w.home, repoKey(URL_), "old.json")));
    assert.equal(findSession("findes-ikke", { env: w.env("B") }), null);
  } finally { w.done(); }
});

test("whois uden lås og list viser både ny og gammel placering", async () => {
  const w = world();
  try {
    assert.equal((await w.run(w.clones[0], "A", "whois", "--branch", "ingen")).code, EXIT.UNCLAIMED);
    claim(join(w.clones[0], ".git", "laerlig-claims"), { branch: "gammel", session: "C", task: "T", purpose: "p" });
    await w.run(w.clones[0], "A", "claim", "--branch", "ny", "--task", "T", "--purpose", "p");
    const r = await w.run(w.clones[0], "A", "list");
    assert.match(r.log, /^ny: ejet af session A/m);
    assert.match(r.log, /^\[gammel placering\] gammel: ejet af session C/m);
    assert.equal(whois({ shared: join(w.home, "tom"), legacy: null }, "x").code, EXIT.UNCLAIMED);
  } finally { w.done(); }
});

test("V8: en levende PID med en anden starttid er GENBRUGT — whois siger, at sessionen ikke kører", async () => {
  const w = world();
  try {
    w.sessionFile(4321, "A", "den-seje-app-zz", { procStart: "134391387747916231" });
    await w.run(w.clones[0], "A", "claim", "--branch", "pid", "--task", "T", "--purpose", "p");
    const dirs = { shared: join(w.home, repoKey(URL_)), legacy: null };
    const reused = whois(dirs, "pid", { env: w.env("B"), alive: () => true, startOf: () => "134391999999999999", parentOf: () => 1 });
    assert.match(reused.text, /PID 4321 \(PID GENBRUGT af en anden proces — sessionen kører ikke\)/);
    assert.doesNotMatch(reused.text, /terminalens shell-PID/);
    const same = whois(dirs, "pid", { env: w.env("B"), alive: () => true, startOf: () => "134391387747916230", parentOf: () => 77 });
    assert.match(same.text, /PID 4321 · status idle · terminalens shell-PID 77/);
    assert.equal(sameStart("134391387747916231", "134391387747916230"), true);
    assert.equal(sameStart("134391387747916231", null), null);
  } finally { w.done(); }
});

test("V1: identiteten bindes til processens forfædre og Claude Codes sessionsfil — en miljøvariabel alene er ikke nok", () => {
  const w = world();
  try {
    // node(900) → bash(800) → claude(700, session A) → shell(600)
    const table = new Map([[900, { ppid: 800, start: "400000" }], [800, { ppid: 700, start: "300000" }], [700, { ppid: 600, start: "200000" }], [600, { ppid: 600, start: "10" }]]);
    w.sessionFile(700, "A", "den-seje-app-aa", { procStart: "200001" });
    w.sessionFile(701, "B", "den-seje-app-bb", { procStart: "5" });
    assert.deepEqual(verifyIdentity({ env: w.env("A"), table, selfPid: 900 }), { ok: true, session: "A", pid: 700 });
    const spoof = verifyIdentity({ env: w.env("B"), table, selfPid: 900 });
    assert.equal(spoof.ok, false); assert.equal(spoof.impersonation, true); assert.match(spoof.reason, /kører i session A, ikke i B/);
    assert.match(verifyIdentity({ env: { ...w.env("A"), CLAUDE_CODE_SESSION_ID: "" }, table, selfPid: 900 }).reason, /intet CLAUDE_CODE_SESSION_ID/);
    const reused = new Map(table); reused.set(700, { ppid: 600, start: "100000" }); // anden proces med samme PID
    assert.match(verifyIdentity({ env: w.env("A"), table: reused, selfPid: 900 }).reason, /passer ikke til processens starttid/);
    assert.match(verifyIdentity({ env: w.env("A"), table, selfPid: 12345 }).reason, /ingen Claude Code-session blandt processens forfædre/);
    // En forælder, der er startet EFTER barnet, er en genbrugt PID: kæden stopper der.
    const late = new Map(table); late.set(800, { ppid: 700, start: "500000" });
    assert.equal(verifyIdentity({ env: w.env("A"), table: late, selfPid: 900 }).ok, false);
  } finally { w.done(); }
});

test("V6: migrate-legacy KOPIERER denne klons gamle låse med samme ejer — sletter, flytter og overtager intet", async () => {
  const w = world();
  try {
    const legacy = join(w.clones[0], ".git", "laerlig-claims");
    const shared = join(w.home, repoKey(URL_));
    claim(legacy, { branch: "gl/a", session: "C", task: "T", purpose: "p" });
    claim(legacy, { branch: "gl/b", session: "C", task: "T", purpose: "p" });
    claim(shared, { branch: "gl/b", session: "D", task: "T", purpose: "p" }); // en andens fælles lås
    const r = await w.run(w.clones[0], "A", "migrate-legacy");
    assert.equal(r.code, EXIT.CONFLICT, r.log);
    assert.match(r.log, /gl\/a: kopieret — ejer C/);
    assert.match(r.log, /gl\/b: KONFLIKT — fælles: D, gammel: C/);
    assert.equal(readClaim(shared, "gl/a").session, "C");
    assert.equal(readClaim(shared, "gl/b").session, "D", "en eksisterende fælles lås overskrives aldrig");
    assert.ok(existsSync(claimFile(legacy, "gl/a")) && existsSync(claimFile(legacy, "gl/b")), "de gamle filer bliver liggende");
    // Nu ser den ANDEN klon låsen; ingen kan tage den.
    assert.equal((await w.run(w.clones[1], "B", "claim", "--branch", "gl/a", "--task", "T", "--purpose", "p")).code, EXIT.OWNED_BY_OTHER);
    // Gentagen kørsel ændrer intet.
    assert.deepEqual(migrateLegacy({ shared, legacy }).map((x) => x.status), ["findes allerede", "KONFLIKT"]);
  } finally { w.done(); }
});

test("V2: kommandolinjen ignorerer testvariablerne, der flytter låse, sessioner, transskript og register", () => {
  const warn = [];
  const clean = productionEnv({ LAERLIG_CLAIMS_DIR: "x", CLAUDE_PROJECTS_DIR: "y", PATH: "p" }, (s) => warn.push(s));
  assert.deepEqual(Object.keys(clean), ["PATH"]);
  assert.match(warn[0], /LAERLIG_CLAIMS_DIR, CLAUDE_PROJECTS_DIR ignoreres/);
  assert.deepEqual([...TEST_OVERRIDES].sort(), ["CLAUDE_PROJECTS_DIR", "CLAUDE_SESSIONS_DIR", "LAERLIG_APPROVALS_DIR", "LAERLIG_CLAIMS_DIR", "LAERLIG_CLAIMS_HOME"]);
  const root = tmp();
  try {
    const repo = join(root, "r"); mkdirSync(repo); sh(["init", "-q"], repo); sh(["remote", "add", "origin", URL_], repo);
    const fake = join(root, "falsk"); mkdirSync(fake);
    claim(fake, { branch: "x", session: "FREMMED", task: "T", purpose: "p" });
    const cli = fileURLToPath(new URL("../../tools/agents/claim.mjs", import.meta.url));
    const r = spawnSync(process.execPath, [cli, "list"], { cwd: repo, encoding: "utf8", env: { ...process.env, USERPROFILE: root, HOME: root, LAERLIG_CLAIMS_DIR: fake } });
    assert.match(r.stderr, /LAERLIG_CLAIMS_DIR ignoreres/);
    assert.doesNotMatch(r.stdout, /FREMMED/, "den falske låsemappe bruges ikke");
    assert.match(r.stdout, /ingen låse/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
