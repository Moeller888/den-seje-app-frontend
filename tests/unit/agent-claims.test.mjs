// tools/agents/claim.mjs — én skrivende session pr. branch (docs/operations/agent-coordination.md).
// Alt kører i midlertidige mapper og midlertidige git-repos; intet rører den rigtige klon eller GitHub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  EXIT, ABSENT, claim, check, heartbeat, release, list, claimFile, describe, verify, pushCheck, afterPush, parsePorcelain,
  findDuplicates, similarity, main, handover, ageHours, readClaim, BrokenClaimError, update,
} from "../../tools/agents/claim.mjs";

const MODULE = new URL("../../tools/agents/claim.mjs", import.meta.url).href;
const T0 = Date.parse("2026-11-13T08:00:00Z");
const H = 3_600_000;
const tmp = () => mkdtempSync(join(tmpdir(), "laerlig-claims-"));
const sh = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const commit = (cwd, msg) => {
  writeFileSync(join(cwd, "f.txt"), msg);
  sh(["add", "f.txt"], cwd);
  sh(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", msg], cwd);
};
// Et bart "remote", agentens klon `a` på branchen `work`, og en fremmed klon `b`.
function repos() {
  const root = tmp();
  const bare = join(root, "remote.git"), a = join(root, "a"), b = join(root, "b"), dir = join(root, "claims");
  sh(["init", "-q", "--bare", bare], root);
  sh(["clone", "-q", bare, a], root);
  commit(a, "1");
  sh(["branch", "-M", "work"], a);
  return { root, bare, a, b, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}
const own = (dir, branch = "work", session = "A") => claim(dir, { branch, session, task: "T", purpose: "p" }, { now: T0 });

test("en anden session afvises — også når låsen er forældet; alder giver kun en markering", () => {
  const dir = tmp();
  try {
    assert.equal(own(dir, "ci/x").created, true);
    assert.equal(claim(dir, { branch: "ci/x", session: "B", task: "T", purpose: "q" }, { now: T0 + H }).code, EXIT.OWNED_BY_OTHER);
    const late = claim(dir, { branch: "ci/x", session: "B", task: "T", purpose: "q" }, { now: T0 + 1000 * H });
    assert.equal(late.code, EXIT.OWNED_BY_OTHER, "stale lock: ingen automatisk overtagelse");
    assert.match(describe(late.claim, { now: T0 + 1000 * H }), /FORÆLDET .*overtages ikke automatisk/);
    assert.doesNotMatch(describe(late.claim, { now: T0 + 2 * H }), /FORÆLDET/);
    assert.equal(heartbeat(dir, { branch: "ci/x", session: "B" }).code, EXIT.OWNED_BY_OTHER);
    assert.equal(release(dir, { branch: "ci/x", session: "B" }).code, EXIT.OWNED_BY_OTHER);
    assert.equal(readClaim(dir, "ci/x").session, "A");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("samme session fornyer uden at ændre createdAt; check skelner din/andens/ingen; release kun for ejeren", () => {
  const dir = tmp();
  try {
    own(dir, "feat/y");
    const again = claim(dir, { branch: "feat/y", session: "A", task: "T", purpose: "p", pr: "701" }, { now: T0 + 2 * H });
    assert.equal(again.created, false);
    assert.equal(again.claim.createdAt, new Date(T0).toISOString());
    assert.equal(again.claim.pr, "701");
    assert.equal(check(dir, { branch: "feat/y", session: "A" }).code, EXIT.OK);
    assert.equal(check(dir, { branch: "feat/y", session: "B" }).code, EXIT.OWNED_BY_OTHER);
    assert.equal(check(dir, { branch: "feat/z", session: "A" }).code, EXIT.UNCLAIMED);
    const hb = heartbeat(dir, { branch: "feat/y", session: "A", next: "kør CI" }, { now: T0 + 5 * H });
    assert.equal(hb.claim.next, "kør CI");
    assert.equal(ageHours(hb.claim, T0 + 6 * H), 1);
    assert.equal(release(dir, { branch: "feat/y", session: "A" }).code, EXIT.OK);
    assert.equal(existsSync(claimFile(dir, "feat/y")), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("20 samtidige processer om samme lås: præcis én vinder, ingen tom eller halv låsefil, ingen .tmp tilbage", async () => {
  const dir = tmp();
  try {
    const one = (i) => new Promise((res) => {
      const p = spawn(process.execPath, ["--input-type=module", "-e",
        `const m = await import(${JSON.stringify(MODULE)}); process.stdout.write(String(m.claim(${JSON.stringify(dir)}, { branch: "x", session: "S${i}", task: "T", purpose: "p" }).code));`]);
      let o = ""; p.stdout.on("data", (c) => { o += c; }); p.on("close", () => res(o));
    });
    const codes = await Promise.all(Array.from({ length: 20 }, (_, i) => one(i)));
    assert.equal(codes.filter((c) => c === String(EXIT.OK)).length, 1, codes.join(","));
    assert.equal(codes.filter((c) => c === String(EXIT.OWNED_BY_OTHER)).length, 19, codes.join(","));
    const winner = readClaim(dir, "x");
    assert.match(winner.session, /^S\d+$/);
    assert.deepEqual(readdirSync(dir), ["x.json"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ødelagt eller tom låsefil: check fejler lukket (BROKEN), list viser ØDELAGT og fortsætter, intet overskrives", async () => {
  const dir = tmp();
  try {
    own(dir, "ok");
    mkdirSync(dir, { recursive: true });
    writeFileSync(claimFile(dir, "tom"), "", "utf8");
    writeFileSync(claimFile(dir, "skrald"), "{ikke json", "utf8");
    writeFileSync(claimFile(dir, "halv"), "{}", "utf8");
    for (const b of ["tom", "skrald", "halv"]) {
      assert.throws(() => check(dir, { branch: b, session: "A" }), BrokenClaimError, b);
      assert.throws(() => claim(dir, { branch: b, session: "A", task: "T", purpose: "p" }), BrokenClaimError, b);
    }
    assert.equal(readFileSync(claimFile(dir, "tom"), "utf8"), "");
    const all = list(dir);
    assert.deepEqual(all.filter((c) => !c.broken).map((c) => c.branch), ["ok"]);
    assert.equal(all.filter((c) => c.broken).length, 3);
    assert.match(describe(all.find((c) => c.broken && c.file.endsWith("tom.json"))), /ØDELAGT .*tom fil/);
    const log = [];
    const io = { env: { LAERLIG_CLAIMS_DIR: dir }, cwd: dir, out: (s) => log.push(s), err: (s) => log.push(s) };
    assert.equal(await main(["check", "--branch", "tom", "--session", "A"], io), EXIT.BROKEN);
    assert.equal(await main(["list"], io), EXIT.BROKEN, "list rapporterer, men viser stadig de gyldige");
    assert.ok(log.some((l) => /^ok: ejet af session A/.test(l)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("opdatering genlæser låsen før skrivning: skiftede ejeren imens, skrives intet (heartbeat/verify/after-push)", () => {
  const dir = tmp();
  try {
    own(dir, "z");
    const seenByA = readClaim(dir, "z");          // A har læst sin lås …
    rmSync(claimFile(dir, "z"));                  // … et menneske sletter den efter afklaring …
    claim(dir, { branch: "z", session: "B", task: "T", purpose: "p" }, { now: T0 + H }); // … og B tager den
    const r = update(dir, claimFile(dir, "z"), seenByA, { next: "A's skrivning" }, T0 + 2 * H);
    assert.equal(r.code, EXIT.OWNED_BY_OTHER);
    assert.equal(readClaim(dir, "z").session, "B");
    assert.equal(readClaim(dir, "z").next, undefined);
    rmSync(claimFile(dir, "z"));
    assert.equal(update(dir, claimFile(dir, "z"), seenByA, {}, T0 + 3 * H).code, EXIT.UNCLAIMED, "slettet imens: genopret ikke");
    assert.equal(existsSync(claimFile(dir, "z")), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("branchnavne kan ikke pege uden for låsemappen", () => {
  const dir = tmp();
  try {
    for (const bad of ["../x", "a/../../b", "a b", "", "a;rm"]) {
      assert.throws(() => claim(dir, { branch: bad, session: "A" }), /ugyldigt branchnavn/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("push-check: uden verificeret remote-SHA → NOT_VERIFIED; ny branch verificeret fraværende → ok", () => {
  const r = repos();
  try {
    own(r.dir);
    assert.equal(pushCheck(r.dir, { cwd: r.a, branch: "work", session: "A" }).code, EXIT.NOT_VERIFIED);
    assert.equal(verify(r.dir, { cwd: r.a, branch: "work", session: "A" }).claim.verifiedRemote, ABSENT);
    assert.equal(pushCheck(r.dir, { cwd: r.a, branch: "work", session: "A" }).code, EXIT.OK);
    assert.equal(pushCheck(r.dir, { cwd: r.a, branch: "work", session: "B" }).code, EXIT.OWNED_BY_OTHER);
    // En anden opretter branchen, efter at A verificerede den som fraværende.
    sh(["clone", "-q", r.bare, r.b], r.root);
    commit(r.b, "fremmed");
    sh(["push", "-q", "origin", "HEAD:refs/heads/work"], r.b);
    assert.equal(pushCheck(r.dir, { cwd: r.a, branch: "work", session: "A" }).code, EXIT.REMOTE_MOVED);
  } finally { r.done(); }
});

test("push-check: force-push (tilbagerulning) på remote opdages, selvom den gamle remote er en forfader af HEAD", () => {
  const r = repos();
  try {
    commit(r.a, "2");
    sh(["push", "-q", "origin", "work"], r.a);
    own(r.dir);
    verify(r.dir, { cwd: r.a, branch: "work", session: "A" });
    sh(["clone", "-q", "-b", "work", r.bare, r.b], r.root);
    sh(["reset", "-q", "--hard", "HEAD~1"], r.b);
    sh(["push", "-q", "-f", "origin", "work"], r.b); // en anden rullede tilbage
    commit(r.a, "3");
    const res = pushCheck(r.dir, { cwd: r.a, branch: "work", session: "A" });
    assert.equal(res.code, EXIT.REMOTE_MOVED, res.reason);
    assert.match(res.reason, /verificeret var .*ingen force/);
  } finally { r.done(); }
});

test("push-check: en fremmed commit, som agenten har trukket ind lokalt (pull), omgår ikke kontrollen", () => {
  const r = repos();
  try {
    sh(["push", "-q", "origin", "work"], r.a);
    own(r.dir);
    verify(r.dir, { cwd: r.a, branch: "work", session: "A" });
    sh(["clone", "-q", "-b", "work", r.bare, r.b], r.root);
    commit(r.b, "fremmed");
    sh(["push", "-q", "origin", "work"], r.b);
    sh(["-c", "user.email=t@t", "-c", "user.name=t", "pull", "-q", "--no-rebase", "origin", "work"], r.a);
    commit(r.a, "mit");
    assert.equal(pushCheck(r.dir, { cwd: r.a, branch: "work", session: "A" }).code, EXIT.REMOTE_MOVED, "remote-HEAD ≠ verificeret");
    // Først efter en BEVIDST ny verificering (agenten har gennemgået den fremmede commit) må den pushe.
    verify(r.dir, { cwd: r.a, branch: "work", session: "A" });
    assert.equal(pushCheck(r.dir, { cwd: r.a, branch: "work", session: "A" }).code, EXIT.OK);
  } finally { r.done(); }
});

test("push-check: verificeret remote, der ikke er i HEAD, stopper (en almindelig push ville blive afvist)", () => {
  const r = repos();
  try {
    sh(["push", "-q", "origin", "work"], r.a);
    sh(["clone", "-q", "-b", "work", r.bare, r.b], r.root);
    commit(r.b, "fremmed");
    sh(["push", "-q", "origin", "work"], r.b);
    own(r.dir);
    verify(r.dir, { cwd: r.a, branch: "work", session: "A" }); // verificerer remote uden at integrere den
    commit(r.a, "mit");
    assert.equal(pushCheck(r.dir, { cwd: r.a, branch: "work", session: "A" }).code, EXIT.REMOTE_MOVED);
  } finally { r.done(); }
});

test("after-push: rigtig git push --porcelain bekræftes; serverens gamle værdi ≠ verificeret giver ALARM", () => {
  const r = repos();
  try {
    sh(["push", "-q", "origin", "work"], r.a);
    own(r.dir);
    verify(r.dir, { cwd: r.a, branch: "work", session: "A" });
    commit(r.a, "2");
    assert.equal(pushCheck(r.dir, { cwd: r.a, branch: "work", session: "A" }).code, EXIT.OK);
    const out = sh(["push", "--porcelain", "origin", "HEAD:refs/heads/work"], r.a);
    const ok = afterPush(r.dir, { cwd: r.a, branch: "work", session: "A", porcelain: out });
    assert.equal(ok.code, EXIT.OK, ok.reason);
    assert.equal(readClaim(r.dir, "work").verifiedRemote, sh(["rev-parse", "HEAD"], r.a));
    // Kapløb: en anden rullede tilbage MELLEM push-check og push. Serveren accepterede (fast-forward fra den
    // tilbagerullede commit), men den gamle værdi i outputtet afslører det.
    const fake = `To ${r.bare}\n \trefs/heads/work:refs/heads/work\t${"1".repeat(7)}..${sh(["rev-parse", "--short", "HEAD"], r.a)}\nDone`;
    const alarm = afterPush(r.dir, { cwd: r.a, branch: "work", session: "A", porcelain: fake });
    assert.equal(alarm.code, EXIT.PUSH_ALERT);
    assert.match(alarm.reason, /ALARM/);
    assert.equal(afterPush(r.dir, { cwd: r.a, branch: "work", session: "A", porcelain: `+\trefs/heads/work:refs/heads/work\t1a2b3c4...5d6e7f8 (forced update)` }).code, EXIT.PUSH_ALERT);
    // En forced opdatering er en ALARM, også når den gamle værdi stemmer med den verificerede SHA.
    const verifiedShort = readClaim(r.dir, "work").verifiedRemote.slice(0, 7);
    assert.equal(afterPush(r.dir, { cwd: r.a, branch: "work", session: "A", porcelain: `+\trefs/heads/work:refs/heads/work\t${verifiedShort}...5d6e7f8 (forced update)` }).code, EXIT.PUSH_ALERT);
    assert.equal(afterPush(r.dir, { cwd: r.a, branch: "work", session: "A", porcelain: `!\trefs/heads/work:refs/heads/work\t[rejected] (fetch first)` }).code, EXIT.REMOTE_MOVED);
    assert.equal(afterPush(r.dir, { cwd: r.a, branch: "work", session: "A", porcelain: "noget andet" }).code, EXIT.USAGE);
  } finally { r.done(); }
});

test("parsePorcelain læser git's porcelain-format", () => {
  assert.deepEqual(parsePorcelain("*\trefs/heads/x:refs/heads/x\t[new branch]", "x"), { old: ABSENT });
  assert.deepEqual(parsePorcelain(" \tHEAD:refs/heads/x\t6a03d46..bf23a3e", "x"), { old: "6a03d46", forced: false });
  assert.deepEqual(parsePorcelain("=\trefs/heads/x:refs/heads/x\t[up to date]", "x"), { old: "up-to-date" });
  assert.equal(parsePorcelain(" \tHEAD:refs/heads/y\t1..2", "x"), null);
});

test("findDuplicates: samme branch eller ens formål flagges; ulige formål gør ikke", () => {
  const prs = [
    { number: 696, title: "ci: lås de tre resterende browserjobs til ubuntu-24.04", headRefName: "ci/pin-browser-jobs-ubuntu-2404" },
    { number: 689, title: "review-answer: autoritativ lærerbedømmelse med sporbare posteringer", headRefName: "fix/review-answer-single-payout" },
  ];
  assert.deepEqual(findDuplicates(prs, { title: "Lås browserjobs til ubuntu 24.04", branch: "ci/browser-ubuntu-2404" }).map((p) => p.number), [696]);
  assert.deepEqual(findDuplicates(prs, { title: "noget helt andet", branch: "fix/review-answer-single-payout" }).map((p) => p.number), [689]);
  assert.deepEqual(findDuplicates(prs, { title: "Spillepauser hvert 10. minut", branch: "feat/minigame" }), []);
  assert.equal(similarity("", "x y z"), 0);
});

test("CLI: exitkoderne er kontrakten, som agenter stopper på", async () => {
  const dir = tmp();
  const log = [];
  const io = { env: { LAERLIG_CLAIMS_DIR: dir }, cwd: dir, out: (s) => log.push(s), err: (s) => log.push(s) };
  try {
    assert.equal(await main(["check", "--branch", "x", "--session", "A"], io), EXIT.UNCLAIMED);
    assert.equal(await main(["claim", "--branch", "x", "--session", "A"], io), EXIT.USAGE, "task og purpose er krævet");
    assert.equal(await main(["claim", "--branch", "x", "--session", "A", "--task", "T", "--purpose", "p"], io), EXIT.OK);
    assert.equal(await main(["claim", "--branch", "x", "--session", "B", "--task", "T", "--purpose", "p"], io), EXIT.OWNED_BY_OTHER);
    assert.equal(await main(["push-check", "--branch", "x", "--session", "B"], io), EXIT.OWNED_BY_OTHER, "ejerskab før alt andet");
    assert.equal(await main(["push-check", "--branch", "x", "--session", "A"], io), EXIT.NOT_VERIFIED);
    const prsFile = join(dir, "prs.json");
    writeFileSync(prsFile, JSON.stringify([{ number: 1, title: "Agent ejerskab og låse", headRefName: "ops/agent-claims" }]));
    assert.equal(await main(["dupes", "--title", "ejerskab låse for agenter", "--prs-json", prsFile], io), EXIT.DUPLICATE);
    assert.equal(await main(["dupes", "--title", "dansk oplæsning", "--prs-json", prsFile], io), EXIT.OK);
    assert.equal(await main(["nonsens"], io), EXIT.USAGE);
    assert.ok(log.some((l) => /STOP — x: ejet af session A/.test(l)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("værktøjet indeholder ingen skrivende git-kommando (push/merge/reset/…): de skal stå i agentens egen kommando, synlige for LÆRLIG-GUARD", () => {
  const src = readFileSync(new URL("../../tools/agents/claim.mjs", import.meta.url), "utf8");
  const gitCalls = [...src.matchAll(/run\(\["([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(gitCalls)].sort(), ["config", "diff", "ls-remote", "merge-base", "rev-parse", "status"]);
  // `config` kun som læsning af origin-URL'en (repo-nøglen til den fælles låsemappe).
  const configCalls = [...src.matchAll(/run\(\["config", ([^\]]*)\]/g)].map((m) => m[1]);
  assert.ok(configCalls.length >= 1 && configCalls.every((a) => a === '"--get", "remote.origin.url"'), configCalls.join(" | "));
  assert.doesNotMatch(src, /execFileSync\("git", \[\s*"(push|merge|reset|checkout|branch|commit|rebase|stash|clean)/);
});

test("handover henter fakta fra git og efterlader kun de felter, et menneske eller en agent skal udfylde", () => {
  const facts = { "rev-parse HEAD": "h".repeat(40), "merge-base HEAD origin/main": "b".repeat(40), [`diff --name-status ${"b".repeat(40)}..HEAD`]: "M\ttools/x.mjs", "status --porcelain": "" };
  const run = (args) => { const k = args.join(" "); if (k.startsWith("ls-remote")) return `${"r".repeat(40)}\trefs/heads/x`; return facts[k]; };
  const md = handover({ cwd: "/w", branch: "x", claimInfo: null, run });
  assert.match(md, /Sidste verificerede SHA \(lokal HEAD\):\*\* h{40}/);
  assert.match(md, /Remote-HEAD:\*\* r{40}/);
  assert.match(md, /Arbejdstræ:\*\* rent/);
  for (const f of ["Tests", "Åbne fejl", "Risici", "Næste sikre handling", "Godkendelsesstatus"]) assert.match(md, new RegExp(f));
});
