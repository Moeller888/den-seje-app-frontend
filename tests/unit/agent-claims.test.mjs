// tools/agents/claim.mjs — én skrivende session pr. branch (docs/operations/agent-coordination.md).
// Alt kører i midlertidige mapper og midlertidige git-repos; intet rører den rigtige klon eller GitHub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  EXIT, claim, check, heartbeat, release, list, claimFile, describe, pushCheck, findDuplicates, similarity, main, handover, ageHours,
} from "../../tools/agents/claim.mjs";

const T0 = Date.parse("2026-11-13T08:00:00Z");
const H = 3_600_000;
const tmp = () => mkdtempSync(join(tmpdir(), "laerlig-claims-"));
const sh = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

test("claim opretter låsen; en anden session afvises — også når låsen er forældet", () => {
  const dir = tmp();
  try {
    const a = claim(dir, { branch: "ci/x", session: "A", task: "T-1", purpose: "p" }, { now: T0 });
    assert.equal(a.code, EXIT.OK);
    assert.equal(a.created, true);
    const b = claim(dir, { branch: "ci/x", session: "B", task: "T-2", purpose: "q" }, { now: T0 + 1 * H });
    assert.equal(b.code, EXIT.OWNED_BY_OTHER);
    assert.equal(b.claim.session, "A");
    // 1000 timer senere: stadig A's. Alder giver kun en markering, aldrig overtagelse.
    const c = claim(dir, { branch: "ci/x", session: "B", task: "T-2", purpose: "q" }, { now: T0 + 1000 * H });
    assert.equal(c.code, EXIT.OWNED_BY_OTHER);
    assert.match(describe(c.claim, { now: T0 + 1000 * H }), /FORÆLDET .*overtages ikke automatisk/);
    assert.equal(JSON.parse(readFileSync(claimFile(dir, "ci/x"), "utf8")).session, "A");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("samme session fornyer sin lås uden at ændre createdAt; check skelner din/andens/ingen", () => {
  const dir = tmp();
  try {
    claim(dir, { branch: "feat/y", session: "A", task: "T", purpose: "p" }, { now: T0 });
    const again = claim(dir, { branch: "feat/y", session: "A", task: "T", purpose: "p", pr: "701" }, { now: T0 + 2 * H });
    assert.equal(again.code, EXIT.OK);
    assert.equal(again.created, false);
    assert.equal(again.claim.createdAt, new Date(T0).toISOString());
    assert.equal(again.claim.lastActivity, new Date(T0 + 2 * H).toISOString());
    assert.equal(again.claim.pr, "701");
    assert.equal(check(dir, { branch: "feat/y", session: "A" }).code, EXIT.OK);
    assert.equal(check(dir, { branch: "feat/y", session: "B" }).code, EXIT.OWNED_BY_OTHER);
    assert.equal(check(dir, { branch: "feat/z", session: "A" }).code, EXIT.UNCLAIMED);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("heartbeat og release virker kun for ejeren", () => {
  const dir = tmp();
  try {
    claim(dir, { branch: "b", session: "A", task: "T", purpose: "p" }, { now: T0 });
    assert.equal(heartbeat(dir, { branch: "b", session: "B" }, { now: T0 + H }).code, EXIT.OWNED_BY_OTHER);
    const hb = heartbeat(dir, { branch: "b", session: "A", next: "kør CI" }, { now: T0 + 5 * H });
    assert.equal(hb.code, EXIT.OK);
    assert.equal(hb.claim.next, "kør CI");
    assert.equal(ageHours(hb.claim, T0 + 6 * H), 1);
    assert.equal(release(dir, { branch: "b", session: "B" }).code, EXIT.OWNED_BY_OTHER);
    assert.ok(existsSync(claimFile(dir, "b")));
    assert.equal(release(dir, { branch: "b", session: "A" }).code, EXIT.OK);
    assert.equal(existsSync(claimFile(dir, "b")), false);
    assert.equal(release(dir, { branch: "b", session: "A" }).code, EXIT.UNCLAIMED);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("branchnavne kan ikke pege uden for låsemappen; en ødelagt låsefil overskrives ikke", () => {
  const dir = tmp();
  try {
    for (const bad of ["../x", "a/../../b", "a b", "", "a;rm"]) {
      assert.throws(() => claim(dir, { branch: bad, session: "A" }), /ugyldigt branchnavn/);
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(claimFile(dir, "c"), "{}", "utf8");
    assert.throws(() => claim(dir, { branch: "c", session: "A", task: "T", purpose: "p" }), /ødelagt låsefil/);
    assert.equal(readFileSync(claimFile(dir, "c"), "utf8"), "{}");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("list viser alle låse", () => {
  const dir = tmp();
  try {
    assert.deepEqual(list(join(dir, "findes-ikke")), []);
    claim(dir, { branch: "a/1", session: "A", task: "T", purpose: "p" }, { now: T0 });
    claim(dir, { branch: "b/2", session: "B", task: "U", purpose: "q" }, { now: T0 });
    assert.deepEqual(list(dir).map((c) => `${c.branch}:${c.session}`), ["a/1:A", "b/2:B"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("pushCheck: ny branch og fast-forward er ok; flyttet remote stopper — med et rigtigt git-remote", () => {
  const root = tmp();
  try {
    const bare = join(root, "remote.git");
    const a = join(root, "a");
    const b = join(root, "b");
    sh(["init", "-q", "--bare", bare], root);
    sh(["clone", "-q", bare, a], root);
    const commit = (cwd, msg) => { writeFileSync(join(cwd, "f.txt"), msg); sh(["add", "f.txt"], cwd); sh(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", msg], cwd); };
    commit(a, "1");
    sh(["branch", "-M", "work"], a);
    assert.equal(pushCheck({ cwd: a, branch: "work" }).code, EXIT.OK, "ny branch");
    sh(["push", "-q", "origin", "work"], a);
    commit(a, "2");
    const ff = pushCheck({ cwd: a, branch: "work" });
    assert.equal(ff.code, EXIT.OK);
    assert.equal(ff.reason, "fast-forward");
    // En anden klon pusher imens: remote er ikke længere indeholdt i a's HEAD.
    sh(["clone", "-q", "-b", "work", bare, b], root);
    commit(b, "fremmed");
    sh(["push", "-q", "origin", "work"], b);
    const moved = pushCheck({ cwd: a, branch: "work" });
    assert.equal(moved.code, EXIT.REMOTE_MOVED);
    assert.match(moved.reason, /ingen force/);
    // --expect fanger det også, selv før merge-base-tjekket.
    const exp = pushCheck({ cwd: b, branch: "work", expect: "0".repeat(40) });
    assert.equal(exp.code, EXIT.REMOTE_MOVED);
  } finally { rmSync(root, { recursive: true, force: true }); }
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
  const env = { LAERLIG_CLAIMS_DIR: dir };
  const log = [];
  const io = { env, cwd: dir, out: (s) => log.push(s), err: (s) => log.push(s) };
  try {
    assert.equal(await main(["check", "--branch", "x", "--session", "A"], io), EXIT.UNCLAIMED);
    assert.equal(await main(["claim", "--branch", "x", "--session", "A"], io), EXIT.USAGE, "task og purpose er krævet");
    assert.equal(await main(["claim", "--branch", "x", "--session", "A", "--task", "T", "--purpose", "p"], io), EXIT.OK);
    assert.equal(await main(["claim", "--branch", "x", "--session", "B", "--task", "T", "--purpose", "p"], io), EXIT.OWNED_BY_OTHER);
    assert.equal(await main(["push-check", "--branch", "x", "--session", "B"], io), EXIT.OWNED_BY_OTHER, "push-check kræver ejerskab før noget andet");
    const prsFile = join(dir, "prs.json");
    writeFileSync(prsFile, JSON.stringify([{ number: 1, title: "Agent ejerskab og låse", headRefName: "ops/agent-claims" }]));
    assert.equal(await main(["dupes", "--title", "ejerskab låse for agenter", "--prs-json", prsFile], io), EXIT.DUPLICATE);
    assert.equal(await main(["dupes", "--title", "dansk oplæsning", "--prs-json", prsFile], io), EXIT.OK);
    assert.equal(await main(["nonsens"], io), EXIT.USAGE);
    assert.ok(log.some((l) => /STOP — x: ejet af session A/.test(l)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("handover henter fakta fra git og efterlader kun de felter, et menneske eller en agent skal udfylde", () => {
  const facts = { "rev-parse HEAD": "h".repeat(40), "merge-base HEAD origin/main": "b".repeat(40), [`diff --name-status ${"b".repeat(40)}..HEAD`]: "M\ttools/x.mjs", "status --porcelain": "" };
  const run = (args) => { const k = args.join(" "); if (k.startsWith("ls-remote")) return `${"r".repeat(40)}\trefs/heads/x`; return facts[k]; };
  const md = handover({ cwd: "/w", branch: "x", claimInfo: null, run });
  assert.match(md, /Sidste verificerede SHA \(lokal HEAD\):\*\* h{40}/);
  assert.match(md, /Remote-HEAD:\*\* r{40}/);
  assert.match(md, /M\ttools\/x\.mjs/);
  assert.match(md, /Arbejdstræ:\*\* rent/);
  for (const f of ["Tests", "Åbne fejl", "Risici", "Næste sikre handling", "Godkendelsesstatus"]) assert.match(md, new RegExp(f));
});
