// TEMPORARY CONTAINMENT (2026-11-02). The deployed v9 of this function ran every route with the
// service-role key and authenticated no caller: anyone with the URL could submit, approve and promote
// avatar assets and resolve reviews. Until the permanent fix (caller authentication before any
// service-role client) is deployed, every request is refused here.
//
// This entry point imports nothing, creates no Supabase client, reads no environment variable and
// makes no network, database or Storage call; the other modules in this folder are not imported.
// OPTIONS answers the CORS preflight only.

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const DISABLED_BODY = JSON.stringify({ error: "temporarily disabled" });

export function handleDisabled(req: Request): Response {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }
  return new Response(DISABLED_BODY, {
    status: 503,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(handleDisabled);
