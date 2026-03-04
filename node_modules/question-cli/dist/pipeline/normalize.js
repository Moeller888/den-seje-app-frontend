export function normalizeToContract(raw, meta) {
    const options = [
        { id: "A", text: raw.distractors[0] },
        { id: "B", text: raw.correct_answer },
        { id: "C", text: raw.distractors[1] },
        { id: "D", text: raw.distractors[2] }
    ];
    return {
        meta: {
            schema_version: 1,
            domain: meta.domain,
            logical_question_id: meta.logicalId,
            version: 1,
            status: "draft"
        },
        pedagogy: {
            learning_objective: meta.learning_objective,
            difficulty_declared: meta.difficulty,
            cognitive_level: "recall",
            tags: []
        },
        content: {
            type: "mc_single",
            prompt: raw.prompt,
            context: null,
            options
        },
        answer: {
            format: "mc",
            value: "B"
        },
        quality: {
            author: "ai",
            review_required: true
        }
    };
}
