// ── Ollama AI provider (157K) ────────────────────────────────────────────────
// The FIRST AIProvider implementation. Conforms to the contract in provider.ts.
// Inert unless OLLAMA_BASE_URL is configured (env) → isConfigured() is false and the
// facade never calls it. The operator MUST point OLLAMA_BASE_URL at a self-hosted /
// zero-retention endpoint per AI_GUIDELINES.md §3 (hence isLocalOnly: true).
//
// NOTE (157J gate): a reachable endpoint is a separate decision; until OLLAMA_BASE_URL
// is set this provider reports unavailable and nothing is sent anywhere.

import type { AIProvider, AIProviderCompleteOpts } from "./provider.ts";

const DEFAULT_MODEL = "llama3.1";

function env(key: string): string | undefined {
  try {
    const v = Deno.env.get(key);
    return v && v.length > 0 ? v : undefined;
  } catch (_e) {
    return undefined;
  }
}

export function createOllamaProvider(): AIProvider {
  const baseUrl = env("OLLAMA_BASE_URL");
  const model = env("OLLAMA_MODEL") || DEFAULT_MODEL;

  return {
    id: "ollama",
    model,
    isLocalOnly: true, // CONTRACT: operator must use a self-hosted / zero-retention endpoint

    isConfigured(): boolean {
      return typeof baseUrl === "string" && baseUrl.length > 0;
    },

    async complete(prompt: string, opts?: AIProviderCompleteOpts): Promise<string> {
      if (!baseUrl) throw new Error("ollama: not configured");
      const url = baseUrl.replace(/\/+$/, "") + "/api/generate";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: { temperature: typeof opts?.temperature === "number" ? opts.temperature : 0 },
        }),
        signal: opts?.signal,
      });
      if (!res.ok) throw new Error("ollama: http " + res.status);
      const data = await res.json().catch(() => null);
      // deno-lint-ignore no-explicit-any
      const text = data && typeof (data as any).response === "string" ? (data as any).response : "";
      return text;
    },
  };
}
