import { qualityGate } from "../qualityGate.ts";
import { normalizeAIContract } from "../../tools/production/normalizeAIContract.ts";
import { isSemanticallyDuplicate } from "../dedupe/semanticDuplicateCheck.ts";
import type { QuestionRepository } from "../repository/questionRepository.ts";

export async function produceDraftBatch(
  objectives: string[],
  repo: QuestionRepository,
  generateQuestion: (input: { objective: string; cognitive: string }) => Promise<any>
) {

  const existingPrompts: string[] = [];

  let produced = 0;
  let duplicates = 0;

  const batchId = crypto.randomUUID();

  for (const objective of objectives) {

    const cognitive = "recall";

    const ai = await generateQuestion({
      objective,
      cognitive
    });

    console.log("AI RAW:", ai);

    if (!ai || ai.error || !ai.prompt || !ai.answer) {
      console.error("AI generation failed:", ai);
      continue;
    }

    let contract;

    try {
      contract = normalizeAIContract(
        ai, // aiOutput
        objective,                                // learningObjective
        0,                                        // index
        1,                                        // difficulty
        cognitive as any,                         // cognitiveLevel
        "number_input",                           // contentType
        "year"                                    // answerFormat
      );
    } catch (err) {
      console.error("Normalization failed:", err);
      continue;
    }

    if (isSemanticallyDuplicate(contract.content.prompt, existingPrompts)) {
      duplicates++;
      continue;
    }

    try {
      qualityGate(contract);
    } catch (err) {
      console.error("Quality gate failed:", err);
      continue;
    }

    const result = await repo.insertValidatedQuestion(contract, batchId);

    if (result.status === "duplicate") {
      duplicates++;
      continue;
    }

    produced++;
    existingPrompts.push(contract.content.prompt);
  }

  return {
    batchId,
    produced,
    duplicates,
    objectives
  };
}
