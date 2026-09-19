// Pure selection logic for the Edge Function key resolver. Offline: no network, no environment,
// no real key — every value here is a fabricated test string.
//   deno test supabase/functions/_shared/supabase-keys.test.ts
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { selectPublishableKey, selectSecretKey } from "./supabase-keys.ts";

const NEW = ["sb", "secret", "TESTONLY0000000000000"].join("_");
const LEGACY = ["eyJhbGciOiJIUzI1NiJ9", "eyJyb2xlIjoic2VydmljZV9yb2xlIn0", "sig"].join(".");
const bundle = (o: Record<string, string>) => JSON.stringify(o);

Deno.test("prefers the new secret key when the bundle has one", () => {
  assertEquals(selectSecretKey(bundle({ default: NEW }), LEGACY), { key: NEW, source: "secret-keys" });
});

Deno.test("uses the legacy key only when no bundle is set at all", () => {
  assertEquals(selectSecretKey(undefined, LEGACY), { key: LEGACY, source: "legacy-service-role" });
  assertEquals(selectSecretKey("", LEGACY)?.source, "legacy-service-role");
  assertEquals(selectSecretKey("   ", LEGACY)?.source, "legacy-service-role");
});

Deno.test("keeps working when the legacy key is gone", () => {
  assertEquals(selectSecretKey(bundle({ default: NEW }), undefined)?.source, "secret-keys");
});

Deno.test("a present but broken bundle fails loudly instead of using the retired key", () => {
  assertThrows(() => selectSecretKey("{not json", LEGACY), Error, "not valid JSON");
  assertThrows(() => selectSecretKey(bundle({}), LEGACY), Error, "no usable key");
  assertThrows(() => selectSecretKey(bundle({ default: "   " }), LEGACY), Error, "no usable key");
  assertThrows(() => selectSecretKey(bundle({ other: NEW }), LEGACY), Error, "no usable key");
});

Deno.test("named keys are selectable; an unknown name is a configuration error", () => {
  const b = bundle({ default: NEW, other: `${NEW}-2` });
  assertEquals(selectSecretKey(b, LEGACY, "other")?.key, `${NEW}-2`);
  assertThrows(() => selectSecretKey(b, LEGACY, "missing"), Error, "no usable key");
});

Deno.test("returns null when nothing is configured, so the caller can fail loudly", () => {
  assertEquals(selectSecretKey(undefined, undefined), null);
  assertEquals(selectSecretKey("", "  "), null);
});

// ── The public half. Same contract, same fail-closed rules, separately proven. ────────────────
const NEW_PUB = ["sb", "publishable", "TESTONLY0000000000000"].join("_");
const LEGACY_ANON = ["eyJhbGciOiJIUzI1NiJ9", "eyJyb2xlIjoiYW5vbiJ9", "sig"].join(".");

Deno.test("prefers the default publishable key when the bundle has one", () => {
  assertEquals(
    selectPublishableKey(bundle({ default: NEW_PUB }), LEGACY_ANON),
    { key: NEW_PUB, source: "publishable-keys" },
  );
});

Deno.test("the bundle wins over the legacy anon key", () => {
  const chosen = selectPublishableKey(bundle({ default: NEW_PUB }), LEGACY_ANON);
  assertEquals(chosen?.key, NEW_PUB);
  assertEquals(chosen?.key === LEGACY_ANON, false);
});

Deno.test("uses the legacy anon key only when no bundle is set at all", () => {
  assertEquals(selectPublishableKey(undefined, LEGACY_ANON), { key: LEGACY_ANON, source: "legacy-anon" });
  assertEquals(selectPublishableKey("", LEGACY_ANON)?.source, "legacy-anon");
  assertEquals(selectPublishableKey("   ", LEGACY_ANON)?.source, "legacy-anon");
});

Deno.test("keeps working once the legacy anon key is gone", () => {
  assertEquals(selectPublishableKey(bundle({ default: NEW_PUB }), undefined)?.source, "publishable-keys");
});

Deno.test("a present but broken publishable bundle never falls back", () => {
  assertThrows(() => selectPublishableKey("{not json", LEGACY_ANON), Error, "not valid JSON");
  assertThrows(() => selectPublishableKey(bundle({}), LEGACY_ANON), Error, "no usable key");
  assertThrows(() => selectPublishableKey(bundle({ default: "   " }), LEGACY_ANON), Error, "no usable key");
  assertThrows(() => selectPublishableKey(bundle({ other: NEW_PUB }), LEGACY_ANON), Error, "no usable key");
});

Deno.test("named publishable keys are selectable; an unknown name is a configuration error", () => {
  const b = bundle({ default: NEW_PUB, other: `${NEW_PUB}-2` });
  assertEquals(selectPublishableKey(b, LEGACY_ANON, "other")?.key, `${NEW_PUB}-2`);
  assertThrows(() => selectPublishableKey(b, LEGACY_ANON, "missing"), Error, "no usable key");
});

Deno.test("returns null when no public key is configured at all", () => {
  assertEquals(selectPublishableKey(undefined, undefined), null);
  assertEquals(selectPublishableKey("", "  "), null);
});

Deno.test("the two halves report distinct sources and never cross over", () => {
  assertEquals(selectSecretKey(bundle({ default: NEW }), LEGACY)?.source, "secret-keys");
  assertEquals(selectPublishableKey(bundle({ default: NEW_PUB }), LEGACY_ANON)?.source, "publishable-keys");
  assertEquals(selectSecretKey(undefined, LEGACY)?.source, "legacy-service-role");
  assertEquals(selectPublishableKey(undefined, LEGACY_ANON)?.source, "legacy-anon");
});

Deno.test("no error message from either half ever contains a key value", () => {
  const broken: Array<() => unknown> = [
    () => selectSecretKey("{bad", LEGACY),
    () => selectSecretKey(bundle({ other: NEW }), LEGACY),
    () => selectPublishableKey("{bad", LEGACY_ANON),
    () => selectPublishableKey(bundle({ other: NEW_PUB }), LEGACY_ANON),
  ];
  for (const run of broken) {
    try {
      run();
      throw new Error("expected a throw");
    } catch (e) {
      const message = (e as Error).message;
      for (const secret of [NEW, NEW_PUB, LEGACY, LEGACY_ANON]) {
        assertEquals(message.includes(secret), false, `a key value leaked into: ${message}`);
      }
    }
  }
});
