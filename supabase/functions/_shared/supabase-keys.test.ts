// Pure selection logic for the Edge Function key resolver. Offline: no network, no environment,
// no real key — every value here is a fabricated test string.
//   deno test supabase/functions/_shared/supabase-keys.test.ts
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { selectSecretKey } from "./supabase-keys.ts";

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
