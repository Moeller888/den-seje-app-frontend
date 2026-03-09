import type { CognitiveLevel } from "../progressionPolicy.ts";

export interface ProducedObjectiveResult {
  objective: string;
  generatedLevels: CognitiveLevel[];
}

export interface ProductionBatchResult {
  batchId: string;
  produced: number;
  objectives: ProducedObjectiveResult[];
}
