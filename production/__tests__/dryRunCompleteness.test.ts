import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { dryRunCompleteness } from "../batch/dryRunCompleteness.ts";
import { SUFFIX_REGISTRY } from "../objectiveTaxonomy.ts";
import type { QuestionMetaProjection } from "../policy/types.ts";
import type { QuestionStatus } from "../../packages/question-contract/src/schema/enums.ts";

Deno.test("dryRunCompleteness reports total and incomplete objectives correctly", () => {
  const completeObjective = "ww2_poland_invasion_impact";
  const incompleteObjective = "ww2_france_fall_role";

  const objectives = [completeObjective, incompleteObjective];

  const requiredLevels = SUFFIX_REGISTRY["_impact"].cognitive;

  const existing: QuestionMetaProjection[] = [
    ...requiredLevels.map((level) => ({
      objective: completeObjective,
      cognitive: level,
      status: "active" as QuestionStatus,
    })),
    { objective: incompleteObjective, cognitive: "recall", status: "active" as QuestionStatus },
  ];

  const result = dryRunCompleteness(objectives, existing);

  assertEquals(result.totalObjectives, 2);
  assertEquals(result.incompleteObjectives, [incompleteObjective]);
});
