import OpenAI from "https://esm.sh/openai@4.56.0";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

if (!OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY");
}

const client = new OpenAI({
  apiKey: OPENAI_API_KEY
});

type CognitiveLevel = "recall" | "explain" | "apply" | "analyze";

function buildPrompt(
  learningObjective: string,
  cognitiveLevel: CognitiveLevel
): string {

  let rules = "";

  if (cognitiveLevel === "recall") {
    rules = `
The question MUST:
- Begin with "Hvilket år"
- Contain the phrase "Anden Verdenskrig"
- Contain at least 15 words
The answer MUST be a single year number.
`;
  }

  if (cognitiveLevel === "explain") {
    rules = `
The question MUST:
- Begin with "Forklar"
- Contain at least 20 words
- Refer explicitly to an event in Anden Verdenskrig
The answer MUST:
- Contain at least 25 words
- Contain one of: "fordi", "på grund af", "derfor"
- Not be only a year
`;
  }

  if (cognitiveLevel === "analyze") {
    rules = `
The question MUST:
- Begin with "Analyser"
- Contain at least 20 words
- Refer explicitly to a WW2 event and its broader significance
The answer MUST:
- Contain at least 30 words
- Contain one of: "konsekvens", "betydning", "førte til", "resulterede i"
- Not be only a year
`;
  }

  return `
Generate a Danish WW2 question and answer.

Learning objective: ${learningObjective}

MANDATORY RULES:
${rules}

Return STRICT JSON in this exact format:

{
  "prompt": "...",
  "answer": "..."
}

No markdown.
No explanations.
No extra text.
Only JSON.
`;
}

export async function aiGenerate(
  learningObjective: string,
  _difficulty: number,
  cognitiveLevel: CognitiveLevel
): Promise<{ prompt: string; answer: string } | { error: string; raw?: any }> {

  try {

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You output only valid JSON."
        },
        {
          role: "user",
          content: buildPrompt(learningObjective, cognitiveLevel)
        }
      ]
    });

    const text = response.choices[0]?.message?.content;

    if (!text) {
      return { error: "empty_response" };
    }

    try {
      return JSON.parse(text);
    } catch {
      return { error: "invalid_json", raw: text };
    }

  } catch (err) {
    return { error: "api_error", raw: String(err) };
  }
}
