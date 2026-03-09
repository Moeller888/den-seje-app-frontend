import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { isObjectiveComplete } from "../policy/isObjectiveComplete.ts";
import type { QuestionMetaProjection } from "../policy/types.ts";

Deno.test("isObjectiveComplete returns true when exactly one active per required level exists", () => {
  const objective = "ww2_poland_invasion_impact";

  const existing: QuestionMetaProjection[] = [
    { objective, cognitive: "recall", status: "active" },
    { objective, cognitive: "explain", status: "active" },
    { objective, cognitive: "analyze", status: "active" },
  ];

  const result = isObjectiveComplete(objective, existing);

  assertEquals(result, true);
});

Deno.test("isObjectiveComplete returns false when one required level is missing", () => {
  const objective = "ww2_poland_invasion_impact";

  const existing: QuestionMetaProjection[] = [
    { objective, cognitive: "recall", status: "active" },
    // Missing explain or analyze depending on registry
  ];

  const result = isObjectiveComplete(objective, existing);

  assertEquals(result, false);
});

Deno.test("isObjectiveComplete returns false when one required level is missing", () => {
  const objective = "ww2_poland_invasion_impact";

  const existing: QuestionMetaProjection[] = [
    { objective, cognitive: "recall", status: "active" },
    // Missing explain or analyze depending on registry
  ];

  const result = isObjectiveComplete(objective, existing);

  assertEquals(result, false);
});


Deno.test("isObjectiveComplete returns false when more than one active question exists for a level", () => {
  const objective = "ww2_poland_invasion_impact";

  const existing: QuestionMetaProjection[] = [
    { objective, cognitive: "recall", status: "active" },
    { objective, cognitive: "recall", status: "active" }, // duplicate
    { objective, cognitive: "explain", status: "active" },
  ];

  const result = isObjectiveComplete(objective, existing);

  assertEquals(result, false);
});
