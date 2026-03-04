export interface RawAIQuestion {
  prompt: string;
  correct_answer: string;
  distractors: string[];
}

export function mockGenerateQuestions(
  batchSize: number
): RawAIQuestion[] {
  const results: RawAIQuestion[] = [];

  for (let i = 0; i < batchSize; i++) {
    results.push({
      prompt: "When did WW2 begin?",
      correct_answer: "1939",
      distractors: ["1938", "1940", "1941"]
    });
  }

  return results;
}