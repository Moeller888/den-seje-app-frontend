import { loadConfig } from "../config.js";
import { buildGenerationRequest } from "./generationRequest.js";
import { mockGenerateQuestions } from "./mockAI.js";
import { normalizeToContract } from "./normalize.js";
import {
  validateQuestion,
  contentHash
} from "@your-org/question-contract";

export async function runGeneratePipeline() {
  const config = loadConfig();
  const request = buildGenerationRequest(config);

  console.log("Running generate pipeline...");
  console.log("Request:", request);

  const rawQuestions = mockGenerateQuestions(request.batch_size);

  const seenHashes = new Set<string>();
  let uniqueCount = 0;

  for (let i = 0; i < rawQuestions.length; i++) {
    const raw = rawQuestions[i];

    const contract = normalizeToContract(raw, {
      domain: request.domain,
      logicalId: `${request.domain}_auto_${Date.now()}_${i}`,
      difficulty: request.difficulty,
      learning_objective: request.learning_objective
    });

    const validation = validateQuestion(contract);

    if (!validation.success) {
      console.log("Validation failed:", validation.issues);
      continue;
    }

    const hash = await contentHash(contract);

    if (seenHashes.has(hash)) {
      console.log("Duplicate detected in batch. Skipping.");
      continue;
    }

    seenHashes.add(hash);
    uniqueCount++;

    console.log("Generated unique question:");
    console.log("Hash:", hash);
  }

  console.log("Unique questions generated:", uniqueCount);
}