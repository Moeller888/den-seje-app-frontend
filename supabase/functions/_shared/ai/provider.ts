// ── AI provider contract (157K) ──────────────────────────────────────────────
// The strict, swappable interface every model backend implements. The facade
// (index.ts) is the ONLY caller; feature code never touches a provider. A provider
// only knows how to turn a prompt string into a completion string — the facade owns
// prompts, validation, redaction, timeout and fail-soft signalling.
//
// `isLocalOnly` is a documented privacy contract: providers should point only at a
// self-hosted / zero-retention endpoint (AI_GUIDELINES.md §3). Swapping providers
// must never change feature code.

export interface AIProviderCompleteOpts {
  temperature?: number;
  signal?: AbortSignal;
}

export interface AIProvider {
  readonly id: string;
  readonly model: string;
  /** Privacy posture — should be true (self-hosted / zero-retention). */
  readonly isLocalOnly: boolean;
  /** Whether the provider has the config it needs (endpoint/model) to run. */
  isConfigured(): boolean;
  /** Turn a prompt into a raw completion string. May throw; the facade catches. */
  complete(prompt: string, opts?: AIProviderCompleteOpts): Promise<string>;
}

/**
 * Validate an object satisfies the AIProvider contract. Throws on violation.
 * @param {unknown} p
 * @returns {AIProvider}
 */
export function assertAiProvider(p: unknown): AIProvider {
  if (!p || typeof p !== "object") {
    throw new Error("AI provider: missing or not an object");
  }
  // deno-lint-ignore no-explicit-any
  const prov = p as any;
  if (typeof prov.id !== "string" || prov.id.length === 0) {
    throw new Error("AI provider: invalid id");
  }
  if (typeof prov.model !== "string") {
    throw new Error("AI provider '" + prov.id + "': invalid model");
  }
  for (const m of ["isConfigured", "complete"]) {
    if (typeof prov[m] !== "function") {
      throw new Error("AI provider '" + prov.id + "': missing method " + m);
    }
  }
  return prov as AIProvider;
}
