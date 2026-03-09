export function normalizePrompt(prompt: string): string {

  return prompt
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")     
    .replace(/\b(hvilket|hvornår|i|år|fandt|sted)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

}
