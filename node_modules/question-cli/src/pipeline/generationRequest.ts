export interface GenerationRequest {
  domain: string;
  learning_objective: string;
  difficulty: number;
  batch_size: number;
  cognitive_level: "recall" | "explain" | "apply" | "analyze";
}

export function buildGenerationRequest(config: {
  domain: string;
  learning_objectives: string[];
  generation: {
    default_difficulty: number;
    batch_size: number;
  };
}): GenerationRequest {
  return {
    domain: config.domain,
    learning_objective: config.learning_objectives[0],
    difficulty: config.generation.default_difficulty,
    batch_size: config.generation.batch_size,
    cognitive_level: "recall"
  };
}