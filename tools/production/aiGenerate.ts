import OpenAI from "https://esm.sh/openai@4.56.0";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

if (!OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY");
}

const client = new OpenAI({
  apiKey: OPENAI_API_KEY
});

type CognitiveLevel = "recall" | "explain" | "apply" | "analyze";

function extractJSON(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1) return null;

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function buildPrompt(objective: string, avoid: string[]) {

  const avoidBlock = avoid.length
    ? `
Avoid generating questions similar to these existing questions:

${avoid.map(q => "- " + q).join("\n")}
`
    : "";

  return `
Generate a Danish World War II question.

Learning objective: ${objective}`nObjective type is encoded in the suffix of the objective (e.g. _start_year, _end_year, _strategy, _consequence). Generate a question consistent with that semantic type.

${avoidBlock}

Rules:
- Question must be natural Danish used in teaching
- Question must ask for a year
- Answer must be a 4 digit year
- Do NOT repeat or closely resemble the avoid list

Also generate a short teacher explanation and grading criteria.

Return JSON only:

{
 "prompt": "question in Danish",
 "answer": "1943",
 "facit": "short teacher explanation",
 "criteria": [
   "important point 1",
   "important point 2",
   "important point 3"
 ]
}
`;
}

export async function aiGenerate(
  learningObjective: string,
  _difficulty: number,
  cognitiveLevel: CognitiveLevel,
  avoid: string[] = []
) {

  try {

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "Return valid JSON only." },
        { role: "user", content: buildPrompt(learningObjective, avoid) }
      ]
    });

    const text = response.choices[0]?.message?.content;

    if (!text) {
      return { error: "empty_response" };
    }

    const parsed = extractJSON(text);

    if (!parsed) {
      return { error: "invalid_json", raw: text };
    }

    if (!parsed.prompt || !parsed.answer) {
      return { error: "missing_fields", raw: parsed };
    }

    return parsed;

  } catch (err) {
    return { error: "api_error", raw: String(err) };
  }
}
