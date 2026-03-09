function normalize(text: string): string {

  const synonyms: Record<string, string> = {
    "besættelse": "besat",
    "besatte": "besat",
    "besættelsen": "besat",
    "begyndte": "start",
    "startede": "start",
    "hvornår": "",
    "hvilket": "",
    "år": "",
    "i": "",
    "det": "",
    "den": "",
    "under": ""
  };

  let normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .map(word => synonyms[word] ?? word)
    .filter(Boolean)
    .join(" ");

  return normalized;
}

function tokenSet(text: string): Set<string> {
  return new Set(normalize(text).split(/\s+/));
}

export function isSemanticallyDuplicate(
  candidate: string,
  existingPrompts: string[]
): boolean {

  const candidateTokens = tokenSet(candidate);

  for (const prompt of existingPrompts) {

    const tokens = tokenSet(prompt);

    let overlap = 0;

    for (const token of candidateTokens) {
      if (tokens.has(token)) {
        overlap++;
      }
    }

    const similarity =
      overlap / Math.max(candidateTokens.size, tokens.size);

    if (similarity > 0.7) {
      return true;
    }
  }

  return false;
}
