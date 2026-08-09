// Section 173: the HTTP contract of request-password-help.
//
// Extracted from index.ts so the response contract can be TESTED rather than asserted by
// reading the source. A previous version "documented" it with a regex over index.ts, which
// proves nothing about what the handler actually returns.
//
// Pure by construction: no Supabase client, no fetch, no env, no serve(). index.ts supplies the
// real collaborators; a unit test supplies fakes and inspects real Response objects.
//
// THE CONTRACT
//   - every syntactically valid address gets byte-identical body, status and headers
//   - nothing account-dependent happens before the response is produced, so the duration cannot
//     distinguish a real account from an unknown one either
//   - the pipeline result never reaches the response; it is not even awaited when the runtime
//     can keep background work alive

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// The ONLY body this endpoint returns for a syntactically valid address.
export const GENERIC_BODY = {
  ok: true,
  message: "Hvis kontoen findes, har din lærer fået besked.",
};

export interface HandlerDeps {
  // Never rejects: the pipeline settles every outcome internally.
  process(email: string): Promise<void>;

  // Returns true when the promise was handed to the runtime as a background task. When it
  // returns false the caller awaits instead — correctness over uniformity, never an unattended
  // promise the isolate may kill.
  scheduleBackground(work: Promise<void>): boolean;

  captureMessage(message: string, level?: string, extra?: Record<string, unknown>): void;
}

export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export function isPlausibleEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 320) return false;
  // Deliberately permissive: an input sanity check, not an address validator. The authority on
  // whether an address exists is auth.users, and that answer is never revealed.
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed);
}

export function createHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: CORS_HEADERS });
    }

    if (req.method !== "POST") {
      return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
    }

    const body = await req.json().catch(() => null);
    const rawEmail =
      body && typeof body === "object" ? (body as Record<string, unknown>).email : undefined;

    // A malformed request is the one case that is NOT indistinguishable — it says nothing about
    // any account, only that the caller sent something that is not an address at all.
    if (!isPlausibleEmail(rawEmail)) {
      return jsonResponse({ ok: false, error: "email required" }, 400);
    }

    const work = deps.process(rawEmail.trim());

    if (deps.scheduleBackground(work)) {
      return jsonResponse(GENERIC_BODY, 200);
    }

    // Degraded path: the runtime cannot keep background work alive, so the work is awaited.
    // Recorded rather than silent, because it weakens the timing guarantee.
    deps.captureMessage("EdgeRuntime.waitUntil unavailable — help request processed inline", "warning");
    await work;
    return jsonResponse(GENERIC_BODY, 200);
  };
}
