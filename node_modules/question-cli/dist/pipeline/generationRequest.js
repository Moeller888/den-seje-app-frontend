export function buildGenerationRequest(config) {
    return {
        domain: config.domain,
        learning_objective: config.learning_objectives[0],
        difficulty: config.generation.default_difficulty,
        batch_size: config.generation.batch_size,
        cognitive_level: "recall"
    };
}
