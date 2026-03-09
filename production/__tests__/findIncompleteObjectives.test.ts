import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { findIncompleteObjectives } from "../policy/findIncompleteObjectives.ts";
import { SUFFIX_REGISTRY } from "../objectiveTaxonomy.ts";
import type { QuestionMetaProjection } from "../policy/types.ts";
import type { QuestionStatus } from "../../packages/question-contract/src/schema/enums.ts";

Deno.test("findIncompleteObjectives returns only incomplete objectives", () => {
  const completeObjective = "ww2_poland_invasion_impact";
  const incompleteObjective = "ww2_france_fall_role";

  const objectives = [completeObjective, incompleteObjective];

  const suffix = "_impact";
  const requiredLevels = SUFFIX_REGISTRY[suffix].cognitive;

  const existing: QuestionMetaProjection[] = [
    ...requiredLevels.map((level) => ({
      objective: completeObjective,
      cognitive: level,
      status: "active" as QuestionStatus,
    })),
    {
      objective: incompleteObjective,
      cognitive: "recall",
      status: "active" as QuestionStatus,
    },
  ];

  const result = findIncompleteObjectives(objectives, existing);

  assertEquals(result, [incompleteObjective]);
});
