// tools/agents/approvals.mjs — RÅDGIVENDE register for Christophers GO'er (docs/operations/agent-coordination.md).
// Et kunstigt transskript i Claude Codes format (felterne er de samme, som harnessen skriver), et rigtigt bart
// git-remote med en PR-ref (refs/pull/7/head) og alt i midlertidige mapper. Ingen netværk, ingen rigtig ~/.claude.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { AEXIT, ADVISORY, TOKEN, record, use, check, load, list, parseGoCommand, isHumanTyped, approvalId, main } from "../../tools/agents/approvals.mjs";
import { verifyIdentity } from "../../tools/agents/claim.mjs";

const MODULE = new URL("../../tools/agents/approvals.mjs", import.meta.url).href;
const SRC = new URL("../../tools/agents/approvals.mjs", import.meta.url);
const REPO = "github.com__example__repo";
const SA = "aaaaaaaa-0000-4000-8000-000000000001";
const SB = "bbbbbbbb-0000-4000-8000-000000000002";
// Den simulerede "nu"-tid. Alle kald får den: biblioteksfunktionerne via `now`, og CLI-kaldene (main() tager intet
// `now`) via et mocket Date-ur (t.mock.timers), så ingen test afhænger af computerens rigtige dato og tid.
const T0 = Date.parse("2026-11-14T12:00:00Z");
const HOUR = 3_600_000;
// Beskeder skrives 60 s før T0 (typed()); et GO udløber `timer` timer efter beskedens tidspunkt (standard 24).
const expiryOf = (hours) => T0 - 60_000 + hours * HOUR;
// Fryser Date.now()/new Date() på `now` i denne test (nulstilles automatisk bagefter), og beviser, at uret er mocket.
function freezeClock(t, now) {
  t.mock.timers.enable({ apis: ["Date"], now });
  assert.equal(Date.now(), now, "uret er kontrolleret");
}
const g = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function world() {
  const root = mkdtempSync(join(tmpdir(), "laerlig-approvals-"));
  const projects = join(root, "projects"), sessions = join(root, "sessions"), dir = join(root, "approvals");
  mkdirSync(join(projects, "p"), { recursive: true });
  mkdirSync(sessions);
  // Rigtigt remote: bar repo + klon; branchen ci/x og GitHubs PR-ref refs/pull/7/head peger på samme commit.
  const bare = join(root, "r.git"), a = join(root, "a");
  g(["init", "-q", "--bare", bare], root);
  g(["clone", "-q", bare, a], root);
  let n = 0;
  const advance = ({ pr = true, branch = "ci/x" } = {}) => {
    writeFileSync(join(a, "f"), String(++n)); g(["add", "f"], a);
    g(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", `c${n}`], a);
    g(["push", "-q", "origin", `HEAD:refs/heads/${branch}`], a);
    const h = g(["rev-parse", "HEAD"], a);
    if (pr) g(["update-ref", "refs/pull/7/head", h], bare);
    return h;
  };
  const head = advance();
  const tx = (s) => join(projects, "p", `${s}.jsonl`);
  const add = (s, entry) => { const uuid = randomUUID(); appendFileSync(tx(s), JSON.stringify({ sessionId: s, uuid, timestamp: new Date(T0 - 60_000).toISOString(), ...entry }) + "\n"); return uuid; };
  const typed = (s, text, extra = {}) => add(s, { type: "user", origin: { kind: "human" }, promptSource: "typed", turnOrigin: "human", userType: "external", message: { role: "user", content: text }, ...extra });
  const env = { CLAUDE_PROJECTS_DIR: projects, CLAUDE_SESSIONS_DIR: sessions, USERPROFILE: root };
  const as = (s) => () => ({ ok: true, session: s });
  const opts = (s, extra = {}) => ({ env, identity: as(s), cwd: a, now: T0, ...extra });
  const go = (extra = "") => `${TOKEN} merge repo=Example/Repo branch=ci/x pr=7 head=${head}${extra}`;
  return { root, dir, bare, a, head, advance, tx, add, typed, env, as, opts, go, sessions, done: () => rmSync(root, { recursive: true, force: true }) };
}
const MERGE = { action: "merge", branch: "ci/x", pr: "7", repo: REPO };

test("en GO-KOMMANDO, brugeren selv har tastet, registreres — rådgivende, og registreringen udfører intet", () => {
  const w = world();
  try {
    w.typed(SA, `Alt er kontrolleret.\n\n${w.go()}\n`);
    const r = record(w.dir, { repo: REPO }, w.opts(SA));
    assert.equal(r.code, AEXIT.OK, r.reason);
    const stored = JSON.parse(readFileSync(join(w.dir, `${r.approval.id}.json`), "utf8"));
    assert.equal(stored.status, "RÅDGIVENDE");
    assert.deepEqual([stored.action, stored.branch, stored.pr, stored.head, stored.executor, stored.issuedBySession], ["merge", "ci/x", "7", w.head, null, SA]);
    assert.equal(stored.expiresAt, new Date(T0 - 60_000 + 24 * 3_600_000).toISOString(), "udløb regnes fra beskedens tidspunkt");
    assert.equal(g(["rev-parse", "refs/heads/ci/x"], w.bare), w.head, "registrering ændrer intet på remote");
    assert.match(ADVISORY, /erstatter ikke LÆRLIG-GUARD/);
    assert.match(ADVISORY, /ikke kryptografisk bevis/);
    const src = readFileSync(SRC, "utf8");
    assert.doesNotMatch(src, /(run|git|execFileSync)\(\s*(?:"git",\s*)?\[\s*"(push|merge|reset|checkout|commit|rebase|update-ref|branch)"/, "værktøjet kører aldrig en skrivende git-kommando");
    assert.doesNotMatch(src, /\bgh\b["']?\s*,\s*\[/, "værktøjet kalder aldrig gh");
  } finally { w.done(); }
});

test("K1: afslag, omtale, citat, kodeblok, indsat log og alt uden for grammatikken er ALDRIG et GO", () => {
  const w = world();
  try {
    const G = w.go();
    const rejected = {
      "før jeg giver": "Før jeg giver merge-GO til #7, skal du gennemføre en sikkerhedsgennemgang. HEAD " + w.head,
      "afslag": `Du har ikke GO til merge af PR #7 (branch ci/x, head ${w.head}).`,
      "omtale i prosa": `Senere sender jeg måske ${G} når testene er grønne.`,
      "citat": `Som skrevet før:\n> ${G}`,
      "kodeblok": "Eksempel:\n```\n" + G + "\n```",
      "indsat log": `Her er loggen:\n<pasted_content id="ab12">\n${G}\n</pasted_content id="ab12">`,
      "indsat, uafsluttet": `<pasted_content id="zz">\n${G}`,
      "indsat log + tastet linje": `<pasted_content id="ab12">\n${G}\n</pasted_content id="ab12">\n${G}`,
      "to linjer": `${G}\n${G}`,
      "ekstra ord": `${G} ikke`,
      "forkert store/små": G.replace(TOKEN, "go-kommando"),
      "ukendt handling": G.replace(" merge ", " deploy "),
      "ukendt nøgle": `${G} scope=alt`,
      "dobbelt nøgle": `${G} pr=8`,
      "kort HEAD": G.replace(w.head, w.head.slice(0, 12)),
      "uden HEAD": G.replace(` head=${w.head}`, ""),
      "merge uden PR": G.replace(" pr=7", ""),
      "head=ingen ved merge": G.replace(w.head, "ingen"),
      "timer over 72": `${G} timer=73`,
      "til= ikke et sessions-id": `${G} til=den-seje-app-68`,
      "uden GO-KOMMANDO": "GO til merge af PR #7",
    };
    for (const [why, text] of Object.entries(rejected)) {
      const p = parseGoCommand(text);
      assert.ok(p.error && !p.command, `${why}: ${JSON.stringify(p)}`);
    }
    // Afvisningen har den rigtige grund (ikke blot et sidefænomen af en anden kontrol).
    assert.match(parseGoCommand(rejected["indsat log"]).error, /står i indsat tekst/);
    assert.match(parseGoCommand(rejected["indsat, uafsluttet"]).error, /står i indsat tekst/);
    assert.match(parseGoCommand(rejected["citat"]).error, /står i et citat/);
    assert.match(parseGoCommand(rejected["kodeblok"]).error, /står i en kodeblok/);
    assert.match(parseGoCommand(rejected["uden HEAD"]).error, /forventet HEAD er obligatorisk/);
    assert.match(parseGoCommand(rejected["indsat log + tastet linje"]).error, /forekommer 2 gange/);
    // Det samme gennem record: hver besked tastet for sig giver 26, og intet skrives.
    for (const text of Object.values(rejected)) {
      w.typed(SA, text);
      const r = record(w.dir, { repo: REPO }, w.opts(SA));
      assert.equal(r.code, AEXIT.NO_COMMAND, `${text}: ${r.reason}`);
    }
    assert.equal(list(w.dir).length, 0, "intet registreret");
    // Peer-beskeder, notifikationer, accepterede forslag, modellens tekst og en anden sessions besked tæller ikke.
    const w2 = world();
    try {
      w2.add(SA, { type: "user", origin: { kind: "peer", name: "den-seje-app-68" }, promptSource: "system", turnOrigin: "peer", isMeta: true, message: { role: "user", content: w2.go() } });
      w2.add(SA, { type: "user", origin: { kind: "task-notification" }, promptSource: "system", turnOrigin: "task_notification", message: { role: "user", content: w2.go() } });
      w2.add(SA, { type: "user", origin: { kind: "human" }, promptSource: "suggestion_accepted", turnOrigin: "human", message: { role: "user", content: w2.go() } });
      w2.add(SA, { type: "assistant", message: { role: "assistant", content: w2.go() } });
      w2.typed(SB, w2.go());
      assert.equal(record(w2.dir, { repo: REPO }, w2.opts(SA)).code, AEXIT.NO_COMMAND);
      assert.equal(isHumanTyped({ type: "user", sessionId: SA, uuid: "u", origin: { kind: "human" }, promptSource: "typed", turnOrigin: "human", message: { content: "x" } }, SA), true);
    } finally { w2.done(); }
  } finally { w.done(); }
});

test("K2: samme besked kan kun registreres én gang — også kopieret med nyt uuid og ved 10 samtidige forsøg", async () => {
  const w = world();
  try {
    w.typed(SA, w.go());
    const first = record(w.dir, { repo: REPO }, w.opts(SA));
    assert.equal(first.code, AEXIT.OK, first.reason);
    const again = record(w.dir, { repo: REPO }, w.opts(SA));
    assert.equal(again.code, AEXIT.ALREADY_RECORDED, again.reason);
    // Genoptaget transskript: samme tidsstempel og indhold, nyt uuid → samme id → afvist.
    w.typed(SA, w.go());
    assert.equal(record(w.dir, { repo: REPO }, w.opts(SA)).code, AEXIT.ALREADY_RECORDED);
    // Samtidige processer om en NY besked: præcis én registrering.
    w.typed(SA, w.go(" timer=2"), { timestamp: new Date(T0 - 30_000).toISOString() });
    const one = () => new Promise((res) => {
      const p = spawn(process.execPath, ["--input-type=module", "-e",
        `const m = await import(${JSON.stringify(MODULE)}); process.stdout.write(String(m.record(${JSON.stringify(w.dir)}, { repo: ${JSON.stringify(REPO)} }, { env: ${JSON.stringify(w.env)}, now: ${T0}, identity: () => ({ ok: true, session: ${JSON.stringify(SA)} }) }).code));`]);
      let o = ""; p.stdout.on("data", (c) => { o += c; }); p.on("close", () => res(o));
    });
    const codes = await Promise.all(Array.from({ length: 10 }, one));
    assert.equal(codes.filter((c) => c === "0").length, 1, codes.join(","));
    assert.equal(codes.filter((c) => c === String(AEXIT.ALREADY_RECORDED)).length, 9, codes.join(","));
    assert.equal(list(w.dir).length, 2);
  } finally { w.done(); }
});

test("engangsbrug: brugt GO kan ikke genbruges; 10 samtidige forbrug giver præcis én succes", async () => {
  const w = world();
  try {
    w.typed(SA, w.go());
    const id = record(w.dir, { repo: REPO }, w.opts(SA)).approval.id;
    assert.equal(check(w.dir, id, MERGE, w.opts(SA)).code, AEXIT.OK);
    const one = () => new Promise((res) => {
      const p = spawn(process.execPath, ["--input-type=module", "-e",
        `const m = await import(${JSON.stringify(MODULE)}); process.stdout.write(String(m.use(${JSON.stringify(w.dir)}, ${JSON.stringify(id)}, ${JSON.stringify(MERGE)}, { env: ${JSON.stringify(w.env)}, cwd: ${JSON.stringify(w.a)}, now: ${T0}, identity: () => ({ ok: true, session: ${JSON.stringify(SA)} }) }).code));`]);
      let o = ""; p.stdout.on("data", (c) => { o += c; }); p.on("close", () => res(o));
    });
    const codes = await Promise.all(Array.from({ length: 10 }, one));
    assert.equal(codes.filter((c) => c === "0").length, 1, codes.join(","));
    assert.equal(codes.filter((c) => c === String(AEXIT.USED)).length, 9, codes.join(","));
    assert.equal(use(w.dir, id, MERGE, w.opts(SA)).code, AEXIT.USED, "sekventielt genbrug");
    assert.equal(check(w.dir, id, MERGE, w.opts(SA)).code, AEXIT.USED, "også kontrol uden forbrug siger BRUGT");
    assert.equal(list(w.dir)[0].used, true);
  } finally { w.done(); }
});

test("omfanget kan ikke udvides ved brug: anden handling, PR, branch eller repo stopper; GO til et andet repo registreres ikke", () => {
  const w = world();
  try {
    w.typed(SA, w.go());
    const id = record(w.dir, { repo: REPO }, w.opts(SA)).approval.id;
    for (const s of [{ ...MERGE, action: "push" }, { ...MERGE, pr: "8" }, { ...MERGE, branch: "main" }, { ...MERGE, repo: "github.com__other__repo" }, { ...MERGE, pr: null }]) {
      assert.equal(use(w.dir, id, s, w.opts(SA)).code, AEXIT.SCOPE, JSON.stringify(s));
    }
    w.typed(SA, w.go().replace("Example/Repo", "Other/Repo"), { timestamp: new Date(T0 - 10_000).toISOString() });
    assert.equal(record(w.dir, { repo: REPO }, w.opts(SA)).code, AEXIT.SCOPE);
  } finally { w.done(); }
});

test("V5: HEAD tjekkes mod det rigtige remote — ny commit på branchen, flyttet PR-ref og en ny branch, der opstår, stopper", () => {
  const w = world();
  try {
    w.typed(SA, w.go());
    const id = record(w.dir, { repo: REPO }, w.opts(SA)).approval.id;
    w.advance({ pr: false }); // branchen flytter sig
    const c = use(w.dir, id, MERGE, w.opts(SA));
    assert.equal(c.code, AEXIT.HEAD_CHANGED, c.reason);
    // Kun PR-ref'en flytter sig (fx force-push til PR'en fra en anden branch): også stop.
    const w2 = world();
    try {
      w2.typed(SA, w2.go());
      const id2 = record(w2.dir, { repo: REPO }, w2.opts(SA)).approval.id;
      g(["update-ref", "refs/pull/7/head", g(["rev-parse", "HEAD"], w2.a)], w2.bare); // samme
      writeFileSync(join(w2.a, "g"), "x"); g(["add", "g"], w2.a); g(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "pr"], w2.a);
      g(["push", "-q", "origin", "HEAD:refs/heads/andet"], w2.a);
      g(["update-ref", "refs/pull/7/head", g(["rev-parse", "HEAD"], w2.a)], w2.bare);
      const r = use(w2.dir, id2, MERGE, w2.opts(SA));
      assert.equal(r.code, AEXIT.HEAD_CHANGED, r.reason);
      assert.match(r.reason, /PR #7 peger på/);
    } finally { w2.done(); }
    // push til en NY branch: head=ingen gælder kun, så længe branchen ikke findes.
    w.typed(SA, `${TOKEN} push repo=Example/Repo branch=ny/b head=ingen`, { timestamp: new Date(T0 - 20_000).toISOString() });
    const idNy = record(w.dir, { repo: REPO }, w.opts(SA)).approval.id;
    const ny = { action: "push", branch: "ny/b", pr: null, repo: REPO };
    assert.equal(check(w.dir, idNy, ny, w.opts(SA)).code, AEXIT.OK);
    w.advance({ pr: false, branch: "ny/b" });
    assert.equal(use(w.dir, idNy, ny, w.opts(SA)).code, AEXIT.HEAD_CHANGED);
  } finally { w.done(); }
});

test("udførende session: kun den navngivne kan bruge GO'et; en agent kan ikke udgive sig for en anden", () => {
  const w = world();
  try {
    w.typed(SA, w.go(` til=${SB}`));
    const r = record(w.dir, { repo: REPO }, w.opts(SA));
    assert.equal(r.code, AEXIT.OK, r.reason);
    assert.equal(use(w.dir, r.approval.id, MERGE, w.opts(SA)).code, AEXIT.WRONG_SESSION, "hovedagenten selv er ikke udførende");
    // Agent A sætter CLAUDE_CODE_SESSION_ID=B, men processen kører i A's Claude Code-proces → afvist.
    const table = new Map([[900, { ppid: 700, start: "300000" }], [700, { ppid: 600, start: "200000" }], [600, { ppid: 600, start: "1" }]]);
    writeFileSync(join(w.sessions, "700.json"), JSON.stringify({ pid: 700, sessionId: SA, procStart: "200000", name: "den-seje-app-aa" }));
    const spoofEnv = { ...w.env, CLAUDE_CODE_SESSION_ID: SB };
    const spoof = use(w.dir, r.approval.id, MERGE, { ...w.opts(SB), env: spoofEnv, identity: () => verifyIdentity({ env: spoofEnv, table, selfPid: 900 }) });
    assert.equal(spoof.code, AEXIT.WRONG_SESSION, spoof.reason);
    assert.match(spoof.reason, /kan ikke optræde som en anden session/);
    // Uden en bekræftelig Claude Code-forfader: ingen identitet.
    const none = use(w.dir, r.approval.id, MERGE, { ...w.opts(SB), env: spoofEnv, identity: () => verifyIdentity({ env: spoofEnv, table, selfPid: 4242 }) });
    assert.equal(none.code, AEXIT.IDENTITY, none.reason);
    assert.equal(use(w.dir, r.approval.id, MERGE, w.opts(SB)).code, AEXIT.OK);
  } finally { w.done(); }
});

test("manipulation opdages: ændret felt, forlænget udløb, forfalsket id, ændret og slettet brugerbesked", () => {
  const w = world();
  try {
    w.typed(SA, w.go());
    const id = record(w.dir, { repo: REPO }, w.opts(SA)).approval.id;
    const f = join(w.dir, `${id}.json`);
    const orig = readFileSync(f, "utf8");
    const edit = (fn) => { const o = JSON.parse(orig); fn(o); writeFileSync(f, JSON.stringify(o)); };
    edit((o) => { o.pr = "8"; });
    let r = use(w.dir, id, { ...MERGE, pr: "8" }, w.opts(SA));
    assert.equal(r.code, AEXIT.TAMPERED, r.reason); assert.match(r.reason, /pr: "8" ≠ brugerens "7"/);
    edit((o) => { o.expiresAt = "2099-01-01T00:00:00.000Z"; });
    assert.equal(use(w.dir, id, MERGE, w.opts(SA)).code, AEXIT.TAMPERED, "forlænget udløb");
    edit((o) => { o.executor = SB; });
    assert.equal(use(w.dir, id, MERGE, w.opts(SB)).code, AEXIT.TAMPERED, "tilføjet udfører");
    edit((o) => { o.transcriptTimestamp = new Date(T0).toISOString(); });
    assert.equal(load(w.dir, id).code, AEXIT.TAMPERED, "id passer ikke længere");
    // Forfalsket post under genberegnet id: beskeden med det tidsstempel findes ikke.
    const forged = { ...JSON.parse(orig), transcriptTimestamp: new Date(T0).toISOString() };
    forged.id = approvalId(forged);
    writeFileSync(join(w.dir, `${forged.id}.json`), JSON.stringify(forged));
    assert.equal(use(w.dir, forged.id, MERGE, w.opts(SA)).code, AEXIT.TAMPERED);
    // Konsekvent forskudt tidsstempel + udløb + genberegnet id (forsøg på at forlænge gyldigheden): stadig stop.
    const later = new Date(T0 + 48 * 3_600_000).toISOString();
    const shifted = { ...JSON.parse(orig), transcriptTimestamp: later, expiresAt: new Date(Date.parse(later) + 24 * 3_600_000).toISOString() };
    shifted.id = approvalId(shifted);
    writeFileSync(join(w.dir, `${shifted.id}.json`), JSON.stringify(shifted));
    const sr = use(w.dir, shifted.id, MERGE, w.opts(SA, { now: T0 + 30 * 3_600_000 }));
    assert.equal(sr.code, AEXIT.TAMPERED, sr.reason);
    writeFileSync(f, orig);
    assert.equal(check(w.dir, id, MERGE, w.opts(SA)).code, AEXIT.OK);
    const t = readFileSync(w.tx(SA), "utf8");
    writeFileSync(w.tx(SA), t.replace(" pr=7 ", " pr=7  "));
    assert.equal(use(w.dir, id, MERGE, w.opts(SA)).code, AEXIT.TAMPERED, "ændret brugerbesked");
    writeFileSync(w.tx(SA), "");
    assert.equal(use(w.dir, id, MERGE, w.opts(SA)).code, AEXIT.TAMPERED, "slettet brugerbesked");
  } finally { w.done(); }
});

test("udløb regnes fra beskedens tidspunkt: et gammelt GO kan hverken registreres eller bruges sent", () => {
  const w = world();
  try {
    w.typed(SA, w.go(" timer=1"));
    assert.equal(record(w.dir, { repo: REPO }, w.opts(SA, { now: T0 + 2 * 3_600_000 })).code, AEXIT.EXPIRED);
    const id = record(w.dir, { repo: REPO }, w.opts(SA)).approval.id;
    assert.equal(use(w.dir, id, MERGE, w.opts(SA, { now: T0 + 3_600_000 })).code, AEXIT.EXPIRED);
  } finally { w.done(); }
});

// Grænsen er `expiresAt <= now` ⇒ udløbet: 1 ms før accepteres, præcis på og 1 ms efter afvises — for
// standardperioden (24 t) og en kort timer=, ved registrering, kontrol og forbrug. Et afvist forbrug forbruger intet.
test("udløbsgrænsen: 1 ms før accepteres; præcis ved og 1 ms efter afvises (record, check, use)", () => {
  for (const [extra, hours] of [["", 24], [" timer=2", 2]]) {
    const E = expiryOf(hours);
    const w = world();
    try {
      w.typed(SA, w.go(extra));
      assert.equal(record(w.dir, { repo: REPO }, w.opts(SA, { now: E })).code, AEXIT.EXPIRED, `record ved udløb (${hours} t)`);
      assert.equal(record(w.dir, { repo: REPO }, w.opts(SA, { now: E + 1 })).code, AEXIT.EXPIRED, `record efter udløb (${hours} t)`);
      assert.equal(list(w.dir).length, 0, "et udløbet GO registreres ikke");
      const r = record(w.dir, { repo: REPO }, w.opts(SA, { now: E - 1 }));
      assert.equal(r.code, AEXIT.OK, `record 1 ms før udløb (${hours} t): ${r.reason}`);
      assert.equal(r.approval.expiresAt, new Date(E).toISOString(), "udløbet er beskedens tidspunkt + perioden");
      const id = r.approval.id;
      assert.equal(check(w.dir, id, MERGE, w.opts(SA, { now: E - 1 })).code, AEXIT.OK, "check 1 ms før");
      assert.equal(check(w.dir, id, MERGE, w.opts(SA, { now: E })).code, AEXIT.EXPIRED, "check ved udløb");
      assert.equal(check(w.dir, id, MERGE, w.opts(SA, { now: E + 1 })).code, AEXIT.EXPIRED, "check efter udløb");
      assert.equal(use(w.dir, id, MERGE, w.opts(SA, { now: E })).code, AEXIT.EXPIRED, "use ved udløb");
      assert.equal(use(w.dir, id, MERGE, w.opts(SA, { now: E + 1 })).code, AEXIT.EXPIRED, "use efter udløb");
      assert.equal(use(w.dir, id, MERGE, w.opts(SA, { now: E - 1 })).code, AEXIT.OK, "use 1 ms før — det afviste forsøg forbrugte intet");
      assert.equal(use(w.dir, id, MERGE, w.opts(SA, { now: E - 1 })).code, AEXIT.USED, "derefter brugt");
    } finally { w.done(); }
  }
});

// Samme grænse gennem CLI'en, som læser uret selv: med det kontrollerede ur 1 ms før udløb lykkes `record`, præcis på
// udløbet afvises den (22). Det beviser også, at CLI'en bruger det kontrollerede ur — det rigtige ur ligger forbi grænsen.
test("CLI med kontrolleret ur: record 1 ms før udløb lykkes; præcis ved og efter udløb afvises", async (t) => {
  const E = expiryOf(24);
  const run = async (now) => {
    const w = world();
    try {
      const repoDir = join(w.root, "repo");
      mkdirSync(repoDir);
      g(["init", "-q"], repoDir);
      g(["remote", "add", "origin", "https://github.com/Example/Repo.git"], repoDir);
      w.typed(SA, w.go());
      t.mock.timers.setTime(now);
      const log = [];
      const io = { env: { ...w.env, LAERLIG_APPROVALS_DIR: w.dir }, cwd: repoDir, out: (s) => log.push(s), err: (s) => log.push(s), identity: w.as(SA) };
      return { code: await main(["record"], io), log: log.join("\n") };
    } finally { w.done(); }
  };
  freezeClock(t, T0);
  const before = await run(E - 1);
  assert.equal(before.code, AEXIT.OK, before.log);
  assert.match(before.log, new RegExp(`udløber ${new Date(E).toISOString()}`));
  for (const now of [E, E + 1]) {
    const r = await run(now);
    assert.equal(r.code, AEXIT.EXPIRED, r.log);
    assert.match(r.log, new RegExp(`GO'et udløb ${new Date(E).toISOString()}`));
  }
});

test("CLI: omfang kan ikke angives af agenten, --head afvises, testvariabler ignoreres, rådgivende besked står altid", async (t) => {
  // CLI'en læser uret selv (main() tager intet `now`): frys det på T0, så testen ikke afhænger af den rigtige dato.
  freezeClock(t, T0);
  const w = world();
  try {
    const repoDir = join(w.root, "repo");
    mkdirSync(repoDir);
    g(["init", "-q"], repoDir);
    g(["remote", "add", "origin", "https://github.com/Example/Repo.git"], repoDir);
    w.typed(SA, w.go());
    const log = [];
    const io = { env: { ...w.env, LAERLIG_APPROVALS_DIR: w.dir }, cwd: repoDir, out: (s) => log.push(s), err: (s) => log.push(s), identity: w.as(SA) };
    assert.equal(await main(["record", "--action", "merge", "--pr", "8"], io), AEXIT.USAGE);
    assert.match(log.join("\n"), /omfanget læses KUN fra brugerens GO-KOMMANDO/);
    assert.equal(await main(["record"], io), AEXIT.OK, log.join("\n"));
    assert.equal(await main(["record"], io), AEXIT.ALREADY_RECORDED);
    const id = /id ([0-9a-f]{24})/.exec(log.join("\n"))[1];
    assert.equal(await main(["check", "--id", id, "--action", "merge", "--branch", "ci/x", "--pr", "7", "--head", w.head], io), AEXIT.USAGE);
    assert.equal(await main(["list"], io), AEXIT.OK);
    assert.ok(log.filter((l) => l === ADVISORY).length >= 3);
    // Uden injiceret identitet og med rigtige processer: denne testproces er ikke i en (falsk) Claude Code-session.
    const log2 = [];
    const code = await main(["record"], { ...io, identity: undefined, env: { ...io.env, CLAUDE_CODE_SESSION_ID: SA }, out: (s) => log2.push(s), err: (s) => log2.push(s) });
    assert.equal(code, AEXIT.IDENTITY, log2.join("\n"));
  } finally { w.done(); }
});
