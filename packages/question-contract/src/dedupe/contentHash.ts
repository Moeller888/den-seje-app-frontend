import type { QuestionContract } from "../schema/questionContract.ts";

function normalizeString(input: string): string {
  return input.trim().toLowerCase();
}

function deepSort(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepSort);
  }

  if (value && typeof value === "object") {
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = deepSort((value as Record<string, unknown>)[key]);
    }
    return result;
  }

  return value;
}

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  const hashBuffer = await globalThis.crypto.subtle.digest(
    "SHA-256",
    data
  );

  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function contentHash(
  question: QuestionContract
): Promise<string> {

  const base = {
    objective: question.pedagogy.learning_objective,
    cognitive: question.pedagogy.cognitive_level,
    content: question.content,
    answer: question.answer
  };

  const normalized = structuredClone(base);

  if ("prompt" in normalized.content) {
    normalized.content.prompt = normalizeString(
      normalized.content.prompt
    );
  }

  if (normalized.content.type === "mc_single") {
    normalized.content.options = normalized.content.options
      .map((opt) => ({
        ...opt,
        text: normalizeString(opt.text)
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  const stableObject = deepSort(normalized);
  const serialized = JSON.stringify(stableObject);

  return sha256(serialized);
}
