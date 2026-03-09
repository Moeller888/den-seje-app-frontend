import { dryRunCompleteness } from "../batch/dryRunCompleteness.ts";
import type { QuestionMetaProjection } from "../policy/types.ts";

Deno.test("Policy runs without Supabase dependency", () => {
  const objectives = ["HIST-01_start_year"];

  const existing: QuestionMetaProjection[] = [
    {
      objective: "HIST-01_start_year",
      cognitive: "recall",
      status: "active",
    },
  ];

  const result = dryRunCompleteness(objectives, existing);

  if (result.incompleteObjectives.length !== 0) {
    throw new Error("Policy incorrectly depends on repository or Supabase.");
  }
});
