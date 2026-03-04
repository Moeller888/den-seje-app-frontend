export function mockGenerateQuestions(batchSize) {
    const results = [];
    for (let i = 0; i < batchSize; i++) {
        results.push({
            prompt: "When did WW2 begin?",
            correct_answer: "1939",
            distractors: ["1938", "1940", "1941"]
        });
    }
    return results;
}
