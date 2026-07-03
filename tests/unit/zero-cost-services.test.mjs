// ── Zero-cost services: default-off + fail-soft unit tests (157S) ────────────
// Run with Node's BUILT-IN test runner (no new dependency): `npm run test:unit`.
// These assert only the default-off and fail-soft guarantees — they never enable
// any flag, never hit the network, and never touch external services or staging.
//
// The frontend modules are browser ESM that reference browser globals only at
// call-time (guarded). In Node those globals are absent → the modules behave
// default-off / fail-soft, which is exactly what we assert. A tiny in-memory
// localStorage stub is used where a real consent round-trip is exercised.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getConsent, hasConsent, isUndecided, setConsent, setOptionalConsent, getAllConsent, CONSENT_CATEGORIES,
} from "../../js/consent.js";
import { cdnUrl, isCloudinaryEnabled } from "../../js/cloudinary.js";
import { flagSnapshot } from "../../js/flags.js";
import { isAnalyticsActive, isAnalyticsConfigured, track } from "../../js/analytics.js";
import { isSentryConfigured, isMonitoringEnabled, captureError, initMonitoring } from "../../js/sentry.js";
import { createDocumentRecognizer, isOcrEnabled } from "../../js/ocr/index.js";
import { createOCRResult } from "../../js/ocr/ocr-result.js";
import { createReadAloud, isReadAloudEnabled } from "../../js/read-aloud/index.js";
import { clipPathFor, hashKey } from "../../js/read-aloud/manifest.js";
import { attachOptionReadAloudControl } from "../../js/read-aloud/adapters/quiz.js";

// ── localStorage stub ─────────────────────────────────────────────────────────
function installLocalStorage() {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => { m.clear(); },
  };
  return m;
}
function removeLocalStorage() { try { delete globalThis.localStorage; } catch (_e) { globalThis.localStorage = undefined; } }

// ── Consent (js/consent.js) ────────────────────────────────────────────────────
test("consent: default state is unknown / not granted", () => {
  installLocalStorage();
  assert.equal(getConsent("analytics"), "unknown");
  assert.equal(hasConsent("analytics"), false);
  assert.equal(isUndecided("analytics"), true);
});

test("consent: set/get round-trip persists", () => {
  installLocalStorage();
  setConsent("analytics", true);
  assert.equal(getConsent("analytics"), "granted");
  setConsent("analytics", false);
  assert.equal(getConsent("analytics"), "denied");
});

test("consent: setOptionalConsent covers every category", () => {
  installLocalStorage();
  setOptionalConsent(true);
  for (const c of CONSENT_CATEGORIES) assert.equal(getConsent(c), "granted");
});

test("consent: unknown category is ignored", () => {
  installLocalStorage();
  setConsent("bogus", true);
  assert.equal(getConsent("bogus"), "unknown");
});

test("consent: getAllConsent returns every category", () => {
  installLocalStorage();
  const all = getAllConsent();
  for (const c of CONSENT_CATEGORIES) assert.ok(Object.prototype.hasOwnProperty.call(all, c));
});

test("consent: migrates the legacy analytics_consent key", () => {
  const m = installLocalStorage();
  m.set("analytics_consent", "granted"); // legacy 157D/157E store
  assert.equal(getConsent("analytics"), "granted");
});

test("consent: fail-soft without localStorage (no throw, unknown)", () => {
  removeLocalStorage();
  assert.doesNotThrow(() => setConsent("analytics", true));
  assert.equal(getConsent("analytics"), "unknown");
});

// ── Cloudinary (js/cloudinary.js) ──────────────────────────────────────────────
test("cloudinary: disabled by default, passthrough", () => {
  assert.equal(isCloudinaryEnabled(), false);
  assert.equal(cdnUrl("/assets/avatar-r2/base/body.webp"), "/assets/avatar-r2/base/body.webp");
  assert.equal(cdnUrl("/assets/avatar/base/body.svg"), "/assets/avatar/base/body.svg");
});

test("cloudinary: fail-soft on bad input", () => {
  assert.equal(cdnUrl(null), null);
  assert.equal(cdnUrl(""), "");
  assert.doesNotThrow(() => cdnUrl(undefined));
});

// ── Flags registry (js/flags.js) ───────────────────────────────────────────────
test("flags: snapshot reports external services off; read-aloud + avatar_v2 on", () => {
  const s = flagSnapshot();
  assert.equal(s.sentry.active, false);
  assert.equal(s.ocr.active, false);
  assert.equal(s.cloudinary.active, false);
  assert.equal(s.analytics.active, false);
  assert.equal(s.read_aloud.active, true); // 157O activated (on-device, no consent)
  assert.equal(s.avatar_v2.default_on, true);
});

test("flags: snapshot never throws", () => {
  assert.doesNotThrow(() => flagSnapshot());
});

// ── Analytics (js/analytics.js) ────────────────────────────────────────────────
test("analytics: inactive by default; track is a safe no-op", () => {
  assert.equal(isAnalyticsConfigured(), false);
  assert.equal(isAnalyticsActive(), false);
  assert.doesNotThrow(() => track("question_answered", { answer: "secret", status: "correct" }));
});

// ── Sentry (js/sentry.js) ──────────────────────────────────────────────────────
test("sentry: off by default; capture/init are safe no-ops", () => {
  assert.equal(isSentryConfigured(), false);
  assert.equal(isMonitoringEnabled(), false);
  assert.doesNotThrow(() => captureError("TEST", new Error("x"), { state: "IDLE" }));
  assert.doesNotThrow(() => initMonitoring({ tags: { avatar_v2: true } }));
});

// ── OCR (js/ocr) ───────────────────────────────────────────────────────────────
test("ocr: unavailable by default; recognize rejects softly", async () => {
  assert.equal(isOcrEnabled(), false);
  const rec = createDocumentRecognizer();
  assert.equal(rec.isAvailable(), false);
  await assert.rejects(() => rec.recognize("x"));
});

test("ocr: structured result factory fills defaults", () => {
  const empty = createOCRResult();
  assert.equal(empty.text, "");
  assert.deepEqual(empty.words, []);
  assert.equal(createOCRResult({ text: "hej" }).text, "hej");
});

// ── Read-aloud (js/read-aloud) ─────────────────────────────────────────────────
test("read-aloud: flag on (157O), but fail-soft where unsupported; speak is a safe no-op", async () => {
  assert.equal(isReadAloudEnabled(), true); // 157O activated
  const ra = createReadAloud();
  // No browser globals (Audio / speechSynthesis) in Node → no provider is supported,
  // so the service stays unavailable and speak() is a safe no-op even with the flag on.
  assert.equal(ra.isAvailable(), false);
  assert.equal(await ra.speak("Læs dette"), false);
});

test("read-aloud: manifest empty; hashKey stable", () => {
  assert.equal(clipPathFor("nope"), null);
  assert.equal(clipPathFor(null), null);
  const k = hashKey("Hvad er hovedstaden?");
  assert.ok(typeof k === "string" && k.startsWith("ra_"));
  assert.equal(k, hashKey("Hvad er hovedstaden?")); // deterministic
});

test("read-aloud: per-option control is fail-soft / no-op when unsupported", () => {
  // No browser globals (Audio / speechSynthesis) in Node → read-aloud is unavailable,
  // so the per-option control renders nothing and never throws (quiz unaffected).
  let appended = 0;
  const fakeRow = { appendChild: () => { appended++; } };
  assert.doesNotThrow(() => attachOptionReadAloudControl(fakeRow, "København"));
  assert.equal(appended, 0); // unavailable → no 🔊 button rendered
  // Guards: bad container / empty text never throw.
  assert.doesNotThrow(() => attachOptionReadAloudControl(null, "København"));
  assert.doesNotThrow(() => attachOptionReadAloudControl(fakeRow, ""));
  assert.doesNotThrow(() => attachOptionReadAloudControl(fakeRow, undefined));
  assert.equal(appended, 0);
});
