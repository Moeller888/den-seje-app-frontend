// D-344 (F8): the measurement material — parallel forms, the rubric trial on synthetic answers, the technical
// rehearsal with synthetic pupils, and the separation of student sheets from the teacher's key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APPROVAL, CRITERIA, FORMS, TRANSFER, flags, scoreChoices, subscores } from "../../tools/laerligverse/assessment-v1.mjs";
import { STUDENT, TEACHER, check as packCheck } from "../../tools/laerligverse/assessment-pack.mjs";
import { SYNTHETIC_RESPONSES, dataFlow, rehearse, rubricTrial } from "../../tools/laerligverse/rehearsal.mjs";
import { ARCHIVE_ITEMS } from "../../laerligverse/host/dev/archive-items.js";

const words = (t) => t.trim().split(/\s+/).length;

test("the material is a proposal awaiting its OWN teacher approval, never covered by the Arkivskab approval", () => {
  assert.equal(APPROVAL.status, "afventer_laerergodkendelse");
  for (const f of [...Object.values(FORMS), TRANSFER]) assert.equal(f.source.status, "didaktisk konstrueret", f.id);
  const guide = readFileSync(TEACHER, "utf8");
  assert.match(guide, /Prøverne i denne pakke .* \| \*\*Afventer særskilt faglig godkendelse\*\*/);
  assert.match(guide, /Elevpilot \| \*\*Ikke autoriseret\*\*/);
});

test("forms A, B and C are parallel: same parts, same claim pattern, comparable length, both source kinds in part 3", () => {
  const lens = [];
  for (const f of Object.values(FORMS)) {
    assert.equal(f.part1.questions.length, 4, f.id);
    // Same claim pattern (one "ja", two "nej")…
    assert.deepEqual(f.part2.claims.map((c) => c.answer).sort(), ["ja", "nej", "nej"], f.id);
    assert.equal(f.part3.sources.length, 4, f.id);
    assert.equal(f.part3.claims.length, 2, f.id);
    // One personal and one official answer: "always the diary" gets only one right.
    assert.deepEqual(f.part3.claims.map((c) => c.sourceKind).sort(), ["officiel", "personlig"], f.id);
    assert.notEqual(f.part3.claims[0].answer, f.part3.claims[1].answer, f.id);
    // B2 always asks for the justification of the PERSONAL claim, so the reasoning task is the same kind.
    assert.equal(f.part3.claims.find((c) => c.id === f.part3.reasonFor)?.sourceKind, "personlig", f.id);
    for (const c of f.part3.claims) assert.ok(f.part3.sources.some((s) => s.label === c.answer), `${f.id}${c.id}`);
    lens.push(words(f.source.text));
    assert.ok(f.frameToCheck.length > 40, f.id);
  }
  // F9: …but NOT in the same positions. A pupil who memorises the pretest's answer order ("ja, nej, nej"; "a is the
  // diary") must gain nothing on the posttest or the delayed test.
  const p2 = Object.values(FORMS).map((f) => f.part2.claims.map((c) => c.answer).join(","));
  assert.equal(new Set(p2).size, p2.length, `part 2 answer orders repeat: ${p2}`);
  const p3 = Object.values(FORMS).map((f) => f.part3.claims.map((c) => c.sourceKind).join(","));
  assert.ok(new Set(p3).size > 1, `part 3 always has the personal source in the same position: ${p3}`);
  assert.ok(Math.max(...lens) - Math.min(...lens) <= 25, `source lengths ${lens}`);
  assert.ok(Math.max(...lens) <= 70, "keep the reading load low");
});

test("the transfer test uses NEW material: none of its sources or the forms' sources appear in the game's items", () => {
  const game = JSON.stringify(ARCHIVE_ITEMS);
  for (const t of ["Nordvask", "Magistraten", "Sundhedskommissionen", "amtmanden", "Statistik", "Reklame"]) assert.equal(game.includes(t), false, t);
  assert.notEqual(TRANSFER.source.kind, "Dagbog");
  assert.equal(TRANSFER.choice.claims.length, 2);
});

test("the student sheets contain no answer key; the teacher guide has every key; the pack is not stale", () => {
  assert.deepEqual(packCheck(), []);
  const sheet = readFileSync(STUDENT, "utf8");
  assert.equal(/\*\*(ja|nej)\*\*|Facit:|\(rigtigt\)|Hvorfor \|/.test(sheet), false);
  for (const f of Object.values(FORMS)) for (const c of [...f.part2.claims, ...f.part3.claims]) assert.equal(sheet.includes(c.why), false, c.why);
  const guide = readFileSync(TEACHER, "utf8");
  for (const f of Object.values(FORMS)) for (const c of f.part3.claims) assert.ok(guide.includes(`**${c.answer}**`), c.answer);
  assert.ok(guide.includes("Læg dem ikke sammen til én score"));
});

test("subscores never become one total or a mastery verdict, and a bad level fails loud", () => {
  const s = subscores("A", { part2: ["ja", "nej", "nej"], part3: { a: "Dagbog", b: "Skolereglement" } }, { R1: 1, R2: 1, R3: 2, R4: 2, B1: 2, B2: 2 });
  assert.deepEqual(Object.keys(s).sort(), ["begrundelse", "identifikation", "part3BothRight", "valg"]);
  assert.equal(JSON.stringify(s).includes("mestr"), false);
  assert.throws(() => subscores("A", {}, { R1: 1, R2: 1, R3: 3, R4: 0, B1: 0, B2: 0 }), /R3: level 3/);
  assert.throws(() => scoreChoices("Z", {}), /unknown form/);
  assert.equal(scoreChoices("A", null).V, 0);
  const max = Object.values(CRITERIA).reduce((n, c) => n + c.max, 0);
  assert.equal(max, 15);
});

test("rubric trial on synthetic answers: the rubric separates the seven kinds — and flags what it cannot decide", () => {
  const rows = Object.fromEntries(rubricTrial().map((r) => [r.kind, r]));
  for (const r of Object.values(rows)) assert.equal(r.syntetisk, true);
  const good = rows["korrekt og velbegrundet"], bare = rows["korrekt uden begrundelse"], guess = rows["korrekt ved sandsynligt gæt"];
  // The same choices: only reasoning and identification tell them apart.
  assert.equal(good.valg, bare.valg);
  assert.equal(bare.valg, guess.valg);
  assert.ok(good.begrundelse > bare.begrundelse);
  assert.ok(bare.identifikation > guess.identifikation);
  assert.ok(bare.flags.some((f) => /uden begrundelse/.test(f)));
  assert.ok(guess.flags.some((f) => /uden begrundelse/.test(f)));
  assert.deepEqual(good.flags, []);
  assert.ok(rows["forkert, men med relevant ræsonnement"].flags.some((f) => /begrunder fagligt, men vælger forkert/.test(f)));
  assert.ok(rows["delvist korrekt"].flags.some((f) => /emne, ikke afsenderens hensigt/.test(f)));
  assert.ok(rows["forveksling af modtager og formål"].flags.some((f) => /byttet om/.test(f)));
  assert.ok(rows["misforstået afsender"].identifikation <= 1);
  // Every ambiguity found while scoring is written down.
  assert.ok(SYNTHETIC_RESPONSES.filter((r) => r.note).length >= 5);
  assert.equal(flags({ valg: 5, begrundelse: 4, part3BothRight: true, identifikation: 6 }, { R3: 2, R4: 2 }).length, 0);
});

test("rehearsal: three synthetic pupils through the REAL sequence function (test policy v0, LP-13 undecided)", () => {
  const a = rehearse("A"), b = rehearse("B"), c = rehearse("C");
  assert.deepEqual(a.stepsServed, ["guided_practice", "revision", "independent_application", "transfer", "revisit"]);
  // The strong pupil is not sent through revision; everyone must still show independent application and transfer.
  assert.deepEqual(c.stepsServed, ["guided_practice", "independent_application", "transfer", "revisit"]);
  assert.deepEqual(b.stepsServed, c.stepsServed);
  for (const r of [a, b, c]) {
    assert.equal(r.syntetisk, true);
    assert.equal(r.policy, "laerligverse-test-policy-v0");
    assert.ok(r.log.some((l) => l.event === "forløbet gennemført"));
    // Simulated time is marked, and the delayed test is blocked — never retention.
    assert.ok(r.log.some((l) => l.tid === "SIMULERET"));
    assert.match(r.paper.delayed.status, /BLOKERET.*reel tid/);
    assert.match(r.paper.change.note, /Ikke en læringseffekt/);
    for (const l of r.log.filter((x) => x.event === "svar")) {
      assert.match(l.recorded.hints, /klient/);
      assert.match(l.recorded.reason, /registreres ikke/);
      assert.match(l.recorded.right, /isolerede teststak/);
    }
  }
  // Ceiling: the strong pupil can show no gain on the paper tests.
  assert.deepEqual([c.paper.change.identifikation, c.paper.change.valg, c.paper.change.begrundelse], [0, 0, 0]);
  assert.ok(a.log.filter((l) => l.event === "svar").some((l) => l.hintsOpened > 0));
});

test("data flow: what a pilot could answer today is stated explicitly, including what is missing", () => {
  const rows = Object.fromEntries(dataFlow().map((r) => [r.q, r]));
  assert.equal(rows["Hvilken hjælp blev vist?"].answer, "nej");
  assert.equal(rows["Hvilke forsøg var selvstændige?"].answer, "nej");
  assert.equal(rows["Fastholdelse?"].answer, "nej i generalprøven");
  assert.match(rows["Hvilke besvarelser blev registreret?"].note, /K1\/H5/);
  assert.equal(rows["Kan vi dokumentere transfer?"].answer, "nær transfer");
});
