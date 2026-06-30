// ── AI abstraction layer — facade (157K) ─────────────────────────────────────
// The SINGLE entry point all feature code uses for AI. It hides providers entirely:
// callers get an advisory, structured AdvisoryResult and never touch a provider or
// model SDK. Default-off, fail-soft, advisory-only — it NEVER writes data, never
// awards anything, never throws. Binding rules: docs/AI_GUIDELINES.md.
//
// Responsibilities (AI_GUIDELINES.md §6): provider/model selection, prompt/version
// management, timeout, structured-output validation, input minimisation, fail-soft.

import type { AdvisoryResult, GradeRequest, GradeSuggestion, DraftFeedbackRequest, DraftFeedbackResult } from "./types.ts";
import { assertAiProvider, type AIProvider } from "./provider.ts";
import { createOllamaProvider } from "./provider-ollama.ts";
import { buildGradePrompt, buildDraftFeedbackPrompt } from "./prompts.ts";
import { minimiseGradeInput, minimiseFeedbackInput } from "./redact.ts";

const DEFAULT_TIMEOUT_MS = 12000;

function env(key: string): string | undefined {
  try {
    const v = Deno.env.get(key);
    return v && v.length > 0 ? v : undefined;
  } catch (_e) {
    return undefined;
  }
}

/** Master switch: AI grading runs only when explicitly enabled. Default off. */
function flagEnabled(): boolean {
  return env("ENABLE_AI_GRADING") === "true";
}

function selectProvider(): AIProvider | null {
  try {
    const which = (env("AI_PROVIDER") || "ollama").toLowerCase();
    switch (which) {
      case "ollama":
        return assertAiProvider(createOllamaProvider());
      default:
        return null; // unknown provider name → none (fail-soft)
    }
  } catch (_e) {
    return null;
  }
}

function timeoutMs(): number {
  const v = Number(env("AI_TIMEOUT_MS"));
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_TIMEOUT_MS;
}

async function withTimeout(p: Promise<string>, ms: number): Promise<string> {
  const ctrl = new AbortController();
  let timer: number | undefined;
  const timeout = new Promise<string>((_resolve, reject) => {
    timer = setTimeout(() => { ctrl.abort(); reject(new Error("ai: timeout")); }, ms) as unknown as number;
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function unavailable<T>(reason: string, provider?: AIProvider | null, promptVersion?: string | null, inputChars?: number | null): AdvisoryResult<T> {
  return {
    available: false,
    data: null,
    providerId: provider ? provider.id : null,
    model: provider ? provider.model : null,
    promptVersion: promptVersion ?? null,
    reason,
    inputChars: typeof inputChars === "number" ? inputChars : null,
  };
}

// ── Structured-output validation (defensive — never trust raw model text) ─────

function extractJson(raw: string): unknown {
  if (typeof raw !== "string") return null;
  try { return JSON.parse(raw); } catch (_e) { /* try to find an object below */ }
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end > start) return JSON.parse(raw.slice(start, end + 1));
  } catch (_e) { /* give up */ }
  return null;
}

function parseGradeSuggestion(raw: string): GradeSuggestion | null {
  const obj = extractJson(raw);
  if (!obj || typeof obj !== "object") return null;
  // deno-lint-ignore no-explicit-any
  const o = obj as any;
  let score: number | null = null;
  if (typeof o.score === "number" && Number.isFinite(o.score)) {
    score = Math.max(1, Math.min(4, Math.round(o.score)));
  }
  let confidence: number | null = null;
  if (typeof o.confidence === "number" && Number.isFinite(o.confidence)) {
    confidence = Math.max(0, Math.min(1, o.confidence));
  }
  const suggestion: GradeSuggestion = {
    score,
    label: typeof o.label === "string" ? o.label.slice(0, 120) : null,
    rationale: typeof o.rationale === "string" ? o.rationale.slice(0, 1000) : null,
    confidence,
  };
  // Require at least one meaningful field, else treat as invalid output.
  if (suggestion.score === null && !suggestion.label && !suggestion.rationale) return null;
  return suggestion;
}

// ── Public facade ─────────────────────────────────────────────────────────────

export interface AiService {
  isAvailable(): boolean;
  grade(req: GradeRequest): Promise<AdvisoryResult<GradeSuggestion>>;
  draftFeedback(req: DraftFeedbackRequest): Promise<AdvisoryResult<DraftFeedbackResult>>;
}

export function createAiService(): AiService {
  let _provider: AIProvider | null | undefined;
  function provider(): AIProvider | null {
    if (_provider === undefined) _provider = selectProvider();
    return _provider;
  }

  function ready(): { ok: boolean; provider: AIProvider | null; reason: string } {
    if (!flagEnabled()) return { ok: false, provider: null, reason: "disabled" };
    const p = provider();
    if (!p) return { ok: false, provider: null, reason: "no_provider" };
    if (!p.isConfigured()) return { ok: false, provider: p, reason: "not_configured" };
    return { ok: true, provider: p, reason: "ok" };
  }

  return {
    isAvailable(): boolean {
      try { return ready().ok; } catch (_e) { return false; }
    },

    async grade(req: GradeRequest): Promise<AdvisoryResult<GradeSuggestion>> {
      try {
        const r = ready();
        if (!r.ok || !r.provider) return unavailable("disabled" === r.reason ? "disabled" : r.reason, r.provider);
        const input = minimiseGradeInput(req);
        if (!input.answer) return unavailable("empty_answer", r.provider);
        const prompt = buildGradePrompt(input);
        const raw = await withTimeout(r.provider.complete(prompt.text, { temperature: 0 }), timeoutMs());
        const suggestion = parseGradeSuggestion(raw);
        if (!suggestion) return unavailable("invalid_output", r.provider, prompt.version, input.answer.length);
        return {
          available: true,
          data: suggestion,
          providerId: r.provider.id,
          model: r.provider.model,
          promptVersion: prompt.version,
          reason: null,
          inputChars: input.answer.length,
        };
      } catch (_e) {
        return unavailable("error");
      }
    },

    async draftFeedback(req: DraftFeedbackRequest): Promise<AdvisoryResult<DraftFeedbackResult>> {
      try {
        const r = ready();
        if (!r.ok || !r.provider) return unavailable(r.reason, r.provider);
        const input = minimiseFeedbackInput(req);
        if (!input.answer) return unavailable("empty_answer", r.provider);
        const prompt = buildDraftFeedbackPrompt(input);
        const raw = await withTimeout(r.provider.complete(prompt.text, { temperature: 0 }), timeoutMs());
        const feedback = typeof raw === "string" && raw.trim().length > 0 ? raw.trim().slice(0, 2000) : null;
        if (!feedback) return unavailable("invalid_output", r.provider, prompt.version, input.answer.length);
        return {
          available: true,
          data: { feedback },
          providerId: r.provider.id,
          model: r.provider.model,
          promptVersion: prompt.version,
          reason: null,
          inputChars: input.answer.length,
        };
      } catch (_e) {
        return unavailable("error");
      }
    },
  };
}
