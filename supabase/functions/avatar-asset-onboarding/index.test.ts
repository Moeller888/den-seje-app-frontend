// Run with NO permissions except reading this folder:
//   deno test --allow-read=supabase/functions/avatar-asset-onboarding supabase/functions/avatar-asset-onboarding/index.test.ts
// Any environment, network or file-write access by the handler would then throw PermissionDenied.
// Local assertions: the test downloads nothing.
function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEquals<T>(actual: T, expected: T, msg = ""): void {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e}, got ${a}`.trim());
}
// index.ts calls Deno.serve at load time; capture the handler instead of starting a server.
const served: unknown[] = [];
const realServe = Deno.serve;
(Deno as unknown as { serve: unknown }).serve = (h: unknown) => {
  served.push(h);
  return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {}, addr: { transport: "tcp", hostname: "127.0.0.1", port: 0 } };
};
const { DISABLED_BODY, handleDisabled } = await import("./index.ts");
(Deno as unknown as { serve: unknown }).serve = realServe;

const DIR = new URL(".", import.meta.url);
const BASE = "https://example.invalid/functions/v1/avatar-asset-onboarding";
const PATHS = ["", "/", "/approve", "/promote", "/review/resolve", "/status?asset_id=x", "/unknown/route"];
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];

function withFetchSpy<T>(fn: () => Promise<T>): Promise<{ result: T; calls: number }> {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    calls++;
    throw new Error("network call attempted");
  }) as typeof fetch;
  return fn().then((result) => ({ result, calls })).finally(() => {
    globalThis.fetch = original;
  });
}

Deno.test("every non-OPTIONS request is refused with 503 and the fixed body, with no network call", async () => {
  const { calls } = await withFetchSpy(async () => {
    for (const method of METHODS) {
      for (const path of PATHS) {
        const hasBody = method === "POST" || method === "PUT" || method === "PATCH";
        const req = new Request(BASE + path, {
          method,
          headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
          body: hasBody ? JSON.stringify({ asset_id: "a", approved_by: "x", promoted_by: "y", storage_bucket: "b" }) : undefined,
        });
        const res = handleDisabled(req);
        assertEquals(res.status, 503, `${method} ${path}`);
        assertEquals(res.headers.get("Cache-Control"), "no-store");
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
        if (method !== "HEAD") {
          assertEquals(res.headers.get("Content-Type"), "application/json");
          assertEquals(await res.text(), DISABLED_BODY);
        }
      }
    }
  });
  assertEquals(calls, 0);
  assertEquals(DISABLED_BODY, '{"error":"temporarily disabled"}');
});

Deno.test("OPTIONS answers the CORS preflight only", async () => {
  for (const path of PATHS) {
    const res = handleDisabled(new Request(BASE + path, { method: "OPTIONS" }));
    assertEquals(res.status, 200);
    assertEquals(await res.text(), "ok");
    assertEquals(res.headers.get("Access-Control-Allow-Methods"), "GET, POST, OPTIONS");
  }
});

Deno.test("the handler reads no environment variable (no --allow-env is granted)", () => {
  const status = Deno.permissions.querySync({ name: "env" }).state;
  assert(status !== "granted", "run this test without --allow-env");
  handleDisabled(new Request(BASE + "/approve", { method: "POST", body: "{}" }));
});

Deno.test("the entry point serves exactly this handler, once", () => {
  assertEquals(served.length, 1);
  assert(served[0] === handleDisabled, "Deno.serve must receive handleDisabled");
});

Deno.test("the entry point has no imports, no client, no secret, no network or storage call", async () => {
  const src = await Deno.readTextFile(new URL("index.ts", DIR));
  const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  for (const forbidden of [/\bimport\b/, /Deno\.env/, /createClient/, /\bfetch\s*\(/, /\.storage\b/, /\.from\s*\(/, /\.rpc\s*\(/, /SERVICE_ROLE|SECRET_KEYS/]) {
    assert(!forbidden.test(code), `index.ts contains ${forbidden}`);
  }
});
