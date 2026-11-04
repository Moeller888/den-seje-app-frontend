import { describe, expect, it } from "vitest";
import { assessObjectives, evidenceEligibility, observationFromAttemptRow, REVISIT_MIN_HOURS, type AttemptObservation, type Observation } from "../src/evidence.ts";
import { FakeTaskService } from "../src/test-service.ts";
import { ITEMS } from "./harness.ts";

/** D-330: the evidence chain is a pure classification. These tests pin what may and may NOT be concluded. */

const T0 = "2026-11-03T08:00:00.000Z";
const later = (h: number): string => new Date(Date.parse(T0) + h * 3_600_000).toISOString();

function attempt(over: Partial<AttemptObservation> = {}): AttemptObservation {
  return {
    kind: "attempt", source: "server", objective: "world_war_2", at: T0, instanceId: "i-1", roundNo: 1, submissionId: "s-1",
    grading: "auto", wasCorrect: true, isRepeat: false, mode: null, hintsUsed: null, situation: null, evidenceValid: null, ...over,
  };
}

describe("evidence chain — a correct answer is NOT documented learning", () => {
  it("ten correct server answers (today's server: no mode, no hints): practised; independent UNKNOWN; no evidence; never progression", () => {
    const obs = Array.from({ length: 10 }, (_, i) => attempt({ instanceId: `i-${i}`, submissionId: `s-${i}`, at: later(i * 30) }));
    const [a] = assessObjectives(obs);
    expect(a?.states.practised.status).toBe("observed");
    expect(a?.states.independent.status).toBe("unknown");
    expect(a?.states.independent.why.join(" ")).toMatch(/IKKE det samme som selvstændig/);
    expect(a?.states.supported.status).toBe("unknown");
    expect(a?.states.applied.status).toBe("unknown");
    expect(a?.states.revisited.status).toBe("unknown");
    expect(a?.states.documentedProgression.status).toBe("not_observed");
    expect(a?.documentedProgression).toBe(false);
    expect(a?.evidence.every((e) => !e.eligible)).toBe(true);
    expect(a?.evidence[0]?.reasons.join(" | ")).toMatch(/mode.*ikke registreret.*K1/);
    // There is simply no "mastered" anywhere in the result.
    expect(JSON.stringify(a)).not.toMatch(/master|mestret/i);
  });

  it("a local intro is not a registered introduction, and a local attempt is never server evidence", () => {
    const obs: Observation[] = [
      { kind: "exposure", source: "local", objective: "world_war_2", at: T0 },
      attempt({ source: "local", mode: "check", hintsUsed: 0, evidenceValid: true }),
    ];
    const [a] = assessObjectives(obs);
    expect(a?.states.introduced.status).toBe("unknown");
    expect(a?.evidence[0]?.eligible).toBe(false);
    expect(a?.evidence[0]?.reasons).toContain("kilden er local, ikke serveren");
  });
});

describe("evidence chain — the rules when mode and hints ARE registered (test adapter today; L1 K1 later)", () => {
  it("supported vs independent: help makes it supported; an assessment mode with zero help makes it independent", () => {
    const [a] = assessObjectives([
      attempt({ source: "testadapter", submissionId: "help", mode: "practice", hintsUsed: 2, situation: "claim-1" }),
      attempt({ source: "testadapter", submissionId: "alone", mode: "check", hintsUsed: 0, situation: "claim-1", at: later(1) }),
    ]);
    expect(a?.states.supported).toMatchObject({ status: "observed", basis: ["help"] });
    expect(a?.states.independent).toMatchObject({ status: "observed", basis: ["alone"] });
    // Same situation as the practice: independent, but not APPLIED in a new situation.
    expect(a?.states.applied.status).toBe("not_observed");
  });

  it("applied = independent in a situation that was never practised; a wrong answer never counts", () => {
    const [a] = assessObjectives([
      attempt({ source: "testadapter", submissionId: "p", mode: "practice", hintsUsed: 0, situation: "claim-1" }),
      attempt({ source: "testadapter", submissionId: "wrong", mode: "check", hintsUsed: 0, situation: "claim-2", wasCorrect: false, at: later(1) }),
      attempt({ source: "testadapter", submissionId: "new", mode: "check", hintsUsed: 0, situation: "claim-3", at: later(2) }),
    ]);
    expect(a?.states.applied).toMatchObject({ status: "observed", basis: ["new"] });
    expect(a?.states.independent.basis).toEqual(["new"]);
  });

  it(`revisited (PROPOSAL ${REVISIT_MIN_HOURS} h): only an independent correct answer at least that long after the first one`, () => {
    const base = attempt({ source: "testadapter", submissionId: "first", mode: "check", hintsUsed: 0 });
    const tooSoon = assessObjectives([base, attempt({ source: "testadapter", submissionId: "soon", mode: "review", hintsUsed: 0, at: later(REVISIT_MIN_HOURS - 1) })])[0];
    expect(tooSoon?.states.revisited.status).toBe("not_observed");
    const ok = assessObjectives([base, attempt({ source: "testadapter", submissionId: "late", mode: "review", hintsUsed: 0, at: later(REVISIT_MIN_HOURS) })])[0];
    expect(ok?.states.revisited).toMatchObject({ status: "observed", basis: ["late"] });
    expect(ok?.states.revisited.why[0]).toMatch(/^FORSLAG/);
    expect(ok?.documentedProgression).toBe(false);
  });

  it("K4 eligibility needs EVERY condition; each missing one is its own reason", () => {
    const full = attempt({ mode: "check", hintsUsed: 0, evidenceValid: true });
    expect(evidenceEligibility(full, true)).toEqual({ ref: "s-1", eligible: true, reasons: [] });
    expect(evidenceEligibility(full, false).reasons).toEqual(["ingen registreret introduktion til målet (LPD §5.3, ikke bygget)"]);
    expect(evidenceEligibility({ ...full, hintsUsed: 1 }, true).reasons).toEqual(["løst med hjælp (K4)"]);
    expect(evidenceEligibility({ ...full, mode: "practice" }, true).reasons).toEqual(["læringstrinnet practice er øvelse, ikke vurdering (K4)"]);
    expect(evidenceEligibility({ ...full, evidenceValid: null }, true).reasons).toEqual(["opgavens evidensgyldighed er ikke fastslået (K5)"]);
    expect(evidenceEligibility({ ...full, grading: "teacher", wasCorrect: null }, true).reasons).toHaveLength(2);
    expect(evidenceEligibility({ ...full, source: "testadapter" }, true).eligible).toBe(false);
  });

  it("objectives are never mixed: each objective is assessed only on its own observations", () => {
    const out = assessObjectives([
      attempt({ objective: "cold_war", submissionId: "cw" }),
      attempt({ objective: "world_war_2", submissionId: "ww", wasCorrect: false }),
    ]);
    expect(out.map((a) => a.objective)).toEqual(["cold_war", "world_war_2"]);
    expect(out[0]?.states.practised.basis).toEqual(["cw"]);
    expect(out[1]?.states.practised.basis).toEqual(["ww"]);
  });
});

describe("evidence chain — sources", () => {
  it("a question_attempts row (H5) becomes a server observation WITHOUT invented mode or hints", () => {
    const o = observationFromAttemptRow({
      question_instance_id: "qi", submission_id: "sub", attempt_no: 1, grading: "auto", was_correct: true, is_repeat: true,
      answered_at: T0, learning_objective: "world_war_2",
    });
    expect(o).toMatchObject({ source: "server", objective: "world_war_2", isRepeat: true, mode: null, hintsUsed: null, evidenceValid: null });
  });

  it("the test adapter reports what it observed, labelled testadapter, with its own mode and hints", async () => {
    const svc = new FakeTaskService(ITEMS);
    let now = Date.parse(T0);
    svc.clock = () => now;
    const t = await svc.fetchTask({ objectiveId: "hist.besaettelsen.h4", purpose: "check", surface: "world", kinds: ["choice"], contextKey: "arkivskab" });
    now += 60_000;
    await svc.submit({ instanceId: t.instanceId, roundNo: 1, submissionId: "sub-1", action: { kind: "choice", payload: { optionId: "opt_a" } } });
    const obs = svc.observations();
    expect(obs).toEqual([expect.objectContaining({ source: "testadapter", mode: "check", hintsUsed: 0, wasCorrect: true, submissionId: "sub-1", at: new Date(Date.parse(T0) + 60_000).toISOString() })]);
    const [a] = assessObjectives(obs);
    expect(a?.states.independent.status).toBe("observed");
    // Even so: not evidence (not the server, K5 not established, no registered intro) and not progression.
    expect(a?.evidence[0]?.eligible).toBe(false);
    expect(a?.documentedProgression).toBe(false);
  });
});
